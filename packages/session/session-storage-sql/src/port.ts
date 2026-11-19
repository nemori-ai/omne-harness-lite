import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { commit, queryControlOperation, queryOperation } from './commit.ts'
import type { Context } from './context.ts'
import { directoryOf } from './directory.ts'
import { commitEntries } from './entries.ts'
import { commitLog } from './log.ts'
import {
  historyFace,
  pending,
  readCall,
  readInput,
  readModelSelection,
  readWork,
  readCurrentScope,
  references,
  releasedScopes,
} from './reads.ts'

export function portOf<P>(context: Context<P>): SessionTransactionPort<P> {
  return {
    commit: (input => commit(context, input)) as SessionTransactionPort<P>['commit'],
    readWork: input => readWork(context, input),
    readCurrentScope: input => readCurrentScope(context, input),
    readCall: input => readCall(context, input),
    readInput: input => readInput(context, input),
    queryOperation: input => queryOperation(context, input),
    queryControlOperation: input => queryControlOperation(context, input),
    readModelSelection: input => readModelSelection(context, input),
    commitEntries: input => commitEntries(context, input),
    commitLog: input => commitLog(context, input),
    history: historyFace(context),
    pending: input => pending(context, input),
    directory: directoryOf(context),
    references: input => references(context, input),
    releasedScopes: input => releasedScopes(context, input),
  }
}
