import { stringCell } from './string-cell.ts'
import { z } from 'zod'
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { terminalDdl } from './relational-ddl.ts'
import { TERMINAL_RELATIONAL_MIGRATION } from './relational-migrations.ts'
import { terminalSchema } from './terminal-schema.ts'
import { operationKey } from './encoding.ts'
import { parseJson } from './relational-values.ts'
export default {
  ...TERMINAL_RELATIONAL_MIGRATION,
  up(port) {
    for (const sql of terminalDdl) port.execute(sql, [])
    let after = ''
    for (;;) {
      const row = port.execute(
        'SELECT operation_key,record FROM hi_terminals WHERE operation_key>? ORDER BY operation_key LIMIT 1',
        [after],
      ).rows[0]
      if (!row) break
      const value = terminalSchema.parse(parseJson(row[1])),
        binding = value.binding,
        op = binding.operationRef
      after = z.string().parse(row[0])
      if (operationKey(op) !== after) throw new TypeError('Legacy terminal identity mismatch')
      port.execute(
        'INSERT INTO hi_terminals_v2(tenant_ref,actor_ref,operation_id,operation_key,input_digest,state) VALUES (?,?,?,?,?,?)',
        [
          stringCell(op.tenantRef),
          stringCell(op.actorRef),
          stringCell(op.operationId),
          after,
          binding.inputDigest,
          value.state,
        ],
      )
    }
    const mismatch = port.execute(
      'SELECT 1 FROM hi_terminals WHERE (SELECT count(*) FROM hi_terminals)!=(SELECT count(*) FROM hi_terminals_v2) LIMIT 1',
      [],
    ).rows[0]
    if (mismatch) throw new TypeError('Terminal migration cardinality mismatch')
    port.execute('DROP TABLE hi_terminals', [])
  },
  verify(port) {
    port.execute('SELECT tenant_ref FROM hi_terminals_v2 LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
