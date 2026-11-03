import { expect, it } from 'vitest'
import { parseTerminalFrame } from '../../src/windows-execution/terminal-bridge.ts'

it('requires versioned native elapsed facts for completed foreground frames', () => {
  const completion = {
    t: 'finished',
    v: 2,
    id: 'terminal:1',
    cwd: 'C:\\work',
    restored: true,
    completed: true,
    elapsedMs: 153,
  }
  expect(parseTerminalFrame(JSON.stringify(completion), 1024)).toEqual(completion)
  expect(parseTerminalFrame(JSON.stringify({ ...completion, elapsedMs: 0 }), 1024)).toMatchObject({
    elapsedMs: 0,
  })
  for (const elapsedMs of [undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '153'])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, elapsedMs }), 1024)).toBeUndefined()
  for (const v of [undefined, 1, 3, '2'])
    expect(parseTerminalFrame(JSON.stringify({ ...completion, v }), 1024)).toBeUndefined()
  expect(
    parseTerminalFrame(JSON.stringify(completion).replace('153', '1e309'), 1024),
  ).toBeUndefined()
})

it('represents an incomplete foreground with no native elapsed result', () => {
  const incomplete = {
    t: 'finished',
    v: 2,
    id: 'terminal:1',
    cwd: 'C:\\work',
    restored: true,
    completed: false,
    elapsedMs: null,
  }
  expect(parseTerminalFrame(JSON.stringify(incomplete), 1024)).toEqual(incomplete)
  expect(parseTerminalFrame(JSON.stringify({ ...incomplete, elapsedMs: 0 }), 1024)).toBeUndefined()
})
