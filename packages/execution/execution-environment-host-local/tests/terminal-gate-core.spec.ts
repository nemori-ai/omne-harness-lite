// The terminal gate's judgments without its process: the messages it accepts, the Bash driver and
// segment source texts, and the segment state machine fed with control lines, observation records
// and PTY bytes. Frames are compared as JSON text where their key order matters on the wire.
import { describe, expect, it } from 'vitest'
import {
  beginLeg,
  forkArguments,
  legSource,
  noSegments,
  parseInitial,
  parseLeg,
  ptyFork,
  ptyHandle,
  readControlLine,
  readObservations,
  readOutput,
  settle,
  shellDriver,
  splitControl,
  type ActiveLeg,
  type Initial,
  type Leg,
  type Segments,
  type Step,
} from '../src/terminal-gate-core.ts'
import { sentinel } from '../src/terminal-sentinels.ts'

const config: Initial = {
  generation: 'gen-1',
  cwd: '/home/u',
  env: { TERM: 'xterm' },
  columns: 80,
  rows: 24,
  maxChunkBytes: 4,
  maxControlBytes: 64,
  betweenSegmentBytes: 6,
}
const nonce = '0123456789abcdef0123456789abcdef'
const leg: Leg = { id: 'leg-1', script: 'echo hi', stdin: Buffer.from('input') }
const text = (value: string) => Buffer.from(value, 'latin1')
const begin = Buffer.from(sentinel('begin', nonce))
const end = Buffer.from(sentinel('end', nonce))
const record = (...fields: string[]) => text(fields.map(field => `${field}\0`).join(''))
const json = (step: Step) => JSON.stringify(step.frames)

/** Applies a step's state, failing the test when the step faulted. */
function ok(step: Step): Segments {
  expect(step.fault).toBe(false)
  return step.state
}

// The states below are built inside the tests, not when the file loads: a mutant of the module
// under test must fail a test, not the loading of this file.

/** A state whose shell reported itself open. */
function opened(): Segments {
  return ok(readObservations(noSegments, record('gen-1', '', 'opened', '0', '/'), config))
}

/** A state whose current segment waits for its begin sentinel. */
function begun(state: Segments = opened()): Segments {
  const start = beginLeg(state, leg, nonce)
  if (start.kind === 'fault') throw new Error('the segment did not begin')
  return start.state
}

/** A state whose current segment has passed its begin sentinel. */
function running(): Segments {
  return ok(readOutput(begun(), begin, config))
}

/** A state whose current segment has passed its end sentinel. */
function ended(): Segments {
  return ok(readOutput(running(), end, config))
}

describe('parseInitial', () => {
  it('accepts a configuration with every field and keeps only those', () => {
    expect(parseInitial({ ...config, extra: true })).toEqual(config)
    expect(parseInitial({ ...config, columns: 1, rows: 1, env: {} })).toEqual({
      ...config,
      columns: 1,
      rows: 1,
      env: {},
    })
  })

  it.each([
    ['a generation that is not text', { generation: 1 }],
    ['a cwd that is not text', { cwd: undefined }],
    ['an env that is not a record', { env: null }],
    ['an env that is an array', { env: ['A=1'] }],
    ['an env with a value that is not text', { env: { A: 1 } }],
    ['zero columns', { columns: 0 }],
    ['fractional rows', { rows: 1.5 }],
    ['a chunk bound written as text', { maxChunkBytes: '4' }],
    ['a control bound past the safe integers', { maxControlBytes: 2 ** 53 }],
    ['a negative between-segment bound', { betweenSegmentBytes: -1 }],
    ['a missing between-segment bound', { betweenSegmentBytes: undefined }],
  ])('rejects %s', (_, change) => {
    expect(parseInitial({ ...config, ...change })).toBeUndefined()
  })
})

