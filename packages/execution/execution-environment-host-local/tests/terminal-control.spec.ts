// The host's reader of the terminal gate's control frames: what each frame says (decode), and
// which frame each state of one terminal accepts (the reader's transitions). Everything is driven
// through `createTerminalReader`: bytes in, frames or a fault out. A frame the state does not
// accept ends the reader in `fault`, for good.
import { describe, expect, it } from 'vitest'
import { createTerminalReader } from '../src/terminal-control.ts'

const generation = 'gen'
const leg = 'L'
const bounds = { maxChunkBytes: 64, maxControlBytes: 4096, betweenSegmentBytes: 10 }

type Wire = Record<string, unknown>
const line = (frame: unknown) => Buffer.from(`${JSON.stringify(frame)}\n`)
const b64 = (text: string) => Buffer.from(text).toString('base64')

/** One frame of each kind in the wire shape the gate sends, for leg `id`. */
const wire = {
  ready: (): Wire => ({ t: 'ready', generation }),
  opened: (): Wire => ({ t: 'opened', cwd: '/w', generation }),
  started: (id = leg): Wire => ({ t: 'started', leg: id, generation }),
  between: (id = leg, text = 'ab'): Wire => ({ t: 'between', leg: id, b: b64(text), generation }),
  begun: (id = leg, discarded = 0): Wire => ({ t: 'begun', leg: id, discarded, generation }),
  data: (id = leg, text = 'cd'): Wire => ({ t: 'data', leg: id, b: b64(text), generation }),
  finished: (id = leg): Wire => ({ t: 'finished', leg: id, code: 0, cwd: '/w', generation }),
  fault: (): Wire => ({ t: 'fault', generation }),
}
type Kind = keyof typeof wire
const kinds = Object.keys(wire) as Kind[]

type Reader = ReturnType<typeof createTerminalReader>
function newReader(overrides: Partial<typeof bounds> = {}): Reader {
  return createTerminalReader({ generation, ...bounds, ...overrides })
}
function accepted(reader: Reader, frame: unknown): boolean {
  return reader.push(line(frame)).kind === 'frames'
}
function pushAll(reader: Reader, ...frames: unknown[]): void {
  for (const frame of frames)
    if (!accepted(reader, frame)) throw new Error(`setup: ${JSON.stringify(frame)} was refused`)
}

/**
 * The eight situations a reader can be in. `starting` and `running` each come with and without
 * the begin sentinel, because the sentinel may be read before or after the started observation.
 */
const situations = {
  launching: () => newReader(),
  ready: () => {
    const reader = newReader()
    pushAll(reader, wire.ready())
    return reader
  },
  idle: () => {
    const reader = newReader()
    pushAll(reader, wire.ready(), wire.opened())
    return reader
  },
  starting: () => {
    const reader = situations.idle()
    reader.expectLeg(leg)
    return reader
  },
  startingBegun: () => {
    const reader = situations.starting()
    pushAll(reader, wire.begun())
    return reader
  },
  running: () => {
    const reader = situations.starting()
    pushAll(reader, wire.started())
    return reader
  },
  runningBegun: () => {
    const reader = situations.running()
    pushAll(reader, wire.begun())
    return reader
  },
  fault: () => {
    const reader = newReader()
    reader.push(Buffer.from('not json\n'))
    return reader
  },
}
type Situation = keyof typeof situations

/** Which frames each situation accepts; every other frame of the right leg is a fault. */
const accepts: Record<Situation, readonly Kind[]> = {
  launching: ['ready'],
  ready: ['opened'],
  idle: [],
  starting: ['started', 'between', 'begun'],
  startingBegun: ['started', 'data'],
  running: ['between', 'begun'],
  runningBegun: ['data', 'finished'],
  fault: [],
}

