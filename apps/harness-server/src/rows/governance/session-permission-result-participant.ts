import {
  governanceExternalWriteBasisFact,
  governanceExternalWriteResultFact,
} from '@omne-harness/governance-local'
import { SESSION_COMMIT_RESULT } from '@omne-harness/session-storage-sql/participants'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  sessionPermissionWriteResult,
  SESSION_PERMISSION_RESULT,
} from './session-permission-result.ts'

export default {
  ...SESSION_PERMISSION_RESULT,
  execute(_facts, port) {
    const result = sessionPermissionWriteResult(
      port.requireFact(governanceExternalWriteBasisFact),
      port.requireFact(SESSION_COMMIT_RESULT),
    )
    if (result === null) return { kind: 'unsupported', basis: { reason: 'session-result-binding' } }
    port.provideFact(governanceExternalWriteResultFact, result)
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
