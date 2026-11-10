import { z } from 'zod'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { json, stateKey } from './encoding.ts'
import { changesSchema, HANDLER, PROTOCOL, readRequestSchema, type ReadRequest } from './schema.ts'

function read(input: ReadRequest, port: ReadPort) {
  const rows = port.execute(
    'SELECT revision, operation_id, item_id, source_id, kind FROM st_changes WHERE target_key = ? AND revision > ? ORDER BY revision ASC LIMIT ?',
    [stateKey(input.domain.scope, input.target), input.afterRevision, input.limit + 1],
  ).rows
  const changes = rows.slice(0, input.limit).map(row => {
    const common = {
      revision: Number(z.bigint().nonnegative().max(BigInt(Number.MAX_SAFE_INTEGER)).parse(row[0])),
      operationId: row[1],
    }
    return row[4] === 'rebase'
      ? { ...common, kind: 'rebase' }
      : { ...common, kind: z.literal('value').parse(row[4]), itemId: row[2], sourceId: row[3] }
  })
  return changesSchema.parse({
    kind: 'changes',
    changes,
    nextRevision: rows.length > input.limit ? changes.at(-1)?.revision : null,
  })
}
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    try {
      return { kind: 'read', output: json(read(readRequestSchema.parse(input), port)) }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_invalid_read_or_stored_data' }
    }
  },
} satisfies ReadHandlerModule
