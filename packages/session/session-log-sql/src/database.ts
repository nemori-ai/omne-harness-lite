import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isNonNegativeJsonInteger,
  readJsonStrict,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import {
  isOk,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  addInteger,
  checkAppendInput,
  checkSession,
  compareInteger,
  type AppendRequest,
  type LogEntry,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { narrow, StorageDefect, type ReadTx, type WriteTx } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

export interface JournalRow {
  session: string
  tenant: string
  generation: string
  tail: string
}
export interface EntryRow {
  session: string
  position: string
  position_length: number
  batch: string
  dedupe_key: string | null
  value: string
}
interface ReadKeyRow {
  session: string
  key: string
  position: string
  position_length: number
}
interface AttemptRow {
  session: string
  run: string
  attempt: string
}
export interface LogDatabase {
  sl_journal: JournalRow
  sl_entry: EntryRow
  sl_read_key: ReadKeyRow
  sl_attempt: AttemptRow
}

export function integerText(value: JsonNumber): string {
  const canonical = ExactDecimal.from(value).toCanonicalString()
  const match = /^(\d+)e(-?\d+)$/u.exec(canonical)
  if (match === null) throw new StorageDefect('journal integer is not nonnegative')
  const coefficient = match[1] ?? ''
  const exponent = BigInt(match[2] ?? '0')
  if (exponent < 0n || exponent > BigInt(Number.MAX_SAFE_INTEGER))
    throw new StorageDefect('journal integer cannot be represented by this owner')
  return coefficient + '0'.repeat(Number(exponent))
}
export function numberFrom(text: string): JsonNumber {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed || !isNonNegativeJsonInteger(parsed.ok))
    throw new StorageDefect('corrupt journal integer')
  return parsed.ok
}
export function tenantFrom(text: string): TenantId {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new StorageDefect('corrupt journal tenant')
  const tenant = parseTenantId(parsed.ok)
  if (!isOk(tenant)) throw new StorageDefect('corrupt journal tenant')
  return Object.freeze(tenant.ok)
}
export async function journal(tx: ReadTx, session: string): Promise<JournalRow | undefined> {
  return narrow<LogDatabase>(tx)
    .selectFrom('sl_journal')
    .selectAll()
    .where('session', '=', session)
    .executeTakeFirst()
}
export function token(row: JournalRow): SourceToken {
  const session = checkSession(row.session)
  if ('failure' in session) throw new StorageDefect('corrupt journal session')
  return Object.freeze({
    tenant: tenantFrom(row.tenant),
    session: session.ok,
    journalGeneration: row.generation,
    tail: numberFrom(row.tail),
  })
}
export function matchesScope(row: JournalRow, scope: SessionScope): boolean {
  return row.session === scope.session && tenantIdEquals(tenantFrom(row.tenant), scope.tenant)
}
export async function ensureJournal(
  tx: WriteTx,
  scope: SessionScope,
  generation: string,
): Promise<JournalRow> {
  await tx.lockSentinel(`session-log:${scope.session}`)
  const prior = await journal(tx, scope.session)
  if (prior !== undefined) return prior
  const row = {
    session: scope.session,
    tenant: writeJsonLossless(scope.tenant),
    generation,
    tail: '0',
  }
  await narrow<LogDatabase>(tx).insertInto('sl_journal').values(row).execute()
  return row
}
export function decodeEntry(row: EntryRow): LogEntry {
  const parsed = readJsonStrict(row.value)
  if ('failed' in parsed) throw new StorageDefect('corrupt journal entry')
  const checked = checkAppendInput(
    row.session,
    [parsed.ok],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked || checked.ok.entries[0] === undefined)
    throw new StorageDefect('corrupt journal entry')
  return Object.freeze({
    ...checked.ok.entries[0],
    session: checked.ok.session,
    position: numberFrom(row.position),
  })
}
export async function entriesBetween(
  tx: ReadTx,
  session: string,
  after: JsonNumber,
  through: JsonNumber,
): Promise<readonly LogEntry[]> {
  if (compareInteger(after, through) >= 0) return Object.freeze([])
  const low = integerText(after)
  const high = integerText(through)
  const rows = await narrow<LogDatabase>(tx)
    .selectFrom('sl_entry')
    .selectAll()
    .where('session', '=', session)
    .where(eb =>
      eb.or([
        eb('position_length', '>', low.length),
        eb.and([eb('position_length', '=', low.length), eb('position', '>', low)]),
      ]),
    )
    .where(eb =>
      eb.or([
        eb('position_length', '<', high.length),
        eb.and([eb('position_length', '=', high.length), eb('position', '<=', high)]),
      ]),
    )
    .orderBy('position_length')
    .orderBy('position')
    .execute()
  const entries = rows.map(decodeEntry)
  let expected = after
  for (const entry of entries) {
    expected = addInteger(expected, 1)
    if (compareInteger(entry.position, expected) !== 0)
      throw new StorageDefect('journal prefix has a gap')
  }
  if (compareInteger(expected, through) !== 0)
    throw new StorageDefect('journal prefix is incomplete')
  return Object.freeze(entries)
}
export async function appendEntries(
  tx: WriteTx,
  request: AppendRequest,
  row: JournalRow,
  batch: string,
): Promise<readonly LogEntry[]> {
  const db = narrow<LogDatabase>(tx)
  const tail = numberFrom(row.tail)
  const entries = request.entries.map((entry, index) =>
    Object.freeze({ ...entry, session: request.session, position: addInteger(tail, index + 1) }),
  )
  for (const [index, entry] of entries.entries()) {
    const position = integerText(entry.position)
    await db
      .insertInto('sl_entry')
      .values({
        session: entry.session,
        position,
        position_length: position.length,
        batch,
        dedupe_key: entry.dedupeKey ?? null,
        value: writeJsonLossless(request.entries[index]),
      })
      .execute()
    for (const key of entry.readKeys)
      await db
        .insertInto('sl_read_key')
        .values({ session: entry.session, key, position, position_length: position.length })
        .execute()
    await updateAttempt(tx, entry)
  }
  await db
    .updateTable('sl_journal')
    .set({ tail: integerText(addInteger(tail, entries.length)) })
    .where('session', '=', row.session)
    .execute()
  return Object.freeze(entries)
}
async function updateAttempt(tx: WriteTx, entry: LogEntry): Promise<void> {
  if (entry.run === undefined || entry.attempt === undefined) return
  const db = narrow<LogDatabase>(tx)
  const prior = await db
    .selectFrom('sl_attempt')
    .selectAll()
    .where('session', '=', entry.session)
    .where('run', '=', entry.run)
    .executeTakeFirst()
  if (prior === undefined) {
    await db
      .insertInto('sl_attempt')
      .values({ session: entry.session, run: entry.run, attempt: integerText(entry.attempt) })
      .execute()
  } else if (compareInteger(entry.attempt, numberFrom(prior.attempt)) > 0) {
    await db
      .updateTable('sl_attempt')
      .set({ attempt: integerText(entry.attempt) })
      .where('session', '=', entry.session)
      .where('run', '=', entry.run)
      .execute()
  }
}
