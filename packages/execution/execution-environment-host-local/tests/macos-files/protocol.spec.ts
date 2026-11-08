import { spawn } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { parseReply } from '../../src/macos-files/protocol.ts'
import { runHelper } from '../../src/macos-files/transport.ts'

const fixture = vi.hoisted(() => ({ script: '' }))
vi.mock('../../src/macos-files/launcher.ts', () => ({
  spawnFilesHelper: () =>
    spawn(process.execPath, ['-e', fixture.script], { stdio: ['pipe', 'pipe', 'pipe'] }),
}))
afterEach(() => {
  fixture.script = ''
})

const reply = {
  info: { token: '1:2', version: '3:1', size: 1, modified: 3, type: 'file', name: 'a' },
  bytes: 'eA==',
  entries: [],
  next: -1,
  hits: [],
  truncated: false,
  eof: true,
}
const input = {
  operation: 'read' as const,
  root: '/work',
  expectedRoot: '1:1',
  segments: ['a'],
  named: '1:2',
  path: '/work/a',
  rooted: true,
}

it('requires a complete valid success reply instead of accepting partial output', () => {
  expect(parseReply(reply)).toEqual(reply)
  for (const malformed of [
    null,
    {},
    { info: reply.info },
    { ...reply, bytes: 'bad base64' },
    { ...reply, next: 1.5 },
    { ...reply, info: { ...reply.info, size: -1 } },
    { ...reply, hits: [{ path: '/a', token: '1:2', offsetBytes: -2 }] },
  ]) {
    expect(parseReply(malformed)).toBe('unknown')
  }
})

it('preserves known failures and keeps unrecognized failures unknown', () => {
  for (const failure of [
    'conflict',
    'notAuthorized',
    'unsupported',
    'invalidInput',
    'capacity',
    'busy',
    'unavailable',
    'unresolved',
  ])
    expect(parseReply({ failure })).toBe(failure)
  expect(parseReply({ failure: 'success' })).toBe('unknown')
})

it('accepts only successful process exit with a complete reply', async () => {
  fixture.script = `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(reply))}))`
  expect(await runHelper('fixture', input)).toEqual(reply)
  fixture.script += ';process.exitCode=1'
  expect(await runHelper('fixture', input)).toBe('unknown')
})

it('treats malformed output and a timed-out helper as unknown', async () => {
  fixture.script = `process.stdin.resume();process.stdout.write('{"info":')`
  expect(await runHelper('fixture', input)).toBe('unknown')
  fixture.script = 'process.stdin.resume();setInterval(()=>{},1000)'
  expect(await runHelper('fixture', input, 50)).toBe('unknown')
})
