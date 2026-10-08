import { useCallback, useRef } from 'react'

export function useMediaRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])

  const stopMediaStream = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => {
      track.stop()
    })
  }, [])

  return {
    mediaRecorderRef,
    recordingChunksRef,
    stopMediaStream,
  }
}
