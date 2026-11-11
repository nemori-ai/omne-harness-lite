// Fast: the macOS terminal gate driven in this process. Its channels are in-memory streams, its
// session reader is the stand-in reader, and its PTY is node-pty's real native fork running the real
// Bash driver. The stand-in answers a live pid as the leader of its own session, so the gate is given
// the pid of a sleeper that leads its own process group. Runs on every POSIX host; the real gate as
// a process is in terminals.spec.ts and terminal-conformance.spec.ts.
import { spawn } from 'node:child_process'
import { fstatSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ptyFork } from '../../src/terminal-gate-core.ts'
import { runTerminalGate } from '../../src/macos-execution/terminal-gate-run.ts'
import { spawnHelperPath } from '../../src/macos-execution/terminals.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'

type Frame = Readonly<Record<string, unknown> & { t: string }>
type Fork = (...args: unknown[]) => unknown

type Gate = Readonly<{
  control: PassThrough
  frames: PassThrough
  /** The frame lines read so far, as written. */
  lines: string[]
  exits: number[]
  write(value: unknown): void
  parsed(): Frame[]
}>

/** One shell the gate forked: its PTY and how it ended, once it did. */
type Forked = { fd: number; pid: number; signal?: unknown }

const require = createRequire(import.meta.url)
let reader: FakeReader
let base = ''
let cwd = ''
let directory = ''
let gatePid = 0
let forked: Forked[] = []
let closers: (() => void)[] = []
let intervals: MockInstance<typeof setInterval>

beforeEach(async () => {
  reader = await fakeReader()
  base = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-terminal-gate-')))
  cwd = join(base, 'work')
  await mkdir(join(cwd, 'sub'), { recursive: true })
  directory = join(base, 'fifos')
  forked = []
  closers = []
  // The gate's pid is a sleeper that leads its own process group, never this test process: a
  // broken gate that stops its session with no pid excepted kills that group only.
  const sleeper = spawn('/bin/sleep', ['60'], { detached: true, stdio: 'ignore' })
  sleeper.unref()
  gatePid = sleeper.pid ?? 0
  if (gatePid <= 1) throw new Error('no sleeper pid')
  intervals = vi.spyOn(globalThis, 'setInterval')
})

function killGroup(pid: number): void {
  try {
    if (pid > 1) process.kill(-pid, 'SIGKILL')
  } catch {
    /* Already gone. */
  }
}

afterEach(async () => {
  killGroup(gatePid)
  // Each shell leads its own session and process group; its background jobs are in that group.
  for (const shell of forked) killGroup(shell.pid)
  for (const close of closers) close()
  // A gate that did not fail polls with an interval; here the test ends it.
  for (const result of intervals.mock.results)
    if (result.type === 'return') clearInterval(result.value)
  intervals.mockRestore()
  await reader.remove()
  await rm(base, { recursive: true, force: true })
})

/** node-pty's native fork, which records each shell and the signal that ended it. */
function recordingFork(): Fork | undefined {
  const fork = ptyFork(require('node-pty'))
  if (fork === undefined) return undefined
  return (...args) => {
    const onExit = args[10]
    const shell: Forked = { fd: -1, pid: 0 }
    args[10] = (code: unknown, signal: unknown) => {
      shell.signal = signal
      if (typeof onExit === 'function') onExit(code, signal)
    }
    const result = fork(...args)
    shell.fd = Number(Reflect.get(Object(result), 'fd'))
    shell.pid = Number(Reflect.get(Object(result), 'pid'))
    forked.push(shell)
    return result
  }
}

function collect(frames: PassThrough, lines: string[]): void {
  let pending = ''
  frames.setEncoding('utf8')
  frames.on('data', (text: string) => {
    const split = `${pending}${text}`.split('\n')
    pending = split.pop() ?? ''
    lines.push(...split)
  })
}

