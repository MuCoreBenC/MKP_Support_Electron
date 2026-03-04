const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron'); 
const path = require('path'); 

function createWindow () { 
  const win = new BrowserWindow({ 
    width: 920, 
    height: 600, 
    // 强制限制窗口被缩小的极限尺寸
    minWidth: 920,
    minHeight: 600,

    useContentSize: true,

    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false 
    } 
  }); 
// 直接加在配置项下面，加载 HTML 之前
  // win.removeMenu();
  // 直接加载本地文件
  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => { 
  // 监听前端发来的主题切换消息
  ipcMain.on('set-native-theme', (event, mode) => {
    // mode 的值会是 'light', 'dark', 或 'system'
    nativeTheme.themeSource = mode;
  });

  createWindow();
  
  // 在 macOS 上，点击 Dock 图标重新创建窗口
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 关闭所有窗口时退出应用（Windows & Linux）
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});