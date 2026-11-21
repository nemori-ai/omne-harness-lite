import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import {
  CATALOG_CAPTURES,
  CATALOG_CAPTURE_PAGE,
  catalogCapturesRequestSchema,
  catalogTerminalSchema,
} from './catalog-terminal-schema.ts'

export default {
  ...CATALOG_CAPTURES,
  read(raw, port) {
    const { after } = catalogCapturesRequestSchema.parse(raw)
    const rows = port.execute(
      'SELECT operation_key, record FROM st_catalog_terminals WHERE operation_key > ? ORDER BY operation_key LIMIT ?',
      [after ?? '', CATALOG_CAPTURE_PAGE + 1],
    ).rows
    const items = rows.slice(0, CATALOG_CAPTURE_PAGE).map(([key, record]) => ({
      key: String(key),
      record: catalogTerminalSchema.parse(JSON.parse(String(record))),
    }))
    const next = rows.length > CATALOG_CAPTURE_PAGE ? (items.at(-1)?.key ?? null) : null
    return { kind: 'read', output: json({ items, next }) }
  },
} satisfies ReadHandlerModule
