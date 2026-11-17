import { expect, it } from 'vitest'
import {
  DEFAULT_COMPACTION_CONFIGURATION,
  isDefaultCompactionConfiguration,
} from '../src/default-configuration.ts'
import { readDefaultState } from '../src/default-state.ts'

it.each([
  { retainPercent: -1 },
  { retainPercent: 101 },
  { retainPercent: 0.5 },
  { summaryAttempts: 0 },
  { summaryAttempts: 4 },
  { summaryAttempts: Infinity },
  { maxToolTextBytes: 0 },
  { maxToolTextBytes: 65537 },
  { trimToolText: 'yes' },
  { unknown: true },
])('rejects invalid algorithm configuration %j in a restored task', patch => {
  const configuration = { ...DEFAULT_COMPACTION_CONFIGURATION, ...patch }
  expect(isDefaultCompactionConfiguration(configuration)).toBe(false)
  expect(
    readDefaultState(JSON.stringify({ version: 1, phase: 'preparing', configuration })),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'execution' } })
})

it('restores configuration before a Model intent exists', () => {
  const state = {
    version: 1,
    phase: 'preparing',
    configuration: {
      retainPercent: 0,
      trimToolText: false,
      maxToolTextBytes: 1,
      summaryAttempts: 1,
    },
  }
  expect(readDefaultState(JSON.stringify(state))).toEqual({ ok: state })
})
