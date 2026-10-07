import { expect, test } from 'vitest'
import {
  captureFileArguments,
  captureCommandRequest,
  isCommandProcess,
  captureCommandArguments,
  captureFileResult,
  captureCommandResult,
  type FileFacility,
  type CommandFacility,
} from '../src/index.ts'

const reference = { id: 'original', generation: 'generation' }
const bytes = () => new Uint8Array([1, 2, 3])
const info = { path: '/a', type: 'file', sizeBytes: 3, modifiedMs: 1, version: 'v1' }
type Case<M> = { method: M; value: Record<string, unknown> | string; required: readonly string[] }
const fileInputs: Case<keyof FileFacility>[] = [
  { method: 'read', value: { path: '/a', offsetBytes: 0, limitBytes: 3 }, required: ['path'] },
  {
    method: 'write',
    value: { path: '/a', data: bytes(), mode: 'replace', expectedVersion: 'v1' },
    required: ['path', 'data', 'mode'],
  },
  { method: 'stat', value: '/a', required: [] },
  { method: 'list', value: { path: '/a', offset: 0, limit: 3 }, required: ['path'] },
  {
    method: 'search',
    value: { path: '/a', pattern: 'text', match: 'content', recursive: false, offset: 0, limit: 3 },
    required: ['path', 'pattern', 'match', 'recursive'],
  },
  {
    method: 'move',
    value: { source: '/a', target: '/b', replace: false, expectedVersion: 'v1' },
    required: ['source', 'target', 'replace'],
  },
  {
    method: 'copy',
    value: { source: '/a', target: '/b', replace: false, expectedVersion: 'v1' },
    required: ['source', 'target', 'replace'],
  },
  {
    method: 'remove',
    value: { path: '/a', recursive: false, expectedVersion: 'v1' },
    required: ['path', 'recursive'],
  },
  { method: 'mkdir', value: { path: '/a', parents: false }, required: ['path', 'parents'] },
  {
    method: 'commitBatch',
    value: {
      entries: [
        { path: '/a', data: bytes(), expectedVersion: null },
        { path: '/b', data: bytes(), expectedVersion: 'v1' },
      ],
    },
    required: ['entries'],
  },
  { method: 'recoverBatch', value: reference, required: ['id', 'generation'] },
]
const fileOutputs: Case<keyof FileFacility>[] = [
  {
    method: 'read',
    value: {
      kind: 'read',
      path: '/a',
      data: bytes(),
      offsetBytes: 0,
      nextOffsetBytes: 3,
      eof: false,
      version: 'v1',
    },
    required: ['kind', 'path', 'data', 'offsetBytes', 'nextOffsetBytes', 'eof', 'version'],
  },
  {
    method: 'write',
    value: { kind: 'written', path: '/a', version: 'v1' },
    required: ['kind', 'path', 'version'],
  },
  { method: 'stat', value: { kind: 'stat', value: info }, required: ['kind', 'value'] },
  {
    method: 'list',
    value: { kind: 'listed', values: [info], nextOffset: 1 },
    required: ['kind', 'values'],
  },
  {
    method: 'search',
    value: {
      kind: 'found',
      values: [{ path: '/a', offsetBytes: 1 }],
      nextOffset: 1,
      truncated: false,
    },
    required: ['kind', 'values', 'truncated'],
  },
  {
    method: 'move',
    value: { kind: 'moved', source: '/a', target: '/b' },
    required: ['kind', 'source', 'target'],
  },
  {
    method: 'copy',
    value: { kind: 'copied', source: '/a', target: '/b' },
    required: ['kind', 'source', 'target'],
  },
  { method: 'remove', value: { kind: 'removed', path: '/a' }, required: ['kind', 'path'] },
  { method: 'mkdir', value: { kind: 'created', path: '/a' }, required: ['kind', 'path'] },
  {
    method: 'commitBatch',
    value: { kind: 'committed', batch: reference, published: ['/a'] },
    required: ['kind', 'batch', 'published'],
  },
  {
    method: 'recoverBatch',
    value: {
      kind: 'recognized',
      batch: reference,
      state: 'partial',
      matchingPrepared: ['/b'],
      published: ['/a'],
      conflicting: [],
    },
    required: ['kind', 'batch', 'state', 'matchingPrepared', 'published', 'conflicting'],
  },
]

