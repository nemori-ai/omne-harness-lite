// The platform prerequisites of the host `command` facility (P1, P3 to P6), probed against the real
// host. There is no entry that injects a probe answer: a test changes the real environment of this
// process (PATH, the user manager variables) and reads what the provider reports. On a host that is
// not Linux the start answers `unavailable` while `files` of the same acquisition keeps working.
// The tests that need the user systemd manager run only on Linux with
// `OMNE_HOST_COMMAND_LINUX=1`, and in the slow tier: they start real scope units.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandFacility,
  type EnvironmentBinding,
  type EnvironmentLease,
  type ManagedResource,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesDomain,
  createHostFilesProvider,
  hostObjectToken,
  type HostFilesDiagnostic,
} from '@omne-harness/execution-environment-host-local'

const linux = process.platform === 'linux'
const withUserManager = linux && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'

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

const host: EnvironmentBinding = { kind: 'host_machine' }
type ScopeRef = ProviderAcquireInput['scope']
function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}
function scopeOf(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type Recorded = { ledger: ResourceLedger; plans: ManagedResource[]; stopped: [string, string][] }

function recordingLedger(): Recorded {
  const plans: ManagedResource[] = []
  const stopped: [string, string][] = []
  return {
    plans,
    stopped,
    ledger: {
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
    },
  }
}

const providers: { retire(): Promise<unknown> }[] = []
const roots: string[] = []
const saved = { ...process.env }

afterEach(async () => {
  for (const key of ['PATH', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'])
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function hostProvider(diagnostics: HostFilesDiagnostic[] = [], probeRetryMs?: number) {
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    diagnose: diagnostic => diagnostics.push(diagnostic),
    ...(probeRetryMs === undefined ? {} : { command: { probeRetryMs } }),
  })
  providers.push(provider)
  return provider
}

async function acquired(
  provider: ReturnType<typeof createHostFilesProvider>,
  ledger: ResourceLedger,
): Promise<EnvironmentLease> {
  const answer = await provider.acquire({
    acquisition: acquisitionRef('acq-probe'),
    origin: originRef('call-1'),
    scope: scopeOf(`scope-probe-${randomUUID()}`),
    tenant,
    ledger,
    placement: {
      kind: 'placement',
      requirement: { allowedBindings: [host], facilities: ['files', 'command'], isolation: [] },
      binding: host,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: { kind: 'not_guaranteed' },
      quotaDomain: provider.quotaDomain,
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

function startRequest(requestId: string, cwd: string) {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/sh',
    args: ['-c', 'exit 0'],
    cwd,
    env: { PATH: '/usr/bin:/bin' },
    outputMode: 'separate' as const,
  }
}

async function workDirectory(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-host-probe-')))
  roots.push(root)
  return root
}

async function prerequisitesSettle(provider: ReturnType<typeof createHostFilesProvider>) {
  let answer = 'unknown'
  await vi.waitFor(
    async () => {
      answer = (await provider.describe()).prerequisites
      expect(answer).not.toBe('unknown')
    },
    { timeout: 20_000, interval: 50 },
  )
  return answer
}

it(
  'answers unavailable for a start on a host that is not Linux, and files of the same acquisition still work',
  { skip: linux },
  async () => {
    const diagnostics: HostFilesDiagnostic[] = []
    const provider = hostProvider(diagnostics)
    const recorded = recordingLedger()
    const lease = await acquired(provider, recorded.ledger)
    const cwd = await workDirectory()
    expect(await commandOf(lease).start(startRequest('s1', cwd))).toEqual({
      kind: 'rejected',
      requestId: 's1',
      reason: 'unavailable',
    })
    expect(recorded.plans).toEqual([])
    expect(await prerequisitesSettle(provider)).toBe('unsatisfied')
    expect(diagnostics).toMatchObject([{ kind: 'commandUnavailable', missing: ['linux'] }])
    const path = join(cwd, 'notes.txt')
    await writeFile(path, 'still readable')
    const files = lease.facility('files')
    if (files === undefined) throw new Error('expected files')
    expect(
      await files.read({
        requestId: 'r1',
        access: { principal: 'subject-a', tenant },
        origin: originRef('call-1'),
        binding: host,
        path,
        named: await hostObjectToken(path),
      }),
    ).toMatchObject({ kind: 'done', value: { bytes: new TextEncoder().encode('still readable') } })
  },
)

it(
  'answers unavailable and names the missing tools when systemd-run is not on PATH, without planning a resource',
  { skip: !linux },
  async () => {
    process.env['PATH'] = dirname(process.execPath)
    const diagnostics: HostFilesDiagnostic[] = []
    const provider = hostProvider(diagnostics)
    const recorded = recordingLedger()
    const lease = await acquired(provider, recorded.ledger)
    expect(await prerequisitesSettle(provider)).toBe('unsatisfied')
    expect(await commandOf(lease).start(startRequest('s1', await workDirectory()))).toEqual({
      kind: 'rejected',
      requestId: 's1',
      reason: 'unavailable',
    })
    expect(recorded.plans).toEqual([])
    expect(diagnostics).toMatchObject([
      { kind: 'commandUnavailable', missing: expect.arrayContaining(['systemd-tools']) },
    ])
  },
)

it(
  'reports satisfied on a Linux host with a running user manager and cgroup v2',
  // Slow: starts a probe scope and waits for its stop; needs the user systemd manager.
  { tags: ['slow'], skip: !withUserManager },
  async () => {
    const provider = hostProvider()
    expect(await prerequisitesSettle(provider)).toBe('satisfied')
  },
)

it(
  'answers unavailable while the user manager is unreachable, and starts once it is back after the retry interval',
  // Slow: starts a probe scope and waits for its stop; needs the user systemd manager.
  { tags: ['slow'], skip: !withUserManager },
  async () => {
    delete process.env['XDG_RUNTIME_DIR']
    delete process.env['DBUS_SESSION_BUS_ADDRESS']
    const diagnostics: HostFilesDiagnostic[] = []
    const provider = hostProvider(diagnostics, 0)
    const recorded = recordingLedger()
    const lease = await acquired(provider, recorded.ledger)
    const cwd = await workDirectory()
    expect(await prerequisitesSettle(provider)).toBe('unsatisfied')
    expect(await commandOf(lease).start(startRequest('s1', cwd))).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(diagnostics).toMatchObject([
      { kind: 'commandUnavailable', missing: expect.arrayContaining(['user-manager']) },
    ])
    expect(recorded.plans).toEqual([])

    process.env['XDG_RUNTIME_DIR'] = saved['XDG_RUNTIME_DIR']
    process.env['DBUS_SESSION_BUS_ADDRESS'] = saved['DBUS_SESSION_BUS_ADDRESS']
    const marker = join(cwd, 'ran')
    const started = await commandOf(lease).start({
      ...startRequest('s2', cwd),
      args: ['-c', `touch '${marker}'`],
    })
    if (started.kind !== 'done') throw new Error(`expected a start: ${JSON.stringify(started)}`)
    expect(await started.value.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
    expect(await readFile(marker, 'utf8')).toBe('')
    expect(await provider.describe()).toMatchObject({ prerequisites: 'satisfied' })
  },
)
