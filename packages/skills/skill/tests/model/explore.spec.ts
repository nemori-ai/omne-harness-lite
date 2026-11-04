/**
 * @module-tag slow
 * Heavy CPU: each case enumerates a bounded space of worlds, schedules and requests and drives
 * the real services through every combination (about 10^5 operations per property).
 */
// The bounded exploration of S1-S6 against the real services (`dist`). The spaces and their
// sizes are in tests/model/README.md; the theorems in verification/README.md. An empty violation
// list is a bounded result for the enumerated space only, not a proof for every world.
import { expect, it } from 'vitest'
import { exploreAbort } from './abort.ts'
import { exploreBasis } from './basis.ts'
import { exploreDisclosure } from './disclosure.ts'
import { exploreOrder } from './order.ts'
import { exploreRange } from './range.ts'
import { exploreWholeUnknown } from './whole-unknown.ts'

const MINUTES = 4 * 60_000

it(
  'S1: answers an observer the same in a world and in its twin without the hidden identity',
  async () => {
    const report = await exploreDisclosure()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(100_000)
  },
  MINUTES,
)

it(
  'S2: an undecided port answer makes the whole answer unknown or source-unavailable',
  async () => {
    const report = await exploreWholeUnknown()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(10_000)
  },
  MINUTES,
)

it(
  'S3: a success gives only bytes of the pinned material',
  async () => {
    const report = await exploreBasis()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(1_000)
  },
  MINUTES,
)

it(
  'S4: a page starts and ends on character boundaries within the page limit',
  async () => {
    const report = await exploreRange()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(10_000)
  },
  MINUTES,
)

it(
  'S5: the catalog answer does not depend on the completion order of the read checks',
  async () => {
    const report = await exploreOrder()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(1_000)
  },
  MINUTES,
)

it(
  'S6: after an abort no port is called and nothing partial is given',
  async () => {
    const report = await exploreAbort()
    expect(report.violations).toStrictEqual([])
    expect(report.cases).toBeGreaterThan(1_000)
  },
  MINUTES,
)
