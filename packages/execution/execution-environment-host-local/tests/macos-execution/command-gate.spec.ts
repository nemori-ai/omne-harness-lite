// Fast: the macOS command gate driven in this process. Its channels are in-memory streams, its
// session reader is the stand-in reader, and its commands are real `/bin/sh` processes. The stand-in
// answers a live pid as the leader of its own session, so the gate is given this process's pid.
// Runs on every POSIX host; the real gate as a process is in commands.spec.ts.
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { CommandFrame } from '../../src/command-gate-core.ts'
import { runCommandGate } from '../../src/macos-execution/command-gate-run.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'

type Gate = Readonly<{
  control: PassThrough
  frames: PassThrough
  /** The frame lines read so far, as written. */
  lines: string[]
  exits: number[]
  write(value: unknown): void
  parsed(): CommandFrame[]
}>

let reader: FakeReader
let cwd = ''
let gatePid = 0
let intervals: MockInstance<typeof setInterval>

beforeEach(async context => {
  // The gate's commands are `/bin/sh` processes and its reader a shell script.
  if (process.platform === 'win32') return context.skip()
  reader = await fakeReader()
  cwd = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-gate-')))
  // The gate's pid is a sleeper that leads its own process group, never this test process: a
  // broken gate that stops its session with no pid excepted kills that group only.
  const sleeper = spawn('/bin/sleep', ['60'], { detached: true, stdio: 'ignore' })
  sleeper.unref()
  gatePid = sleeper.pid ?? 0
  if (gatePid <= 1) throw new Error('no sleeper pid')
  intervals = vi.spyOn(globalThis, 'setInterval')
})

afterEach(async () => {
  if (process.platform === 'win32') return
  try {
    if (gatePid > 1) process.kill(-gatePid, 'SIGKILL')
  } catch {
    /* Already gone. */
  }
  // A command that may outlive its test writes its pid to `pid` in its working directory.
  const pid = Number(await readFile(join(cwd, 'pid'), 'utf8').catch(() => ''))
  if (Number.isSafeInteger(pid) && pid > 0)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  // After its exit frame a gate keeps its process alive with an interval; here the test ends it.
  for (const result of intervals.mock.results)
    if (result.type === 'return') clearInterval(result.value)
  intervals.mockRestore()
  await reader.remove()
  await rm(cwd, { recursive: true, force: true })
})

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
  options: { unit?: string; frames?: PassThrough; collecting?: boolean } = {},
): Gate {
  const control = new PassThrough()
  const frames = options.frames ?? new PassThrough()
  const lines: string[] = []
  const exits: number[] = []
  if (options.collecting !== false) collect(frames, lines)
  runCommandGate({
    control,
    frames,
    unit: options.unit ?? 'omne-command-1',
    reader: reader.path,
    pid: gatePid,
    exit: code => void exits.push(code),
  })
  return {
    control,
    frames,
    lines,
    exits,
    write: value => void control.write(`${JSON.stringify(value)}\n`),
    parsed: () => lines.map(line => JSON.parse(line) as CommandFrame),
  }
}

function request(
  script: string,
  options: { stdin?: string; maxChunkBytes?: number; executable?: string } = {},
) {
  return {
    executable: options.executable ?? '/bin/sh',
    args: ['-c', script],
    cwd,
    env: { PATH: '/usr/bin:/bin' },
    stdin: options.stdin === undefined ? null : Buffer.from(options.stdin).toString('base64'),
    maxChunkBytes: options.maxChunkBytes ?? 65_536,
  }
}

const go = { c: 'go' }

/** The bytes of one stream's data frames, in order. */
function output(gate: Gate, stream: 'stdout' | 'stderr'): Buffer {
  return Buffer.concat(
    gate
      .parsed()
      .flatMap(frame =>
        frame.t === 'data' && frame.s === stream ? [Buffer.from(frame.b, 'base64')] : [],
      ),
  )
}

