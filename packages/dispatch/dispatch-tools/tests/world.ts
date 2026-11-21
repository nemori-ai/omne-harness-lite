import type { CallContext, Dispatch, Dispatching, Outcome } from '@omne-harness/dispatch-contract'
import { acceptedDispatch } from '@omne-harness/dispatch/testing'
import { bindAgents, type AgentsCallSource, type SessionsAnswer } from '../src/port.ts'

export const TENANT = 'tenant-a' as CallContext['tenant']
export const SELF = 'a'.repeat(64) as CallContext['session']
export const CONTEXT: CallContext = { tenant: TENANT, subject: { who: 'work' }, session: SELF }
export const done = <T>(value: T, recalled = false): Outcome<T, never> => ({
  kind: 'done',
  value,
  recalled,
})
export const refused = <R>(reason: R): Outcome<never, R> => ({ kind: 'refused', reason })
export const dispatchOf = (change: Partial<Dispatch> = {}): Dispatch =>
  acceptedDispatch(1, { tenant: TENANT, dispatcher: SELF, call: 'call-1', ...change })

type Script = {
  [K in keyof Dispatching]?: (...input: Parameters<Dispatching[K]>) => ReturnType<Dispatching[K]>
}

/** The services of one call, each answering what the test scripted and recording what it was asked. */
export function world(script: Script = {}, change: Partial<AgentsCallSource> = {}) {
  const asked: { name: string; input: readonly unknown[] }[] = []
  const face = (name: keyof Dispatching) =>
    (async (...input: unknown[]) => {
      asked.push({ name, input })
      const answer = script[name] as ((...given: unknown[]) => unknown) | undefined
      if (answer === undefined) throw new Error(`the test scripted no ${name}`)
      return answer(...input)
    }) as never
  const dispatching: Dispatching = {
    dispatch: face('dispatch'),
    withdraw: face('withdraw'),
    report: face('report'),
    message: face('message'),
    show: face('show'),
    list: face('list'),
  }
  const pages: SessionsAnswer[] = []
  const filters: unknown[] = []
  const bound = bindAgents({
    tenant: TENANT,
    call: 'call-1',
    dispatching: () => dispatching,
    context: async () => CONTEXT,
    targets: async () => [
      { name: 'coding', type: 'master', summary: 'A coding agent.' },
      { name: 'assistant', type: 'non-master', summary: 'A general assistant.' },
    ],
    sessions: async filter => {
      filters.push(filter)
      return pages.shift() ?? { failure: 'unavailable' }
    },
    ...change,
  })
  const signal = new AbortController().signal
  return {
    asked,
    pages,
    filters,
    bound,
    context: { signal },
    made: (name: string) => asked.filter(a => a.name === name).map(a => a.input),
  }
}
