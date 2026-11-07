// The byte bound of one SSE event (SPEC H8, contract T2). The SSE parser bounds what it buffers
// in characters, after decoding; a 3-byte UTF-8 character counts as one there. This stream counts
// the raw bytes before the decoder. It reads no SSE fields: it knows only the line ends.
const LF = 0x0a
const CR = 0x0d

/**
 * Where the count is relative to the line ends. `line-start`: no byte of the current line yet, so
 * a line end makes an empty line. `in-line`: the line has a byte. `cr-after-line`: a CR just ended
 * a line that had a byte. `cr-after-boundary`: a CR just ended an empty line. After a CR, an LF
 * completes a CRLF and is no line end of its own.
 */
type Position = 'line-start' | 'in-line' | 'cr-after-line' | 'cr-after-boundary'

/**
 * One byte's effect: `add` counts it into the event; `reset` makes it part of an event boundary,
 * so the count starts again at zero.
 */
type Move = Readonly<{ count: 'add' | 'reset'; next: Position }>

const ON_LF: Readonly<Record<Position, Move>> = {
  'line-start': { count: 'reset', next: 'line-start' },
  'in-line': { count: 'add', next: 'line-start' },
  'cr-after-line': { count: 'add', next: 'line-start' },
  'cr-after-boundary': { count: 'reset', next: 'line-start' },
}

const ON_CR: Readonly<Record<Position, Move>> = {
  'line-start': { count: 'reset', next: 'cr-after-boundary' },
  'in-line': { count: 'add', next: 'cr-after-line' },
  'cr-after-line': { count: 'reset', next: 'cr-after-boundary' },
  'cr-after-boundary': { count: 'reset', next: 'cr-after-boundary' },
}

const ON_OTHER: Move = { count: 'add', next: 'in-line' }

function moveOf(position: Position, byte: number): Move {
  if (byte === LF) return ON_LF[position]
  if (byte === CR) return ON_CR[position]
  return ON_OTHER
}

/**
 * Passes the bytes of an SSE body through and errors the stream with a `RangeError` when the
 * bytes since the last event boundary pass `limit`. A line ends with CR, LF or CRLF; a CRLF split
 * across two chunks is one line end. An empty line is the boundary of an event: the bytes of the
 * event are its lines with their line ends, and the empty line resets the count. The chunk in
 * which the count passes the bound is not passed on, and no chunk after it is.
 */
export class SseEventBytes extends TransformStream<Uint8Array, Uint8Array> {
  constructor(limit: number) {
    let count = 0
    let position: Position = 'line-start'
    super({
      transform(chunk, controller) {
        for (const byte of chunk) {
          const move = moveOf(position, byte)
          count = move.count === 'add' ? count + 1 : 0
          position = move.next
          if (count > limit) {
            controller.error(
              new RangeError(
                `an SSE event passed the byte bound of ${limit} bytes: ${count} bytes read since the last event boundary`,
              ),
            )
            return
          }
        }
        controller.enqueue(chunk)
      },
    })
  }
}
