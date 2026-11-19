// The dispatch facts: the rows the participant writes with each changed dispatch record, the read
// handler that pages them, and the read face `ModelDispatchFacts` over that handler.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  Adoption,
  ContextWindow,
  ModelDispatchFact,
  ModelDispatchFacts,
  ModelDispatchFactsPage,
  ModelDispatchFactsQuery,
  ModelFailure,
} from '@omne-harness/model-contract'
import {
  dispatchFactOf,
  type DispatchFactDraft,
  type ModelCommandsAuthority,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { countInput, isObject, rows, textInput } from './diagnostics.ts'
import type { Row } from './documents.ts'
import { DISPATCH_FACT } from './fact-schema.ts'
import { domainOf, unavailable } from './reads.ts'
import { PROTOCOL } from './schema.ts'

export const DISPATCH_FACTS_HANDLER = 'model.dispatch-facts'
export const DISPATCH_FACTS_PAGE_MAX = 200
export const DISPATCH_FACTS_WORKS_MAX = 100
export const DISPATCH_FACTS_READ_MAX_ROWS = DISPATCH_FACTS_PAGE_MAX + 2
export const DISPATCH_FACTS_READ_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
export const DISPATCH_FACT_KEPT_COLUMNS: readonly string[] = ['profile', 'context_window']

const CURSOR_PREFIX = 'mdfc_'
const MAC_LENGTH = 43

/** A moment in the one text form the table orders by; null when it is not a moment. */
function orderedInstant(instant: string | null): string | null {
  if (instant === null) return null
  const at = Date.parse(instant)
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

type ChangedCall = Parameters<typeof dispatchFactOf>[0]

/** The fact rows of the dispatches whose records this commit writes. */
export function dispatchFactRows(
  tenant: string,
  call: ChangedCall | undefined,
  changed: readonly Row[],
): Row[] {
  if (call === undefined) return []
  return changed.map(row => {
    const seq = row['seq']
    const dispatch = typeof seq === 'number' ? call.dispatches[seq] : undefined
    if (typeof seq !== 'number' || dispatch === undefined)
      throw new Error('a changed dispatch row has no dispatch')
    const { profile, contextWindow, ...fact } = dispatchFactOf(call, dispatch)
    return {
      tenant,
      call: fact.call,
      seq,
      dispatch: fact.dispatch,
      prepared: orderedInstant(fact.instants.prepared),
      consumer_owner: fact.consumer.owner,
      consumer_work: fact.consumer.work,
      profile: profile === null ? null : JSON.stringify(profile),
      context_window: contextWindow === null ? null : JSON.stringify(contextWindow),
      fact: JSON.stringify(fact),
    }
  })
}

/** The worker's consumer condition; the read face checked the consumer before it asked. */
function scopeOf(input: Readonly<Record<string, unknown>>): { where: string[]; params: string[] } {
  const where = ['tenant = ?']
  const params = [textInput(input, 'tenant')]
  const works = input['works']
  if (input['owner'] === null || !Array.isArray(works)) return { where, params }
  const work = '(consumer_work = ? OR (consumer_work >= ? AND consumer_work < ?))'
  where.push('consumer_owner = ?', `(${works.map(() => work).join(' OR ')})`)
  params.push(textInput(input, 'owner'))
  for (const item of works) params.push(String(item), `${String(item)}/`, `${String(item)}0`)
  return { where, params }
}

function readDispatchFactRows(input: JsonValue, port: ReadPort): JsonValue {
  if (!isObject(input)) throw new Error('invalid input')
  const { where, params } = scopeOf(input)
  const limit = countInput(input, 'limit', DISPATCH_FACTS_PAGE_MAX)
  const ascending = input['order'] === 'ascending'
  const undated = rows(
    port,
    `SELECT COUNT(*) AS undated FROM ${DISPATCH_FACT.name} WHERE ${where.join(' AND ')} AND prepared IS NULL LIMIT 1`,
    params,
  )[0]?.['undated']
  const dated: (string | bigint)[] = [...params]
  const clauses = [...where, 'prepared IS NOT NULL']
  if (input['from'] !== null) {
    clauses.push('prepared >= ?', 'prepared <= ?')
    dated.push(textInput(input, 'from'), textInput(input, 'to'))
  }
  if (input['afterPrepared'] !== null) {
    clauses.push(`(prepared, rowid) ${ascending ? '>' : '<'} (?, ?)`)
    dated.push(
      textInput(input, 'afterPrepared'),
      BigInt(countInput(input, 'afterRow', Number.MAX_SAFE_INTEGER)),
    )
  }
  const direction = ascending ? 'ASC' : 'DESC'
  const found = rows(
    port,
    `SELECT rowid AS rid, call, seq, dispatch, prepared, profile, context_window, fact
      FROM ${DISPATCH_FACT.name} WHERE ${clauses.join(' AND ')}
      ORDER BY prepared ${direction}, rowid ${direction} LIMIT ?`,
    [...dated, BigInt(limit + 1)],
  )
  return { undated: undated ?? 0, rows: found }
}

export const dispatchFactsHandler: ReadHandlerModule = {
  handler: DISPATCH_FACTS_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    try {
      return { kind: 'read', output: readDispatchFactRows(input, port) }
    } catch (error) {
      return { kind: 'failed', diagnostic: error instanceof Error ? error.message : 'read failed' }
    }
  },
}

export type SqlModelDispatchFactsOptions<P> = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  authority: Pick<ModelCommandsAuthority<P>, 'authorize'>
  cursorKey?: Uint8Array
}>

