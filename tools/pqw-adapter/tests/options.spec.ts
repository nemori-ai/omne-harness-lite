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

it('names the unknown flag before it checks numbers, and checks --workers before --max-lines', () => {
  expect(() => parseOptions(['--workers', '0', '--bogus'], ALL)).toThrow('认不出的参数：--bogus')
  expect(() => parseOptions(['--max-lines', '0', '--workers', '0'], ALL)).toThrow(
    '--workers 要正整数，给的是 0',
  )
  expect(() => parseOptions(['--max-lines', '1.5'], ALL)).toThrow(
    '--max-lines 要正整数，给的是 1.5',
  )
})

it('takes a value that is only commas for no value, and a value flag that is the last argument for a missing value', () => {
  expect(() => parseOptions(['--files', ',', ','], ALL)).toThrow('--files 要给值')
  expect(() => parseOptions(['--out', '--'], ALL)).toThrow('--out 要给值')
  expect(() => parseOptions(['--max-lines'], ALL)).toThrow('--max-lines 要给值')
})

it('adds up the values of a repeated multi-value flag and leaves unset single values out', () => {
  const options = parseOptions(['--files', 'a,b', '--files', 'c'], ALL)
  expect(options.files).toEqual(['a', 'b', 'c'])
  expect(Object.keys(options).sort()).toEqual(['files', 'full', 'planOnly', 'scopes'])
})
