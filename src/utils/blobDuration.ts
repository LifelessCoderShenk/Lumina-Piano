/** Reads the finite media duration carried by a recorded Blob. */
export async function probeBlobDuration(blob: Blob): Promise<number | null> {
  const video = document.createElement('video')
  const objectUrl = URL.createObjectURL(blob)
  video.preload = 'metadata'
  video.src = objectUrl

  try {
    await waitForMetadata(video)
    return Number.isFinite(video.duration) && video.duration >= 0
      ? video.duration
      : null
  } finally {
    video.pause()
    video.removeAttribute('src')
    URL.revokeObjectURL(objectUrl)
  }
}

async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_METADATA ||
    Number.isFinite(video.duration) ||
    video.videoWidth > 0 ||
    video.videoHeight > 0
  ) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
    }
    const handleLoadedMetadata = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('Unable to read recording duration'))
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
    video.addEventListener('error', handleError, { once: true })
    video.load()
  })
}
