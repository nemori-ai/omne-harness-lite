import type { AgentJournal, Failure } from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'

type Mutation =
  | 'open'
  | 'commit'
  | 'control'
  | 'recordControl'
  | 'commitSettlement'
  | 'prepareFinish'
  | 'tryFinish'

export type OriginalWrite<P> = {
  [K in Mutation]: Readonly<{ method: K; input: Parameters<AgentJournal<P>[K]>[0] }>
}[Mutation]

type Attempt<P> = <T>(
  original: OriginalWrite<P>,
  invoke: () => Promise<Outcome<T, Failure>>,
) => Promise<Outcome<T, Failure>>

export async function attemptWrite<P, T>(
  original: OriginalWrite<P>,
  invoke: () => Promise<Outcome<T, Failure>>,
): Promise<Outcome<T, Failure>> {
  try {
    return await invoke()
  } catch {
    return fail({ kind: 'commit-unknown', operation: original.input.operation })
  }
}

export function originalJournal<P>(journal: AgentJournal<P>, attempt: Attempt<P>): AgentJournal<P> {
  return {
    ...journal,
    open: input => attempt({ method: 'open', input }, () => journal.open(input)),
    commit: input => attempt({ method: 'commit', input }, () => journal.commit(input)),
    control: input => attempt({ method: 'control', input }, () => journal.control(input)),
    recordControl: input =>
      attempt({ method: 'recordControl', input }, () => journal.recordControl(input)),
    commitSettlement: input =>
      attempt({ method: 'commitSettlement', input }, () => journal.commitSettlement(input)),
    prepareFinish: input =>
      attempt({ method: 'prepareFinish', input }, () => journal.prepareFinish(input)),
    tryFinish: input => attempt({ method: 'tryFinish', input }, () => journal.tryFinish(input)),
  }
}
