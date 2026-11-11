import type { ShutdownClock, Timer } from '../../shutdown.ts'
import type { createBodySweep } from './body-sweep.ts'

type Sweep = ReturnType<typeof createBodySweep>
export type SweepRunnerInput = Readonly<{
  sweep: Sweep
  clock: Pick<ShutdownClock, 'after'>
  intervalMs: number
  report(result: Awaited<ReturnType<Sweep['advance']>>): void
}>

export function startSweepRunner(input: SweepRunnerInput) {
  if (
    !Number.isSafeInteger(input.intervalMs) ||
    input.intervalMs < 1 ||
    input.intervalMs > 2_147_483_647
  )
    throw new RangeError('sweep intervalMs must be a supported positive timer delay')
  let stopped = false
  let timer: Timer | null = null
  let closing: Promise<void> | null = null
  const stop = Promise.withResolvers<void>()
  const done = Promise.resolve().then(async () => {
    while (!stopped) {
      const result = await input.sweep.advance()
      if (stopped) return
      input.report(result)
      if (stopped) return
      timer = input.clock.after(input.intervalMs)
      await Promise.race([timer.promise, stop.promise])
      timer.cancel()
      timer = null
    }
  })
  return Object.freeze({
    done,
    close(): Promise<void> {
      if (closing !== null) return closing
      stopped = true
      stop.resolve()
      timer?.cancel()
      const completion = Promise.withResolvers<void>()
      closing = completion.promise
      const sweep = (async () => {
        await input.sweep.close()
      })()
      void Promise.all([done, sweep]).then(() => completion.resolve(), completion.reject)
      return closing
    },
  })
}
