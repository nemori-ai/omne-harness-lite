import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OutputSummary,
  ProcessHandle,
  ResourceLedger,
  RetainedTerminalLedger,
  TerminalFacility,
  TerminalInformation,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import { commandSettings, type CommandSettings, type HostCommandOptions } from './host-command.ts'
import {
  type PrerequisiteProbe,
  type HostTerminalPrerequisite,
  type HostCommandPrerequisite,
  probeTerminalPrerequisites,
} from './host-probe.ts'
import {
  forceStopScope,
  launchScope,
  newScopeUnit,
  readBootId,
  scopeDescription,
  scopeReference,
  cleanupTerminalScope,
  type ScopeCoordinate,
  type ScopeTools,
  type StopStatus,
} from './host-scope.ts'
import { createTerminalReader, type TerminalFrame } from './terminal-control.ts'
import { createTerminalOutput, type TerminalOutput } from './terminal-output.ts'
import type { RetainedTerminalBackend, RetainedTerminalFactory } from './host-retained-terminals.ts'
import type { MacosPrerequisite } from './macos-execution/commands.ts'

/** The terminal's bounds: the command bounds without the options about processes a command leaves behind. */
export type HostTerminalOptions = Omit<
  HostCommandOptions,
  'residuePolicy' | 'retainedPerScope' | 'retainedPollMs' | 'retainedOutputBytes'
> &
  Readonly<{
    /** Maximum bytes of one private control frame, including script and environment. Initial 1 MiB. */
    maxControlBytes?: number
    /** Geometry when create omits it. Initial 80 columns and 24 rows. */
    columns?: number
    rows?: number
    /** Domain-wide retained shell capacity. Initial 64; unresolved reservations consume capacity. */
    retainedCapacity?: number
    /** Bytes kept between two segments for the next result; later bytes are counted as discarded. Initial 256 KiB. */
    betweenSegmentBytes?: number
  }>
export type TerminalSettings = CommandSettings &
  Readonly<{
    maxControlBytes: number
    columns: number
    rows: number
    retainedCapacity: number
    betweenSegmentBytes: number
  }>

export function terminalSettings(options: HostTerminalOptions = {}): TerminalSettings {
  const settings = {
    ...commandSettings(options),
    maxControlBytes: options.maxControlBytes ?? 1024 * 1024,
    columns: options.columns ?? 80,
    rows: options.rows ?? 24,
    retainedCapacity: options.retainedCapacity ?? 64,
    betweenSegmentBytes: options.betweenSegmentBytes ?? 256 * 1024,
  }
  for (const name of [
    'maxControlBytes',
    'columns',
    'rows',
    'retainedCapacity',
    'betweenSegmentBytes',
  ] as const)
    if (!Number.isSafeInteger(settings[name]) || settings[name] < 1)
      throw new RangeError(`${name} must be a positive safe integer`)
  if (settings.columns > 65535 || settings.rows > 65535)
    throw new RangeError('terminal dimensions must not exceed 65535')
  if (settings.maxControlBytes < Math.ceil(settings.maxChunkBytes / 3) * 4 + 256)
    throw new RangeError('maxControlBytes must fit a base64 output chunk and its 256-byte envelope')
  return Object.freeze(settings)
}

export type HostTerminals = Readonly<{
  facility: TerminalFacility<unknown>
  seal(): void
  inFlight(): number
  settled(): Promise<void>
  stopAll(): Promise<readonly ManagedResource[]>
  unconfirmed(): readonly ManagedResource[]
  information?(ref: TerminalRef): TerminalInformation | undefined
}>

