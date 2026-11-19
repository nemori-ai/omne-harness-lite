// One statistics query: checked before any read, the session resolved to a consumer scope, every
// registered source read in full, then folded. A source that cannot answer leaves no total.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  checkUsageQuery,
  fold,
  type Usage,
  type UsageConsumer,
  type UsageDependency,
  type UsageFact,
  type UsageFailure,
  type UsagePortFailure,
  type UsageQuery,
  type UsageSessionScope,
  type UsageSource,
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
  input: Access<P> & UsageQuery,
): Promise<Outcome<UsageConsumer | null, UsageFailure>> {
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
    return succeed(answer.ok.consumer)
  } catch {
    return fail({ kind: 'unavailable', dependency, diagnostic: 'the session scope threw' })
  }
}

function chunks(consumer: UsageConsumer | null, size: number): readonly (UsageConsumer | null)[] {
  if (consumer === null) return [null]
  const parts: UsageConsumer[] = []
  for (let at = 0; at < consumer.works.length; at += size)
    parts.push({ owner: consumer.owner, works: consumer.works.slice(at, at + size) })
  return parts
}

async function readSource<P>(
  source: UsageSource<P>,
  request: Access<P> & Readonly<{ range: UsageQuery['range']; consumer: UsageConsumer | null }>,
  budget: { pages: number },
  page: number,
): Promise<Outcome<Read, UsageFailure>> {
  const dependency: UsageDependency = { kind: 'source', name: source.name }
  const limit = Math.min(page, source.limits.page)
  const facts: UsageFact[] = []
  let undated = 0
  for (const consumer of chunks(request.consumer, source.limits.works)) {
    let after: string | null = null
    let first = true
    while (first || after !== null) {
      if (budget.pages === 0) return fail({ kind: 'too-large', limit: 'pages' })
      budget.pages -= 1
      let answer: Awaited<ReturnType<UsageSource<P>['list']>>
      try {
        answer = await source.list({ ...request, consumer, after, limit })
      } catch {
        return fail({ kind: 'unavailable', dependency, diagnostic: 'the source threw' })
      }
      if ('failure' in answer) return fail(failureOf(dependency, answer.failure))
      for (const fact of answer.ok.entries) facts.push(fact)
      if (first) undated += answer.ok.undated
      first = false
      after = answer.ok.next
    }
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
      const consumer = await consumerOf(deps, input)
      if ('failure' in consumer) return consumer
      const sources = deps.sources()
      const names = sources.map(source => source.name).sort()
      const request = {
        principal: input.principal,
        tenant: input.tenant,
        range: input.range,
        consumer: consumer.ok,
      }
      const budget = { pages: limits.pages }
      const facts: UsageFact[] = []
      let undated = 0
      for (const source of sources) {
        const read = await readSource(source, request, budget, limits.page)
        if ('failure' in read) return read
        for (const fact of read.ok.facts) facts.push(fact)
        undated += read.ok.undated
      }
      return succeed(fold(facts, checked.ok, { sources: names, undated }))
    },
  }
}
