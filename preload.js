const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  processGcode: (tomlPath, gcodePath) => ipcRenderer.invoke('process-gcode', tomlPath, gcodePath),
  selectFile: (options) => ipcRenderer.invoke('select-file', options)
});
