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
const begin = Buffer.from(sentinel('begin', nonce))
const end = Buffer.from(sentinel('end', nonce))
const text = (value: string) => Buffer.from(value, 'latin1')

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
    expect(Buffer.from(sentinel('begin', nonce)).toString('latin1')).toBe(
      `\u001b]7770;omne-b;${nonce}\u0007`,
    )
    expect(Buffer.from(sentinel('end', nonce)).toString('latin1')).toBe(
      `\u001b]7770;omne-e;${nonce}\u0007`,
    )
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
})
