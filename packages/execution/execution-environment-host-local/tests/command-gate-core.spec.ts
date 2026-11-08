// The command gate's judgments without its process: the request it accepts, the action for each
// control line, how output becomes data frames, and when the quiet period after the exit ends.
// The frames are compared as JSON text because their key order is part of the bytes on the wire.
import { describe, expect, it } from 'vitest'
import {
  afterExit,
  afterExitRelay,
  cgroupNamesUnit,
  chunkRoute,
  controlStep,
  dataFrames,
  drainAfterExit,
  relayAfterExit,
  type CommandFrame,
  exitFrame,
  parseRequest,
  spawnFailedFrame,
  splitLines,
  standardInput,
  type ControlState,
  type GateRequest,
} from '../src/command-gate-core.ts'

const unit = 'omne-host-0b9c3a2e-5f0d-4d7e-9c51-2a0e6c1d4b7f.scope'

const valid = {
  executable: '/bin/echo',
  args: ['a', 'b'],
  cwd: '/work',
  env: { PATH: '/usr/bin' },
  stdin: null,
  maxChunkBytes: 4,
}
const request: GateRequest = valid

describe('parseRequest', () => {
  it('accepts a request with every field, with or without standard input', () => {
    expect(parseRequest(valid)).toEqual(valid)
    expect(parseRequest({ ...valid, stdin: 'aGk=', maxChunkBytes: 1 })).toEqual({
      ...valid,
      stdin: 'aGk=',
      maxChunkBytes: 1,
    })
    expect(parseRequest({ ...valid, args: [], env: {} })).toEqual({ ...valid, args: [], env: {} })
  })

  it('keeps only the request fields', () => {
    expect(parseRequest({ ...valid, extra: 1 })).toEqual(valid)
  })

  it.each([
    ['null', null],
    ['a string', 'request'],
    ['a number', 7],
    ['an executable that is not a string', { ...valid, executable: 1 }],
    ['a missing executable', { ...valid, executable: undefined }],
    ['a cwd that is not a string', { ...valid, cwd: null }],
    ['args that are not an array', { ...valid, args: 'a b' }],
    ['args with a value that is not a string', { ...valid, args: ['a', 2] }],
    ['an env that is null', { ...valid, env: null }],
    ['an env that is an array', { ...valid, env: ['A=1'] }],
    ['an env that is a string', { ...valid, env: 'A=1' }],
    ['an env with a value that is not a string', { ...valid, env: { A: '1', B: 2 } }],
    ['standard input that is neither text nor null', { ...valid, stdin: 1 }],
    ['standard input that is missing', { ...valid, stdin: undefined }],
    ['a chunk bound of zero', { ...valid, maxChunkBytes: 0 }],
    ['a fractional chunk bound', { ...valid, maxChunkBytes: 1.5 }],
    ['a chunk bound past the safe integers', { ...valid, maxChunkBytes: 2 ** 53 }],
    ['a chunk bound written as text', { ...valid, maxChunkBytes: '4' }],
  ])('rejects %s', (_, value) => {
    expect(parseRequest(value)).toBeUndefined()
  })
})

describe('cgroupNamesUnit', () => {
  const inUnit = `0::/user.slice/user-1001.slice/user@1001.service/app.slice/${unit}\n`

  it('is true when the last segment of the 0:: line is the unit', () => {
    expect(cgroupNamesUnit(inUnit, unit)).toBe(true)
    expect(cgroupNamesUnit(`12:pids:/other\n1:name=systemd:/x\n${inUnit}`, unit)).toBe(true)
  })

  it('is false for another unit, a parent of the unit, or a v1 line naming the unit', () => {
    expect(cgroupNamesUnit('0::/user.slice/other.scope\n', unit)).toBe(false)
    expect(cgroupNamesUnit(`0::/user.slice/${unit}/sub\n`, unit)).toBe(false)
    expect(cgroupNamesUnit(`1:name=systemd:/user.slice/${unit}\n`, unit)).toBe(false)
    expect(cgroupNamesUnit(`10::/user.slice/${unit}\n`, unit)).toBe(false)
    expect(cgroupNamesUnit('', unit)).toBe(false)
  })
})

describe('splitLines', () => {
  it('keeps a line without its newline until the newline arrives', () => {
    expect(splitLines('', '{"c":')).toEqual({ lines: [], pending: '{"c":' })
    expect(splitLines('{"c":', '"go"}\n')).toEqual({ lines: ['{"c":"go"}'], pending: '' })
  })

  it('splits several lines from one chunk, empty lines and carriage returns included', () => {
    expect(splitLines('a', 'b\nc\r\n\nd')).toEqual({ lines: ['ab', 'c\r', ''], pending: 'd' })
  })
})