describe('the reader accepts a frame only in the state that expects it', () => {
  for (const name of Object.keys(situations) as Situation[])
    describe(name, () => {
      for (const kind of kinds) {
        const expected = accepts[name].includes(kind)
        it(`${expected ? 'accepts' : 'refuses'} ${kind}`, () => {
          const reader = situations[name]()
          const result = reader.push(line(wire[kind]()))
          expect(result.kind).toBe(expected ? 'frames' : 'fault')
          if (result.kind === 'frames')
            expect(result.frames.map(frame => frame.kind)).toEqual([kind])
          // A refusal is final; an acceptance leaves the reader usable.
          expect(reader.push(Buffer.alloc(0)).kind).toBe(expected ? 'frames' : 'fault')
        })
      }
      it('refuses a frame of another leg', () => {
        const reader = situations[name]()
        for (const kind of ['started', 'between', 'begun', 'data', 'finished'] as const)
          expect(situations[name]().push(line(wire[kind]('other'))).kind, kind).toBe('fault')
        expect(reader.push(Buffer.alloc(0)).kind).toBe(name === 'fault' ? 'fault' : 'frames')
      })
    })

  it('refuses every frame whose generation is not the terminal generation, even ready and fault', () => {
    for (const kind of kinds)
      expect(newReader().push(line({ ...wire[kind](), generation: 'other' })).kind, kind).toBe(
        'fault',
      )
    expect(newReader().push(line({ t: 'ready' })).kind).toBe('fault')
  })

  it('refuses a fault frame in every state', () => {
    for (const name of Object.keys(situations) as Situation[])
      expect(situations[name]().push(line(wire.fault())).kind, name).toBe('fault')
  })
})

describe('the order of one leg', () => {
  it('takes started and begun in either order', () => {
    const startedFirst = situations.starting()
    pushAll(startedFirst, wire.started(), wire.begun(), wire.data(), wire.finished())
    const begunFirst = situations.starting()
    pushAll(begunFirst, wire.begun(), wire.started(), wire.data(), wire.finished())
  })

  it('refuses begun a second time', () => {
    const reader = situations.runningBegun()
    expect(reader.push(line(wire.begun())).kind).toBe('fault')
  })

  it('refuses data before begun and finished without begun', () => {
    expect(situations.running().push(line(wire.data())).kind).toBe('fault')
    expect(situations.starting().push(line(wire.data())).kind).toBe('fault')
    expect(situations.running().push(line(wire.finished())).kind).toBe('fault')
  })

  it('refuses finished while the leg is only starting, even after begun', () => {
    expect(situations.startingBegun().push(line(wire.finished())).kind).toBe('fault')
  })

  it('refuses between once begun, and between after data', () => {
    expect(situations.startingBegun().push(line(wire.between())).kind).toBe('fault')
    const reader = situations.runningBegun()
    pushAll(reader, wire.data())
    expect(reader.push(line(wire.between())).kind).toBe('fault')
  })

  it('goes back to idle on finished and then expects the next leg only', () => {
    const reader = situations.runningBegun()
    pushAll(reader, wire.finished())
    // The finished leg is closed: its id means nothing any more, and no leg is expected yet.
    expect(reader.push(line(wire.data())).kind).toBe('fault')

    const next = situations.runningBegun()
    pushAll(next, wire.finished())
    next.expectLeg('M')
    expect(next.push(line(wire.started(leg))).kind).toBe('fault')

    const again = situations.runningBegun()
    pushAll(again, wire.finished())
    again.expectLeg('M')
    pushAll(again, wire.between('M'), wire.begun('M'), wire.started('M'), wire.data('M'))
    pushAll(again, wire.finished('M'))
  })

  it('starts the next leg with no begun and no between bytes counted', () => {
    const reader = situations.runningBegun()
    pushAll(reader, wire.finished())
    reader.expectLeg('M')
    // A stale begun from the previous leg would refuse this begun; stale counts would refuse the between.
    pushAll(reader, wire.between('M', '0123456789'), wire.begun('M'))
  })
})

describe('expectLeg', () => {
  it('is a fault unless the reader is idle', () => {
    for (const name of Object.keys(situations) as Situation[]) {
      if (name === 'idle') continue
      const reader = situations[name]()
      reader.expectLeg('M')
      expect(reader.push(Buffer.alloc(0)).kind, name).toBe('fault')
    }
  })

  it('arms an idle reader for exactly that leg', () => {
    const reader = situations.idle()
    reader.expectLeg('M')
    expect(reader.push(line(wire.started('M'))).kind).toBe('frames')
  })
})