async function exited(gate: Gate, timeout = 2_000): Promise<CommandFrame> {
  return vi.waitFor(
    () => {
      const frame = gate.parsed().find(entry => entry.t === 'exit')
      if (frame === undefined) throw new Error('no exit frame yet')
      return frame
    },
    { timeout, interval: 10 },
  )
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function commandPid(): Promise<number> {
  return vi.waitFor(
    async () => {
      const pid = Number(await readFile(join(cwd, 'pid'), 'utf8'))
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('no pid yet')
      return pid
    },
    { timeout: 2_000, interval: 10 },
  )
}

describe('the macOS command gate in this process', () => {
  describe('admission', () => {
    let stderr: MockInstance<typeof process.stderr.write>
    beforeEach(() => {
      stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })
    afterEach(() => {
      stderr.mockRestore()
    })
    const refused = 'omne-host gate: bad request or not leading its own session\n'
    it.each([
      ['a first line that is no request', { c: 'go' }, 'omne-command-1'],
      [
        'a request with no valid chunk bound',
        { ...request('true'), maxChunkBytes: 0 },
        'omne-command-1',
      ],
      ['a request without a domain name', request('true'), ''],
    ])('exits with 2 on %s', async (_, first, unit) => {
      const gate = startGate({ unit })
      gate.write(first)
      await vi.waitFor(() => expect(gate.exits).toEqual([2]), { interval: 10 })
      expect(gate.lines).toEqual([])
      expect(stderr).toHaveBeenCalledWith(refused)
    })

    it('exits with 2 when the gate does not lead its own session', async () => {
      await reader.set('identity', '1 1 1\n')
      const gate = startGate()
      gate.write(request('true'))
      await vi.waitFor(() => expect(gate.exits).toEqual([2]), { interval: 10 })
      expect(gate.lines).toEqual([])
      expect(stderr).toHaveBeenCalledWith(refused)
    })

    it('answers ready to a valid request and starts nothing before GO', async () => {
      const gate = startGate()
      gate.write(request('echo ran > ran'))
      await vi.waitFor(() => expect(gate.lines).toEqual(['{"t":"ready"}']), { interval: 10 })
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(gate.lines).toEqual(['{"t":"ready"}'])
      expect(gate.exits).toEqual([])
      await expect(readFile(join(cwd, 'ran'), 'utf8')).rejects.toThrow()
    })
  })

  describe('a command after GO', () => {
    it('answers started, the output in frames of at most maxChunkBytes, and one exit frame', async () => {
      await reader.set('members', '70 70 70\n71 70 70\n')
      const gate = startGate()
      gate.write(request('printf abcdefghij; exit 3', { maxChunkBytes: 4 }))
      gate.write(go)
      await exited(gate)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(gate.lines).toEqual([
        '{"t":"ready"}',
        '{"t":"started"}',
        `{"t":"data","s":"stdout","b":"${Buffer.from('abcd').toString('base64')}"}`,
        `{"t":"data","s":"stdout","b":"${Buffer.from('efgh').toString('base64')}"}`,
        `{"t":"data","s":"stdout","b":"${Buffer.from('ij').toString('base64')}"}`,
        '{"t":"exit","code":3,"signal":null,"members":2}',
      ])
      expect(await reader.calls()).toContainEqual(['members', String(gatePid), String(gatePid)])
    })

    it('reports members as null when the session reader fails', async () => {
      await reader.set('members.fail', '')
      const gate = startGate()
      gate.write(request('exit 0'))
      gate.write(go)
      expect(await exited(gate)).toEqual({ t: 'exit', code: 0, signal: null, members: null })
    })

    it('answers spawnFailed with the error code for an image that does not start', async () => {
      const gate = startGate()
      gate.write(request('true', { executable: join(cwd, 'missing') }))
      gate.write(go)
      await vi.waitFor(() => expect(gate.lines).toHaveLength(2), { interval: 10 })
      expect(gate.parsed()).toEqual([{ t: 'ready' }, { t: 'spawnFailed', code: 'ENOENT' }])
      expect(gate.control.destroyed).toBe(true)
    })

    it('sends SIGTERM to the command on term', async () => {
      const gate = startGate()
      gate.write(request('echo $$ > pid; exec /bin/sleep 30'))
      gate.write(go)
      const pid = await commandPid()
      gate.write({ c: 'term' })
      expect(await exited(gate)).toEqual({ t: 'exit', code: null, signal: 'SIGTERM', members: 0 })
      expect(isAlive(pid)).toBe(false)
    })

    it('ignores a second GO', async () => {
      const gate = startGate()
      gate.write(request('printf x; echo x >> runs'))
      gate.write(go)
      gate.write(go)
      await exited(gate)
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(gate.parsed().map(frame => frame.t)).toEqual(['ready', 'started', 'data', 'exit'])
      expect(await readFile(join(cwd, 'runs'), 'utf8')).toBe('x\n')
    })

    it('gives the command the requested standard input', async () => {
      const gate = startGate()
      gate.write(request('/bin/cat', { stdin: 'hello\nworld\n' }))
      gate.write(go)
      await exited(gate)
      expect(output(gate, 'stdout').toString()).toBe('hello\nworld\n')
    })

    it('pauses the command while frames are full and loses no byte after drain', async () => {
      const content = randomBytes(4 * 1024 * 1024)
      await writeFile(join(cwd, 'big'), content)
      const frames = new PassThrough({ highWaterMark: 16 * 1024 })
      const gate = startGate({ frames, collecting: false })
      gate.write(request('echo $$ > pid; exec /bin/cat big'))
      gate.write(go)
      const pid = await commandPid()
      await vi.waitFor(() => expect(frames.writableNeedDrain).toBe(true), { interval: 10 })
      await new Promise(resolve => setTimeout(resolve, 300))
      // Base64 frames of the whole output would be over 5 MiB; a paused command leaves a few chunks.
      expect(frames.writableLength + frames.readableLength).toBeLessThan(1024 * 1024)
      expect(isAlive(pid)).toBe(true)
      collect(frames, gate.lines)
      expect(await exited(gate)).toMatchObject({ t: 'exit', code: 0, signal: null })
      expect(output(gate, 'stdout').equals(content)).toBe(true)
    })

    it('lets a paused command run to its end when the frames channel fails', async () => {
      await writeFile(join(cwd, 'big'), randomBytes(4 * 1024 * 1024))
      const frames = new PassThrough({ highWaterMark: 16 * 1024 })
      const gate = startGate({ frames, collecting: false })
      gate.write(request('echo $$ > pid; exec /bin/cat big'))
      gate.write(go)
      const pid = await commandPid()
      await vi.waitFor(() => expect(frames.writableNeedDrain).toBe(true), { interval: 10 })
      frames.destroy(new Error('the manager went away'))
      await vi.waitFor(
        async () => expect((await reader.calls()).map(call => call[0])).toContain('members'),
        { timeout: 2_000, interval: 20 },
      )
      expect(isAlive(pid)).toBe(false)
    })

    it('ends the output with the quiet period when a process left behind keeps the pipes open', async () => {
      const gate = startGate()
      gate.write(request('/bin/sleep 30 & echo $! > pid; printf x'))
      gate.write(go)
      expect(await exited(gate)).toEqual({ t: 'exit', code: 0, signal: null, members: 0 })
      expect(output(gate, 'stdout').toString()).toBe('x')
      expect(isAlive(await commandPid())).toBe(true)
    })
  })

  describe('the end of the control channel', () => {
    it('exits with 0 before GO and stops nothing', async () => {
      const gate = startGate()
      gate.write(request('true'))
      await vi.waitFor(() => expect(gate.lines).toEqual(['{"t":"ready"}']), { interval: 10 })
      gate.control.end()
      await vi.waitFor(() => expect(gate.exits).toEqual([0]), { interval: 10 })
      expect((await reader.calls()).map(call => call[0])).toEqual(['identity'])
    })

    it('stops the other members of its session after GO, then exits with 0', async () => {
      const gate = startGate()
      gate.write(request('exit 0'))
      gate.write(go)
      await exited(gate)
      gate.control.end()
      await vi.waitFor(() => expect(gate.exits).toEqual([0]), { interval: 10 })
      expect(await reader.calls()).toContainEqual([
        'stop',
        '10000',
        String(gatePid),
        String(gatePid),
      ])
    })
  })
})
