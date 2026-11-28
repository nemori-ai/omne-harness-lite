import { describe, expect, it } from 'vitest'
import { momentOf, stateBetween, type Sources } from '../src/index.ts'
import { described } from './machine.ts'

const stat = (name: string, parent: number, user: number, system: number, waited = 0): string =>
  `1 (${name}) S ${String(parent)} 1 1 0 -1 0 0 0 0 0 ${String(user)} ${String(system)} ${String(waited)} 0 20 0 1 0 1 1 1`

function at(processor: string, own: string, others: Readonly<Record<number, string>>): Sources {
  const base = described({
    '/proc/stat': `${processor}\ncpu0 1 1 1 1\n`,
    '/proc/self/stat': own,
    '/proc/vmstat': 'pswpin 10\npswpout 5\n',
    ...Object.fromEntries(Object.entries(others).map(([pid, text]) => [`/proc/${pid}/stat`, text])),
  })
  return {
    ...base,
    list: path =>
      path === '/proc' ? [...Object.keys(others), 'self', 'meminfo'] : base.list(path),
  }
}

const LOAD = [0.1, 0.1, 0.1] as const

describe('the state between two moments', () => {
  const first = momentOf(
    at('cpu  100 0 100 800 0 0 0 0', stat('node', 1, 10, 10), {
      50: stat('node', 1, 10, 10),
      60: stat('my child', 50, 0, 0),
      70: stat('backup (daily)', 1, 5, 5),
      80: stat('idle', 1, 3, 3),
    }),
    new Date('2026-11-27T00:00:00Z'),
    LOAD,
  )
  const last = momentOf(
    at('cpu  300 0 200 1380 60 0 0 60', stat('node', 1, 60, 60, 80), {
      50: stat('node', 1, 60, 60, 80),
      60: stat('my child', 50, 70, 10),
      70: stat('backup (daily)', 1, 55, 55),
      80: stat('idle', 1, 3, 3),
      90: stat('late', 1, 1, 1),
    }),
    new Date('2026-11-27T00:01:00Z'),
    LOAD,
  )
  const state = stateBetween(first, last, {
    self: 50,
    availableLowMiB: 14000,
    diskUsedShare: 0.95,
    heldSlot: false,
  })

  it('shares out the processor time: taken by the host, spent waiting, used by others', () => {
    expect(state.stolenShare).toBeCloseTo(60 / 1000)
    expect(state.waitingShare).toBeCloseTo(60 / 1000)
    expect(state.othersShare).toBeCloseTo((300 - 180) / 1000)
  })

  it('names the other commands that used the processor most, never this run or its children', () => {
    expect(state.busiest).toEqual(['backup (daily)', 'late'])
  })

  it('keeps the times, the loads, the memory and what it was told', () => {
    expect(state).toMatchObject({
      startedAt: '2026-11-27T00:00:00.000Z',
      endedAt: '2026-11-27T00:01:00.000Z',
      availableMiB: 15625,
      availableLowMiB: 14000,
      swappedPages: 0,
      diskUsedShare: 0.95,
      heldSlot: false,
    })
    expect(state.throttles).toEqual({ unknown: 'the machine reports no thermal throttling' })
  })

  it('answers unknown, with the reason, for what a machine does not tell', () => {
    const blind = momentOf(described(), new Date(0), LOAD)
    expect(blind.processor).toEqual({ unknown: 'cannot read /proc/stat' })
    expect(
      stateBetween(blind, blind, { self: 1, availableLowMiB: 1, diskUsedShare: 0, heldSlot: false })
        .othersShare,
    ).toEqual({ unknown: 'cannot read /proc/stat' })
    const still = stateBetween(first, first, {
      self: 50,
      availableLowMiB: 1,
      diskUsedShare: 0,
      heldSlot: false,
    })
    expect(still.stolenShare).toEqual({ unknown: 'no processor time passed' })
    const elsewhere = momentOf({ ...described(), platform: 'win32' }, new Date(0), LOAD)
    expect(elsewhere.availableMiB).toEqual({ unknown: 'not read on win32' })
  })
})
