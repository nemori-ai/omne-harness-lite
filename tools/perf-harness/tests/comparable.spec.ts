import { describe, expect, it } from 'vitest'
import { comparable, type ResultHead } from '../src/index.ts'

const head = (over: Partial<ResultHead> = {}): ResultHead => ({
  workload: 'w1',
  assembly: 'a1',
  facilityMajor: 1,
  machine: 'm1',
  stateQualified: true,
  probesHold: true,
  ...over,
})

describe('whether two results may be compared', () => {
  it('refuses any kind of reading across workloads, assemblies or major versions of the facility', () => {
    for (const kind of ['count', 'clocked', 'time', 'ratio'] as const) {
      expect(comparable(kind, head(), head({ workload: 'w2' })).verdict).toBe('refused')
      expect(comparable(kind, head(), head({ assembly: 'a2' })).verdict).toBe('refused')
      expect(comparable(kind, head(), head({ facilityMajor: 2 })).verdict).toBe('refused')
    }
  })

  it('compares counts across machines and whatever the state of the machine was', () => {
    const other = head({ machine: 'm2', stateQualified: false, probesHold: false })
    expect(comparable('count', head(), other)).toEqual({ verdict: 'comparable' })
  })

  it('compares ratios on one machine, and only sets them side by side across two', () => {
    expect(comparable('ratio', head(), head())).toEqual({ verdict: 'comparable' })
    expect(comparable('ratio', head(), head({ machine: 'm2' })).verdict).toBe('side-by-side')
  })

  it('blocks ratios and times when the state of a machine did not qualify', () => {
    expect(comparable('ratio', head(), head({ stateQualified: false })).verdict).toBe('blocked')
    expect(comparable('time', head({ stateQualified: false }), head()).verdict).toBe('blocked')
  })

  it('treats a count that follows the clock as a time, not as a count', () => {
    expect(comparable('clocked', head(), head({ machine: 'm2' })).verdict).toBe('blocked')
    expect(comparable('clocked', head(), head({ stateQualified: false })).verdict).toBe('blocked')
    expect(comparable('clocked', head(), head()).verdict).toBe('side-by-side')
  })

  it('blocks absolute times across machines and when the probes drifted', () => {
    expect(comparable('time', head(), head({ machine: 'm2' })).verdict).toBe('blocked')
    expect(comparable('time', head(), head({ probesHold: false })).verdict).toBe('blocked')
  })

  it('says what stands between two results', () => {
    const reasonOf = (kind: 'count' | 'time' | 'ratio', other: Partial<ResultHead>) => {
      const verdict = comparable(kind, head(), head(other))
      return 'reason' in verdict ? `${verdict.verdict}: ${verdict.reason}` : verdict.verdict
    }
    expect(reasonOf('count', { workload: 'w2' })).toBe('refused: the workloads differ')
    expect(reasonOf('count', { assembly: 'a2' })).toBe('refused: the assemblies differ')
    expect(reasonOf('count', { facilityMajor: 2 })).toBe(
      'refused: the major versions of the facility differ',
    )
    expect(reasonOf('ratio', { stateQualified: false })).toBe(
      'blocked: the state of a machine did not qualify',
    )
    expect(reasonOf('ratio', { machine: 'm2' })).toBe(
      'side-by-side: ratios of two machine configurations',
    )
    expect(reasonOf('time', { machine: 'm2' })).toBe(
      'blocked: absolute times of two machine configurations',
    )
    expect(reasonOf('time', { probesHold: false })).toBe(
      'blocked: the probes drifted from the baseline of this machine',
    )
    expect(reasonOf('time', {})).toBe('side-by-side: absolute times of two runs gate nothing')
  })

  it('never makes absolute times of two runs one comparable number: they stand side by side', () => {
    expect(comparable('time', head(), head())).toMatchObject({ verdict: 'side-by-side' })
  })
})
