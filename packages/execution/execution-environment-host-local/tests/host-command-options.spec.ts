// The command bounds as configuration: which values each option accepts, the issue a rejected value
// is reported with (the provider throws it as a RangeError, the plugin configuration shows it), the
// order the checks run in when several values are wrong, and the chunk bound against the buffer
// bound when one of them is left at its initial value. Pure functions; no process is started.
import { describe, expect, it } from 'vitest'
import { commandDefaults, commandOptionsIssue, commandSettings } from '../src/host-command.ts'

const byteOptions = ['maxBufferedBytes', 'maxChunkBytes'] as const
const timeOptions = ['startBoundMs', 'graceMs', 'stopBoundMs', 'probeRetryMs'] as const
const countOptions = ['retainedPerScope', 'retainedPollMs'] as const

/** Values a whole-number option of one or more refuses; the last two are not numbers at all. */
const notWholeOneOrMore = [0, -1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, '1', null]

describe.each(byteOptions)('%s', name => {
  it('accepts one byte and more', () => {
    // Both byte bounds take the value, so the chunk never exceeds the buffer.
    for (const value of [1, 4096, 2 ** 40])
      expect(commandOptionsIssue({ maxBufferedBytes: value, maxChunkBytes: value })).toBe(undefined)
    expect(commandOptionsIssue({ [name]: 65_536 })).toBe(undefined)
  })

  it.each(notWholeOneOrMore)('refuses %s with the bytes issue', value => {
    expect(commandOptionsIssue({ [name]: value })).toBe(
      `${name} must be a whole number of bytes, one or more`,
    )
  })
})

describe.each(timeOptions)('%s', name => {
  it('accepts zero, a fraction and a large finite value', () => {
    for (const value of [0, 0.5, 1, 2 ** 60])
      expect(commandOptionsIssue({ [name]: value })).toBe(undefined)
  })

  it.each([-1, -0.001, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, '0', null])(
    'refuses %s with the milliseconds issue',
    value => {
      expect(commandOptionsIssue({ [name]: value })).toBe(
        `${name} must be a finite number of milliseconds, zero or more`,
      )
    },
  )
})

describe.each(countOptions)('%s', name => {
  it('accepts one and more', () => {
    for (const value of [1, 2, 1000]) expect(commandOptionsIssue({ [name]: value })).toBe(undefined)
  })

  it.each(notWholeOneOrMore)('refuses %s with the count issue', value => {
    expect(commandOptionsIssue({ [name]: value })).toBe(
      `${name} must be a whole number, one or more`,
    )
  })
})

describe('residuePolicy', () => {
  it.each(['retain', 'stop'])('accepts %s', value => {
    expect(commandOptionsIssue({ residuePolicy: value })).toBe(undefined)
  })

  it.each(['keep', 'Retain', '', 0, null, true])('refuses %s', value => {
    expect(commandOptionsIssue({ residuePolicy: value })).toBe(
      "residuePolicy must be 'retain' or 'stop'",
    )
  })
})

describe('the order of the checks', () => {
  it.each([
    [
      'the buffer bound before the chunk bound',
      { maxChunkBytes: 0, maxBufferedBytes: 0 },
      'maxBufferedBytes must be a whole number of bytes, one or more',
    ],
    [
      'a byte bound before a time bound',
      { graceMs: -1, maxChunkBytes: 1.5 },
      'maxChunkBytes must be a whole number of bytes, one or more',
    ],
    [
      'a time bound before a count',
      { retainedPollMs: 0, startBoundMs: Number.NaN },
      'startBoundMs must be a finite number of milliseconds, zero or more',
    ],
    [
      'the time bounds in their own order',
      { probeRetryMs: -1, stopBoundMs: -1, graceMs: -1 },
      'graceMs must be a finite number of milliseconds, zero or more',
    ],
    [
      'a count before the policy',
      { residuePolicy: 'keep', retainedPerScope: 0 },
      'retainedPerScope must be a whole number, one or more',
    ],
    [
      'the policy before the chunk against the buffer',
      { residuePolicy: 'keep', maxChunkBytes: 2 * 1024 * 1024 },
      "residuePolicy must be 'retain' or 'stop'",
    ],
  ])('reports %s', (_, options, issue) => {
    expect(commandOptionsIssue(options)).toBe(issue)
  })
})

describe('the chunk bound against the buffer bound', () => {
  const exceeds = 'maxChunkBytes must not exceed maxBufferedBytes'

  it.each([
    ['a chunk above the initial buffer', { maxChunkBytes: 2 * 1024 * 1024 }, exceeds],
    ['a buffer below the initial chunk', { maxBufferedBytes: 65_535 }, exceeds],
    ['a buffer equal to the initial chunk', { maxBufferedBytes: 65_536 }, undefined],
    ['a chunk equal to the initial buffer', { maxChunkBytes: 1024 * 1024 }, undefined],
    ['a chunk above its own buffer', { maxChunkBytes: 11, maxBufferedBytes: 10 }, exceeds],
    ['a chunk equal to its own buffer', { maxChunkBytes: 10, maxBufferedBytes: 10 }, undefined],
  ])('%s', (_, options, issue) => {
    expect(commandOptionsIssue(options)).toBe(issue)
  })
})

it('ignores the fields that are not command options, as the plugin configuration passes them', () => {
  expect(commandOptionsIssue({ filesRoot: 'relative', stateDirectory: 7, drainBoundMs: -1 })).toBe(
    undefined,
  )
  expect(commandOptionsIssue({})).toBe(undefined)
})

describe('commandSettings', () => {
  it('fills every option with the initial values of the SPEC table, and freezes the result', () => {
    const settings = commandSettings()
    expect(settings).toEqual({
      maxBufferedBytes: 1024 * 1024,
      maxChunkBytes: 64 * 1024,
      startBoundMs: 10_000,
      graceMs: 5_000,
      stopBoundMs: 10_000,
      probeRetryMs: 60_000,
      residuePolicy: 'retain',
      retainedPerScope: 8,
      retainedPollMs: 1_000,
    })
    expect(settings).toEqual(commandDefaults)
    expect(Object.isFrozen(settings)).toBe(true)
  })

  it('keeps the given values over the initial ones', () => {
    expect(
      commandSettings({ graceMs: 0, residuePolicy: 'stop', maxBufferedBytes: 64 * 1024 }),
    ).toEqual({ ...commandDefaults, graceMs: 0, residuePolicy: 'stop', maxBufferedBytes: 65_536 })
  })

  it.each([
    [{ stopBoundMs: -1 }, 'stopBoundMs must be a finite number of milliseconds, zero or more'],
    [{ maxBufferedBytes: 4096 }, 'maxChunkBytes must not exceed maxBufferedBytes'],
  ])('throws the issue of %o as a RangeError', (options, issue) => {
    expect(() => commandSettings(options)).toThrow(new RangeError(issue))
    expect(() => commandSettings(options)).toThrow(RangeError)
  })
})
