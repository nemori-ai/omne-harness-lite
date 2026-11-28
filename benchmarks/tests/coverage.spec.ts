import { describe, expect, it } from 'vitest'
import { accountedFor, COVERED, coverageGate, NOT_COVERED } from '../src/coverage.ts'

const ALL = [...Object.keys(COVERED), ...Object.keys(NOT_COVERED)]

describe('the entry kinds the workloads account for', () => {
  it('lists no kind twice: a kind is in a workload or on the list of those that are not', () => {
    expect(new Set(ALL).size).toBe(ALL.length)
    for (const reason of Object.values(NOT_COVERED)) expect(reason.length).toBeGreaterThan(20)
  })

  it('passes when the product has exactly the listed kinds', () => {
    expect(accountedFor(ALL)).toEqual({ unlisted: [], gone: [] })
    expect(coverageGate(ALL, ['message.user', 'run.terminal'])).toMatchObject({ state: 'pass' })
  })

  it('is blocked by a kind the product added and by one it dropped, naming them', () => {
    const more = coverageGate([...ALL, 'session.brand-new'], [])
    expect(more).toMatchObject({ state: 'blocked' })
    expect(more.detail).toContain('the product has kinds the list does not: session.brand-new')
    const less = coverageGate(
      ALL.filter(kind => kind !== 'hitl.decision'),
      [],
    )
    expect(less.detail).toContain('the list has kinds the product does not: hitl.decision')
  })

  it('is blocked when a run shows a kind the list only declares or does not cover', () => {
    const shown = coverageGate(ALL, ['message.user', 'session.archived'])
    expect(shown).toMatchObject({ state: 'blocked' })
    expect(shown.detail).toContain('session.archived')
  })
})
