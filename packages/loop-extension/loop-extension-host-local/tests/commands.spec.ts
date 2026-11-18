import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExtensionInput, ExtensionInvocationMode } from '@omne-harness/agent-contract'
import type {
  CommandOutcome,
  ExecutionEnvironment,
  FacilityGuard,
  OutputChunk,
  ProcessHandle,
  ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { commandRequest } from '@omne-harness/loop-extension-contract'
import {
  createBuiltinExtensions,
  createCommandHost,
  createExtensionImplementations,
  type CallRecord,
  type CommandHostInput,
} from '@omne-harness/loop-extension-host-local'
import {
  openTenant,
  passageOf,
  probe,
  reader,
  sourcesOf,
  tenantA,
  type TenantWorld,
} from './world.ts'

const worlds: TenantWorld[] = []
const hosts: { close(): Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.close()))
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

type ProcessStart = (request: {
  requestId: string
  binding: unknown
  outputMode: string
  access: unknown
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  stdin?: Uint8Array
  origin: string
}) => void

const summary = { mode: 'separate', stdout: count(0), stderr: count(0) } as const
function count(discardedBytes: number) {
  return { observedBytes: 0, discardedBytes }
}
const bytes = (text: string) => new TextEncoder().encode(text)

/** A process of the stand-in environment: what it writes, how it ends, and what a stop does to it. */
function processOf(
  script: Partial<{
    stdout: string
    stderr: string
    chunks: readonly OutputChunk[]
    end: CommandOutcome | 'never'
    graceful: 'confirmed' | 'unconfirmed'
    forcedEnds: boolean
    stopFails: boolean
  }> = {},
) {
  const stops: string[] = []
  const ended = Promise.withResolvers<CommandOutcome>()
  const reading = Promise.withResolvers<void>()
  const exit = (code: number): CommandOutcome => ({
    kind: 'completed',
    exit: { kind: 'code', code },
    durationMs: 1,
    output: summary,
  })
  if (script.end !== 'never') ended.resolve(script.end ?? exit(0))
  async function* output(): AsyncGenerator<OutputChunk> {
    reading.resolve()
    yield* script.chunks ?? []
    if (script.stdout !== undefined)
      yield { stream: 'stdout', data: bytes(script.stdout), observedOffset: 0 }
    if (script.stderr !== undefined)
      yield { stream: 'stderr', data: bytes(script.stderr), observedOffset: 0 }
    await ended.promise.catch(() => undefined)
  }
  const handle: ProcessHandle = {
    process: { id: 'process-1', generation: 'g1' },
    outputMode: 'separate',
    output: output(),
    outputPolicy: { maxBufferedBytes: 1 << 20, maxChunkBytes: 1 << 16, overflow: 'discard' },
    result: ended.promise,
    async stop(mode) {
      stops.push(mode)
      if (script.stopFails === true) throw new Error('the environment is gone')
      const confirmed = mode === 'graceful' ? script.graceful !== 'unconfirmed' : true
      if (confirmed && (mode === 'graceful' || script.forcedEnds !== false))
        ended.resolve({
          kind: 'completed',
          exit: { kind: 'signal', signal: 'SIGTERM' },
          durationMs: 1,
          output: summary,
        })
      return confirmed ? 'confirmed' : 'unconfirmed'
    },
  }
  return { handle, stops, exit, reading: reading.promise }
}

type Script = Partial<{
  placement: 'rejected' | 'unknown'
  acquire: 'rejected' | 'unknown' | 'throws' | 'allocationFailed'
  facility: 'absent'
  start: 'rejected' | 'unknown'
  process: ReturnType<typeof processOf>
  onStart: (ledger: ResourceLedger) => unknown
}>

