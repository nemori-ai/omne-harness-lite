import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { linesArgument, readingConfigOf, readReadingConfig } from '../src/config.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

it('gives the same warn and alert pair to cyclomatic complexity and CRAP, as omne bands the score', () => {
  const config = readingConfigOf({ thresholds: { warn: 7, alert: 9 } }, /^(expect)/u)
  expect(config).toEqual({
    cyclomatic: { warn: 7, alert: 9 },
    crap: { warn: 7, alert: 9 },
    assertPattern: '^(expect)',
  })
  expect(linesArgument(config.crap)).toBe('7,9')
})

it('refuses missing or inverted lines instead of falling back to defaults', () => {
  expect(() => readingConfigOf({}, /x/u)).toThrow('warn ≤ alert')
  expect(() => readingConfigOf({ thresholds: { warn: 13, alert: 12 } }, /x/u)).toThrow(
    'warn ≤ alert',
  )
})

it('reads the lines and the assertion pattern from the repository config file', () => {
  const file = JSON.parse(readFileSync(`${ROOT}/repo-toolchain.config.json`, 'utf8')) as {
    metrics: { thresholds: { warn: number; alert: number } }
    loop: { sensors: { assertions: { assertionPattern: string } } }
  }
  const config = readReadingConfig(ROOT)
  expect(config.cyclomatic).toEqual(file.metrics.thresholds)
  expect(config.crap).toEqual(file.metrics.thresholds)
  expect(config.assertPattern).toBe(file.loop.sensors.assertions.assertionPattern)
})

it('refuses a metrics section that is missing or not an object', () => {
  for (const metrics of [undefined, null, 'x', 7])
    expect(() => readingConfigOf(metrics, /x/u)).toThrow('warn ≤ alert')
})

it('refuses a line that is a number written as text, though the text compares like a number', () => {
  expect(() => readingConfigOf({ thresholds: { warn: '5', alert: 9 } }, /x/u)).toThrow(
    'warn ≤ alert',
  )
  expect(() => readingConfigOf({ thresholds: { warn: 7, alert: '12' } }, /x/u)).toThrow(
    'warn ≤ alert',
  )
})

it('accepts warn equal to alert', () => {
  expect(readingConfigOf({ thresholds: { warn: 9, alert: 9 } }, /x/u).crap).toEqual({
    warn: 9,
    alert: 9,
  })
})
