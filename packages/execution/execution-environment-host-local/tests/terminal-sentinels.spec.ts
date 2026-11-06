import { describe, expect, it } from 'vitest'
import {
  idleSentinels,
  releaseSentinels,
  scanSentinels,
  sentinel,
  watchSentinels,
  type SentinelPiece,
  type SentinelScan,
} from '../src/terminal-sentinels.ts'

const nonce = '0123456789abcdef0123456789abcdef'
const text = (value: string) => Buffer.from(value, 'latin1')
const begin = text(`\u001b]7770;omne-b;${nonce}\u0007`)
const end = text(`\u001b]7770;omne-e;${nonce}\u0007`)

/** Adjacent byte pieces of the same attribution, merged, so chunk boundaries do not show. */
function attribution(pieces: readonly SentinelPiece[]): string[] {
  const out: string[] = []
  for (const piece of pieces) {
    if (piece.kind === 'begin' || piece.kind === 'end') {
      out.push(piece.kind)
      continue
    }
    if (piece.bytes.length === 0) continue
    const last = out.at(-1)
    const body = Buffer.from(piece.bytes).toString('latin1')
    if (last?.startsWith(`${piece.kind}:`) === true) out[out.length - 1] = `${last}${body}`
    else out.push(`${piece.kind}:${body}`)
  }
  return out
}

function feed(
  chunks: readonly Uint8Array[],
  scan: SentinelScan = watchSentinels(idleSentinels, nonce),
) {
  const pieces: SentinelPiece[] = []
  let state = scan
  for (const chunk of chunks) {
    const step = scanSentinels(state, chunk)
    state = step.scan
    pieces.push(...step.pieces)
  }
  return { state, pieces }
}