function omitted(value: Record<string, unknown>, field: string) {
  const copy = structuredClone(value)
  delete copy[field]
  return copy
}
function checkCases<M>(cases: readonly Case<M>[], capture: (method: M, value: unknown) => unknown) {
  for (const fixture of cases) {
    expect(capture(fixture.method, fixture.value), String(fixture.method)).toEqual(fixture.value)
    for (const invalid of [null, false, 1, '', [], { unknown: true }])
      expect(capture(fixture.method, invalid), String(fixture.method)).toBeUndefined()
    if (typeof fixture.value === 'string') continue
    expect(capture(fixture.method, { ...fixture.value, unknown: true })).toBeUndefined()
    for (const field of fixture.required)
      expect(
        capture(fixture.method, omitted(fixture.value, field)),
        `${String(fixture.method)} missing ${field}`,
      ).toBeUndefined()
    for (const field of Object.keys(fixture.value)) {
      const invalidValues: unknown[] = [null, Symbol('invalid')]
      if (typeof fixture.value[field] === 'string') invalidValues.push('')
      for (const invalid of invalidValues)
        expect(
          capture(fixture.method, { ...fixture.value, [field]: invalid }),
          `${String(fixture.method)} invalid ${field}`,
        ).toBeUndefined()
    }
  }
}
test('all file requests own complete data and reject missing or malformed fields', () => {
  checkCases(fileInputs, (method, value) => captureFileArguments(method, [value])?.[0])
  const original = { path: '/a', mode: 'create' as const, data: bytes() }
  const captured = captureFileArguments('write', [original])![0]
  original.data.fill(9)
  expect(captured).toEqual({ path: '/a', mode: 'create', data: bytes() })
  for (const mode of ['create', 'replace'])
    expect(captureFileArguments('write', [{ path: '/a', mode, data: bytes() }])).toBeDefined()
  for (const match of ['name', 'content'])
    expect(
      captureFileArguments('search', [{ path: '/a', pattern: 'text', match, recursive: true }]),
    ).toBeDefined()
  for (const entries of [[], [{ path: '/a', data: bytes(), expectedVersion: null }, { path: '' }]])
    expect(captureFileArguments('commitBatch', [{ entries }])).toBeUndefined()
  for (const value of [-1, 0, 1.5, NaN, Infinity, '3'])
    expect(captureFileArguments('read', [{ path: '/a', limitBytes: value }])).toBeUndefined()
  for (const value of [-1, 1.5, NaN, Infinity, '3'])
    expect(captureFileArguments('list', [{ path: '/a', offset: value }])).toBeUndefined()
})
test('all file results preserve exact data and reject malformed nested facts', () => {
  checkCases(fileOutputs, captureFileResult)
  for (const method of ['write', 'commitBatch'] as const)
    for (const reason of ['effectUnknown', 'closed', 'conflict', 'unavailable']) {
      const value = { kind: 'unknown', batch: reference, published: ['/a'], reason }
      expect(captureFileResult(method, value)).toEqual(value)
      expect(captureFileResult(method, { ...value, published: ['/a', 3] })).toBeUndefined()
      expect(captureFileResult(method, { ...value, reason: 'pretendSuccess' })).toBeUndefined()
    }
  for (const fixture of fileOutputs) {
    const rejected = { kind: 'rejected', reason: 'effectUnknown' }
    expect(captureFileResult(fixture.method, rejected)).toEqual(rejected)
    expect(
      captureFileResult(fixture.method, { ...rejected, reason: 'pretendSuccess' }),
    ).toBeUndefined()
  }
  for (const bad of [
    { ...info, sizeBytes: -1 },
    { ...info, modifiedMs: Infinity },
    { ...info, type: 'pipe' },
    omitted(info, 'version'),
  ])
    expect(captureFileResult('list', { kind: 'listed', values: [info, bad] })).toBeUndefined()
  for (const state of ['complete', 'partial', 'interrupted', 'conflict', 'pending'])
    expect(
      captureFileResult('recoverBatch', { ...(fileOutputs[10]!.value as object), state }),
    ).toBeDefined()
})
test('command inputs capture complete arrays/environment and terminal data before authority waits', () => {
  const cases: Case<keyof CommandFacility>[] = [
    {
      method: 'start',
      value: {
        executable: '/bin/sh',
        args: ['a', 'b'],
        cwd: '/tmp',
        env: { A: 'a', B: 'b' },
        stdin: bytes(),
      },
      required: ['executable', 'args', 'cwd', 'env'],
    },
    { method: 'createTerminal', value: { cwd: '/tmp', env: { A: 'a' } }, required: ['cwd', 'env'] },
    {
      method: 'executeTerminal',
      value: {
        terminal: reference,
        script: 'printf a',
        cwd: '/tmp',
        env: { A: 'a' },
        stdin: bytes(),
      },
      required: ['terminal', 'script'],
    },
    { method: 'closeTerminal', value: reference, required: ['id', 'generation'] },
  ]
  checkCases(cases, (method, value) => captureCommandArguments(method, [value])?.[0])
  expect(captureCommandArguments('terminals', [])).toEqual([])
  expect(captureCommandArguments('terminals', [{}])).toBeUndefined()
  for (const args of [['valid', 1], 'invalid'])
    expect(
      captureCommandArguments('start', [{ executable: '/bin/sh', args, cwd: '/tmp', env: {} }]),
    ).toBeUndefined()
  for (const env of [{ A: 'valid', B: 1 }, 'invalid', []])
    expect(captureCommandArguments('createTerminal', [{ cwd: '/tmp', env }])).toBeUndefined()
})
test('terminal observations and failures have complete owned result fields', () => {
  const cases: Case<keyof CommandFacility>[] = [
    {
      method: 'createTerminal',
      value: { kind: 'created', terminal: reference },
      required: ['kind', 'terminal'],
    },
    {
      method: 'closeTerminal',
      value: { kind: 'closed', status: 'confirmed' },
      required: ['kind', 'status'],
    },
    {
      method: 'terminals',
      value: {
        kind: 'terminals',
        values: [{ terminal: reference, state: 'idle', observedCwd: '/tmp' }],
      },
      required: ['kind', 'values'],
    },
  ]
  checkCases(cases, captureCommandResult)
  expect(
    captureCommandResult('closeTerminal', { kind: 'closed', status: 'unconfirmed' }),
  ).toBeDefined()
  for (const state of ['idle', 'running', 'invalid', 'closed'])
    expect(
      captureCommandResult('terminals', {
        kind: 'terminals',
        values: [{ terminal: reference, state, observedCwd: '/tmp' }],
      }),
    ).toBeDefined()
  expect(
    captureCommandResult('terminals', {
      kind: 'terminals',
      values: [
        { terminal: reference, state: 'idle', observedCwd: '/tmp' },
        { terminal: reference, state: 'pretend', observedCwd: '/tmp' },
      ],
    }),
  ).toBeUndefined()
  for (const method of [
    'start',
    'executeTerminal',
    'createTerminal',
    'closeTerminal',
    'terminals',
  ] as const) {
    expect(captureCommandResult(method, { kind: 'rejected', reason: 'closed' })).toEqual({
      kind: 'rejected',
      reason: 'closed',
    })
    expect(captureCommandResult(method, { kind: 'rejected', reason: 'pretend' })).toBeUndefined()
  }
})

