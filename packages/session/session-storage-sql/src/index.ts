// The Session storage over the SQL storage contract. The root exports the port factory and the
// static materials. It imports the SQL contract only through its public entries, and it builds no
// Cordis service: the session storage composite belongs to the application.
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { fail } from '@omne-harness/operation-result'
import { commit, queryControlOperation, queryOperation } from './commit.ts'
import { contextOf, unavailable, type SessionStorageOptions } from './context.ts'
import {
  historyFace,
  pending,
  readInput,
  readModelSelection,
  readWork,
  references,
  releasedScopes,
} from './reads.ts'

export type { SessionStorageOptions } from './context.ts'
export {
  SESSION_PARTICIPANT,
  sessionStorageMaterials,
  type SessionStorageMaterials,
} from './materials.ts'

export function createSessionStorage<P>(
  options: SessionStorageOptions<P>,
): SessionTransactionPort<P> {
  const context = contextOf(options)
  return {
    commit: (input => commit(context, input)) as SessionTransactionPort<P>['commit'],
    readWork: input => readWork(context, input),
    readInput: input => readInput(context, input),
    queryOperation: input => queryOperation(context, input),
    queryControlOperation: input => queryControlOperation(context, input),
    readModelSelection: input => readModelSelection(context, input),
    // The pure range check of the entries interpretation is not in session-contract yet, so the
    // storage cannot judge a range. It refuses; it never answers success for an unchecked range.
    commitEntries: () =>
      Promise.resolve(
        fail(unavailable('entries interpretation has no pure range check in session-contract')),
      ),
    history: historyFace(context),
    pending: input => pending(context, input),
    references: input => references(context, input),
    releasedScopes: input => releasedScopes(context, input),
  }
}