describe('dataFrames', () => {
  const bytes = (text: string) => new Uint8Array(Buffer.from(text))

  it('cuts a chunk at the bound, the last frame holding the rest', () => {
    expect(JSON.stringify(dataFrames(bytes('abcdefghi'), 'stdout', 4))).toBe(
      JSON.stringify([
        { t: 'data', s: 'stdout', b: 'YWJjZA==' },
        { t: 'data', s: 'stdout', b: 'ZWZnaA==' },
        { t: 'data', s: 'stdout', b: 'aQ==' },
      ]),
    )
  })

  it('gives whole frames when the chunk divides evenly, and one short of a bound stays one frame', () => {
    expect(dataFrames(bytes('abcdefgh'), 'stderr', 4)).toEqual([
      { t: 'data', s: 'stderr', b: 'YWJjZA==' },
      { t: 'data', s: 'stderr', b: 'ZWZnaA==' },
    ])
    expect(dataFrames(bytes('abc'), 'stderr', 4)).toEqual([{ t: 'data', s: 'stderr', b: 'YWJj' }])
    expect(dataFrames(bytes('abcde'), 'stdout', 1)).toHaveLength(5)
  })

  it('gives no frame for an empty chunk', () => {
    expect(dataFrames(new Uint8Array(0), 'stdout', 4)).toEqual([])
  })

  it('reads only the view it is given, not the rest of its buffer', () => {
    const whole = Buffer.from('xxabcdyy')
    expect(dataFrames(whole.subarray(2, 6), 'stdout', 8)).toEqual([
      { t: 'data', s: 'stdout', b: 'YWJjZA==' },
    ])
  })
})

describe('the relay after the exit', () => {
  const bytes = (text: string) => new Uint8Array(Buffer.from(text))
  /** A channel that takes `room` frames, reporting full on the last one it takes. */
  const channel = (room: number) => {
    const sent: CommandFrame[] = []
    return {
      sent,
      send(frame: CommandFrame) {
        sent.push(frame)
        return sent.length < room
      },
      grow(more: number) {
        room = sent.length + more
      },
    }
  }

  it('sends data frames while the channel takes them, then counts the rest per stream', () => {
    const relay = afterExitRelay()
    const out = channel(2)
    relayAfterExit(relay, bytes('abcdefghij'), 'stdout', 4, out.send)
    expect(out.sent).toEqual([
      { t: 'data', s: 'stdout', b: 'YWJjZA==' },
      { t: 'data', s: 'stdout', b: 'ZWZnaA==' },
    ])
    expect(relay).toEqual({ dropping: true, dropped: { stdout: 2, stderr: 0 } })
    relayAfterExit(relay, bytes('xyz'), 'stderr', 4, out.send)
    expect(out.sent).toHaveLength(2)
    expect(relay.dropped).toEqual({ stdout: 2, stderr: 3 })
  })

  it('reports the counted bytes as drop frames once the channel drains, then sends data again', () => {
    const relay = afterExitRelay()
    const out = channel(1)
    relayAfterExit(relay, bytes('abcd'), 'stdout', 4, out.send)
    relayAfterExit(relay, bytes('efgh'), 'stdout', 4, out.send)
    relayAfterExit(relay, bytes('ij'), 'stderr', 4, out.send)
    out.grow(10)
    drainAfterExit(relay, out.send)
    relayAfterExit(relay, bytes('k'), 'stdout', 4, out.send)
    expect(out.sent.slice(1)).toEqual([
      { t: 'x', s: 'stdout', n: 4 },
      { t: 'x', s: 'stderr', n: 2 },
      { t: 'data', s: 'stdout', b: 'aw==' },
    ])
    expect(relay).toEqual({ dropping: false, dropped: { stdout: 0, stderr: 0 } })
  })

  it('drops again when a drop frame fills the channel, and sends nothing for a stream with no gap', () => {
    const relay = afterExitRelay()
    const out = channel(1)
    relayAfterExit(relay, bytes('abcd'), 'stdout', 4, out.send)
    relayAfterExit(relay, bytes('e'), 'stdout', 4, out.send)
    out.grow(1)
    drainAfterExit(relay, out.send)
    expect(out.sent.slice(1)).toEqual([{ t: 'x', s: 'stdout', n: 1 }])
    expect(relay.dropping).toBe(true)
    drainAfterExit(relay, out.send)
    expect(out.sent).toHaveLength(2)
  })
})