describe('the between-segment bound', () => {
  const start = () => situations.starting()

  it('accepts bytes that add up to the bound', () => {
    const reader = start()
    pushAll(reader, wire.between(leg, '1234'), wire.between(leg, '567890'))
    expect(reader.push(Buffer.alloc(0)).kind).toBe('frames')
  })

  it('accepts a single frame of exactly the bound', () => {
    expect(accepted(start(), wire.between(leg, '1234567890'))).toBe(true)
  })

  it('refuses one byte more than the bound in one frame', () => {
    expect(accepted(start(), wire.between(leg, '12345678901'))).toBe(false)
  })

  it('refuses one byte more than the bound across frames', () => {
    const reader = start()
    pushAll(reader, wire.between(leg, '12345'), wire.between(leg, '6789'))
    expect(accepted(reader, wire.between(leg, '01'))).toBe(false)
  })

  it('counts each frame, however many are sent', () => {
    const reader = start()
    for (let i = 0; i < 10; i++) pushAll(reader, wire.between(leg, 'x'))
    expect(accepted(reader, wire.between(leg, 'x'))).toBe(false)
  })

  it('does not take the bound from the chunk size', () => {
    const reader = newReader({ maxChunkBytes: 4, betweenSegmentBytes: 8 })
    reader.push(line(wire.started()))
    expect(reader.push(line(wire.between(leg, 'abcde'))).kind).toBe('fault')
    const other = newReader({ maxChunkBytes: 4, betweenSegmentBytes: 8 })
    pushAll(other, wire.ready(), wire.opened())
    other.expectLeg(leg)
    pushAll(other, wire.between(leg, 'abcd'), wire.between(leg, 'abcd'))
    expect(accepted(other, wire.between(leg, 'a'))).toBe(false)
  })

  it('counts afresh for each leg', () => {
    const reader = situations.runningBegun()
    pushAll(reader, wire.finished())
    reader.expectLeg('M')
    pushAll(reader, wire.between('M', '1234567890'))
    expect(accepted(reader, wire.between('M', '1'))).toBe(false)
  })
})