type Input = Readonly<{
  ledger: RetainedTerminalLedger
  provider: string
  scope: ScopeRef
  settings: TerminalSettings
  prerequisites: PrerequisiteProbe
  unavailable(
    missing: readonly (HostTerminalPrerequisite | HostCommandPrerequisite | MacosPrerequisite)[],
  ): void
  closed?(): boolean
  /** The platform of the domain; the Linux scope when absent. */
  platform?: TerminalPlatform
  reservation?: Readonly<{
    resource: ManagedResource
    coordinate: ScopeCoordinate
    terminal: TerminalRef
  }>
}>
/** What admits, places, starts and stops a terminal's domain on one platform. */
export type TerminalPlatform = Readonly<{
  /** The platform's prerequisites: what is missing, or nothing. */
  admit(): Promise<
    readonly (HostTerminalPrerequisite | HostCommandPrerequisite | MacosPrerequisite)[] | 'ready'
  >
  bootId(): Promise<string | undefined>
  /** A new domain of this boot, before any process: its key and where it lives. */
  allocate(
    bootId: string,
  ): Readonly<{ key: string; coordinate: ScopeCoordinate; reference: ManagedResource['reference'] }>
  /** Starts the gate of the domain; it reads the control channel on descriptor 3. */
  launch(coordinate: ScopeCoordinate, resource: ManagedResource): ChildProcess
  /** After the gate reported ready and before GO; false refuses the start. */
  ready(
    coordinate: ScopeCoordinate,
    resource: ManagedResource,
    gate: ChildProcess,
  ): Promise<boolean>
  /** After the shell opened; false invalidates the terminal. */
  opened(
    coordinate: ScopeCoordinate,
    resource: ManagedResource,
    gate: ChildProcess,
  ): Promise<boolean>
  /** Stops every process of the domain and confirms it empty; cleans up after a confirmed stop. */
  stop(
    coordinate: ScopeCoordinate,
    resource: ManagedResource,
    gate: ChildProcess,
    gateExited: Promise<void>,
  ): Promise<StopStatus>
}>

/** The Linux terminal domain: a systemd user scope, launched and stopped with the probed tools. */
function linuxTerminalPlatform(
  input: Pick<Input, 'scope' | 'settings' | 'prerequisites'>,
): TerminalPlatform {
  let tools: ScopeTools | undefined
  return {
    async admit() {
      const reading = await input.prerequisites.ready()
      const missing = await probeTerminalPrerequisites()
      if (reading.kind === 'satisfied' && missing.length === 0) {
        tools = reading.tools
        return 'ready'
      }
      return [...missing, ...(reading.kind === 'unsatisfied' ? reading.missing : [])]
    },
    bootId: readBootId,
    allocate(bootId) {
      const { key, unit } = newScopeUnit()
      const coordinate = { unit, bootId }
      return { key, coordinate, reference: scopeReference(coordinate) }
    },
    launch(coordinate, resource) {
      if (tools === undefined) throw new Error('a terminal launch before admission')
      return launchScope({
        tools,
        unit: coordinate.unit,
        description: scopeDescription(input.scope, resource.key),
        command: process.execPath,
        args: [gateScript, coordinate.unit],
      })
    },
    ready: async () => true,
    opened: async () => true,
    async stop(coordinate, _resource, _gate, gateExited) {
      if (tools === undefined) return 'unconfirmed'
      const reading = await forceStopScope({
        tools,
        coordinate,
        boundMs: input.settings.stopBoundMs,
        launcherExited: gateExited,
      })
      if (reading.status === 'confirmed') await cleanupTerminalScope(coordinate.unit)
      return reading.status
    },
  }
}

