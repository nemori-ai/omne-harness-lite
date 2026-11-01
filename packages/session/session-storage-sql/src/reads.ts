// The read path (SQL r2 section 17). Session reads are `snapshot` reads, one bounded transaction
// per page. Every read asks the current access decision first, resolves the domain of the one
// tenant the call names, and sends the tenant and session to the handler, which filters on both.
// The system reads walk the tenant domains one by one and claim no single snapshot across them.
import { createHash } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  readAccessRequest,
  type HistoryPage,
  type InputId,
  type ModelViewRead,
  type ModelViewBasis,
  type PendingReason,
  type ReleasedScope,
  type ResidentKey,
  type ResidentReference,
  type RoutedInput,
  type SavedModelSelection,
  type SessionAccess,
  type SessionFailure,
  type SessionHistory,
  type SessionId,
  type SessionModelSelection,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue } from './codec.ts'
import { open, OWNER, seal } from './cursor.ts'
import {
  domainOf,
  failure,
  qualify,
  readHandler,
  unavailable,
  type Context,
  type HandlerOutput,
} from './context.ts'

type Reply<T> = Promise<Outcome<T, SessionFailure>>

/** Access, domain, then one handler read bound to the tenant and session of the call. */
async function sessionRead<P>(
  context: Context<P>,
  access: SessionAccess<P>,
  action: Parameters<typeof readAccessRequest>[1],
  handler: string,
  extra: Readonly<Record<string, JsonValue>> = {},
): Promise<Outcome<{ out: HandlerOutput; tenant: string }, SessionFailure>> {
  const decided = await qualify(context, readAccessRequest(access, action))
  if ('failure' in decided) return decided
  const domain = await domainOf(context, access.tenant)
  if ('failure' in domain) return domain
  const out = await readHandler(context, domain.ok.domain, handler, {
    ...extra,
    tenant: domain.ok.text,
    session: access.session,
  })
  if ('failure' in out) return out
  // A session the tenant does not have answers like a session of another tenant (default deny).
  if (out.ok['kind'] === 'absent') return failure({ kind: 'denied', action })
  if (out.ok['kind'] === 'behind')
    return failure(unavailable(`${handler}: the state does not cover the tail yet`))
  return succeed({ out: out.ok, tenant: domain.ok.text })
}

export async function readWork<P>(
  context: Context<P>,
  access: SessionAccess<P>,
): Reply<WorkSnapshot> {
  const read = await sessionRead(context, access, 'readWork', 'session.work')
  if ('failure' in read) return read
  return succeed(decodeValue(read.ok.out['snapshot'] as JsonValue) as WorkSnapshot)
}

export async function readInput<P>(
  context: Context<P>,
  access: SessionAccess<P> & Readonly<{ input: InputId }>,
): Reply<Extract<RoutedInput, { kind: 'ordinary' }>> {
  const read = await sessionRead(context, access, 'readInput', 'session.input', {
    input: access.input,
  })
  if ('failure' in read) return read
  if (read.ok.out['kind'] !== 'input')
    return failure({ kind: 'invalid', field: 'input', reason: 'not an ordinary input of this session' })
  return succeed(decodeValue(read.ok.out['value'] as JsonValue) as never)
}

export async function readModelSelection<P>(
  context: Context<P>,
  access: SessionAccess<P>,
): Reply<SessionModelSelection> {
  const read = await sessionRead(context, access, 'readModelSelection', 'session.model-selection')
  if ('failure' in read) return read
  const out = read.ok.out
  if (out['kind'] === 'not-ready') return failure({ kind: 'not-ready' })
  if (out['kind'] !== 'selection')
    return failure(unavailable('the commit that saved the selection has no original receipt'))
  return succeed({
    selection: out['selection'] as unknown as SavedModelSelection,
    revision: out['revision'] as never,
    source: out['source'] as never,
  })
}

const view = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

function page(out: HandlerOutput, next: string | null): HistoryPage {
  return {
    source: OWNER,
    interpreter: out['interpreter'] as never,
    upper: out['upper'] as never,
    entries: decodeValue(out['entries'] as JsonValue) as never,
    scannedThrough: out['scannedThrough'] as string,
    next,
    exhausted: out['exhausted'] as boolean,
    annotations: decodeValue(out['annotations'] as JsonValue) as never,
  }
}

type HistoryState = Readonly<{
  edge: string
  upper: string
  direction: 'forward' | 'backward'
  kinds: readonly string[]
  pageBytes: number
}>

