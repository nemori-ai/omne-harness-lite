// The byte bound of one SSE event (SPEC H8, contract T2). The SSE parser bounds what it buffers
// in characters, after decoding; a 3-byte UTF-8 character counts as one there. This stream counts
// the raw bytes before the decoder. It reads no SSE fields: it knows only the line ends.
const LF = 0x0a
const CR = 0x0d

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
    /** No byte of the current line has come yet: a line end here makes an empty line. */
    let lineEmpty = true
    /** The last byte was a CR: an LF now completes a CRLF and is no line end of its own. */
    let afterCr = false
    /** The CR of that CRLF ended an empty line: its LF belongs to the boundary, not to an event. */
    let crEndedEmptyLine = false
    super({
      transform(chunk, controller) {
        for (const byte of chunk) {
          if (afterCr && byte === LF) {
            afterCr = false
            if (!crEndedEmptyLine) count += 1
          } else if (byte === CR || byte === LF) {
            afterCr = byte === CR
            crEndedEmptyLine = lineEmpty
            if (lineEmpty) count = 0
            else count += 1
            lineEmpty = true
          } else {
            afterCr = false
            lineEmpty = false
            count += 1
          }
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
