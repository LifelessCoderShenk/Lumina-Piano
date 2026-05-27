import { ExportError } from './errors'
import { writeExportFile } from './exportFileSystem'

export async function writeAudioBufferToWav(buffer: AudioBuffer, filePath: string): Promise<void> {
  if (buffer.numberOfChannels < 1 || buffer.length <= 0 || buffer.sampleRate <= 0) {
    throw new ExportError('Audio buffer is invalid.', 'AUDIO_RENDER_FAILED', { buffer })
  }

  const channelCount = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const frameCount = buffer.length
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = frameCount * blockAlign
  const header = new Uint8Array(44)
  const headerView = new DataView(header.buffer)
  const channelData: Float32Array[] = []

  for (let channel = 0; channel < channelCount; channel += 1) {
    channelData.push(buffer.getChannelData(channel))
  }

  writeAscii(header, 0, 'RIFF')
  headerView.setUint32(4, 36 + dataSize, true)
  writeAscii(header, 8, 'WAVE')
  writeAscii(header, 12, 'fmt ')
  headerView.setUint32(16, 16, true)
  headerView.setUint16(20, 1, true)
  headerView.setUint16(22, channelCount, true)
  headerView.setUint32(24, sampleRate, true)
  headerView.setUint32(28, sampleRate * blockAlign, true)
  headerView.setUint16(32, blockAlign, true)
  headerView.setUint16(34, 16, true)
  writeAscii(header, 36, 'data')
  headerView.setUint32(40, dataSize, true)

  const pcm = new Uint8Array(dataSize)
  const pcmView = new DataView(pcm.buffer)
  let offset = 0

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channelCount === 1
        ? channelData[0][frame]
        : channelData[channel][frame]
      const clamped = Math.max(-1, Math.min(1, sample))
      const intSample = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
      pcmView.setInt16(offset, intSample, true)
      offset += bytesPerSample
    }
  }

  try {
    const wavBytes = new Uint8Array(header.byteLength + pcm.byteLength)
    wavBytes.set(header, 0)
    wavBytes.set(pcm, header.byteLength)
    await writeExportFile(filePath, wavBytes)
  } catch (error: unknown) {
    if (isEnospcError(error)) {
      throw new ExportError('Disk is full while writing audio.', 'DISK_FULL', error)
    }

    throw new ExportError('Failed to write WAV file.', 'AUDIO_RENDER_FAILED', error)
  }
}

function isEnospcError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOSPC'
  )
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index)
  }
}
