import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import type { CallOptions, ClientOf } from '@omne-harness/sdk/core'

type Client = ClientOf<HumanInterventionProtocol>
type Operation = Exclude<keyof Client, 'observe'>

export type Call = Readonly<{
  operation: Operation
  body: unknown
  options: CallOptions | undefined
  answer: (value: unknown) => void
}>

export type FakeClient = Readonly<{
  client: Client
  calls: Call[]
  next(operation: Operation): Promise<Call>
}>

export function createFakeClient(): FakeClient {
  const calls: Call[] = []
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
    observe: {},
  } as unknown as Client

  return {
    client,
    calls,
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
