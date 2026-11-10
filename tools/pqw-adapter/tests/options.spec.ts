import { expect, it } from 'vitest'
import { parseOptions, UsageError } from '../src/options.ts'

const ALL = [
  '--base',
  '--scope',
  '--files',
  '--full',
  '--plan-only',
  '--out',
  '--workers',
  '--max-lines',
]

it('collects several values after --scope, repeated flags and comma lists, and skips the pnpm separator', () => {
  const options = parseOptions(
    [
      '--',
      '--base',
      'abc',
      '--scope',
      'a/',
      'b/',
      '--scope',
      'c/,d/',
      '--files',
      'x.ts',
      '--plan-only',
    ],
    ALL,
  )
  expect(options).toEqual({
    base: 'abc',
    scopes: ['a/', 'b/', 'c/', 'd/'],
    files: ['x.ts'],
    full: false,
    planOnly: true,
  })
})

it('parses numbers and flags', () => {
  expect(
    parseOptions(['--workers', '4', '--max-lines', '900', '--full', '--out', '/o'], ALL),
  ).toEqual({
    out: '/o',
    workers: 4,
    maxLines: 900,
    scopes: [],
    files: [],
    full: true,
    planOnly: false,
  })
})

it('rejects unknown flags, missing values, repeats and non-positive numbers as usage errors', () => {
  expect(() => parseOptions(['--full'], ['--base'])).toThrow(UsageError)
  expect(() => parseOptions(['--base'], ALL)).toThrow('--base 要给值')
  expect(() => parseOptions(['--scope', '--full'], ALL)).toThrow('--scope 要给值')
  expect(() => parseOptions(['--base', 'a', '--base', 'b'], ALL)).toThrow('只能给一次')
  expect(() => parseOptions(['--workers', '0'], ALL)).toThrow('正整数')
})