/** An execution environment that does what the test scripts and remembers what it was asked. */
function environmentOf(script: Script = {}) {
  const seen = {
    starts: [] as Parameters<ProcessStart>[0][],
    guards: [] as FacilityGuard<string>[],
    releases: 0,
    acquisitions: [] as string[],
    placements: [] as unknown[],
    acquires: [] as Record<string, unknown>[],
    ledgers: [] as ResourceLedger[],
  }
  const environment = {
    async resolvePlacement(_access: unknown, input: { requirement: unknown }) {
      seen.placements.push(input)
      if (script.placement === 'rejected') return { kind: 'rejected', reason: 'unavailable' }
      if (script.placement === 'unknown') return { kind: 'unknown', cause: 'provider' }
      return {
        kind: 'placement',
        requirement: input.requirement,
        binding: { kind: 'host_machine' },
      }
    },
    async acquire(
      _access: unknown,
      input: {
        acquisition: string
        guard: FacilityGuard<string>
        placement: unknown
        ledger: ResourceLedger
      },
    ) {
      seen.acquisitions.push(input.acquisition)
      seen.guards.push(input.guard)
      seen.ledgers.push(input.ledger)
      seen.acquires.push(input as unknown as Record<string, unknown>)
      if (script.acquire === 'allocationFailed')
        return { kind: 'allocationFailed', acquisition: input.acquisition }
      if (script.acquire === 'throws') throw new Error('the provider is gone')
      if (script.acquire === 'rejected') return { kind: 'rejected', reason: 'capacity' }
      if (script.acquire === 'unknown')
        return { kind: 'unknown', acquisition: input.acquisition, phase: 'allocation' }
      const command = {
        async start(request: Parameters<ProcessStart>[0]) {
          seen.starts.push(request)
          await script.onStart?.(input.ledger)
          const { requestId } = request
          if (script.start === 'rejected')
            return { kind: 'rejected', requestId, reason: 'unavailable' }
          if (script.start === 'unknown') return { kind: 'unknown', requestId }
          return { kind: 'done', requestId, value: (script.process ?? processOf()).handle }
        },
      }
      const lease = {
        placement: input.placement,
        facility: (key: string) =>
          key === 'command' && script.facility !== 'absent' ? command : undefined,
        async release() {
          seen.releases += 1
          return { kind: 'released' }
        },
      }
      return { kind: 'acquired', lease, adoption: {} }
    },
  } as unknown as Pick<ExecutionEnvironment<string>, 'resolvePlacement' | 'acquire'>
  return { environment, seen }
}

const ENV = { PATH: '/usr/bin:/bin', LANG: 'C' }
const input = { passage: 'pass-1/call/1', execution: 'execution-1' } as unknown as ExtensionInput
const fresh: ExtensionInvocationMode = { kind: 'fresh' }
const signal = () => new AbortController().signal

/** A tenant that holds one command extension, and a host over a scripted environment. */
async function arranged(
  script: Script = {},
  options: Partial<CommandHostInput<string>> & { timeout?: string; directory?: string } = {},
) {
  const world = await openTenant(tenantA)
  worlds.push(world)
  const implementation = {
    kind: 'command',
    interpreter: 'node',
    entry: 'check.mjs',
    timeout: options.timeout ?? 'PT5S',
  } as const
  const version = await world.publish(probe('script', { implementation }), {
    'check.mjs': 'process.stdout.write(JSON.stringify({ kind: "observed" }))\n',
  })
  const member = { capability: 'script', assetRef: world.assetRef('script'), version }
  const sources = sourcesOf(world)
  const directory =
    options.directory ?? realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-ledger-')))
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-cwd-')))
  const made = environmentOf(script)
  const host = (extra: Partial<CommandHostInput<string>> = {}) => {
    const created = createCommandHost<string>({
      sources,
      locations: {
        of: async () => ({ kind: 'location', scope: { ref: 'scope-1' } as never, cwd }),
      },
      environment: () => made.environment,
      interpreters: { node: process.execPath },
      env: ENV,
      directory,
      ...options,
      ...extra,
    })
    hosts.push(created)
    return created
  }
  const invoke = async (
    commands: ReturnType<typeof host>,
    mode: ExtensionInvocationMode = fresh,
    aborting = signal(),
  ) => {
    const implementations = createExtensionImplementations({
      sources,
      builtins: createBuiltinExtensions(),
      commands: commands.implementations,
    })
    const resolved = await implementations.resolve({
      ...reader(tenantA),
      passage: passageOf(member),
    })
    if (!('ok' in resolved)) throw new Error(JSON.stringify(resolved))
    return resolved.ok.invoke(input, aborting, mode)
  }
  const lines = () =>
    readdirSync(directory).flatMap(name =>
      readFileSync(join(directory, name), 'utf8')
        .split('\n')
        .filter(line => line !== '')
        .map(
          line =>
            JSON.parse(line) as {
              at: string
              key?: string
              record?: CallRecord
              end?: unknown
              stop?: unknown
            },
        ),
    )
  return { world, member, host, invoke, lines, directory, cwd, ...made }
}

