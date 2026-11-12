const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaHarbor', {
  scan: url => ipcRenderer.invoke('scan-page', url),
  download: items => ipcRenderer.invoke('download-items', items),
  onProgress: callback => ipcRenderer.on('download-progress', (_event, data) => callback(data))
});