type ListInput<P> = Parameters<ModelDispatchFacts<P>['list']>[0]
type Position = Readonly<{ prepared: string; row: number }>
type Admitted = Readonly<{
  tenant: string
  from: string | null
  to: string | null
  fingerprint: string
  after: Position | null
}>

const invalid = (field: string, reason: string): ModelFailure => ({
  kind: 'invalid',
  field,
  reason,
})

function rangeOf(
  range: ModelDispatchFactsQuery['range'],
): Outcome<[string, string] | null, ModelFailure> {
  if (range === null) return succeed(null)
  const from = orderedInstant(range.from)
  const to = orderedInstant(range.to)
  if (from === null || to === null) return fail(invalid('range', 'instant'))
  return from <= to ? succeed([from, to]) : fail(invalid('range', 'order'))
}

function consumerValid(consumer: ModelDispatchFactsQuery['consumer']): boolean {
  if (consumer === null) return true
  const { owner, works } = consumer
  return (
    typeof owner === 'string' &&
    owner !== '' &&
    Array.isArray(works) &&
    works.length > 0 &&
    works.length <= DISPATCH_FACTS_WORKS_MAX &&
    works.every(work => typeof work === 'string' && work !== '')
  )
}

const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

function macOf(key: Uint8Array, tenant: string, fingerprint: string, payload: string): string {
  return base64url(
    createHmac('sha256', key).update(`${tenant}\n${fingerprint}\n${payload}`).digest(),
  )
}

function signCursor(key: Uint8Array, admitted: Admitted, position: Position): string {
  const payload = base64url(Buffer.from(JSON.stringify([position.prepared, position.row])))
  return `${CURSOR_PREFIX}${payload}${macOf(key, admitted.tenant, admitted.fingerprint, payload)}`
}

function openCursor(
  key: Uint8Array,
  tenant: string,
  fingerprint: string,
  cursor: string,
): Outcome<Position, ModelFailure> {
  const body = typeof cursor === 'string' ? cursor.slice(CURSOR_PREFIX.length) : ''
  if (!cursor.startsWith(CURSOR_PREFIX) || body.length <= MAC_LENGTH)
    return fail(invalid('after', 'cursor'))
  const payload = body.slice(0, -MAC_LENGTH)
  const given = Buffer.from(body.slice(-MAC_LENGTH))
  const expected = Buffer.from(macOf(key, tenant, fingerprint, payload))
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return fail(invalid('after', 'cursor'))
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'number' &&
      Number.isSafeInteger(value[1])
    )
      return succeed({ prepared: value[0], row: value[1] })
  } catch {}
  return fail(invalid('after', 'cursor'))
}

function queryFailure(input: ModelDispatchFactsQuery): ModelFailure | null {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > DISPATCH_FACTS_PAGE_MAX
  )
    return invalid('limit', 'out-of-range')
  if (input.order !== 'ascending' && input.order !== 'descending') return invalid('order', 'value')
  return consumerValid(input.consumer) ? null : invalid('consumer', 'shape')
}