type CreateRequest = Parameters<TerminalFacility<unknown>['create']>[0]
type ExecuteRequest = Parameters<TerminalFacility<unknown>['execute']>[0]
type Deferred<T> = { promise: Promise<T>; settle(value: T): void }
type Leg = {
  id: string
  started: Deferred<boolean>
  result: Deferred<CommandOutcome>
  output: TerminalOutput
  /** Between-segment bytes delivered before the begin sentinel; set once the gate read it. */
  between: Uint8Array[]
  begun: { discarded: number } | undefined
  startedAt: number
  done: boolean
}
type Entry = {
  ref: TerminalRef
  resource: ManagedResource
  coordinate: ScopeCoordinate
  launcher: ChildProcess
  launcherExited: Promise<void>
  control: Writable | undefined
  reader: ReturnType<typeof createTerminalReader>
  ready: Deferred<boolean>
  opened: Deferred<boolean>
  state: TerminalInformation['state']
  cwd: string
  leg: Leg | undefined
  stopping: Promise<StopStatus> | undefined
  confirmed: boolean
}
const gateScript = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './terminal-gate.ts' : './terminal-gate.js',
    import.meta.url,
  ),
)
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Measure one terminal leg and bound its startup. */ performance.now()
const rejected = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
  kind: 'rejected',
  requestId,
  reason,
})
const validPath = (path: string) => isAbsolute(path) && !path.includes('\0')
const validEnvironment = (env: Readonly<Record<string, string>>) =>
  Object.entries(env).every(
    ([key, value]) =>
      /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) && !key.startsWith('__omne_') && !value.includes('\0'),
  )
const positive = (number: number) => Number.isSafeInteger(number) && number > 0 && number <= 65535

function deferred<T>(): Deferred<T> {
  let settle: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolve => {
    settle = resolve
  })
  return { promise, settle }
}
async function within<T>(promise: Promise<T>, boundMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), boundMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function controlOf(child: ChildProcess): Writable | undefined {
  const stream = child.stdio[3]
  return stream !== null && stream !== undefined && 'write' in stream ? stream : undefined
}
function send(entry: Entry, message: object): boolean {
  if (entry.control === undefined || entry.control.destroyed || entry.control.writableEnded)
    return false
  entry.control.write(`${JSON.stringify(message)}\n`)
  return true
}
function settleLeg(entry: Entry, code?: number): void {
  const leg = entry.leg
  if (leg === undefined || leg.done) return
  leg.done = true
  leg.started.settle(false)
  leg.output.close()
  const durationMs = Math.round(monotonicMs() - leg.startedAt)
  const output = summary(leg)
  leg.result.settle(
    code === undefined
      ? { kind: 'failed', reason: 'effectUnknown', observedDurationMs: durationMs, output }
      : { kind: 'completed', exit: { kind: 'code', code }, durationMs, output },
  )
}
/** The segment counts, with the between-segment bytes once the gate attributed them to this leg. */
function summary(leg: Leg): Extract<OutputSummary, { mode: 'terminal' }> {
  if (leg.begun === undefined) return leg.output.summary()
  const data = new Uint8Array(Buffer.concat(leg.between))
  const discardedBytes = leg.begun.discarded
  return {
    ...leg.output.summary(),
    between: { data, count: { observedBytes: data.length + discardedBytes, discardedBytes } },
  }
}

