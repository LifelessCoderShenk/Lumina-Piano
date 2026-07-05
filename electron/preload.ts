import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, ElectronFS } from '../src/preload/api'

const electronApi: ElectronAPI = {
  getSongs: () => ipcRenderer.invoke('library:getUserSongs'),
  uploadSong: async () => {
    const sourcePath = await ipcRenderer.invoke('dialog:openMidiFile')
    if (sourcePath == null) {
      return null
    }

    return ipcRenderer.invoke('library:saveUserSong', { sourcePath })
  },
  deleteSong: (songId) => ipcRenderer.invoke('library:deleteUserSong', songId),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile'),
  openMidiFile: () => ipcRenderer.invoke('dialog:openMidiFile'),
  dialog: {
    openMidiFile: () => ipcRenderer.invoke('dialog:openMidiFile'),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    getDefaultExportPath: () => ipcRenderer.invoke('dialog:getDefaultExportPath'),
  },
  export: {
    getTempDir: () => ipcRenderer.invoke('export:getTempDir'),
    saveFile: (payload) => ipcRenderer.invoke('export:saveFile', payload),
  },
  ffmpeg: {
    run: (args) => ipcRenderer.invoke('ffmpeg:run', args),
  },
  library: {
    getUserSongs: () => ipcRenderer.invoke('library:getUserSongs'),
    saveUserSong: (payload) => ipcRenderer.invoke('library:saveUserSong', payload),
    deleteUserSong: (songId) => ipcRenderer.invoke('library:deleteUserSong', songId),
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
}

const electronFs: ElectronFS = {
  mkdir: (dir) => ipcRenderer.invoke('fs:mkdir', dir),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  rm: (dir) => ipcRenderer.invoke('fs:rm', dir),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
contextBridge.exposeInMainWorld('electronFS', electronFs)
