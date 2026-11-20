import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseDefinitionReadInput, type DefinitionReadOutput } from './facts.ts'
import {
  DEFINITION_HELD_DIGESTS,
  DEFINITION_READ_HANDLER,
  DEFINITION_READ_ROWS,
  PROTOCOL,
} from './schema.ts'
import { oneRow, packed, rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: DEFINITION_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const asked = parseDefinitionReadInput(input)
    if (asked === null) return { kind: 'failed', diagnostic: 'not a definition read' }
    if ('digests' in asked) {
      if (asked.digests.length > DEFINITION_HELD_DIGESTS)
        return { kind: 'failed', diagnostic: 'too many definitions in one read' }
      const held = asked.digests.filter(
        digest =>
          oneRow(
            port,
            'SELECT 1 AS held FROM tl_definition WHERE tenant = ? AND digest = ? LIMIT 1',
            [asked.tenant, digest],
          ) !== undefined,
      )
      const output: DefinitionReadOutput = { held }
      return { kind: 'read', output }
    }
    const rows = rowsOf(
      port,
      `SELECT digest, body FROM tl_definition WHERE tenant = ? AND adoption = ?
       ORDER BY digest LIMIT ?`,
      [asked.tenant, asked.adoption, BigInt(DEFINITION_READ_ROWS)],
    )
    const output: DefinitionReadOutput = {
      definitions: rows.map(row => ({
        digest: text(row['digest']),
        definition: JSON.parse(packed(row['body'])) as JsonValue,
      })),
    }
    return { kind: 'read', output }
  },
}
export default handler