describe('parseLeg', () => {
  it('accepts a segment with or without its cwd and env, and decodes its standard input', () => {
    expect(parseLeg({ id: 'a', script: 's', stdin: 'aGk=' })).toEqual({
      id: 'a',
      script: 's',
      stdin: Buffer.from('hi'),
    })
    const full = parseLeg({ id: 'a', script: 's', cwd: '/x', env: { A: '1' }, stdin: '' })
    expect(full).toEqual({
      id: 'a',
      script: 's',
      cwd: '/x',
      env: { A: '1' },
      stdin: Buffer.alloc(0),
    })
    expect(Object.keys(parseLeg({ id: 'a', script: 's', stdin: '' }) ?? {})).toEqual([
      'id',
      'script',
      'stdin',
    ])
  })

  it.each([
    ['an id that is not text', { id: 1 }],
    ['a script that is not text', { script: null }],
    ['a cwd that is not text', { cwd: 7 }],
    ['an env with a value that is not text', { env: { A: 1 } }],
    ['an env that is text', { env: 'A=1' }],
    ['standard input that is missing', { stdin: undefined }],
  ])('rejects %s', (_, change) => {
    expect(parseLeg({ id: 'a', script: 's', stdin: '', ...change })).toBeUndefined()
  })
})

describe('readControlLine', () => {
  const pty = { fd: 9, pid: 1234 }
  const line = (value: unknown) => JSON.stringify(value)
  const before = { initial: undefined, pty: undefined }
  const ready = { initial: config, pty: undefined }
  const live = { initial: config, pty }
  const execute = { c: 'execute', id: 'leg-1', script: 'echo hi', stdin: 'aW5wdXQ=' }

  it('takes the first message as the configuration', () => {
    expect(readControlLine(line(config), before)).toEqual({ kind: 'initial', initial: config })
    expect(readControlLine(line({ ...config, rows: 0 }), before)).toEqual({ kind: 'fault' })
    expect(readControlLine(line({ c: 'go' }), before)).toEqual({ kind: 'fault' })
  })

  it('fails on a line that is not JSON or not an object', () => {
    for (const gate of [before, ready, live]) {
      expect(readControlLine('{"c":', gate)).toEqual({ kind: 'fault' })
      expect(readControlLine('null', gate)).toEqual({ kind: 'fault' })
      expect(readControlLine('[]', gate)).toEqual({ kind: 'fault' })
      expect(readControlLine('"go"', gate)).toEqual({ kind: 'fault' })
    }
  })

  it('starts the shell on go only before it runs', () => {
    expect(readControlLine(line({ c: 'go' }), ready)).toEqual({ kind: 'go', initial: config })
    expect(readControlLine(line({ c: 'go' }), live)).toEqual({ kind: 'fault' })
  })

  it('stops the shell on term only while it runs', () => {
    expect(readControlLine(line({ c: 'term' }), live)).toEqual({ kind: 'term', pid: 1234 })
    expect(readControlLine(line({ c: 'term' }), ready)).toEqual({ kind: 'fault' })
  })

  it('takes a valid execute as a segment and fails on anything else', () => {
    expect(readControlLine(line(execute), live)).toEqual({ kind: 'execute', leg })
    expect(readControlLine(line({ ...execute, id: 3 }), live)).toEqual({ kind: 'fault' })
    expect(readControlLine(line({ ...execute, c: 'run' }), live)).toEqual({ kind: 'fault' })
    expect(readControlLine(line(config), live)).toEqual({ kind: 'fault' })
  })
})

describe('splitControl', () => {
  it('holds a line until its newline arrives, across chunks and in UTF-8', () => {
    const first = splitControl(Buffer.alloc(0), Buffer.from('{"a":"é'), 64)
    expect(first.kind === 'lines' && first.lines).toEqual([])
    const bytes = Buffer.from('é"}\n{"b":1}\n{"c"')
    const second = splitControl(Buffer.from('{"a":"'), bytes.subarray(0, 1), 64)
    if (second.kind !== 'lines') throw new Error('overflow')
    const third = splitControl(second.pending, bytes.subarray(1), 64)
    expect(third).toEqual({
      kind: 'lines',
      lines: ['{"a":"é"}', '{"b":1}'],
      pending: Buffer.from('{"c"'),
    })
  })

  it('counts the held bytes and the new ones against the bound', () => {
    expect(splitControl(Buffer.from('abc'), Buffer.from('de'), 5).kind).toBe('lines')
    expect(splitControl(Buffer.from('abc'), Buffer.from('def'), 5)).toEqual({ kind: 'overflow' })
  })

  it('bounds the channel at 1 MiB before the configuration gives a bound', () => {
    const mib = 1024 * 1024
    expect(splitControl(Buffer.alloc(0), Buffer.alloc(mib, 0x61), undefined).kind).toBe('lines')
    expect(splitControl(Buffer.alloc(1, 0x61), Buffer.alloc(mib, 0x61), undefined)).toEqual({
      kind: 'overflow',
    })
  })
})

