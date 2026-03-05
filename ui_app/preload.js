// ui_app/preload.js
// 这是 MKP Support 专属的渲染进程与主进程通信大桥

const { contextBridge, ipcRenderer } = require('electron');

// 暴露名为 'mkpAPI' 的专属对象给前端的 window
contextBridge.exposeInMainWorld('mkpAPI', {
  
  // 1. 主题切换专属通道
  setNativeTheme: (mode) => ipcRenderer.send('set-native-theme', mode),

  // 2. TOML 文件读写专属通道
  readToml: (filePath) => ipcRenderer.invoke('read-toml', filePath),
  writeToml: (filePath, newData) => ipcRenderer.invoke('write-toml', filePath, newData),
  
  // 3. 获取用户本地数据存放路径
  getUserDataPath: () => ipcRenderer.invoke('get-userdata-path'),
  
  initDefaultPresets: () => ipcRenderer.invoke('init-default-presets'),
  writeLog: (message) => ipcRenderer.send('write-log', message)
});