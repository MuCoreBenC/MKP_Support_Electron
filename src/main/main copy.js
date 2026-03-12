const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, Notification, ipcMain, nativeTheme, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { processGcode } = require('./mkp_engine');
const { exec } = require('child_process');
const isCliMode = process.argv.includes('--Gcode');
const AdmZip = require('adm-zip');

// ==========================================
// 🚀 增量热更新引擎 (ZIP 下载与智能解压覆盖)
// ==========================================
function extractPatch(tempFilePath, targetAppPath) {
  const zip = new AdmZip(tempFilePath);
  const zipEntries = zip.getEntries();
  
  if (zipEntries.length === 0) throw new Error("下载的补丁包是空的！");

  // 💡 智能判断：检测压缩包是不是多套了一层文件夹
  const firstEntryName = zipEntries[0].entryName;
  const hasWrapperFolder = firstEntryName.includes('/') && zipEntries.every(entry => entry.entryName.startsWith(firstEntryName.split('/')[0] + '/'));

  if (hasWrapperFolder) {
    const wrapperFolderName = firstEntryName.split('/')[0] + '/';
    console.log(`[热更新] 检测到外层文件夹 [${wrapperFolderName}]，正在智能剥离...`);
    
    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        // 算出剥离外层文件夹后的真实目标路径
        const targetPath = path.join(targetAppPath, entry.entryName.replace(wrapperFolderName, ''));
        // 确保目标文件夹存在
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        // 单个文件覆盖提取
        zip.extractEntryTo(entry, path.dirname(targetPath), false, true); 
      }
    });
  } else {
    console.log("[热更新] 压缩包层级正确，直接覆盖解压...");
    zip.extractAllTo(targetAppPath, true); // true 表示允许覆盖已有文件
  }
}

// 📡 IPC 接收器：保存云端最新的 manifest 到本地
ipcMain.handle('save-local-manifest', async (event, jsonStr) => {
  try {
    const targetPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app', 'app_manifest.json') 
      : path.join(__dirname, '../../app_manifest.json'); // 完美适配你的 src/main 目录结构

    fs.writeFileSync(targetPath, jsonStr, 'utf-8');
    console.log('[版本引擎] 本地 app_manifest.json 已成功覆盖为最新云端版本');
    
    return { success: true };
  } catch (error) {
    console.error("[版本引擎] 保存本地 manifest 失败:", error);
    return { success: false, error: error.message };
  }
});

// 📡 IPC 接收器：前端呼叫强行读取本地 manifest (绕过 fetch 限制)
ipcMain.handle('read-local-manifest', async () => {
  try {
    const manifestPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app', 'app_manifest.json') 
      : path.join(__dirname, '../../app_manifest.json');
      
    if (fs.existsSync(manifestPath)) {
      const data = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(data);
    } else {
      console.warn('[版本引擎] 本地未找到 app_manifest.json');
      return null;
    }
  } catch (error) {
    console.error('[版本引擎] 读取本地 manifest 失败:', error);
    return null;
  }
});

