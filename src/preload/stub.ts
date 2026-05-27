import type { ElectronAPI } from './api'

export function installStub() {
  window.electronAPI = {
    dialog: {
      openMidiFile: async () => null,
      showSaveDialog: async () => 'stub_export.mp4',
      getDefaultExportPath: async () => 'C:/Users/User/Videos/lumina_export.mp4',
    },
    export: {
      getTempDir: async () => 'C:/tmp/lumina-export-stub',
      saveFile: async ({ outputPath }) => {
        console.log('[Stub] export:saveFile', outputPath)
      },
    },
    ffmpeg: {
      run: async (args) => console.log('[Stub] ffmpeg:run', args),
    },
    shell: {
      openPath: async (path) => console.log('[Stub] shell:openPath', path),
    },
    window: {
      minimize: async () => console.log('[Stub] window:minimize'),
      maximize: async () => console.log('[Stub] window:maximize'),
      close: async () => console.log('[Stub] window:close'),
    },
  } as ElectronAPI

  window.electronFS = {
    mkdir: async (dir) => console.log('[Stub] fs:mkdir', dir),
    readFile: async (filePath) => {
      console.log('[Stub] fs:readFile', filePath)
      return new Uint8Array()
    },
    rm: async (dir) => console.log('[Stub] fs:rm', dir),
    writeFile: async (filePath, data) => console.log('[Stub] fs:writeFile', filePath, data.byteLength),
  }
}