test('started process ports retain original controls with a bounded discard output policy', () => {
  const process = {
    output: {
      async *[Symbol.asyncIterator]() {
        throw new Error('Do not read during capture')
      },
    },
    outputPolicy: { overflow: 'discard' as const, maxBufferedBytes: 10, maxChunkBytes: 10 },
    result: Promise.resolve({
      kind: 'completed' as const,
      exitCode: 0,
      signal: null,
      outputTruncated: false,
    }),
    stop: async () => {
      throw new Error('Do not stop during capture')
    },
  }
  const started = { kind: 'started', process }
  for (const method of ['start', 'executeTerminal'] as const) {
    expect(captureCommandResult(method, started)).toBe(started)
    for (const field of ['output', 'outputPolicy', 'result', 'stop']) {
      expect(
        captureCommandResult(method, {
          kind: 'started',
          process: Object.fromEntries(Object.entries(process).filter(([key]) => key !== field)),
        }),
      ).toBeUndefined()
      expect(
        captureCommandResult(method, { kind: 'started', process: { ...process, [field]: null } }),
      ).toBeUndefined()
    }
    for (const outputPolicy of [
      { overflow: 'block', maxBufferedBytes: 10, maxChunkBytes: 10 },
      { overflow: 'discard', maxBufferedBytes: 10, maxChunkBytes: 11 },
      { overflow: 'discard', maxBufferedBytes: 0, maxChunkBytes: 1 },
      { overflow: 'discard', maxBufferedBytes: 10, maxChunkBytes: -1 },
      { overflow: 'discard', maxBufferedBytes: 10, maxChunkBytes: 1.5 },
      { overflow: 'discard', maxBufferedBytes: 10, maxChunkBytes: 1, extra: true },
      { maxBufferedBytes: 10, maxChunkBytes: 1 },
    ])
      expect(
        captureCommandResult(method, { kind: 'started', process: { ...process, outputPolicy } }),
      ).toBeUndefined()
    for (const output of [{}, { [Symbol.asyncIterator]: 1 }, null])
      expect(
        captureCommandResult(method, { kind: 'started', process: { ...process, output } }),
      ).toBeUndefined()
    expect(
      captureCommandResult(method, { kind: 'started', process: { ...process, result: {} } }),
    ).toBeUndefined()
    expect(
      captureCommandResult(method, {
        kind: 'started',
        process: {
          get output() {
            throw new Error('unreadable')
          },
        },
      }),
    ).toBeUndefined()
  }
})

