import { z } from 'zod'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { bindingSchema, recordSchema } from './operation-schema.ts'
import { boundOperation } from './operation.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { standingCustodySchema } from './standing-schema.ts'
import { json } from './encoding.ts'
import { readGovernanceSource, sourceCustodySchema } from './source-custody.ts'

export const OPERATION_HANDLER = {
  handler: 'governance.operation',
  protocol: 'governance-operation-read/1',
}
export const observationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found'),
    record: recordSchema,
    standing: standingCustodySchema.nullable(),
    source: sourceCustodySchema,
  }),
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.literal('operation') }),
])
export type OperationObservation = z.infer<typeof observationSchema>
export default {
  ...OPERATION_HANDLER,
  read(raw, port) {
    const binding = bindingSchema.parse(raw)
    const found = boundOperation(port, binding)
    if (found.kind !== 'found') return { kind: 'read', output: json(found) }
    const custody = readGovernanceStanding(port, binding)
    if (custody.kind !== 'unplanned' && !('request' in custody))
      throw new Error('Governance custody observation changed')
    const source = sourceCustodySchema.parse(readGovernanceSource(port, binding))
    return {
      kind: 'read',
      output: json({ ...found, standing: custody.kind === 'unplanned' ? null : custody, source }),
    }
  },
} satisfies ReadHandlerModule
