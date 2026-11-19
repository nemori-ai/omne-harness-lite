import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import { appendPage } from './follow.ts'
import type { Cover, HistoryIndex } from './index-port.ts'
import type { Extracted, HistoryLogReader, LogPage, LogStamp } from './log-port.ts'
import { sameStamp } from './search-memo.ts'

export type FollowLimits = Readonly<{
  pageBytes: number
  maxSteps: number
  // After a read the follower stays off the log `ratio` times as long as the read took: the
  // read threads of a tenant are few, and whoever accepts an input reads through them too.
  rest?: Readonly<{ ratio: number; now(): number; sleep(ms: number): Promise<void> }>
}>

export type FollowPass = Readonly<{
  behind: number
  steps: number
  adopted: boolean
}>

type Ports = Readonly<{ index: HistoryIndex; log: HistoryLogReader }>

// The generation to write to: the current one, or the one being built. Beginning a build that is
// already on gives that build, so an absent, a broken and a half-built index are one case.
async function targetOf(deps: Ports, tenant: TenantId, total: number) {
  const state = await deps.index.state(tenant)
  if (state.kind === 'ready') return succeed({ generation: state.generation, building: false })
  const begun = await deps.index.beginRebuild(tenant, total)
  if ('failure' in begun) return begun
  return succeed({ generation: begun.ok.generation, building: true })
}

type Behind = Readonly<{ session: SessionId; tail: SessionRevision }>
type Read = Readonly<{ session: SessionId; page: LogPage<Extracted> }>

async function* pagesOf(
  log: HistoryLogReader,
  tenant: TenantId,
  behind: readonly (Behind & Readonly<{ cover: Cover }>)[],
  { pageBytes: maxBytes, rest }: FollowLimits,
): AsyncGenerator<Read | null> {
  let owed = 0
  for (const { session, tail, cover } of behind) {
    let after = cover.through
    while (BigInt(after) < BigInt(tail)) {
      if (owed > 0) await rest?.sleep(owed)
      const began = rest?.now() ?? 0
      const page = await log.extract({ tenant, session, after, maxBytes })
      owed = rest === undefined ? 0 : (rest.now() - began) * rest.ratio
      if ('failure' in page) return yield null
      yield { session, page: page.ok }
      after = page.ok.through
    }
  }
}

type Lagging = Behind & Readonly<{ cover: Cover }>
const NO_COVER: Cover = { through: '0' as SessionRevision, at: 0 }
const short = (cover: Cover, tail: SessionRevision): boolean => BigInt(cover.through) < BigInt(tail)

async function appendPages(
  deps: Ports,
  at: Readonly<{ tenant: TenantId; generation: number }>,
  behind: readonly Lagging[],
  limits: FollowLimits,
): Promise<Readonly<{ steps: number; reached: ReadonlyMap<SessionId, Cover> }> | null> {
  const reached = new Map(behind.map(({ session, cover }) => [session, cover]))
  const pages = pagesOf(deps.log, at.tenant, behind, limits)
  const ask = (steps: number) => (steps < limits.maxSteps ? pages.next() : null)
  let steps = 0
  for (let next = ask(steps); next !== null;) {
    const read = await next
    if (read.done === true) break
    if (read.value === null) return null
    steps += 1
    next = ask(steps)
    const { session, page } = read.value
    const cover = reached.get(session) ?? NO_COVER
    const step = await appendPage(deps, { ...at, session, cover }, page)
    if ('failure' in step) return null
    reached.set(session, step.ok)
  }
  return { steps, reached }
}

export async function followTenant(
  deps: Ports,
  tenant: TenantId,
  limits: FollowLimits,
): Promise<Outcome<FollowPass, 'unavailable'>> {
  const listed = await deps.log.sessions(tenant)
  if ('failure' in listed) return listed
  const target = await targetOf(deps, tenant, listed.ok.length)
  if ('failure' in target) return target
  const { generation, building } = target.ok
  const covers = await deps.index.covers(tenant, generation)
  if ('failure' in covers) return fail('unavailable')
  const behind = listed.ok
    .map(({ session, tail }) => ({ session, tail, cover: covers.ok.get(session) ?? NO_COVER }))
    .filter(item => short(item.cover, item.tail))
  const done = await appendPages(deps, { tenant, generation }, behind, limits)
  if (done === null) return fail('unavailable')
  const { steps, reached } = done
  const left = behind.filter(item => short(reached.get(item.session)!, item.tail)).length
  if (!building || left > 0) return succeed({ behind: left, steps, adopted: false })
  const adopted = await deps.index.adopt(tenant, generation)
  return 'failure' in adopted ? fail('unavailable') : succeed({ behind: 0, steps, adopted: true })
}

export type FollowerOptions = Readonly<{
  index: HistoryIndex
  log: HistoryLogReader
  limits: FollowLimits
  intervalMs: number
  compactPages: number
  report(diagnostic: string): void
}>

export type HistoryFollower = Readonly<{
  poke(tenant: TenantId): void
  idle(): Promise<void>
  stop(): void
}>

// Where a pass that left nothing behind found the logs: while their stamp and the generation
// stand, nothing is behind, and a wake-up has nothing to read.
type Settled = Readonly<{ generation: number; heads: LogStamp }>
type Followed = {
  tenant: TenantId
  running: Promise<void> | null
  again: boolean
  settled: Settled | null
}

export function createHistoryFollower(options: FollowerOptions): HistoryFollower {
  const tenants = new Map<string, Followed>()
  let stopped = false

  const readyAt = async (tenant: TenantId): Promise<number | null> => {
    const state = await options.index.state(tenant)
    return state.kind === 'ready' ? state.generation : null
  }

  async function pass(entry: Followed): Promise<Outcome<FollowPass, string> | 'still'> {
    const { tenant, settled } = entry
    const heads = await options.log.stamp(tenant)
    if (settled !== null && 'ok' in heads && sameStamp(settled.heads, heads.ok))
      if ((await readyAt(tenant)) === settled.generation) return 'still'
    entry.settled = null
    const followed = await followTenant(options, tenant, options.limits)
    if ('failure' in followed || followed.ok.behind > 0 || 'failure' in heads) return followed
    const generation = await readyAt(tenant)
    if (generation !== null) entry.settled = { generation, heads: heads.ok }
    return followed
  }

  async function follow(entry: Followed): Promise<void> {
    do {
      entry.again = false
      const done = await pass(entry).catch((cause: unknown) => ({ failure: String(cause) }))
      if (done === 'still') return
      if ('failure' in done) return options.report(`following the history failed: ${done.failure}`)
      if (done.ok.steps > 0) await options.index.compact(entry.tenant, options.compactPages)
      if (done.ok.behind > 0) entry.again = true
      await new Promise(resume => setImmediate(resume))
    } while (entry.again && !stopped)
  }

  function poke(tenant: TenantId): void {
    if (stopped) return
    const key = JSON.stringify(tenant)
    const entry = tenants.get(key) ?? { tenant, running: null, again: false, settled: null }
    tenants.set(key, entry)
    if (entry.running !== null) entry.again = true
    else
      entry.running = follow(entry).finally(() => {
        entry.running = null
      })
  }

  const timer = setInterval(() => {
    for (const { tenant } of tenants.values()) poke(tenant)
  }, options.intervalMs)
  timer.unref()

  return {
    poke,
    async idle() {
      for (;;) {
        const running = [...tenants.values()].flatMap(entry => entry.running ?? [])
        if (running.length === 0) return
        await Promise.all(running)
      }
    },
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
