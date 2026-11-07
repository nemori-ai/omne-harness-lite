import { z } from 'zod'
import { GovernanceOperationRefSchema } from '@omne-harness/governance-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { recordSchema } from './operation-schema.ts'
import { readOperation } from './operation.ts'
import { json } from './encoding.ts'
export const OPERATION_REFERENCE_HANDLER = {
  handler: 'governance.operation-reference',
  protocol: 'governance-operation-reference/1',
}
export const operationReferenceObservationSchema = z.strictObject({
  ref: GovernanceOperationRefSchema,
  record: recordSchema.nullable(),
})
export default {
  ...OPERATION_REFERENCE_HANDLER,
  read(raw, port) {
    const ref = GovernanceOperationRefSchema.parse(raw)
    const found = readOperation(port, ref)
    return {
      kind: 'read',
      output: json({ ref, record: found.kind === 'found' ? found.record : null }),
    }
  },
} satisfies ReadHandlerModule