describe('one call of a command implementation', () => {
  it('runs the interpreter on the entry of the exact version, gives it the request on its standard input and only the listed environment', async () => {
    const a = await arranged({
      process: processOf({ stdout: '{"kind":"veto","reason":"no"}', stderr: 'noise' }),
    })
    expect(await a.invoke(a.host())).toEqual({
      kind: 'output',
      value: { kind: 'veto', reason: 'no' },
    })
    const [start] = a.seen.starts
    expect(start).toMatchObject({ executable: process.execPath, cwd: a.cwd, env: ENV })
    expect(start?.args).toHaveLength(1)
    expect(readFileSync(start!.args[0]!, 'utf8')).toContain('"observed"')
    expect(JSON.parse(new TextDecoder().decode(start?.stdin))).toEqual(
      JSON.parse(JSON.stringify(commandRequest(input, fresh))),
    )
    expect(a.seen.releases).toBe(1)
    expect(a.lines().map(line => line.at)).toEqual(['intended', 'started', 'ended'])
    expect(a.lines().at(-1)?.end).toEqual({ outcome: 'exit:0', stop: 'none', stderrBytes: 5 })
    expect(JSON.stringify(a.lines())).not.toContain('noise')
  })

  it.each([
    ['the start is refused', { start: 'rejected' }, { kind: 'notStartedUnavailable' }, 'ended'],
    [
      'the acquisition is refused',
      { acquire: 'rejected' },
      { kind: 'notStartedUnavailable' },
      'ended',
    ],
    [
      'no placement is found',
      { placement: 'rejected' },
      { kind: 'notStartedUnavailable' },
      'ended',
    ],
    [
      'the reply of the start is unknown',
      { start: 'unknown' },
      { kind: 'invocationUnresolved', start: { kind: 'unknown' } },
      'intended',
    ],
    [
      'the acquisition is unknown',
      { acquire: 'unknown' },
      { kind: 'invocationUnresolved', start: { kind: 'unknown' } },
      'intended',
    ],
    [
      'the allocation fails',
      { acquire: 'allocationFailed' },
      { kind: 'notStartedUnavailable' },
      'ended',
    ],
    [
      'the lease has no command facility',
      { facility: 'absent' },
      { kind: 'notStartedUnavailable' },
      'ended',
    ],
    [
      'the acquisition throws',
      { acquire: 'throws' },
      { kind: 'invocationUnresolved', start: { kind: 'unknown' } },
      'intended',
    ],
    [
      'the output is not an output',
      { process: processOf({ stdout: 'done' }) },
      { kind: 'errored', classification: 'bad_output' },
      'ended',
    ],
    [
      'the output is over the limit',
      { process: processOf({ stdout: `{"kind":"observed","pad":"${'x'.repeat(70_000)}"}` }) },
      { kind: 'errored', classification: 'bad_output' },
      'ended',
    ],
    [
      'the exit code is not zero',
      {
        process: processOf({
          end: {
            kind: 'completed',
            exit: { kind: 'code', code: 2 },
            durationMs: 1,
            output: summary,
          },
        }),
      },
      { kind: 'errored', classification: 'nonzero_exit' },
      'ended',
    ],
    [
      'contact is lost after the start',
      {
        process: processOf({
          end: { kind: 'failed', reason: 'effectUnknown', observedDurationMs: 1, output: summary },
        }),
      },
      { kind: 'invocationUnresolved', start: { kind: 'started' } },
      'started',
    ],
    [
      'the exit is unknown',
      {
        process: processOf({
          end: { kind: 'completed', exit: { kind: 'unknown' }, durationMs: 1, output: summary },
        }),
      },
      { kind: 'invocationUnresolved', start: { kind: 'started' } },
      'started',
    ],
  ] as const)('when %s', async (_name, script, result, last) => {
    const a = await arranged(script as Script)
    expect(await a.invoke(a.host())).toMatchObject(result)
    expect(a.lines().at(-1)?.at).toBe(last)
  })

  it('at the time limit asks the process to stop, then forces it, and reports a timeout', async () => {
    const process = processOf({ end: 'never', graceful: 'unconfirmed' })
    const a = await arranged({ process }, { timeout: 'PT0.05S' })
    expect(await a.invoke(a.host())).toMatchObject({ kind: 'errored', classification: 'timeout' })
    expect(process.stops).toEqual(['graceful', 'forced'])
    expect(a.lines().at(-1)?.end).toMatchObject({ outcome: 'timed-out', stop: 'confirmed' })
  })

  it('reports a timeout even when the forced stop does not end the process', async () => {
    const process = processOf({ end: 'never', graceful: 'unconfirmed', forcedEnds: false })
    const a = await arranged({ process }, { timeout: 'PT0.05S' })
    expect(await a.invoke(a.host())).toMatchObject({ kind: 'errored', classification: 'timeout' })
  })

  it('stops the process when the advance is no longer valid', async () => {
    const process = processOf({ end: 'never' })
    const a = await arranged({ process })
    const aborting = new AbortController()
    const running = a.invoke(a.host(), fresh, aborting.signal)
    while (a.seen.starts.length === 0) await new Promise(resolve => setTimeout(resolve, 5))
    await process.reading
    aborting.abort()
    expect(await running).toMatchObject({ kind: 'errored', classification: 'nonzero_exit' })
    expect(process.stops).toEqual(['graceful'])
    expect(a.lines().at(-1)?.end).toEqual({ outcome: 'exit:-1', stop: 'confirmed', stderrBytes: 0 })
  })

  it('stops the process when the advance stopped being valid before the host began to watch it', async () => {
    const process = processOf({ end: 'never' })
    const a = await arranged({ process })
    const aborting = new AbortController()
    const host = a.host({
      afterStep(step) {
        if (step === 'started') aborting.abort()
      },
    })
    expect(await a.invoke(host, fresh, aborting.signal)).toMatchObject({
      kind: 'errored',
      classification: 'nonzero_exit',
    })
    expect(process.stops).toEqual(['graceful'])
  })

  it('records an unconfirmed stop when the environment cannot be asked to stop the process', async () => {
    const process = processOf({ end: 'never', stopFails: true })
    const a = await arranged({ process }, { timeout: 'PT0.05S' })
    expect(await a.invoke(a.host())).toMatchObject({ kind: 'errored', classification: 'timeout' })
    expect(process.stops).toEqual(['graceful', 'forced'])
    expect(a.lines().at(-1)?.end).toEqual({
      outcome: 'timed-out',
      stop: 'unconfirmed',
      stderrBytes: 0,
    })
  })

  it.each([
    ['the interpreter is not in the table', { interpreters: {} }],
    ['the execution environment is away', { environment: () => undefined }],
    [
      'the run location is unavailable',
      { locations: { of: async () => ({ kind: 'unavailable' }) } },
    ],
    ['the time limit has calendar parts', { timeout: 'P1D' }],
  ] as const)('does not enter when %s', async (_name, options) => {
    const a = await arranged({}, options as Partial<CommandHostInput<string>>)
    expect(await a.invoke(a.host())).toEqual({ kind: 'notStartedUnavailable' })
    expect(a.seen.starts).toEqual([])
  })

  it('authorizes only the start of its own call', async () => {
    const a = await arranged()
    await a.invoke(a.host())
    const [guard] = a.seen.guards
    const own = { origin: a.seen.acquisitions[0] } as never
    expect(await guard?.authorize('command', 'start', own)).toBe('authorized')
    expect(await guard?.authorize('command', 'start', { origin: 'another' } as never)).toBe(
      'notAuthorized',
    )
    expect(await guard?.authorize('files', 'read', own)).toBe('notAuthorized')
    expect(await guard?.authorize('files', 'start' as never, own)).toBe('notAuthorized')
    expect(await guard?.authorize('command', 'stop' as never, own)).toBe('notAuthorized')
  })

  it('authorizes nothing once the host is closed', async () => {
    const a = await arranged()
    const host = a.host()
    await a.invoke(host)
    await host.close()
    const own = { origin: a.seen.acquisitions[0] } as never
    expect(await a.seen.guards[0]?.authorize('command', 'start', own)).toBe('notAuthorized')
  })
})

