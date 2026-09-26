import { describe, expect, it, vi } from 'vitest'
import { Input } from '@earendil-works/pi-tui'
import { InputFramer, type TerminalInput } from '../src/tui/framer.ts'
import { FIELD_LIMIT, validFieldText } from '../src/tui/forms.ts'

describe('CQ2 bounded input', () => {
  it('input error is observable but cannot release an unfinished paste as EOF', async () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    f.feed(Buffer.from('\x1b[200~pending'))
    f.error()
    expect(events).toEqual([{ kind: 'input-error' }])
    let done = false
    const stop = f.stop().then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    f.feed(Buffer.from('\x1b[201~'))
    await stop
    expect(events).toEqual([{ kind: 'input-error' }])
    f.dispose()
  })
  it('explicit cancel/exit after a lone Escape terminates that incomplete prefix', () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    f.feed(Buffer.from('\x1b\x07\x1b\x03'))
    expect(events).toEqual([
      { kind: 'key', text: '\x07' },
      { kind: 'key', text: '\x03' },
    ])
    f.dispose()
  })
  it('never interprets a delayed first ESC byte as cancellation or loses the paste frame', async () => {
    vi.useFakeTimers()
    try {
      const events: TerminalInput[] = [],
        f = new InputFramer(e => events.push(e))
      f.feed(Buffer.from('\x1b'))
      await vi.advanceTimersByTimeAsync(1000)
      expect(events).toEqual([])
      let stopped = false
      const stop = f.stop().then(() => {
        stopped = true
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(stopped).toBe(false)
      f.feed(Buffer.from('[200~text\r2\r'))
      await Promise.resolve()
      expect(stopped).toBe(false)
      f.feed(Buffer.from('\x1b[201~'))
      await stop
      expect(events).toEqual([])
      f.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
  it('owns a split paste-begin prefix through cancellation and silence', async () => {
    vi.useFakeTimers()
    try {
      const events: TerminalInput[] = [],
        f = new InputFramer(e => events.push(e))
      f.feed(Buffer.from('\x1b[20'))
      await vi.advanceTimersByTimeAsync(1000)
      let done = false
      const stop = f.stop().then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(done).toBe(false)
      f.feed(Buffer.from('0~body'))
      expect(f.inPaste).toBe(true)
      await Promise.resolve()
      expect(done).toBe(false)
      f.feed(Buffer.from('\x1b[201~'))
      await stop
      expect(events).toEqual([])
      f.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
  it('discards the rest of an oversized CSI or unsupported string control', () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    f.feed(Buffer.from('\x1b[' + '1;'.repeat(100) + 'mOK'))
    f.feed(Buffer.from('\x1b]52;secret-control\x07yes'))
    expect(events.flatMap(e => (e.kind === 'key' ? [e.text] : [])).join('')).toBe('OKyes')
    expect(events.filter(e => e.kind === 'invalid')).toHaveLength(2)
    f.dispose()
  })
  it('decodes every UTF8 split before key parsing, including a lone high byte chunk', () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    for (const byte of Buffer.from('中🙂é')) f.feed(Uint8Array.of(byte))
    expect(events).toEqual(['中', '🙂', 'é'].map(text => ({ kind: 'key', text })))
    f.dispose()
  })
  it('paste is one data event and never an Enter or mode response', () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    for (const byte of Buffer.from('\x1b[200~中🙂\x1b[201~')) f.feed(Uint8Array.of(byte))
    expect(events).toEqual([{ kind: 'paste', text: '中🙂' }])
    f.feed(Buffer.from('\x1b[200~a\n\r\x1b[?2004;1$y\x1b[201~'))
    expect(events.slice(1)).toEqual([{ kind: 'invalid' }])
    f.dispose()
  })
  it('oversize or bad UTF8 paste retains no body, drains through real end, then reports invalid', async () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    f.feed(Buffer.from('\x1b[200~'))
    f.feed(Buffer.alloc(FIELD_LIMIT + 4096, 65))
    expect(f.bufferedBytes).toBeLessThanOrEqual(6)
    expect(events).toEqual([])
    f.feed(Buffer.from('\x1b[201~'))
    expect(events).toEqual([{ kind: 'invalid' }])
    f.feed(Buffer.from('\x1b[200~'))
    f.feed(Uint8Array.of(0xc3, 0x28))
    let stopped = false
    const stop = f.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    f.feed(Buffer.from('\x1b[201'))
    expect(stopped).toBe(false)
    f.feed(Buffer.from('~'))
    await stop
    expect(stopped).toBe(true)
    expect(events).toEqual([{ kind: 'invalid' }])
    f.dispose()
  })
  it('elapsed silence cannot release an incomplete paste; EOF can', async () => {
    vi.useFakeTimers()
    try {
      const f = new InputFramer(() => {})
      f.feed(Buffer.from('\x1b[200~abc'))
      let done = false
      const stop = f.stop().then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(done).toBe(false)
      f.eof()
      await stop
      expect(done).toBe(true)
      f.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
  it('accepts only bounded mode replies and rejects unsupported sequences', () => {
    const events: TerminalInput[] = [],
      f = new InputFramer(e => events.push(e))
    f.feed(Buffer.from('\x1b[?2004;2$y\x1b[<0;1;1M'))
    expect(events).toEqual([{ kind: 'mode', value: 2 }, { kind: 'invalid' }])
    f.dispose()
  })
  it('rejects control/bidi, malformed UTF16 and over-capacity fields without trimming', () => {
    expect(validFieldText(' leading and trailing ')).toBe(true)
    for (const text of ['\n', '\x1b', '\x9b', '\u202e', '\ud800', 'a'.repeat(FIELD_LIMIT + 1)])
      expect(validFieldText(text)).toBe(false)
  })
  it('the installed public Input actually retains only 256 undo snapshots', () => {
    const input = new Input()
    for (let i = 0; i < 1000; i++) {
      input.handleInput('x')
      input.handleInput('\x05')
    }
    for (let i = 0; i < 1000; i++) input.handleInput('\x1f')
    expect(input.getValue()).toHaveLength(744)
    const unicode = new Input()
    unicode.handleInput('🙂')
    unicode.handleInput('\x7f')
    unicode.handleInput('\x1f')
    expect(unicode.getValue()).toBe('🙂')
  })
})
