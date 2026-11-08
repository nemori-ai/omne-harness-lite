import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { EXTERNAL_WRITE_BASIS } from './external-write-stage.ts'
import { governanceExternalWriteBasisFact } from './external-write-protocol.ts'
import { externalWriteBasis } from './external-write-commit.ts'
import { json } from './encoding.ts'

export default {
  participant: EXTERNAL_WRITE_BASIS,
  protocol: governanceExternalWriteBasisFact.protocol,
  execute(facts, port) {
    port.provideFact(
      governanceExternalWriteBasisFact,
      json(externalWriteBasis(port, facts['request'])),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
