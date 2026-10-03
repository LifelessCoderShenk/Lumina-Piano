const MAX_QUALITY_SAMPLES = 3

export interface EncodedFrameQualityResult {
  encodedByteLength: number
  psnrDb: number
  timestampMicros: number
}

/**
 * Chooses inexpensive, evenly spread comparison points for a single export.
 * The probe is intentionally diagnostic-only: an unavailable decoder must
 * never prevent a user from receiving an export.
 */
export function getExportQualitySampleFrameIndexes(totalFrames: number): number[] {
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
    return []
  }

  const lastFrame = Math.max(0, Math.floor(totalFrames) - 1)
  const candidates = [0, Math.floor(lastFrame / 2), lastFrame]
  return [...new Set(candidates)].slice(0, MAX_QUALITY_SAMPLES)
}

export function calculateFramePsnr(rawPixels: Uint8Array, encodedPixels: Uint8Array): number | null {
  if (rawPixels.length === 0 || rawPixels.length !== encodedPixels.length) {
    return null
  }

  let squaredError = 0
  for (let index = 0; index < rawPixels.length; index += 1) {
    const difference = rawPixels[index] - encodedPixels[index]
    squaredError += difference * difference
  }

  if (squaredError === 0) {
    return Number.POSITIVE_INFINITY
  }

  const meanSquaredError = squaredError / rawPixels.length
  return 10 * Math.log10((255 * 255) / meanSquaredError)
}

/**
 * Captures a few raw canvas frames and compares them with WebCodecs' decoded
 * VP9 output. This is a diagnostic guard only; it is safe to run in browsers
 * without VideoDecoder support.
 */
export class ExportQualityProbe {
  private readonly rawFrames = new Map<number, Uint8Array>()
  private readonly results: EncodedFrameQualityResult[] = []
  private readonly sampleFrameIndexes: Set<number>
  private readonly pendingComparisons = new Set<Promise<void>>()
  private decoder: VideoDecoder | null = null
  private unavailable = false

  constructor(
    totalFrames: number,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.sampleFrameIndexes = new Set(getExportQualitySampleFrameIndexes(totalFrames))

    if (typeof VideoDecoder === 'undefined' || typeof VideoFrame === 'undefined') {
      this.unavailable = true
      return
    }

    try {
      this.decoder = new VideoDecoder({
        error: () => {
          this.unavailable = true
        },
        output: (frame) => {
          const comparison = this.compareDecodedFrame(frame)
          this.pendingComparisons.add(comparison)
          void comparison.finally(() => this.pendingComparisons.delete(comparison))
        },
      })
      this.decoder.configure({
        codec: 'vp09.00.10.08',
        codedHeight: height,
        codedWidth: width,
        optimizeForLatency: true,
      })
    } catch {
      this.unavailable = true
      this.decoder?.close()
      this.decoder = null
    }
  }

  shouldCapture(frameIndex: number): boolean {
    return !this.unavailable && this.decoder != null && this.sampleFrameIndexes.has(frameIndex)
  }

  async captureRawFrame(frameIndex: number, frame: VideoFrame): Promise<void> {
    if (this.unavailable || this.decoder == null || !this.sampleFrameIndexes.has(frameIndex)) {
      return
    }

    try {
      const pixels = new Uint8Array(frame.allocationSize({ format: 'RGBA' }))
      await frame.copyTo(pixels, { format: 'RGBA' })
      this.rawFrames.set(frame.timestamp, pixels)
    } catch {
      this.unavailable = true
      this.rawFrames.clear()
    }
  }

  decode(chunk: EncodedVideoChunk): void {
    if (this.unavailable || this.decoder == null) {
      return
    }

    try {
      this.decoder.decode(chunk)
    } catch {
      this.unavailable = true
    }
  }

  async finish(): Promise<EncodedFrameQualityResult[]> {
    if (this.unavailable || this.decoder == null) {
      this.close()
      return []
    }

    try {
      await this.decoder.flush()
      await Promise.all([...this.pendingComparisons])
    } catch {
      this.unavailable = true
    } finally {
      this.close()
    }

    return [...this.results]
  }

  private async compareDecodedFrame(frame: VideoFrame): Promise<void> {
    const rawPixels = this.rawFrames.get(frame.timestamp)
    if (rawPixels == null) {
      frame.close()
      return
    }

    try {
      const encodedPixels = new Uint8Array(frame.allocationSize({ format: 'RGBA' }))
      await frame.copyTo(encodedPixels, { format: 'RGBA' })
      const psnrDb = calculateFramePsnr(rawPixels, encodedPixels)
      if (psnrDb != null) {
        this.results.push({
          encodedByteLength: encodedPixels.byteLength,
          psnrDb,
          timestampMicros: frame.timestamp,
        })
      }
    } catch {
      this.unavailable = true
    } finally {
      this.rawFrames.delete(frame.timestamp)
      frame.close()
    }
  }

  private close(): void {
    this.rawFrames.clear()
    try {
      this.decoder?.close()
    } catch {
      // The decoder may already have transitioned to closed after an error.
    }
    this.decoder = null
  }
}
