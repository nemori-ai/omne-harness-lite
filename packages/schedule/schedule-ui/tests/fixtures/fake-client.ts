import type { CallOptions } from '@omne-harness/sdk/core'

export type Call = Readonly<{
  operation: string
  body: unknown
  options: CallOptions | undefined
  answer: (value: unknown) => void
}>

export type FakeClient<C> = Readonly<{
  client: C
  calls: Call[]
  next(operation: string): Promise<Call>
}>

/** A protocol client whose every call waits until the test answers it. */
export function createFakeClient<C>(operations: readonly string[]): FakeClient<C> {
  const calls: Call[] = []
  const taken = new Set<Call>()
  const waiting: { operation: string; resolve: (call: Call) => void }[] = []
  const operation =
    (name: string) =>
    (body: unknown, options?: CallOptions): Promise<never> =>
      new Promise(resolve => {
        const call: Call = {
          operation: name,
          body,
          options,
          answer: resolve as (v: unknown) => void,
        }
        calls.push(call)
        const at = waiting.findIndex(wait => wait.operation === name)
        if (at !== -1) {
          taken.add(call)
          waiting.splice(at, 1)[0]?.resolve(call)
        }
      })
  const client = Object.fromEntries([
    ...operations.map(name => [name, operation(name)]),
    ['observe', {}],
  ]) as C
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
