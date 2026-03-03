const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 配置 Electron 镜像源
process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';

// 导入 Python 模块（使用子进程调用）
function processGcode(tomlPath, gcodePath) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const pythonScript = `
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from mkp_processor.processor import process_with_external

result = process_with_external(sys.argv[1], sys.argv[2])
print(result.success)
print(result.output_path if result.output_path else "")
print(result.error_message if result.error_message else "")
`;

    const pythonProcess = spawn('python', ['-c', pythonScript, tomlPath, gcodePath]);
    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        const lines = output.trim().split('\n');
        resolve({
          success: lines[0] === 'True',
          output_path: lines[1],
          error_message: lines[2]
        });
      } else {
        reject(new Error(error || 'Python 脚本执行失败'));
      }
    });
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  mainWindow.loadFile('templates/index.html');
  // mainWindow.webContents.openDevTools();
}

// 确保应用能够正确解析静态资源路径
app.on('ready', () => {
  // 注册自定义协议处理，用于加载静态资源
  const protocol = require('electron').protocol;
  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 处理打印机数据请求
ipcMain.handle('get-printers', () => {
  const file_path = path.join(__dirname, 'data', 'printers.json');
  if (fs.existsSync(file_path)) {
    const data = fs.readFileSync(file_path, 'utf-8');
    return JSON.parse(data);
  }
  return { brands: [], printersByBrand: {} };
});

// 处理 Gcode 处理请求
ipcMain.handle('process-gcode', async (event, tomlPath, gcodePath) => {
  try {
    const result = await processGcode(tomlPath, gcodePath);
    return result;
  } catch (error) {
    return {
      success: false,
      error_message: error.message
    };
  }
});

// 处理文件选择请求
ipcMain.handle('select-file', async (event, options) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    ...options
  });
  if (canceled) {
    return null;
  }
  return filePaths[0];
});
