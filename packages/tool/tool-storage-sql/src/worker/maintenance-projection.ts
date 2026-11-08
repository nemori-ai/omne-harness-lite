import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import type { LedgerFacts } from './facts.ts'
import { isObject, oneRow, text } from './support.ts'

export function projectMaterialMaintenance(facts: LedgerFacts, port: ParticipantPort): void {
  if (facts.kind !== 'call') return
  const row = oneRow(
    port,
    "SELECT record FROM tl_record WHERE tenant = ? AND kind = 'call' AND name = ? AND key = 'material-maintenance-hint' LIMIT 1",
    [facts.tenant, facts.name],
  )
  let kind = 'unknown'
  let due: string | null = null
  if (row !== undefined) {
    const record: JsonValue = JSON.parse(text(row['record']))
    const hint = isObject(record) ? record['hint'] : undefined
    if (!isObject(record) || record['kind'] !== 'material-maintenance-hint' || !isObject(hint))
      throw new TypeError('invalid material maintenance hint')
    if (hint['kind'] === 'none' || hint['kind'] === 'ready') kind = hint['kind']
    else if (
      hint['kind'] === 'due' &&
      typeof hint['at'] === 'string' &&
      'ok' in decodeToolMaterialInstant(hint['at'])
    ) {
      kind = 'due'
      due = hint['at']
    } else throw new TypeError('invalid material maintenance hint')
  }
  port.execute(
    `INSERT INTO tl_material_maintenance (tenant, call, hint, due_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (tenant, call) DO UPDATE SET hint = excluded.hint, due_at = excluded.due_at`,
    [facts.tenant, facts.name, kind, due],
  )
}
