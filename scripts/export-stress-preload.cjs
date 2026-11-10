const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronFS', Object.fromEntries(['mkdir','rm','readFile','writeFile'].map(name => [name,(...args)=>ipcRenderer.invoke('stress:'+name,...args)])));
contextBridge.exposeInMainWorld('electronAPI', { export: { getTempDir:()=>ipcRenderer.invoke('stress:temp') }, ffmpeg:{run:args=>ipcRenderer.invoke('stress:ffmpeg',args)} });

contextBridge.exposeInMainWorld('stressProgress',percent=>ipcRenderer.send('stress:progress',percent));
