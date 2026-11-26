import type { CallOptions, ObserveOptions } from '@omne-harness/sdk/core'

export type Call = Readonly<{
  operation: string
  body: any
  options: CallOptions | undefined
  answer: (value: unknown) => void
  fail: (error: Error) => void
}>

type End =
  | Readonly<{ kind: 'ended'; reason: string }>
  | Readonly<{ kind: 'refused'; outcome: string }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'aborted' }>

export type Observation = Readonly<{
  open: unknown
  signal: AbortSignal
  frame(): void
  end(value: End): void
  fail(): void
}>

type Item = Readonly<{ kind: 'frame' }> | Readonly<{ kind: 'end'; value: End }> | { kind: 'throw' }

function observation(open: unknown, options: ObserveOptions) {
  const queue: Item[] = []
  let wake: (() => void) | null = null
  const push = (item: Item) => {
    queue.push(item)
    wake?.()
    wake = null
  }
  options.signal.addEventListener('abort', () => push({ kind: 'end', value: { kind: 'aborted' } }))
  async function* frames(): AsyncGenerator<{ kind: 'changed' }, End> {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(resolve => (wake = resolve))
      const item = queue.shift()!
      if (item.kind === 'throw') throw new Error('stream broke')
      if (item.kind === 'end') return item.value
      yield { kind: 'changed' }
    }
  }
  const handle: Observation = {
    open,
    signal: options.signal,
    frame: () => push({ kind: 'frame' }),
    end: value => push({ kind: 'end', value }),
    fail: () => push({ kind: 'throw' }),
  }
  return { handle, frames: frames() }
}

export type FakeClient<C> = Readonly<{
  client: C
  calls: Call[]
  observations: Observation[]
  next(operation: string): Promise<Call>
}>

/** A protocol client whose every call waits until the test answers it, and whose observations the test drives. */
export function createFakeClient<C>(operations: readonly string[]): FakeClient<C> {
  const calls: Call[] = []
  const observations: Observation[] = []
  const taken = new Set<Call>()
  const waiting: { operation: string; resolve: (call: Call) => void }[] = []
  const operation =
    (name: string) =>
    (body: unknown, options?: CallOptions): Promise<never> =>
      new Promise((resolve, reject) => {
        const call: Call = {
          operation: name,
          body,
          options,
          answer: resolve as (v: unknown) => void,
          fail: reject,
        }
        calls.push(call)
        const at = waiting.findIndex(wait => wait.operation === name)
        if (at !== -1) {
          taken.add(call)
          waiting.splice(at, 1)[0]?.resolve(call)
        }
      })
  const observe = {
    'observe-changes': (open: unknown, options: ObserveOptions) => {
      const made = observation(open, options)
      observations.push(made.handle)
      return made.frames
    },
  }
  const client = Object.fromEntries([
    ...operations.map(name => [name, operation(name)]),
    ['observe', observe],
  ]) as C
  return {
    client,
    calls,
    observations,
    next(name) {
      const ready = calls.find(call => call.operation === name && !taken.has(call))
      if (ready !== undefined) {
        taken.add(ready)
        return Promise.resolve(ready)
      }
      return new Promise(resolve => waiting.push({ operation: name, resolve }))
    },
  }
}
