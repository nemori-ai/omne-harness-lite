import type {
  ConverterEngine,
  EngineInput,
  EngineOutput,
  MediaTimer,
} from '@omne-harness/media-contract'

type Gate = { running: number; readonly waiting: (() => void)[] }

/** The turns of each engine: as many at a time as it declares, `queueLimit` more waiting. */
export function createTurns(queueLimit: number) {
  const gates = new WeakMap<ConverterEngine, Gate>()

  /** A turn ends with the function answered. `full`: no place to wait. `cancelled`: left the queue. */
  return function enter(
    engine: ConverterEngine,
    signal: AbortSignal,
  ): Promise<(() => void) | 'full' | 'cancelled'> {
    const gate = gates.get(engine) ?? { running: 0, waiting: [] }
    gates.set(engine, gate)
    const leave = (): void => {
      const next = gate.waiting.shift()
      if (next === undefined) gate.running -= 1
      else next()
    }
    if (gate.running < engine.declaration.concurrency) {
      gate.running += 1
      return Promise.resolve(leave)
    }
    if (gate.waiting.length >= queueLimit) return Promise.resolve('full')
    return new Promise(resolve => {
      const turn = (): void => resolve(leave)
      const cancel = (): void => {
        const at = gate.waiting.indexOf(turn)
        if (at < 0) return
        gate.waiting.splice(at, 1)
        resolve('cancelled')
      }
      gate.waiting.push(turn)
      signal.addEventListener('abort', cancel)
    })
  }
}

export type Converted = EngineOutput | 'timeout' | 'withdrawn' | 'cancelled' | 'threw'
export type Bounds = Readonly<{
  timer: MediaTimer
  timeoutMs: number
  withdrawn: AbortSignal
  stop: AbortSignal
}>

/** One conversion that ends when its time is over, its engine leaves or nobody waits: the engine is not waited for. It is told through `stop`. */
export function convertWithin(
  engine: ConverterEngine,
  input: Omit<EngineInput, 'signal'>,
  bounds: Bounds,
): Promise<Converted> {
  const { withdrawn, stop } = bounds
  if (withdrawn.aborted) return Promise.resolve('withdrawn')
  if (stop.aborted) return Promise.resolve('cancelled')
  return new Promise<Converted>(resolve => {
    const end = (answer: Converted): void => {
      cancelTimer()
      withdrawn.removeEventListener('abort', onWithdrawn)
      stop.removeEventListener('abort', onStop)
      resolve(answer)
    }
    const onWithdrawn = (): void => end('withdrawn')
    const onStop = (): void => end('cancelled')
    const cancelTimer = bounds.timer.after(bounds.timeoutMs, () => end('timeout'))
    withdrawn.addEventListener('abort', onWithdrawn)
    stop.addEventListener('abort', onStop)
    const signal = AbortSignal.any([withdrawn, stop])
    void Promise.resolve()
      .then(() => engine.convert({ ...input, signal }))
      .then(end, () => end('threw'))
  })
}
