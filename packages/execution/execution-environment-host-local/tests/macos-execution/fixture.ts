// Shared scaffolding of the macOS slow tests: a provider from the sources, recording ledgers, an
// acquisition, a start request, and checks of processes by pid. Only the ledgers are stand-ins:
// they are the integrator's ports.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import { createHostFilesDomain, createHostFilesProvider } from '../../src/index.ts'
import type { HostFilesProviderOptions } from '../../src/index.ts'

export const enabled = process.platform === 'darwin' && process.env['OMNE_HOST_MACOS'] === '1'
export const host: EnvironmentBinding = { kind: 'host_machine' }
const decoder = new TextDecoder()

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}
export const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')

export type ScopeRef = ProviderAcquireInput['scope']
export function scopeOf(text: string): ScopeRef {
  const isScope = (value: string): value is ScopeRef['ref'] => value.length > 0
  if (!isScope(text)) throw new TypeError('empty scope')
  return { ref: text }
}
export const freshScope = () => scopeOf(`scope-macos-${randomUUID()}`)

export type Stop = [string, 'confirmed' | 'unconfirmed']

export function acquisitionLedger() {
  const stopped: Stop[] = []
  const plans: ManagedResource[] = []
  const closed = new AbortController()
  const ledger: ResourceLedger = {
    closed: closed.signal,
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
  return { ledger, stopped, plans, closed }
}

export function processLedger() {
  const stopped: Stop[] = []
  const closed = new AbortController()
  const ledger: RetainedProcessLedger = {
    closed: closed.signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped, closed }
}

export const terminalLedger: RetainedTerminalLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  stopped: async () => 'recorded',
}

export const providers: EnvironmentProvider[] = []
export const roots: string[] = []

export function hostProvider(
  stateDirectory: string | undefined,
  options: Partial<HostFilesProviderOptions> = {},
): EnvironmentProvider {
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    ...(stateDirectory === undefined ? {} : { stateDirectory }),
    ...options,
  })
  providers.push(provider)
  return provider
}

export async function cleanup(): Promise<void> {
  await Promise.all(providers.splice(0).map(provider => provider.retire()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
}

export async function workDirectory(prefix = 'omne-macos-'): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  roots.push(root)
  return root
}

export function placementFor(provider: EnvironmentProvider, terminal = false) {
  return {
    kind: 'placement' as const,
    requirement: {
      allowedBindings: [host],
      facilities: ['files' as const, (terminal ? 'terminal' : 'command') as 'command'],
      isolation: [],
    },
    binding: host,
    provider: { name: provider.name, generation: provider.generation, version: provider.version },
    continuity: { kind: 'not_guaranteed' as const },
    quotaDomain: provider.quotaDomain,
  }
}

export type Bound = Readonly<{
  scope: ScopeRef
  retentionScope?: ScopeRef
  processes?: RetainedProcessLedger
  released?: AbortSignal
  terminal?: boolean
}>

export async function leaseOf(
  provider: EnvironmentProvider,
  ledger: ResourceLedger,
  bound: Bound,
): Promise<EnvironmentLease> {
  const answer = await provider.acquire({
    acquisition: acquisitionRef(`acq-${randomUUID()}`),
    origin: originRef('call-1'),
    scope: bound.scope,
    tenant,
    ledger,
    placement: placementFor(provider, bound.terminal),
    retention: {
      scope: bound.retentionScope ?? bound.scope,
      ledger: terminalLedger,
      ...(bound.processes === undefined ? {} : { processes: bound.processes }),
      released: bound.released ?? new AbortController().signal,
    },
  })
  if (answer.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(answer)}`)
  return answer.lease
}

export function commandOf(lease: EnvironmentLease): CommandFacility<unknown> {
  const command = lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  return command
}

/** The fields every terminal operation of these tests shares. */
export const operationBase = {
  access: { principal: 'subject-a', tenant },
  binding: host,
  origin: originRef('call-1'),
  requestId: 'operation',
}

export type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]

export function request(
  cwd: string,
  script: string,
  overrides: Partial<StartRequest> = {},
): StartRequest {
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

export async function started(
  command: CommandFacility<unknown>,
  start: StartRequest,
): Promise<ProcessHandle> {
  const answer = await command.start(start)
  if (answer.kind !== 'done')
    throw new Error(`expected a started process: ${JSON.stringify(answer)}`)
  return answer.value
}

/** Reads the handle's whole output and its outcome. */
export async function finished(
  handle: ProcessHandle,
): Promise<{ outcome: CommandOutcome; text: string }> {
  const chunks: string[] = []
  for await (const chunk of handle.output) chunks.push(decoder.decode(chunk.data))
  return { outcome: await handle.result, text: chunks.join('') }
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function eventually(
  check: () => boolean | Promise<boolean>,
  ms = 10_000,
): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (await check()) return
  throw new Error('condition not met in time')
}

export async function pidsIn(path: string): Promise<number[]> {
  const text = await readFile(path, 'utf8').catch(() => '')
  return text.trim() === '' ? [] : text.trim().split(/\s+/u).map(Number)
}

/** Kills every pid by number; tests call it at their end so nothing they started survives. */
export function killAll(pids: readonly number[]): void {
  for (const pid of pids)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* Already gone. */
    }
}
