import { expect, it } from 'vitest'
import { parseTerminalFrame } from '../../src/windows-execution/terminal-bridge.ts'

it('requires versioned native elapsed facts for completed foreground frames', () => {
  const completion = {
    t: 'finished',
    v: 3,
    id: 'terminal:1',
    cwd: 'C:\\work',
    restored: true,
    ended: false,
    completed: true,
    elapsedMs: 153,
    code: 0,
  }
  expect(parseTerminalFrame(JSON.stringify(completion), 1024)).toEqual(completion)
  expect(parseTerminalFrame(JSON.stringify({ ...completion, elapsedMs: 0 }), 1024)).toMatchObject({
    elapsedMs: 0,
  })
  for (const elapsedMs of [undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '153'])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, elapsedMs }), 1024)).toBeUndefined()
  for (const v of [undefined, 1, 2, 4, '3'])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, v }), 1024)).toBeUndefined()
  expect(
    parseTerminalFrame(JSON.stringify(completion).replace('153', '1e309'), 1024),
  ).toBeUndefined()
})

it('represents an incomplete foreground with no native elapsed result', () => {
  const incomplete = {
    t: 'finished',
    v: 3,
    id: 'terminal:1',
    cwd: 'C:\\work',
    restored: true,
    ended: false,
    completed: false,
    elapsedMs: null,
    code: null,
  }
  expect(parseTerminalFrame(JSON.stringify(incomplete), 1024)).toEqual(incomplete)
  expect(parseTerminalFrame(JSON.stringify({ ...incomplete, elapsedMs: 0 }), 1024)).toBeUndefined()
  expect(parseTerminalFrame(JSON.stringify({ ...incomplete, code: 0 }), 1024)).toBeUndefined()
})

it('carries the exit code of the shell host and whether exit ended the shell', () => {
  const completion = {
    t: 'finished',
    v: 3,
    id: 'terminal:1',
    cwd: 'C:\\work',
    restored: true,
    ended: true,
    completed: true,
    elapsedMs: 4,
    code: 7,
  }
  expect(parseTerminalFrame(JSON.stringify(completion), 1024)).toEqual(completion)
  for (const code of [-1073741819, 2147483647])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, code }), 1024)).toMatchObject({
      code,
    })
  for (const code of [undefined, null, 1.5, '7', Number.MAX_SAFE_INTEGER + 1])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, code }), 1024)).toBeUndefined()
  for (const ended of [undefined, null, 'true', 1])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, ended }), 1024)).toBeUndefined()
})
