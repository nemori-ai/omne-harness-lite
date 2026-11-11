import { expect, it } from 'vitest'
import {
  createWindowsTerminalCapacity,
  reserveTerminalWindow,
} from '../../src/windows-execution/terminal-output.ts'

it('keeps sealed windows immutable, bounds their output and releases a window its reader gives up', async () => {
  const capacity = createWindowsTerminalCapacity({
    maxTerminals: 2,
    maxWindows: 2,
    maxReservedBytes: 8,
    maxChunks: 2,
  })
  const policy = { maxBufferedBytes: 4, maxChunkBytes: 2, overflow: 'discard' } as const
  const first = reserveTerminalWindow(policy, capacity)
  const next = reserveTerminalWindow(policy, capacity)
  if (first === undefined || next === undefined) throw new Error('window fixture')
  first.push(Uint8Array.from([0, 13, 10, 27, 255, 1]))
  const summary = first.seal()
  expect(summary).toEqual({ mode: 'terminal', terminal: { observedBytes: 6, discardedBytes: 2 } })
  expect(reserveTerminalWindow(policy, capacity)).toBeUndefined()
  const read = first.output[Symbol.asyncIterator]()
  expect(await read.next()).toMatchObject({
    done: false,
    value: { observedOffset: 0, data: Uint8Array.from([0, 13]) },
  })
  await read.return?.()
  expect(summary.terminal.discardedBytes).toBe(2)
  next.push(Uint8Array.from([1, 2, 3, 4, 5, 6]))
  expect(next.seal().terminal).toEqual({ observedBytes: 6, discardedBytes: 2 })
  await next.output[Symbol.asyncIterator]().return?.()
  expect(capacity.reading()).toEqual({ terminals: 0, windows: 0, reservedBytes: 0, chunks: 0 })
})

it('counts abandonment before sealing as discard and preserves single-reader ownership', async () => {
  const capacity = createWindowsTerminalCapacity()
  const window = reserveTerminalWindow(
    { maxBufferedBytes: 8, maxChunkBytes: 4, overflow: 'discard' },
    capacity,
  )
  if (window === undefined) throw new Error('window fixture')
  window.push(Uint8Array.from([1, 2, 3]))
  const reader = window.output[Symbol.asyncIterator]()
  await reader.return?.()
  window.push(Uint8Array.from([4, 5]))
  expect(window.seal().terminal).toEqual({ observedBytes: 5, discardedBytes: 5 })
  await expect(window.output[Symbol.asyncIterator]().next()).rejects.toThrow('one reader')
})