test('all public failure reasons remain valid while malformed nested facts reject', () => {
  const reasons = [
    'invalidInput',
    'notAuthorized',
    'closed',
    'notFound',
    'unavailable',
    'effectUnknown',
    'conflict',
    'busy',
    'capacity',
    'unsupported',
  ]
  for (const reason of reasons) {
    const rejected = { kind: 'rejected', reason }
    for (const fixture of fileOutputs)
      expect(captureFileResult(fixture.method, rejected)).toEqual(rejected)
    for (const method of [
      'start',
      'createTerminal',
      'executeTerminal',
      'closeTerminal',
      'terminals',
    ] as const)
      expect(captureCommandResult(method, rejected)).toEqual(rejected)
  }
  for (const type of ['file', 'directory', 'symlink'])
    expect(captureFileResult('stat', { kind: 'stat', value: { ...info, type } })).toBeDefined()
  for (const field of ['path', 'type', 'sizeBytes', 'modifiedMs', 'version']) {
    expect(captureFileResult('stat', { kind: 'stat', value: omitted(info, field) })).toBeUndefined()
    expect(
      captureFileResult('stat', { kind: 'stat', value: { ...info, [field]: null } }),
    ).toBeUndefined()
  }
  expect(captureFileArguments('stat', [{ length: 1 }])).toBeUndefined()
  expect(captureFileArguments('read', [{ path: { length: 1 } }])).toBeUndefined()
  for (const entry of [
    { path: '/a', data: bytes(), expectedVersion: null },
    { path: '/a', data: bytes(), expectedVersion: 'v1' },
  ])
    for (const field of ['path', 'data', 'expectedVersion'])
      expect(
        captureFileArguments('commitBatch', [{ entries: [omitted(entry, field)] }]),
      ).toBeUndefined()
  for (const field of ['id', 'generation']) {
    const bad = omitted(reference, field)
    expect(
      captureCommandResult('createTerminal', { kind: 'created', terminal: bad }),
    ).toBeUndefined()
    expect(
      captureCommandResult('terminals', {
        kind: 'terminals',
        values: [{ terminal: bad, state: 'idle', observedCwd: '/tmp' }],
      }),
    ).toBeUndefined()
  }
  expect(
    captureCommandRequest({ executable: '/bin/sh', args: [], cwd: '/tmp', env: {}, extra() {} }),
  ).toBeUndefined()
})

test('discriminators, nested required fields and live-process validation cannot be bypassed', () => {
  for (const fixture of fileOutputs)
    for (const rejected of [
      {},
      { kind: 'rejected' },
      { reason: 'closed' },
      { kind: 'pretend', reason: 'closed' },
    ])
      expect(captureFileResult(fixture.method, rejected)).toBeUndefined()
  expect(
    captureFileArguments('commitBatch', [
      { entries: [{ path: '/a', data: bytes(), expectedVersion: 3 }] },
    ]),
  ).toBeUndefined()
  expect(
    captureFileResult('search', { kind: 'found', values: [{ offsetBytes: 0 }], truncated: false }),
  ).toBeUndefined()
  const terminal = { terminal: reference, state: 'idle', observedCwd: '/tmp' }
  for (const field of Object.keys(terminal))
    expect(
      captureCommandResult('terminals', { kind: 'terminals', values: [omitted(terminal, field)] }),
    ).toBeUndefined()
  const process = {
    output: { async *[Symbol.asyncIterator]() {} },
    outputPolicy: Object.assign(Object.create(null) as object, {
      overflow: 'discard',
      maxBufferedBytes: 1,
      maxChunkBytes: 1,
    }),
    result: Promise.resolve(),
    stop: async () => 'confirmed',
  }
  expect(isCommandProcess(process)).toBe(true)
  expect(isCommandProcess(Object.assign(() => {}, process))).toBe(false)
  expect(isCommandProcess({ ...process, output: Object.assign(() => {}, process.output) })).toBe(
    false,
  )
  expect(
    isCommandProcess({
      get output() {
        throw new Error('unreadable')
      },
    }),
  ).toBe(false)
  for (const method of ['start', 'executeTerminal'] as const) {
    for (const invalid of [
      { kind: 'started' },
      { process },
      { kind: 'pretend', process },
      { reason: 'closed' },
    ])
      expect(captureCommandResult(method, invalid)).toBeUndefined()
  }
})
