// The transaction port over one context. The public port and every delegated view are this one
// surface; they differ only in the access step of their context (see `qualify`).
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { commit, queryControlOperation, queryOperation } from './commit.ts'
import type { Context } from './context.ts'
import { commitEntries } from './entries.ts'
import {
  historyFace,
  pending,
  readInput,
  readModelSelection,
  readWork,
  references,
  releasedScopes,
} from './reads.ts'

export function portOf<P>(context: Context<P>): SessionTransactionPort<P> {
  return {
    commit: (input => commit(context, input)) as SessionTransactionPort<P>['commit'],
    readWork: input => readWork(context, input),
    readInput: input => readInput(context, input),
    queryOperation: input => queryOperation(context, input),
    queryControlOperation: input => queryControlOperation(context, input),
    readModelSelection: input => readModelSelection(context, input),
    commitEntries: input => commitEntries(context, input),
    history: historyFace(context),
    pending: input => pending(context, input),
    references: input => references(context, input),
    releasedScopes: input => releasedScopes(context, input),
  }
}
