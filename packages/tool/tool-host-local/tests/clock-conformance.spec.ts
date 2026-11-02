// The ToolClock conformance suite (P07) of the contract package, run against the host clock on a
// manual time source. The fixture moves the sources the clock reads and nothing else, so a case
// that turned not applicable would fail the table below.
import { describe, expect, it } from 'vitest'
import {
  runConformanceCase,
  testingTenant,
  toolClockConformance,
  type ToolClockFixture,
} from '@omne-harness/tool-contract/testing'
import type { ToolClock } from '@omne-harness/tool-contract/provider'
import { manualSources } from './clock-values.ts'
import { createLocalToolClock } from '@omne-harness/tool-host-local'

const NOT_APPLICABLE: Readonly<Record<string, string>> = {}

function fixture(): ToolClockFixture {
  const time = manualSources()
  let current = createLocalToolClock({ ...time.sources, epoch: 'run-1' })
  let runs = 1
  // A restart or another host: a clock of another epoch reads the same sources.
  const clock: ToolClock = {
    now: () => current.now(),
    begin: input => current.begin(input),
    elapsed: evidence => current.elapsed(evidence),
    waitUntil: (instant, signal) => current.waitUntil(instant, signal),
  }
  return {
    clock,
    access: {
      principal: 'tester',
      tenant: testingTenant(`org_${'a'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
    },
    advance: time.advance,
    setBack: time.setBack,
    instantAfter: time.instantAfter,
    changeEpoch: () => {
      runs += 1
      current = createLocalToolClock({ ...time.sources, epoch: `run-${runs}` })
    },
  }
}

describe('G4 conformance: the host clock against the ToolClock suite', () => {
  const cases = toolClockConformance()

  it('runs every case of the suite', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases)('$clause $name', async conformance => {
    const verdict = await runConformanceCase(conformance, fixture())
    const missing = NOT_APPLICABLE[conformance.name]
    expect(verdict).toEqual(
      missing === undefined ? { kind: 'passed' } : { kind: 'not-applicable', handle: missing },
    )
  })
})
