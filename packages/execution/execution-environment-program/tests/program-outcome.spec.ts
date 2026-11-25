import { expect, it } from 'vitest'
import type { CodemodeResult } from '@earendil-works/pi-codemode'
import type { ProgramLimits } from '@omne-harness/execution-environment-contract'
import { outcomeOf } from '../src/run.ts'
import { isParseStack, prepareProgram, programLine } from '../src/source.ts'

const limits: ProgramLimits = { computeMs: 100, memoryBytes: 1 << 20, outputBytes: 10, calls: 1 }
const said = (...lines: string[]) =>
  lines.map(text => ({ type: 'text' as const, text, console: true as const }))
const failed = (
  error: Extract<CodemodeResult, { ok: false }>['error'],
  output = said(),
): CodemodeResult => ({ ok: false, error, output, calls: [] })
const settled = (value: unknown, output = said()): CodemodeResult => ({
  ok: true,
  value,
  output,
  calls: [],
  storeWrites: { set: {}, delete: [] },
})

it('names the limit, whatever the engine says of the run it was told to end', () => {
  const ended = failed({ kind: 'aborted', message: 'aborted' }, said('a', 'b'))
  expect(outcomeOf(ended, 'compute-time', 0, limits)).toEqual({
    kind: 'exceeded',
    limit: 'compute-time',
    console: 'a\nb',
  })
  expect(outcomeOf(ended, 'calls', 0, limits)).toMatchObject({ kind: 'exceeded', limit: 'calls' })
  expect(outcomeOf(ended, 'aborted', 0, limits)).toEqual({ kind: 'aborted', console: 'a\nb' })
})

it('reads a memory failure of the script or of the engine as the memory limit', () => {
  const inside = failed({ kind: 'script', name: 'InternalError', message: 'out of memory' })
  const engine = failed({ kind: 'sandbox', message: 'InternalError: out of memory' })
  for (const result of [inside, engine])
    expect(outcomeOf(result, null, 0, limits)).toEqual({
      kind: 'exceeded',
      limit: 'memory',
      console: '',
    })
  const forged = failed({ kind: 'script', name: 'Error', message: 'out of memory' })
  expect(outcomeOf(forged, null, 0, limits)).toMatchObject({ kind: 'threw', name: 'Error' })
  const other = failed({ kind: 'script', name: 'InternalError', message: 'string too long' })
  expect(outcomeOf(other, null, 0, limits)).toMatchObject({ kind: 'threw', name: 'InternalError' })
})

it('reads the output failure of the engine as the output limit', () => {
  const message = 'script output exceeded the limit of 16777216 characters'
  const over = failed({ kind: 'script', name: 'RangeError', message })
  expect(outcomeOf(over, null, 0, limits)).toMatchObject({ kind: 'exceeded', limit: 'output' })
  for (const error of [
    { kind: 'script', name: 'RangeError', message: `no: ${message}` },
    { kind: 'script', name: 'Error', message },
  ] as const)
    expect(outcomeOf(failed(error), null, 0, limits)).toMatchObject({ kind: 'threw' })
})

it('tells a parse error of the engine from a SyntaxError the program threw', () => {
  const parse = 'SyntaxError: redeclaration\n    at codemode.js:2:7'
  expect(
    outcomeOf(
      failed({ kind: 'script', name: 'SyntaxError', message: 'm', stack: parse }),
      null,
      9,
      limits,
    ),
  ).toEqual({ kind: 'syntax', message: 'm', line: 2 })
  const thrown =
    'SyntaxError: bad JSON\n    at parse (native)\n    at <anonymous> (codemode.js:3:5)'
  expect(
    outcomeOf(
      failed({ kind: 'script', name: 'SyntaxError', message: 'm', stack: thrown }),
      null,
      9,
      limits,
    ),
  ).toEqual({ kind: 'threw', name: 'SyntaxError', message: 'm', line: 3, console: '' })
  const other = failed({ kind: 'script', name: 'TypeError', message: 'm', stack: parse })
  expect(outcomeOf(other, null, 9, limits)).toMatchObject({ kind: 'threw', name: 'TypeError' })
})

it('names a thrown value that has no name, and a failure of the engine itself', () => {
  expect(outcomeOf(failed({ kind: 'script', message: '"x"' }), null, 0, limits)).toEqual({
    kind: 'threw',
    name: 'Error',
    message: '"x"',
    line: null,
    console: '',
  })
  expect(
    outcomeOf(failed({ kind: 'sandbox', name: 'Error', message: 'trap' }), null, 0, limits),
  ).toMatchObject({ kind: 'threw', name: 'InternalError', message: 'trap' })
})

