import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import type { CallOptions, ClientOf, ObserveOptions } from '@omne-harness/sdk/core'
import type { InboxEnd } from '../../src/model/inbox-machine.ts'

type Client = ClientOf<NotificationProtocol>
type Operation = Exclude<keyof Client, 'observe'>
type About = 'inbox' | 'catalog'

export type Call = Readonly<{
  operation: Operation
  body: any
  answer: (value: unknown) => void
  fail: (error: Error) => void
}>

export type Observation = Readonly<{
  open: unknown
  signal: AbortSignal
  frame(about?: About): void
  end(value: InboxEnd): void
  fail(): void
}>

type Item =
  | Readonly<{ kind: 'frame'; about: About }>
  | Readonly<{ kind: 'end'; value: InboxEnd }>
  | Readonly<{ kind: 'throw' }>

function observation(open: unknown, options: ObserveOptions) {
  const queue: Item[] = []
  let wake: (() => void) | null = null
  const push = (item: Item) => {
    queue.push(item)
    wake?.()
    wake = null
  }
  options.signal.addEventListener('abort', () => push({ kind: 'end', value: { kind: 'aborted' } }))
  async function* frames(): AsyncGenerator<{ kind: 'changed'; about: About }, InboxEnd> {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(resolve => (wake = resolve))
      const item = queue.shift()!
      if (item.kind === 'throw') throw new Error('stream broke')
      if (item.kind === 'end') return item.value
      yield { kind: 'changed', about: item.about }
    }
  }
  const handle: Observation = {
    open,
    signal: options.signal,
    frame: (about = 'inbox') => push({ kind: 'frame', about }),
    end: value => push({ kind: 'end', value }),
    fail: () => push({ kind: 'throw' }),
  }
  return { handle, frames: frames() }
}

/** A protocol client whose calls wait to be answered by the test. */
export function createFakeClient() {
  const calls: Call[] = []
  const observations: Observation[] = []
  const taken = new Set<Call>()
  const waiting: { operation: Operation; resolve: (call: Call) => void }[] = []

  const operation =
    (name: Operation) =>
    (body: unknown, _options?: CallOptions): Promise<never> =>
      new Promise((resolve, reject) => {
        const call: Call = { operation: name, body, answer: resolve as never, fail: reject }
        calls.push(call)
        const at = waiting.findIndex(wait => wait.operation === name)
        if (at !== -1) {
          taken.add(call)
          waiting.splice(at, 1)[0]?.resolve(call)
        }
      })

  const client = {
    'list-inbox': operation('list-inbox'),
    'read-notification': operation('read-notification'),
    mark: operation('mark'),
    'list-sources': operation('list-sources'),
    observe: {
      'observe-changes': (open: unknown, options: ObserveOptions) => {
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
    /** The next call of an operation that the test has not taken yet. */
    next(name: Operation): Promise<Call> {
      const ready = calls.find(call => call.operation === name && !taken.has(call))
      if (ready !== undefined) {
        taken.add(ready)
        return Promise.resolve(ready)
      }
      return new Promise(resolve => waiting.push({ operation: name, resolve }))
    },
  }
}