function admit<P>(
  options: SqlModelDispatchFactsOptions<P>,
  key: Uint8Array,
  input: ListInput<P>,
): Outcome<Admitted, ModelFailure> {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail({ kind: 'denied', action: 'read-account' })
  const qualified = options.authority.authorize({
    action: 'read-account',
    access: { principal: input.principal, tenant: input.tenant },
    resource: { kind: 'tenant' },
  })
  if ('failure' in qualified)
    return qualified.failure.kind === 'denied'
      ? fail({ kind: 'denied', action: 'read-account' })
      : qualified
  const refused = queryFailure(input)
  if (refused !== null) return fail(refused)
  const range = rangeOf(input.range)
  if ('failure' in range) return range
  const [from, to] = range.ok ?? [null, null]
  const fingerprint = JSON.stringify([from, to, input.consumer, input.order])
  const admitted = { tenant: tenant.value, from, to, fingerprint, after: null }
  if (input.after === null) return succeed(admitted)
  const after = openCursor(key, tenant.value, fingerprint, input.after)
  return 'failure' in after ? after : succeed({ ...admitted, after: after.ok })
}

class StoredError extends Error {}

function jsonOf(value: unknown, field: string): unknown {
  if (typeof value !== 'string') throw new StoredError(field)
  try {
    return JSON.parse(value)
  } catch {
    throw new StoredError(field)
  }
}

function factOf(
  raw: unknown,
  tenant: string,
): Readonly<{ fact: ModelDispatchFact; position: Position }> {
  if (!isObject(raw)) throw new StoredError('row')
  const fact = jsonOf(raw['fact'], 'fact')
  const profile = jsonOf(raw['profile'], 'profile')
  const window =
    raw['context_window'] === null ? null : jsonOf(raw['context_window'], 'context_window')
  if (!isObject(fact) || fact['call'] !== raw['call'] || fact['dispatch'] !== raw['dispatch'])
    throw new StoredError('fact')
  if (!isObject(profile)) throw new StoredError('profile')
  if (typeof raw['prepared'] !== 'string' || typeof raw['rid'] !== 'number')
    throw new StoredError(`position of ${tenant}`)
  return {
    fact: {
      ...(fact as Omit<DispatchFactDraft, 'profile' | 'contextWindow'>),
      profile: profile as Adoption,
      contextWindow: window as ContextWindow | null,
    },
    position: { prepared: raw['prepared'], row: raw['rid'] },
  }
}

function pageOf(
  key: Uint8Array,
  admitted: Admitted,
  output: JsonValue,
  limit: number,
): ModelDispatchFactsPage {
  if (!isObject(output) || !Array.isArray(output['rows'])) throw new StoredError('read')
  const undated = output['undated']
  if (typeof undated !== 'number' || !Number.isSafeInteger(undated))
    throw new StoredError('undated')
  const read = output['rows'].map(raw => factOf(raw, admitted.tenant))
  const page = read.slice(0, limit)
  const last = page[page.length - 1]
  return {
    entries: page.map(item => item.fact),
    undated,
    next:
      read.length > limit && last !== undefined ? signCursor(key, admitted, last.position) : null,
  }
}

function readInputOf<P>(scope: Admitted, input: ListInput<P>): JsonValue {
  return {
    tenant: scope.tenant,
    owner: input.consumer?.owner ?? null,
    works: input.consumer === null ? [] : [...input.consumer.works],
    from: scope.from,
    to: scope.to,
    order: input.order,
    afterPrepared: scope.after?.prepared ?? null,
    afterRow: scope.after?.row ?? null,
    limit: input.limit,
  }
}

async function list<P>(
  options: SqlModelDispatchFactsOptions<P>,
  key: Uint8Array,
  input: ListInput<P>,
): Promise<Outcome<ModelDispatchFactsPage, ModelFailure>> {
  const admitted = admit(options, key, input)
  if ('failure' in admitted) return admitted
  const scope = admitted.ok
  const domain = await domainOf(options.domains, scope.tenant)
  if ('failure' in domain) return domain
  if (domain.ok.kind === 'unregistered') return succeed({ entries: [], undated: 0, next: null })
  const result = await options.storage.read({
    domain: domain.ok.domain,
    handler: DISPATCH_FACTS_HANDLER,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input: readInputOf(scope, input),
  })
  if (result.kind !== 'read')
    return fail(
      unavailable(
        `read ${DISPATCH_FACTS_HANDLER}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`,
      ),
    )
  try {
    return succeed(pageOf(key, scope, result.output, input.limit))
  } catch (error) {
    if (error instanceof StoredError)
      return fail(unavailable(`stored dispatch fact ${error.message}`))
    throw error
  }
}

export function createSqlModelDispatchFacts<P>(
  options: SqlModelDispatchFactsOptions<P>,
): ModelDispatchFacts<P> {
  const key = options.cursorKey ?? randomBytes(32)
  return { list: input => list(options, key, input) }
}
