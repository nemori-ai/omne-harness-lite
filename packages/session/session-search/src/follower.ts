import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import { appendPage } from './follow.ts'
import type { Cover, HistoryIndex } from './index-port.ts'
import type { EntryPage, HistoryLogReader } from './log-port.ts'

export type FollowLimits = Readonly<{
  pageBytes: number
  maxSteps: number
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
type Read = Readonly<{ session: SessionId; page: EntryPage }>

async function* pagesOf(
  log: HistoryLogReader,
  tenant: TenantId,
  behind: readonly (Behind & Readonly<{ cover: Cover }>)[],
  maxBytes: number,
): AsyncGenerator<Read | null> {
  for (const { session, tail, cover } of behind) {
    let after = cover.through
    while (BigInt(after) < BigInt(tail)) {
      const page = await log.entries({ tenant, session, after, maxBytes })
      if ('failure' in page) return yield null
      yield { session, page: page.ok }
      after = page.ok.through
    }
  }
}

/** One pass of following a tenant's logs: each session that is behind, a bounded number of steps. */
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
  const none: Cover = { through: '0' as SessionRevision, at: 0 }
  const reached = new Map<SessionId, Cover>()
  const behind = listed.ok.flatMap(({ session, tail }) => {
    const cover = covers.ok.get(session) ?? none
    return BigInt(cover.through) < BigInt(tail) ? [{ session, tail, cover }] : []
  })
  for (const { session, cover } of behind) reached.set(session, cover)
  // The next page is read while this one is appended; one read is under way at a time.
  const pages = pagesOf(deps.log, tenant, behind, limits.pageBytes)
  let steps = 0
  let next = steps < limits.maxSteps ? pages.next() : null
  while (next !== null) {
    const read = await next
    if (read.done === true) break
    if (read.value === null) return fail('unavailable')
    steps += 1
    next = steps < limits.maxSteps ? pages.next() : null
    const { session, page } = read.value
    const cover = reached.get(session) ?? none
    const step = await appendPage(deps, { tenant, generation, session, cover }, page)
    if ('failure' in step) return fail('unavailable')
    reached.set(session, step.ok)
  }
  const left = behind.filter(item => BigInt(reached.get(item.session)!.through) < BigInt(item.tail))
  if (!building || left.length > 0) return succeed({ behind: left.length, steps, adopted: false })
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
  /** A wake-up, not a fact: the tenant's logs may have moved, or its index may need building. */
  poke(tenant: TenantId): void
  idle(): Promise<void>
  stop(): void
}>

type Followed = { tenant: TenantId; running: Promise<void> | null; again: boolean }

/** Keeps the index of each tenant it is told of behind its logs by as little as it can. */
export function createHistoryFollower(options: FollowerOptions): HistoryFollower {
  const tenants = new Map<string, Followed>()
  let stopped = false

  async function follow(entry: Followed): Promise<void> {
    do {
      entry.again = false
      const pass = await followTenant(options, entry.tenant, options.limits).catch(
        (cause: unknown) => ({ failure: String(cause) }),
      )
      if ('failure' in pass) return options.report(`following the history failed: ${pass.failure}`)
      if (pass.ok.steps > 0) await options.index.compact(entry.tenant, options.compactPages)
      if (pass.ok.behind > 0) entry.again = true
      await new Promise(resume => setImmediate(resume))
    } while (entry.again && !stopped)
  }

  function poke(tenant: TenantId): void {
    if (stopped) return
    const key = JSON.stringify(tenant)
    const entry = tenants.get(key) ?? { tenant, running: null, again: false }
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
