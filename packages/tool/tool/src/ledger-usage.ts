// The usage of a settled call: one row per call, written in the commit that settles it, replaced by
// a late account, kept after the sweep; listed by tenant, start and consumer.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolCallId, ToolFailure, ToolTerminal } from '@omne-harness/tool-contract'
import {
  decodeToolInstant,
  type ToolAccounts,
  type ToolUsageFact,
  type ToolUsageOutcome,
  type ToolUsageQuery,
} from '@omne-harness/tool-contract/provider'
import type { ToolAccountsGuard } from './ledger-guards.ts'
import type {
  CallAccount,
  CallRecord,
  LedgerUsageQuery,
  LedgerUsageRead,
  TenantId,
  ToolLedgerStore,
} from './ledger-store.ts'

export const USAGE_PAGE_MAX = 500
export const USAGE_WORKS_MAX = 64
const CURSOR_PREFIX = 'tu1.'

export function usageOutcome(terminal: ToolTerminal): ToolUsageOutcome {
  switch (terminal.kind) {
    case 'failed':
      return { kind: 'failed', cause: terminal.cause }
    case 'interrupted':
      return { kind: 'interrupted', cause: terminal.cause }
    default:
      return { kind: terminal.kind }
  }
}

export function usageFactOf(
  call: CallRecord,
  terminal: ToolTerminal,
  account: CallAccount,
): ToolUsageFact {
  return {
    call: call.call,
    consumer: { ...call.request.consumer },
    tool: call.request.label.tool,
    start: call.startedAt ?? null,
    outcome: usageOutcome(terminal),
    account,
  }
}

/** Same owner, and a work equal to one of the works or under one of them. */
export function inConsumerScope(
  fact: ToolUsageFact,
  consumer: ToolUsageQuery['consumer'],
): boolean {
  if (consumer === null) return true
  const { work } = fact.consumer
  return (
    fact.consumer.owner === consumer.owner &&
    consumer.works.some(item => work === item || work.startsWith(`${item}/`))
  )
}

type Position = NonNullable<LedgerUsageQuery['after']>

function compareDated(a: Position, b: Position): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1
  return a.call === b.call ? 0 : a.call < b.call ? -1 : 1
}

/** The page an admitted query answers over the facts of its tenant, kept in any order. */
export function selectUsage(
  facts: readonly ToolUsageFact[],
  query: LedgerUsageQuery,
): LedgerUsageRead {
  const scoped = facts.filter(fact => inConsumerScope(fact, query.consumer))
  const sign = query.order === 'ascending' ? 1 : -1
  const dated = scoped
    .flatMap(fact =>
      fact.start === null ? [] : [{ fact, at: { start: fact.start, call: fact.call } }],
    )
    .filter(
      ({ at }) =>
        (query.range === null || (at.start >= query.range.from && at.start <= query.range.to)) &&
        (query.after === null || sign * compareDated(at, query.after) > 0),
    )
    .sort((a, b) => sign * compareDated(a.at, b.at))
  return {
    kind: 'page',
    facts: dated.slice(0, query.limit).map(({ fact }) => fact),
    undated: scoped.filter(fact => fact.start === null).length,
    more: dated.length > query.limit,
  }
}

const invalid = (field: string, reason: string): ToolFailure => ({ kind: 'invalid', field, reason })

function checkedQuery(query: ToolUsageQuery): Outcome<LedgerUsageQuery['range'], ToolFailure> {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > USAGE_PAGE_MAX)
    return fail(invalid('limit', 'out-of-range'))
  if (query.order !== 'ascending' && query.order !== 'descending')
    return fail(invalid('order', 'value'))
  const { consumer } = query
  if (
    consumer !== null &&
    (consumer.owner === '' ||
      consumer.works.length === 0 ||
      consumer.works.length > USAGE_WORKS_MAX ||
      consumer.works.some(work => work === ''))
  )
    return fail(invalid('consumer', 'shape'))
  if (query.range === null) return succeed(null)
  const from = decodeToolInstant(query.range.from)
  const to = decodeToolInstant(query.range.to)
  if ('failure' in from || 'failure' in to) return fail(invalid('range', 'instant'))
  return from.ok <= to.ok ? succeed({ from: from.ok, to: to.ok }) : fail(invalid('range', 'order'))
}

function fingerprintOf(tenant: TenantId, query: ToolUsageQuery): string {
  return JSON.stringify([
    tenant.organization.text,
    tenant.account.text,
    query.range,
    query.consumer,
    query.order,
  ])
}

function cursorOf(fingerprint: string, at: Position): string {
  return `${CURSOR_PREFIX}${Buffer.from(JSON.stringify([fingerprint, at.start, at.call])).toString('base64url')}`
}

function openCursor(fingerprint: string, cursor: string): Outcome<Position, ToolFailure> {
  try {
    const body = cursor.startsWith(CURSOR_PREFIX) ? cursor.slice(CURSOR_PREFIX.length) : ''
    const [given, start, call] = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as [
      unknown,
      unknown,
      unknown,
    ]
    if (given === fingerprint && typeof start === 'string' && typeof call === 'string')
      return succeed({ start, call: call as ToolCallId })
  } catch {
    // An opened cursor that is not one of ours answers invalid below.
  }
  return fail(invalid('after', 'cursor'))
}

type Admitted = Readonly<{ query: LedgerUsageQuery; fingerprint: string }>

function admittedQuery(
  input: Readonly<{ tenant: TenantId }> & ToolUsageQuery,
): Outcome<Admitted, ToolFailure> {
  const range = checkedQuery(input)
  if ('failure' in range) return range
  const fingerprint = fingerprintOf(input.tenant, input)
  const after = input.after === null ? succeed(null) : openCursor(fingerprint, input.after)
  if ('failure' in after) return after
  const { tenant, consumer, order, limit } = input
  return succeed({
    fingerprint,
    query: { tenant, range: range.ok, consumer, order, after: after.ok, limit },
  })
}

/** The tenant-wide usage read: the principal qualified for the tenant, the query checked. */
export function createToolAccounts<P>(
  store: Pick<ToolLedgerStore, 'usage'>,
  guard: ToolAccountsGuard<P>,
): ToolAccounts<P> {
  return {
    async list(input) {
      const verdict = await guard.qualify({ principal: input.principal, tenant: input.tenant })
      if (verdict.kind === 'denied') return fail({ kind: 'denied', action: 'account' })
      if (verdict.kind === 'unavailable')
        return fail({
          kind: 'unavailable',
          dependency: 'tool-access',
          diagnostic: verdict.diagnostic,
        })
      const admitted = admittedQuery(input)
      if ('failure' in admitted) return admitted
      const read = await store.usage(admitted.ok.query)
      if (read.kind === 'unavailable')
        return fail({ kind: 'unavailable', dependency: 'tool-ledger', diagnostic: read.diagnostic })
      const last = read.facts.at(-1)
      const next =
        read.more && last?.start != null
          ? cursorOf(admitted.ok.fingerprint, { start: last.start, call: last.call })
          : null
      return succeed({ entries: read.facts, undated: read.undated, next })
    },
  }
}
