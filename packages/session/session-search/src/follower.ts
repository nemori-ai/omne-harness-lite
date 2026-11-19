import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { followSession } from './follow.ts'
import type { HistoryIndex } from './index-port.ts'
import type { HistoryLogReader } from './log-port.ts'

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

// The generation to write to: the one being built if there is one, else the current one. An index
// that is absent or broken is begun anew; the build is adopted by the pass that finds nothing behind.
async function targetOf(deps: Ports, tenant: TenantId, total: number) {
  const state = await deps.index.state(tenant)
  if (state.kind === 'ready') return succeed({ generation: state.generation, building: false })
  if (state.kind === 'rebuilding') return succeed({ generation: state.building, building: true })
  const begun = await deps.index.beginRebuild(tenant, total)
  if ('failure' in begun) return begun
  return succeed({ generation: begun.ok.generation, building: true })
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
  let steps = 0
  let behind = 0
  for (const { session, tail } of listed.ok) {
    let cover = covers.ok.get(session) ?? { through: '0' as typeof tail, at: 0 }
    while (BigInt(cover.through) < BigInt(tail) && steps < limits.maxSteps) {
      const maxBytes = limits.pageBytes
      const step = await followSession(deps, { tenant, generation, session, cover, maxBytes })
      if ('failure' in step) return fail('unavailable')
      steps += 1
      cover = step.ok
      if (step.ok.exhausted) break
    }
    if (BigInt(cover.through) < BigInt(tail)) behind += 1
  }
  if (!building || behind > 0) return succeed({ behind, steps, adopted: false })
  const adopted = await deps.index.adopt(tenant, generation)
  return 'failure' in adopted ? fail('unavailable') : succeed({ behind, steps, adopted: true })
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
      // Other work of the process goes first between two passes.
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
