import { loadProjectData } from '../midi/loadMidiProject'
import { parseMusicXml } from './parser'

export async function openAndLoadMusicXmlFile(): Promise<{ filePath: string; name: string } | null> {
  const picker = window.electronAPI?.openMusicXmlFile ?? window.electronAPI?.dialog?.openMusicXmlFile
  if (typeof picker !== 'function') throw new Error('MusicXML import is unavailable.')
  const filePath = await picker()
  return filePath == null ? null : loadMusicXmlFileFromPath(filePath)
}

export async function loadMusicXmlFileFromPath(filePath: string): Promise<{ filePath: string; name: string }> {
  if (!/\.(musicxml|xml)$/i.test(filePath)) throw new Error('Choose a .musicxml or .xml score.')
  const bytes = await window.electronFS.readFile(filePath)
  await loadProjectData(parseMusicXml(new TextDecoder().decode(bytes)))
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  return { filePath, name: fileName.replace(/\.(musicxml|xml)$/i, '') || fileName }
}
