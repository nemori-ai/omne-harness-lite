/** @module-tag slow */
// Slow: every test starts real processes in real systemd user scopes and waits for them.
// The host `command` facility on Linux, end to end through the real `systemd-run`, the real gate
// process and the real `systemctl` supervisor: streaming, the explicit environment, bounded output,
// the gate's back-pressure, the two stop answers, a single-call interrupt, release and retirement,
// and resource recovery from another domain. Only the resource ledger is a test recorder: it is the
// integrator's port. The tests run only on Linux with `OMNE_HOST_COMMAND_LINUX=1`; elsewhere they
// are skipped, and a skip is not a pass.
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access as reach, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Context, type Message } from '@deepseek-ai/cordis'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandFacility,
  type EnvironmentBinding,
  type EnvironmentLease,
  type EnvironmentProvider,
  type ManagedResource,
  type OutputChunk,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  createHostFilesDomain,
  createHostFilesProvider,
  type HostFilesProviderOptions,
} from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  commandFacilityPlugin,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { testPorts } from './ports.ts'

const run = promisify(execFile)
const enabled = process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'
const gateScript = fileURLToPath(new URL('../dist/command-gate.js', import.meta.url))
const decoder = new TextDecoder()

const tenant = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
})()
const access = { principal: 'subject-a', tenant }
// Scope references unique to this run: recovery of a scope reaches every unit of that scope on the
// host, so another test file that recovers its own scope must not meet these units.
const runScope = `scope-command-${randomUUID()}`
const recoverScope = `scope-recover-${randomUUID()}`
const host: EnvironmentBinding = { kind: 'host_machine' }

type ScopeRef = ProviderAcquireInput['scope']
function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}
function scopeOf(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type LedgerRecord = {
  ledger: ResourceLedger
  plans: ManagedResource[]
  permits: string[]
  stopped: [string, 'confirmed' | 'unconfirmed'][]
}

function recordingLedger(
  answers: {
    plan?: Awaited<ReturnType<ResourceLedger['plan']>>
    permit?: Awaited<ReturnType<ResourceLedger['permit']>>
  } = {},
): LedgerRecord {
  const record: LedgerRecord = {
    plans: [],
    permits: [],
    stopped: [],
    ledger: {
      closed: new AbortController().signal,
      plan: async resource => {
        record.plans.push(resource)
        return answers.plan ?? 'recorded'
      },
      permit: async key => {
        record.permits.push(key)
        return answers.permit ?? 'confirmed'
      },
      adopt: async () => 'confirmed',
      stopped: async (key, status) => {
        record.stopped.push([key, status])
        return 'recorded'
      },
    },
  }
  return record
}

const providers: EnvironmentProvider[] = []
const handles: ProcessHandle[] = []
const units = new Set<string>()
const roots: string[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop('forced')))
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

afterAll(async () => {
  if (!enabled) return
  const left: string[] = []
  for (const unit of units) if ((await unitState(unit)).loadState !== 'not-found') left.push(unit)
  for (const unit of left) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  expect(left).toEqual([])
})

async function unitState(unit: string): Promise<{ loadState: string; activeState: string }> {
  const { stdout } = await run('systemctl', [
    '--user',
    'show',
    '-p',
    'LoadState',
    '-p',
    'ActiveState',
    unit,
  ])
  const value = (name: string) =>
    /^(\w+)=(.*)$/mu.exec(stdout.split('\n').find(l => l.startsWith(`${name}=`)) ?? '')?.[2] ?? ''
  return { loadState: value('LoadState'), activeState: value('ActiveState') }
}

async function bootId(): Promise<string> {
  return (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
}

async function workDirectory(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-host-command-')))
  roots.push(root)
  return root
}

function hostProvider(options: Partial<HostFilesProviderOptions> = {}) {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain(), ...options })
  providers.push(provider)
  return provider
}

function placementFor(provider: EnvironmentProvider) {
  return {
    kind: 'placement' as const,
    requirement: {
      allowedBindings: [host],
      facilities: ['files' as const, 'command' as const],
      isolation: [],
    },
    binding: host,
    provider: { name: provider.name, generation: provider.generation, version: provider.version },
    continuity: { kind: 'not_guaranteed' as const },
    quotaDomain: provider.quotaDomain,
  }
}