export function createHostTerminals(input: Input): HostTerminals {
  const { settings, ledger } = input
  const platform = input.platform ?? linuxTerminalPlatform(input)
  const entries = new Map<string, Entry>()
  const inFlight = new Set<Promise<unknown>>()
  let sealed = false
  const closed = () => sealed || ledger.closed.aborted || input.closed?.() === true
  let reservationPlan: 'unrequested' | 'pending' | 'unconfirmed' | 'settled' = 'unrequested'

  const forceStop = (entry: Entry): Promise<StopStatus> => {
    if (entry.confirmed) return Promise.resolve('confirmed')
    entry.state = 'invalid'
    settleLeg(entry)
    entry.control?.end()
    entry.stopping ??= (async () => {
      const status = await platform.stop(
        entry.coordinate,
        entry.resource,
        entry.launcher,
        entry.launcherExited,
      )
      let recorded: Awaited<ReturnType<ResourceLedger['stopped']>> = 'unavailable'
      try {
        recorded = await ledger.stopped(entry.resource.key, status)
      } catch {
        /* The original ledger still owns the unsettled stop. */
      }
      if (status === 'confirmed' && recorded === 'recorded') entry.confirmed = true
      return entry.confirmed ? 'confirmed' : 'unconfirmed'
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }
  const invalidate = (entry: Entry) => {
    if (entry.state === 'closed') return
    entry.state = 'invalid'
    entry.ready.settle(false)
    entry.opened.settle(false)
    settleLeg(entry)
    void forceStop(entry)
  }
  const frame = (entry: Entry, value: TerminalFrame) => {
    switch (value.kind) {
      case 'ready':
        entry.ready.settle(true)
        return
      case 'opened':
        entry.cwd = value.cwd
        entry.opened.settle(true)
        return
      case 'started':
        entry.leg?.started.settle(true)
        return
      case 'between':
        entry.leg?.between.push(value.bytes)
        return
      case 'begun':
        if (entry.leg !== undefined) entry.leg.begun = { discarded: value.discarded }
        return
      case 'data':
        entry.leg?.output.push(value.bytes)
        return
      case 'finished':
        entry.cwd = value.cwd
        settleLeg(entry, value.code)
        entry.leg = undefined
        entry.state = 'idle'
        return
      case 'fault':
        invalidate(entry)
        return
      default: {
        const exhaustive: never = value
        return exhaustive
      }
    }
  }
  const launch = (
    request: CreateRequest,
    coordinate: ScopeCoordinate,
    resource: ManagedResource,
  ): Entry => {
    const launcher = platform.launch(coordinate, resource)
    const launcherExited = new Promise<void>(resolve => {
      launcher.once('exit', () => resolve())
      launcher.once('error', () => resolve())
    })
    const control = controlOf(launcher)
    const ref =
      input.reservation?.terminal ?? Object.freeze({ id: resource.key, generation: randomUUID() })
    const entry: Entry = {
      ref,
      resource,
      coordinate,
      launcher,
      launcherExited,
      control,
      reader: createTerminalReader({ generation: ref.generation, ...settings }),
      ready: deferred(),
      opened: deferred(),
      state: 'idle',
      cwd: request.cwd,
      leg: undefined,
      stopping: undefined,
      confirmed: false,
    }
    entries.set(ref.id, entry)
    launcher.stderr?.resume()
    control?.on('error', () => invalidate(entry))
    launcher.once('error', () => invalidate(entry))
    launcher.once('close', () => invalidate(entry))
    launcher.stdout?.on('data', (bytes: Buffer) => {
      if (entry.state === 'invalid' || entry.state === 'closed') return
      const result = entry.reader.push(bytes)
      // Frames accepted before a fault happened; the fault invalidates what comes after them.
      for (const value of result.frames) frame(entry, value)
      if (result.kind === 'fault') invalidate(entry)
    })
    send(entry, {
      generation: ref.generation,
      cwd: request.cwd,
      env: request.env,
      columns: request.geometry?.columns ?? settings.columns,
      rows: request.geometry?.rows ?? settings.rows,
      maxChunkBytes: settings.maxChunkBytes,
      maxControlBytes: settings.maxControlBytes,
      betweenSegmentBytes: settings.betweenSegmentBytes,
    })
    return entry
  }

  const create = async (
    request: CreateRequest,
  ): Promise<FacilityResult<{ terminal: TerminalRef }>> => {
    const { requestId } = request
    if (request.binding.kind !== 'host_machine') return rejected(requestId, 'unsupported')
    if (
      !validPath(request.cwd) ||
      !validEnvironment(request.env) ||
      (request.geometry !== undefined &&
        (!positive(request.geometry.columns) || !positive(request.geometry.rows)))
    )
      return rejected(requestId, 'invalidInput')
    if (closed()) return rejected(requestId, 'closed')
    if (
      Buffer.byteLength(JSON.stringify(request.env)) + Buffer.byteLength(request.cwd) + 512 >
      Math.min(settings.maxControlBytes, 1024 * 1024)
    )
      return rejected(requestId, 'invalidInput')
    const admitted = await platform.admit()
    if (closed()) return rejected(requestId, 'closed')
    if (admitted !== 'ready') {
      input.unavailable(admitted)
      return rejected(requestId, 'unavailable')
    }
    const bootId = input.reservation?.coordinate.bootId ?? (await platform.bootId())
    if (closed()) return rejected(requestId, 'closed')
    if (bootId === undefined) return rejected(requestId, 'unavailable')
    const allocated =
      input.reservation === undefined
        ? platform.allocate(bootId)
        : {
            key: input.reservation.resource.key,
            coordinate: input.reservation.coordinate,
            reference: input.reservation.resource.reference,
          }
    const { key, coordinate } = allocated
    const resource: ManagedResource = {
      key,
      provider: input.provider,
      reference: allocated.reference,
    }
    let planned: Awaited<ReturnType<ResourceLedger['plan']>>
    if (input.reservation !== undefined) reservationPlan = 'pending'
    try {
      planned = await ledger.plan(resource)
    } catch {
      if (input.reservation !== undefined) {
        reservationPlan = 'unconfirmed'
        return { kind: 'unknown', requestId }
      }
      return rejected(requestId, 'unavailable')
    }
    if (input.reservation !== undefined) {
      reservationPlan =
        planned === 'recorded' || planned === 'unavailable' ? 'unconfirmed' : 'unrequested'
      if (planned === 'unavailable') return { kind: 'unknown', requestId }
    }
    if (planned !== 'recorded') return rejected(requestId, planned)
    if (closed()) return rejected(requestId, 'closed')
    // Retained creation obtains permission before even launching its private gate.
    if (input.reservation !== undefined) {
      let permission: Awaited<ReturnType<RetainedTerminalLedger['permit']>>
      try {
        permission = await ledger.permit(key)
      } catch {
        permission = 'unavailable'
      }
      if (permission !== 'confirmed' || closed())
        return rejected(
          requestId,
          closed() ? 'closed' : permission === 'confirmed' ? 'unavailable' : permission,
        )
    }
    const entry = launch(request, coordinate, resource)
    const deadline = monotonicMs() + settings.startBoundMs
    if (!(await within(entry.ready.promise, Math.max(0, deadline - monotonicMs())))) {
      await forceStop(entry)
      return { kind: 'unknown', requestId }
    }
    if (!(await platform.ready(coordinate, resource, entry.launcher))) {
      await forceStop(entry)
      return rejected(requestId, closed() ? 'closed' : 'unavailable')
    }
    if (closed()) {
      await forceStop(entry)
      return rejected(requestId, 'closed')
    }
    let permit: Awaited<ReturnType<ResourceLedger['permit']>>
    try {
      permit = input.reservation === undefined ? await ledger.permit(key) : 'confirmed'
    } catch {
      permit = 'unavailable'
    }
    if (permit !== 'confirmed' || closed()) {
      await forceStop(entry)
      return rejected(
        requestId,
        closed() ? 'closed' : permit === 'confirmed' ? 'unavailable' : permit,
      )
    }
    if (
      !send(entry, { c: 'go' }) ||
      !(await within(entry.opened.promise, Math.max(0, deadline - monotonicMs()))) ||
      !(await platform.opened(coordinate, resource, entry.launcher))
    ) {
      await forceStop(entry)
      return { kind: 'unknown', requestId }
    }
    if (closed()) {
      await forceStop(entry)
      return rejected(requestId, 'closed')
    }
    if (entry.state === 'invalid' || entry.state === 'closed') return { kind: 'unknown', requestId }
    return { kind: 'done', requestId, value: { terminal: entry.ref } }
  }
  const lookup = (ref: TerminalRef) => {
    const entry = entries.get(ref.id)
    return entry?.ref.generation === ref.generation ? entry : undefined
  }
  const stopLeg = async (
    entry: Entry,
    leg: Leg,
    mode: 'graceful' | 'forced',
  ): Promise<StopStatus> => {
    // An old leg's stop must not terminate a later leg in the persistent shell.
    if (leg.done) return entry.state === 'invalid' ? forceStop(entry) : 'confirmed'
    if (mode === 'forced') return forceStop(entry)
    if (!send(entry, { c: 'term' })) return 'unconfirmed'
    const exited = await within(
      entry.launcherExited.then(() => true),
      settings.graceMs,
    )
    return exited ? forceStop(entry) : 'unconfirmed'
  }
  const execute = async (request: ExecuteRequest): Promise<FacilityResult<ProcessHandle>> => {
    const { requestId } = request
    if (closed()) return rejected(requestId, 'closed')
    const entry = lookup(request.terminal)
    if (entry === undefined) return rejected(requestId, 'notFound')
    if (entry.state === 'closed' || entry.state === 'invalid') return rejected(requestId, 'closed')
    if (entry.state === 'running') return rejected(requestId, 'busy')
    if (request.binding.kind !== 'host_machine') return rejected(requestId, 'unsupported')
    if (
      request.script.includes('\0') ||
      (request.cwd !== undefined && !validPath(request.cwd)) ||
      (request.env !== undefined && !validEnvironment(request.env))
    )
      return rejected(requestId, 'invalidInput')
    const id = randomUUID()
    const message = {
      c: 'execute',
      id,
      script: request.script,
      ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
      ...(request.env === undefined ? {} : { env: request.env }),
      stdin: request.stdin === undefined ? '' : Buffer.from(request.stdin).toString('base64'),
    }
    if (Buffer.byteLength(JSON.stringify(message)) + 1 > settings.maxControlBytes)
      return rejected(requestId, 'invalidInput')
    const leg: Leg = {
      id,
      started: deferred(),
      result: deferred(),
      output: createTerminalOutput(settings),
      between: [],
      begun: undefined,
      startedAt: monotonicMs(),
      done: false,
    }
    entry.state = 'running'
    entry.leg = leg
    entry.reader.expectLeg(id)
    if (!send(entry, message) || !(await within(leg.started.promise, settings.startBoundMs))) {
      invalidate(entry)
      return { kind: 'unknown', requestId }
    }
    if (closed()) {
      await forceStop(entry)
      return rejected(requestId, 'closed')
    }
    const handle: ProcessHandle = Object.freeze({
      process: Object.freeze({ id, generation: entry.ref.generation }),
      outputMode: 'terminal',
      output: leg.output.output,
      outputPolicy: Object.freeze({
        maxBufferedBytes: settings.maxBufferedBytes,
        maxChunkBytes: settings.maxChunkBytes,
        overflow: 'discard',
      }),
      result: leg.result.promise,
      stop: (mode: 'graceful' | 'forced') => stopLeg(entry, leg, mode),
    })
    return { kind: 'done', requestId, value: handle }
  }
  const track = <T>(running: Promise<T>): Promise<T> => {
    inFlight.add(running)
    return running.finally(() => {
      inFlight.delete(running)
    })
  }
  const unconfirmed = () => [
    ...[...entries.values()].filter(entry => !entry.confirmed).map(entry => entry.resource),
    ...(input.reservation !== undefined &&
    entries.size === 0 &&
    (reservationPlan === 'pending' || reservationPlan === 'unconfirmed')
      ? [input.reservation.resource]
      : []),
  ]
  const facility: TerminalFacility<unknown> = {
    create: request =>
      track(
        create({
          ...request,
          env: { ...request.env },
          ...(request.geometry === undefined ? {} : { geometry: { ...request.geometry } }),
        }),
      ),
    execute: request =>
      track(
        execute({
          ...request,
          terminal: { ...request.terminal },
          ...(request.env === undefined ? {} : { env: { ...request.env } }),
          ...(request.stdin === undefined ? {} : { stdin: request.stdin.slice() }),
        }),
      ),
    close(request) {
      if (closed()) return Promise.resolve(rejected(request.requestId, 'closed'))
      const entry = lookup(request.terminal)
      if (entry === undefined) return Promise.resolve(rejected(request.requestId, 'notFound'))
      return track(
        forceStop(entry).then(status => {
          if (status === 'confirmed') entry.state = 'closed'
          return { kind: 'done', requestId: request.requestId, value: { status } }
        }),
      )
    },
    async list(request) {
      if (closed()) return rejected(request.requestId, 'closed')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: [...entries.values()].map(entry => ({
          terminal: entry.ref,
          state: entry.state,
          observedCwd: entry.cwd,
        })),
      }
    },
  }
  return Object.freeze({
    facility,
    seal() {
      sealed = true
    },
    inFlight: () => inFlight.size,
    settled: () => Promise.allSettled(inFlight).then(() => undefined),
    async stopAll() {
      await Promise.all([...entries.values()].filter(entry => !entry.confirmed).map(forceStop))
      if (
        input.reservation !== undefined &&
        entries.size === 0 &&
        reservationPlan === 'unconfirmed'
      ) {
        try {
          if ((await ledger.stopped(input.reservation.resource.key, 'confirmed')) === 'recorded')
            reservationPlan = 'settled'
        } catch {
          // No process started; only the original key's durable settlement remains unknown.
        }
      }
      return unconfirmed()
    },
    unconfirmed,
    information(ref) {
      const entry = lookup(ref)
      return entry === undefined
        ? undefined
        : {
            terminal: entry.ref,
            state: entry.state,
            observedCwd: entry.cwd,
          }
    },
  })
}

/** This boot's identity, read at once: a reservation is taken before its first wait. */
const linuxBootIdNow = (): string | undefined => {
  try {
    const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    return bootId === '' ? undefined : bootId
  } catch {
    return undefined
  }
}

export function retainedHostTerminalFactory(
  input: Omit<Input, 'ledger' | 'scope' | 'closed' | 'reservation' | 'platform'> &
    Readonly<{
      /** The platform of each retained terminal's domain; the Linux scope when absent. */
      platform?: (scope: ScopeRef) => TerminalPlatform
      bootIdNow?: () => string | undefined
    }>,
): RetainedTerminalFactory {
  return reservation => {
    const bootId = (input.bootIdNow ?? linuxBootIdNow)()
    if (bootId === undefined) return undefined
    const platform =
      input.platform?.(reservation.scope) ??
      linuxTerminalPlatform({ ...input, scope: reservation.scope })
    const { key, coordinate, reference } = platform.allocate(bootId)
    const terminal = Object.freeze({ id: key, generation: randomUUID() })
    const resource: ManagedResource = { key, provider: input.provider, reference }
    const terminals = createHostTerminals({
      ...input,
      ledger: reservation.ledger,
      scope: reservation.scope,
      closed: reservation.closed,
      platform,
      reservation: { terminal, resource, coordinate },
    })
    let started = false
    let finished = false
    const backend: RetainedTerminalBackend = {
      terminal,
      resource,
      async start() {
        if (started) return rejected(reservation.request.requestId, 'closed')
        started = true
        try {
          return await terminals.facility.create(reservation.request)
        } finally {
          finished = true
        }
      },
      execute: request => terminals.facility.execute(request),
      information: () =>
        terminals.information?.(terminal) ?? {
          terminal,
          state: finished ? 'invalid' : 'idle',
          observedCwd: reservation.request.cwd,
        },
      async stop() {
        terminals.seal()
        const pending = await terminals.stopAll()
        return (!started || finished) && pending.length === 0 && terminals.inFlight() === 0
          ? 'confirmed'
          : 'unconfirmed'
      },
    }
    return backend
  }
}