describe('what each frame says', () => {
  /** A fresh reader in a state where `frame` is accepted unless its content is wrong. */
  function pushed(kind: Kind, frame: unknown) {
    const where: Record<Kind, Situation> = {
      ready: 'launching',
      opened: 'ready',
      started: 'starting',
      between: 'starting',
      begun: 'starting',
      data: 'runningBegun',
      finished: 'runningBegun',
      fault: 'launching',
    }
    return situations[where[kind]]().push(line(frame))
  }
  const frames = (kind: Kind, frame: unknown) => {
    const result = pushed(kind, frame)
    return result.kind === 'frames' ? result.frames : 'fault'
  }

  it('reads each kind into its fields', () => {
    expect(frames('ready', wire.ready())).toEqual([{ kind: 'ready' }])
    expect(frames('opened', wire.opened())).toEqual([{ kind: 'opened', cwd: '/w' }])
    expect(frames('started', wire.started())).toEqual([{ kind: 'started', leg }])
    expect(frames('between', wire.between(leg, 'ab'))).toEqual([
      { kind: 'between', leg, bytes: Uint8Array.of(97, 98) },
    ])
    expect(frames('begun', wire.begun(leg, 7))).toEqual([{ kind: 'begun', leg, discarded: 7 }])
    expect(frames('data', wire.data(leg, 'cd'))).toEqual([
      { kind: 'data', leg, bytes: Uint8Array.of(99, 100) },
    ])
    expect(frames('finished', { ...wire.finished(), code: 3, cwd: '/x' })).toEqual([
      { kind: 'finished', leg, code: 3, cwd: '/x' },
    ])
  })

  it('ignores extra fields', () => {
    expect(frames('started', { ...wire.started(), more: 1 })).toEqual([{ kind: 'started', leg }])
  })

  it.each([
    ['a number', 1],
    ['null', null],
    ['a string', 'ready'],
    ['an array', [wire.ready()]],
    ['an object without a kind', { generation }],
    ['an unknown kind', { t: 'bogus', generation }],
    ['a kind that is not text', { t: 5, generation }],
  ])('refuses %s', (_name, value) => {
    expect(newReader().push(line(value)).kind).toBe('fault')
  })

  it('refuses an unknown kind that carries a leg and bytes', () => {
    expect(
      situations.starting().push(line({ t: 'bogus', leg, b: b64('x'), generation })).kind,
    ).toBe('fault')
  })

  describe('opened', () => {
    it.each([
      ['a relative cwd', { cwd: 'w' }],
      ['an empty cwd', { cwd: '' }],
      ['a cwd that is not text', { cwd: 7 }],
      ['no cwd', { cwd: undefined }],
    ])('refuses %s', (_name, patch) => {
      expect(frames('opened', { ...wire.opened(), ...patch })).toBe('fault')
    })
    it('takes the root as a cwd', () => {
      expect(frames('opened', { ...wire.opened(), cwd: '/' })).toEqual([
        { kind: 'opened', cwd: '/' },
      ])
    })
  })

  describe('a leg frame', () => {
    it.each(['started', 'between', 'begun', 'data', 'finished'] as const)(
      'refuses %s with an empty leg, a leg that is not text, or no leg',
      kind => {
        for (const patch of [{ leg: '' }, { leg: 1 }, { leg: undefined }])
          expect(frames(kind, { ...wire[kind](), ...patch })).toBe('fault')
      },
    )
  })

  describe('begun', () => {
    it.each([
      ['a negative count', -1],
      ['a fraction', 1.5],
      ['a count that is not a safe integer', 2 ** 53],
      ['text', '1'],
      ['no count', undefined],
      ['null', null],
      ['not a number', Number.NaN],
    ])('refuses %s', (_name, discarded) => {
      expect(frames('begun', { ...wire.begun(), discarded })).toBe('fault')
    })
    it.each([0, 1, 2 ** 53 - 1])('takes %i discarded bytes', discarded => {
      expect(frames('begun', wire.begun(leg, discarded))).toEqual([
        { kind: 'begun', leg, discarded },
      ])
    })
  })

  describe('finished', () => {
    it.each([
      ['a negative code', { code: -1 }],
      ['code 256', { code: 256 }],
      ['a fractional code', { code: 1.5 }],
      ['a code that is text', { code: '0' }],
      ['no code', { code: undefined }],
      ['a relative cwd', { cwd: 'w' }],
      ['no cwd', { cwd: undefined }],
      ['a cwd that is not text', { cwd: 1 }],
    ])('refuses %s', (_name, patch) => {
      expect(frames('finished', { ...wire.finished(), ...patch })).toBe('fault')
    })
    it.each([0, 1, 255])('takes exit code %i', code => {
      expect(frames('finished', { ...wire.finished(), code })).toEqual([
        { kind: 'finished', leg, code, cwd: '/w' },
      ])
    })
  })

  describe.each(['between', 'data'] as const)('%s bytes', kind => {
    it.each([
      ['no padding where it is needed', 'YQ'],
      ['a length that is not a multiple of four', 'YQ='],
      ['characters outside the alphabet', 'Y!=='],
      ['padding in the middle', 'YQ==YQ=='],
      ['text with a space', 'YQ =='],
      ['a number', 5],
      ['nothing', undefined],
    ])('refuse %s', (_name, b) => {
      expect(frames(kind, { ...wire[kind](), b })).toBe('fault')
    })
    it('take empty and padded text', () => {
      expect(frames(kind, { ...wire[kind](), b: '' })).toEqual([
        { kind, leg, bytes: new Uint8Array(0) },
      ])
      expect(frames(kind, { ...wire[kind](), b: 'YQ==' })).toEqual([
        { kind, leg, bytes: Uint8Array.of(97) },
      ])
      expect(frames(kind, { ...wire[kind](), b: 'YWI=' })).toEqual([
        { kind, leg, bytes: Uint8Array.of(97, 98) },
      ])
    })
    it('take a chunk of exactly the chunk bound and refuse one byte more', () => {
      const bound = bounds.maxChunkBytes
      // The between-segment bound is a different limit; keep it out of the way here.
      const reader = (): Reader => {
        if (kind === 'data') return situations.runningBegun()
        const wide = newReader({ betweenSegmentBytes: 1000 })
        pushAll(wide, wire.ready(), wire.opened())
        wide.expectLeg(leg)
        return wide
      }
      const pushBytes = (size: number) =>
        reader().push(line({ ...wire[kind](), b: b64('x'.repeat(size)) })).kind
      expect(pushBytes(bound)).toBe('frames')
      expect(pushBytes(bound + 1)).toBe('fault')
    })
    it('decode bytes that are not text', () => {
      const bytes = Uint8Array.of(0, 255, 10, 27)
      expect(frames(kind, { ...wire[kind](), b: Buffer.from(bytes).toString('base64') })).toEqual([
        { kind, leg, bytes },
      ])
    })
  })
})