describe('driver and segment source', () => {
  const paths = {
    commands: '/tmp/omne-host-0b9c3a2e.scope.terminal/commands',
    observations: '/tmp/omne-host-0b9c3a2e.scope.terminal/observations',
  }
  const active = (change: Partial<ActiveLeg>): ActiveLeg => ({
    ...leg,
    stdin: Buffer.alloc(0),
    nonce,
    begun: false,
    sawEnd: false,
    ...change,
  })

  // The expected texts were generated by the functions of the baseline 6fa5011fb.
  it('writes the driver as before, quoting the generation', () => {
    expect(shellDriver({ ...config, generation: "it's a 'gen'" }, paths)).toBe(
      "exec 7<'/tmp/omne-host-0b9c3a2e.scope.terminal/commands' 8>'/tmp/omne-host-0b9c3a2e.scope.terminal/observations'\n__omne_report() {\n  local __omne_cwd\n  __omne_cwd=$(builtin pwd -P; builtin printf .) || return 1\n  __omne_cwd=${__omne_cwd%?}\n  __omne_cwd=${__omne_cwd%?}\n  builtin printf '%s\\0' 'it'\\''s a '\\''gen'\\''' \"$1\" \"$2\" \"$3\" \"$__omne_cwd\" >&8\n}\nreadonly -f __omne_report\n__omne_report '' opened 0 || exit 1\nwhile IFS= builtin read -r -d '' __omne_source <&7; do\n  builtin eval \"$__omne_source\"\ndone\n",
    )
  })

  it('writes a plain segment as before', () => {
    expect(legSource(active({}))).toBe(
      "__omne_script() {\nbuiltin eval 'echo hi'\n}\n__omne_leg() {\nbuiltin printf '\\033]7770;omne-b;%s\\a' '0123456789abcdef0123456789abcdef' >/dev/tty || return 125\n\n\n__omne_report 'leg-1' started 0 || return 125\n__omne_script\nlocal __omne_code=$?\n\nbuiltin printf '\\033]7770;omne-e;%s\\a' '0123456789abcdef0123456789abcdef' >/dev/tty || return 125\n__omne_report 'leg-1' finished \"$__omne_code\" || return 125\n}\n__omne_leg\nif [ $? -ne 0 ]; then exit 125; fi\n",
    )
  })

  it('writes a segment with its env and cwd as before', () => {
    const full = active({
      id: "l'2",
      script: 'printf \'%s\' "$X"; exit 3',
      cwd: "/tmp/a b/it's",
      env: { X: "v'1", Y: '' },
    })
    expect(legSource(full)).toBe(
      "__omne_script() {\nbuiltin eval 'printf '\\''%s'\\'' \"$X\"; exit 3'\n}\n__omne_leg() {\nbuiltin printf '\\033]7770;omne-b;%s\\a' '0123456789abcdef0123456789abcdef' >/dev/tty || return 125\nlocal -x X='v'\\''1' || return 125\nlocal -x Y='' || return 125\nlocal __omne_oldcwd\n__omne_oldcwd=$(builtin pwd -P; builtin printf .) || return 125\n__omne_oldcwd=${__omne_oldcwd%?}\n__omne_oldcwd=${__omne_oldcwd%?}\nbuiltin cd -- '/tmp/a b/it'\\''s' || return 125\n__omne_report 'l'\\''2' started 0 || return 125\n__omne_script\nlocal __omne_code=$?\nbuiltin cd -- \"$__omne_oldcwd\" || return 125\nbuiltin printf '\\033]7770;omne-e;%s\\a' '0123456789abcdef0123456789abcdef' >/dev/tty || return 125\n__omne_report 'l'\\''2' finished \"$__omne_code\" || return 125\n}\n__omne_leg\nif [ $? -ne 0 ]; then exit 125; fi\n",
    )
  })

  it('prints the same sentinel bytes the gate scans for', () => {
    const source = legSource(active({}))
    const formats = [...source.matchAll(/builtin printf '([^']*)' '([^']*)' >\/dev\/tty/gu)]
    expect(formats).toHaveLength(2)
    const printed = formats.map(([, format = '', argument = '']) =>
      format.replace('\\033', '\u001b').replace('\\a', '\u0007').replace('%s', argument),
    )
    expect(printed).toEqual([
      Buffer.from(sentinel('begin', nonce)).toString('latin1'),
      Buffer.from(sentinel('end', nonce)).toString('latin1'),
    ])
  })
})

