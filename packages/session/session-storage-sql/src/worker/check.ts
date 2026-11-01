// The read-only participations of the `session` participant (session-contract JC-26, JC-27): the
// source checks of PA-01 for open, submit and attach, and the pending-input check of PA-02 for a
// conditional finish. They read the authoritative rows of the same commit transaction and write no
// row. A check that holds participates; one that fails stops with the Session failure that is its
// basis, and the execution record provider maps it (session-adapters AD-01).
import {
  deriveDriveOperation,
  judgeCompletion,
  type DurableEvidence,
  type HistoryEntry,
  type RunTerminal,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import type { SessionAdmittedInput, SessionCheck } from '../participants.ts'
import { canonicalText, decodeValue, encodeValue, plainOf, sha256 } from '../codec.ts'
import { big, oneRow, rowsOf, text, type Row } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_ROWS = 10_000

type Planted = Readonly<{
  position: string
  revision: string
  entry: HistoryEntry
  data: Record<string, unknown>
}>
type Attempt = Readonly<{ run: string; attempt: string; revision: string }>

const stopped = (failure: SessionFailure): ParticipantReply => ({
  kind: 'conflict',
  basis: { failure: encodeValue(failure) },
})
const checked = (attempt: string | null, advance: 'ordinary' | 'wind-down' | null) =>
  ({
    kind: 'participated',
    response: { result: { kind: 'checked', attempt, advance }, recovered: false },
  }) as const

const same = (left: unknown, right: unknown): boolean =>
  canonicalText(encodeValue(left)) === canonicalText(encodeValue(right))

function planted(
  port: ParticipantPort,
  tenant: string,
  session: string,
  kinds: readonly string[],
): Planted[] | 'too-many' {
  const rows = rowsOf(
    port,
    `SELECT position, revision, entry FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind IN (${kinds.map(() => '?').join(', ')})
      ORDER BY position LIMIT ?`,
    [tenant, session, ...kinds, BigInt(MAX_ROWS + 1)],
  )
  if (rows.length > MAX_ROWS) return 'too-many'
  return rows.map(plantedRow)
}

function plantedRow(row: Row): Planted {
  const entry = decodeValue(JSON.parse(text(row['entry'])) as JsonValue) as HistoryEntry
  return {
    position: text(row['position']),
    revision: text(row['revision']),
    entry,
    data: (plainOf(entry.payload) ?? {}) as Record<string, unknown>,
  }
}

/** The batch receipts of one revision: the grant a Session commit gave out is one of their sources. */
function batchSources(
  port: ParticipantPort,
  tenant: string,
  session: string,
  revision: string,
): DurableEvidence[] {
  return rowsOf(
    port,
    'SELECT receipt FROM sl_operation WHERE tenant = ? AND session = ? AND revision = ? LIMIT 8',
    [tenant, session, BigInt(revision)],
  ).flatMap(row => {
    const receipt = decodeValue(JSON.parse(text(row['receipt'])) as JsonValue) as {
      source?: DurableEvidence
    }
    return receipt.source === undefined ? [] : [receipt.source]
  })
}

/** The evidence of one committed entry, as the history index gives it out. */
function entryEvidence(tenant: string, session: string, row: Planted): DurableEvidence {
  return {
    owner: OWNER,
    record: `${tenant}/${session}/entry/${row.position}`,
    revision: row.revision,
    digest: `sha256:${sha256(canonicalText(row.entry))}`,
  }
}

/**
 * Whether `receipt` is a receipt of the committed entry `row`: the source of the receipt of the
 * batch that wrote it, or the evidence of the entry itself.
 */
function receiptNames(
  port: ParticipantPort,
  tenant: string,
  session: string,
  row: Planted,
  receipt: DurableEvidence,
): boolean {
  return (
    same(entryEvidence(tenant, session, row), receipt) ||
    batchSources(port, tenant, session, row.revision).some(source => same(source, receipt))
  )
}

/**
 * The SE15 attempt of `execution` that `grant` names: the grant is the source of the batch that
 * wrote the SE15 entry, or the evidence of the entry itself. Null when the grant names none.
 */
function grantAttempt(
  port: ParticipantPort,
  tenant: string,
  session: string,
  execution: string,
  grant: DurableEvidence,
): Readonly<{ found: Attempt | null; attempts: Attempt[] }> | 'too-many' {
  const rows = planted(port, tenant, session, ['run.started', 'run.attempt-started'])
  if (rows === 'too-many') return rows
  const runs = new Map<string, string>()
  for (const row of rows)
    if (row.entry.kind === 'run.started')
      runs.set(String(row.data['run']), String(row.data['execution']))
  const attempts: Attempt[] = []
  let found: Attempt | null = null
  for (const row of rows) {
    if (row.entry.kind !== 'run.attempt-started') continue
    const run = String(row.data['run'])
    if (runs.get(run) !== execution) continue
    const attempt = { run, attempt: String(row.data['attempt']), revision: row.revision }
    attempts.push(attempt)
    if (receiptNames(port, tenant, session, row, grant)) found = attempt
  }
  return { found, attempts }
}

/**
 * The source check of PA-01 items 1 and 2. The source basis is a receipt of a committed entry of
 * this session: for `open` the SE13 (`run.started`) of the execution, whose first input is the
 * initial input; for `submit` the SE11 (`intake.routed`) of the input. It is never compared with
 * the origin of the input. The message is the one Session admitted for the input.
 *
 * Both forms of a receipt carry the revision of the entry, so only the entries of that revision
 * are read; the full comparison then decides, and a receipt with another revision names nothing.
 * The rows of one revision are one batch, so the read bound is not reached in practice; past it
 * the check fails rather than judging on part of the rows.
 */
function sourceHolds(
  port: ParticipantPort,
  tenant: string,
  session: string,
  check: Extract<SessionCheck, { kind: 'open' | 'submit' }>,
): boolean | 'too-many' {
  const value = check.kind === 'open' ? check.initial : check.value
  // `origin` of the checked input carries the source basis of the Agent's AcceptedInput.
  const source = value.origin
  // The facts come from the committer: a source without a decimal revision names no entry.
  const revision = (source as Partial<DurableEvidence> | null)?.revision
  if (typeof revision !== 'string' || !/^\d+$/.test(revision)) return false
  const kind = check.kind === 'open' ? 'run.started' : 'intake.routed'
  const records = (row: Planted) =>
    check.kind === 'open'
      ? String(row.data['execution']) === check.execution &&
        String(row.data['first']) === value.input
      : String(row.data['input']) === value.input
  const rows = rowsOf(
    port,
    `SELECT position, revision, entry FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind = ? AND revision = ? ORDER BY position LIMIT ?`,
    [tenant, session, kind, BigInt(revision), BigInt(MAX_ROWS + 1)],
  )
  if (rows.length > MAX_ROWS) return 'too-many'
  const named = rows
    .map(plantedRow)
    .some(row => records(row) && receiptNames(port, tenant, session, row, source))
  return named && admittedMessage(port, tenant, session, value)
}

/** Whether Session admitted `value.input` in this session with this message. */
function admittedMessage(
  port: ParticipantPort,
  tenant: string,
  session: string,
  value: SessionAdmittedInput,
): boolean {
  const row = oneRow(
    port,
    'SELECT value FROM sl_input WHERE tenant = ? AND session = ? AND input = ? LIMIT 1',
    [tenant, session, value.input],
  )
  if (row === undefined) return false
  const admitted = decodeValue(JSON.parse(text(row['value'])) as JsonValue) as SessionAdmittedInput
  return same(admitted.message, value.message)
}

/** The revision of the batch that wrote the SE26 of `terminal`, and the control that asked for it. */
function terminalOrigin(
  port: ParticipantPort,
  tenant: string,
  session: string,
  execution: string,
  snapshot: WorkSnapshot,
  terminal: RunTerminal,
): Readonly<{ revision: string | null; control: string | null }> | 'too-many' {
  const rows = planted(port, tenant, session, ['run.terminal', 'control.requested'])
  if (rows === 'too-many') return rows
  const origin = (row: Planted) => (row.entry as { origin?: { source?: unknown } }).origin?.source
  const revision =
    rows.find(row => row.entry.kind === 'run.terminal' && same(origin(row), terminal.evidence))
      ?.revision ?? null
  for (const row of rows) {
    if (row.entry.kind !== 'control.requested' || !same(origin(row), terminal.evidence)) continue
    const progress = row.data['progress'] as { operation?: unknown } | undefined
    const control = snapshot.controls.find(item => item.operation === progress?.operation)
    if (control === undefined) return { revision, control: null }
    return {
      revision,
      control: deriveDriveOperation({ kind: 'control', execution, control: control.operation }),
    }
  }
  return { revision, control: null }
}

const tooMany = (): ParticipantReply => ({
  kind: 'failed',
  diagnostic: 'the history of the session exceeds the read bound of a check',
})

/** PA-01 item 1 (open) and item 3 (attach): the attempt the grant names may hold the execution. */
function grantCheck(
  port: ParticipantPort,
  scope: Readonly<{ tenant: string; session: string; execution: string }>,
  snapshot: WorkSnapshot,
  grant: DurableEvidence,
  method: 'open' | 'attach',
): ParticipantReply {
  const { tenant, session, execution } = scope
  const looked = grantAttempt(port, tenant, session, execution, grant)
  if (looked === 'too-many') return tooMany()
  const attempt = looked.found
  if (attempt === null) return stopped({ kind: 'denied', action: method })
  const judged = judgeCompletion(snapshot, execution)
  if (judged.kind === 'terminal') return stopped({ kind: 'terminal', terminal: judged.terminal })
  const run = snapshot.run
  if (judged.kind !== 'cancelled') {
    if (run.kind !== 'active' || run.execution.execution !== execution)
      return stopped({ kind: 'stale-advance', current: run.kind === 'active' ? run.advance : null })
    return run.advance?.attempt === attempt.attempt
      ? checked(attempt.attempt, 'ordinary')
      : stopped({ kind: 'stale-advance', current: run.advance })
  }
  // Cancel wind-down (attach only): the last attempt granted for the execution before the cancel.
  if (method !== 'attach') return stopped({ kind: 'terminal', terminal: judged.terminal })
  if (attempt.run !== String(judged.terminal.run))
    return stopped({ kind: 'stale-advance', current: null })
  const origin = terminalOrigin(port, tenant, session, execution, snapshot, judged.terminal)
  if (origin === 'too-many') return tooMany()
  if (origin.revision === null)
    return { kind: 'failed', diagnostic: 'a cancelled Run without its SE26 row' }
  const at = big(origin.revision)
  const last = looked.attempts
    .filter(item => item.run === attempt.run && big(item.revision) <= at)
    .at(-1)
  return last?.attempt === attempt.attempt
    ? checked(attempt.attempt, 'wind-down')
    : stopped({ kind: 'stale-advance', current: null })
}

function runCheck(port: ParticipantPort, check: SessionCheck): ParticipantReply {
  const encoded = tenantCodec.encode(check.tenant)
  if (!encoded.ok)
    return stopped({ kind: 'invalid', field: 'tenant', reason: 'not minted by legal-identity' })
  const tenant = encoded.value
  const { session, execution } = check
  const state = oneRow(
    port,
    `SELECT s.snapshot AS snapshot, s.covered AS covered, j.tail AS tail
       FROM sl_journal j LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [tenant, session],
  )
  if (state === undefined) return stopped({ kind: 'denied', action: check.kind })
  if (state['snapshot'] === null || big(state['covered']) !== big(state['tail']))
    return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
  const snapshot = decodeValue(JSON.parse(text(state['snapshot'])) as JsonValue) as WorkSnapshot
  const scope = { tenant, session, execution }
  switch (check.kind) {
    case 'open': {
      const source = sourceHolds(port, tenant, session, check)
      if (source === 'too-many') return tooMany()
      if (!source) return stopped({ kind: 'denied', action: 'open' })
      return grantCheck(port, scope, snapshot, check.grant, 'open')
    }
    case 'attach':
      return grantCheck(port, scope, snapshot, check.grant, 'attach')
    case 'submit': {
      const source = sourceHolds(port, tenant, session, check)
      if (source === 'too-many') return tooMany()
      if (!source) return stopped({ kind: 'denied', action: 'submit' })
      const run = snapshot.run
      if (run.kind === 'terminal') return stopped({ kind: 'terminal', terminal: run.terminal })
      if (run.kind !== 'active') return stopped({ kind: 'stale-advance', current: null })
      return run.execution.execution === execution
        ? checked(null, null)
        : stopped({ kind: 'stale-advance', current: run.advance })
    }
    case 'finish': {
      const judged = judgeCompletion(snapshot, execution)
      const changed = stopped({ kind: 'changed', revision: snapshot.revision })
      switch (judged.kind) {
        case 'allowed':
          return checked(null, null)
        case 'blocked':
          return changed
        case 'terminal':
          return stopped({ kind: 'terminal', terminal: judged.terminal })
        case 'cancelled': {
          // PA-02: a cancelled conclusion under the control SE26 refers to participates.
          if (check.conclusion !== 'cancelled' || check.control === null) return changed
          const origin = terminalOrigin(port, tenant, session, execution, snapshot, judged.terminal)
          if (origin === 'too-many') return tooMany()
          return origin.control === check.control ? checked(null, null) : changed
        }
        default: {
          const _exhaustive: never = judged
          return _exhaustive
        }
      }
    }
    default: {
      const _exhaustive: never = check
      return _exhaustive
    }
  }
}

const KINDS = new Set(['open', 'submit', 'attach', 'finish'])

/** The check intent: the answer carries the digest of the check facts it answers. */
export function runChecks(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
): ParticipantReply {
  const raw = facts['check']
  let check: SessionCheck
  try {
    check = decodeValue(raw ?? null) as SessionCheck
  } catch (error) {
    return {
      kind: 'unsupported',
      basis: { reason: error instanceof Error ? error.message : 'undecodable check' },
    }
  }
  if (
    typeof check !== 'object' ||
    check === null ||
    !KINDS.has(String((check as { kind?: unknown }).kind)) ||
    typeof check.session !== 'string' ||
    typeof check.execution !== 'string'
  )
    return { kind: 'unsupported', basis: { reason: 'the check is malformed' } }
  const reply = runCheck(port, check)
  if (reply.kind !== 'participated') return reply
  return {
    kind: 'participated',
    response: {
      ...(reply.response as object),
      digest: `sha256:${sha256(canonicalText(raw ?? null))}`,
    },
  }
}
