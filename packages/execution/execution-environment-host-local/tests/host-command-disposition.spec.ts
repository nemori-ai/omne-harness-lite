// What becomes of a one-shot command's domain, seen from outside the facility: the start's refusals,
// the end of a gate without an exit frame, the disposition after the exit frame (the reason a
// domain is stopped instead of handed over, in the contract's order), the handover and its unread
// commit, the handle's two stop modes, the release, and the retention listing. The real
// `createHostCommands` and the real retained-process index run against a stand-in `systemd-run`
// (acting as the gate) and a stand-in `systemctl` (`fixtures/fake-supervisor.mjs`, scripted per test
// through `gate.json`). The ledgers are the integrator's ports and record every call. Every wait on
// the facility is bounded, so a defect that loses an answer fails the test instead of hanging it.
// Linux only: the stand-ins use descriptor 3 and signals; elsewhere the file is skipped, and a skip
// is not a pass.
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandOutcome,
  type ManagedResource,
  type ProcessHandle,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import { commandDefaults, createHostCommands, type CommandSettings } from '../src/host-command.ts'
import type { PrerequisiteReading } from '../src/host-probe.ts'
import {
  createRetainedProcessIndex,
  type RetainedProcessIndex,
} from '../src/host-retained-processes.ts'
import { forceStopScope, readBootId, type ScopeTools } from '../src/host-scope.ts'

const onLinux = process.platform === 'linux'
const fixture = fileURLToPath(new URL('./fixtures/fake-supervisor.mjs', import.meta.url))

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')

function scopeOf(text: string): ScopeRef {
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type Plan = Awaited<ReturnType<RetainedProcessLedger['plan']>>
type Adopt = Awaited<ReturnType<RetainedProcessLedger['adopt']>>
type Permit = Awaited<ReturnType<ResourceLedger['permit']>>
type Stop = [string, 'confirmed' | 'unconfirmed']

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void }
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

/** Waits for `promise`; fails the test when it has not settled within `ms`. */
async function within<T>(promise: Promise<T>, what: string, ms = 3_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([promise, late])
  } finally {
    clearTimeout(timer)
  }
}

/** A port call the test answers: `asked` settles with the argument when it is called. */
function controlled<T>() {
  const answer = deferred<T>()
  const asked = deferred<string>()
  return {
    asked: asked.promise,
    answer: (value: T) => answer.resolve(value),
    call: (key: string) => {
      asked.resolve(key)
      return answer.promise
    },
  }
}

/** The script of the stand-in gate; see `fixtures/fake-supervisor.mjs`. */
type GateScript = Readonly<{
  onRequest?: 'ready' | 'silent' | 'vanish'
  onGo?: 'started' | 'spawnFailed' | 'silent'
  afterStarted?: 'exit' | 'stay' | 'vanish' | 'garbage'
  exit?: Readonly<Record<string, unknown>>
  exitAfterMs?: number
  onTerm?: 'ignore' | 'exit'
}>

type Retention = 'bound' | 'none' | 'withoutProcesses' | 'otherScope'

type SetupOptions = Readonly<{
  gate?: GateScript
  settings?: Partial<CommandSettings>
  retention?: Retention
  /** Replaces the index the commands see, or leaves them without one; the real one is still built. */
  retained?: ((index: RetainedProcessIndex) => RetainedProcessIndex) | 'none'
  capacity?: number
  plan?(key: string): Promise<Plan>
  adopt?(key: string): Promise<Adopt>
  permit?(key: string): Promise<Permit>
  /** Answers every prerequisite reading after the start's own. */
  laterPrerequisites?(): Promise<PrerequisiteReading>
}>

const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const directories: string[] = []

async function killGates(directory: string): Promise<void> {
  for (const name of await readdir(directory).catch((): string[] => [])) {
    if (!name.endsWith('.pid')) continue
    try {
      process.kill(Number(await readFile(join(directory, name), 'utf8')), 'SIGKILL')
    } catch {
      /* Already gone. */
    }
  }
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await killGates(directory)
    await rm(directory, { recursive: true, force: true })
  }
})

async function temporary(prefix: string): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  directories.push(directory)
  return directory
}

