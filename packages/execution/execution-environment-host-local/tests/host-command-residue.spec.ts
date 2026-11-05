/** @module-tag slow */
// Slow: every test starts real processes in real systemd user scopes and waits for them.
// What a one-shot command leaves behind, on Linux through the real gate and the real supervisor:
// the handover of the whole scope to the retention scope (C1), the listing and the stop on closure
// (C2), the capacity that never evicts (C3), the refusal after closure (C4), the recovery of a
// retained process by a fresh provider in a fresh domain (C6), the isolation of the listing (C14),
// self-settlement, and the reasons a domain is stopped instead. Only the two ledgers are test
// recorders: they are the integrator's ports. The tests run only on Linux with
// `OMNE_HOST_COMMAND_LINUX=1`; elsewhere they are skipped, and a skip is not a pass.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandFacility,
  type CommandOutcome,
  type EnvironmentBinding,
  type EnvironmentLease,
  type EnvironmentProvider,
  type ManagedResource,
  type OriginRef,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesDomain,
  createHostFilesProvider,
  type HostFilesProviderOptions,
} from '@omne-harness/execution-environment-host-local'

const run = promisify(execFile)
const enabled = process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'
const decoder = new TextDecoder()

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const otherTenant = tenantOf('acc_zzzzzzzzzzzzzzzzzzzzzzzzzz')
const host: EnvironmentBinding = { kind: 'host_machine' }

type ScopeRef = ProviderAcquireInput['scope']
function scopeOf(text: string): ScopeRef {
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}
const freshScope = () => scopeOf(`scope-residue-${randomUUID()}`)

type Stop = [string, 'confirmed' | 'unconfirmed']

/** The acquisition's own ledger, recording. */
function acquisitionLedger() {
  const stopped: Stop[] = []
  const plans: ManagedResource[] = []
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped, plans }
}

/** The retention scope's process ledger view, recording; `adopt` answers what the test sets. */
function processLedger() {
  const stopped: Stop[] = []
  const plans: ManagedResource[] = []
  const adopts: string[] = []
  const closed = new AbortController()
  const answers = { adopt: 'confirmed' as Awaited<ReturnType<ResourceLedger['adopt']>> }
  const ledger: RetainedProcessLedger = {
    closed: closed.signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    adopt: async key => {
      adopts.push(key)
      return answers.adopt
    },
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped, plans, adopts, closed, answers }
}

const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const providers: EnvironmentProvider[] = []
const handles: ProcessHandle[] = []
const units = new Set<string>()
const roots: string[] = []
const servers: number[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop('forced')))
  for (const unit of units) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

