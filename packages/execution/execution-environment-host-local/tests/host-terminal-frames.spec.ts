// What the host does with the control frames of a persistent terminal's gate: the bytes read
// between two segments and the begin sentinel's frame, which only the slow tier's real PTY
// reaches otherwise. The real `createHostTerminals` runs against a stand-in `systemd-run` that
// acts as the gate and says only what each test scripts (`fixtures/fake-terminal-gate.mjs`), and
// a stand-in `systemctl` (`fixtures/fake-supervisor.mjs`). The gate here never truncates or
// attributes anything: the tests script what a gate that did so would send, and read what the host
// makes of it. How the real gate attributes bytes is the slow tier's to show. Linux only: the
// stand-ins use descriptor 3 and signals; elsewhere the file is skipped, and a skip is not a pass.
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type CommandOutcome,
  type FacilityResult,
  type ProcessHandle,
  type RetainedTerminalLedger,
  type TerminalRef,
} from '@omne-harness/execution-environment-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createHostTerminals, terminalSettings, type HostTerminals } from '../src/host-terminal.ts'
import * as hostProbe from '../src/host-probe.ts'
import type { ScopeTools } from '../src/host-scope.ts'

const onLinux = process.platform === 'linux'
const gateFixture = fileURLToPath(new URL('./fixtures/fake-terminal-gate.mjs', import.meta.url))
const supervisorFixture = fileURLToPath(new URL('./fixtures/fake-supervisor.mjs', import.meta.url))

const tenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!tenant.ok) throw new Error('tenant fixture did not parse')
const decodedScope = decodeScopeRef({ ref: 'scope-frames' })
if (!('ok' in decodedScope)) throw new Error('scope fixture did not decode')
const scope = decodedScope.ok
const request = {
  access: { principal: 'subject-a', tenant: tenant.value },
  binding: { kind: 'host_machine' },
  origin: originRef('call-1'),
} as const

const ledger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

type Script = {
  ready?: readonly object[]
  go?: readonly object[]
  executes?: readonly (readonly object[])[]
}

const directories: string[] = []
const gatePids: number[] = []
const terminalsOpened: HostTerminals[] = []

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * `vi.waitFor` with a bound that holds while the stand-in gate and tools run as processes on a
 * loaded machine. It only guards against a hang.
 */
const eventually = <T>(check: () => T | Promise<T>) => vi.waitFor(check, { timeout: 10_000 })

