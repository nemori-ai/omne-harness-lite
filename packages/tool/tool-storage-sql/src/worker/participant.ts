// The `tool` participant module. It runs inside the provider's write transaction, so every command
// is atomic: a ledger commit checks the domain revision and its read-set assertions, then applies
// its writes in input order; a body command keeps, seals or deletes the chunks of one body. A
// stopping reply rolls the whole command back. It never begins, commits or rolls back, and keeps no state between
// calls.
import {
  packText,
  type ParticipantModule,
  type ParticipantPort,
  type ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import {
  parseFacts,
  type LedgerFacts,
  type LedgerWriteFact,
  type ParticipantAnswer,
  type StopBasis,
} from './facts.ts'
import { commitBody } from './participant-body.ts'
import { PARTICIPANT, PROTOCOL } from './schema.ts'
import { oneRow, text } from './support.ts'

const participated = (answer: ParticipantAnswer): ParticipantReply => ({
  kind: 'participated',
  response: answer,
})
const stopped = (basis: StopBasis): ParticipantReply => ({ kind: 'conflict', basis })

/** The revision of a domain that was never committed (`INITIAL_REVISION` of the ledger). */
const INITIAL_REVISION = '0'

/** The revision of one domain of the tenant, `INITIAL_REVISION` when it was never committed. */
function revisionOf(port: ParticipantPort, domain: readonly [string, string, string]): string {
  const row = oneRow(
    port,
    'SELECT revision FROM tl_domain WHERE tenant = ? AND kind = ? AND name = ? LIMIT 1',
    domain,
  )
  return row === undefined ? INITIAL_REVISION : text(row['revision'])
}

type Domain = readonly [tenant: string, kind: string, name: string]

/**
 * Writes one record. The fixed part is written only when the command gives it; a `kept` put
 * changes the other part alone and stops when the store holds no fixed part to keep.
 */
function put(
  port: ParticipantPort,
  domain: Domain,
  write: Extract<LedgerWriteFact, { op: 'put' }>,
): StopBasis | null {
  const record = packText(JSON.stringify(write.record))
  if (write.fixed?.kind === 'kept') {
    const held = oneRow(
      port,
      `SELECT 1 AS held FROM tl_record
       WHERE tenant = ? AND kind = ? AND name = ? AND key = ? AND fixed IS NOT NULL LIMIT 1`,
      [...domain, write.key],
    )
    if (held === undefined) return { reason: 'fixed-missing' }
    port.execute(
      'UPDATE tl_record SET record = ? WHERE tenant = ? AND kind = ? AND name = ? AND key = ?',
      [record, ...domain, write.key],
    )
    return null
  }
  const fixed = write.fixed === undefined ? null : packText(JSON.stringify(write.fixed.value))
  port.execute(
    `INSERT INTO tl_record (tenant, kind, name, key, record, fixed) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant, kind, name, key)
     DO UPDATE SET record = excluded.record, fixed = excluded.fixed`,
    [...domain, write.key, record, fixed],
  )
  return null
}

function commitLedger(facts: LedgerFacts, port: ParticipantPort): ParticipantReply {
  const domain = [facts.tenant, facts.kind, facts.name] as const
  const current = revisionOf(port, domain)
  if (current !== facts.expected) return stopped({ reason: 'revision', current })
  // The assertions read the same transaction as the writes: nothing of the tenant moves between.
  for (const assertion of facts.asserts)
    if (revisionOf(port, [facts.tenant, assertion.kind, assertion.name]) !== assertion.revision)
      return stopped({ reason: 'assertion', current })
  // A drop leaves no row of the domain: its records, its due entries and its revision.
  if (facts.writes.some(write => write.op === 'drop')) {
    // The store refuses a malformed drop before it sends it; one that arrives is not this protocol.
    if (facts.writes.length !== 1 || facts.revision !== INITIAL_REVISION)
      return { kind: 'unsupported', basis: { reason: 'facts' } }
    for (const table of ['tl_record', 'tl_due', 'tl_domain'])
      port.execute(`DELETE FROM ${table} WHERE tenant = ? AND kind = ? AND name = ?`, [...domain])
    // 调用域整域删除后没有待推进的工作：它的待办标记一并删掉。
    if (facts.kind === 'call')
      port.execute('DELETE FROM tl_pending WHERE tenant = ? AND call = ?', [
        facts.tenant,
        facts.name,
      ])
    return participated({ kind: 'committed' })
  }
  for (const write of facts.writes)
    switch (write.op) {
      case 'drop':
        throw new Error('a drop is handled before the other writes')
      case 'put': {
        const stop = put(port, domain, write)
        if (stop !== null) return stopped(stop)
        break
      }
      case 'delete':
        port.execute(
          'DELETE FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ?',
          [...domain, write.key],
        )
        break
      case 'schedule':
        port.execute(
          `INSERT INTO tl_due (tenant, kind, name, key, due_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tenant, kind, name, key) DO UPDATE SET due_at = excluded.due_at`,
          [...domain, write.key, write.dueAt],
        )
        break
      case 'unschedule':
        port.execute('DELETE FROM tl_due WHERE tenant = ? AND kind = ? AND name = ? AND key = ?', [
          ...domain,
          write.key,
        ])
        break
      default: {
        const exhaustive: never = write
        return exhaustive
      }
    }
  port.execute(
    `INSERT INTO tl_domain (tenant, kind, name, revision) VALUES (?, ?, ?, ?)
     ON CONFLICT (tenant, kind, name) DO UPDATE SET revision = excluded.revision`,
    [...domain, facts.revision],
  )
  // 待办标记与记录同一事务：命令回滚时两者都不落地。
  if (facts.pending === true)
    port.execute('INSERT INTO tl_pending (tenant, call) VALUES (?, ?) ON CONFLICT DO NOTHING', [
      facts.tenant,
      facts.name,
    ])
  else if (facts.pending === false)
    port.execute('DELETE FROM tl_pending WHERE tenant = ? AND call = ?', [facts.tenant, facts.name])
  return participated({ kind: 'committed' })
}

const participant: ParticipantModule = {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(input, port) {
    const facts = parseFacts(input)
    if (facts === null) return { kind: 'unsupported', basis: { reason: 'facts' } }
    switch (facts.intent) {
      case 'ledger':
        return commitLedger(facts, port)
      case 'body-put':
      case 'body-seal':
      case 'body-delete':
        return commitBody(facts, port)
      default: {
        const exhaustive: never = facts
        return exhaustive
      }
    }
  },
}
export default participant
