import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { ACTIVATION_PLAN, businessRequestSchema } from './activation-schema.ts'
import { EXTERNAL_WRITE_TERMINAL } from './external-write-stage.ts'
import {
  GovernanceExternalWriteBasisSchema,
  governanceExternalWriteBasisFact,
  governanceExternalWriteResultFact,
} from './external-write-protocol.ts'
import { externalWriteResult } from './external-write-commit.ts'
import { equal, json } from './encoding.ts'

export default {
  participant: EXTERNAL_WRITE_TERMINAL,
  protocol: governanceExternalWriteResultFact.protocol,
  execute(facts, port) {
    const request = businessRequestSchema.parse(facts['request'])
    const basis = GovernanceExternalWriteBasisSchema.parse(
      port.requireFact(governanceExternalWriteBasisFact),
    )
    if (!equal(request, basis.request)) throw new Error('External write terminal original mismatch')
    const result = externalWriteResult(basis, port.requireFact(governanceExternalWriteResultFact))
    port.provideFact(
      ACTIVATION_PLAN,
      json({
        kind: 'external-write',
        request,
        epoch: basis.epoch,
        transactionDomain: basis.transactionDomain,
        result,
      }),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
