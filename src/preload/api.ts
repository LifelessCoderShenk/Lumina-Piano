import type { SaveDialogOptions } from 'electron'

export interface ElectronFS {
  mkdir(path: string): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  rm(path: string): Promise<void>
  writeFile(path: string, data: Uint8Array): Promise<void>
}

export interface ElectronExportBridge {
  getTempDir(): Promise<string>
  saveFile(payload: {
    buffer: number[]
    outputPath: string
  }): Promise<void>
}

export interface ElectronAPI {
  dialog: {
    openMidiFile(): Promise<string | null>
    showSaveDialog(options: SaveDialogOptions): Promise<string | null>
    getDefaultExportPath(): Promise<string | null>
  }
  export: ElectronExportBridge
  ffmpeg: {
    run(args: string[]): Promise<void>
  }
  shell: {
    openPath(path: string): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
  }
}
declare global {
  interface Window {
    electronAPI: ElectronAPI
    electronFS: ElectronFS
  }
}

export {}