describe('bytes of the control channel', () => {
  it('reads several frames from one push, in order', () => {
    const reader = newReader()
    const result = reader.push(Buffer.concat([line(wire.ready()), line(wire.opened())]))
    expect(result.kind === 'frames' && result.frames.map(frame => frame.kind)).toEqual([
      'ready',
      'opened',
    ])
  })

  it('keeps a partial line until its end arrives, wherever it is cut', () => {
    const bytes = Buffer.concat([line(wire.ready()), line(wire.opened())])
    for (let at = 1; at < bytes.length; at++) {
      const reader = newReader()
      const first = reader.push(bytes.subarray(0, at))
      const second = reader.push(bytes.subarray(at))
      const kinds = [first, second].flatMap(result =>
        result.kind === 'frames' ? result.frames.map(frame => frame.kind) : ['fault'],
      )
      expect(kinds, `cut at ${at}`).toEqual(['ready', 'opened'])
    }
  })

  it('reads a frame sent one byte at a time', () => {
    const reader = newReader()
    const seen: string[] = []
    for (const byte of line(wire.ready())) {
      const result = reader.push(Uint8Array.of(byte))
      if (result.kind === 'fault') throw new Error('fault')
      seen.push(...result.frames.map(frame => frame.kind))
    }
    expect(seen).toEqual(['ready'])
  })

  it('is a fault for a line that is not JSON, an empty line or a bad UTF-8 line', () => {
    for (const text of [Buffer.from('nope\n'), Buffer.from('\n'), Buffer.from([0xff, 0xfe, 10])])
      expect(newReader().push(text).kind).toBe('fault')
  })

  it('is a fault when a later line of the same push is refused, and gives no frames', () => {
    const result = newReader().push(Buffer.concat([line(wire.ready()), line(wire.ready())]))
    expect(result.kind).toBe('fault')
  })

  it('puts the frames read before a bad line out of reach: the reader is in fault', () => {
    const reader = newReader()
    reader.push(Buffer.concat([line(wire.ready()), Buffer.from('nope\n')]))
    expect(reader.push(line(wire.opened())).kind).toBe('fault')
  })

  describe('the bound of one line', () => {
    const padded = (size: number, frame: Wire = wire.ready()) => {
      const body = JSON.stringify(frame)
      return Buffer.from(body + ' '.repeat(size - body.length))
    }
    const bound = 200

    it('takes a line of exactly the bound', () => {
      const reader = newReader({ maxControlBytes: bound })
      expect(reader.push(Buffer.concat([padded(bound), Buffer.from('\n')])).kind).toBe('frames')
    })

    it('refuses a line one byte over the bound, with or without its end', () => {
      expect(
        newReader({ maxControlBytes: bound }).push(
          Buffer.concat([padded(bound + 1), Buffer.from('\n')]),
        ).kind,
      ).toBe('fault')
      expect(newReader({ maxControlBytes: bound }).push(padded(bound + 1)).kind).toBe('fault')
    })

    it('refuses a line whose parts over several pushes add up to more than the bound', () => {
      const reader = newReader({ maxControlBytes: bound })
      const whole = padded(bound + 1)
      expect(reader.push(whole.subarray(0, 150)).kind).toBe('frames')
      expect(reader.push(whole.subarray(150)).kind).toBe('fault')
    })

    it('counts each line afresh', () => {
      const reader = newReader({ maxControlBytes: bound })
      const second = Buffer.from(JSON.stringify(wire.opened()))
      const result = reader.push(
        Buffer.concat([
          padded(bound),
          Buffer.from('\n'),
          second,
          Buffer.from(' '.repeat(bound - second.length)),
          Buffer.from('\n'),
        ]),
      )
      expect(result.kind === 'frames' && result.frames.length).toBe(2)
    })

    it('does not count the bytes of a line that already ended', () => {
      const reader = newReader({ maxControlBytes: bound })
      pushAll(reader, wire.ready())
      expect(
        reader.push(Buffer.concat([padded(bound - 1, wire.opened()), Buffer.from('\n')])).kind,
      ).toBe('frames')
    })
  })
})

describe('fault', () => {
  it('stays: no later byte is read, not even an empty push', () => {
    const reader = newReader()
    expect(reader.push(Buffer.from('nope\n')).kind).toBe('fault')
    expect(reader.push(line(wire.ready())).kind).toBe('fault')
    expect(reader.push(Buffer.alloc(0)).kind).toBe('fault')
  })
})