afterEach(async () => {
  vi.restoreAllMocks()
  for (const terminals of terminalsOpened.splice(0)) await terminals.stopAll()
  const pids = gatePids.splice(0)
  // The stand-in gate is killed through the stand-in `systemctl`, as the real gate is.
  for (const pid of pids) await eventually(() => expect(alive(pid), `gate ${pid}`).toBe(false))
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function temporary(prefix: string): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  directories.push(directory)
  return directory
}

async function wrapper(directory: string, name: string, fixture: string): Promise<string> {
  const path = join(directory, name)
  await writeFile(
    path,
    `#!/bin/sh\nFAKE_DIR='${directory}' exec '${process.execPath}' '${fixture}' ${name} "$@"\n`,
  )
  await chmod(path, 0o755)
  return path
}

async function open(script: Script, options: Parameters<typeof terminalSettings>[0] = {}) {
  vi.spyOn(hostProbe, 'probeTerminalPrerequisites').mockResolvedValue([])
  const directory = await temporary('omne-terminal-frames-')
  await writeFile(join(directory, 'gate-script.json'), JSON.stringify(script))
  const tools: ScopeTools = {
    systemdRun: await wrapper(directory, 'systemd-run', gateFixture),
    systemctl: await wrapper(directory, 'systemctl', supervisorFixture),
    killWhom: '--kill-whom',
  }
  const terminals = createHostTerminals({
    ledger,
    provider: 'host-terminals',
    scope,
    settings: terminalSettings({ startBoundMs: 5_000, stopBoundMs: 5_000, ...options }),
    prerequisites: { facts: () => 'satisfied', ready: async () => ({ kind: 'satisfied', tools }) },
    unavailable: () => undefined,
  })
  terminalsOpened.push(terminals)
  const done = <T>(result: FacilityResult<T>): T => {
    if (result.kind !== 'done') throw new Error(JSON.stringify(result))
    return result.value
  }
  const created = await terminals.facility.create({
    ...request,
    requestId: 'create',
    cwd: '/tmp',
    env: {},
  })
  const { terminal } = done(created)
  for (const name of await readdir(directory))
    if (name.endsWith('.pid')) gatePids.push(Number(await readFile(join(directory, name), 'utf8')))
  return {
    terminals,
    terminal,
    directory,
    done,
    execute: (script = 'true') =>
      terminals.facility.execute({ ...request, requestId: 'execute', terminal, script }),
    state: () => terminals.information?.(terminal)?.state,
    received: async () =>
      (await readFile(join(directory, 'received.log'), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((text): Record<string, unknown> => JSON.parse(text)),
  }
}

const bytes = (text: string) => new Uint8Array(Buffer.from(text))

async function drain(handle: ProcessHandle): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of handle.output) chunks.push(chunk.data)
  return Buffer.concat(chunks).toString('utf8')
}

function summaryOf(outcome: CommandOutcome) {
  const output = outcome.output
  if (output.mode !== 'terminal') throw new Error('expected a terminal summary')
  return output
}

/** A leg's frames as the gate sends them: started, between bytes, the begin frame, data, finished. */
const leg = (parts: {
  between?: readonly string[]
  discarded?: number
  data?: readonly string[]
  code?: number
  cwd?: string
}): object[] => [
  { t: 'started' },
  ...(parts.between ?? []).map(text => ({ t: 'between', text })),
  { t: 'begun', discarded: parts.discarded ?? 0 },
  ...(parts.data ?? []).map(text => ({ t: 'data', text })),
  { t: 'finished', code: parts.code ?? 0, cwd: parts.cwd ?? '/tmp' },
]

describe('the host reads the control frames of a terminal gate', { skip: !onLinux }, () => {
  describe('bytes between two segments', () => {
    it('puts them, kept and counted, in the between section of the segment result', async () => {
      const f = await open({
        executes: [leg({ between: ['ab', 'cd'], data: ['out'], code: 3, cwd: '/work' })],
      })
      const handle = f.done(await f.execute())
      const outcome = await handle.result
      expect(outcome).toMatchObject({ kind: 'completed', exit: { kind: 'code', code: 3 } })
      expect(summaryOf(outcome)).toEqual({
        mode: 'terminal',
        terminal: { observedBytes: 3, discardedBytes: 0 },
        between: { data: bytes('abcd'), count: { observedBytes: 4, discardedBytes: 0 } },
      })
      expect(await drain(handle)).toBe('out')
      expect(f.terminals.information?.(f.terminal)).toEqual({
        terminal: f.terminal,
        state: 'idle',
        observedCwd: '/work',
      })
    })

    it('has an empty between section when nothing came between the segments', async () => {
      const f = await open({ executes: [leg({ data: ['x'] })] })
      const outcome = await f.done(await f.execute()).result
      expect(summaryOf(outcome).between).toEqual({
        data: new Uint8Array(0),
        count: { observedBytes: 0, discardedBytes: 0 },
      })
    })

    it('adds the bytes the gate discarded to the observed count', async () => {
      const f = await open(
        { executes: [leg({ between: ['abcd'], discarded: 6 })] },
        {
          betweenSegmentBytes: 4,
        },
      )
      const outcome = await f.done(await f.execute()).result
      expect(summaryOf(outcome).between).toEqual({
        data: bytes('abcd'),
        count: { observedBytes: 10, discardedBytes: 6 },
      })
      // The host handed the gate the bound it was given.
      expect((await f.received())[0]).toMatchObject({ betweenSegmentBytes: 4 })
    })

    it('counts discarded bytes when none were kept', async () => {
      const f = await open({ executes: [leg({ discarded: 9 })] })
      const outcome = await f.done(await f.execute()).result
      expect(summaryOf(outcome).between).toEqual({
        data: new Uint8Array(0),
        count: { observedBytes: 9, discardedBytes: 9 },
      })
    })

    it('keeps the between bytes of each segment to that segment', async () => {
      const f = await open({
        executes: [
          leg({ between: ['one'], discarded: 2, data: ['a'] }),
          leg({ between: ['t', 'wo'], data: ['b'] }),
          leg({ data: ['c'] }),
        ],
      })
      const results: CommandOutcome[] = []
      for (let i = 0; i < 3; i++) results.push(await f.done(await f.execute()).result)
      expect(results.map(outcome => summaryOf(outcome).between)).toEqual([
        { data: bytes('one'), count: { observedBytes: 5, discardedBytes: 2 } },
        { data: bytes('two'), count: { observedBytes: 3, discardedBytes: 0 } },
        { data: new Uint8Array(0), count: { observedBytes: 0, discardedBytes: 0 } },
      ])
      expect(results.map(outcome => summaryOf(outcome).terminal)).toEqual([
        { observedBytes: 1, discardedBytes: 0 },
        { observedBytes: 1, discardedBytes: 0 },
        { observedBytes: 1, discardedBytes: 0 },
      ])
    })

    it('does not mix them into the segment output', async () => {
      const f = await open({ executes: [leg({ between: ['between'], data: ['segment'] })] })
      const handle = f.done(await f.execute())
      await handle.result
      expect(await drain(handle)).toBe('segment')
    })

    it('treats a gate that sends more than the bound as a fault', async () => {
      const f = await open(
        { executes: [[{ t: 'started' }, { t: 'between', text: 'abcde' }]] },
        { betweenSegmentBytes: 4 },
      )
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(summaryOf(outcome).between).toBeUndefined()
      expect(f.state()).toBe('invalid')
    })
  })

  describe('the begin frame', () => {
    it('is read whether it comes before or after the started frame', async () => {
      const f = await open({
        executes: [
          [
            { t: 'between', text: 'xy' },
            { t: 'begun', discarded: 1 },
            { t: 'started' },
            { t: 'data', text: 'o' },
            { t: 'finished', code: 0, cwd: '/tmp' },
          ],
        ],
      })
      const outcome = await f.done(await f.execute()).result
      expect(summaryOf(outcome)).toEqual({
        mode: 'terminal',
        terminal: { observedBytes: 1, discardedBytes: 0 },
        between: { data: bytes('xy'), count: { observedBytes: 3, discardedBytes: 1 } },
      })
    })

    it('puts output in the segment only after it', async () => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'data', text: 'early' }, { t: 'begun', discarded: 0 }]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(summaryOf(outcome).terminal).toEqual({ observedBytes: 0, discardedBytes: 0 })
      expect(f.state()).toBe('invalid')
    })

    it('is not repeated within a segment', async () => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'begun', discarded: 0 }, { t: 'begun', discarded: 5 }]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(f.state()).toBe('invalid')
    })

    it('has to come before the segment ends', async () => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'finished', code: 0, cwd: '/tmp' }]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(f.state()).toBe('invalid')
    })
  })

  describe('a segment that ends without the begin frame', () => {
    it('has no between section, and says the effect is unknown', async () => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'fault' }]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toEqual({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: expect.any(Number),
        output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
      })
      expect(f.state()).toBe('invalid')
    })

    it('has no between section even when between bytes were read before the fault', async () => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'between', text: 'kept?' }, { t: 'fault' }]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome.kind).toBe('failed')
      expect('between' in summaryOf(outcome)).toBe(false)
    })

    it('is a fault of the terminal when the gate reports it before the started frame', async () => {
      const f = await open({ executes: [[{ t: 'fault' }]] })
      expect(await f.execute()).toEqual({ kind: 'unknown', requestId: 'execute' })
      expect(f.state()).toBe('invalid')
    })
  })

  describe('the end of a segment', () => {
    it('is completed with the exit code, the duration and the segment counts', async () => {
      const f = await open({ executes: [leg({ data: ['abc'], code: 255, between: ['q'] })] })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toEqual({
        kind: 'completed',
        exit: { kind: 'code', code: 255 },
        durationMs: expect.any(Number),
        output: {
          mode: 'terminal',
          terminal: { observedBytes: 3, discardedBytes: 0 },
          between: { data: bytes('q'), count: { observedBytes: 1, discardedBytes: 0 } },
        },
      })
    })

    it('leaves the terminal idle, with the cwd the segment ended in, ready for the next segment', async () => {
      const f = await open({
        executes: [leg({ cwd: '/one' }), leg({ cwd: '/two', between: ['n'] })],
      })
      await f.done(await f.execute()).result
      expect(f.terminals.information?.(f.terminal)).toMatchObject({
        state: 'idle',
        observedCwd: '/one',
      })
      const second = await f.done(await f.execute()).result
      expect(summaryOf(second).between?.data).toEqual(bytes('n'))
      expect(f.terminals.information?.(f.terminal)).toMatchObject({
        state: 'idle',
        observedCwd: '/two',
      })
    })

    it('sends the script and ends only when the gate says so: the terminal is busy meanwhile', async () => {
      const f = await open({ executes: [[{ t: 'started' }]] })
      const handle = f.done(await f.execute('echo hi'))
      expect(f.state()).toBe('running')
      expect(await f.execute()).toMatchObject({ kind: 'rejected', reason: 'busy' })
      const messages = await f.received()
      expect(messages.at(-1)).toMatchObject({
        c: 'execute',
        script: 'echo hi',
        id: handle.process.id,
      })
    })
  })

  describe('a gate that breaks the protocol', () => {
    it.each([
      ['a line that is not JSON', { raw: 'not json' }],
      ['a frame of another generation', { t: 'data', text: 'x', generation: 'other' }],
      ['a frame of another segment', { t: 'data', text: 'x', leg: 'other' }],
      ['bytes that are not base64', { t: 'data', b: '***' }],
      ['an exit code over 255', { t: 'finished', code: 256, cwd: '/tmp' }],
    ])('is a fault: %s', async (_name, frame) => {
      const f = await open({
        executes: [[{ t: 'started' }, { t: 'begun', discarded: 0 }, frame]],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(f.state()).toBe('invalid')
    })

    it('refuses a later segment of a terminal that faulted', async () => {
      const f = await open({ executes: [[{ t: 'started' }, { t: 'fault' }]] })
      await f.done(await f.execute()).result
      expect(await f.execute()).toMatchObject({ kind: 'rejected', reason: 'closed' })
    })

    it('invalidates an idle terminal whose gate reports a fault', async () => {
      const f = await open({
        go: [
          { t: 'opened', cwd: '/tmp' },
          { t: 'fault', delayMs: 300 },
        ],
      })
      await eventually(() => expect(f.state()).toBe('invalid'))
      expect(await f.execute()).toMatchObject({ kind: 'rejected', reason: 'closed' })
    })
  })

  describe('frames that share one chunk with a fault', () => {
    // The stand-in gate writes them in one write, so the host reads them in one chunk. The outcome
    // must be the one the same frames give when they arrive one by one.
    const joined = (frames: readonly object[]): object[] =>
      frames.map((frame, at) => (at === 0 ? frame : { ...frame, joined: true }))

    it('hand out the handle when started comes with the fault; the result says the effect is unknown', async () => {
      const f = await open({ executes: [joined([{ t: 'started' }, { t: 'fault' }])] })
      const handle = f.done(await f.execute())
      expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(f.state()).toBe('invalid')
    })

    it('keep the output read before the fault: the segment counts it and the reader gets it', async () => {
      const f = await open({
        executes: [
          joined([
            { t: 'started' },
            { t: 'begun', discarded: 0 },
            { t: 'data', text: 'abc' },
            { t: 'fault' },
          ]),
        ],
      })
      const handle = f.done(await f.execute())
      const outcome = await handle.result
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(summaryOf(outcome).terminal).toEqual({ observedBytes: 3, discardedBytes: 0 })
      expect(await drain(handle)).toBe('abc')
    })

    it('complete a segment whose finished frame comes with the fault; then the terminal is invalid', async () => {
      const f = await open({
        executes: [joined([...leg({ data: ['abc'], code: 3, between: ['q'] }), { t: 'fault' }])],
      })
      const outcome = await f.done(await f.execute()).result
      expect(outcome).toEqual({
        kind: 'completed',
        exit: { kind: 'code', code: 3 },
        durationMs: expect.any(Number),
        output: {
          mode: 'terminal',
          terminal: { observedBytes: 3, discardedBytes: 0 },
          between: { data: bytes('q'), count: { observedBytes: 1, discardedBytes: 0 } },
        },
      })
      expect(f.state()).toBe('invalid')
      expect(await f.execute()).toMatchObject({ kind: 'rejected', reason: 'closed' })
    })
  })

  it('stops the stand-in gate when the terminal is closed', async () => {
    const f = await open({ executes: [leg({ data: ['x'] })] })
    const [pid] = gatePids
    expect(pid !== undefined && alive(pid)).toBe(true)
    await f.done(await f.execute()).result
    const closed = await f.terminals.facility.close({
      ...request,
      requestId: 'close',
      terminal: f.terminal satisfies TerminalRef,
    })
    expect(closed).toMatchObject({ kind: 'done', value: { status: 'confirmed' } })
    await eventually(() => expect(pid !== undefined && alive(pid)).toBe(false))
    expect(f.state()).toBe('closed')
  })
})
