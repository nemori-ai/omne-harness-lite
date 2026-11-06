/** @module-tag slow */
// Slow: the test starts a real process in a real systemd user scope and stops it through the real
// registry. What it proves: after a one-shot command left a process and the scope handed it over to
// the retention scope, `releaseScope` of the registry stops it, and reports done only after the stop
// is confirmed (the unit is gone when the call returns). The registry, the host provider, the
// supervisor and the gate are real; only the two ledgers, the two port services and the recovery
// authority are test stand-ins. The test runs only on Linux with `OMNE_HOST_COMMAND_LINUX=1`;
// elsewhere it is skipped, and a skip is not a pass.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  createRecoveryAccess,
  originRef,
  type Access,
  type EnvironmentBinding,
  type FacilityGuard,
  type ManagedResource,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionRecoveryAuthorityService,
  executionEnvironmentKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  commandFacilityPlugin,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { testPorts } from './ports.ts'

const run = promisify(execFile)
const enabled = process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'

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
const access: Access<unknown> = { principal: 'subject-a', tenant }
const host: EnvironmentBinding = { kind: 'host_machine' }
const allow: FacilityGuard<unknown> = { authorize: async () => 'authorized' }

type ScopeRef = Extract<EnvironmentBinding, { kind: 'session_sandbox' }>['scope']
function scopeOf(text: string): ScopeRef {
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

class Authority extends ExecutionRecoveryAuthorityService {
  async authorizeRecovery(): Promise<'authorized'> {
    return 'authorized'
  }
}

type Stop = [string, 'confirmed' | 'unconfirmed']

/** The acquisition's own ledger, recording the stops. */
function acquisitionLedger() {
  const stopped: Stop[] = []
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped }
}

/** The retention scope's process ledger view, recording the stops. */
function processLedger() {
  const stopped: Stop[] = []
  const plans: ManagedResource[] = []
  const ledger: RetainedProcessLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped, plans }
}

const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const disposers: (() => Promise<void>)[] = []
const units = new Set<string>()
const roots: string[] = []

afterEach(async () => {
  for (const unit of units) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  for (const dispose of disposers.splice(0).reverse()) await dispose().catch(() => undefined)
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

async function workDirectory(prefix: string): Promise<string> {
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

describe(
  'releaseScope of the registry over a retained process, on Linux',
  { skip: !enabled },
  () => {
    it('stops the retained process and reports done only once the stop is confirmed', async () => {
      const state = await workDirectory('omne-host-release-state-')
      const cwd = await workDirectory('omne-host-release-')
      const ctx = new Context()
      await testPorts(tenant).load(ctx)
      const registry = await ctx.plugin(ExecutionEnvironmentRegistry)
      disposers.push(() => registry.dispose())
      await ctx.plugin(Authority)
      await ctx.plugin(filesFacilityPlugin)
      await ctx.plugin(commandFacilityPlugin)
      const hostFiles = await ctx.plugin(createHostFilesPlugin(createHostFilesDomain()), {
        stateDirectory: state,
      })
      disposers.push(() => hostFiles.dispose())
      const service = ctx.get(executionEnvironmentKey)
      if (service === undefined) throw new Error('executionEnvironment is not provided')

      const scope = scopeOf(`scope-release-${randomUUID()}`)
      const placement = await service.resolvePlacement(access, {
        scope,
        requirement: {
          allowedBindings: [host],
          facilities: ['files', 'command'],
          isolation: [],
        },
      })
      if (placement.kind !== 'placement')
        throw new Error(`no placement: ${JSON.stringify(placement)}`)
      const own = acquisitionLedger()
      const processes = processLedger()
      const acquired = await service.acquire(access, {
        acquisition: acquisitionRef(`acq-${randomUUID()}`),
        origin: originRef('call-1'),
        scope,
        placement,
        ledger: own.ledger,
        guard: allow,
        retention: { scope, ledger: terminalLedger, processes: processes.ledger },
      })
      if (acquired.kind !== 'acquired')
        throw new Error(`expected a lease: ${JSON.stringify(acquired)}`)
      const command = acquired.lease.facility('command')
      if (command === undefined) throw new Error('expected the command facility')
      const retention = command.retention
      if (retention === undefined) throw new Error('expected the retention extension')

      const port = await freePort()
      const start = await command.start({
        requestId: `start-${randomUUID()}`,
        access,
        origin: originRef('call-1'),
        binding: host,
        executable: '/bin/sh',
        args: [
          '-c',
          `python3 -m http.server ${port} --bind 127.0.0.1 >/dev/null 2>&1 & echo started`,
        ],
        cwd,
        env: { PATH: '/usr/bin:/bin' },
        outputMode: 'separate',
      })
      if (start.kind !== 'done')
        throw new Error(`expected a started process: ${JSON.stringify(start)}`)
      const handle = start.value
      units.add(handle.process.id)
      for await (const _chunk of handle.output) void _chunk
      const outcome = await handle.result
      if (outcome.kind !== 'completed')
        throw new Error(`expected completed: ${JSON.stringify(outcome)}`)
      expect(outcome.residue).toMatchObject({ kind: 'retained' })
      // The ledgers and the marker know the process by its key, the supervisor by its unit name.
      const key = handle.process.id.slice('omne-host-'.length, -'.scope'.length)

      await vi.waitFor(async () => expect(await reachable(port)).toBe(true), { timeout: 15_000 })
      const listed = await retention.list({
        requestId: `list-${randomUUID()}`,
        access,
        origin: originRef('call-1'),
        binding: host,
      })
      expect(listed).toMatchObject({ kind: 'done', value: [{ process: { id: key } }] })
      expect(await unitState(handle.process.id)).toMatchObject({ activeState: 'active' })
      expect(await readdir(join(state, 'retained-processes'))).toEqual([`${key}.json`])

      const released = await service.releaseScope(scope, createRecoveryAccess())

      // No waiting: the registry answered only after the stop was confirmed.
      const after = await unitState(handle.process.id)
      expect(after.loadState === 'not-found' || after.activeState === 'inactive').toBe(true)
      // The registry sends the closure signal before it enumerates. The index may confirm the stop
      // on that signal before the enumeration reaches the provider; the process is then gone and
      // not in `stopped`, and the retained-process ledger below is the record of its stop.
      if (released.kind !== 'recovered')
        throw new Error(`expected recovered: ${JSON.stringify(released)}`)
      expect([[], [{ key, provider: 'host-files' }]]).toContainEqual(
        released.stopped.map(item => ({ key: item.key, provider: item.provider })),
      )
      expect(released).toMatchObject({
        kind: 'recovered',
        pending: [],
        unsupported: [],
        unavailable: [],
        pendingAcquisitions: [],
        unsupportedAcquisitions: [],
      })
      expect(processes.stopped).toEqual([[key, 'confirmed']])
      expect(own.stopped.filter(([stoppedKey]) => stoppedKey === key)).toEqual([])
      expect(await readdir(join(state, 'retained-processes'))).toEqual([])
      expect(await reachable(port)).toBe(false)
    })
  },
)
