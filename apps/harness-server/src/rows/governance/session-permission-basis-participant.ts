import { governanceDefinitionProjectionFact } from '@omne-harness/governance-local'
import { SESSION_COMMIT_BASIS } from '@omne-harness/session-storage-sql/participants'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  sessionPermissionBasisConfigurationSchema,
  sessionPermissionBasisIdentity,
  sessionPermissionWriteBasis,
} from './session-permission-basis.ts'
import { targetSnapshotFact, targetSnapshotSchema } from './target-snapshot.ts'
const configuration = sessionPermissionBasisConfigurationSchema.parse(
  JSON.parse(new URL(import.meta.url).searchParams.get('configuration') ?? 'null'),
)
export default {
  ...sessionPermissionBasisIdentity(configuration),
  execute(facts, port) {
    const basis = sessionPermissionWriteBasis(
      facts,
      configuration.mode === 'clear' ? null : port.requireFact(governanceDefinitionProjectionFact),
      configuration,
      configuration.mode === 'mapped'
        ? targetSnapshotSchema.parse(port.requireFact(targetSnapshotFact))
        : null,
    )
    if (basis === null)
      return { kind: 'failed', diagnostic: 'the Session permission basis does not hold' }
    port.provideFact(SESSION_COMMIT_BASIS, basis)
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
