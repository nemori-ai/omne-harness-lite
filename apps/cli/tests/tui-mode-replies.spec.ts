import { describe, expect, it } from 'vitest'
import { InputFramer, type TerminalInput } from '../src/tui/framer.ts'
import { ModeReplies } from '../src/tui/mode-replies.ts'

const begin = Buffer.from('\x1b[200~'),
  end = Buffer.from('\x1b[201~')
function harness() {
  const events: TerminalInput[] = [],
    modes: number[] = []
  const framer = new InputFramer(event => events.push(event))
  const replies = new ModeReplies(
    bytes => framer.feed(bytes),
    value => modes.push(value),
  )
  return { events, modes, framer, replies }
}
describe('D054 interleaved terminal replies', () => {
  it('preserves every delimiter and UTF8 cut with each legitimate report, byte by byte', () => {
    const text = '中🙂é',
      frame = Buffer.concat([begin, Buffer.from(text), end])
    for (let cut = 0; cut <= frame.length; cut++) {
      for (let mode = 0; mode <= 4; mode++) {
        const h = harness()
        const input = Buffer.concat([
          frame.subarray(0, cut),
          Buffer.from(`\x1b[?2004;${mode}$y`),
          frame.subarray(cut),
        ])
        for (const byte of input) {
          h.replies.feed(Uint8Array.of(byte))
          expect(h.replies.bufferedBytes).toBeLessThanOrEqual(11)
        }
        expect(h.events).toEqual([{ kind: 'paste', text }])
        expect(h.modes).toEqual([mode])
        expect(h.framer.inPaste).toBe(false)
        h.framer.dispose()
      }
    }
  })
  it('reconstructs the real iTerm 768 + 11 + 2 byte counterexample', () => {
    const h = harness(),
      text = 'a'.repeat(758)
    h.replies.feed(Buffer.concat([begin, Buffer.from(text), end.subarray(0, 4)]))
    h.replies.feed(Buffer.from('\x1b[?2004;1$y'))
    expect(h.framer.inPaste).toBe(true)
    h.replies.feed(end.subarray(4))
    expect(h.events).toEqual([{ kind: 'paste', text }])
    expect(h.modes).toEqual([1])
    h.framer.dispose()
  })
  it('owns a hidden begin prefix through stop until downstream has drained it', async () => {
    const h = harness()
    h.replies.feed(Buffer.from('\x1b['))
    let stopped = false
    const stop = (async () => {
      await h.replies.drainHeld()
      await h.framer.stop()
      stopped = true
    })()
    await Promise.resolve()
    expect(stopped).toBe(false)
    h.replies.feed(Buffer.from('200~old'))
    await Promise.resolve()
    expect(stopped).toBe(false)
    h.replies.feed(Buffer.from('\x1b[201~'))
    await stop
    expect(h.events).toEqual([])
    h.framer.dispose()
  })
  it('query failure cannot discard a half report; input error cannot release it either', async () => {
    const h = harness()
    h.replies.feed(Buffer.from('\x1b[?2004;'))
    let restored = false
    const restore = h.replies.drainHeld().then(() => {
      restored = true
    })
    h.framer.error()
    await Promise.resolve()
    expect(restored).toBe(false)
    expect(h.events).toEqual([{ kind: 'input-error' }])
    h.replies.feed(Buffer.from('2$y'))
    await restore
    expect(h.modes).toEqual([2])
    h.framer.dispose()
  })
  it('real EOF releases both hidden control prefixes and downstream paste ownership', async () => {
    const h = harness()
    h.replies.feed(Buffer.from('\x1b[200~old\x1b[?200'))
    const stop = (async () => {
      await h.replies.drainHeld()
      await h.framer.stop()
    })()
    h.replies.eof()
    h.framer.eof()
    await stop
    expect(h.framer.inPaste).toBe(false)
    expect(h.events.at(-1)).toEqual({ kind: 'eof' })
    h.framer.dispose()
  })
  it('forwards non-report bytes exactly, including interrupted prefixes and invalid octets', () => {
    const output: number[] = [],
      modes: number[] = []
    const r = new ModeReplies(
      bytes => output.push(...bytes),
      value => modes.push(value),
    )
    const original = Buffer.from([27, 91, 50, 27, 91, 63, 50, 48, 48, 52, 59, 57, 36, 121, 255, 27])
    r.feed(original)
    r.eof()
    expect(Buffer.from(output)).toEqual(original)
    expect(modes).toEqual([])
  })
  it('oversize paste still drains after its tail is interrupted by a report', async () => {
    const h = harness()
    h.replies.feed(begin)
    h.replies.feed(Buffer.alloc(65537, 65))
    h.replies.feed(end.subarray(0, 3))
    const stop = (async () => {
      await h.replies.drainHeld()
      await h.framer.stop()
    })()
    await Promise.resolve()
    h.replies.feed(Buffer.from('\x1b[?2004;1$y'))
    h.replies.feed(end.subarray(3))
    await stop
    expect(h.framer.bufferedBytes).toBe(0)
    expect(h.events).toEqual([])
    h.framer.dispose()
  })
})