describe('what the host asks of the execution environment', () => {
  it('asks for a command on the host machine in the scope of the run, and starts it under the key of the call', async () => {
    const a = await arranged()
    await a.invoke(a.host())
    const key = 'pass-1/call/1#1'
    const requirement = {
      allowedBindings: [{ kind: 'host_machine' }],
      facilities: ['command'],
      isolation: [],
    }
    expect(a.seen.placements).toEqual([{ scope: { ref: 'scope-1' }, requirement }])
    const [acquire] = a.seen.acquires
    expect(acquire).toMatchObject({ scope: { ref: 'scope-1' }, placement: { kind: 'placement' } })
    expect(String(acquire?.['acquisition'])).toContain(key)
    const [start] = a.seen.starts
    expect(start).toMatchObject({
      requestId: `${key}/start`,
      origin: acquire?.['origin'],
      binding: { kind: 'host_machine' },
      outputMode: 'separate',
      access: reader(tenantA),
    })
  })

  it('writes the resources the environment plans into the record of the call, and answers closed once the run is over', async () => {
    const answers: unknown[] = []
    const resource = { kind: 'process', ref: 'p-1' } as never
    const a = await arranged({
      async onStart(ledger) {
        answers.push(
          await ledger.plan(resource),
          await ledger.permit('p-1'),
          await ledger.adopt('p-1'),
        )
        answers.push(ledger.closed.aborted, await ledger.stopped('p-1', 'confirmed'))
      },
    })
    await a.invoke(a.host())
    expect(answers).toEqual(['recorded', 'confirmed', 'confirmed', false, 'recorded'])
    expect(a.lines().map(line => line.at)).toEqual(['intended', 'resource', 'started', 'ended'])
    const [ledger] = a.seen.ledgers
    expect(ledger?.closed.aborted).toBe(true)
    expect([
      await ledger?.plan(resource),
      await ledger?.permit('p-1'),
      await ledger?.adopt('p-1'),
    ]).toEqual(['closed', 'closed', 'closed'])
    expect(a.lines().map(line => line.at)).toEqual(['intended', 'resource', 'started', 'ended'])
  })

  it('tells each step with the record as it stands after that step', async () => {
    const steps: unknown[] = []
    const a = await arranged()
    await a.invoke(a.host({ afterStep: (step, call) => void steps.push([step, call.state]) }))
    expect(steps).toEqual([
      ['intended', 'intended'],
      ['started', 'started'],
      ['ended', 'ended'],
    ])
  })
})