async function fakeTools(directory: string): Promise<ScopeTools> {
  const wrapper = async (name: string) => {
    const path = join(directory, name)
    await writeFile(
      path,
      `#!/bin/sh\nFAKE_DIR='${directory}' exec '${process.execPath}' '${fixture}' ${name} "$@"\n`,
    )
    await chmod(path, 0o755)
    return path
  }
  return {
    systemdRun: await wrapper('systemd-run'),
    systemctl: await wrapper('systemctl'),
    killWhom: '--kill-whom',
  }
}

async function setup(options: SetupOptions = {}) {
  const fake = await temporary('omne-disposition-fake-')
  const state = await temporary('omne-disposition-state-')
  if (options.gate !== undefined)
    await writeFile(join(fake, 'gate.json'), JSON.stringify(options.gate))
  const tools = await fakeTools(fake)
  const stopBoundMs = options.settings?.stopBoundMs ?? 1_000
  const indexStops: string[] = []
  const bootId = await readBootId()
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: options.capacity ?? 8,
    pollMs: 60_000,
    supervision: async () => ({
      bootId: async () => bootId,
      members: async () => ({ kind: 'members', pids: [1, 2], directory: '/cgroup/x' }),
      stop: coordinate => {
        indexStops.push(coordinate.unit)
        return forceStopScope({ tools, coordinate, boundMs: stopBoundMs })
      },
    }),
  })
  index.join('generation-1')
  expect(await index.ready()).toBe(true)
  const own = { plans: [] as ManagedResource[], stopped: [] as Stop[], permits: [] as string[] }
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      own.plans.push(resource)
      return 'recorded'
    },
    permit: key => {
      own.permits.push(key)
      return options.permit === undefined ? Promise.resolve('confirmed') : options.permit(key)
    },
    adopt: async () => 'unavailable',
    stopped: async (key, status) => {
      own.stopped.push([key, status])
      return 'recorded'
    },
  }
  const processes = {
    plans: [] as ManagedResource[],
    adopts: [] as string[],
    stopped: [] as Stop[],
  }
  const processesClosed = new AbortController()
  const processLedger: RetainedProcessLedger = {
    closed: processesClosed.signal,
    plan: resource => {
      processes.plans.push(resource)
      return options.plan === undefined ? Promise.resolve('recorded') : options.plan(resource.key)
    },
    adopt: key => {
      processes.adopts.push(key)
      return options.adopt === undefined ? Promise.resolve('confirmed') : options.adopt(key)
    },
    stopped: async (key, status) => {
      processes.stopped.push([key, status])
      return 'recorded'
    },
  }
  const released = new AbortController()
  const scope = scopeOf(`scope-disposition-${randomUUID()}`)
  const retentionKind = options.retention ?? 'bound'
  const retention =
    retentionKind === 'none'
      ? undefined
      : {
          scope: retentionKind === 'otherScope' ? scopeOf(`scope-other-${randomUUID()}`) : scope,
          ledger: terminalLedger,
          ...(retentionKind === 'withoutProcesses' ? {} : { processes: processLedger }),
          released: released.signal,
        }
  let readings = 0
  const commands = createHostCommands({
    ledger,
    provider: 'host-files',
    scope,
    tenant,
    settings: { ...commandDefaults, stopBoundMs, startBoundMs: 3_000, ...options.settings },
    prerequisites: {
      facts: () => 'satisfied',
      ready: async () =>
        ++readings === 1 || options.laterPrerequisites === undefined
          ? { kind: 'satisfied', tools }
          : options.laterPrerequisites(),
    },
    retention,
    retained:
      options.retained === 'none'
        ? undefined
        : options.retained === undefined
          ? index
          : options.retained(index),
    unavailable: () => undefined,
  })
  const logLines = async (name: string) =>
    (await readFile(join(fake, name), 'utf8').catch(() => '')).split('\n').filter(Boolean)
  const start = () =>
    commands.facility.start({
      requestId: 'start-1',
      access: { principal: 'subject-a', tenant },
      origin: originRef('call-1'),
      binding: { kind: 'host_machine' },
      executable: '/bin/sh',
      args: ['-c', 'true'],
      cwd: '/tmp',
      env: {},
      outputMode: 'separate',
    })
  return {
    commands,
    start,
    index,
    scope,
    own,
    processes,
    released,
    processesClosed,
    indexStops,
    /** Kills issued through the stand-in `systemctl`, by the acquisition or the index. */
    kills: async () => (await logLines('systemctl.log')).filter(l => l.includes(' kill ')).length,
    /** The control commands the gate received after the request, as `<unit> <command>`. */
    controls: async () => (await logLines('control.log')).map(l => l.split(' ')[1]),
    unitOf: async () => (await readdir(fake)).find(name => name.endsWith('.scope.pid')),
    hold: (unit: string) => writeFile(join(fake, `${unit}.hold`), ''),
    unhold: (unit: string) => rm(join(fake, `${unit}.hold`), { force: true }),
    list: () => index.list(scope, tenant),
    tools,
    /** The retention listing of the facade; the test fails when the facade has none. */
    listing: () => {
      const retention = commands.facility.retention
      if (retention === undefined) throw new Error('expected a retention listing')
      return retention.list({
        requestId: 'list-1',
        access: { principal: 'subject-a', tenant },
        origin: originRef('call-2'),
        binding: { kind: 'host_machine' },
      })
    },
  }
}

