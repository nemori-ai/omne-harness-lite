import { finite, type Cancel, type TimeSource, type WaitOptions } from './source.ts'

export const HOST_TIMER_LIMIT_MS = 2_147_483_647

function wake(left: () => number, fire: () => void, options: WaitOptions | undefined): Cancel {
  let timer: ReturnType<typeof setTimeout> | undefined
  let over = false
  const arm = (): void => {
    timer = setTimeout(
      () => {
        if (left() > 0) return arm()
        over = true
        fire()
      },
      Math.min(Math.max(left(), 0), HOST_TIMER_LIMIT_MS),
    )
    if (options?.background === true) timer.unref()
  }
  arm()
  return () => {
    if (over) return
    over = true
    clearTimeout(timer)
  }
}

export function systemTime(): TimeSource {
  const now = (): number =>
    /* wall-clock: clock-source -- the system time source is the one reader of the host wall clock */ Date.now()
  const elapsed = (): number =>
    /* wall-clock: clock-source -- the system time source is the one reader of the host monotonic clock */ performance.now()
  return Object.freeze({
    now,
    elapsed,
    after(delayMs, fire, options) {
      const due = elapsed() + Math.max(0, finite('delayMs', delayMs))
      return wake(() => due - elapsed(), fire, options)
    },
    at(epochMs, fire, options) {
      finite('epochMs', epochMs)
      return wake(() => epochMs - now(), fire, options)
    },
  })
}
