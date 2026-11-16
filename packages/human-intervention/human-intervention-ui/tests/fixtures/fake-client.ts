import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import type { CallOptions, ClientOf, ObserveOptions } from '@omne-harness/sdk/core'
import type { CardsEnd } from '../../src/model/cards-machine.ts'

type Client = ClientOf<HumanInterventionProtocol>
type Operation = Exclude<keyof Client, 'observe'>

export type Call = Readonly<{
  operation: Operation
  body: unknown
  options: CallOptions | undefined
  answer: (value: unknown) => void
}>

export type Observation = Readonly<{
  open: unknown
  signal: AbortSignal
  frame(): void
  end(value: CardsEnd): void
}>

export type FakeClient = Readonly<{
  client: Client
  calls: Call[]
  observations: Observation[]
  next(operation: Operation): Promise<Call>
}>

type Item = Readonly<{ kind: 'frame' }> | Readonly<{ kind: 'end'; value: CardsEnd }>

function observation(open: unknown, options: ObserveOptions) {
  const queue: Item[] = []
  let wake: (() => void) | null = null
  const push = (item: Item) => {
    queue.push(item)
    wake?.()
    wake = null
  }
  options.signal.addEventListener('abort', () => push({ kind: 'end', value: { kind: 'aborted' } }))
  async function* frames(): AsyncGenerator<{ kind: 'changed' }, CardsEnd> {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(resolve => (wake = resolve))
      const item = queue.shift()!
      if (item.kind === 'end') return item.value
      yield { kind: 'changed' }
    }
  }
  const handle: Observation = {
    open,
    signal: options.signal,
    frame: () => push({ kind: 'frame' }),
    end: value => push({ kind: 'end', value }),
  }
  return { handle, frames: frames() }
}

export function createFakeClient(): FakeClient {
  const calls: Call[] = []
  const observations: Observation[] = []
  const taken = new Set<Call>()
  const waiting: { operation: Operation; resolve: (call: Call) => void }[] = []

  const operation =
    (name: Operation) =>
    (body: unknown, options?: CallOptions): Promise<never> =>
      new Promise(resolve => {
        const call: Call = {
          operation: name,
          body,
          options,
          answer: resolve as (value: unknown) => void,
        }
        calls.push(call)
        const at = waiting.findIndex(wait => wait.operation === name)
        if (at !== -1) {
          taken.add(call)
          waiting.splice(at, 1)[0]?.resolve(call)
        }
      })

  const client = {
    'list-cards': operation('list-cards'),
    'read-card': operation('read-card'),
    'submit-reply': operation('submit-reply'),
    'query-submit-reply': operation('query-submit-reply'),
    observe: {
      'observe-cards': (open: unknown, options: ObserveOptions) => {
        const made = observation(open, options)
        observations.push(made.handle)
        return made.frames
      },
    },
  } as unknown as Client

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