type Fixture = Awaited<ReturnType<typeof setup>>

/** Starts the command; the start must answer `done`. The output is drained so it never fills. */
async function started(f: Fixture) {
  const answer = await within(f.start(), 'the start')
  if (answer.kind !== 'done')
    throw new Error(`expected a started process: ${JSON.stringify(answer)}`)
  const handle: ProcessHandle = answer.value
  void (async () => {
    for await (const chunk of handle.output) void chunk
  })().catch(() => undefined)
  const unit = handle.process.id
  const key = unit.slice('omne-host-'.length, -'.scope'.length)
  return { handle, unit, key }
}

/** The residue of the outcome, which must arrive within the bound and be `completed`. */
async function residueOf(handle: ProcessHandle) {
  const outcome: CommandOutcome = await within(handle.result, 'the outcome')
  if (outcome.kind !== 'completed')
    throw new Error(`expected completed: ${JSON.stringify(outcome)}`)
  return outcome.residue
}

/** Waits until `asked` settles; the outcome arriving first fails the test with its residue. */
function askedBefore<T>(asked: Promise<T>, handle: ProcessHandle, what: string): Promise<T> {
  return within(
    Promise.race([
      asked,
      handle.result.then(outcome => {
        throw new Error(`the outcome came before ${what}: ${JSON.stringify(outcome)}`)
      }),
    ]),
    what,
  )
}

/** The domain was stopped once, under this acquisition, and left its pending set. */
async function stoppedByAcquisition(f: Fixture, key: string) {
  await vi.waitFor(() => expect(f.own.stopped).toEqual([[key, 'confirmed']]))
  expect(await f.kills()).toBe(1)
  expect(f.processes.stopped).toEqual([])
  expect(f.commands.unconfirmed()).toEqual([])
}

