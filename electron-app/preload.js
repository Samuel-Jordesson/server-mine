const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
    awsStatus: () => ipcRenderer.invoke('aws:status'),
    awsStart: () => ipcRenderer.invoke('aws:start'),
    awsStop: () => ipcRenderer.invoke('aws:stop'),
    connect: () => ipcRenderer.invoke('panel:connect'),
    onLog: (cb) => ipcRenderer.on('settings:log', (_e, msg) => cb(msg))
});