it('cuts the console of a failed run to the output limit, on a character boundary', () => {
  const thrown = failed({ kind: 'script', name: 'Error', message: 'm' }, said('ééééééé'))
  expect(outcomeOf(thrown, null, 0, limits)).toMatchObject({ console: 'ééééé' })
  const exact = failed({ kind: 'script', name: 'Error', message: 'm' }, said('ééééé'))
  expect(outcomeOf(exact, null, 0, limits)).toMatchObject({ console: 'ééééé' })
})

it('counts the value and the console against the output limit together', () => {
  expect(outcomeOf(settled({ value: 'abcd' }, said('1234')), null, 0, limits)).toMatchObject({
    kind: 'returned',
    value: { kind: 'string', value: 'abcd' },
    console: '1234',
  })
  expect(outcomeOf(settled({ value: 'abcd' }, said('12345')), null, 0, limits)).toMatchObject({
    kind: 'exceeded',
    limit: 'output',
  })
  expect(outcomeOf(settled({ none: true }, said('1234567890')), null, 0, limits)).toEqual({
    kind: 'returned',
    console: '1234567890',
  })
  expect(outcomeOf(settled({ none: true }, said('12345678901')), null, 0, limits)).toMatchObject({
    kind: 'exceeded',
    limit: 'output',
    console: '1234567890',
  })
  expect(outcomeOf(settled(undefined), null, 0, limits)).toEqual({ kind: 'returned', console: '' })
  expect(outcomeOf(settled({ bad: '$.f (function)' }), null, 0, limits)).toEqual({
    kind: 'invalid-output',
    path: '$.f (function)',
    console: '',
  })
})

it('refuses a value nested deeper than the reader follows', () => {
  let deep: unknown = 1
  for (let depth = 0; depth < 300; depth++) deep = [deep]
  const wide = { ...limits, outputBytes: 4096 }
  expect(outcomeOf(settled({ value: deep }), null, 0, wide)).toMatchObject({
    kind: 'invalid-output',
    path: expect.stringContaining('nested'),
  })
})

it('finds the line of the first frame that lies in the program', () => {
  const stack = 'Error: x\n    at entry (codemode.js:1:120)\n    at <anonymous> (codemode.js:12:34)'
  expect(programLine(stack, 500)).toBe(12)
  expect(programLine(stack, 100)).toBe(1)
  expect(programLine(stack, 120)).toBe(12)
  expect(programLine('Error: x\n    at f (codemode.js:1:99)', 500)).toBeNull()
  expect(programLine(undefined, 0)).toBeNull()
})

it('takes a stack for a parse error only when it is one bare frame', () => {
  expect(isParseStack('SyntaxError: m\n    at codemode.js:1:39')).toBe(true)
  expect(isParseStack('SyntaxError: m\n    at codemode.js:12:3\n')).toBe(true)
  for (const stack of [
    undefined,
    'SyntaxError: m',
    'SyntaxError: m\n    at parse (native)\n    at codemode.js:1:39',
    'SyntaxError: m\n    at <anonymous> (codemode.js:1:39)',
    'a\nSyntaxError: m\n    at codemode.js:1:39',
    'SyntaxError: m\n    at codemode.js:1:39 more',
    'SyntaxError: m\nat codemode.js:1:39',
    'SyntaxError: m\n    at codemode.js:x:39',
  ])
    expect(isParseStack(stack)).toBe(false)
})

it('keeps every line of the program on its own number and hides the helpers of the engine', () => {
  const prepared = prepareProgram(
    'const a: number = 1\nreturn a',
    ['Files.read', 'Twice'],
    ['ToolError'],
    {
      kind: 'object',
      entries: [{ key: '__proto__', value: { kind: 'null' } }],
    },
  )
  if (prepared.kind !== 'ready') throw new Error('expected a program')
  const [first, second] = prepared.code.split('\n')
  expect(first?.length).toBe(prepared.head + 'const a         = 1'.length)
  expect(second).toBe('return a')
  expect(first).toContain(
    '(tools, input, Files, Twice, ToolError, __call, __r, ALL_TOOLS, text, image, exit, store, load) => {',
  )
  expect(first).toContain(String.raw`JSON.parse("{\"__proto__\":null}")`)
})