describe('the standard output of a run', () => {
  const chunk = (text: string, observedOffset: number): OutputChunk => ({
    stream: 'stdout',
    data: bytes(text),
    observedOffset,
  })
  const OVER = {
    kind: 'errored',
    classification: 'bad_output',
    error: 'the output is over the limit',
  }
  const observedOf = (length: number) =>
    `{"kind":"observed","pad":"${'x'.repeat(length - '{"kind":"observed","pad":""}'.length)}"}`
  const signalled: CommandOutcome = {
    kind: 'completed',
    exit: { kind: 'signal', signal: 'SIGKILL' },
    durationMs: 1,
    output: summary,
  }
  const discarded: CommandOutcome = {
    kind: 'completed',
    exit: { kind: 'code', code: 0 },
    durationMs: 1,
    output: { mode: 'separate', stdout: count(5), stderr: count(0) },
  }

  it.each([
    [
      'chunks that follow each other are one output',
      { chunks: [chunk('{"kind":', 0), chunk('"observed"}', 8)] },
      { kind: 'output', value: { kind: 'observed' } },
    ],
    [
      'a gap between two chunks is a bad output',
      { chunks: [chunk('{"kind":', 0), chunk('"observed"}', 9)] },
      OVER,
    ],
    [
      'an output of exactly the limit is read whole',
      { stdout: observedOf(64 * 1024) },
      { kind: 'output', value: { kind: 'observed' } },
    ],
    [
      'an output one byte over the limit is a bad output',
      { stdout: observedOf(64 * 1024 + 1) },
      OVER,
    ],
    [
      'an output over the limit in many chunks is a bad output',
      { chunks: [chunk('x'.repeat(40_000), 0), chunk('x'.repeat(40_000), 40_000)] },
      OVER,
    ],
    [
      'bytes the environment discarded make a bad output',
      { stdout: '{"kind":"observed"}', end: discarded },
      OVER,
    ],
    [
      'an exit by a signal is a nonzero exit',
      { stdout: '{"kind":"observed"}', end: signalled },
      { kind: 'errored', classification: 'nonzero_exit', error: 'the command exited with code -1' },
    ],
  ] as const)('%s', async (_name, script, result) => {
    const a = await arranged({ process: processOf(script as Parameters<typeof processOf>[0]) })
    expect(await a.invoke(a.host())).toMatchObject(result)
  })

  it('counts the bytes of every chunk of the standard error, and keeps none of them', async () => {
    const noise = (text: string): OutputChunk => ({
      stream: 'stderr',
      data: bytes(text),
      observedOffset: 0,
    })
    const a = await arranged({
      process: processOf({
        chunks: [noise('abc'), chunk('{"kind":"observed"}', 0), noise('defg')],
      }),
    })
    await a.invoke(a.host())
    expect(a.lines().at(-1)?.end).toEqual({ outcome: 'exit:0', stop: 'none', stderrBytes: 7 })
  })
})