describe('controlStep', () => {
  const fresh: ControlState = { unit, request: undefined, went: false }
  const accepted: ControlState = { unit, request, went: false }
  const line = (value: unknown) => JSON.stringify(value)
  const scope = (answer: boolean) => {
    const calls: number[] = []
    return { calls, inOwnScope: () => (calls.push(1), answer) }
  }

  it('reports ready for a valid first request in the gate’s own unit', () => {
    const own = scope(true)
    expect(controlStep(fresh, line(valid), own.inOwnScope)).toEqual({ kind: 'ready', request })
    expect(own.calls).toHaveLength(1)
  })

  it('rejects a first line that is JSON but not a request, without reading the cgroup', () => {
    const own = scope(true)
    expect(controlStep(fresh, line({ c: 'go' }), own.inOwnScope)).toEqual({ kind: 'reject' })
    expect(controlStep(fresh, 'null', own.inOwnScope)).toEqual({ kind: 'reject' })
    expect(own.calls).toHaveLength(0)
  })

  it('rejects a valid request without a unit name, without reading the cgroup', () => {
    const own = scope(true)
    expect(controlStep({ ...fresh, unit: '' }, line(valid), own.inOwnScope)).toEqual({
      kind: 'reject',
    })
    expect(own.calls).toHaveLength(0)
  })

  it('rejects a valid request when the gate is not in its own unit', () => {
    const elsewhere = scope(false)
    expect(controlStep(fresh, line(valid), elsewhere.inOwnScope)).toEqual({ kind: 'reject' })
    expect(elsewhere.calls).toHaveLength(1)
  })

  it('ignores a line that is not JSON, before and after the request', () => {
    const own = scope(true)
    expect(controlStep(fresh, '{"executable"', own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(fresh, '', own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(accepted, 'go', own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(own.calls).toHaveLength(0)
  })

  it('starts the command on the first GO only', () => {
    const own = scope(true)
    expect(controlStep(accepted, line({ c: 'go' }), own.inOwnScope)).toEqual({
      kind: 'go',
      request,
    })
    expect(controlStep({ ...accepted, went: true }, line({ c: 'go' }), own.inOwnScope)).toEqual({
      kind: 'ignore',
    })
    expect(own.calls).toHaveLength(0)
  })

  it('passes term and retain on, before and after GO', () => {
    const own = scope(true)
    for (const state of [accepted, { ...accepted, went: true }]) {
      expect(controlStep(state, line({ c: 'term' }), own.inOwnScope)).toEqual({ kind: 'term' })
      expect(controlStep(state, line({ c: 'retain' }), own.inOwnScope)).toEqual({ kind: 'retain' })
    }
  })

  it('ignores an unknown command and a message that is not an object after the request', () => {
    const own = scope(true)
    expect(controlStep(accepted, line({ c: 'stop' }), own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(accepted, line({}), own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(accepted, line('go'), own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(accepted, 'null', own.inOwnScope)).toEqual({ kind: 'ignore' })
    expect(controlStep(accepted, line(valid), own.inOwnScope)).toEqual({ kind: 'ignore' })
  })
})

describe('chunkRoute', () => {
  it('sends data frames before the exit frame, relays after it, and discards once the manager is gone', () => {
    expect(chunkRoute({ finished: false, detached: false })).toBe('frames')
    // Before the exit frame a gone manager changes nothing here: the frames are dropped at the send.
    expect(chunkRoute({ finished: false, detached: true })).toBe('frames')
    expect(chunkRoute({ finished: true, detached: false })).toBe('relay')
    expect(chunkRoute({ finished: true, detached: true })).toBe('discard')
  })
})

describe('afterExit', () => {
  const exited = { exited: true, paused: false, finished: false, openStreams: 2 }

  it('arms the quiet period while a pipe is open, and finishes when both closed', () => {
    expect(afterExit(exited)).toBe('arm')
    expect(afterExit({ ...exited, openStreams: 1 })).toBe('arm')
    expect(afterExit({ ...exited, openStreams: 0 })).toBe('finish')
  })

  it('waits before the exit, while paused, and after the exit frame', () => {
    expect(afterExit({ ...exited, exited: false, openStreams: 0 })).toBe('none')
    expect(afterExit({ ...exited, paused: true, openStreams: 0 })).toBe('none')
    expect(afterExit({ ...exited, finished: true, openStreams: 0 })).toBe('none')
  })
})

describe('frames', () => {
  it('writes the exit frame with code, signal and members in that order', () => {
    expect(JSON.stringify(exitFrame({ code: 3, signal: null }, 2))).toBe(
      '{"t":"exit","code":3,"signal":null,"members":2}',
    )
    expect(JSON.stringify(exitFrame({ code: null, signal: 'SIGKILL' }, null))).toBe(
      '{"t":"exit","code":null,"signal":"SIGKILL","members":null}',
    )
  })

  it('writes the spawn failure with its error code, or unknown', () => {
    expect(JSON.stringify(spawnFailedFrame('ENOENT'))).toBe('{"t":"spawnFailed","code":"ENOENT"}')
    expect(spawnFailedFrame(undefined)).toEqual({ t: 'spawnFailed', code: 'unknown' })
    expect(spawnFailedFrame(-2)).toEqual({ t: 'spawnFailed', code: 'unknown' })
  })
})

describe('standardInput', () => {
  it('decodes the base64 bytes, and gives none for null', () => {
    expect(standardInput({ ...request, stdin: 'aGkK' })).toEqual(Buffer.from('hi\n'))
    expect(standardInput({ ...request, stdin: '' })).toEqual(Buffer.alloc(0))
    expect(standardInput(request)).toBeUndefined()
  })
})