// 📡 IPC 接收器：前端呼叫热更新
ipcMain.handle('apply-hot-update', async (event, zipUrl) => {
  try {
    console.log(`[热更新] 准备下载补丁: ${zipUrl}`);
    
    const tempZipPath = path.join(app.getPath('temp'), 'mkp_patch.zip');
    const response = await fetch(zipUrl);
    
    if (!response.ok) throw new Error(`云端下载失败，HTTP状态码: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempZipPath, Buffer.from(arrayBuffer));
    console.log(`[热更新] 补丁下载完成，保存在: ${tempZipPath}`);

    const targetExtractPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app') 
      : path.join(__dirname, '../../');

    extractPatch(tempZipPath, targetExtractPath);
    console.log(`[热更新] 解压覆盖成功！目标目录: ${targetExtractPath}`);
    
    try { fs.unlinkSync(tempZipPath); } catch(e) {}

    return { success: true };
  } catch (error) {
    console.error("[热更新] 严重失败:", error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// 日志系统 (按天轮转 + 自动清理)
// ==========================================
ipcMain.on('write-log', (event, message) => {
  try {
    const logDir = path.join(app.getPath('userData'), 'Logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const files = fs.readdirSync(logDir);
    const nowTime = Date.now();
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        if (nowTime - stats.mtimeMs > 7 * 24 * 3600 * 1000) {
          fs.unlinkSync(filePath);
        }
      }
    });

    const date = new Date();
    const fileName = `mkp_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`;
    const logFile = path.join(logDir, fileName);

    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    const logLine = `[${timeStr}] ${message}\n`;

    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    console.error("[E307] Log write err: " + error.message);
  }
});

// ==========================================
// 生成极简诊断报告 (导出至桌面)
// ==========================================
ipcMain.on('export-bug-report', () => {
  try {
    const desktopPath = app.getPath('desktop');
    const now = new Date();
    
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const exportPath = path.join(desktopPath, `mkpse_${dateStr}.txt`);

    const logDir = path.join(app.getPath('userData'), 'Logs');
    const todayFileName = `mkp_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.log`;
    const todayLogPath = path.join(logDir, todayFileName);

    let logContent = '=== 今日暂无运行日志 ===';
    if (fs.existsSync(todayLogPath)) {
      const content = fs.readFileSync(todayLogPath, 'utf-8');
      const lines = content.split('\n');
      logContent = lines.slice(-500).join('\n'); 
    }

    const header = `
=========================================
📝 MKPSE 运行日志 (安全导出)
=========================================
✅ 隐私声明：本报告仅包含软件的基础运行状态与报错代码，绝不包含您的模型数据、个人文件或身份信息。请放心发送至交流群求助。

软件版本: v${app.getVersion()}
操作系统: ${require('os').type()} ${require('os').arch()}
导出时间: ${now.toLocaleString('zh-CN')}
=========================================
👇 今日运行日志 👇

`;
    fs.writeFileSync(exportPath, header + logContent);
    require('electron').shell.showItemInFolder(exportPath);
  } catch(e) {
    console.error('导出报告失败', e);
  }
});

// ==========================================
// 🚀 初始化：释放出厂预设数据 
// ==========================================
ipcMain.handle('init-default-presets', async () => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log("[系统初始化] 📁 创建用户数据目录:", userDataPath);
    }

    const bundledPresetsPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'cloud_data', 'presets') 
      : path.join(__dirname, '../../cloud_data/presets'); // 完美适配目录树

    if (!fs.existsSync(bundledPresetsPath)) {
      console.warn(`[系统初始化] ⚠️ 未找到内置预设目录: ${bundledPresetsPath}`);
      return { success: true, msg: "无内置预设" };
    }

    console.log(`[系统初始化] ⏳ 正在从 ${bundledPresetsPath} 释放预设...`);
    let copiedCount = 0;

    const files = fs.readdirSync(bundledPresetsPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sourceFile = path.join(bundledPresetsPath, file);
        const targetFile = path.join(userDataPath, file);

        if (!fs.existsSync(targetFile)) {
          fs.copyFileSync(sourceFile, targetFile);
          console.log(`[O103] Default preset release, file:${file}`);
          copiedCount++;
        } else {
          console.log(`[系统初始化] ⚡ 预设已存在，跳过: ${file}`);
        }
      }
    }
    
    console.log(`[系统初始化] 🎉 预设释放完成！本次共新增 ${copiedCount} 个文件。`);
    return { success: true, copiedCount };

  } catch (error) {
    console.error("[E102] Preset release fail: ", error);
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
      console.log("[O503] CLI process");
      const gcodePath = process.argv[process.argv.indexOf('--Gcode') + 1];
      const jsonPath = process.argv[process.argv.indexOf('--Json') + 1];
      
      if (!gcodePath || !jsonPath) {
        console.error("[E503] CLI args miss");
        throw new Error('参数缺失');
      }

      const startTime = Date.now();
      const processedGcode = processGcode(gcodePath, jsonPath);
      
      const outputPath = gcodePath.replace('.gcode', '_processed.gcode');
      fs.writeFileSync(outputPath, processedGcode);
      
      const costTime = ((Date.now() - startTime) / 1000).toFixed(2);

      if (Notification.isSupported()) {
        new Notification({
          title: 'MKP SupportE',
          body: `✅ 涂胶路径已注入！(耗时: ${costTime}s)\n文件: ${path.basename(outputPath)}`,
          silent: true
        }).show();
      }
      
      setTimeout(() => app.quit(), 3000);
    } catch (error) {
      console.error("[E604] CLI exec err: " + error.message);
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
  
  ipcMain.handle('get-exe-path', () => {
    return app.getPath('exe'); 
  });

  ipcMain.handle('get-userdata-path', () => {
    return path.join(app.getPath('userData'), 'Presets'); 
  });

  function createWindow() {
    const mainWindow = new BrowserWindow({
      width: 934,
      height: 646,      
      minWidth: 934,
      minHeight: 646,   
      useContentSize: false, 
      autoHideMenuBar: true, 
      backgroundColor: '#1A1D1F',
      show: false, 
      icon: path.join(__dirname, '../renderer/assets/icons/logo-main.ico'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true
      }
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  app.whenReady().then(() => {
    app.commandLine.appendSwitch('no-proxy-server');
    app.commandLine.appendSwitch('disable-features', 'ProxyConfig');

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
// 获取软件真实版本号
// ==========================================
ipcMain.handle('get-app-version', () => {
  return app.getVersion(); 
});

// ==========================================
// 🔄 基础系统控制 API
// ==========================================
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.quit();
});

ipcMain.handle('open-external', (event, targetUrl) => {
  shell.openExternal(targetUrl);
  return { success: true };
});

// ==========================================
// 数据读写与文件操作引擎
// ==========================================
ipcMain.handle('read-preset', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(content) }; 
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-preset', async (event, filePath, updates) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    
    const content = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(content);

    data = mergeDeep(data, updates); 
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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

ipcMain.handle('get-local-presets', () => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    if (!fs.existsSync(userDataPath)) {
      return []; 
    }
    const files = fs.readdirSync(userDataPath);
    return files.filter(f => f.toLowerCase().endsWith('.json')); 
  } catch (error) {
    console.error("获取本地文件列表失败:", error);
    return [];
  }
});

ipcMain.handle('check-file-exists', (event, fileName) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'Presets', fileName);
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
});

ipcMain.handle('download-file', async (event, fileUrl, fileName) => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    const targetPath = path.join(userDataPath, fileName);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`);
    }
    
    const textContent = await response.text();
    fs.writeFileSync(targetPath, textContent, 'utf-8');

    return { success: true };
  } catch (error) {
    console.error("下载文件失败:", error);
    return { success: false, error: error.message };
  }
});

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
// 智能模型提取与保护引擎 
// ==========================================
ipcMain.handle('open-calibration-model', async (event, modelType, forceOpenWith = false) => {
  try {
    const sourceDir = path.join(__dirname, '../default_models');
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

    fs.readdir(targetDir, (err, files) => {
      if (!err) {
        files.forEach(file => {
          if (file !== finalFileName && (file.startsWith('ZOffset Calibration') || file.startsWith('Precise Calibration'))) {
            try { fs.unlinkSync(path.join(targetDir, file)); } catch (e) { }
          }
        });
      }
    });

    if (forceOpenWith && process.platform === 'win32') {
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