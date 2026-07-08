import { useCallback, useRef, useState } from 'react'

export function useCountdown() {
  const countdownTimeoutIdsRef = useRef<Array<ReturnType<typeof globalThis.setTimeout>>>([])
  const [countdownValue, setCountdownValue] = useState<number | null>(null)

  const clearCountdown = useCallback(() => {
    countdownTimeoutIdsRef.current.forEach((timeoutId) => {
      globalThis.clearTimeout(timeoutId)
    })
    countdownTimeoutIdsRef.current.length = 0
  }, [])

  const waitForCountdownStep = useCallback((ms: number): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = globalThis.setTimeout(() => {
        countdownTimeoutIdsRef.current = countdownTimeoutIdsRef.current.filter((id) => id !== timeoutId)
        resolve()
      }, ms)
      countdownTimeoutIdsRef.current.push(timeoutId)
    })
  }, [])

  return {
    clearCountdown,
    countdownValue,
    setCountdownValue,
    waitForCountdownStep,
  }
}
