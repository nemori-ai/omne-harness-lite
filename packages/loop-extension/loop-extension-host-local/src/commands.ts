import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ExtensionInput,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  LoopExtensionDeclaration,
} from '@omne-harness/agent-contract'
import {
  acquisitionRef,
  originRef,
  type ExecutionEnvironment,
  type FacilityGuard,
  type ProcessHandle,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { commandResult, type CommandObservation } from '@omne-harness/loop-extension'
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  commandRequest,
  commandTimeoutMs,
  type EnabledMember,
  type ExtensionSources,
  type RunLocations,
} from '@omne-harness/loop-extension-contract'
import { succeed } from '@omne-harness/operation-result'
import type { CommandImplementations } from './implementations.ts'
import {
  callEvidence,
  openCommandLedger,
  type CallRecord,
  type CallStop,
  type CommandLedger,
} from './ledger.ts'

type Member = Pick<EnabledMember, 'capability' | 'assetRef' | 'version'>
type Command = Extract<LoopExtensionDeclaration['implementation'], { kind: 'command' }>
type Environment<P> = Pick<ExecutionEnvironment<P>, 'resolvePlacement' | 'acquire'>

export type CommandStep = 'intended' | 'started' | 'ended'

export type CommandHostInput<P> = Readonly<{
  sources: ExtensionSources<P>
  locations: RunLocations<P>
  environment(): Environment<P> | undefined
  interpreters: Readonly<Record<string, string>>
  /** The whole environment of the child process: nothing of the server process is inherited. */
  env: Readonly<Record<string, string>>
  directory: string
  /** Stops what an unfinished call may have left running, by its original acquisition. */
  recover?(call: CallRecord): Promise<Exclude<CallStop, 'none'>>
  afterStep?(step: CommandStep, call: CallRecord): void | Promise<void>
}>

const STOP_GRACE_MS = 1000
const REQUIREMENT = {
  allowedBindings: [{ kind: 'host_machine' }],
  facilities: ['command'],
  isolation: [],
} as const

const NOT_ENTERED: CommandObservation = { kind: 'not-entered' }
const ledgerFile = (directory: string, tenant: string) =>
  join(directory, `${createHash('sha256').update(tenant).digest('hex').slice(0, 32)}.jsonl`)

type Run<P> = Readonly<{
  access: Access<P>
  command: Command
  entry: string
  interpreter: string
  cwd: string
  timeoutMs: number
  stdin: Uint8Array
}>

type Seen = Readonly<{ observation: CommandObservation; stop: CallStop; stderrBytes: number }>

async function drain(handle: ProcessHandle) {
  const chunks: Uint8Array[] = []
  let kept = 0
  let expected = 0
  let dropped = false
  let stderrBytes = 0
  for await (const chunk of handle.output) {
    if (chunk.stream !== 'stdout') {
      stderrBytes += chunk.data.byteLength
      continue
    }
    if (chunk.observedOffset !== expected) dropped = true
    expected = chunk.observedOffset + chunk.data.byteLength
    const room = COMMAND_OUTPUT_LIMIT_BYTES + 1 - kept
    if (room <= 0) continue
    const part = chunk.data.subarray(0, room)
    chunks.push(part)
    kept += part.byteLength
  }
  return { stdout: Buffer.concat(chunks), dropped, stderrBytes }
}

async function stopped(handle: ProcessHandle): Promise<CallStop> {
  const graceful = await handle.stop('graceful').catch(() => 'unconfirmed' as const)
  if (graceful === 'confirmed') return 'confirmed'
  return handle.stop('forced').catch(() => 'unconfirmed' as const)
}

type Ended = Awaited<ProcessHandle['result']>

function observed(
  call: CallRecord,
  outcome: Ended | null,
  output: Awaited<ReturnType<typeof drain>> | null,
): CommandObservation {
  const evidence = callEvidence(call)
  if (
    outcome === null ||
    output === null ||
    outcome.kind === 'failed' ||
    outcome.exit.kind === 'unknown'
  )
    return { kind: 'lost', started: evidence, recovery: evidence }
  const { exit } = outcome
  const discarded = outcome.output.mode === 'separate' && outcome.output.stdout.discardedBytes > 0
  return {
    kind: 'exited',
    code: exit.kind === 'code' ? exit.code : -1,
    stdout: output.stdout,
    dropped: output.dropped || discarded,
  }
}