describe('one-shot command disposition and custody', { skip: !onLinux }, () => {
  describe('the start refuses, and stops what it launched', () => {
    it('answers unavailable when the gate goes away before it is ready', async () => {
      const f = await setup({ gate: { onRequest: 'vanish' } })
      expect(await within(f.start(), 'the start')).toEqual({
        kind: 'rejected',
        requestId: 'start-1',
        reason: 'unavailable',
      })
      await vi.waitFor(() => expect(f.own.stopped).toHaveLength(1))
      expect(f.own.stopped[0]?.[1]).toBe('confirmed')
      expect(f.own.permits).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
    })

    it.each([
      ['closed', 'closed'],
      ['unavailable', 'unavailable'],
    ] as const)(
      'answers %s when the permit answers it, and never sends GO',
      async (permit, reason) => {
        const f = await setup({ permit: async () => permit })
        expect(await within(f.start(), 'the start')).toEqual({
          kind: 'rejected',
          requestId: 'start-1',
          reason,
        })
        const key = f.own.permits[0] ?? ''
        await stoppedByAcquisition(f, key)
        expect(await f.controls()).toEqual([])
      },
    )

    it('answers unavailable when the permit throws', async () => {
      const f = await setup({ permit: () => Promise.reject(new Error('down')) })
      expect(await within(f.start(), 'the start')).toMatchObject({
        kind: 'rejected',
        reason: 'unavailable',
      })
      await stoppedByAcquisition(f, f.own.permits[0] ?? '')
      expect(await f.controls()).toEqual([])
    })

    it('answers closed when the facade was sealed while the permit was asked, whatever the permit said', async () => {
      for (const answer of ['confirmed', 'unavailable'] as const) {
        const permit = controlled<Permit>()
        const f = await setup({ permit: permit.call })
        const starting = f.start()
        const key = await within(permit.asked, 'the permit')
        f.commands.seal()
        permit.answer(answer)
        expect(await within(starting, 'the start')).toEqual({
          kind: 'rejected',
          requestId: 'start-1',
          reason: 'closed',
        })
        await stoppedByAcquisition(f, key)
        expect(await f.controls()).toEqual([])
      }
    })

    it('answers unavailable when the image does not start after GO', async () => {
      const f = await setup({ gate: { onGo: 'spawnFailed' } })
      expect(await within(f.start(), 'the start')).toEqual({
        kind: 'rejected',
        requestId: 'start-1',
        reason: 'unavailable',
      })
      await stoppedByAcquisition(f, f.own.permits[0] ?? '')
      expect(await f.controls()).toEqual(['go'])
    })

    it('answers unknown when the gate is not ready within the start bound, and keeps the resource for the release', async () => {
      const f = await setup({ gate: { onRequest: 'silent' }, settings: { startBoundMs: 200 } })
      expect(await within(f.start(), 'the start')).toEqual({
        kind: 'unknown',
        requestId: 'start-1',
      })
      expect(f.own.permits).toEqual([])
      expect(await f.kills()).toBe(0)
      const [pending] = f.commands.unconfirmed()
      expect(pending?.provider).toBe('host-files')
      expect(await within(f.commands.stopAll(), 'the release')).toEqual([])
      await stoppedByAcquisition(f, pending?.key ?? '')
      expect(await f.controls()).toEqual([])
    })

    it('answers unknown when the command does not start within the bound after GO', async () => {
      const f = await setup({ gate: { onGo: 'silent' }, settings: { startBoundMs: 200 } })
      expect(await within(f.start(), 'the start')).toEqual({
        kind: 'unknown',
        requestId: 'start-1',
      })
      expect(await f.controls()).toEqual(['go'])
      expect(await f.kills()).toBe(0)
      expect(f.commands.unconfirmed()).toHaveLength(1)
    })
  })

  describe('a gate that ends without an exit frame', () => {
    it.each([
      ['goes away', 'vanish'],
      ['writes a line that is not a frame', 'garbage'],
    ] as const)(
      'that %s fails the outcome as effectUnknown and is stopped under the acquisition',
      async (_, afterStarted) => {
        const f = await setup({ gate: { afterStarted } })
        const { handle, key } = await started(f)
        const outcome = await within(handle.result, 'the outcome')
        expect(outcome).toMatchObject({
          kind: 'failed',
          reason: 'effectUnknown',
          output: { mode: 'separate' },
        })
        expect(outcome).not.toHaveProperty('residue')
        await stoppedByAcquisition(f, key)
        expect(f.processes.plans).toEqual([])
      },
    )
  })

  describe('the reason a domain is stopped instead of handed over', () => {
    it('reports none for a domain the gate read as empty, without waiting for an index that never loads', async () => {
      const f = await setup({
        gate: { exit: { code: 0, signal: null, members: 0 } },
        settings: { startBoundMs: 4_000 },
        retained: index => ({ ...index, ready: () => new Promise<boolean>(() => undefined) }),
      })
      const { handle, key } = await started(f)
      const begun = performance.now()
      expect(await residueOf(handle)).toEqual({ kind: 'none' })
      expect(performance.now() - begun).toBeLessThan(2_000)
      await stoppedByAcquisition(f, key)
      expect(f.processes.plans).toEqual([])
    })

    it.each([
      ['the policy is stop', { settings: { residuePolicy: 'stop' } }, 'policy', true],
      ['there is no retention binding', { retention: 'none' }, 'unbound', false],
      ['the binding has no process ledger', { retention: 'withoutProcesses' }, 'unbound', false],
      ['the provider has no retained-process index', { retained: 'none' }, 'policy', false],
      [
        'the retention scope is not the requester scope',
        { retention: 'otherScope' },
        'policy',
        false,
      ],
    ] as const)('reports %s as stopping with its reason', async (_, options, reason, listing) => {
      const f = await setup(options)
      expect(f.commands.facility.retention !== undefined).toBe(listing)
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason })
      await stoppedByAcquisition(f, key)
      expect(f.processes.plans).toEqual([])
      expect(f.processes.adopts).toEqual([])
      expect(await f.list()).toEqual([])
    })

    it('reports policy when the index markers cannot be read completely', async () => {
      const f = await setup({ retained: index => ({ ...index, ready: async () => false }) })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'policy' })
      await stoppedByAcquisition(f, key)
      expect(f.processes.plans).toEqual([])
    })

    it.each([
      ['its release signal', (f: Fixture) => f.released.abort()],
      ['the close signal of its process ledger', (f: Fixture) => f.processesClosed.abort()],
    ])(
      'reports closed, without a plan, when the retention scope closed by %s before the exit',
      async (_, close) => {
        const f = await setup({ gate: { exitAfterMs: 300 } })
        const { handle, key } = await started(f)
        close(f)
        expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
        expect(f.processes.plans).toEqual([])
        expect(f.processes.adopts).toEqual([])
        await stoppedByAcquisition(f, key)
      },
    )

    it('reports closed, without a plan, when the acquisition was released before the disposition', async () => {
      const ready = deferred<PrerequisiteReading>()
      const f = await setup({
        gate: { exitAfterMs: 300 },
        laterPrerequisites: () => ready.promise,
      })
      const { handle, key } = await started(f)
      // The release marks the domain released at once, then waits for the prerequisites; the
      // command exits meanwhile.
      const releasing = f.commands.stopAll()
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(f.processes.plans).toEqual([])
      expect(f.processes.adopts).toEqual([])
      ready.resolve({ kind: 'satisfied', tools: f.tools })
      expect(await within(releasing, 'the release')).toEqual([])
      await stoppedByAcquisition(f, key)
    })

    it('reports capacity when the retention scope is full, and takes no plan', async () => {
      const f = await setup({ capacity: 1 })
      const other = f.index.reserve(f.scope, tenant, 'another')
      expect(typeof other).toBe('object')
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'capacity' })
      expect(f.processes.plans).toEqual([])
      await stoppedByAcquisition(f, key)
      if (typeof other !== 'string') other.abort()
    })

    it.each([
      ['closed', 'closed'],
      ['conflict', 'unbound'],
      ['unavailable', 'unbound'],
    ] as const)(
      'reports %s from the plan as %s, gives the place back and never adopts',
      async (plan, reason) => {
        const f = await setup({ capacity: 1, plan: async () => plan })
        const { handle, key } = await started(f)
        expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason })
        expect(f.processes.plans.map(resource => resource.key)).toEqual([key])
        expect(f.processes.adopts).toEqual([])
        await stoppedByAcquisition(f, key)
        const place = f.index.reserve(f.scope, tenant, 'another')
        expect(typeof place).toBe('object')
        if (typeof place !== 'string') place.abort()
      },
    )

    it('reports unbound when the plan throws', async () => {
      const f = await setup({ plan: () => Promise.reject(new Error('down')) })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'unbound' })
      await stoppedByAcquisition(f, key)
    })

    it('reports closed when the handle stop arrives while the plan is asked; adopt is never asked', async () => {
      const plan = controlled<Plan>()
      const f = await setup({ plan: plan.call })
      const { handle, key } = await started(f)
      await askedBefore(plan.asked, handle, 'the plan')
      const stopping = handle.stop('forced')
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      plan.answer('recorded')
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(await within(stopping, 'the stop')).toBe('confirmed')
      expect(f.processes.adopts).toEqual([])
      await stoppedByAcquisition(f, key)
      expect(await f.list()).toEqual([])
    })

    it('reports closed when the release arrives while the plan is asked, and stops the domain once', async () => {
      const plan = controlled<Plan>()
      const f = await setup({ plan: plan.call })
      const { handle, key } = await started(f)
      await askedBefore(plan.asked, handle, 'the plan')
      const releasing = f.commands.stopAll()
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      plan.answer('recorded')
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(await within(releasing, 'the release')).toEqual([])
      expect(f.processes.adopts).toEqual([])
      await stoppedByAcquisition(f, key)
    })

    it('reports closed when adopt answers closed, and gives the place back', async () => {
      const f = await setup({ capacity: 1, adopt: async () => 'closed' })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(f.processes.adopts).toEqual([key])
      await stoppedByAcquisition(f, key)
      expect(await f.list()).toEqual([])
      const place = f.index.reserve(f.scope, tenant, 'another')
      expect(typeof place).toBe('object')
      if (typeof place !== 'string') place.abort()
    })
  })

  describe('the handover', () => {
    it('hands a domain with leftovers to the retention scope: plan, adopt, retain, listed as running', async () => {
      const f = await setup({ gate: { exit: { code: 0, signal: null, members: 2 } } })
      const { handle, key } = await started(f)
      const residue = await residueOf(handle)
      expect(residue).toMatchObject({ kind: 'retained', process: { id: key }, processes: 2 })
      // The retention ledger plans the very resource the acquisition ledger planned at the start.
      expect(f.own.plans.map(resource => resource.key)).toEqual([key])
      expect(f.processes.plans).toEqual(f.own.plans)
      expect(f.processes.adopts).toEqual([key])
      await vi.waitFor(async () => expect(await f.controls()).toEqual(['go', 'retain']))
      expect(await f.list()).toMatchObject([
        { process: residue?.kind === 'retained' ? residue.process : {}, state: 'running' },
      ])
      expect(f.commands.unconfirmed()).toEqual([])
      expect(await within(f.commands.stopAll(), 'the release')).toEqual([])
      expect(await f.kills()).toBe(0)
      expect(f.own.stopped).toEqual([])
      expect(f.processes.stopped).toEqual([])
    })

    it('reports an unread member count as unknown processes, and still hands the domain over', async () => {
      const f = await setup({ gate: { exit: { code: 0, signal: null } } })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toMatchObject({
        kind: 'retained',
        process: { id: key },
        processes: 'unknown',
      })
      expect(await f.kills()).toBe(0)
    })

    it.each([
      ['its release signal', (f: Fixture) => f.released.abort()],
      ['the close signal of its process ledger', (f: Fixture) => f.processesClosed.abort()],
    ])(
      'stops a retained domain when the retention scope closes by %s, recorded on the retention ledger',
      async (_, close) => {
        const f = await setup()
        const { handle, key } = await started(f)
        expect(await residueOf(handle)).toMatchObject({ kind: 'retained' })
        close(f)
        await vi.waitFor(() => expect(f.processes.stopped).toEqual([[key, 'confirmed']]))
        expect(await f.kills()).toBe(1)
        expect(f.own.stopped).toEqual([])
        await vi.waitFor(async () => expect(await f.list()).toEqual([]))
      },
    )

    it('reports unknown when the index cannot take the committed domain', async () => {
      const f = await setup({
        retained: index => ({ ...index, commit: () => Promise.reject(new Error('disk')) }),
      })
      const { handle } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'unknown' })
    })
  })

  describe('a commit whose result is unread', () => {
    it('is asked again by a forced stop; a closed answer stops the domain under the acquisition', async () => {
      let asked = 0
      const f = await setup({ adopt: async () => (++asked === 1 ? 'unavailable' : 'closed') })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'unknown' })
      expect(f.commands.unconfirmed().map(resource => resource.key)).toEqual([key])
      expect(await within(handle.stop('forced'), 'the stop')).toBe('confirmed')
      expect(f.processes.adopts).toEqual([key, key])
      // The resolution stops the domain, and the handle's own stop then finds it this
      // acquisition's and stops it again: the SPEC's expected repeat after a confirmed stop.
      expect(f.own.stopped.length).toBeGreaterThan(0)
      expect(new Set(f.own.stopped.map(stop => stop.join(' ')))).toEqual(
        new Set([`${key} confirmed`]),
      )
      expect(f.processes.stopped).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
    })

    it('is asked again by a release; a closed answer stops the domain under the acquisition', async () => {
      let asked = 0
      const f = await setup({ adopt: async () => (++asked === 1 ? 'unavailable' : 'closed') })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'unknown' })
      expect(await within(f.commands.stopAll(), 'the release')).toEqual([])
      expect(f.processes.adopts).toEqual([key, key])
      await stoppedByAcquisition(f, key)
    })

    it('is asked again by a graceful stop; a confirmed answer hands it over and the stop does nothing', async () => {
      let asked = 0
      const f = await setup({
        gate: { onTerm: 'exit' },
        adopt: async () => (++asked === 1 ? 'unavailable' : 'confirmed'),
      })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toEqual({ kind: 'unknown' })
      expect(await within(handle.stop('graceful'), 'the stop')).toBe('unconfirmed')
      expect(f.processes.adopts).toEqual([key, key])
      await vi.waitFor(async () => expect(await f.controls()).toEqual(['go', 'retain']))
      expect(await f.list()).toMatchObject([{ process: { id: key }, state: 'running' }])
      expect(await f.kills()).toBe(0)
      expect(f.own.stopped).toEqual([])
      expect(f.commands.unconfirmed()).toEqual([])
    })

    it('is handed over as stopping when a stop was issued before the answer was lost', async () => {
      const adopt = controlled<Adopt>()
      let asked = 0
      const f = await setup({
        adopt: key => (++asked === 1 ? adopt.call(key) : Promise.resolve('confirmed')),
      })
      const { handle, key } = await started(f)
      await askedBefore(adopt.asked, handle, 'the adopt')
      void handle.stop('forced')
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      adopt.answer('unavailable')
      expect(await residueOf(handle)).toEqual({ kind: 'unknown' })
      expect(await within(f.commands.stopAll(), 'the release')).toEqual([])
      expect(f.processes.adopts).toEqual([key, key])
      // The commit took effect for a domain this acquisition had stopped: the index stops and records it.
      await vi.waitFor(() => expect(f.processes.stopped).toEqual([[key, 'confirmed']]))
      expect(f.own.stopped).toEqual([])
      expect(await f.controls()).toEqual(['go'])
      await vi.waitFor(async () => expect(await f.list()).toEqual([]))
    })
  })

  describe('the handle stop', () => {
    it('forced: kills the unit at once, records the confirmed stop, and the outcome fails', async () => {
      const f = await setup({ gate: { afterStarted: 'stay', onTerm: 'exit' } })
      const { handle, key } = await started(f)
      expect(await within(handle.stop('forced'), 'the stop')).toBe('confirmed')
      expect(await f.controls()).toEqual(['go'])
      await stoppedByAcquisition(f, key)
      expect(await within(handle.result, 'the outcome')).toMatchObject({
        kind: 'failed',
        reason: 'effectUnknown',
      })
    })

    it('graceful: sends the term, and once the command exited stops the unit and records it once', async () => {
      const f = await setup({ gate: { afterStarted: 'stay', onTerm: 'exit' }, retention: 'none' })
      const { handle, key } = await started(f)
      expect(await within(handle.stop('graceful'), 'the stop')).toBe('confirmed')
      expect(await f.controls()).toEqual(['go', 'term'])
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'unbound' })
      await stoppedByAcquisition(f, key)
    })

    it('graceful: answers unconfirmed when the command outlives the grace, records that, and kills nothing', async () => {
      const f = await setup({ gate: { afterStarted: 'stay' }, settings: { graceMs: 100 } })
      const { handle, key } = await started(f)
      expect(await within(handle.stop('graceful'), 'the stop')).toBe('unconfirmed')
      expect(await f.controls()).toEqual(['go', 'term'])
      expect(f.own.stopped).toEqual([[key, 'unconfirmed']])
      expect(await f.kills()).toBe(0)
      expect(f.commands.unconfirmed().map(resource => resource.key)).toEqual([key])
    })

    it('two forced stops at once run one stop sequence and record it once', async () => {
      const f = await setup({ gate: { afterStarted: 'stay' } })
      const { handle, key } = await started(f)
      const answers = await within(
        Promise.all([handle.stop('forced'), handle.stop('forced')]),
        'the stops',
      )
      expect(answers).toEqual(['confirmed', 'confirmed'])
      await stoppedByAcquisition(f, key)
    })

    it('answers unconfirmed to a stop after the handover, even while the stop issued before it is in flight', async () => {
      const adopt = controlled<Adopt>()
      const f = await setup({ adopt: adopt.call, settings: { stopBoundMs: 5_000 } })
      const { handle, unit, key } = await started(f)
      await askedBefore(adopt.asked, handle, 'the adopt')
      await f.hold(unit)
      const first = handle.stop('forced')
      await vi.waitFor(async () => expect(await f.kills()).toBe(1))
      adopt.answer('confirmed')
      expect(await residueOf(handle)).toEqual({ kind: 'stopping', reason: 'closed' })
      expect(await within(handle.stop('forced'), 'the second stop')).toBe('unconfirmed')
      expect(await f.list()).toMatchObject([{ process: { id: key }, state: 'stopping' }])
      await f.unhold(unit)
      expect(await within(first, 'the first stop', 5_000)).toBe('confirmed')
      await vi.waitFor(() => expect(f.processes.stopped).toEqual([[key, 'confirmed']]), {
        timeout: 5_000,
      })
      expect(await f.kills()).toBe(1)
      expect(f.own.stopped).toEqual([])
    })
  })

  describe('the release', () => {
    it('stops a running process of the acquisition, and its outcome fails', async () => {
      const f = await setup({ gate: { afterStarted: 'stay' } })
      const { handle, key } = await started(f)
      expect(await within(f.commands.stopAll(), 'the release')).toEqual([])
      await stoppedByAcquisition(f, key)
      expect(await within(handle.result, 'the outcome')).toMatchObject({ kind: 'failed' })
      expect(await within(f.commands.stopAll(), 'a second release')).toEqual([])
      expect(await f.kills()).toBe(1)
    })

    it('leaves every process pending, and stops none, when the prerequisites are not satisfied now', async () => {
      const f = await setup({
        gate: { afterStarted: 'stay' },
        laterPrerequisites: async () => ({ kind: 'unsatisfied', missing: ['user-manager'] }),
      })
      const { key } = await started(f)
      const left = await within(f.commands.stopAll(), 'the release')
      expect(left.map(resource => resource.key)).toEqual([key])
      expect(await f.kills()).toBe(0)
      expect(f.own.stopped).toEqual([])
      expect(f.commands.unconfirmed().map(resource => resource.key)).toEqual([key])
    })
  })

  describe('the retention listing', () => {
    it('lists the retained processes of the scope, and nothing before the handover', async () => {
      const f = await setup()
      expect(await within(f.listing(), 'the listing')).toEqual({
        kind: 'done',
        requestId: 'list-1',
        value: [],
      })
      const { handle, key } = await started(f)
      expect(await residueOf(handle)).toMatchObject({ kind: 'retained' })
      expect(await within(f.listing(), 'the listing')).toMatchObject({
        kind: 'done',
        requestId: 'list-1',
        value: [{ process: { id: key }, state: 'running' }],
      })
    })

    it('answers closed once the facade is sealed', async () => {
      const f = await setup()
      f.commands.seal()
      expect(await within(f.listing(), 'the listing')).toEqual({
        kind: 'rejected',
        requestId: 'list-1',
        reason: 'closed',
      })
    })

    it('answers unavailable, not an empty list, when the index cannot be read', async () => {
      const f = await setup({ retained: index => ({ ...index, list: async () => 'unavailable' }) })
      expect(await within(f.listing(), 'the listing')).toEqual({
        kind: 'rejected',
        requestId: 'list-1',
        reason: 'unavailable',
      })
    })
  })
})