describe('terminal sentinels', () => {
  it('writes the OSC private sequence with the segment nonce', () => {
    expect(Buffer.from(sentinel('begin', nonce))).toEqual(begin)
    expect(Buffer.from(sentinel('end', nonce))).toEqual(end)
  })

  it('attributes bytes around two sentinels in one chunk and removes the sentinels', () => {
    const { pieces, state } = feed([
      Buffer.concat([text('pre'), begin, text('abc'), end, text('post')]),
    ])
    expect(attribution(pieces)).toEqual([
      'between:pre',
      'begin',
      'segment:abc',
      'end',
      'between:post',
    ])
    expect(state.inSegment).toBe(false)
  })

  it('recognizes a sentinel split at every position between two chunks', () => {
    const stream = Buffer.concat([text('pre'), begin, text('a\r\nb'), end, text('post')])
    const whole = attribution(feed([stream]).pieces)
    for (let at = 1; at < stream.length; at++)
      expect(
        attribution(feed([stream.subarray(0, at), stream.subarray(at)]).pieces),
        `split ${at}`,
      ).toEqual(whole)
    const bytewise = [...stream].map(byte => Uint8Array.of(byte))
    expect(attribution(feed(bytewise).pieces)).toEqual(whole)
  })

  it('keeps a sentinel with another nonce as data', () => {
    const forged = text('\u001b]7770;omne-e;deadbeef\u0007')
    const { pieces } = feed([Buffer.concat([begin, forged, text('x'), end])])
    expect(attribution(pieces)).toEqual(['begin', `segment:${forged.toString('latin1')}x`, 'end'])
  })

  it('emits a false start byte by byte so a real sentinel right after it is still found', () => {
    const partial = text('\u001b]7770;omne-e;')
    const { pieces } = feed([begin, partial, end])
    expect(attribution(pieces)).toEqual(['begin', `segment:${partial.toString('latin1')}`, 'end'])
  })

  it('holds half a sentinel at the end of the stream and releases it as data', () => {
    const half = end.subarray(0, 12)
    const held = feed([Buffer.concat([begin, text('x'), half])])
    expect(attribution(held.pieces)).toEqual(['begin', 'segment:x'])
    const released = releaseSentinels(held.state)
    expect(attribution(released.pieces)).toEqual([`segment:${half.toString('latin1')}`])
    expect(released.scan).toEqual(idleSentinels)
  })

  it('releases held bytes as data when the next bytes do not complete the sentinel', () => {
    const half = end.subarray(0, 12)
    const { pieces } = feed([Buffer.concat([begin, half]), text('y'), end])
    expect(attribution(pieces)).toEqual(['begin', `segment:${half.toString('latin1')}y`, 'end'])
  })

  it('recognizes nothing and holds nothing without a nonce', () => {
    const stream = Buffer.concat([begin, text('x'), end.subarray(0, 5)])
    const { pieces, state } = feed([stream], idleSentinels)
    expect(attribution(pieces)).toEqual([`between:${stream.toString('latin1')}`])
    expect(state).toEqual(idleSentinels)
  })

  describe('the pieces, exactly', () => {
    /** Every piece as it is, empty ones included, so that no chunking hides behind a merge. */
    const raw = (pieces: readonly SentinelPiece[]) =>
      pieces.map(piece =>
        piece.kind === 'begin' || piece.kind === 'end'
          ? piece.kind
          : `${piece.kind}:${Buffer.from(piece.bytes).toString('latin1')}`,
      )

    it('makes no empty piece around a sentinel at the edge of a chunk', () => {
      expect(raw(feed([Buffer.concat([begin, end])]).pieces)).toEqual(['begin', 'end'])
      expect(raw(feed([Buffer.concat([begin, text('a'), end])]).pieces)).toEqual([
        'begin',
        'segment:a',
        'end',
      ])
    })

    it('makes no piece from an empty chunk, held bytes or none', () => {
      const watching = watchSentinels(idleSentinels, nonce)
      const empty = scanSentinels(watching, new Uint8Array(0))
      expect(empty.pieces).toEqual([])
      expect(empty.scan).toEqual(watching)
      const held = feed([end.subarray(0, 7)]).state
      const again = scanSentinels(held, new Uint8Array(0))
      expect(again.pieces).toEqual([])
      expect(Buffer.from(again.scan.held)).toEqual(end.subarray(0, 7))
    })

    it('makes no piece from an empty chunk without a nonce either', () => {
      expect(scanSentinels(idleSentinels, new Uint8Array(0)).pieces).toEqual([])
    })

    it('puts the whole chunk in one piece when it holds no ESC', () => {
      expect(raw(feed([text('plain'), text('more')]).pieces)).toEqual([
        'between:plain',
        'between:more',
      ])
      expect(raw(feed([begin, text('in'), text('side')]).pieces)).toEqual([
        'begin',
        'segment:in',
        'segment:side',
      ])
    })
  })

  describe('release', () => {
    it('has nothing to say when nothing is held, and goes back to idle', () => {
      const watching = watchSentinels(idleSentinels, nonce)
      expect(releaseSentinels(watching)).toEqual({ scan: idleSentinels, pieces: [] })
      const inside = feed([Buffer.concat([begin, text('x')])]).state
      expect(releaseSentinels(inside)).toEqual({ scan: idleSentinels, pieces: [] })
      expect(releaseSentinels(idleSentinels)).toEqual({ scan: idleSentinels, pieces: [] })
    })

    it('gives held bytes back as between-segment bytes when no begin sentinel was read', () => {
      const half = begin.subarray(0, 9)
      const held = feed([Buffer.concat([text('pre'), half])]).state
      const released = releaseSentinels(held)
      expect(released.pieces).toHaveLength(1)
      expect(released.pieces[0]?.kind).toBe('between')
      expect(Buffer.from((released.pieces[0] as { bytes: Uint8Array }).bytes)).toEqual(half)
    })

    it('gives held bytes back as segment bytes inside a segment', () => {
      const half = end.subarray(0, 9)
      const released = releaseSentinels(feed([Buffer.concat([begin, half])]).state)
      expect(released.pieces).toHaveLength(1)
      expect(released.pieces[0]?.kind).toBe('segment')
    })
  })

  describe('a stream that stops one byte short of a sentinel', () => {
    it('finishes the sentinel when the last byte comes in the next chunk', () => {
      for (const mark of [begin, end]) {
        const { pieces, state } = feed([
          Buffer.concat([text('a'), mark.subarray(0, mark.length - 1)]),
          mark.subarray(mark.length - 1),
        ])
        expect(attribution(pieces)).toEqual(['between:a', mark === begin ? 'begin' : 'end'])
        expect(state.held.length).toBe(0)
      }
    })

    it('holds all but the last byte of a sentinel until more arrives', () => {
      const short = begin.subarray(0, begin.length - 1)
      const { pieces, state } = feed([short])
      expect(pieces).toEqual([])
      expect(Buffer.from(state.held)).toEqual(short)
    })

    it('gives the bytes back as data when the last byte is wrong', () => {
      const short = begin.subarray(0, begin.length - 1)
      const { pieces, state } = feed([short, text('X')])
      expect(attribution(pieces)).toEqual([`between:${short.toString('latin1')}X`])
      expect(state.held.length).toBe(0)
    })

    it('does not hold a full-length sequence that only has another nonce', () => {
      const forged = text(`\u001b]7770;omne-b;${'f'.repeat(nonce.length)}\u0007`)
      expect(forged.length).toBe(begin.length)
      const { pieces, state } = feed([forged])
      expect(attribution(pieces)).toEqual([`between:${forged.toString('latin1')}`])
      expect(state.held.length).toBe(0)
    })

    it('does not hold a prefix that is a whole sentinel of the other kind plus more', () => {
      const { pieces, state } = feed([Buffer.concat([end, text('tail')])])
      expect(attribution(pieces)).toEqual(['end', 'between:tail'])
      expect(state.held.length).toBe(0)
    })
  })

  describe('ESC outside a sentinel', () => {
    it('is data, and nothing is held for it', () => {
      const colors = text('\u001b[31mred\u001b[0m')
      const { pieces, state } = feed([colors])
      expect(attribution(pieces)).toEqual([`between:${colors.toString('latin1')}`])
      expect(state.held.length).toBe(0)
    })

    it('is data inside a segment too', () => {
      const colors = text('\u001b[1m')
      expect(attribution(feed([Buffer.concat([begin, colors, end])]).pieces)).toEqual([
        'begin',
        `segment:${colors.toString('latin1')}`,
        'end',
      ])
    })

    it('is held when it ends the stream, and is data when the next byte does not continue it', () => {
      const held = feed([text('a\u001b')])
      expect(attribution(held.pieces)).toEqual(['between:a'])
      expect(Buffer.from(held.state.held)).toEqual(text('\u001b'))
      const next = scanSentinels(held.state, text('[0m'))
      expect(attribution(next.pieces)).toEqual(['between:\u001b[0m'])
      expect(next.scan.held.length).toBe(0)
    })

    it('does not hide a sentinel that follows it directly', () => {
      expect(attribution(feed([Buffer.concat([text('\u001b'), begin, text('x')])]).pieces)).toEqual(
        ['between:\u001b', 'begin', 'segment:x'],
      )
      expect(attribution(feed([Buffer.concat([text('\u001b\u001b'), begin])]).pieces)).toEqual([
        'between:\u001b\u001b',
        'begin',
      ])
    })

    it('does not skip an ESC right after a false start', () => {
      const stream = Buffer.concat([begin, text('\u001b\u001b'), end])
      expect(attribution(feed([stream]).pieces)).toEqual(['begin', 'segment:\u001b\u001b', 'end'])
    })
  })
})