describe('a call the host does not enter', () => {
  const command = {
    kind: 'command',
    interpreter: 'node',
    entry: 'check.mjs',
    timeout: 'PT5S',
  } as const
  const NOT_ENTERED = { kind: 'notStartedUnavailable' }

  async function direct(
    change: Partial<CommandHostInput<string>> = {},
    asked: Partial<{ access: unknown; member: unknown; declaration: unknown }> = {},
  ) {
    const a = await arranged()
    const host = a.host(change)
    const made = await host.implementations({
      access: reader(tenantA),
      member: a.member,
      declaration: probe('script', { implementation: command }),
      ...asked,
    } as never)
    if (!('ok' in made)) throw new Error(JSON.stringify(made))
    return { a, host, call: () => made.ok(input, signal(), fresh) }
  }

  it.each([
    [
      'the sources of the tenant are away',
      { sources: { of: (): Promise<undefined> => Promise.resolve(undefined) } },
      {},
    ],
    [
      'the sources of the tenant fail',
      { sources: { of: (): Promise<undefined> => Promise.reject(new Error('away')) } },
      {},
    ],
    [
      'the run location cannot be asked',
      { locations: { of: (): Promise<never> => Promise.reject(new Error('away')) } },
      {},
    ],
    [
      'the package of the version is not there',
      {},
      { member: { capability: 'script', assetRef: 'asset/none', version: 'v0' } },
    ],
    ['the declaration is not a command', {}, { declaration: probe('script') }],
    ['the tenant is not a tenant', {}, { access: { principal: 'reader', tenant: {} } }],
  ] as const)(
    'answers that it did not start when %s, and writes no intent',
    async (_name, change, asked) => {
      const { a, call } = await direct(change as Partial<CommandHostInput<string>>, asked)
      expect(await call()).toEqual(NOT_ENTERED)
      expect(a.seen.starts).toEqual([])
      expect(a.lines()).toEqual([])
    },
  )

  it('answers that it did not start once the host is closed', async () => {
    const { a, host, call } = await direct()
    await host.close()
    expect(await call()).toEqual(NOT_ENTERED)
    expect(a.lines()).toEqual([])
  })

  it('asks the run location with the execution and the passage of the call', async () => {
    const asked: unknown[] = []
    const { a, call } = await direct({
      locations: {
        async of(input) {
          asked.push(input)
          return { kind: 'unavailable' }
        },
      },
    })
    await call()
    expect(asked).toEqual([
      { ...reader(tenantA), execution: 'execution-1', passage: 'pass-1/call/1' },
    ])
    expect(a.seen.starts).toEqual([])
  })

  it('does not start while its ledger cannot be written, and starts once it can', async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-ledger-')))
    const directory = join(parent, 'ledger')
    writeFileSync(directory, '')
    const a = await arranged({}, { directory })
    const host = a.host()
    expect(await a.invoke(host)).toEqual(NOT_ENTERED)
    expect(a.seen.starts).toEqual([])
    rmSync(directory)
    await a.invoke(host)
    expect(a.seen.starts).toHaveLength(1)
    expect(a.lines()[0]?.at).toBe('intended')
  })
})

