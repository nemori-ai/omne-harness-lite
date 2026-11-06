import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { RevisionSchema } from '@omne-harness/human-intervention'
import { json } from './encoding.ts'
import { RequestRecordSchema, REQUEST_PROTOCOL } from './request-schema.ts'
import { POOL_HANDLER, PoolScanSchema } from './pool-schema.ts'

export default {
  handler: POOL_HANDLER,
  protocol: REQUEST_PROTOCOL,
  read(input, port) {
    const parsed = PoolScanSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'hitl_pool_query' }
    const { tenantRef, after } = parsed.data
    const version = port.execute(
      'SELECT revision FROM hi_request_versions WHERE tenant_ref = ? LIMIT 1',
      [tenantRef],
    ).rows[0]
    const revision = RevisionSchema.parse(version ? version[0] : '0')
    const row = port.execute(
      'SELECT CAST(sequence AS TEXT), record FROM hi_requests WHERE tenant_ref = ? AND sequence > ? ORDER BY sequence LIMIT 1',
      [tenantRef, BigInt(after)],
    ).rows[0]
    if (!row) return { kind: 'read', output: json({ revision, entry: null }) }
    const stored = row[1]
    if (typeof stored !== 'string') return { kind: 'failed', diagnostic: 'hitl_pool_record' }
    return {
      kind: 'read',
      output: json({
        revision,
        entry: { sequence: row[0], request: RequestRecordSchema.parse(JSON.parse(stored)) },
      }),
    }
  },
} satisfies ReadHandlerModule
