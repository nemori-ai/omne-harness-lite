import type {
  ActionId,
  AgentExecutionId,
  NestedActionAdmission,
  NestedActionVerdict,
} from '@omne-harness/agent-contract'
import { canonical } from './canonical.ts'
import type { NestedRequest } from './loop/nested.ts'

type Asked<P> = Parameters<NestedActionAdmission<P>['admit']>[0]
type Entry = {
  readonly execution: AgentExecutionId
  readonly request: NestedRequest
  readonly target: string
  readonly answered: Promise<NestedActionVerdict>
  withdrawn: boolean
}

const UNANSWERED: NestedActionVerdict = {
  kind: 'unanswerable',
  diagnostic: 'the execution is not running on this runtime',
}

/** What programs asked and the run has not answered. It is memory only: a position asked again is judged from the record. */
export function nestedInbox(
  running: (execution: AgentExecutionId) => boolean,
  poke: (execution: AgentExecutionId) => void,
) {
  const entries = new Map<string, Entry>()
  const keyOf = (execution: AgentExecutionId, parent: ActionId, ordinal: number) =>
    canonical([execution, parent, ordinal])
  return {
    pending: (execution: AgentExecutionId): readonly NestedRequest[] =>
      [...entries.values()]
        .filter(entry => entry.execution === execution)
        .map(entry => entry.request),
    stopped(execution: AgentExecutionId): void {
      const own = [...entries.values()].filter(entry => entry.execution === execution)
      for (const entry of own) entry.request.answer(UNANSWERED)
    },
    /** The face a caller sees: it must be allowed to reach this execution before it is heard. */
    guarded<P>(allowed: (input: Asked<P>) => Promise<object>): NestedActionAdmission<P> {
      const admit = this.admit
      return {
        admit: async input =>
          'failure' in (await allowed(input))
            ? { kind: 'denied', reason: 'the caller may not ask for this execution' }
            : admit(input),
      }
    },
    admit(input: Omit<Asked<unknown>, 'principal' | 'tenant'>): Promise<NestedActionVerdict> {
      const { execution, parent, ordinal, signal } = input
      if (!running(execution)) return Promise.resolve(UNANSWERED)
      const key = keyOf(execution, parent, ordinal)
      const target = canonical(input.target)
      const known = entries.get(key)
      if (known !== undefined)
        return known.target === target
          ? known.answered
          : Promise.resolve({
              kind: 'denied',
              reason: 'this position already asked for another action',
            })
      const settled = Promise.withResolvers<NestedActionVerdict>()
      const entry: Entry = {
        execution,
        target,
        answered: settled.promise,
        withdrawn: signal.aborted,
        request: {
          parent,
          ordinal,
          target: input.target,
          withdrawn: () => entry.withdrawn,
          answer(verdict) {
            if (entries.get(key) === entry) entries.delete(key)
            signal.removeEventListener('abort', withdraw)
            settled.resolve(verdict)
          },
        },
      }
      const withdraw = () => {
        entry.withdrawn = true
        poke(execution)
      }
      entries.set(key, entry)
      signal.addEventListener('abort', withdraw, { once: true })
      poke(execution)
      return settled.promise
    },
  }
}
