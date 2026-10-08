import { useCallback, useRef, useState } from 'react'

export function useCountdown() {
  const countdownWaitersRef = useRef<Array<{ id: ReturnType<typeof globalThis.setTimeout>; resolve: () => void }>>([])
  const [countdownValue, setCountdownValue] = useState<number | null>(null)

  const clearCountdown = useCallback(() => {
    const waiters = countdownWaitersRef.current.splice(0)
    waiters.forEach(({ id, resolve }) => {
      globalThis.clearTimeout(id)
      resolve()
    })
  }, [])

  const waitForCountdownStep = useCallback((ms: number): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = globalThis.setTimeout(() => {
        countdownWaitersRef.current = countdownWaitersRef.current.filter((waiter) => waiter.id !== timeoutId)
        resolve()
      }, ms)
      countdownWaitersRef.current.push({ id: timeoutId, resolve })
    })
  }, [])

  return {
    clearCountdown,
    countdownValue,
    setCountdownValue,
    waitForCountdownStep,
  }
}