afterAll(async () => {
  if (!enabled) return
  const left: string[] = []
  for (const unit of units) if ((await unitState(unit)).loadState !== 'not-found') left.push(unit)
  for (const unit of left) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  expect(left).toEqual([])
  servers.length = 0
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

async function unitGone(unit: string): Promise<void> {
  await vi.waitFor(
    async () => {
      const state = await unitState(unit)
      expect(state.loadState === 'not-found' || state.activeState === 'inactive').toBe(true)
    },
    { timeout: 15_000 },
  )
}

async function workDirectory(prefix = 'omne-host-residue-'): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  roots.push(root)
  return root
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** True when a TCP connection to the port succeeds. */
function reachable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

async function serving(port: number): Promise<void> {
  await vi.waitFor(async () => expect(await reachable(port)).toBe(true), { timeout: 15_000 })
}

/** A server that stays after the shell exits. */
const serverScript = (port: number) =>
  `python3 -m http.server ${port} --bind 127.0.0.1 >/dev/null 2>&1 & echo started`

function hostProvider(
  stateDirectory: string | undefined,
  options: Partial<HostFilesProviderOptions> = {},
) {
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    ...(stateDirectory === undefined ? {} : { stateDirectory }),
    command: { retainedPollMs: 200, ...options.command },
    ...options,
  })
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

type Bound = {
  scope: ScopeRef
  retentionScope?: ScopeRef
  processes?: RetainedProcessLedger
  released: AbortSignal
  tenant?: TenantId
  origin?: OriginRef
}

async function leaseOf(
  provider: EnvironmentProvider,
  ledger: ResourceLedger,
  bound: Bound,
): Promise<EnvironmentLease> {
  const answer = await provider.acquire({
    acquisition: acquisitionRef(`acq-${randomUUID()}`),
    origin: bound.origin ?? originRef('call-1'),
    scope: bound.scope,
    tenant: bound.tenant ?? tenant,
    ledger,
    placement: placementFor(provider),
    retention: {
      scope: bound.retentionScope ?? bound.scope,
      ledger: terminalLedger,
      ...(bound.processes === undefined ? {} : { processes: bound.processes }),
      released: bound.released,
    },
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
    access: { principal: 'subject-a', tenant },
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

async function finished(handle: ProcessHandle): Promise<CommandOutcome> {
  const chunks: string[] = []
  for await (const chunk of handle.output) chunks.push(decoder.decode(chunk.data))
  return handle.result
}

function residueOf(outcome: CommandOutcome) {
  if (outcome.kind !== 'completed')
    throw new Error(`expected completed: ${JSON.stringify(outcome)}`)
  return outcome.residue
}

function listRequest(who = tenant) {
  return {
    requestId: `list-${randomUUID()}`,
    access: { principal: 'subject-a', tenant: who },
    origin: originRef('call-1'),
    binding: host,
  }
}

async function listed(command: CommandFacility<unknown>, who = tenant) {
  const retention = command.retention
  if (retention === undefined) throw new Error('expected the retention extension')
  const answer = await retention.list(listRequest(who))
  if (answer.kind !== 'done') throw new Error(`expected a listing: ${JSON.stringify(answer)}`)
  return answer.value
}

/** A retaining acquisition with its ledgers, its scope and the state directory of its provider. */
async function retaining(options: Partial<HostFilesProviderOptions> = {}, stateDirectory?: string) {
  const state = stateDirectory ?? (await workDirectory('omne-host-residue-state-'))
  const provider = hostProvider(state, options)
  const own = acquisitionLedger()
  const processes = processLedger()
  const released = new AbortController()
  const scope = freshScope()
  const lease = await leaseOf(provider, own.ledger, {
    scope,
    processes: processes.ledger,
    released: released.signal,
  })
  const command = commandOf(lease)
  const cwd = await workDirectory()
  return { provider, state, own, processes, released, scope, lease, command, cwd }
}

async function retainServer(f: Awaited<ReturnType<typeof retaining>>) {
  const port = await freePort()
  const handle = await started(f.command, request(f.cwd, serverScript(port)))
  const outcome = await finished(handle)
  return { port, handle, outcome, residue: residueOf(outcome) }
}

describe('what a one-shot command leaves behind, on Linux', { skip: !enabled }, () => {
  it('C1: hands the whole scope over, the server outlives the call and the release of the acquisition', async () => {
    const f = await retaining()
    const { port, handle, residue } = await retainServer(f)
    expect(residue).toEqual({
      kind: 'retained',
      process: { id: f.own.plans[0]?.key, generation: expect.any(String) },
      processes: expect.any(Number),
    })
    if (residue?.kind !== 'retained') throw new Error('unreachable')
    expect(residue.processes).toBeGreaterThanOrEqual(1)
    await serving(port)
    expect(f.processes.plans.map(plan => plan.key)).toEqual([f.own.plans[0]?.key])
    expect(f.processes.adopts).toEqual([f.own.plans[0]?.key])
    expect(await f.lease.release()).toEqual({ kind: 'released' })
    expect(await reachable(port)).toBe(true)
    expect(await unitState(handle.process.id)).toMatchObject({ activeState: 'active' })
    expect(f.own.stopped).toEqual([])
    f.released.abort()
    await unitGone(handle.process.id)
  })

  it('C2: lists the retained process; closing the scope stops its unit, confirms it and records it', async () => {
    const f = await retaining()
    const { port, handle, residue } = await retainServer(f)
    if (residue?.kind !== 'retained') throw new Error('expected retained')
    await serving(port)
    const entries = await listed(f.command)
    expect(entries).toEqual([
      {
        process: residue.process,
        origin: 'call-1',
        handedOverAtMs: expect.any(Number),
        state: 'running',
        processes: expect.any(Number),
      },
    ])
    f.released.abort()
    await vi.waitFor(
      () => expect(f.processes.stopped).toEqual([[residue.process.id, 'confirmed']]),
      { timeout: 15_000 },
    )
    const state = await unitState(handle.process.id)
    expect(state.loadState === 'not-found' || state.activeState === 'inactive').toBe(true)
    expect(await reachable(port)).toBe(false)
    expect(await listed(f.command)).toEqual([])
    expect(await readdir(join(f.state, 'retained-processes'))).toEqual([])
  })

  it('C3: a full retention scope stops the newcomer for capacity and keeps the retained one', async () => {
    const f = await retaining({ command: { retainedPerScope: 1 } })
    const first = await retainServer(f)
    expect(first.residue).toMatchObject({ kind: 'retained' })
    await serving(first.port)
    const second = await retainServer(f)
    expect(second.residue).toEqual({ kind: 'stopping', reason: 'capacity' })
    await unitGone(second.handle.process.id)
    expect(await reachable(first.port)).toBe(true)
    expect(await unitState(first.handle.process.id)).toMatchObject({ activeState: 'active' })
    expect(f.processes.stopped).toEqual([])
    const secondKey = second.handle.process.id.slice('omne-host-'.length, -'.scope'.length)
    await vi.waitFor(() => expect(f.own.stopped).toContainEqual([secondKey, 'confirmed']), {
      timeout: 15_000,
    })
    f.released.abort()
    await unitGone(first.handle.process.id)
  })

  it('C4: after the scope closed, a new leftover is stopped for closure and the stop is confirmed', async () => {
    const f = await retaining()
    f.released.abort()
    const { handle, residue } = await retainServer(f)
    expect(residue).toEqual({ kind: 'stopping', reason: 'closed' })
    const key = handle.process.id.slice('omne-host-'.length, -'.scope'.length)
    await vi.waitFor(() => expect(f.own.stopped).toEqual([[key, 'confirmed']]), {
      timeout: 15_000,
    })
    await unitGone(handle.process.id)
    expect(f.processes.plans).toEqual([])
  })

  it('C6: a fresh provider in a fresh domain finds the retained process by its marker, and closing stops it', async () => {
    const f = await retaining()
    const { port, handle, residue } = await retainServer(f)
    if (residue?.kind !== 'retained') throw new Error('expected retained')
    await serving(port)
    // The old instance is neither retired nor asked to stop anything: a crash leaves it behind.
    const successor = hostProvider(f.state)
    const processes = processLedger()
    const released = new AbortController()
    const lease = await leaseOf(successor, acquisitionLedger().ledger, {
      scope: f.scope,
      processes: processes.ledger,
      released: released.signal,
    })
    const entries = await listed(commandOf(lease))
    expect(entries).toEqual([
      {
        process: residue.process,
        origin: 'call-1',
        handedOverAtMs: expect.any(Number),
        state: 'running',
        processes: expect.any(Number),
      },
    ])
    if (entries[0]?.processes === 'unknown') throw new Error('expected a readable count')
    expect(entries[0]?.processes).toBeGreaterThanOrEqual(1)
    const resources = await successor.listRecoveryResources?.(f.scope)
    expect(resources).toMatchObject({ kind: 'listed' })
    if (resources?.kind !== 'listed') throw new Error('unreachable')
    expect(resources.resources.map(resource => resource.key)).toEqual([residue.process.id])
    released.abort()
    await vi.waitFor(() => expect(processes.stopped).toEqual([[residue.process.id, 'confirmed']]), {
      timeout: 15_000,
    })
    await unitGone(handle.process.id)
    expect(await reachable(port)).toBe(false)
    expect(await listed(commandOf(lease))).toEqual([])
    expect(await readdir(join(f.state, 'retained-processes'))).toEqual([])
  })

  it('C14: another retention scope and another tenant do not see the retained process', async () => {
    const f = await retaining()
    const { residue } = await retainServer(f)
    if (residue?.kind !== 'retained') throw new Error('expected retained')
    const otherScope = freshScope()
    const other = await leaseOf(f.provider, acquisitionLedger().ledger, {
      scope: otherScope,
      processes: processLedger().ledger,
      released: new AbortController().signal,
    })
    expect(await listed(commandOf(other))).toEqual([])
    const foreign = await leaseOf(f.provider, acquisitionLedger().ledger, {
      scope: f.scope,
      processes: processLedger().ledger,
      released: new AbortController().signal,
      tenant: otherTenant,
    })
    expect(await listed(commandOf(foreign), otherTenant)).toEqual([])
    expect(await listed(f.command)).toHaveLength(1)
    f.released.abort()
    await vi.waitFor(() => expect(f.processes.stopped).toHaveLength(1), { timeout: 15_000 })
  })

  it('settles by itself once every retained process exited: stopped, recorded, marker gone, slot free', async () => {
    const f = await retaining({ command: { retainedPerScope: 1 } })
    const handle = await started(f.command, request(f.cwd, 'sleep 1 & echo started'))
    const residue = residueOf(await finished(handle))
    if (residue?.kind !== 'retained')
      throw new Error(`expected retained: ${JSON.stringify(residue)}`)
    expect(await readdir(join(f.state, 'retained-processes'))).toEqual([
      `${residue.process.id}.json`,
    ])
    await vi.waitFor(
      () => expect(f.processes.stopped).toEqual([[residue.process.id, 'confirmed']]),
      { timeout: 15_000 },
    )
    await unitGone(handle.process.id)
    expect(await readdir(join(f.state, 'retained-processes'))).toEqual([])
    expect(await listed(f.command)).toEqual([])
    // The slot is free again: the next leftover is retained, not stopped for capacity.
    const next = await retainServer(f)
    expect(next.residue).toMatchObject({ kind: 'retained' })
    f.released.abort()
    await unitGone(next.handle.process.id)
  })

  it('stops with the reason that fails: unbound, policy, another retention scope, no state directory; none when empty', async () => {
    const cwd = await workDirectory()
    const state = await workDirectory('omne-host-residue-state-')
    const leftover = 'sleep 300 & echo started'
    const stoppingFor = async (lease: EnvironmentLease, script = leftover) => {
      const handle = await started(commandOf(lease), request(cwd, script))
      const residue = residueOf(await finished(handle))
      await unitGone(handle.process.id)
      return residue
    }
    const unbound = await leaseOf(hostProvider(state), acquisitionLedger().ledger, {
      scope: freshScope(),
      released: new AbortController().signal,
    })
    expect(await stoppingFor(unbound)).toEqual({ kind: 'stopping', reason: 'unbound' })
    expect(commandOf(unbound).retention).toBeUndefined()

    const policy = await leaseOf(
      hostProvider(state, { command: { residuePolicy: 'stop' } }),
      acquisitionLedger().ledger,
      {
        scope: freshScope(),
        processes: processLedger().ledger,
        released: new AbortController().signal,
      },
    )
    expect(await stoppingFor(policy)).toEqual({ kind: 'stopping', reason: 'policy' })

    const elsewhere = await leaseOf(hostProvider(state), acquisitionLedger().ledger, {
      scope: freshScope(),
      retentionScope: freshScope(),
      processes: processLedger().ledger,
      released: new AbortController().signal,
    })
    expect(await stoppingFor(elsewhere)).toEqual({ kind: 'stopping', reason: 'policy' })
    expect(commandOf(elsewhere).retention).toBeUndefined()

    const stateless = await leaseOf(hostProvider(undefined), acquisitionLedger().ledger, {
      scope: freshScope(),
      processes: processLedger().ledger,
      released: new AbortController().signal,
    })
    expect(await stoppingFor(stateless)).toEqual({ kind: 'stopping', reason: 'policy' })

    expect(await stoppingFor(unbound, 'echo done')).toEqual({ kind: 'none' })
  })
})