function startGate(
  options: {
    unit?: string
    helper?: string
    directory?: string
    frames?: PassThrough
    fork?: () => Fork | undefined
  } = {},
): Gate {
  const control = new PassThrough()
  const frames = options.frames ?? new PassThrough()
  const lines: string[] = []
  const exits: number[] = []
  collect(frames, lines)
  runTerminalGate({
    control,
    frames,
    unit: options.unit ?? 'omne-terminal-1',
    reader: reader.path,
    helper: options.helper ?? spawnHelperPath() ?? '',
    directory: options.directory ?? directory,
    pid: gatePid,
    ptyFork: options.fork ?? recordingFork,
    atExit: close => void closers.push(close),
    exit: code => void exits.push(code),
  })
  return {
    control,
    frames,
    lines,
    exits,
    write: value => void control.write(`${JSON.stringify(value)}\n`),
    parsed: () => lines.map(line => JSON.parse(line) as Frame),
  }
}

function initial(options: { betweenSegmentBytes?: number; maxChunkBytes?: number } = {}) {
  return {
    generation: 'gen-1',
    cwd,
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    columns: 80,
    rows: 24,
    maxChunkBytes: options.maxChunkBytes ?? 4096,
    maxControlBytes: 1024 * 1024,
    betweenSegmentBytes: options.betweenSegmentBytes ?? 1024,
  }
}

const go = { c: 'go' }

function execute(id: string, script: string) {
  return { c: 'execute', id, script, stdin: '' }
}

async function frame(gate: Gate, match: (frame: Frame) => boolean, timeout = 3_000) {
  return vi.waitFor(
    () => {
      const found = gate.parsed().find(match)
      if (found === undefined) throw new Error('no such frame yet')
      return found
    },
    { timeout, interval: 10 },
  )
}

const finished = (gate: Gate, leg: string) =>
  frame(gate, entry => entry.t === 'finished' && entry['leg'] === leg)

/** The gate after `ready`. The manager sends GO only after it, as here. */
async function ready(gate: Gate, options: Parameters<typeof initial>[0] = {}) {
  gate.write(initial(options))
  await frame(gate, entry => entry.t === 'ready')
}

/** The gate after `ready`, GO and `opened`, with its one shell. */
async function openGate(gate: Gate, options: Parameters<typeof initial>[0] = {}) {
  await ready(gate, options)
  gate.write(go)
  await frame(gate, entry => entry.t === 'opened')
}

/** The bytes of one segment's frames of one kind, in order. */
function bytesOf(gate: Gate, t: 'data' | 'between', leg: string): string {
  return Buffer.concat(
    gate
      .parsed()
      .flatMap(entry =>
        entry.t === t && entry['leg'] === leg ? [Buffer.from(String(entry['b']), 'base64')] : [],
      ),
  ).toString()
}

