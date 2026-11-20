// Three reads over the registered sources, each checked first, a session resolved to its consumers:
// statistics and occupancy read every source in full, records a page at a time.
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  checkUsageQuery,
  fold,
  occupancyOf,
  type Usage,
  type UsageConsumer,
  type UsageDependency,
  type UsageFact,
  type UsageFailure,
  type UsagePortFailure,
  type UsageQuery,
  type UsageRecordsQuery,
  type UsageSessionScope,
  type UsageSource,
  type UsageSourcePage,
} from '@omne-harness/usage-contract'

/** Page size asked of a source, pages one query may read, buckets one query may ask for. */
export type UsageLimits = Readonly<{ page: number; pages: number; buckets: number }>

export type UsageDeps<P> = Readonly<{
  sources: () => readonly UsageSource<P>[]
  sessionScope: () => UsageSessionScope<P> | undefined
  limits: UsageLimits
}>

type Read = Readonly<{ facts: readonly UsageFact[]; undated: number }>

const failureOf = (dependency: UsageDependency, failure: UsagePortFailure): UsageFailure =>
  failure.kind === 'denied'
    ? { kind: 'denied', dependency }
    : { kind: 'unavailable', dependency, diagnostic: failure.diagnostic }

async function consumerOf<P>(
  deps: UsageDeps<P>,
  input: Access<P> & Readonly<{ scope: UsageQuery['scope'] }>,
): Promise<Outcome<readonly UsageConsumer[] | null, UsageFailure>> {
  if (input.scope.kind !== 'session') return succeed(null)
  const dependency: UsageDependency = { kind: 'session-scope' }
  const scope = deps.sessionScope()
  if (scope === undefined)
    return fail({ kind: 'unavailable', dependency, diagnostic: 'no session scope is registered' })
  try {
    const answer = await scope.resolve({
      principal: input.principal,
      tenant: input.tenant,
      session: input.scope.session,
    })
    if ('failure' in answer) return fail(failureOf(dependency, answer.failure))
    if (answer.ok.kind === 'absent') return fail({ kind: 'not-found', what: 'session' })
    return succeed(answer.ok.consumers)
  } catch {
    return fail({ kind: 'unavailable', dependency, diagnostic: 'the session scope threw' })
  }
}

function chunks(
  consumers: readonly UsageConsumer[] | null,
  size: number,
): readonly (UsageConsumer | null)[] {
  if (consumers === null) return [null]
  const parts: UsageConsumer[] = []
  for (const { owner, works } of consumers)
    for (let at = 0; at < works.length; at += size)
      parts.push({ owner, works: works.slice(at, at + size) })
  return parts
}

type SourceRequest<P> = Access<P> & Readonly<{ range: UsageQuery['range'] | null }>

async function listOnce<P>(
  source: UsageSource<P>,
  request: SourceRequest<P> &
    Readonly<{ consumer: UsageConsumer | null; after: string | null; limit: number }>,
): Promise<Outcome<UsageSourcePage, UsageFailure>> {
  const dependency: UsageDependency = { kind: 'source', name: source.name }
  try {
    const answer = await source.list(request)
    return 'failure' in answer ? fail(failureOf(dependency, answer.failure)) : answer
  } catch {
    return fail({ kind: 'unavailable', dependency, diagnostic: 'the source threw' })
  }
}

async function readSource<P>(
  source: UsageSource<P>,
  request: SourceRequest<P> & Readonly<{ consumers: readonly UsageConsumer[] | null }>,
  budget: { pages: number },
  page: number,
): Promise<Outcome<Read, UsageFailure>> {
  const limit = Math.min(page, source.limits.page)
  const facts: UsageFact[] = []
  let undated = 0
  const { consumers, ...access } = request
  for (const consumer of chunks(consumers, source.limits.works)) {
    let after: string | null = null
    let first = true
    while (first || after !== null) {
      if (budget.pages === 0) return fail({ kind: 'too-large', limit: 'pages' })
      budget.pages -= 1
      const answer: Outcome<UsageSourcePage, UsageFailure> = await listOnce(source, {
        ...access,
        consumer,
        after,
        limit,
      })
      if ('failure' in answer) return answer
      for (const fact of answer.ok.entries) facts.push(fact)
      if (first) undated += answer.ok.undated
      first = false
      after = answer.ok.next
    }
  }
  return succeed({ facts, undated })
}

/** Every registered source read in full within one budget of pages; the first failure stops it. */
async function readAll<P>(
  sources: readonly UsageSource<P>[],
  request: SourceRequest<P> & Readonly<{ consumers: readonly UsageConsumer[] | null }>,
  limits: UsageLimits,
): Promise<Outcome<Read, UsageFailure>> {
  const budget = { pages: limits.pages }
  const facts: UsageFact[] = []
  let undated = 0
  for (const source of sources) {
    const read = await readSource(source, request, budget, limits.page)
    if ('failure' in read) return read
    for (const fact of read.ok.facts) facts.push(fact)
    undated += read.ok.undated
  }
  return succeed({ facts, undated })
}

function checkedLimits(limits: UsageLimits): UsageLimits {
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(`usage limit ${name} must be a positive integer`)
  return limits
}

