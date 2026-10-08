/** Schedule clicks ahead on the audio clock so score engraving cannot delay a beat. */
export class TranscriptionMetronome {
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private clicks: OscillatorNode[] = []
  private generation = 0
  async start(bpm: number, denominator: number, beats: number): Promise<void> {
    this.stop()
    const generation = this.generation
    this.context ??= new AudioContext()
    const context = this.context
    await context.resume()
    if (generation !== this.generation) return
    let next = context.currentTime + 0.02
    let beat = 0
    const schedule = () => {
      while (next < context.currentTime + 0.12) {
        const oscillator = context.createOscillator(); const gain = context.createGain()
        oscillator.frequency.value = beat % beats === 0 ? 1200 : 850
        gain.gain.setValueAtTime(0.08, next); gain.gain.exponentialRampToValueAtTime(0.001, next + 0.045)
        oscillator.connect(gain).connect(context.destination); oscillator.start(next); oscillator.stop(next + 0.05)
        this.clicks.push(oscillator)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.clicks = this.clicks.filter((entry) => entry !== oscillator) }
        next += 60 / bpm * 4 / denominator; beat++
      }
    }
    schedule(); this.timer = setInterval(schedule, 25)
  }
  stop(): void {
    this.generation++
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.clicks.forEach((click) => { try { click.stop() } catch { /* Already stopped. */ } }); this.clicks = []
  }
  dispose(): void { this.stop(); void this.context?.close(); this.context = null }
}