async function leaseOf(
  provider: EnvironmentProvider,
  ledger: ResourceLedger,
  key = 'acq-1',
  scope = runScope,
): Promise<EnvironmentLease> {
  const answer = await provider.acquire({
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    scope: scopeOf(scope),
    tenant,
    ledger,
    placement: placementFor(provider),
  })
  if (answer.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(answer)}`)
  return answer.lease
}

function commandOf(lease: EnvironmentLease): CommandFacility<unknown> {
  const command = lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  return command
}

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]

function request(cwd: string, script: string, overrides: Partial<StartRequest> = {}): StartRequest {
  return {
    requestId: `start-${randomUUID()}`,
    access,
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/sh',
    args: ['-c', script],
    cwd,
    env: { PATH: '/usr/bin:/bin' },
    outputMode: 'separate',
    ...overrides,
  }
}

async function started(
  command: CommandFacility<unknown>,
  start: StartRequest,
): Promise<ProcessHandle> {
  const answer = await command.start(start)
  if (answer.kind !== 'done')
    throw new Error(`expected a started process: ${JSON.stringify(answer)}`)
  handles.push(answer.value)
  units.add(answer.value.process.id)
  return answer.value
}

async function drain(output: AsyncIterable<OutputChunk>): Promise<OutputChunk[]> {
  const chunks: OutputChunk[] = []
  for await (const chunk of output) chunks.push(chunk)
  return chunks
}

function text(chunks: readonly OutputChunk[], stream: OutputChunk['stream'] = 'stdout'): string {
  return chunks
    .filter(chunk => chunk.stream === stream)
    .map(chunk => decoder.decode(chunk.data))
    .join('')
}

/** Reads chunks until the joined stdout text matches, then leaves the iterator open. */
async function readUntil(iterator: AsyncIterator<OutputChunk>, pattern: RegExp): Promise<string> {
  let seen = ''
  while (!pattern.test(seen)) {
    const next = await iterator.next()
    if (next.done === true) throw new Error(`output ended before ${pattern}: ${seen}`)
    if (next.value.stream === 'stdout') seen += decoder.decode(next.value.data)
  }
  return seen
}

async function pending<T>(promise: Promise<T>, ms = 100): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>(resolve => setTimeout(resolve, ms, 'pending')),
  ])
}

async function exists(path: string): Promise<boolean> {
  return reach(path).then(
    () => true,
    () => false,
  )
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

type RunningGate = {
  frames: Record<string, unknown>[]
  send(message: Readonly<Record<string, unknown>>): void
  closed: Promise<number | null>
}

/** Starts the real gate in its own scope unit, as the provider does, and collects its frames. */
function gateInScope(): RunningGate {
  const unit = `omne-test-gate-${randomUUID()}.scope`
  units.add(unit)
  const gate = spawn(
    'systemd-run',
    [
      '--user',
      '--scope',
      '--quiet',
      '--collect',
      `--unit=${unit}`,
      '--',
      process.execPath,
      gateScript,
      unit,
    ],
    { stdio: ['ignore', 'pipe', 'inherit', 'pipe'] },
  )
  const control = gate.stdio[3]
  if (control === null || control === undefined || !('write' in control))
    throw new Error('expected a control pipe')
  const frames: Record<string, unknown>[] = []
  let buffered = ''
  gate.stdout?.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8')
    for (let at = buffered.indexOf('\n'); at !== -1; at = buffered.indexOf('\n')) {
      const frame: unknown = JSON.parse(buffered.slice(0, at))
      buffered = buffered.slice(at + 1)
      if (typeof frame === 'object' && frame !== null) frames.push({ ...frame })
    }
  })
  const closed = new Promise<number | null>(resolve => gate.on('close', resolve))
  return { frames, send: message => control.write(`${JSON.stringify(message)}\n`), closed }
}

/** The gate's request for `script`, run by `/bin/sh` in `cwd` with an empty environment. */
const gateRequest = (cwd: string, script: string) => ({
  executable: '/bin/sh',
  args: ['-c', script],
  cwd,
  env: { PATH: '/usr/bin:/bin' },
  stdin: null,
  maxChunkBytes: 64 * 1024,
})

const dataText = (frames: readonly Record<string, unknown>[]) =>
  frames
    .filter(frame => frame['t'] === 'data' && frame['s'] === 'stdout')
    .map(frame => Buffer.from(String(frame['b']), 'base64').toString('utf8'))
    .join('')

describe('host command facility on Linux', { skip: !enabled }, () => {
  it('streams three lines in order with their offsets, exits 0, and clears its scope', async () => {
    const recorded = recordingLedger()
    const provider = hostProvider()
    const command = commandOf(await leaseOf(provider, recorded.ledger))
    const handle = await started(
      command,
      request(await workDirectory(), 'for i in 1 2 3; do echo $i; sleep 0.2; done'),
    )
    expect(handle.process).toEqual({
      id: expect.stringMatching(/^omne-host-[0-9a-f-]{36}\.scope$/u),
      generation: await bootId(),
    })
    expect(handle.outputMode).toBe('separate')
    const chunks = await drain(handle.output)
    expect(
      chunks.map(chunk => [chunk.stream, decoder.decode(chunk.data), chunk.observedOffset]),
    ).toEqual([
      ['stdout', '1\n', 0],
      ['stdout', '2\n', 2],
      ['stdout', '3\n', 4],
    ])
    expect(await handle.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      output: {
        mode: 'separate',
        stdout: { observedBytes: 6, discardedBytes: 0 },
        stderr: { observedBytes: 0, discardedBytes: 0 },
      },
    })
    const key = recorded.plans[0]?.key
    expect(recorded.plans).toEqual([
      {
        key,
        provider: 'host-files',
        reference: {
          kind: 'object',
          entries: [
            { key: 'unit', value: { kind: 'string', value: handle.process.id } },
            { key: 'bootId', value: { kind: 'string', value: await bootId() } },
          ],
        },
      },
    ])
    expect(recorded.permits).toEqual([key])
    await vi.waitFor(() => expect(recorded.stopped).toEqual([[key, 'confirmed']]), {
      timeout: 15_000,
    })
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    // The scope is already gone: a later forced stop reads it as gone (stop exit code 5).
    expect(await handle.stop('forced')).toBe('confirmed')
  })

  it('gives the command only the explicit environment, and writes the standard input', async () => {
    const command = commandOf(await leaseOf(hostProvider(), recordingLedger().ledger))
    const cwd = await workDirectory()
    const env = await started(
      command,
      request(cwd, '', { executable: '/usr/bin/env', args: [], env: { ONLY: 'this' } }),
    )
    expect(text(await drain(env.output))).toBe('ONLY=this\n')
    const cat = await started(
      command,
      request(cwd, '', {
        executable: '/bin/cat',
        args: [],
        stdin: new TextEncoder().encode('typed\u0000bytes'),
      }),
    )
    expect(text(await drain(cat.output))).toBe('typed\u0000bytes')
    const pwd = await started(command, request(cwd, 'pwd; echo err >&2; exit 7'))
    const chunks = await drain(pwd.output)
    expect(text(chunks)).toBe(`${cwd}\n`)
    expect(text(chunks, 'stderr')).toBe('err\n')
    expect(await pwd.result).toMatchObject({ kind: 'completed', exit: { kind: 'code', code: 7 } })
  })

  it('answers unavailable when the image does not start, and stops its scope', async () => {
    const recorded = recordingLedger()
    const command = commandOf(await leaseOf(hostProvider(), recorded.ledger))
    const answer = await command.start(
      request(await workDirectory(), '', { executable: '/nonexistent/omne-missing', args: [] }),
    )
    expect(answer).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    const key = recorded.plans[0]?.key
    expect(recorded.stopped).toEqual([[key, 'confirmed']])
    const reference = recorded.plans[0]?.reference
    const unit =
      reference?.kind === 'object' && reference.entries[0]?.value.kind === 'string'
        ? reference.entries[0].value.value
        : ''
    units.add(unit)
    expect(await unitState(unit)).toMatchObject({ loadState: 'not-found' })
  })

  it('discards whole chunks past the buffer bound, counts them, and keeps the delivered bytes within it', async () => {
    const maxBufferedBytes = 64 * 1024
    const provider = hostProvider({ command: { maxBufferedBytes, maxChunkBytes: 16 * 1024 } })
    const command = commandOf(await leaseOf(provider, recordingLedger().ledger))
    const total = 1024 * 1024
    const handle = await started(
      command,
      request(await workDirectory(), `head -c ${total} /dev/zero`),
    )
    const outcome = await handle.result
    const chunks = await drain(handle.output)
    const delivered = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0)
    expect(delivered).toBeLessThanOrEqual(maxBufferedBytes)
    expect(chunks.every(chunk => chunk.data.length <= 16 * 1024)).toBe(true)
    expect(outcome).toMatchObject({
      kind: 'completed',
      output: { stdout: { observedBytes: total, discardedBytes: total - delivered } },
    })
    // The gaps between offsets add up to the discarded bytes.
    let end = 0
    let gaps = 0
    for (const chunk of chunks) {
      gaps += chunk.observedOffset - end
      end = chunk.observedOffset + chunk.data.length
    }
    expect(gaps + (total - end)).toBe(total - delivered)
  })

  it('pauses the command while the gate cannot write its frames, and loses no byte after it resumes', async () => {
    const unit = `omne-test-gate-${randomUUID()}.scope`
    units.add(unit)
    const cwd = await workDirectory()
    const marker = join(cwd, 'finished')
    const total = 4 * 1024 * 1024
    const gate = spawn(
      'systemd-run',
      [
        '--user',
        '--scope',
        '--quiet',
        '--collect',
        `--unit=${unit}`,
        '--',
        process.execPath,
        gateScript,
        unit,
      ],
      { stdio: ['ignore', 'pipe', 'inherit', 'pipe'] },
    )
    const control = gate.stdio[3]
    if (control === null || control === undefined || !('write' in control))
      throw new Error('expected a control pipe')
    let buffered = ''
    let bytes = 0
    let exit: unknown
    let holding = true
    const onLine = (lineText: string) => {
      const frame: unknown = JSON.parse(lineText)
      if (typeof frame !== 'object' || frame === null) return
      const kind = Reflect.get(frame, 't')
      if (kind === 'ready') control.write(`${JSON.stringify({ c: 'go' })}\n`)
      if (kind === 'data') bytes += Buffer.from(String(Reflect.get(frame, 'b')), 'base64').length
      if (kind === 'exit') exit = Reflect.get(frame, 'code')
    }
    const stdout = gate.stdout
    if (stdout === null) throw new Error('expected the gate output')
    stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8')
      let at = buffered.indexOf('\n')
      while (at !== -1) {
        onLine(buffered.slice(0, at))
        buffered = buffered.slice(at + 1)
        at = buffered.indexOf('\n')
      }
      // Stop reading after the first data frame: the gate's frame pipe fills up.
      if (holding && bytes > 0) stdout.pause()
    })
    control.write(
      `${JSON.stringify({
        executable: '/bin/sh',
        args: ['-c', `head -c ${total} /dev/zero; touch '${marker}'`],
        cwd,
        env: { PATH: '/usr/bin:/bin' },
        stdin: null,
        maxChunkBytes: 64 * 1024,
      })}\n`,
    )
    await vi.waitFor(() => expect(bytes).toBeGreaterThan(0), { timeout: 15_000 })
    await new Promise(resolve => setTimeout(resolve, 1500))
    // The command is blocked on its own output pipe: it has not reached the marker.
    expect(await exists(marker)).toBe(false)
    holding = false
    stdout.resume()
    await new Promise(resolve => gate.on('close', resolve))
    expect(bytes).toBe(total)
    expect(exit).toBe(0)
    expect(await exists(marker)).toBe(true)
  })

  it('answers confirmed for a graceful stop when the command exits on SIGTERM', async () => {
    const recorded = recordingLedger()
    const command = commandOf(await leaseOf(hostProvider(), recorded.ledger))
    const handle = await started(
      command,
      request(await workDirectory(), '', { executable: '/bin/sleep', args: ['30'] }),
    )
    expect(await handle.stop('graceful')).toBe('confirmed')
    expect(await handle.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'signal', signal: 'SIGTERM' },
    })
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(recorded.stopped).toContainEqual([recorded.plans[0]?.key, 'confirmed'])
  })

  it('answers unconfirmed when the grace passes and does not escalate; a forced stop then confirms', async () => {
    const recorded = recordingLedger()
    const provider = hostProvider({ command: { graceMs: 300 } })
    const command = commandOf(await leaseOf(provider, recorded.ledger))
    const handle = await started(
      command,
      request(await workDirectory(), 'trap "" TERM; echo ready; while :; do sleep 0.1; done'),
    )
    const iterator = handle.output[Symbol.asyncIterator]()
    await readUntil(iterator, /ready/u)
    expect(await handle.stop('graceful')).toBe('unconfirmed')
    const key = recorded.plans[0]?.key
    expect(recorded.stopped).toEqual([[key, 'unconfirmed']])
    // Not escalated: the command still runs in its scope, and the outcome is still open.
    expect(await unitState(handle.process.id)).toMatchObject({ activeState: 'active' })
    expect(await pending(handle.result, 300)).toBe('pending')
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(recorded.stopped).toEqual([
      [key, 'unconfirmed'],
      [key, 'confirmed'],
    ])
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  })

  it('kills the whole process tree of the scope on a forced stop', async () => {
    const command = commandOf(await leaseOf(hostProvider(), recordingLedger().ledger))
    const handle = await started(
      command,
      request(await workDirectory(), 'sleep 300 & echo $!; wait'),
    )
    const pid = Number((await readUntil(handle.output[Symbol.asyncIterator](), /^\d+\n/u)).trim())
    expect(alive(pid)).toBe(true)
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(alive(pid)).toBe(false)
  })

  it('completes when the main process exits, then clears what it left running in the scope', async () => {
    const recorded = recordingLedger()
    const command = commandOf(await leaseOf(hostProvider(), recorded.ledger))
    const handle = await started(command, request(await workDirectory(), 'sleep 300 & echo $!'))
    const chunks = await drain(handle.output)
    const pid = Number(text(chunks).trim())
    expect(await handle.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
    })
    await vi.waitFor(
      () => expect(recorded.stopped).toEqual([[recorded.plans[0]?.key, 'confirmed']]),
      {
        timeout: 15_000,
      },
    )
    expect(alive(pid)).toBe(false)
  })

  it('stops only the interrupted call: the other process of the same acquisition keeps running and ends', async () => {
    const command = commandOf(await leaseOf(hostProvider(), recordingLedger().ledger))
    const cwd = await workDirectory()
    const looping = await started(command, request(cwd, 'while :; do echo a; sleep 0.1; done'))
    const counting = await started(
      command,
      request(cwd, 'for i in 1 2 3 4 5 6 7 8 9 10; do echo b$i; sleep 0.1; done'),
    )
    const countingOutput = drain(counting.output)
    await readUntil(looping.output[Symbol.asyncIterator](), /a/u)
    expect(await looping.stop('forced')).toBe('confirmed')
    expect(await unitState(looping.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(await looping.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(text(await countingOutput)).toBe(
      Array.from({ length: 10 }, (_, i) => `b${i + 1}\n`).join(''),
    )
    expect(await counting.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
  })

  it('starts the command once however often the control pipe says GO', async () => {
    const cwd = await workDirectory()
    const marker = join(cwd, 'runs')
    const gate = gateInScope()
    gate.send(gateRequest(cwd, `echo run >> '${marker}'; sleep 0.3`))
    await vi.waitFor(() => expect(gate.frames.map(frame => frame['t'])).toContain('ready'), {
      timeout: 15_000,
    })
    gate.send({ c: 'go' })
    gate.send({ c: 'go' })
    expect(await gate.closed).toBe(0)
    expect(gate.frames.filter(frame => frame['t'] === 'started')).toHaveLength(1)
    expect((await readFile(marker, 'utf8')).trim().split('\n')).toEqual(['run'])
  })

  it('does not hand the control pipe on to the command: descriptor 3 there is another pipe', async () => {
    const gate = gateInScope()
    // The parent of the shell is the gate: its descriptor 3 is the control pipe.
    gate.send(
      gateRequest(
        await workDirectory(),
        'readlink /proc/$PPID/fd/3; readlink /proc/$$/fd/3 || echo none',
      ),
    )
    await vi.waitFor(() => expect(gate.frames.map(frame => frame['t'])).toContain('ready'), {
      timeout: 15_000,
    })
    gate.send({ c: 'go' })
    expect(await gate.closed).toBe(0)
    const [controlPipe, commandPipe] = dataText(gate.frames).trim().split('\n')
    expect(controlPipe).toMatch(/^socket:\[\d+\]$/u)
    expect(commandPipe).not.toBe(controlPipe)
  })

  it('answers unsupported before closed for a released acquisition, and invalidInput too', async () => {
    const recorded = recordingLedger()
    const lease = await leaseOf(hostProvider(), recorded.ledger)
    const command = commandOf(lease)
    const cwd = await workDirectory()
    expect(await lease.release()).toEqual({ kind: 'released' })
    expect(await command.start(request(cwd, 'exit 0', { outputMode: 'terminal' }))).toMatchObject({
      kind: 'rejected',
      reason: 'unsupported',
    })
    expect(await command.start(request(cwd, 'exit 0', { executable: 'sh' }))).toMatchObject({
      kind: 'rejected',
      reason: 'invalidInput',
    })
    expect(await command.start(request(cwd, 'exit 0'))).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
    expect(recorded.plans).toEqual([])
  })

  it('answers unavailable before closed when a prerequisite is missing and the acquisition is released', async () => {
    const empty = await workDirectory()
    const path = process.env['PATH']
    process.env['PATH'] = empty
    let provider: EnvironmentProvider
    try {
      provider = hostProvider()
      // Wait for the probe, which reads PATH, to answer before PATH is restored.
      const lease = await leaseOf(provider, recordingLedger().ledger)
      await commandOf(lease).start(request(empty, 'exit 0'))
      process.env['PATH'] = path
      expect(await lease.release()).toEqual({ kind: 'released' })
      expect(await commandOf(lease).start(request(empty, 'exit 0'))).toMatchObject({
        kind: 'rejected',
        reason: 'unavailable',
      })
    } finally {
      process.env['PATH'] = path
    }
  })

  it('stops the running processes of an acquisition on release, and answers released', async () => {
    const recorded = recordingLedger()
    const provider = hostProvider()
    const lease = await leaseOf(provider, recorded.ledger)
    const handle = await started(commandOf(lease), request(await workDirectory(), 'sleep 300'))
    expect(await lease.release()).toEqual({ kind: 'released' })
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(recorded.stopped).toEqual([[recorded.plans[0]?.key, 'confirmed']])
    // A released acquisition starts nothing new.
    expect(await commandOf(lease).start(request(await workDirectory(), 'exit 0'))).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
    expect(recorded.plans).toHaveLength(1)
  })

  it('force-stops what a generation still runs when a reload retires it, with an effectUnknown outcome', async () => {
    const ctx = new Context()
    const errors: unknown[] = []
    ctx.logger.exporter({
      export(message: Message) {
        if (message.type === 'error') errors.push(...message.args)
      },
    })
    await testPorts(tenant).load(ctx)
    await ctx.plugin(ExecutionEnvironmentRegistry)
    await ctx.plugin(filesFacilityPlugin)
    await ctx.plugin(commandFacilityPlugin)
    const hostFiles = await ctx.plugin(createHostFilesPlugin(createHostFilesDomain()))
    const service = ctx.get(executionEnvironmentKey)
    if (service === undefined) throw new Error('expected the service')
    const requirement = {
      allowedBindings: [host],
      facilities: ['files' as const, 'command' as const],
      isolation: [],
    }
    const placement = await service.resolvePlacement(access, {
      scope: scopeOf(runScope),
      requirement,
    })
    if (placement.kind !== 'placement')
      throw new Error(`expected a placement: ${JSON.stringify(placement)}`)
    const recorded = recordingLedger()
    const acquired = await service.acquire(access, {
      acquisition: acquisitionRef('acq-reload'),
      origin: originRef('call-1'),
      scope: scopeOf(runScope),
      placement,
      ledger: recorded.ledger,
      guard: { authorize: async () => 'authorized' },
    })
    if (acquired.kind !== 'acquired') throw new Error('expected a lease')
    const handle = await started(
      commandOf(acquired.lease),
      request(await workDirectory(), 'sleep 300'),
    )
    await hostFiles.dispose()
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(recorded.stopped).toEqual([[recorded.plans[0]?.key, 'confirmed']])
    await expect(acquired.lease.invalidated).resolves.toEqual({
      source: 'registry',
      reason: 'providerRetired',
    })
    expect(errors).toEqual([])
  })

  it('refuses a start the ledger does not permit: no command runs and its scope is stopped', async () => {
    const recorded = recordingLedger({ permit: 'closed' })
    const command = commandOf(await leaseOf(hostProvider(), recorded.ledger))
    const cwd = await workDirectory()
    const marker = join(cwd, 'ran')
    expect(await command.start(request(cwd, `touch '${marker}'`))).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
    expect(await exists(marker)).toBe(false)
    expect(recorded.stopped).toEqual([[recorded.plans[0]?.key, 'confirmed']])
    const conflicting = recordingLedger({ plan: 'conflict' })
    const second = commandOf(await leaseOf(hostProvider(), conflicting.ledger, 'acq-2'))
    expect(await second.start(request(cwd, `touch '${marker}'`))).toMatchObject({
      kind: 'rejected',
      reason: 'conflict',
    })
    expect(conflicting.permits).toEqual([])
    expect(await exists(marker)).toBe(false)
  })

  it('answers unknown past the start bound, keeps the resource, and stops it on release', async () => {
    const recorded = recordingLedger()
    const provider = hostProvider({ command: { startBoundMs: 1 } })
    const lease = await leaseOf(provider, recorded.ledger)
    const cwd = await workDirectory()
    const marker = join(cwd, 'ran')
    expect(await commandOf(lease).start(request(cwd, `sleep 1; touch '${marker}'`))).toMatchObject({
      kind: 'unknown',
    })
    const reference = recorded.plans[0]?.reference
    const unit =
      reference?.kind === 'object' && reference.entries[0]?.value.kind === 'string'
        ? reference.entries[0].value.value
        : ''
    units.add(unit)
    expect(await lease.release()).toEqual({ kind: 'released' })
    expect(await unitState(unit)).toMatchObject({ loadState: 'not-found' })
    await new Promise(resolve => setTimeout(resolve, 1200))
    expect(await exists(marker)).toBe(false)
  })

  it('lists a running scope for its requester scope from another domain, and recovery stops and confirms it', async () => {
    const recorded = recordingLedger()
    const original = hostProvider()
    const lease = await leaseOf(original, recorded.ledger, 'acq-recover', recoverScope)
    const handle = await started(commandOf(lease), request(await workDirectory(), 'sleep 300'))
    const successor = hostProvider()
    const listed = await successor.listRecoveryResources?.(scopeOf(recoverScope))
    expect(listed).toEqual({ kind: 'listed', resources: [recorded.plans[0]] })
    expect(await successor.listRecoveryResources?.(scopeOf(`scope-other-${randomUUID()}`))).toEqual(
      {
        kind: 'listed',
        resources: [],
      },
    )
    const resource = recorded.plans[0]
    if (resource === undefined) throw new Error('expected a planned resource')
    expect(await successor.recover?.(resource)).toEqual({
      status: 'confirmedStopped',
      evidence: {
        kind: 'object',
        entries: [
          { key: 'unit', value: { kind: 'string', value: handle.process.id } },
          { key: 'LoadState', value: { kind: 'string', value: 'not-found' } },
          { key: 'ActiveState', value: { kind: 'string', value: 'inactive' } },
        ],
      },
    })
    expect(await unitState(handle.process.id)).toMatchObject({ loadState: 'not-found' })
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(await successor.listRecoveryResources?.(scopeOf(recoverScope))).toEqual({
      kind: 'listed',
      resources: [],
    })
  })

  it('answers unavailable, not an empty list, when no systemctl can be found to list the scopes', async () => {
    const empty = await workDirectory()
    const path = process.env['PATH']
    process.env['PATH'] = empty
    try {
      const listed = await hostProvider().listRecoveryResources?.(scopeOf(recoverScope))
      expect(listed).toEqual({ kind: 'unavailable' })
    } finally {
      process.env['PATH'] = path
    }
  })

  it('answers confirmedStopped for a scope of an earlier boot, and unsupported for a unit it does not name', async () => {
    const provider = hostProvider()
    const unit = `omne-host-${randomUUID()}.scope`
    const earlier = await provider.recover?.({
      key: 'k1',
      provider: 'host-files',
      reference: {
        kind: 'object',
        entries: [
          { key: 'unit', value: { kind: 'string', value: unit } },
          { key: 'bootId', value: { kind: 'string', value: randomUUID() } },
        ],
      },
    })
    // The boot identity changed: the answer rests on it, not on a stop of this unit.
    expect(earlier).toEqual({
      status: 'confirmedStopped',
      evidence: {
        kind: 'object',
        entries: [
          { key: 'unit', value: { kind: 'string', value: unit } },
          { key: 'bootId', value: { kind: 'string', value: await bootId() } },
        ],
      },
    })
    expect(
      await provider.recover?.({
        key: 'k2',
        provider: 'host-files',
        reference: {
          kind: 'object',
          entries: [
            { key: 'unit', value: { kind: 'string', value: 'dbus.service' } },
            { key: 'bootId', value: { kind: 'string', value: await bootId() } },
          ],
        },
      }),
    ).toEqual({ status: 'unsupported', evidence: null })
  })
})
