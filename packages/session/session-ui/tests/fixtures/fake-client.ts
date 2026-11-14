// A `session/v1` client with no transport: each call is recorded and answered by the test, and the
// observation yields the frames the test pushes. Used by the component test and the demo page.
import type { ClientOf, ObservationEnd } from '@omne-harness/sdk/core'
import type { ObserveSessionFrame, SessionProtocol } from '@omne-harness/session-protocol'

type Client = ClientOf<SessionProtocol>
type Operation = Exclude<keyof Client, 'observe'>
type End = ObservationEnd<SessionProtocol['observations']['observe-session']>

export type Call = Readonly<{
  operation: Operation
  body: unknown
  answer: (value: unknown) => void
}>

export type FakeObservation = {
  /** The opening body: which session it observes. */
  readonly open: unknown
  push(frame: ObserveSessionFrame): void
  end(value: End): void
  readonly aborted: boolean
}

export type FakeClient = Readonly<{
  client: Client
  calls: Call[]
  observations: FakeObservation[]
  /** The next call of this operation, waiting until it is made. */
  next(operation: Operation): Promise<Call>
}>

export function createFakeClient(): FakeClient {
  const calls: Call[] = []
  const observations: FakeObservation[] = []
  const waiting: { operation: Operation; resolve: (call: Call) => void }[] = []
  const taken = new Set<Call>()

  const operation =
    (name: Operation) =>
    (body: unknown): Promise<never> =>
      new Promise(resolve => {
        const call: Call = { operation: name, body, answer: resolve as (value: unknown) => void }
        calls.push(call)
        const at = waiting.findIndex(wait => wait.operation === name)
        if (at !== -1) {
          taken.add(call)
          waiting.splice(at, 1)[0]?.resolve(call)
        }
      })

  function observe(
    open: unknown,
    options: { signal: AbortSignal },
  ): AsyncGenerator<ObserveSessionFrame, End> {
    const queue: ({ frame: ObserveSessionFrame } | { end: End })[] = []
    let wake: (() => void) | null = null
    const observation = {
      open,
      push(frame: ObserveSessionFrame) {
        queue.push({ frame })
        wake?.()
      },
      end(value: End) {
        queue.push({ end: value })
        wake?.()
      },
      get aborted() {
        return options.signal.aborted
      },
    }
    observations.push(observation)
    options.signal.addEventListener('abort', () => wake?.())
    return (async function* () {
      for (;;) {
        if (options.signal.aborted) return { kind: 'aborted' } as const
        const item = queue.shift()
        if (item === undefined) {
          await new Promise<void>(resolve => {
            wake = resolve
          })
          continue
        }
        if ('end' in item) return item.end
        yield item.frame
      }
    })()
  }

  const names: Operation[] = [
    'create-session',
    'query-create-session',
    'send-input',
    'query-send-input',
    'read-history',
    'list-sessions',
    'cancel-run',
    'stop-call',
  ]
  const client = Object.fromEntries(names.map(name => [name, operation(name)])) as Record<
    string,
    unknown
  >
  client['observe'] = { 'observe-session': observe }

  return {
    client: client as Client,
    calls,
    observations,
    next(name) {
      const made = calls.find(call => call.operation === name && !taken.has(call))
      if (made !== undefined) {
        taken.add(made)
        return Promise.resolve(made)
      }
      return new Promise(resolve => waiting.push({ operation: name, resolve }))
    },
  }
}
