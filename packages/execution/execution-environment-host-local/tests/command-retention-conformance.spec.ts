/** @module-tag slow */
// Slow: every case starts real processes in real execution domains and waits for them to stop.
// The contract's conformance cases for what a one-shot command leaves behind, run against the real
// host provider. The suite knows no platform: this file writes the commands, closes the retention
// scope through the acquisition's release signal and reads the domain's state from the platform
// (systemd on Linux, the named Job on Windows). Only the two ledgers are recorders: they are the
// integrator's ports. The cases run on Windows, and on Linux with `OMNE_HOST_COMMAND_LINUX=1`;
// elsewhere they are skipped, and a skip is not a pass.
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
import { askBridge } from '../src/windows-execution/bridge.ts'
import { stopWindowsJob } from '../src/windows-execution/supervision.ts'

const run = promisify(execFile)

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

/** The host's commands and its readings of a domain, by the process id a start answered. */
type PlatformHost = Readonly<{
  enabled: boolean
  /** The domain of a retained process, by its reference. */
  domainOf(ref: { id: string }): string
  stopped(domain: string): Promise<boolean>
  stop(domain: string): Promise<void>
  /** The cases' commands, in the platform's shell or in Node. */
  commands(cwd: string): CommandRetentionSubject['commands']
}>

const linuxHost: PlatformHost = {
  enabled: process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1',
  // The unit of a retained process is named after its reference.
  domainOf: ref => `omne-host-${ref.id}.scope`,
  stopped: unitStopped,
  async stop(unit) {
    await run('systemctl', ['--user', 'stop', unit]).catch(() => undefined)
  },
  commands(cwd) {
    const body = (script: string) => ({
      executable: '/bin/sh',
      args: ['-c', script],
      cwd,
      env: { PATH: '/usr/bin:/bin' },
      outputMode: 'separate' as const,
    })
    return {
      clean: () => body('echo done'),
      leftover: () => body('sleep 300 & echo started'),
      // The leftover writes a check mark (three UTF-8 bytes) a second after the main process exits,
      // well after the handover, then keeps running.
      writing: () => ({
        body: body("(sleep 1; printf 'tail \\342\\234\\223\\r\\n'; sleep 300) & echo before"),
        after: new TextEncoder().encode('tail ✓\r\n'),
      }),
    }
  },
}

const windowsHost: PlatformHost = {
  enabled: process.platform === 'win32',
  // The Job of a retained process is named after its reference.
  domainOf: ref => `Local\\omne-command-${ref.id}`,
  async stopped(job) {
    const reading = await askBridge(
      { mode: 'members', name: job },
      frame => (frame.t === 'members' ? frame.reading : undefined),
      5_000,
    )
    return reading === 'gone'
  },
  async stop(job) {
    await stopWindowsJob(job, 5_000)
  },
  commands(cwd) {
    // A Node child outlives its parent only when detached; it stays in the Job and keeps the
    // inherited output pipe.
    const leftover = (child: string, main: string) => ({
      executable: process.execPath,
      args: [
        '-e',
        `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:['ignore','inherit','inherit']}).unref();${main}`,
      ],
      cwd,
      env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows' },
      outputMode: 'separate' as const,
    })
    return {
      clean: () => ({
        executable: process.execPath,
        args: ['-e', "console.log('done')"],
        cwd,
        env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows' },
        outputMode: 'separate' as const,
      }),
      leftover: () => leftover('setInterval(()=>{},1000)', "console.log('started')"),
      // The leftover writes a check mark (three UTF-8 bytes) a second after the main process exits,
      // well after the handover, then keeps running.
      writing: () => ({
        body: leftover(
          "setTimeout(()=>process.stdout.write(Buffer.from('tail \\u2713\\r\\n')),1000);setInterval(()=>{},1000)",
          "console.log('before')",
        ),
        after: new TextEncoder().encode('tail ✓\r\n'),
      }),
    }
  },
}

const platform = process.platform === 'win32' ? windowsHost : linuxHost
const enabled = platform.enabled

afterAll(async () => {
  if (!enabled) return
  const left: string[] = []
  for (const domain of allUnits) if (!(await platform.stopped(domain))) left.push(domain)
  for (const domain of left) await platform.stop(domain)
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

/**
 * The retention scope: the scope owner's close signals, and the process ledger view over them.
 * Its `ended` reads the confirmed stops the view recorded, unless `ended` is false.
 */
function retentionScope(ended = true) {
  const released = new AbortController()
  const closed = new AbortController()
  const endFacts = new Set<string>()
  const processes: RetainedProcessLedger = {
    closed: closed.signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      if (status === 'confirmed') endFacts.add(key)
      return 'recorded'
    },
    ...(ended
      ? {
          ended: async (key: string): Promise<'confirmed' | 'none'> =>
            endFacts.has(key) ? 'confirmed' : 'none',
        }
      : {}),
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
  const scopes = [retentionScope(), retentionScope(), retentionScope(), retentionScope(false)]

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

  const commands = platform.commands(cwd)
  const [first, second, third, fourth] = scopes
  if (first === undefined || second === undefined || third === undefined || fourth === undefined)
    throw new Error('unreachable')

  return {
    acquisition: await acquire(first, true),
    elsewhere: await acquire(second, true),
    unbound: await acquire(third, false),
    withoutEnded: await acquire(fourth, true),
    commands,
    async closeScope() {
      first.close()
    },
    domainStopped: ref => platform.stopped(platform.domainOf(ref)),
    async dispose() {
      for (const scope of scopes) scope.close()
      for (const domain of units) await platform.stop(domain)
      await vi.waitFor(
        async () => {
          for (const domain of units) expect(await platform.stopped(domain)).toBe(true)
        },
        { timeout: 15_000 },
      )
      await provider.retire()
      await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
    },
  }
}

describe(
  `the contract cases for what a one-shot command leaves behind, on the ${process.platform} host`,
  { skip: !enabled },
  () => {
    for (const test of commandRetentionConformance({ subject: hostSubject, waitMs: 60_000 })) {
      // A bare provider has no facility guard: the registry's gate asks it, and its tests cover
      // the refusal.
      const notApplicable =
        test.name === 'V-EE30.guard-refuses-stop' || test.name === 'V-EE31.guard-refuses-output'
      it(test.name, async () => {
        expect(await runConformanceCase(test)).toMatchObject({
          name: test.name,
          status: notApplicable ? 'not-applicable' : 'pass',
        })
      })
    }
  },
)
