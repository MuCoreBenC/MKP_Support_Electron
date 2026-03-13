const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, Notification, ipcMain, nativeTheme, shell } = require('electron'); // 必须全部引入
const path = require('path');
const fs = require('fs');
const { processGcode } = require('./mkp_engine');
const { exec } = require('child_process');
const isCliMode = process.argv.includes('--Gcode');
const AdmZip = require('adm-zip');

// ==========================================
// 🚀 增量热更新引擎 (ZIP 下载与智能解压覆盖)
// ==========================================
// 🛠️ 内部工具：智能解压防呆函数
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

function normalizeVersionValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim().replace(/^v/i, '');
  return normalized && /\d/.test(normalized) ? normalized : null;
}

function findVersionInJsonData(jsonData) {
  if (!jsonData || typeof jsonData !== 'object') {
    return null;
  }

  const directCandidates = [
    jsonData.version,
    jsonData.presetVersion,
    jsonData.preset_version,
    jsonData.profileVersion,
    jsonData.profile_version,
    jsonData.realVersion,
    jsonData.real_version,
    jsonData.meta && jsonData.meta.version,
    jsonData.info && jsonData.info.version,
    jsonData.preset && jsonData.preset.version,
    jsonData.profile && jsonData.profile.version
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeVersionValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const visited = new Set();
  const queue = [{ value: jsonData, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !current.value || typeof current.value !== 'object') {
      continue;
    }

    if (visited.has(current.value) || current.depth > 4) {
      continue;
    }
    visited.add(current.value);

    for (const [key, value] of Object.entries(current.value)) {
      if (/version/i.test(key)) {
        const normalized = normalizeVersionValue(value);
        if (normalized) {
          return normalized;
        }
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        queue.push({ value, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function inspectPatchArchive(tempFilePath) {
  const zip = new AdmZip(tempFilePath);
  const zipEntries = zip.getEntries();

  if (zipEntries.length === 0) {
    throw new Error('下载的补丁包为空，无法应用更新。');
  }

  const packageEntries = zipEntries
    .filter((entry) => !entry.isDirectory && /(^|\/)package\.json$/i.test(entry.entryName))
    .sort((left, right) => left.entryName.split('/').length - right.entryName.split('/').length);

  let packageVersion = null;
  if (packageEntries.length > 0) {
    const packageJson = JSON.parse(packageEntries[0].getData().toString('utf8'));
    packageVersion = normalizeVersionValue(packageJson.version);
  }

  return {
    zipEntries,
    packageVersion
  };
}

function readAppPackageVersion(targetAppPath) {
  try {
    const packageJsonPath = path.join(targetAppPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return normalizeVersionValue(packageJson.version);
  } catch (error) {
    return null;
  }
}


// ==========================================
// 🚀 预设文件本地复制引擎 (防中文/防无限叠加/内置展示名)
// ==========================================
ipcMain.handle('duplicate-preset', (event, payload) => {
  try {
    const { fileName, printerId, versionType, realVersion } = payload;
    const dir = path.join(app.getPath('userData'), 'Presets');
    const srcPath = path.join(dir, fileName);

    if (!fs.existsSync(srcPath)) throw new Error("源文件不存在");

    // 1. 生成 12 位纯数字时间戳 (如: 260313122011)
    const d = new Date();
    const ts = String(d.getFullYear()).slice(-2) +
               String(d.getMonth() + 1).padStart(2, '0') +
               String(d.getDate()).padStart(2, '0') +
               String(d.getHours()).padStart(2, '0') +
               String(d.getMinutes()).padStart(2, '0') +
               String(d.getSeconds()).padStart(2, '0');

    // 2. 拼接纯英文、固定长度的文件名 (杜绝无限叠加！)
    // 不管源文件叫什么，新文件永远是: a1_quick_v3.0.0-r1_260313122011.json
    const newFileName = `${printerId}_${versionType}_v${realVersion}_${ts}.json`;
    const destPath = path.join(dir, newFileName);

    // 3. 读取源文件，注入中文显示名 `_custom_name`
    const rawData = fs.readFileSync(srcPath, 'utf-8');
    const jsonData = JSON.parse(rawData);

    // 提取原有的 _custom_name 或基于版本号生成
    let baseName = jsonData._custom_name;
    if (!baseName) {
        baseName = `v${realVersion}`; // 如果原文件没起名字，就叫 v3.0.0-r1
    }
    // 智能清洗：把旧的“副本_xxxx”字样砍掉，防止在 UI 上变成“副本 副本 副本”
    baseName = baseName.replace(/\s*副本_\d{4}$/, '');

    // 注入新的展示名，例如: "v3.0.0-r1 副本_2011"
    jsonData._custom_name = `${baseName} 副本_${ts.slice(-4)}`;

    // 重新写入硬盘
    fs.writeFileSync(destPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    return { success: true, newFileName };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 📡 IPC 接收器：保存云端最新的 manifest 到本地
ipcMain.handle('save-local-manifest', async (event, jsonStr) => {
  try {
    // 💡 这里的路径必须和你的热更新解压目录保持绝对一致！
    // 这样它才能真正覆盖软件里的旧数据，确保下次断网启动时读到的是新数据
    const targetPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app', 'app_manifest.json') 
      : path.join(__dirname, '../../app_manifest.json'); // 这里根据你开发环境的相对路径微调

    // 覆盖写入
    fs.writeFileSync(targetPath, jsonStr, 'utf-8');
    console.log('[版本引擎] 本地 app_manifest.json 已成功覆盖为最新云端版本');
    
    return { success: true };
  } catch (error) {
    console.error("[版本引擎] 保存本地 manifest 失败:", error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// 🚀 预设清单 (Manifest) 本地读写引擎
// ==========================================
ipcMain.handle('read-local-presets-manifest', async () => {
  try {
    const manifestPath = path.join(app.getPath('userData'), 'Presets', 'presets_manifest.json');
    if (fs.existsSync(manifestPath)) {
      const data = fs.readFileSync(manifestPath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    return { success: false, error: '本地清单不存在' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-local-presets-manifest', async (event, jsonStr) => {
  try {
    const manifestPath = path.join(app.getPath('userData'), 'Presets', 'presets_manifest.json');
    fs.writeFileSync(manifestPath, jsonStr, 'utf-8');
    return { success: true };
  } catch (error) {
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
ipcMain.handle('apply-hot-update', async (event, payload) => {
  const tempZipPath = path.join(app.getPath('temp'), 'mkp_patch.zip');
  try {
    console.log(`[热更新] 准备下载补丁: ${zipUrl}`);
    
    // 1. 下载 ZIP 到系统的临时目录 (Temp)
    const tempZipPath = path.join(app.getPath('temp'), 'mkp_patch.zip');
    const response = await fetch(zipUrl);
    
    if (!response.ok) throw new Error(`云端下载失败，HTTP状态码: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempZipPath, Buffer.from(arrayBuffer));
    console.log(`[热更新] 补丁下载完成，保存在: ${tempZipPath}`);

    // 2. 确定要覆盖的本地代码老巢 (resources/app)
    const targetExtractPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app') 
      : path.join(__dirname, '../../');

    // 3. 呼叫智能解压工具
    extractPatch(tempZipPath, targetExtractPath);
    
    console.log(`[热更新] 解压覆盖成功！目标目录: ${targetExtractPath}`);
    
    // 4. 打扫战场 (删除临时压缩包)
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

    // 1. 自动清理 7 天前的旧日志 (每次写日志时顺手检查一下)
    const files = fs.readdirSync(logDir);
    const nowTime = Date.now();
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        // 如果文件最后修改时间超过 7 天 (7 * 24 * 60 * 60 * 1000 毫秒)，就删掉它
        if (nowTime - stats.mtimeMs > 7 * 24 * 3600 * 1000) {
          fs.unlinkSync(filePath);
        }
      }
    });

    // 2. 按天生成当前日志文件
    const date = new Date();
    const fileName = `mkp_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`;
    const logFile = path.join(logDir, fileName);

    // 3. 格式化时间并写入
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
    
    // 导出文件命名
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const exportPath = path.join(desktopPath, `mkpse_${dateStr}.txt`);

    // 🔍 找到今天的日志文件
    const logDir = path.join(app.getPath('userData'), 'Logs');
    const todayFileName = `mkp_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.log`;
    const todayLogPath = path.join(logDir, todayFileName);

    let logContent = '=== 今日暂无运行日志 ===';
    if (fs.existsSync(todayLogPath)) {
      const content = fs.readFileSync(todayLogPath, 'utf-8');
      const lines = content.split('\n');
      logContent = lines.slice(-500).join('\n'); // 只取最后 500 行
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

// ==========================================
// 🚀 初始化：释放出厂预设数据 (适配最新扁平架构 + 完善日志)
// ==========================================
ipcMain.handle('init-default-presets', async () => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    
    // 1. 确保用户目录存在
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log("[系统初始化] 📁 创建用户数据目录:", userDataPath);
    }

    // 2. 自动判断环境，精准定位云端数据文件夹
    // 打包后：去 resources 里找 | 开发中：从 src/main 往上跳两级到根目录
    const bundledPresetsPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'cloud_data', 'presets') 
      : path.join(__dirname, '../../cloud_data/presets');

    if (!fs.existsSync(bundledPresetsPath)) {
      console.warn(`[系统初始化] ⚠️ 未找到内置预设目录: ${bundledPresetsPath}`);
      return { success: true, msg: "无内置预设" };
    }

    console.log(`[系统初始化] ⏳ 正在从 ${bundledPresetsPath} 释放预设...`);
    let copiedCount = 0;

    // 3. 遍历并释放文件
    const files = fs.readdirSync(bundledPresetsPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sourceFile = path.join(bundledPresetsPath, file);
        const targetFile = path.join(userDataPath, file);

        // 💡 核心优化：因为新版文件名自带版本号(如 v3.0.0-r1)，只要文件不存在直接复制即可
        if (!fs.existsSync(targetFile)) {
          fs.copyFileSync(sourceFile, targetFile);
          console.log(`[O103] Default preset release, file:${file}`);
          copiedCount++;
        } else {
          // 如果同名文件已存在，说明用户已经有了这个版本的预设，无需覆盖
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
      show: false, // 👈 2. 核心：刚创建时先隐藏，不要让用户看到黑屏
      icon: path.join(__dirname, '../renderer/assets/icons/logo-main.ico'),
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true
      }
    });
    // 移除默认菜单
    //mainWindow.removeMenu();
    // 3. 核心：等 HTML 和代码在后台全部加载渲染完毕后，瞬间弹出！
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  app.whenReady().then(() => {

    // 1. 强行关闭代理自动发现，解决挂梯子打开软件卡死 10 秒的 Bug！
    app.commandLine.appendSwitch('no-proxy-server');
    app.commandLine.appendSwitch('disable-features', 'ProxyConfig');
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
// 获取软件真实版本号 (自动读取 package.json)
// ==========================================
ipcMain.handle('get-app-version', () => {
  return app.getVersion(); 
});
// ==========================================
// 🔄 基础系统控制 API (重启与外部跳转)
// ==========================================

// 收到前端指令后重启软件 (热更新完成后调用)
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.quit();
});

// 使用默认浏览器打开外部网页 (用于全量更新下载安装包)
ipcMain.handle('open-external', (event, targetUrl) => {
  shell.openExternal(targetUrl);
  return { success: true };
});

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

function getPresetsDirectory() {
  return path.join(app.getPath('userData'), 'Presets');
}

function extractPresetVersion(fileName, jsonData = null) {
  const contentVersion = findVersionInJsonData(jsonData);
  if (contentVersion) {
    return contentVersion;
  }

  if (jsonData && typeof jsonData === 'object') {
    return '0.0.0';
  }

  const versionMatch = String(fileName || '').match(/_v([a-zA-Z0-9.\-]+)/i);
  return versionMatch ? versionMatch[1] : '0.0.1';
}

function buildPresetDisplayName(fileName, printerId, versionType, jsonData = null) {
  if (jsonData && typeof jsonData._custom_name === 'string' && jsonData._custom_name.trim()) {
    return jsonData._custom_name.trim();
  }

  const baseName = String(fileName || '').replace(/\.json$/i, '');
  const prefix = printerId && versionType ? `${printerId}_${versionType}_` : '';
  return prefix && baseName.startsWith(prefix) ? baseName.slice(prefix.length) : baseName;
}

// ==========================================
// 获取本地预设文件夹中的所有 JSON 文件名
// ==========================================
ipcMain.handle('get-local-presets', () => {
  try {
    const userDataPath = path.join(app.getPath('userData'), 'Presets');
    if (!fs.existsSync(userDataPath)) {
      return []; // 文件夹不存在就返回空数组
    }
    const files = fs.readdirSync(userDataPath);
    // 只返回 .json 结尾的文件
    return files.filter(f => f.toLowerCase().endsWith('.json')); 
  } catch (error) {
    console.error("获取本地文件列表失败:", error);
    return [];
  }
});

ipcMain.removeHandler('apply-hot-update');
ipcMain.handle('apply-hot-update', async (event, payload) => {
  const tempZipPath = path.join(app.getPath('temp'), 'mkp_patch.zip');

  try {
    const urls = Array.isArray(payload?.urls)
      ? payload.urls.filter(Boolean)
      : [payload?.url || payload?.downloadUrl || payload].filter((item) => typeof item === 'string' && item.trim());
    const expectedVersion = normalizeVersionValue(payload?.expectedVersion);

    if (urls.length === 0) {
      throw new Error('未提供可用的补丁下载地址。');
    }

    let appliedUrl = null;
    let archiveInfo = null;
    let lastError = null;

    for (const zipUrl of urls) {
      try {
        const response = await fetch(zipUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tempZipPath, Buffer.from(arrayBuffer));

        archiveInfo = inspectPatchArchive(tempZipPath);
        if (expectedVersion) {
          if (!archiveInfo.packageVersion) {
            throw new Error('补丁包缺少 package.json，无法校验目标版本。');
          }
          if (archiveInfo.packageVersion !== expectedVersion) {
            throw new Error(`补丁包版本 ${archiveInfo.packageVersion} 与预期 ${expectedVersion} 不一致。`);
          }
        }

        appliedUrl = zipUrl;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!appliedUrl || !archiveInfo) {
      throw lastError || new Error('所有补丁下载线路都失败了。');
    }

    const targetExtractPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app')
      : path.join(__dirname, '../../');

    extractPatch(tempZipPath, targetExtractPath);

    const installedVersion = readAppPackageVersion(targetExtractPath);
    if (expectedVersion && installedVersion !== expectedVersion) {
      throw new Error(`补丁已解压，但当前程序版本仍是 ${installedVersion || 'unknown'}，未达到预期版本 ${expectedVersion}。`);
    }

    return {
      success: true,
      appliedUrl,
      version: installedVersion || archiveInfo.packageVersion || expectedVersion || null
    };
  } catch (error) {
    console.error('[HotUpdate] apply failed:', error);
    return { success: false, error: error.message };
  } finally {
    try { fs.unlinkSync(tempZipPath); } catch (error) {}
  }
});

ipcMain.handle('list-local-presets-detailed', (event, query = {}) => {
  try {
    const userDataPath = getPresetsDirectory();
    if (!fs.existsSync(userDataPath)) {
      return { success: true, data: [] };
    }

    const printerId = query.printerId || '';
    const versionType = query.versionType || '';
    const prefix = printerId && versionType ? `${printerId}_${versionType}_` : '';

    const files = fs.readdirSync(userDataPath)
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .filter((file) => file !== 'presets_manifest.json')
      .filter((file) => !prefix || file.startsWith(prefix));

    const data = files.map((fileName) => {
      const absolutePath = path.join(userDataPath, fileName);
      const stats = fs.statSync(absolutePath);

      let jsonData = null;
      try {
        jsonData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
      } catch (error) {
        jsonData = null;
      }

      return {
        fileName,
        realVersion: extractPresetVersion(fileName, jsonData),
        customName: jsonData && typeof jsonData._custom_name === 'string' ? jsonData._custom_name : null,
        displayName: buildPresetDisplayName(fileName, printerId, versionType, jsonData),
        modifiedAt: stats.mtimeMs,
        createdAt: stats.birthtimeMs || stats.ctimeMs,
        size: stats.size
      };
    });

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message, data: [] };
  }
});


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

ipcMain.handle('delete-preset-files', (event, fileNames = []) => {
  try {
    const deleted = [];
    const failed = [];
    const userDataPath = getPresetsDirectory();

    fileNames.forEach((fileName) => {
      try {
        const filePath = path.join(userDataPath, fileName);
        if (!fs.existsSync(filePath)) {
          failed.push({ fileName, error: '文件不存在' });
          return;
        }

        fs.unlinkSync(filePath);
        deleted.push(fileName);
      } catch (error) {
        failed.push({ fileName, error: error.message });
      }
    });

    return {
      success: failed.length === 0,
      deleted,
      failed
    };
  } catch (error) {
    return {
      success: false,
      deleted: [],
      failed: fileNames.map((fileName) => ({ fileName, error: error.message }))
    };
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

// ==========================================
// 🚀 Windows DOS 8.3 短路径转换引擎 (专治各种切片软件乱码/空格 Bug)
// ==========================================
ipcMain.handle('get-short-path', (event, targetPath) => {
  if (process.platform !== 'win32') return targetPath; // Mac 和 Linux 不需要，它们原生支持良好
  try {
    const { execSync } = require('child_process');
    // 调用 cmd 内部的 %~sI 魔法修饰符，获取物理短路径
    const command = `for %I in ("${targetPath}") do @echo %~sI`;
    // 执行并去掉换行符
    const shortPath = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    
    return shortPath || targetPath;
  } catch (error) {
    console.error("[短路径引擎] 转换失败，降级为原路径:", error);
    return targetPath;
  }
});

// ==========================================
// 🚀 高级文件管理引擎 (重命名显示名 & 资源管理器定位)
// ==========================================
ipcMain.handle('rename-preset-display', (event, payload) => {
  try {
    const { fileName, newName } = payload;
    const destPath = path.join(app.getPath('userData'), 'Presets', fileName);
    if (!fs.existsSync(destPath)) throw new Error("文件不存在");
    
    // 扒开 JSON，注入 _custom_name，完美规避底层中文路径报错！
    const rawData = fs.readFileSync(destPath, 'utf-8');
    const jsonData = JSON.parse(rawData);
    jsonData._custom_name = newName;
    
    fs.writeFileSync(destPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-item-in-folder', (event, fileName) => {
  try {
    const destPath = path.join(app.getPath('userData'), 'Presets', fileName);
    if (fs.existsSync(destPath)) {
      shell.showItemInFolder(destPath);
      return { success: true };
    }
    return { success: false, error: "文件不存在" };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
