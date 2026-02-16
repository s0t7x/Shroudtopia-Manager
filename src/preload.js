const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
    checkInstallations: (paths) => ipcRenderer.invoke('check-installations', paths),
    getMods: (path) => ipcRenderer.invoke('get-mods', path),
    toggleMod: (payload) => ipcRenderer.invoke('toggle-mod', payload),
    importMod: (path) => ipcRenderer.invoke('import-mod', path),
    readJson: (path) => ipcRenderer.invoke('read-json', path),
    saveJson: (payload) => ipcRenderer.invoke('save-json', payload),
    installLoader: (payload) => ipcRenderer.invoke('install-loader', payload),
    windowCtrl: (action) => ipcRenderer.invoke('window-ctrl', action),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    launchTarget: (p) => ipcRenderer.invoke('launch-target', p),
});