async function observe(
  handle: ProcessHandle,
  call: CallRecord,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Seen> {
  let stop: Promise<CallStop> | undefined
  let timedOut = false
  let grace: ReturnType<typeof setTimeout> | undefined
  const gaveUp = Promise.withResolvers<'stopped'>()
  // A stop that does not end the process is not waited on for ever: the run is then lost, or timed out.
  const halt = () => {
    stop ??= stopped(handle).finally(() => {
      grace = setTimeout(() => gaveUp.resolve('stopped'), STOP_GRACE_MS)
    })
  }
  const timer = setTimeout(() => {
    timedOut = true
    halt()
  }, timeoutMs)
  signal.addEventListener('abort', halt, { once: true })
  if (signal.aborted) halt()
  try {
    const read = drain(handle).catch(() => null)
    const outcome = await Promise.race([handle.result.catch(() => null), gaveUp.promise])
    const state = stop === undefined ? 'none' : await stop
    if (timedOut) return { observation: { kind: 'timed-out' }, stop: state, stderrBytes: 0 }
    const ended = outcome === 'stopped' ? null : outcome
    const output = outcome === 'stopped' ? null : await read
    return {
      observation: observed(call, ended, output),
      stop: state,
      stderrBytes: output?.stderrBytes ?? 0,
    }
  } finally {
    clearTimeout(timer)
    clearTimeout(grace)
    signal.removeEventListener('abort', halt)
  }
}

type Host<P> = Readonly<{ input: CommandHostInput<P>; closed(): boolean }>

function resources(ledger: CommandLedger, call: CallRecord, closing: AbortSignal): ResourceLedger {
  const confirmed = async () => (closing.aborted ? ('closed' as const) : ('confirmed' as const))
  return {
    closed: closing,
    async plan(resource) {
      if (closing.aborted) return 'closed'
      return ledger.mark(call.key, { at: 'resource', resource })
    },
    permit: confirmed,
    adopt: confirmed,
    stopped: async () => 'recorded',
  }
}

async function launched<P>(
  host: Host<P>,
  run: Run<P>,
  ledger: CommandLedger,
  call: CallRecord,
  signal: AbortSignal,
): Promise<Seen> {
  const { input } = host
  const origin = originRef(call.key)
  const scope = { ref: call.scope } as Parameters<Environment<P>['resolvePlacement']>[1]['scope']
  const environment = input.environment()
  const none = (observation: CommandObservation): Seen => ({
    observation,
    stop: 'none',
    stderrBytes: 0,
  })
  if (environment === undefined) return none(NOT_ENTERED)
  const unknown = none({ kind: 'start-unknown', recovery: callEvidence(call) })
  const placement = await environment.resolvePlacement(run.access, {
    scope,
    requirement: REQUIREMENT,
  })
  if (placement.kind !== 'placement') return none(NOT_ENTERED)
  const closing = new AbortController()
  const guard: FacilityGuard<P> = {
    authorize: async (facility, operation, request) =>
      facility === 'command' && operation === 'start' && request.origin === origin && !host.closed()
        ? 'authorized'
        : 'notAuthorized',
  }
  const acquired = await environment.acquire(run.access, {
    acquisition: acquisitionRef(call.key),
    origin,
    scope,
    placement,
    ledger: resources(ledger, call, closing.signal),
    guard,
  })
  if (acquired.kind === 'rejected' || acquired.kind === 'allocationFailed') return none(NOT_ENTERED)
  if (acquired.kind !== 'acquired') return unknown
  const { lease } = acquired
  try {
    const facility = lease.facility('command')
    if (facility === undefined) return none(NOT_ENTERED)
    const started = await facility.start({
      requestId: `${call.key}/start`,
      access: run.access,
      origin,
      binding: lease.placement.binding,
      executable: run.interpreter,
      args: [run.entry],
      cwd: run.cwd,
      env: input.env,
      stdin: run.stdin,
      outputMode: 'separate',
    })
    if (started.kind === 'rejected') return none(NOT_ENTERED)
    if (started.kind !== 'done') return unknown
    const handle = started.value
    await ledger.mark(call.key, { at: 'started', process: handle.process })
    const running = ledger.get(call.key) ?? call
    await input.afterStep?.('started', running)
    return await observe(handle, running, run.timeoutMs, signal)
  } finally {
    closing.abort()
    await lease.release().catch(() => undefined)
  }
}

async function prepared<P>(
  input: CommandHostInput<P>,
  access: Access<P>,
  member: Member,
  command: Command,
  call: ExtensionInput,
  mode: ExtensionInvocationMode,
): Promise<Readonly<{ run: Run<P>; scope: string }> | null> {
  const timeoutMs = commandTimeoutMs(command.timeout)
  const interpreter = input.interpreters[command.interpreter]
  const sources = await input.sources.of(access).catch(() => undefined)
  const version = { asset: member.assetRef, version: member.version }
  const directory = await sources?.locate(version).catch(() => undefined)
  const location = await input.locations
    .of({ ...access, execution: call.execution, passage: call.passage })
    .catch(() => undefined)
  if (timeoutMs === null || interpreter === undefined) return null
  if (directory?.kind !== 'directory' || location?.kind !== 'location') return null
  const stdin = new TextEncoder().encode(JSON.stringify(commandRequest(call, mode)))
  const entry = join(directory.path, command.entry)
  const run = { access, command, entry, interpreter, cwd: location.cwd, timeoutMs, stdin }
  return { run, scope: location.scope.ref }
}

// After the intent nothing that goes wrong proves the process did not start.
function unseen(ledger: CommandLedger, intent: CallRecord): Seen {
  const now = ledger.get(intent.key) ?? intent
  const recovery = callEvidence(now)
  const observation: CommandObservation =
    now.state === 'started'
      ? { kind: 'lost', started: recovery, recovery }
      : { kind: 'start-unknown', recovery }
  return { observation, stop: 'none', stderrBytes: 0 }
}

async function ended<P>(
  input: CommandHostInput<P>,
  ledger: CommandLedger,
  intent: CallRecord,
  { observation, stop, stderrBytes }: Seen,
): Promise<void> {
  if (observation.kind === 'start-unknown' || observation.kind === 'lost') return
  const outcome = observation.kind === 'exited' ? `exit:${observation.code}` : observation.kind
  await ledger.mark(intent.key, { at: 'ended', end: { outcome, stop, stderrBytes } })
  await input.afterStep?.('ended', ledger.get(intent.key) ?? intent)
}

/** Runs command implementations through the command facility of the execution environment, never as a child of this process. */
export function createCommandHost<P>(input: CommandHostInput<P>) {
  const ledgers = new Map<string, Promise<CommandLedger | 'unavailable'>>()
  let closed = false
  let settled: Promise<void> | undefined
  const host: Host<P> = { input, closed: () => closed }

  function ledgerOf(file: string): Promise<CommandLedger | 'unavailable'> {
    const known = ledgers.get(file)
    if (known !== undefined) return known
    const opening = openCommandLedger(file)
    ledgers.set(file, opening)
    void opening.then(ledger => {
      if (ledger === 'unavailable' && ledgers.get(file) === opening) ledgers.delete(file)
    })
    return opening
  }

  // A call with an intent and no end may have left a process: it is stopped by its original acquisition before any new call.
  async function settle(): Promise<void> {
    const names = await readdir(input.directory).catch(() => [])
    for (const name of names.filter(item => item.endsWith('.jsonl'))) {
      const ledger = await ledgerOf(join(input.directory, name))
      if (ledger === 'unavailable') continue
      for (const call of ledger.unfinished()) {
        const stop =
          (await input.recover?.(call).catch(() => 'unconfirmed' as const)) ?? 'unconfirmed'
        await ledger.mark(call.key, { at: 'settled', stop })
      }
    }
  }

  const start = (): Promise<void> => (settled ??= settle())

  async function invoke(
    access: Access<P>,
    member: Member,
    declaration: LoopExtensionDeclaration,
    call: ExtensionInput,
    signal: AbortSignal,
    mode: ExtensionInvocationMode,
  ): Promise<ExtensionInvocationResult> {
    const tenant = tenantCodec.encode(access.tenant)
    if (closed || !tenant.ok || declaration.implementation.kind !== 'command')
      return commandResult(NOT_ENTERED)
    await start()
    const ready = await prepared(input, access, member, declaration.implementation, call, mode)
    const ledger = await ledgerOf(ledgerFile(input.directory, tenant.value))
    if (ready === null || ledger === 'unavailable' || signal.aborted || closed)
      return commandResult(NOT_ENTERED)
    const intent = await ledger.intend({
      tenant: tenant.value,
      passage: call.passage,
      implementation: {
        owner: 'loop-extension',
        name: member.capability,
        revision: member.version,
        digest: member.assetRef,
      },
      mode: mode.kind,
      scope: ready.scope,
    })
    if (intent === 'unavailable') return commandResult(NOT_ENTERED)
    await input.afterStep?.('intended', intent)
    const seen = await launched(host, ready.run, ledger, intent, signal).catch(() =>
      unseen(ledger, intent),
    )
    await ended(input, ledger, intent, seen)
    return commandResult(seen.observation)
  }

  const implementations: CommandImplementations<P> = async ({ access, member, declaration }) =>
    succeed((call, signal, mode) => invoke(access, member, declaration, call, signal, mode))

  return {
    implementations,
    start,
    async close(): Promise<void> {
      closed = true
      await settled?.catch(() => undefined)
      for (const opening of ledgers.values()) {
        const ledger = await opening
        if (ledger !== 'unavailable') await ledger.close()
      }
      ledgers.clear()
    },
  }
}
