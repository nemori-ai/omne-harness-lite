import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { CallOptions, ClientOf } from '@omne-harness/sdk/core'

type Client = ClientOf<AssetsProtocol>
type Operation = Exclude<keyof Client, 'observe'>

export type Call = Readonly<{
  operation: Operation
  body: unknown
  options: CallOptions | undefined
  answer: (value: unknown) => void
  fail: (error: unknown) => void
}>

/** One opened observation: the test sends its frames and ends it. */
export type Stream = Readonly<{
  open: unknown
  signal: AbortSignal
  frame: () => void
  end: () => void
}>

export type FakeClient = Readonly<{
  client: Client
  calls: Call[]
  streams: Stream[]
  next(operation: Operation): Promise<Call>
  nextStream(): Promise<Stream>
}>

const OPERATIONS: readonly Operation[] = [
  'list-settings',
  'describe-setting',
  'set-setting',
  'clear-setting',
  'list-categories',
  'describe-category',
  'list-assets',
  'describe-asset',
  'create-asset',
  'begin-asset-upload',
  'append-asset-upload',
  'commit-asset-upload',
  'set-asset-enabled',
  'remove-asset',
  'query-asset-operation',
]

function waiter<T>() {
  const ready: T[] = []
  const taken = new Set<T>()
  const waiting: { accepts: (item: T) => boolean; resolve: (item: T) => void }[] = []
  return {
    offer(item: T) {
      ready.push(item)
      const at = waiting.findIndex(wait => wait.accepts(item))
      if (at === -1) return
      taken.add(item)
      waiting.splice(at, 1)[0]?.resolve(item)
    },
    take(accepts: (item: T) => boolean): Promise<T> {
      const found = ready.find(item => accepts(item) && !taken.has(item))
      if (found !== undefined) {
        taken.add(found)
        return Promise.resolve(found)
      }
      return new Promise(resolve => waiting.push({ accepts, resolve }))
    },
  }
}

function openStream(open: unknown, signal: AbortSignal, offer: (stream: Stream) => void) {
  const queue: ('frame' | 'end')[] = []
  let wake: (() => void) | undefined
  const push = (item: 'frame' | 'end') => {
    queue.push(item)
    wake?.()
  }
  signal.addEventListener('abort', () => push('end'), { once: true })
  offer({ open, signal, frame: () => push('frame'), end: () => push('end') })
  return (async function* () {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(resolve => (wake = resolve))
      if (queue.shift() === 'end') return { kind: 'ended', reason: 'unavailable' }
      yield { kind: 'changed' }
    }
  })()
}

export function createFakeClient(): FakeClient {
  const calls: Call[] = []
  const streams: Stream[] = []
  const pending = waiter<Call>()
  const opened = waiter<Stream>()

  const operation =
    (name: Operation) =>
    (body: unknown, options?: CallOptions): Promise<never> =>
      new Promise((resolve, reject) => {
        const call: Call = {
          operation: name,
          body,
          options,
          answer: resolve as (value: unknown) => void,
          fail: reject,
        }
        calls.push(call)
        pending.offer(call)
      })

  const client = {
    ...Object.fromEntries(OPERATIONS.map(name => [name, operation(name)])),
    observe: {
      'observe-assets': (open: unknown, options: { signal: AbortSignal }) =>
        openStream(open, options.signal, stream => {
          streams.push(stream)
          opened.offer(stream)
        }),
    },
  } as unknown as Client

  return {
    client,
    calls,
    streams,
    next: name => pending.take(call => call.operation === name),
    nextStream: () => opened.take(() => true),
  }
}