export function createUsage<P>(deps: UsageDeps<P>): Usage<P> {
  const limits = checkedLimits(deps.limits)
  return {
    async query(input) {
      const checked = checkUsageQuery(input, { buckets: limits.buckets })
      if ('failure' in checked) return checked
      const consumers = await consumerOf(deps, input)
      if ('failure' in consumers) return consumers
      const sources = deps.sources()
      const { principal, tenant } = input
      const read = await readAll(
        sources,
        { principal, tenant, range: checked.ok.range, consumers: consumers.ok },
        limits,
      )
      if ('failure' in read) return read
      const names = sources.map(source => source.name).sort()
      return succeed(fold(read.ok.facts, checked.ok, { sources: names, undated: read.ok.undated }))
    },

    async records(input) {
      const start = startOf(input, limits.page)
      if ('failure' in start) return start
      const consumers = await consumerOf(deps, input)
      if ('failure' in consumers) return consumers
      const sources = [...deps.sources()].sort((a, b) => (a.name < b.name ? -1 : 1))
      const { range } = start.ok
      const access = { principal: input.principal, tenant: input.tenant, range }
      const to = Date.parse(range.to)
      let position: Position | null = start.ok.at
      for (let reads = 0; position !== null && reads < limits.pages; reads += 1) {
        const step: Step<P> = stepAt(sources, consumers.ok, position)
        if (step.kind === 'skip') {
          position = step.next
          continue
        }
        const page: Outcome<UsageSourcePage, UsageFailure> = await listOnce(step.source, {
          ...access,
          consumer: step.consumer,
          after: position.cursor,
          limit: Math.min(input.limit, step.source.limits.page),
        })
        if ('failure' in page) return page
        const next = nextAfter(position, page.ok.next)
        const entries = page.ok.entries.filter(datedBefore(to))
        if (entries.length > 0)
          return succeed({ entries, next: cursorOf(start.ok.fingerprint, next) })
        position = next
      }
      return position === null
        ? succeed({ entries: [], next: null })
        : fail({ kind: 'too-large', limit: 'pages' })
    },

    async occupancy(input) {
      const consumers = await consumerOf(deps, {
        ...input,
        scope: { kind: 'session', session: input.session },
      })
      if ('failure' in consumers) return consumers
      const { principal, tenant } = input
      const request = { principal, tenant, range: null, consumers: consumers.ok }
      const read = await readAll(deps.sources(), request, limits)
      return 'failure' in read ? read : succeed(occupancyOf(read.ok.facts))
    },
  }
}

function tenantText(tenant: Access<unknown>['tenant']): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('usage: the tenant is not a minted TenantId')
  return encoded.value
}

type Position = Readonly<{ source: number; chunk: number; cursor: string | null }>
const FIRST: Position = { source: 0, chunk: 0, cursor: null }

/** Records are checked as a query is; the page within the limit, the cursor of this read. */
function startOf<P>(
  input: Access<P> & UsageRecordsQuery,
  page: number,
): Outcome<
  Readonly<{ fingerprint: string; at: Position; range: UsageQuery['range'] }>,
  UsageFailure
> {
  const { scope } = input
  const checked = checkUsageQuery(
    { scope, range: input.range, zone: 'UTC', bucket: 'none', groupBy: [] },
    { buckets: 1 },
  )
  if ('failure' in checked) return checked
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > page)
    return fail({ kind: 'invalid', field: 'limit', reason: 'out-of-range' })
  const { range } = checked.ok
  const fingerprint = JSON.stringify([tenantText(input.tenant), scope, range])
  const at = input.after === null ? FIRST : positionOf(fingerprint, input.after)
  return at === null
    ? fail({ kind: 'invalid', field: 'after', reason: 'cursor' })
    : succeed({ fingerprint, at, range })
}

type Step<P> =
  | Readonly<{ kind: 'read'; source: UsageSource<P>; consumer: UsageConsumer | null }>
  | Readonly<{ kind: 'skip'; next: Position | null }>

/** The page a position reads: of its source and batch, else the next source, else none. */
function stepAt<P>(
  sources: readonly UsageSource<P>[],
  consumers: readonly UsageConsumer[] | null,
  at: Position,
): Step<P> {
  const source = sources[at.source]
  if (source === undefined) return { kind: 'skip', next: null }
  const consumer = chunks(consumers, source.limits.works)[at.chunk]
  return consumer === undefined
    ? { kind: 'skip', next: { source: at.source + 1, chunk: 0, cursor: null } }
    : { kind: 'read', source, consumer }
}

const datedBefore =
  (to: number) =>
  (fact: UsageFact): boolean =>
    fact.at !== null && Date.parse(fact.at) < to

const nextAfter = (at: Position, cursor: string | null): Position =>
  cursor !== null ? { ...at, cursor } : { source: at.source, chunk: at.chunk + 1, cursor: null }
const CURSOR = 'ur1.'

function cursorOf(fingerprint: string, at: Position): string {
  return `${CURSOR}${Buffer.from(JSON.stringify([fingerprint, at.source, at.chunk, at.cursor])).toString('base64url')}`
}

function positionOf(fingerprint: string, cursor: string): Position | null {
  if (!cursor.startsWith(CURSOR)) return null
  try {
    const [given, source, chunk, after] = JSON.parse(
      Buffer.from(cursor.slice(CURSOR.length), 'base64url').toString('utf8'),
    ) as unknown[]
    const index = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0
    if (given !== fingerprint || !index(source) || !index(chunk)) return null
    if (after !== null && typeof after !== 'string') return null
    return { source: source as number, chunk: chunk as number, cursor: after }
  } catch {
    return null
  }
}
