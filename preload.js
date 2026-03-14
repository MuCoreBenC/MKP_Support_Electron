const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mkpAPI', {
  writeLog: (msg) => ipcRenderer.send('write-log', msg),
  initDefaultPresets: () => ipcRenderer.invoke('init-default-presets'),
  checkFileExists: (fileName) => ipcRenderer.invoke('check-file-exists', fileName),
  downloadFile: (fileUrl, fileName) => ipcRenderer.invoke('download-file', fileUrl, fileName),
  deleteFile: (fileName) => ipcRenderer.invoke('delete-file', fileName),

  // 【新增】：核心路径与参数读写
  getExePath: () => ipcRenderer.invoke('get-exe-path'), // 获取 EXE 程序路径
  getUserDataPath: () => ipcRenderer.invoke('get-userdata-path'), // 获取配置存放路径
  readPreset: (filePath) => ipcRenderer.invoke('read-preset', filePath),
  writePreset: (filePath, updates) => ipcRenderer.invoke('write-preset', filePath, updates),
  overwritePreset: (filePath, data) => ipcRenderer.invoke('overwrite-preset', filePath, data),
  ensurePresetBackup: (filePath) => ipcRenderer.invoke('ensure-preset-backup', filePath),
  readPresetBackup: (filePath) => ipcRenderer.invoke('read-preset-backup', filePath),

  // 【新增】：智能打开校准模型
  openCalibrationModel: (type, forceOpenWith) => ipcRenderer.invoke('open-calibration-model', type, forceOpenWith),
  setNativeTheme: (mode) => ipcRenderer.send('set-native-theme', mode),
  exportBugReport: () => ipcRenderer.send('export-bug-report'),
  getLocalPresets: () => ipcRenderer.invoke('get-local-presets'),
  listLocalPresetsDetailed: (query) => ipcRenderer.invoke('list-local-presets-detailed', query),
  applyHotUpdate: (payload) => ipcRenderer.invoke('apply-hot-update', payload),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  saveLocalManifest: (jsonStr) => ipcRenderer.invoke('save-local-manifest', jsonStr),
  readLocalManifest: () => ipcRenderer.invoke('read-local-manifest'),
  readLocalPresetsManifest: () => ipcRenderer.invoke('read-local-presets-manifest'),
  readBundledPresetsManifest: () => ipcRenderer.invoke('read-bundled-presets-manifest'),
  saveLocalPresetsManifest: (jsonStr) => ipcRenderer.invoke('save-local-presets-manifest', jsonStr),
  copyBundledPreset: (fileName) => ipcRenderer.invoke('copy-bundled-preset', fileName),
  duplicatePreset: (payload) => ipcRenderer.invoke('duplicate-preset', payload),
  deletePresetFiles: (fileNames) => ipcRenderer.invoke('delete-preset-files', fileNames),
  getShortPath: (absolutePath) => ipcRenderer.invoke('get-short-path', absolutePath),
  renamePresetDisplay: (payload) => ipcRenderer.invoke('rename-preset-display', payload),
  showItemInFolder: (fileName) => ipcRenderer.invoke('show-item-in-folder', fileName),
  readReleaseInfo: () => ipcRenderer.invoke('read-release-info'),
  saveReleaseInfo: (payload) => ipcRenderer.invoke('save-release-info', payload),
  runReleaseBuild: (mode) => ipcRenderer.invoke('run-release-build', mode),
  openReleasePath: (target) => ipcRenderer.invoke('open-release-path', target)
  


});