describe('beginLeg', () => {
  it('begins a segment on an opened shell, with its source ending in NUL', () => {
    const start = beginLeg(opened(), leg, nonce)
    if (start.kind === 'fault') throw new Error('the segment did not begin')
    const active = { ...leg, nonce, begun: false, sawEnd: false }
    expect(start.source.toString()).toBe(`${legSource(active)}\0`)
    expect(start.source.at(-1)).toBe(0)
    expect(start.state.active).toEqual(active)
    expect(start.state.sentinels.nonce).toBe(nonce)
  })

  it('fails before the shell is open and while a segment runs', () => {
    expect(beginLeg(noSegments, leg, nonce)).toEqual({ kind: 'fault' })
    expect(beginLeg(begun(), leg, nonce)).toEqual({ kind: 'fault' })
  })
})

describe('readOutput', () => {
  it('keeps bytes between segments and sends them before begun, then the segment bytes', () => {
    const before = ok(readOutput(opened(), text('ab'), config))
    expect(before.betweenKept).toBe(2)
    const step = readOutput(begun(before), Buffer.concat([text('c'), begin, text('hello')]), config)
    expect(json(step)).toBe(
      JSON.stringify([
        { t: 'between', leg: 'leg-1', b: 'YWJj' },
        { t: 'begun', leg: 'leg-1', discarded: 0 },
        { t: 'data', leg: 'leg-1', b: 'aGVsbA==' },
        { t: 'data', leg: 'leg-1', b: 'bw==' },
      ]),
    )
    expect(step.state.active?.begun).toBe(true)
    expect(step.state.between).toEqual([])
    expect(step.state.betweenKept).toBe(0)
    expect(step.fault).toBe(false)
    expect(step.stdin).toBeUndefined()
  })

  it('keeps between-segment bytes up to the bound and counts the rest as discarded', () => {
    const first = ok(readOutput(opened(), text('abcd'), config))
    const second = ok(readOutput(first, text('efgh'), config))
    expect(second.betweenKept).toBe(6)
    expect(second.betweenDiscarded).toBe(2)
    const third = ok(readOutput(second, text('ij'), config))
    expect(third.between).toEqual([text('abcd'), text('ef')])
    expect(third.betweenDiscarded).toBe(4)
    const step = readOutput(begun(third), begin, config)
    expect(step.frames).toEqual([
      { t: 'between', leg: 'leg-1', b: 'YWJjZA==' },
      { t: 'between', leg: 'leg-1', b: 'ZWY=' },
      { t: 'begun', leg: 'leg-1', discarded: 4 },
    ])
    expect(step.state.betweenDiscarded).toBe(0)
  })

  it('sends begun with nothing before it when no bytes came between segments', () => {
    expect(json(readOutput(begun(), begin, config))).toBe(
      '[{"t":"begun","leg":"leg-1","discarded":0}]',
    )
  })

  it('marks the end sentinel and attributes later bytes between segments', () => {
    const step = readOutput(running(), Buffer.concat([text('ok'), end, text('zz')]), config)
    expect(step.frames).toEqual([{ t: 'data', leg: 'leg-1', b: 'b2s=' }])
    expect(step.state.active?.sawEnd).toBe(true)
    expect(step.state.betweenKept).toBe(2)
    expect(step.fault).toBe(false)
  })

  it('fails on a begin sentinel without a current segment', () => {
    const state = opened()
    const watching = { ...state, sentinels: { ...state.sentinels, nonce } }
    expect(readOutput(watching, begin, config).fault).toBe(true)
  })

  it('fails on a second begin sentinel, keeping the frames before it', () => {
    const step = readOutput(running(), Buffer.concat([text('a'), begin]), config)
    expect(step.frames).toEqual([{ t: 'data', leg: 'leg-1', b: 'YQ==' }])
    expect(step.fault).toBe(true)
  })

  it('fails on segment bytes before the begin sentinel', () => {
    const inSegment = begun()
    const state = { ...inSegment, sentinels: { ...inSegment.sentinels, inSegment: true } }
    expect(readOutput(state, text('x'), config).fault).toBe(true)
  })

  it('fails on segment bytes after the end sentinel', () => {
    const afterEnd = ended()
    const state = { ...afterEnd, sentinels: { ...afterEnd.sentinels, inSegment: true } }
    expect(readOutput(state, text('x'), config).fault).toBe(true)
  })

  it('fails on a second end sentinel and on an end sentinel before begin', () => {
    expect(readOutput(running(), Buffer.concat([end, end]), config).fault).toBe(true)
    expect(readOutput(begun(), end, config).fault).toBe(true)
  })

  it('stops at the first impossible piece', () => {
    const step = readOutput(running(), Buffer.concat([end, end, text('after')]), config)
    expect(step.fault).toBe(true)
    expect(step.state.betweenKept).toBe(0)
  })
})

