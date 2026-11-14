const LF = 0x0a
const CR = 0x0d

type Position = 'line-start' | 'in-line' | 'cr-after-line' | 'cr-after-boundary'

type Move = Readonly<{ reset: boolean; next: Position }>

const ON_LF: Readonly<Record<Position, Move>> = {
  'line-start': { reset: true, next: 'line-start' },
  'in-line': { reset: false, next: 'line-start' },
  'cr-after-line': { reset: false, next: 'line-start' },
  'cr-after-boundary': { reset: true, next: 'line-start' },
}

const ON_CR: Readonly<Record<Position, Move>> = {
  'line-start': { reset: true, next: 'cr-after-boundary' },
  'in-line': { reset: false, next: 'cr-after-line' },
  'cr-after-line': { reset: true, next: 'cr-after-boundary' },
  'cr-after-boundary': { reset: true, next: 'cr-after-boundary' },
}

const ON_OTHER: Move = { reset: false, next: 'in-line' }

function moveOf(position: Position, byte: number): Move {
  if (byte === LF) return ON_LF[position]
  if (byte === CR) return ON_CR[position]
  return ON_OTHER
}

export class SseEventBytes extends TransformStream<Uint8Array, Uint8Array> {
  constructor(limit: number) {
    let count = 0
    let position: Position = 'line-start'
    super({
      transform(chunk, controller) {
        for (const byte of chunk) {
          const move = moveOf(position, byte)
          count = move.reset ? 0 : count + 1
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