describe('the files of the ledger', () => {
  it('keeps one file for the tenant, named by a digest of the tenant, with the identity of the call in the intent', async () => {
    const a = await arranged()
    await a.invoke(a.host())
    expect(readdirSync(a.directory)).toEqual([expect.stringMatching(/^[0-9a-f]{32}\.jsonl$/u)])
    expect(a.lines()[0]?.record).toMatchObject({
      key: 'pass-1/call/1#1',
      passage: 'pass-1/call/1',
      mode: 'fresh',
      scope: 'scope-1',
      implementation: {
        owner: 'loop-extension',
        name: 'script',
        revision: a.member.version,
        digest: a.member.assetRef,
      },
    })
  })

  it('settles only the calls of its own files, and an unfinished call it cannot stop stays unconfirmed', async () => {
    const a = await arranged({ start: 'unknown' })
    await a.invoke(a.host())
    const stray = join(a.directory, 'notes.txt')
    writeFileSync(stray, `${JSON.stringify(a.lines()[0])}\n`)
    const next = a.host({ recover: () => Promise.reject(new Error('the environment is gone')) })
    await next.start()
    expect(readFileSync(stray, 'utf8').split('\n').filter(Boolean)).toHaveLength(1)
    const [file] = readdirSync(a.directory).filter(name => name.endsWith('.jsonl'))
    const written = readFileSync(join(a.directory, file!), 'utf8').split('\n').filter(Boolean)
    expect(written.map(line => JSON.parse(line) as { at: string; stop?: string })).toMatchObject([
      { at: 'intended' },
      { at: 'settled', stop: 'unconfirmed' },
    ])
  })

  it('records a start that was refused as a call that ended without a stop', async () => {
    const a = await arranged({ start: 'rejected' })
    await a.invoke(a.host())
    expect(a.lines().at(-1)?.end).toEqual({ outcome: 'not-entered', stop: 'none', stderrBytes: 0 })
  })

  it('starts over a ledger file it cannot open, and still takes the calls of the tenant', async () => {
    const a = await arranged()
    mkdirSync(join(a.directory, 'broken.jsonl'))
    const host = a.host()
    await host.start()
    await a.invoke(host)
    expect(a.seen.starts).toHaveLength(1)
  })

  it('closes a host that never started', async () => {
    const a = await arranged()
    await expect(a.host().close()).resolves.toBeUndefined()
  })
})

describe('the ledger of the calls', () => {
  it('has the intent on disk before the start is asked for', async () => {
    let atStart: string[] = []
    const a = await arranged({ onStart: () => (atStart = a.lines().map(line => line.at)) })
    await a.invoke(a.host())
    expect(atStart).toEqual(['intended'])
  })

  it('a second call of the same passage is another physical run with its own record', async () => {
    const a = await arranged({ start: 'unknown' })
    const host = a.host()
    await a.invoke(host)
    await a.invoke(host, {
      kind: 'replay',
      binding: { passage: input.passage, rounds: [], control: 'valid' },
    })
    expect(a.seen.acquisitions).toEqual(['pass-1/call/1#1', 'pass-1/call/1#2'])
    expect(
      a
        .lines()
        .filter(line => line.at === 'intended')
        .map(line => line.record?.mode),
    ).toEqual(['fresh', 'replay'])
  })

  it.each(['intended', 'started'] as const)(
    'a host that died after the call was %s leaves it unfinished, and the next host settles it before it takes a call',
    async step => {
      const crash = new Error('the host process died')
      const a = await arranged({ process: processOf({ end: 'never' }) })
      const dying = a.host({
        afterStep(at) {
          if (at === step) throw crash
        },
      })
      const answered = await a.invoke(dying).catch((error: unknown) => error)
      if (step === 'started')
        expect(answered).toMatchObject({ kind: 'invocationUnresolved', start: { kind: 'started' } })
      else expect(answered).toBe(crash)
      expect(a.lines().at(-1)?.at).toBe(step)
      const recovered: CallRecord[] = []
      const next = a.host({
        async recover(call) {
          recovered.push(call)
          return 'confirmed'
        },
      })
      await next.start()
      expect(recovered.map(call => [call.key, call.state, call.tenant.length > 0])).toEqual([
        ['pass-1/call/1#1', step, true],
      ])
      expect(a.lines().at(-1)).toMatchObject({
        at: 'settled',
        key: 'pass-1/call/1#1',
        stop: 'confirmed',
      })
      await next.start()
      expect(recovered).toHaveLength(1)
    },
  )

  it('a call that ended is not settled again, and without a way to recover the stop stays unconfirmed', async () => {
    const a = await arranged({ start: 'unknown' })
    await a.invoke(a.host())
    const next = a.host()
    await next.start()
    expect(a.lines().map(line => line.at)).toEqual(['intended', 'settled'])
    expect(a.lines().at(-1)?.stop).toBe('unconfirmed')
    const again = a.host({ recover: async () => 'confirmed' })
    await again.start()
    expect(a.lines().map(line => line.at)).toEqual(['intended', 'settled'])
  })
})