describe('readObservations', () => {
  const started = record('gen-1', 'leg-1', 'started', '0', '/home/u')
  const finished = (code: string) => record('gen-1', 'leg-1', 'finished', code, '/home/u')

  it('reports the shell open with its cwd', () => {
    const step = readObservations(noSegments, record('gen-1', '', 'opened', '0', '/w d'), config)
    expect(json(step)).toBe('[{"t":"opened","cwd":"/w d"}]')
    expect(step.state.opened).toBe(true)
  })

  const idle = () => noSegments
  const openWhileRunning = () => ({ ...noSegments, active: begun().active })
  it.each([
    ['a second opened', opened, record('gen-1', '', 'opened', '0', '/')],
    ['opened while a segment runs', openWhileRunning, record('gen-1', '', 'opened', '0', '/')],
    ['opened for a segment', idle, record('gen-1', 'leg-1', 'opened', '0', '/')],
    ['another generation', opened, record('gen-2', '', 'opened', '0', '/')],
    ['a relative cwd', idle, record('gen-1', '', 'opened', '0', 'home')],
    ['an unknown kind', () => begun(), record('gen-1', 'leg-1', 'paused', '0', '/')],
    [
      'a kind named like an object property',
      () => begun(),
      record('gen-1', 'leg-1', 'toString', '0', '/'),
    ],
    ['started without a segment', opened, started],
    ['started for another segment', () => begun(), record('gen-1', 'leg-2', 'started', '0', '/')],
    ['finished without a segment', opened, finished('0')],
    ['finished for another segment', () => begun(), record('gen-1', 'leg-2', 'finished', '0', '/')],
    ['an exit code past 255', () => begun(), finished('256')],
    ['an exit code of four digits', () => begun(), finished('1000')],
    ['an empty exit code', () => begun(), finished('')],
    ['a negative exit code', () => begun(), finished('-1')],
    ['an exit code in exponent form', () => begun(), finished('1e2')],
    ['an exit code that is not a number', () => begun(), finished('ok')],
  ])('fails on %s', (_, state, bytes) => {
    const step = readObservations(state(), bytes, config)
    expect(step.fault).toBe(true)
    expect(step.frames).toEqual([])
  })

  it('reports a segment started and hands over its standard input', () => {
    const step = readObservations(begun(), started, config)
    expect(json(step)).toBe('[{"t":"started","leg":"leg-1"}]')
    expect(step.stdin).toEqual(Buffer.from('input'))
  })

  it.each([
    ['0', 0],
    ['255', 255],
    ['007', 7],
  ])('keeps the finished observation with exit code %s until the end sentinel', (code, value) => {
    const step = readObservations(begun(), finished(code), config)
    expect(step.frames).toEqual([])
    expect(step.state.completion).toEqual({ code: value, cwd: '/home/u' })
    expect(step.fault).toBe(false)
  })

  it('waits for a whole record across reads, and applies several records in order', () => {
    const bytes = Buffer.concat([started, finished('3')])
    const first = readObservations(begun(), bytes.subarray(0, started.length + 4), config)
    expect(first.frames).toEqual([{ t: 'started', leg: 'leg-1' }])
    expect(first.state.observed).toEqual(bytes.subarray(started.length, started.length + 4))
    const second = readObservations(first.state, bytes.subarray(started.length + 4), config)
    expect(second.state.completion).toEqual({ code: 3, cwd: '/home/u' })
    expect(second.state.observed).toEqual(Buffer.alloc(0))
    expect(second.stdin).toBeUndefined()
  })

  it('keeps the frames before a bad record and applies nothing after it', () => {
    const bytes = Buffer.concat([started, record('gen-2', '', 'opened', '0', '/'), finished('0')])
    const step = readObservations(begun(), bytes, { ...config, maxControlBytes: 1024 })
    expect(step.frames).toEqual([{ t: 'started', leg: 'leg-1' }])
    expect(step.fault).toBe(true)
    expect(step.state.completion).toBeUndefined()
  })

  it('fails when the bytes waiting for a whole record pass the control bound', () => {
    const atBound = readObservations(noSegments, Buffer.alloc(64, 0x61), config)
    expect(atBound.fault).toBe(false)
    expect(readObservations(atBound.state, text('a'), config).fault).toBe(true)
    expect(readObservations(noSegments, Buffer.alloc(65, 0x61), config).fault).toBe(true)
  })
})

