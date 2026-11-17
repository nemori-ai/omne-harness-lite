import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolLedgerTimers } from '@omne-harness/tool'
import { withTimers } from '../src/foreground-timers.ts'

const START = Date.parse('2026-11-16T21:00:00.000Z')
const iso = (ms: number) => new Date(START + ms).toISOString()

beforeEach(() => vi.useFakeTimers({ now: START }))
afterEach(() => vi.useRealTimers())

type Fired = Awaited<ReturnType<ToolLedgerTimers<unknown>['fire']>>

const next = (call: string, ms: number, kind = 'call') => ({
  domain: { kind, tenant: { stored: 'copy' }, call },
  key: 'timer:threshold',
  dueAt: iso(ms),
})

function upkeep(answers: Fired[] | null) {
  const fired: unknown[] = []
  const woken: unknown[] = []
  const timers: ToolLedgerTimers<unknown> = {
    fire: async input => {
      fired.push(input)
      return answers?.shift() ?? succeed({ fired: 0, next: null })
    },
  }
  const lost = withTimers(
    {
      settings: { store: {} as never },
      dependencies: {
        commands: { settleLost: async () => fail({ kind: 'unsupported' }) as never },
        ...(answers === null ? {} : { timers }),
        clock: { now: () => new Date().toISOString() },
        instances: {
          schedule: async wake => {
            woken.push(wake)
            return succeed({ queued: true as const })
          },
        },
      },
      maintenance: () => null,
    },
    () => undefined,
  )
  const handled = (tenant: string) =>
    lost.handled(
      { principal: `p-${tenant}`, tenant, call: 'running', instance: 'i', signal: null } as never,
      { start: null, execution: null, state: { execution: { kind: 'ended' } } } as never,
      { progress: 'not-run' },
      () => undefined,
    )
  return { fired, woken, handled }
}

describe('the timer upkeep of a call run', () => {
  it('does nothing extra when the ledger has no timers', async () => {
    const u = upkeep(null)
    expect(await u.handled('t1')).toBe(false)
    expect(u.fired).toEqual([])
  })

  it('fires the due timers of the run tenant first, then wakes the call of the next timer exactly when it falls due', async () => {
    const u = upkeep([succeed({ fired: 1, next: next('c-next', 500) as never })])
    expect(await u.handled('t1')).toBe(false)
    expect(u.fired).toEqual([{ principal: 'p-t1', tenant: 't1' }])
    await vi.advanceTimersByTimeAsync(499)
    expect(u.woken).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(u.woken).toEqual([{ tenant: 't1', call: 'c-next' }])
  })

  it('wakes at once for a timer that is already due', async () => {
    const u = upkeep([succeed({ fired: 0, next: next('c-late', -100) as never })])
    await u.handled('t1')
    await vi.advanceTimersByTimeAsync(0)
    expect(u.woken).toEqual([{ tenant: 't1', call: 'c-late' }])
  })

  it('keeps one wake for each tenant: a newer next timer replaces the older one', async () => {
    const u = upkeep([
      succeed({ fired: 0, next: next('c-far', 1000) as never }),
      succeed({ fired: 0, next: next('c-near', 200) as never }),
      succeed({ fired: 0, next: next('c-other', 300) as never }),
    ])
    await u.handled('t1')
    await u.handled('t1')
    await u.handled('t2')
    await vi.advanceTimersByTimeAsync(2000)
    expect(u.woken).toEqual([
      { tenant: 't1', call: 'c-near' },
      { tenant: 't2', call: 'c-other' },
    ])
  })

  it('wakes nothing after a failed fire or for a next entry that is not a call, and the run goes on', async () => {
    const u = upkeep([
      fail({ kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'x' }),
      succeed({ fired: 0, next: next('c-queue', 10, 'queue') as never }),
    ])
    expect(await u.handled('t1')).toBe(false)
    expect(await u.handled('t1')).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(u.woken).toEqual([])
  })
})
