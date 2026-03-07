const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, Notification, ipcMain, nativeTheme, shell } = require('electron'); // 必须全部引入
const path = require('path');
const fs = require('fs');
const { processGcode } = require('./mkp_engine');
const { exec } = require('child_process');
const isCliMode = process.argv.includes('--Gcode');

// ==========================================
// 日志系统 (写入本地文件)
// ==========================================
ipcMain.on('write-log', (event, message) => {
  try {
    // 日志存放在: AppData/Roaming/你的应用名/Logs
    const logDir = path.join(app.getPath('userData'), 'Logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 按天生成日志文件，例如：mkp_2026-03-05.log
    const date = new Date();
    const fileName = `mkp_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`;
    const logFile = path.join(logDir, fileName);

    // 格式化时间，例如：[18:30:45]
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    const logLine = `[${timeStr}] ${message}\n`;

    // 追加写入文件
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    console.error("写入日志文件失败:", error);
  }
});

// 版本号对比工具
function compareVersions(v1, v2) {
  const a = (v1 || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const b = (v2 || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;  
    if (num1 < num2) return -1; 
  }
  return 0; 
}

// 初始化：释放默认预设 JSON 到用户电脑
ipcMain.handle('init-default-presets', async () => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const defaultPresetsPath = path.join(__dirname, '../default_presets');
    if (!fs.existsSync(defaultPresetsPath)) return { success: true, msg: "无内置预设" };

    const files = fs.readdirSync(defaultPresetsPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sourceFile = path.join(defaultPresetsPath, file);
        const targetFile = path.join(userDataPath, file);

        if (!fs.existsSync(targetFile)) {
          fs.copyFileSync(sourceFile, targetFile);
        } else {
          try {
            const sourceData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
            const targetData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
            if (compareVersions(sourceData.version, targetData.version) > 0) {
              fs.copyFileSync(sourceFile, targetFile);
            }
          } catch (e) {
            console.error("解析JSON报错", e);
          }
        }
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

if (isCliMode) {
  // ==========================================
  // 🌚 隐性人格：CLI 后台处理模式
  // ==========================================
  if (app.dock) app.dock.hide();

  app.whenReady().then(() => {
    try {
      const gcodePath = process.argv[process.argv.indexOf('--Gcode') + 1];
      const jsonPath = process.argv[process.argv.indexOf('--Json') + 1];
      
      if (!gcodePath || !jsonPath) throw new Error('参数缺失');

      const startTime = Date.now();
      const processedGcode = processGcode(gcodePath, jsonPath);
      
      const outputPath = gcodePath.replace('.gcode', '_processed.gcode');
      fs.writeFileSync(outputPath, processedGcode);
      
      const costTime = ((Date.now() - startTime) / 1000).toFixed(2);

      if (Notification.isSupported()) {
        new Notification({
          title: 'MKP Support',
          body: `✅ 涂胶路径已注入！(耗时: ${costTime}s)\n文件: ${path.basename(outputPath)}`,
          silent: true
        }).show();
      }
      
      setTimeout(() => app.quit(), 3000);
    } catch (error) {
      if (Notification.isSupported()) {
        new Notification({ title: 'MKP 处理失败', body: `❌ ${error.message}` }).show();
      }
      setTimeout(() => app.quit(), 5000);
    }
  });

} else {
  // ==========================================
  // 🌞 显性人格：正常 GUI 界面
  // ==========================================
  
  // ==========================================
  // 获取当前运行的 EXE 绝对路径 (用于拼接脚本)
  // ==========================================
  ipcMain.handle('get-exe-path', () => {
    return app.getPath('exe'); 
  });

  // 监听前端的系统数据请求
  ipcMain.handle('get-userdata-path', () => {
    return path.join(app.getPath('userData'), 'Presets'); 
  });

  function createWindow() {
    const mainWindow = new BrowserWindow({
      width: 934,
      height: 646,      // 加上 30px 补偿
      minWidth: 934,
      minHeight: 646,   // 加上 30px 补偿
      useContentSize: false, // 彻底关掉内容计算，解决 580px 挤压 bug
      autoHideMenuBar: true, // 隐藏菜单栏
      backgroundColor: '#1A1D1F',
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true
      }
    });

    //mainWindow.removeMenu();
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  app.whenReady().then(() => {
    // 监听前端发来的主题切换消息
    ipcMain.on('set-native-theme', (event, mode) => {
      nativeTheme.themeSource = mode;
    });

    createWindow();
    autoUpdater.checkForUpdatesAndNotify();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ==========================================
// 数据读写与文件操作引擎
// ==========================================

// 1. 读取 JSON 预设
ipcMain.handle('read-preset', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(content) }; // 原生秒解
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 2. 写入 JSON 预设 (极其简单，绝对不会丢数据)
ipcMain.handle('write-preset', async (event, filePath, updates) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    
    // 先读出现有数据
    const content = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(content);

    // 深度合并更新的数据 (例如把新的 x 偏移塞进去)
    // 假设前端传来的 updates 是 { toolhead: { offset: { x: 0.5 } } }
    data = mergeDeep(data, updates); // (这里可以用一个简单的合并函数)

    // 原生完美写回，带有 2 个空格的美化缩进
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 简单的深度合并函数
function mergeDeep(target, source) {
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ==========================================
// 真实文件探测器
// ==========================================
ipcMain.handle('check-file-exists', (event, fileName) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'Presets', fileName);
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
});

// ==========================================
// 真实下载引擎：从网络拉取文件并保存到本地
// ==========================================
ipcMain.handle('download-file', async (event, fileUrl, fileName) => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // 目标保存路径
    const targetPath = path.join(userDataPath, fileName);

    // 发起网络请求 (Electron 现在的 Node 版本自带原生 fetch)
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`);
    }
    
    // 获取文本内容并写入文件
    const textContent = await response.text();
    fs.writeFileSync(targetPath, textContent, 'utf-8');

    return { success: true };
  } catch (error) {
    console.error("下载文件失败:", error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// 真实文件删除引擎
// ==========================================
ipcMain.handle('delete-file', (event, fileName) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'Presets', fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: '文件不存在' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// 智能模型提取与保护引擎 (防篡改、防占用、支持首次强制选择打开方式)
// ==========================================
ipcMain.handle('open-calibration-model', async (event, modelType, forceOpenWith = false) => {
  try {
    const sourceDir = path.join(__dirname, '../default_models');
    // 【修改点 1】：应用你指定的新模型名称
    const baseFileName = modelType === 'Z' ? 'ZOffset Calibration.3mf' : 'Precise Calibration.3mf';
    const sourcePath = path.join(sourceDir, baseFileName);

    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: `找不到底层模型文件：${baseFileName}` };
    }

    const targetDir = path.join(app.getPath('userData'), 'CalibrationModels');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let targetPath = path.join(targetDir, baseFileName);
    let finalFileName = baseFileName;

    // 智能防占用复制
    try {
      fs.copyFileSync(sourcePath, targetPath);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        const ext = path.extname(baseFileName);
        const name = path.basename(baseFileName, ext);
        finalFileName = `${name}_${Date.now()}${ext}`; 
        targetPath = path.join(targetDir, finalFileName);
        fs.copyFileSync(sourcePath, targetPath);
      } else {
        throw err;
      }
    }

    // 静默清理历史垃圾
    fs.readdir(targetDir, (err, files) => {
      if (!err) {
        files.forEach(file => {
          if (file !== finalFileName && (file.startsWith('ZOffset Calibration') || file.startsWith('Precise Calibration'))) {
            try { fs.unlinkSync(path.join(targetDir, file)); } catch (e) { }
          }
        });
      }
    });

    // 【修改点 2】：Windows 专属的“打开方式”强制弹窗！
    if (forceOpenWith && process.platform === 'win32') {
      // 呼叫 Windows 底层 API 强制弹出软件选择框
      exec(`rundll32 shell32.dll,OpenAs_RunDLL "${targetPath}"`);
      return { success: true, path: targetPath };
    } else {
      const openError = await shell.openPath(targetPath);
      if (openError) return { success: false, error: `无法打开模型: ${openError}` };
      return { success: true, path: targetPath };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});