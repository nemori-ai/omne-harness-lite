import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  INPUT_FATE_KINDS,
  PENDING_PAGE_LIMIT,
  inputFateOfRows,
  pendingAcceptances,
  pendingInputOf,
  pendingPageOf,
  waitingCalls,
  type EntryId,
  type HistoryEntry,
  type InputId,
  type PendingInput,
  type SessionAccess,
  type SessionCallerClass,
  type SessionFailure,
  type SessionTransactionPort,
  type SessionWork,
} from '@omne-harness/session-contract'
import { denied, guarded, OWNERS, unavailable } from './failures.ts'
import { readSnapshot } from './qualify.ts'
import type { Reads } from './reads.ts'

const PAGE_BYTES = 1_048_576
const ROUTED = ['intake.routed'] as const

type Rows = Outcome<readonly HistoryEntry[], SessionFailure>

function accessOf<P>(input: SessionAccess<P>): SessionAccess<P> {
  return { principal: input.principal, tenant: input.tenant, session: input.session }
}

// Rows of some kinds, page by page, until the log ends or the reader has what it came for.
async function rowsOf<P>(
  view: SessionTransactionPort<P>,
  access: SessionAccess<P>,
  scan: Readonly<{
    kinds: readonly string[]
    direction: 'forward' | 'backward'
    enough?: (rows: readonly HistoryEntry[]) => boolean
  }>,
): Promise<Rows> {
  const { kinds, direction } = scan
  const rows: HistoryEntry[] = []
  let page = await guarded(OWNERS.delegated, 'history.begin', () =>
    view.history.begin({ ...access, kinds, from: null, direction, pageBytes: PAGE_BYTES }),
  )
  for (;;) {
    if ('failure' in page) return page
    rows.push(...page.ok.entries)
    const cursor = page.ok.next
    if (cursor === null || scan.enough?.(rows) === true) return succeed(rows)
    page = await guarded(OWNERS.delegated, 'history.next', () =>
      view.history.next({ ...access, cursor }),
    )
  }
}

const unreadable = (what: string): Outcome<never, SessionFailure> =>
  fail(unavailable(OWNERS.delegated, `${what}: a row of the log does not read`))

type Acceptances = NonNullable<ReturnType<typeof pendingAcceptances>>

// The acceptance rows of the wanted inputs: the newest rows first, until every one is seen.
async function acceptancesOf<P>(
  view: SessionTransactionPort<P>,
  access: SessionAccess<P>,
  wanted: ReadonlySet<InputId>,
): Promise<Outcome<Acceptances, SessionFailure>> {
  const seen = (rows: readonly HistoryEntry[]): boolean => {
    const found = pendingAcceptances(rows)
    return found !== null && [...wanted].every(input => found.has(input))
  }
  const rows = await rowsOf(view, access, { kinds: ROUTED, direction: 'backward', enough: seen })
  if ('failure' in rows) return rows
  const accepted = pendingAcceptances(rows.ok)
  // A pending input with no acceptance in the log is not answered as an empty list.
  return accepted !== null && [...wanted].every(input => accepted.has(input))
    ? succeed(accepted)
    : unreadable('readPending')
}

async function storedOf<P>(
  view: SessionTransactionPort<P>,
  access: SessionAccess<P>,
  input: InputId,
): Promise<
  Outcome<
    Awaited<ReturnType<typeof view.readInput>> extends Outcome<infer T, unknown> ? T : never,
    SessionFailure
  >
> {
  const stored = await guarded(OWNERS.delegated, 'readInput', () =>
    view.readInput({ ...access, input }),
  )
  return 'failure' in stored && stored.failure.kind === 'denied'
    ? unreadable('readPending')
    : stored
}

async function pendingOf<P>(
  view: SessionTransactionPort<P>,
  access: SessionAccess<P>,
): Promise<Outcome<readonly PendingInput[], SessionFailure>> {
  const snapshot = await readSnapshot(view, access, 'readPending')
  if ('failure' in snapshot) return snapshot
  const wanted = new Set<InputId>(snapshot.ok.pending)
  if (wanted.size === 0) return succeed([])
  const accepted = await acceptancesOf(view, access, wanted)
  if ('failure' in accepted) return accepted
  const inputs: PendingInput[] = []
  for (const input of wanted) {
    const stored = await storedOf(view, access, input)
    if ('failure' in stored) return stored
    inputs.push(pendingInputOf(stored.ok, accepted.ok.get(input)!))
  }
  return succeed(inputs)
}

type PendingRequest<P> = Parameters<SessionWork<P>['readPending']>[0]

function limitOf(limit: unknown): number | null {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 ? limit : null
}

export function readPendingOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  value: PendingRequest<P>,
): ReturnType<SessionWork<P>['readPending']> {
  return reads.session(caller, 'readPending', value, async view => {
    const limit = limitOf(value.limit)
    if (limit === null || limit > PENDING_PAGE_LIMIT)
      return fail({
        kind: 'invalid',
        field: 'limit',
        reason: `expected an integer from 1 to ${PENDING_PAGE_LIMIT}`,
      })
    const after: EntryId | null = value.after ?? null
    if (after !== null && !/^\d+$/u.test(after))
      return fail({ kind: 'invalid', field: 'after', reason: 'not a position of the log' })
    const inputs = await pendingOf(view, accessOf(value))
    return 'failure' in inputs ? inputs : succeed(pendingPageOf(inputs.ok, after, limit))
  })
}

export function readWaitingCallsOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  value: SessionAccess<P>,
): ReturnType<SessionWork<P>['readWaitingCalls']> {
  return reads.session(caller, 'readWaitingCalls', value, async view => {
    const snapshot = await readSnapshot(view, accessOf(value), 'readWaitingCalls')
    return 'failure' in snapshot ? snapshot : succeed(waitingCalls(snapshot.ok))
  })
}

type FateRequest<P> = Parameters<SessionWork<P>['readInputFate']>[0]

export function readInputFateOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  value: FateRequest<P>,
): ReturnType<SessionWork<P>['readInputFate']> {
  return reads.session(caller, 'readInputFate', value, async view => {
    const access = accessOf(value)
    const snapshot = await readSnapshot(view, access, 'readInputFate')
    if ('failure' in snapshot) return snapshot
    const rows = await rowsOf(view, access, { kinds: INPUT_FATE_KINDS, direction: 'forward' })
    if ('failure' in rows) return rows
    const folded = inputFateOfRows(value.input, rows.ok)
    if (folded === 'unreadable') return unreadable('readInputFate')
    // An input the session never accepted answers as a session the caller may not read.
    return folded.fate === null ? fail(denied('readInputFate')) : succeed(folded.fate)
  })
}