describe('settle', () => {
  const completed = (state: Segments) =>
    ok(readObservations(state, record('gen-1', 'leg-1', 'finished', '2', '/w'), config))

  it('waits while only the finished observation or only the end sentinel arrived', () => {
    const observedOnly = completed(running())
    expect(settle(observedOnly, config)).toEqual({
      state: observedOnly,
      frames: [],
      fault: false,
      stdin: undefined,
    })
    const done = ended()
    expect(settle(done, config).state).toBe(done)
    expect(settle(done, config).frames).toEqual([])
    expect(settle(opened(), config).frames).toEqual([])
  })

  it('finishes the segment when both arrived and drops its unwritten standard input', () => {
    const step = settle(completed(ended()), config)
    expect(json(step)).toBe('[{"t":"finished","leg":"leg-1","code":2,"cwd":"/w"}]')
    expect(step.state.active).toBeUndefined()
    expect(step.state.completion).toBeUndefined()
    expect(step.state.sentinels.nonce).toBeUndefined()
    expect(step.stdin).toEqual(Buffer.alloc(0))
    expect(step.fault).toBe(false)
  })

  it('attributes the bytes held as a possible sentinel to the bytes between segments', () => {
    const held = ok(readOutput(ended(), end.subarray(0, 3), config))
    expect(held.sentinels.held).toHaveLength(3)
    const step = settle(completed(held), config)
    expect(step.state.betweenKept).toBe(3)
    expect(step.frames).toHaveLength(1)
  })

  it('fails when the held bytes fall in a segment that already ended', () => {
    const held = ok(readOutput(ended(), end.subarray(0, 3), config))
    const state = completed({ ...held, sentinels: { ...held.sentinels, inSegment: true } })
    const step = settle(state, config)
    expect(step.fault).toBe(true)
    expect(step.frames).toEqual([])
  })
})

describe('node-pty', () => {
  it('calls the native fork on the native module', () => {
    const calls: unknown[] = []
    const native = {
      fork(this: unknown, ...args: unknown[]) {
        calls.push(this, args)
        return 'forked'
      },
    }
    const fork = ptyFork({ native })
    expect(fork?.(1, 2)).toBe('forked')
    expect(calls).toEqual([native, [1, 2]])
  })

  it('finds no fork in a module without one', () => {
    expect(ptyFork(undefined)).toBeUndefined()
    expect(ptyFork({ native: null })).toBeUndefined()
    expect(ptyFork({ native: { fork: 'fork' } })).toBeUndefined()
  })

  it('forks Bash running the driver in the configured terminal', () => {
    const onExit = () => undefined
    const paths = { commands: '/c', observations: '/o' }
    expect(forkArguments(config, paths, onExit)).toEqual([
      '/bin/bash',
      ['--noprofile', '--norc', '-c', shellDriver(config, paths)],
      ['TERM=xterm'],
      '/home/u',
      80,
      24,
      -1,
      -1,
      false,
      '',
      onExit,
    ])
  })

  it('accepts a fork result with a positive pid and a descriptor', () => {
    expect(ptyHandle({ pid: 10, fd: 0 })).toEqual({ fd: 0, pid: 10 })
  })

  it.each([
    ['nothing', undefined],
    ['no pid', { fd: 3 }],
    ['pid zero', { pid: 0, fd: 3 }],
    ['a descriptor as text', { pid: 10, fd: '3' }],
    ['a fractional descriptor', { pid: 10, fd: 1.5 }],
    ['a negative descriptor', { pid: 10, fd: -1 }],
  ])('rejects a fork result with %s', (_, result) => {
    expect(ptyHandle(result)).toBeUndefined()
  })
})
