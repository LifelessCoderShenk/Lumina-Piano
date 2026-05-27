import { ExportError } from './errors'

export function mkdirExportDir(dir: string): Promise<void> {
  return getElectronFs().mkdir(dir)
}

export function rmExportDir(dir: string): Promise<void> {
  return getElectronFs().rm(dir)
}

export function writeExportFile(filePath: string, data: Uint8Array): Promise<void> {
  return getElectronFs().writeFile(filePath, data)
}

function getElectronFs() {
  const electronFs = typeof window !== 'undefined' ? window.electronFS : undefined

  if (
    electronFs == null ||
    typeof electronFs.mkdir !== 'function' ||
    typeof electronFs.rm !== 'function' ||
    typeof electronFs.writeFile !== 'function'
  ) {
    throw new ExportError('File system bridge is unavailable.', 'FRAME_RENDER_FAILED')
  }

  return electronFs
}
