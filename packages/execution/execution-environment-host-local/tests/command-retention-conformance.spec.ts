/** @module-tag slow */
// Slow: every case starts real processes in real systemd user scopes and waits for them to stop.
// The contract's conformance cases for what a one-shot command leaves behind, run against the real
// host provider on Linux. The suite knows no platform: this file writes the commands, closes the
// retention scope through the acquisition's release signal and reads the unit state from systemd.
// Only the two ledgers are recorders: they are the integrator's ports. The cases run only on Linux
// with `OMNE_HOST_COMMAND_LINUX=1`; elsewhere they are skipped, and a skip is not a pass.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type CommandFacility,
  type EnvironmentBinding,
  type EnvironmentLease,
  type EnvironmentProvider,
  type ProviderAcquireInput,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import {
  commandRetentionConformance,
  runConformanceCase,
  type CommandRetentionAcquisition,
  type CommandRetentionSubject,
} from '@omne-harness/execution-environment-contract/testing'
import {
  createHostFilesDomain,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'

const run = promisify(execFile)
const enabled = process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'

const parsedTenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsedTenant.ok) throw new Error('tenant fixture did not parse')
const tenant: TenantId = parsedTenant.value
const host: EnvironmentBinding = { kind: 'host_machine' }
type ScopeRef = ProviderAcquireInput['scope']
function freshScope(): ScopeRef {
  const text = `scope-conformance-${randomUUID()}`
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

const allUnits = new Set<string>()

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
    stdout
      .split('\n')
      .find(line => line.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  return { loadState: value('LoadState'), activeState: value('ActiveState') }
}

async function unitStopped(unit: string): Promise<boolean> {
  const state = await unitState(unit)
  return state.loadState === 'not-found' || state.activeState === 'inactive'
}

afterAll(async () => {
  if (!enabled) return
  const left: string[] = []
  for (const unit of allUnits)
    if ((await unitState(unit)).loadState !== 'not-found') left.push(unit)
  for (const unit of left) await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  expect(left).toEqual([])
})

const acquisitionLedger = (): ResourceLedger => ({
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
})
const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

/** The retention scope: the scope owner's close signals, and the process ledger view over them. */
function retentionScope() {
  const released = new AbortController()
  const closed = new AbortController()
  const processes: RetainedProcessLedger = {
    closed: closed.signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  return {
    released,
    processes,
    close() {
      released.abort()
      closed.abort()
    },
  }
}

async function hostSubject(): Promise<CommandRetentionSubject> {
  const roots: string[] = []
  const units = new Set<string>()
  const makeRoot = async (prefix: string) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
    roots.push(root)
    return root
  }
  const state = await makeRoot('omne-host-conformance-state-')
  const cwd = await makeRoot('omne-host-conformance-')
  const provider: EnvironmentProvider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    stateDirectory: state,
    command: { retainedPollMs: 200 },
  })
  const scopes = [retentionScope(), retentionScope(), retentionScope()]

  async function acquire(
    scope: ReturnType<typeof retentionScope>,
    bound: boolean,
  ): Promise<CommandRetentionAcquisition> {
    const ref = freshScope()
    const answer = await provider.acquire({
      acquisition: acquisitionRef(`acq-${randomUUID()}`),
      origin: originRef('call-1'),
      scope: ref,
      tenant,
      ledger: acquisitionLedger(),
      placement: {
        kind: 'placement',
        requirement: {
          allowedBindings: [host],
          facilities: ['files', 'command'],
          isolation: [],
        },
        binding: host,
        provider: {
          name: provider.name,
          generation: provider.generation,
          version: provider.version,
        },
        continuity: { kind: 'not_guaranteed' },
        quotaDomain: provider.quotaDomain,
      },
      retention: {
        scope: ref,
        ledger: terminalLedger,
        ...(bound ? { processes: scope.processes } : {}),
        released: scope.released.signal,
      },
    })
    if (answer.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(answer)}`)
    const lease: EnvironmentLease = answer.lease
    const command = lease.facility('command')
    if (command === undefined) throw new Error('expected the command facility')
    // The unit names are noted so that the case's cleanup stops what it started, even when it fails.
    const facility: CommandFacility<unknown> = {
      ...(command.retention === undefined ? {} : { retention: command.retention }),
      async start(request) {
        const result = await command.start(request)
        if (result.kind === 'done') {
          units.add(result.value.process.id)
          allUnits.add(result.value.process.id)
        }
        return result
      },
    }
    return {
      facility,
      request: () => ({
        requestId: `req-${randomUUID()}`,
        access: { principal: 'subject-a', tenant },
        origin: originRef('call-1'),
        binding: host,
      }),
    }
  }

  const body = (script: string) => ({
    executable: '/bin/sh',
    args: ['-c', script],
    cwd,
    env: { PATH: '/usr/bin:/bin' },
    outputMode: 'separate' as const,
  })
  const [first, second, third] = scopes
  if (first === undefined || second === undefined || third === undefined)
    throw new Error('unreachable')

  return {
    acquisition: await acquire(first, true),
    elsewhere: await acquire(second, true),
    unbound: await acquire(third, false),
    commands: {
      clean: () => body('echo done'),
      leftover: () => body('sleep 300 & echo started'),
    },
    async closeScope() {
      first.close()
    },
    // The unit of a retained process is named after its reference.
    domainStopped: ref => unitStopped(`omne-host-${ref.id}.scope`),
    async dispose() {
      for (const scope of scopes) scope.close()
      for (const unit of units)
        await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
      await vi.waitFor(
        async () => {
          for (const unit of units) expect(await unitStopped(unit)).toBe(true)
        },
        { timeout: 15_000 },
      )
      await provider.retire()
      await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
    },
  }
}

describe(
  'the contract cases for what a one-shot command leaves behind, on the Linux host',
  { skip: !enabled },
  () => {
    for (const test of commandRetentionConformance({ subject: hostSubject, waitMs: 60_000 })) {
      // The host provides neither retention.stop nor retention.output yet.
      const pending = test.name.startsWith('V-EE30.') || test.name.startsWith('V-EE31.')
      it(test.name, async () => {
        expect(await runConformanceCase(test)).toMatchObject({
          name: test.name,
          status: pending ? 'not-applicable' : 'pass',
        })
      })
    }
  },
)