function shell(): Forked {
  const only = forked[0]
  if (only === undefined || forked.length !== 1) throw new Error('expected one shell')
  return only
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const fault = '{"t":"fault","generation":"gen-1"}'

describe('the macOS terminal gate in this process', { skip: process.platform === 'win32' }, () => {
  describe('admission', () => {
    it('fails on a first line that is no JSON object, and sends no ready', async () => {
      const gate = startGate()
      gate.control.write('not json\n')
      await vi.waitFor(() => expect(gate.lines).toEqual(['{"t":"fault"}']), { interval: 10 })
      expect(gate.control.destroyed).toBe(true)
    })

    it('fails on an invalid initial message, and sends no ready', async () => {
      const gate = startGate()
      gate.write({ ...initial(), columns: 0 })
      await vi.waitFor(() => expect(gate.lines).toEqual(['{"t":"fault"}']), { interval: 10 })
    })

    it('fails when the gate does not lead its own session, and creates no FIFO', async () => {
      await reader.set('identity', '1 1 1\n')
      const gate = startGate()
      gate.write(initial())
      await vi.waitFor(() => expect(gate.lines).toEqual([fault]), { interval: 10 })
      expect(await reader.calls()).toEqual([['identity', String(gatePid)]])
      await expect(stat(directory)).rejects.toThrow()
    })

    it.each([
      ['no domain name', { unit: '' }],
      ['no spawn-helper', { helper: '' }],
      ['no FIFO directory', { directory: '' }],
    ])('fails without asking the reader when it has %s', async (_, missing) => {
      const gate = startGate(missing)
      gate.write(initial())
      await vi.waitFor(() => expect(gate.lines).toEqual([fault]), { interval: 10 })
      expect(await reader.calls()).toEqual([])
    })

    it('fails when its FIFO directory already exists', async () => {
      await mkdir(directory)
      const gate = startGate()
      gate.write(initial())
      await vi.waitFor(() => expect(gate.lines).toEqual([fault]), { interval: 10 })
      await expect(stat(join(directory, 'commands'))).rejects.toThrow()
    })

    it('fails on a control line longer than its bound', async () => {
      const gate = startGate()
      gate.write({ ...initial(), maxControlBytes: 1024 })
      await frame(gate, entry => entry.t === 'ready')
      gate.control.write('x'.repeat(2048))
      await vi.waitFor(() => expect(gate.lines.at(-1)).toBe(fault), { interval: 10 })
      expect(gate.control.destroyed).toBe(true)
    })

    it('answers ready to a valid initial message, after creating its private FIFOs', async () => {
      const gate = startGate()
      gate.write(initial())
      await vi.waitFor(() => expect(gate.lines).toEqual(['{"t":"ready","generation":"gen-1"}']), {
        interval: 10,
      })
      expect((await stat(directory)).mode & 0o777).toBe(0o700)
      for (const name of ['commands', 'observations']) {
        const fifo = await stat(join(directory, name))
        expect(fifo.isFIFO()).toBe(true)
        expect(fifo.mode & 0o777).toBe(0o600)
      }
      expect(forked).toEqual([])
    })
  })

  describe('the shell after GO', () => {
    it('answers opened with the shell working directory', async () => {
      const gate = startGate()
      await openGate(gate)
      expect(gate.lines).toEqual([
        '{"t":"ready","generation":"gen-1"}',
        JSON.stringify({ t: 'opened', cwd, generation: 'gen-1' }),
      ])
      expect(isAlive(shell().pid)).toBe(true)
    })

    it('fails at GO when there is no native fork', async () => {
      const gate = startGate({ fork: () => undefined })
      await ready(gate)
      gate.write(go)
      await vi.waitFor(
        () => expect(gate.parsed().map(entry => entry.t)).toEqual(['ready', 'fault']),
        {
          interval: 10,
        },
      )
    })

    it('fails when reading the PTY fails other than by blocking', async () => {
      // A descriptor no process has open: every read of it fails with EBADF.
      const gate = startGate({ fork: () => () => ({ fd: 1_000_000, pid: gatePid }) })
      await ready(gate)
      gate.write(go)
      await vi.waitFor(() => expect(gate.lines.at(-1)).toBe(fault), { interval: 10 })
    })

    it('fails at GO when the fork gives no PTY', async () => {
      const gate = startGate({ fork: () => () => ({ pid: 0 }) })
      await ready(gate)
      gate.write(go)
      await vi.waitFor(() => expect(gate.lines.at(-1)).toBe(fault), { interval: 10 })
    })

    it('runs a segment: started, its output, and finished with the code and the cwd', async () => {
      const gate = startGate()
      await openGate(gate)
      gate.write(execute('leg-1', 'cd sub; printf hello; (exit 3)'))
      expect(await finished(gate, 'leg-1')).toEqual({
        t: 'finished',
        leg: 'leg-1',
        code: 3,
        cwd: join(cwd, 'sub'),
        generation: 'gen-1',
      })
      const kinds = gate.parsed().map(entry => entry.t)
      expect(kinds.slice(0, 2)).toEqual(['ready', 'opened'])
      expect(kinds).toContain('started')
      expect(kinds).toContain('begun')
      expect(kinds.at(-1)).toBe('finished')
      expect(bytesOf(gate, 'data', 'leg-1')).toBe('hello')
    })

    it('reports the bytes written between segments in the next segment, up to the bound', async () => {
      const gate = startGate()
      await openGate(gate, { betweenSegmentBytes: 2 })
      gate.write(execute('leg-1', '(/bin/sleep 0.2; printf late; : > done) &'))
      await finished(gate, 'leg-1')
      await vi.waitFor(() => stat(join(cwd, 'done')), { timeout: 3_000, interval: 10 })
      // The PTY holds the late bytes before the next begin sentinel; give the poll a moment to read them.
      await new Promise(resolve => setTimeout(resolve, 50))
      gate.write(execute('leg-2', 'printf two'))
      await finished(gate, 'leg-2')
      expect(bytesOf(gate, 'data', 'leg-1')).toBe('')
      expect(bytesOf(gate, 'between', 'leg-2')).toBe('la')
      expect(gate.parsed().find(entry => entry.t === 'begun' && entry['leg'] === 'leg-2')).toEqual({
        t: 'begun',
        leg: 'leg-2',
        discarded: 2,
        generation: 'gen-1',
      })
      expect(bytesOf(gate, 'data', 'leg-2')).toBe('two')
    })

    it('sends SIGTERM to the shell on term', async () => {
      const gate = startGate()
      await openGate(gate)
      gate.write({ c: 'term' })
      await vi.waitFor(() => expect(shell().signal).toBe(15), { timeout: 3_000, interval: 10 })
      // The shell's end fails the gate.
      await vi.waitFor(() => expect(gate.lines.at(-1)).toBe(fault), { interval: 10 })
    })

    it('fails on a second execute while a segment runs', async () => {
      const gate = startGate()
      await openGate(gate)
      gate.write(execute('leg-1', '/bin/sleep 5'))
      gate.write(execute('leg-2', 'printf two'))
      await vi.waitFor(() => expect(gate.lines.at(-1)).toBe(fault), { interval: 10 })
      expect(gate.control.destroyed).toBe(true)
      expect(gate.parsed().some(entry => entry['leg'] === 'leg-2')).toBe(false)
    })

    it('closes its FIFOs and the PTY when its process exits', async () => {
      const gate = startGate()
      await openGate(gate)
      const { fd } = shell()
      expect(fstatSync(fd).isCharacterDevice()).toBe(true)
      expect(closers).toHaveLength(1)
      for (const close of closers.splice(0)) close()
      expect(() => fstatSync(fd)).toThrow()
    })
  })

  describe('backpressure', () => {
    it('stops reading while frames are full and loses no byte after drain', async () => {
      const frames = new PassThrough({ highWaterMark: 16 * 1024 })
      const gate = startGate({ frames })
      await openGate(gate)
      frames.removeAllListeners('data')
      frames.pause()
      gate.write(execute('leg-1', '/usr/bin/head -c 300000 /dev/zero | /usr/bin/tr "\\0" a'))
      await vi.waitFor(() => expect(frames.writableNeedDrain).toBe(true), { interval: 10 })
      await new Promise(resolve => setTimeout(resolve, 300))
      // Base64 frames of the whole output would be about 400 KiB; a blocked gate holds a few chunks.
      expect(frames.writableLength + frames.readableLength).toBeLessThan(64 * 1024)
      collect(frames, gate.lines)
      frames.resume()
      expect(await finished(gate, 'leg-1')).toMatchObject({ code: 0 })
      expect(bytesOf(gate, 'data', 'leg-1')).toBe('a'.repeat(300_000))
    })

    it('lets a blocked segment run to its end when the frames channel fails', async () => {
      const frames = new PassThrough({ highWaterMark: 16 * 1024 })
      const gate = startGate({ frames })
      await openGate(gate)
      frames.removeAllListeners('data')
      frames.pause()
      gate.write(
        execute('leg-1', '/usr/bin/head -c 300000 /dev/zero | /usr/bin/tr "\\0" a; : > done'),
      )
      await vi.waitFor(() => expect(frames.writableNeedDrain).toBe(true), { interval: 10 })
      frames.destroy(new Error('the manager went away'))
      await vi.waitFor(() => stat(join(cwd, 'done')), { timeout: 3_000, interval: 10 })
    })
  })

  describe('the end of the control channel', () => {
    it('exits with 0 before GO and stops nothing', async () => {
      const gate = startGate()
      await ready(gate)
      gate.control.end()
      await vi.waitFor(() => expect(gate.exits).toEqual([0]), { interval: 10 })
      expect((await reader.calls()).map(call => call[0])).toEqual(['identity'])
    })

    it('stops both sessions after GO, except its own pid, then exits with 0', async () => {
      const gate = startGate()
      await openGate(gate)
      gate.control.end()
      await vi.waitFor(() => expect(gate.exits).toEqual([0]), { interval: 10 })
      expect((await reader.calls()).filter(call => call[0] === 'stop')).toEqual([
        ['stop', '10000', String(gatePid), String(gatePid), String(shell().pid)],
      ])
    })
  })
})
