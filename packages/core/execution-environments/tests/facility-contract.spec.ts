import { expect, test } from 'vitest'
import {
  captureCommandArguments,
  captureFileArguments,
  captureCommandResult,
  captureFileResult,
  commandFacilityMethods,
  fileFacilityMethods,
} from '../src/index.ts'

test('complete facility method sets include terminals and recoverable byte batches without legacy positional writes', () => {
  expect(commandFacilityMethods).toEqual([
    'start',
    'createTerminal',
    'executeTerminal',
    'closeTerminal',
    'terminals',
  ])
  expect(fileFacilityMethods).toEqual([
    'read',
    'write',
    'stat',
    'list',
    'search',
    'move',
    'copy',
    'remove',
    'mkdir',
    'commitBatch',
    'recoverBatch',
  ])
  expect(captureFileArguments('write', ['/target', 'legacy-text'])).toBeUndefined()
  expect(captureFileArguments('commitBatch', [{ entries: [] }])).toBeUndefined()
  expect(
    captureFileArguments('commitBatch', [
      { entries: [{ path: '/target', expectedVersion: null, data: new Uint8Array([255]) }] },
    ]),
  ).toBeDefined()
  expect(captureCommandArguments('createTerminal', [{ cwd: '/tmp' }])).toBeUndefined()
  expect(captureCommandArguments('terminals', [undefined])).toBeUndefined()
  expect(captureCommandArguments('terminals', [])).toEqual([])
})
test('terminal input and file result bytes are independently owned before asynchronous authority checks', () => {
  const input = {
    terminal: { id: 'terminal', generation: 'one' },
    script: 'echo ok',
    env: { ONLY: 'original' },
    stdin: new Uint8Array([1, 2]),
  }
  const captured = captureCommandArguments('executeTerminal', [input])
  input.env.ONLY = 'changed'
  input.stdin[0] = 9
  input.terminal.generation = 'changed'
  expect(captured?.[0]).toMatchObject({
    terminal: { generation: 'one' },
    env: { ONLY: 'original' },
    stdin: new Uint8Array([1, 2]),
  })
  const data = new Uint8Array([255, 0]),
    result = captureFileResult('read', {
      kind: 'read',
      path: '/file',
      data,
      offsetBytes: 0,
      nextOffsetBytes: 2,
      eof: true,
      version: 'metadata',
    })
  data[0] = 0
  expect(result).toMatchObject({ data: new Uint8Array([255, 0]) })
})
test('unknown publication needs an original batch reference and cannot satisfy confirmed terminal result shape', () => {
  expect(
    captureFileResult('commitBatch', { kind: 'unknown', published: [], reason: 'effectUnknown' }),
  ).toBeUndefined()
  expect(
    captureFileResult('commitBatch', {
      kind: 'unknown',
      batch: { id: 'original', generation: 'one' },
      published: ['/first'],
      reason: 'unavailable',
    }),
  ).toHaveProperty('kind', 'unknown')
  expect(
    captureFileResult('recoverBatch', {
      kind: 'recognized',
      batch: { id: 'original', generation: 'one' },
      state: 'partial',
      matchingPrepared: ['/first'],
      published: [],
      conflicting: [],
    }),
  ).toBeDefined()
  expect(
    captureCommandResult('closeTerminal', { kind: 'closed', status: 'unknown' }),
  ).toBeUndefined()
  expect(
    captureCommandResult('createTerminal', { kind: 'created', terminal: { id: 'one' } }),
  ).toBeUndefined()
})
