import { describe, expect, it } from 'vitest'
import { readLoopConfig, SWITCHED_SENSORS, type SwitchedSensor } from '../src/loop/config.ts'
import type { SensorScope } from '../src/loop/product-inputs.ts'
import { data, noData, type Reading } from '../src/loop/reading.ts'
import { hardLinesBroken, judgeSensors } from '../src/loop/status.ts'

const config = readLoopConfig()
const scope: SensorScope = {
  kind: 'engineering',
  evidence: {
    current: { sources: 0, tests: 0 },
    baselines: [{ commit: 'verified-commit', inputs: { sources: 0, tests: 0 } }],
  },
}
const readings: Record<SwitchedSensor, Reading<unknown>> = {
  stability: data([]),
  cochange: data([]),
  duplication: noData('arbitrary raw reason'),
  assertions: noData('another raw reason'),
  newEdges: data([]),
  topicChurn: data([]),
  worktrees: data([]),
  acceptance: data([]),
  architecture: data([]),
}

describe('engineering sensor applicability', () => {
  it('keeps raw readings intact and distinguishes inapplicable sensors from disabled ones', () => {
    const before = structuredClone(readings)
    expect(judgeSensors(readings, config, scope)).toEqual({
      status: 'judged',
      silent: [],
      off: [],
      notApplicable: [
        { sensor: 'duplication', reason: 'engineering-without-product-inputs' },
        { sensor: 'assertions', reason: 'engineering-without-product-inputs' },
      ],
    })
    const disabled = {
      ...config,
      sensors: { ...config.sensors, assertions: { ...config.sensors.assertions, enabled: false } },
    }
    expect(judgeSensors(readings, disabled, scope)).toMatchObject({
      off: ['assertions'],
      notApplicable: [{ sensor: 'duplication' }],
    })
    expect(readings).toEqual(before)
  })

  it.each(SWITCHED_SENSORS.filter(sensor => sensor !== 'duplication' && sensor !== 'assertions'))(
    'still rejects no-data from %s',
    sensor => {
      const line = judgeSensors({ ...readings, [sensor]: noData('tool failed') }, config, scope)
      expect(line).toMatchObject({ silent: [{ sensor, reason: 'tool failed' }] })
      expect(
        hardLinesBroken({
          direction: [],
          cycles: [],
          exceptedCycles: [],
          acceptanceLock: { status: 'judged', violations: [] },
          sensors: line,
        }),
      ).toBe(true)
    },
  )

  it('never exempts normal data or the default all scope', () => {
    expect(
      judgeSensors({ ...readings, duplication: data([]), assertions: data([]) }, config, scope),
    ).toMatchObject({ silent: [], notApplicable: [] })
    expect(judgeSensors(readings, config)).toMatchObject({
      silent: [{ sensor: 'duplication' }, { sensor: 'assertions' }],
      notApplicable: [],
    })
  })

  it.each([
    { current: { sources: 1, tests: 0 }, baselines: scope.evidence.baselines },
    { current: { sources: 0, tests: 1 }, baselines: scope.evidence.baselines },
    { current: { sources: 0, tests: 0 }, baselines: [] },
    {
      current: { sources: 0, tests: 0 },
      baselines: [{ commit: 'task', inputs: { sources: 0, tests: 1 } }],
    },
  ])('requires positive empty evidence for current and every baseline: %j', evidence => {
    expect(judgeSensors(readings, config, { kind: 'engineering', evidence })).toMatchObject({
      silent: [{ sensor: 'duplication' }, { sensor: 'assertions' }],
      notApplicable: [],
    })
  })
})