async function historyRead<P>(
  context: Context<P>,
  access: SessionAccess<P>,
  action: 'history.begin' | 'history.next' | 'history.since',
  input: Readonly<Record<string, JsonValue>>,
  kinds: readonly string[],
  direction: 'forward' | 'backward',
  pageBytes: number,
): Reply<HistoryPage> {
  if (!Number.isInteger(pageBytes) || pageBytes < 1)
    return failure({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
  const read = await sessionRead(context, access, action, 'session.history', {
    kinds: [...kinds],
    direction,
    pageBytes,
    mode: 'begin',
    from: null,
    edge: null,
    upper: null,
    ...input,
  })
  if ('failure' in read) return read
  const out = read.ok.out
  if (out['kind'] === 'invalid')
    return failure({ kind: 'invalid', field: String(out['field']), reason: 'not an entry of this session' })
  const nextState = out['next'] as { edge: string; upper: string; direction: 'forward' | 'backward' } | null
  if (nextState === null) return succeed(page(out, null))
  const token = await seal(
    context.cursor,
    { kind: 'history', tenant: read.ok.tenant, session: access.session },
    { ...nextState, kinds, pageBytes } satisfies HistoryState,
  )
  if ('failure' in token) return token
  return succeed(page(out, token.ok))
}

export function historyFace<P>(context: Context<P>): SessionHistory<P> {
  return {
    begin: input =>
      historyRead(
        context,
        input,
        'history.begin',
        { mode: 'begin', from: input.from },
        input.kinds,
        input.direction,
        input.pageBytes,
      ),
    since: input =>
      historyRead(
        context,
        input,
        'history.since',
        { mode: 'since', from: input.after },
        input.kinds,
        'forward',
        input.pageBytes,
      ),
    next: async input => {
      const decided = await qualify(context, readAccessRequest(input, 'history.next'))
      if ('failure' in decided) return decided
      const domain = await domainOf(context, input.tenant)
      if ('failure' in domain) return domain
      const state = await open<HistoryState>(
        context.cursor,
        { kind: 'history', tenant: domain.ok.text, session: input.session },
        input.cursor,
      )
      if ('failure' in state) return state
      return historyRead(
        context,
        input,
        'history.next',
        { mode: 'next', edge: state.ok.edge, upper: state.ok.upper },
        state.ok.kinds,
        state.ok.direction,
        state.ok.pageBytes,
      )
    },
    readModelView: async input => {
      const decided = await qualify(context, readAccessRequest(input, 'history.readModelView'))
      if ('failure' in decided) return decided
      const domain = await domainOf(context, input.tenant)
      if ('failure' in domain) return domain
      const binding = { kind: 'model-view', tenant: domain.ok.text, session: input.session }
      const prefix = `${view(domain.ok.text)}/${input.session}/`
      if (input.basis !== null && !input.basis.epoch.startsWith(prefix))
        return failure({ kind: 'invalid', field: 'basis', reason: 'another session' })
      let after: string | null = null
      if (input.after !== null) {
        const state = await open<{ after: string }>(context.cursor, binding, input.after)
        if ('failure' in state) return state
        after = state.ok.after
      }
      if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
        return failure({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
      const read = await sessionRead(context, input, 'history.readModelView', 'session.model-view', {
        epoch: input.basis === null ? null : input.basis.epoch.slice(prefix.length),
        upper: input.basis === null ? null : input.basis.upper,
        after,
        pageBytes: input.pageBytes,
      })
      if ('failure' in read) return read
      const out = read.ok.out
      const basisOf = (value: { epoch: string; upper: string }): ModelViewBasis => ({
        epoch: `${prefix}${value.epoch}`,
        upper: value.upper,
      })
      if (out['kind'] === 'epoch-changed')
        return succeed({
          kind: 'epoch-changed',
          current: basisOf(out['current'] as { epoch: string; upper: string }),
        } satisfies ModelViewRead)
      if (out['kind'] === 'invalid-bounds')
        return failure({ kind: 'invalid', field: 'basis', reason: 'invalid model view bounds' })
      const next = out['next'] as string | null
      const token = next === null ? null : await seal(context.cursor, binding, { after: next })
      if (token !== null && 'failure' in token) return token
      return succeed({
        kind: 'page',
        basis: basisOf(out['basis'] as { epoch: string; upper: string }),
        rows: out['rows'] as never,
        next: token === null ? null : token.ok,
      } satisfies ModelViewRead)
    },
  }
}

type PendingInput = Readonly<{
  principal: unknown
  tenant: TenantId
  after: string | null
  limit: number
  reason?: PendingReason
}>

export async function pending<P>(
  context: Context<P>,
  input: PendingInput & Readonly<{ principal: P }>,
): Reply<Readonly<{ sessions: readonly SessionId[]; next: string | null }>> {
  const decided = await qualify(context, {
    access: { principal: input.principal, tenant: input.tenant },
    operation: 'pending',
    target: { kind: 'tenant', tenant: input.tenant },
  })
  if ('failure' in decided) return decided
  const domain = await domainOf(context, input.tenant)
  if ('failure' in domain) return domain
  if (!Number.isInteger(input.limit) || input.limit < 1)
    return failure({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
  const binding = { kind: 'pending', tenant: domain.ok.text, session: null }
  let after: string | null = null
  if (input.after !== null) {
    const state = await open<{ after: string }>(context.cursor, binding, input.after)
    if ('failure' in state) return state
    after = state.ok.after
  }
  const out = await readHandler(context, domain.ok.domain, 'session.pending', {
    tenant: domain.ok.text,
    reason: input.reason ?? null,
    after,
    limit: input.limit,
  })
  if ('failure' in out) return out
  const sessions = out.ok['sessions'] as string[]
  const last = sessions[sessions.length - 1]
  const token =
    out.ok['more'] === true && last !== undefined
      ? await seal(context.cursor, binding, { after: last })
      : null
  if (token !== null && 'failure' in token) return token
  return succeed({
    sessions: sessions as SessionId[],
    next: token === null ? null : token.ok,
  })
}

type SystemState = Readonly<{ tenant: string; after: unknown }>

/**
 * Pages through the tenant domains in tenant order. Each domain is read on its own snapshot; the
 * walk claims no single snapshot across them, and a domain that does not answer ends it as
 * `unavailable` rather than as a shorter page.
 */
async function systemWalk<P, Row>(
  context: Context<P>,
  kind: 'references' | 'released-scopes',
  handler: string,
  extra: Readonly<Record<string, JsonValue>>,
  after: string | null,
  limit: number,
  rowOf: (tenant: TenantId, row: Record<string, JsonValue>) => Row,
  lastOf: (row: Record<string, JsonValue>) => unknown,
): Reply<Readonly<{ rows: readonly Row[]; next: string | null }>> {
  if (!Number.isInteger(limit) || limit < 1)
    return failure({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
  const binding = { kind, tenant: null, session: null }
  let from: SystemState | null = null
  if (after !== null) {
    const state = await open<SystemState>(context.cursor, binding, after)
    if ('failure' in state) return state
    from = state.ok
  }
  const listed = await context.options.domains.snapshot()
  if (listed.kind !== 'ready') return failure(unavailable(`tenant domains: ${listed.diagnostic}`))
  const entries = [...listed.value.entries].sort((a, b) => (a.tenant < b.tenant ? -1 : 1))
  const rows: Row[] = []
  let position = from === null ? 0 : entries.findIndex(entry => entry.tenant >= from.tenant)
  if (position === -1) position = entries.length
  let cursor: SystemState | null = null
  for (; position < entries.length && cursor === null; position += 1) {
    const entry = entries[position]
    if (entry === undefined) break
    const minted = tenantCodec.parse(entry.tenant)
    if (!minted.ok || entry.domain.scope.kind !== 'tenant' || entry.domain.scope.tenant !== entry.tenant)
      return failure(unavailable('the tenant domain directory holds an entry of no tenant'))
    const first = from !== null && from.tenant === entry.tenant
    const out = await readHandler(context, entry.domain, handler, {
      ...extra,
      tenant: entry.tenant,
      after: first ? (from?.after as JsonValue) : null,
      limit: limit - rows.length,
    })
    if ('failure' in out) return out
    const got = out.ok['rows'] as Record<string, JsonValue>[]
    for (const row of got) rows.push(rowOf(minted.value, row))
    const last = got[got.length - 1]
    if (out.ok['more'] === true && last !== undefined)
      cursor = { tenant: entry.tenant, after: lastOf(last) }
    else if (rows.length >= limit && entries[position + 1] !== undefined)
      cursor = { tenant: (entries[position + 1] as { tenant: string }).tenant, after: null }
  }
  if (cursor === null) return succeed({ rows, next: null })
  const token = await seal(context.cursor, binding, cursor)
  if ('failure' in token) return token
  return succeed({ rows, next: token.ok })
}

export async function references<P>(
  context: Context<P>,
  input: Readonly<{
    principal: P
    scope: 'system'
    key: ResidentKey
    after: string | null
    limit: number
  }>,
): Reply<Readonly<{ sessions: readonly ResidentReference[]; next: string | null }>> {
  const decided = await qualify(context, {
    access: { principal: input.principal, scope: 'system' },
    operation: 'references',
    target: { kind: 'resident-references', key: input.key },
  })
  if ('failure' in decided) return decided
  const walked = await systemWalk(
    context,
    'references',
    'session.references',
    { key: input.key },
    input.after,
    input.limit,
    (tenant, row): ResidentReference =>
      ({
        tenant,
        session: row['session'],
        capability: row['capability'],
        shape: decodeValue(row['shape'] as JsonValue),
      }) as never,
    row => ({ session: row['session'], capability: row['capability'] }),
  )
  if ('failure' in walked) return walked
  return succeed({ sessions: walked.ok.rows, next: walked.ok.next })
}

export async function releasedScopes<P>(
  context: Context<P>,
  input: Readonly<{ principal: P; scope: 'system'; after: string | null; limit: number }>,
): Reply<Readonly<{ scopes: readonly ReleasedScope[]; next: string | null }>> {
  const decided = await qualify(context, {
    access: { principal: input.principal, scope: 'system' },
    operation: 'releasedScopes',
    target: { kind: 'released-scopes' },
  })
  if ('failure' in decided) return decided
  const walked = await systemWalk(
    context,
    'released-scopes',
    'session.released-scopes',
    {},
    input.after,
    input.limit,
    (tenant, row): ReleasedScope =>
      ({
        tenant,
        session: row['session'],
        ...(decodeValue(row['data'] as JsonValue) as object),
      }) as never,
    row => ({ session: row['session'], scope: (row['data'] as { scope: JsonValue }).scope }),
  )
  if ('failure' in walked) return walked
  return succeed({ scopes: walked.ok.rows, next: walked.ok.next })
}

