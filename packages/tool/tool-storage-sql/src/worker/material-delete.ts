import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import type { MaterialDelete } from './material-facts.ts'
import { oneRow, text } from './support.ts'

const conflict = (): ParticipantReply => ({ kind: 'conflict', basis: { reason: 'material' } })
const participated = (response: JsonValue): ParticipantReply => ({ kind: 'participated', response })

export function deleteMaterial(facts: MaterialDelete, port: ParticipantPort): ParticipantReply {
  const key = [facts.tenant, facts.call, facts.material]
  const current = oneRow(
    port,
    'SELECT state, delete_operation, delete_digest, receipt FROM tl_material WHERE tenant = ? AND call = ? AND material = ? LIMIT 1',
    key,
  )
  if (current?.['delete_operation'] != null) {
    if (
      text(current['delete_operation']) !== facts.operation ||
      text(current['delete_digest']) !== facts.digest
    )
      return conflict()
    const receipt: JsonValue = JSON.parse(text(current['receipt']))
    if (text(current['state']) === 'deleted') return participated({ kind: 'deleted', receipt })
    if (facts.intent === 'material-fence') return participated({ kind: 'pending' })
    port.execute(
      `DELETE FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? AND idx IN
      (SELECT idx FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? ORDER BY idx LIMIT 128)`,
      [...key, ...key],
    )
    const remaining = oneRow(
      port,
      'SELECT idx FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? LIMIT 1',
      key,
    )
    if (remaining !== undefined) return participated({ kind: 'pending' })
    port.execute(
      "UPDATE tl_material SET state = 'deleted', descriptor = NULL WHERE tenant = ? AND call = ? AND material = ?",
      key,
    )
    return participated({ kind: 'deleted', receipt })
  }
  if (facts.intent !== 'material-fence') return conflict()
  if (current === undefined)
    port.execute(
      `INSERT INTO tl_material
      (tenant, call, material, operation, digest, state, delete_operation, delete_digest, receipt)
      VALUES (?, ?, ?, '', '', 'deleting', ?, ?, ?)`,
      [...key, facts.operation, facts.digest, JSON.stringify(facts.receipt)],
    )
  else
    port.execute(
      `UPDATE tl_material SET state = 'deleting', delete_operation = ?, delete_digest = ?, receipt = ?
      WHERE tenant = ? AND call = ? AND material = ?`,
      [facts.operation, facts.digest, JSON.stringify(facts.receipt), ...key],
    )
  return participated({ kind: 'pending' })
}
