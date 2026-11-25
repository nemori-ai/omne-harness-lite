import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Duplex, PassThrough } from 'node:stream'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandFrame } from '../../src/command-gate-core.ts'
import { fakeReader, type FakeReader } from './fake-reader.ts'

type Gate = Readonly<{
  control: Duplex
  frames: PassThrough
  lines: string[]
  exits: number[]
  closed: Promise<void>
  diagnostics: string[]
  write(value: unknown): void
  parsed(): CommandFrame[]
}>

const entry = fileURLToPath(new URL('../../src/macos-execution/command-gate.ts', import.meta.url))
let reader: FakeReader
let cwd = ''
let gatePid = 0
let gateProcess: ChildProcess | undefined
let closed: Promise<void> | undefined

beforeEach(async context => {
  if (process.platform === 'win32') return context.skip()
  reader = await fakeReader()
  cwd = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-gate-')))
})

afterEach(async () => {
  if (process.platform === 'win32') return
  if (
    gateProcess &&
    gateProcess.exitCode === null &&
    gateProcess.signalCode === null &&
    gatePid > 1
  ) {
    try {
      process.kill(-gatePid, 'SIGKILL')
    } catch (error) {
      if (!error || typeof error !== 'object' || Reflect.get(error, 'code') !== 'ESRCH') throw error
    }
  }
  await closed
  gateProcess = undefined
  closed = undefined
  gatePid = 0
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
  const child = spawn(process.execPath, [entry, options.unit ?? 'omne-command-1', reader.path], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  })
  gateProcess = child
  gatePid = child.pid ?? 0
  const control = child.stdio[3]
  if (!(control instanceof Duplex) || !child.stdout || !child.stderr || gatePid <= 1)
    throw new Error('private gate did not open its channels')
  control.resume()
  const diagnostics: string[] = []
  child.stderr.setEncoding('utf8').on('data', (text: string) => diagnostics.push(text))
  const frames = options.frames ?? new PassThrough()
  const lines: string[] = []
  const exits: number[] = []
  if (options.collecting !== false) collect(frames, lines)
  const stdout = child.stdout
  stdout.pipe(frames)
  frames.on('error', () => stdout.destroy())
  closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => {
      if (code !== null) exits.push(code)
      resolve()
    })
  })
  return {
    control,
    frames,
    lines,
    exits,
    closed,
    diagnostics,
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

function output(gate: Gate, stream: 'stdout' | 'stderr'): Buffer {
  return Buffer.concat(
    gate
      .parsed()
      .flatMap(frame =>
        frame.t === 'data' && frame.s === stream ? [Buffer.from(frame.b, 'base64')] : [],
      ),
  )
}

function waitForFrame(gate: Gate, kind: CommandFrame['t']): Promise<CommandFrame> {
  return new Promise((resolve, reject) => {
    let next = 0
    const inspect = () => {
      while (next < gate.lines.length) {
        const frame = JSON.parse(gate.lines[next++]!) as CommandFrame
        if (frame.t === kind) {
          cleanup()
          resolve(frame)
          return
        }
      }
      if (gate.frames.readableEnded) {
        cleanup()
        reject(new Error(`gate output closed before ${kind}`))
      }
    }
    const cleanup = () => {
      gate.frames.off('data', inspect)
      gate.frames.off('end', inspect)
    }
    gate.frames.on('data', inspect)
    gate.frames.once('end', inspect)
    inspect()
  })
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

describe('the macOS command gate in its private process', () => {
  describe('admission', () => {
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
      await gate.closed
      expect(gate.exits).toEqual([2])
      expect(gate.lines).toEqual([])
      expect(gate.diagnostics.join('')).toContain(refused)
    })

    it('exits with 2 when the gate does not lead its own session', async () => {
      await reader.set('identity', '1 1 1\n')
      const gate = startGate()
      gate.write(request('true'))
      await gate.closed
      expect(gate.exits).toEqual([2])
      expect(gate.lines).toEqual([])
      expect(gate.diagnostics.join('')).toContain(refused)
    })

    it('answers ready to a valid request and starts nothing before GO', async () => {
      const gate = startGate()
      gate.write(request('echo ran > ran'))
      await waitForFrame(gate, 'ready')
      expect(gate.lines).toEqual(['{"t":"ready"}'])
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
      await waitForFrame(gate, 'exit')
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(gate.lines).toEqual([
        '{"t":"ready"}',
        JSON.stringify({ t: 'started', cwd }),
        `{"t":"data","s":"stdout","b":"${Buffer.from('abcd').toString('base64')}"}`,
        `{"t":"data","s":"stdout","b":"${Buffer.from('efgh').toString('base64')}"}`,
        `{"t":"data","s":"stdout","b":"${Buffer.from('ij').toString('base64')}"}`,
        '{"t":"exit","code":3,"signal":null,"members":2}',
      ])
      expect(await reader.calls()).toContainEqual(['members', String(gatePid), String(gatePid)])
    })

    it('reports the actual inherited start directory when the request names a symlink', async () => {
      const actual = join(cwd, 'actual')
      const alias = join(cwd, 'alias')
      await mkdir(actual)
      await symlink(actual, alias)
      const gate = startGate()
      gate.write({ ...request('pwd -P'), cwd: alias })
      gate.write(go)
      await waitForFrame(gate, 'exit')
      expect(output(gate, 'stdout').toString().trim()).toBe(actual)
      expect(gate.parsed().find(frame => frame.t === 'started')).toEqual({
        t: 'started',
        cwd: actual,
      })
    })

    it('reports members as null when the session reader fails', async () => {
      await reader.set('members.fail', '')
      const gate = startGate()
      gate.write(request('exit 0'))
      gate.write(go)
      expect(await waitForFrame(gate, 'exit')).toEqual({
        t: 'exit',
        code: 0,
        signal: null,
        members: null,
      })
    })

    it('answers spawnFailed with the error code for an image that does not start', async () => {
      const gate = startGate()
      gate.write(request('true', { executable: join(cwd, 'missing') }))
      gate.write(go)
      await gate.closed
      expect(gate.parsed()).toEqual([{ t: 'ready' }, { t: 'spawnFailed', code: 'ENOENT' }])
      expect(gate.control.destroyed).toBe(true)
    })

    it('sends SIGTERM to the command on term', async () => {
      const gate = startGate()
      gate.write(request('echo $$ > pid; exec /bin/sleep 30'))
      gate.write(go)
      const pid = await commandPid()
      gate.write({ c: 'term' })
      expect(await waitForFrame(gate, 'exit')).toEqual({
        t: 'exit',
        code: null,
        signal: 'SIGTERM',
        members: 0,
      })
      expect(isAlive(pid)).toBe(false)
    })

    it('ignores a second GO', async () => {
      const gate = startGate()
      gate.write(request('printf x; echo x >> runs'))
      gate.write(go)
      gate.write(go)
      await waitForFrame(gate, 'exit')
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(gate.parsed().map(frame => frame.t)).toEqual(['ready', 'started', 'data', 'exit'])
      expect(await readFile(join(cwd, 'runs'), 'utf8')).toBe('x\n')
    })

    it('gives the command the requested standard input', async () => {
      const gate = startGate()
      gate.write(request('/bin/cat', { stdin: 'hello\nworld\n' }))
      gate.write(go)
      await waitForFrame(gate, 'exit')
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
      expect(frames.writableLength + frames.readableLength).toBeLessThan(1024 * 1024)
      expect(isAlive(pid)).toBe(true)
      collect(frames, gate.lines)
      expect(await waitForFrame(gate, 'exit')).toMatchObject({ t: 'exit', code: 0, signal: null })
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
      expect(await waitForFrame(gate, 'exit')).toEqual({
        t: 'exit',
        code: 0,
        signal: null,
        members: 0,
      })
      expect(output(gate, 'stdout').toString()).toBe('x')
      expect(isAlive(await commandPid())).toBe(true)
    })
  })

  describe('the end of the control channel', () => {
    it('exits with 0 before GO and stops nothing', async () => {
      const gate = startGate()
      gate.write(request('true'))
      await waitForFrame(gate, 'ready')
      expect(gate.lines).toEqual(['{"t":"ready"}'])
      gate.control.end()
      await gate.closed
      expect(gate.exits).toEqual([0])
      expect((await reader.calls()).map(call => call[0])).toEqual(['identity'])
    })

    it('stops the other members of its session after GO, then exits with 0', async () => {
      const gate = startGate()
      gate.write(request('exit 0'))
      gate.write(go)
      await waitForFrame(gate, 'exit')
      gate.control.end()
      await gate.closed
      expect(gate.exits).toEqual([0])
      expect(await reader.calls()).toContainEqual([
        'stop',
        '10000',
        String(gatePid),
        String(gatePid),
      ])
    })
  })
})
