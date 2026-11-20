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
import {
  commitDefinitionPut,
  definitionHeld,
  ensureDefinitions,
  releaseDefinitions,
} from './participant-definitions.ts'
import { LEDGER_READ_ROWS, PARTICIPANT, PROTOCOL } from './schema.ts'
import { oneRow, rowsOf, text } from './support.ts'

const participated = (answer: ParticipantAnswer): ParticipantReply => ({
  kind: 'participated',
  response: answer,
})
const stopped = (basis: StopBasis): ParticipantReply => ({ kind: 'conflict', basis })

const INITIAL_REVISION = '0'

function revisionOf(port: ParticipantPort, domain: readonly [string, string, string]): string {
  const row = oneRow(
    port,
    'SELECT revision FROM tl_domain WHERE tenant = ? AND kind = ? AND name = ? LIMIT 1',
    domain,
  )
  return row === undefined ? INITIAL_REVISION : text(row['revision'])
}

type Domain = readonly [tenant: string, kind: string, name: string]

function unused(port: ParticipantPort, domain: Domain, key: string | null): string[] {
  const rows =
    key === null
      ? rowsOf(
          port,
          `SELECT digest FROM tl_definition_use WHERE tenant = ? AND kind = ? AND name = ? LIMIT ?`,
          [...domain, BigInt(LEDGER_READ_ROWS + 1)],
        )
      : rowsOf(
          port,
          `SELECT digest FROM tl_definition_use
           WHERE tenant = ? AND kind = ? AND name = ? AND key = ? LIMIT 1`,
          [...domain, key],
        )
  if (key === null)
    port.execute('DELETE FROM tl_definition_use WHERE tenant = ? AND kind = ? AND name = ?', [
      ...domain,
    ])
  else
    port.execute(
      'DELETE FROM tl_definition_use WHERE tenant = ? AND kind = ? AND name = ? AND key = ?',
      [...domain, key],
    )
  return rows.map(row => text(row['digest']))
}

function put(
  port: ParticipantPort,
  domain: Domain,
  write: Extract<LedgerWriteFact, { op: 'put' }>,
  released: string[],
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
  const { definition } = write
  if (definition !== undefined && !definitionHeld(port, domain[0], definition))
    return { reason: 'definition-missing' }
  released.push(...unused(port, domain, write.key))
  const fixed = write.fixed === undefined ? null : packText(JSON.stringify(write.fixed.value))
  port.execute(
    `INSERT INTO tl_record (tenant, kind, name, key, record, fixed) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant, kind, name, key)
     DO UPDATE SET record = excluded.record, fixed = excluded.fixed`,
    [...domain, write.key, record, fixed],
  )
  if (definition !== undefined)
    port.execute(
      'INSERT INTO tl_definition_use (tenant, kind, name, key, digest) VALUES (?, ?, ?, ?, ?)',
      [...domain, write.key, definition],
    )
  return null
}

function drop(facts: LedgerFacts, port: ParticipantPort, domain: Domain): ParticipantReply {
  if (facts.writes.length !== 1 || facts.revision !== INITIAL_REVISION)
    return { kind: 'unsupported', basis: { reason: 'facts' } }
  const released = unused(port, domain, null)
  for (const table of ['tl_record', 'tl_due', 'tl_domain'])
    port.execute(`DELETE FROM ${table} WHERE tenant = ? AND kind = ? AND name = ?`, [...domain])
  if (facts.kind === 'call')
    port.execute('DELETE FROM tl_pending WHERE tenant = ? AND call = ?', [facts.tenant, facts.name])
  releaseDefinitions(port, facts.tenant, released)
  return participated({ kind: 'committed' })
}

function commitLedger(facts: LedgerFacts, port: ParticipantPort): ParticipantReply {
  const domain = [facts.tenant, facts.kind, facts.name] as const
  const current = revisionOf(port, domain)
  if (current !== facts.expected) return stopped({ reason: 'revision', current })
  for (const assertion of facts.asserts)
    if (revisionOf(port, [facts.tenant, assertion.kind, assertion.name]) !== assertion.revision)
      return stopped({ reason: 'assertion', current })
  if (facts.writes.some(write => write.op === 'drop')) return drop(facts, port, domain)
  const ensured = ensureDefinitions(port, facts.tenant, facts.definitions)
  if (ensured.kind === 'stopped') return stopped(ensured.basis)
  if (ensured.kind === 'failed') return { kind: 'failed', diagnostic: ensured.diagnostic }
  const released: string[] = []
  for (const write of facts.writes)
    switch (write.op) {
      case 'drop':
        throw new Error('a drop is handled before the other writes')
      case 'put': {
        const stop = put(port, domain, write, released)
        if (stop !== null) return stopped(stop)
        break
      }
      case 'delete':
        released.push(...unused(port, domain, write.key))
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
  if (facts.pending === true)
    port.execute('INSERT INTO tl_pending (tenant, call) VALUES (?, ?) ON CONFLICT DO NOTHING', [
      facts.tenant,
      facts.name,
    ])
  else if (facts.pending === false)
    port.execute('DELETE FROM tl_pending WHERE tenant = ? AND call = ?', [facts.tenant, facts.name])
  releaseDefinitions(port, facts.tenant, released)
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
      case 'definition-put':
        return commitDefinitionPut(facts, port)
      default: {
        const exhaustive: never = facts
        return exhaustive
      }
    }
  },
}
export default participant
