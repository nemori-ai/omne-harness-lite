import { randomUUID } from 'node:crypto'
import { win32 } from 'node:path'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OriginRef,
  ProcessHandle,
  ResidueReport,
  RetainedProcessLedger,
  RetainedProcessRef,
} from '@omne-harness/execution-environment-contract'
import { decideDisposition, resolveUnknownHandover, type Disposition } from '../command-custody.ts'
import {
  custodyBindingOf,
  loadedCustodyBinding,
  retentionBindingOf,
  retentionExtension,
  retentionScopeClosed,
} from '../command-retention.ts'
import {
  createLateOutput,
  createOutputBuffer,
  type HostCommands,
  type HostCommandsInput,
  type LateOutput,
  type OutputBuffer,
} from '../host-command.ts'
import type { PrerequisiteProbe } from '../host-probe.ts'
import type { RetainedReservation } from '../host-retained-processes.ts'
import type { StopReading } from '../host-scope.ts'
import { deferred, startBridge, within, type BridgeFrame } from './bridge.ts'
import type { WindowsCommandReading, WindowsPrerequisite } from './prerequisites.ts'
import { readWindowsJobReference, type WindowsJobIndex } from './recovery.ts'
import {
  retainedJobUnit,
  stopWindowsJob,
  windowsIdentity,
  type WindowsIdentity,
} from './supervision.ts'

export type WindowsCommandsInput = Omit<HostCommandsInput, 'prerequisites' | 'unavailable'> &
  Readonly<{
    prerequisites: PrerequisiteProbe<WindowsCommandReading>
    unavailable(missing: readonly WindowsPrerequisite[]): void
    /** The cold index of the state directory; absent when there is none. */
    jobs?: WindowsJobIndex | undefined
  }>
type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'
const now = () =>
  /* wall-clock: operation-timing -- Bound native operations and measure process duration. */ performance.now()
const monotonicDeadline = (boundMs: number) => now() + boundMs

function invalid(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  const path = (value: string) => win32.isAbsolute(value) && !value.includes('\0')
  if (!path(request.executable) || !path(request.cwd)) return 'invalidInput'
  // CreateProcessW runs a batch file through cmd.exe, which parses the arguments again.
  if (/\.(?:bat|cmd)$/iu.test(request.executable)) return 'unsupported'
  if (request.args.some(value => value.includes('\0'))) return 'invalidInput'
  if (
    Object.entries(request.env).some(
      ([key, value]) => !key || key.includes('=') || key.includes('\0') || value.includes('\0'),
    )
  )
    return 'invalidInput'
  const controlSize =
    Buffer.byteLength(
      JSON.stringify({
        executable: request.executable,
        cwd: request.cwd,
        args: request.args,
        env: request.env,
      }),
      'utf8',
    ) +
    4 * Math.ceil((request.stdin?.byteLength ?? 0) / 3) +
    256
  if (controlSize > 2 * 1024 * 1024) return 'capacity'
  return undefined
}

/** The forced stop of the Job a resource names, by its name. */
export async function stopWindowsResource(
  resource: ManagedResource,
  boundMs: number,
): Promise<StopStatus> {
  const name = readWindowsJobReference(resource.reference)
  if (
    process.platform !== 'win32' ||
    name === undefined ||
    (name !== `Local\\omne-command-${resource.key}` &&
      name !== `Local\\omne-terminal-${resource.key}`)
  )
    return 'unconfirmed'
  const status = await stopWindowsJob(name, boundMs)
  // Without the Job's boot and session a missing name proves nothing.
  return status === 'confirmed' ? 'confirmed' : 'unconfirmed'
}

/**
 * Who carries the stop duty for the Job, with the meaning the Linux facility gives it:
 * `acquisition` from the start; `reserved` while a handover is decided and committed; `unknown`
 * while the commit's result is unread; `handedOver` once the commit took effect. Only the first two
 * are this acquisition's. Every transition is synchronous, with the rechecks that justify it.
 */
type Custody =
  | Readonly<{ kind: 'acquisition' }>
  | Readonly<{ kind: 'reserved' }>
  | Readonly<{ kind: 'handedOver' }>
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

const ownedByAcquisition = (custody: Custody) =>
  custody.kind === 'acquisition' || custody.kind === 'reserved'

/** One command in its own anchored Job: the bridge, its frames, its custody and its stop. */
type Entry = {
  readonly resource: ManagedResource
  readonly name: string
  readonly origin: OriginRef
  readonly identity: WindowsIdentity
  readonly buffer: OutputBuffer
  readonly late: LateOutput
  bridge: Bridge | undefined
  anchor: number | undefined
  members: number | null
  custody: Custody
  went: boolean
  finished: boolean
  confirmed: boolean
  nativeStopped: boolean
  stopRequested: boolean
  released: boolean
  stopReply: ReturnType<typeof deferred<StopStatus>>
  issued: Promise<StopStatus> | undefined
  stopping: Promise<StopStatus> | undefined
  recording:
    | { readonly status: StopStatus; readonly result: Promise<'recorded' | 'unavailable'> }
    | undefined
  disposition: Promise<unknown> | undefined
  resolving: Promise<void> | undefined
}

type Bridge = Awaited<ReturnType<typeof startBridge>>

export function createWindowsHostCommands(input: WindowsCommandsInput): HostCommands {
  const { settings, ledger, retention, retained, tenant, jobs } = input
  const live = new Set<Entry>()
  const pending = new Set<Promise<unknown>>()
  let sealed = false
  const retentionBinding = retentionBindingOf({ retention, retained, scope: input.scope, tenant })
  const scopeClosed = () => retentionScopeClosed(retentionBinding)
  const bindingOf = (entry: Entry) =>
    custodyBindingOf({
      policy: settings.residuePolicy,
      retention,
      binding: retentionBinding,
      resource: entry.resource,
    })

  /** The native stop of the Job, once per sequence: through the bridge, else by the Job's name. */
  const issueStop = (entry: Entry): Promise<StopStatus> => {
    entry.issued ??= (async (): Promise<StopStatus> => {
      entry.stopRequested = true
      if (entry.nativeStopped) return 'confirmed'
      const deadline = now() + settings.stopBoundMs
      const remaining = () => Math.max(0, deadline - now())
      entry.stopReply = deferred<StopStatus>()
      let status: StopStatus =
        entry.bridge?.send('stop') === true
          ? ((await within(entry.stopReply.promise, remaining())) ?? 'unconfirmed')
          : 'unconfirmed'
      if (status === 'unconfirmed' && remaining() > 0) {
        // This process created the Job: a missing name means its last handle closed and
        // `KILL_ON_JOB_CLOSE` stopped every member.
        const named = await stopWindowsJob(entry.name, remaining())
        status = named === 'unconfirmed' ? 'unconfirmed' : 'confirmed'
      }
      if (status === 'confirmed') {
        entry.nativeStopped = true
        entry.bridge?.send('dispose')
        entry.bridge?.disconnect()
      }
      return status
    })()
    return entry.issued
  }

  /**
   * The forced stop of a Job this acquisition owns, recorded on its ledger once the disposition
   * settled; a Job handed over meanwhile is the index's to stop and record.
   */
  const forceStop = (entry: Entry): Promise<StopStatus> => {
    if (entry.confirmed) return Promise.resolve('confirmed')
    if (entry.stopping !== undefined) return entry.stopping
    if (!ownedByAcquisition(entry.custody)) return Promise.resolve('unconfirmed')
    entry.stopping = (async (): Promise<StopStatus> => {
      const deadline = now() + settings.stopBoundMs
      const remaining = () => Math.max(0, deadline - now())
      const status = await issueStop(entry)
      await entry.disposition
      if (!ownedByAcquisition(entry.custody)) return status
      let recorded = false
      let answered = false
      try {
        entry.recording ??= { status, result: ledger.stopped(entry.resource.key, status) }
        const answer = await within(entry.recording.result, remaining())
        answered = answer !== undefined
        recorded = entry.recording.status === status && answer === 'recorded'
        if (answer !== undefined) entry.recording = undefined
      } catch {
        entry.recording = undefined
        /* Ledger failure retains responsibility. */
      }
      if (status === 'confirmed' && recorded) {
        entry.confirmed = true
        live.delete(entry)
        await jobs?.forget(entry.resource.key)
        if (entry.bridge !== undefined) await within(entry.bridge.closed, remaining())
      }
      return answered ? status : 'unconfirmed'
    })().finally(() => {
      entry.stopping = undefined
      entry.issued = undefined
    })
    return entry.stopping
  }

  /** What the handover records about the Job, for the index. */
  const handoverDetails = (entry: Entry, view: RetainedProcessLedger) => ({
    unit: retainedJobUnit(entry.identity.session, entry.name),
    bootId: entry.identity.boot,
    origin: entry.origin,
    gatePid: entry.anchor,
    members: entry.members,
    ledger: view,
  })

  /**
   * The commit took effect and the Job is whole: the bridge stops reading control and keeps
   * draining the pipes into the Job's tail, and the index holds the Job as running.
   */
  const enterIndex = async (
    entry: Entry,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef> => {
    if (retentionBinding === undefined) throw new Error('a handover without a retention binding')
    entry.bridge?.send('dispose')
    const counted = entry.buffer.summary()
    const late = entry.late.observed()
    const output =
      settings.retainedOutputBytes === 0
        ? ('unsupported' as const)
        : entry.late.keep({
            capacity: settings.retainedOutputBytes,
            savedFrom: {
              stdout: counted.stdout.observedBytes + late.stdout,
              stderr: counted.stderr.observedBytes + late.stderr,
            },
          })
    entry.bridge?.unref()
    const handed = await retentionBinding.index.commit(reservation, {
      ...handoverDetails(entry, retentionBinding.processes),
      output,
    })
    // The retained-process index holds the Job now, with its own marker.
    await jobs?.forget(entry.resource.key)
    return handed.process
  }

  /** The commit took effect, but the Job was stopped, released or its scope closed meanwhile. */
  const enterIndexStopping = (entry: Entry, reservation: RetainedReservation): void => {
    if (retentionBinding === undefined) throw new Error('a handover without a retention binding')
    entry.bridge?.send('dispose')
    void retentionBinding.index
      .commitStopping(reservation, {
        ...handoverDetails(entry, retentionBinding.processes),
        ...(entry.issued === undefined
          ? {}
          : { issued: entry.issued.then((status): StopReading => ({ status })) }),
      })
      .finally(() => jobs?.forget(entry.resource.key))
  }

  /** Carries out a disposition; the custody changes in the same step as the readings behind it. */
  const apply = async (
    entry: Entry,
    decision: Disposition,
    interrupted: () => boolean,
  ): Promise<ResidueReport> => {
    switch (decision.kind) {
      case 'stop':
        entry.custody = { kind: 'acquisition' }
        void forceStop(entry)
        return decision.residue
      case 'unknown':
        entry.custody = { kind: 'unknown', reservation: decision.reservation }
        return { kind: 'unknown' }
      case 'retained':
      case 'retainedInterrupted': {
        entry.custody = { kind: 'handedOver' }
        live.delete(entry)
        if (decision.kind === 'retainedInterrupted' || interrupted() || scopeClosed()) {
          enterIndexStopping(entry, decision.reservation)
          return { kind: 'stopping', reason: 'closed' }
        }
        const process = await enterIndex(entry, decision.reservation)
        return { kind: 'retained', process, processes: entry.members ?? 'unknown' }
      }
      default: {
        const exhaustive: never = decision
        return exhaustive
      }
    }
  }

  /** The disposition after the exit frame, bounded by the start bound, the index's loading included. */
  const dispose = async (entry: Entry): Promise<ResidueReport> => {
    const deadline = monotonicDeadline(settings.startBoundMs)
    const binding = await loadedCustodyBinding(
      bindingOf(entry),
      retentionBinding,
      entry.members,
      deadline,
    )
    entry.custody = { kind: 'reserved' }
    const interrupted = () => entry.stopRequested || entry.released
    const decision = await decideDisposition({
      members: entry.members,
      binding,
      deadline,
      interrupted,
    })
    return apply(entry, decision, interrupted)
  }

  /** Asks the commit again for a Job whose handover result is unread; one resolution at a time. */
  const resolveUnknown = (entry: Entry): Promise<void> => {
    entry.resolving ??= (async () => {
      const custody = entry.custody
      if (custody.kind !== 'unknown') return
      const binding = bindingOf(entry)
      if (typeof binding === 'string') return
      const interrupted = () => entry.stopRequested
      const decision = await resolveUnknownHandover({
        binding,
        reservation: custody.reservation,
        deadline: monotonicDeadline(settings.startBoundMs),
        interrupted,
      })
      if (decision.kind === 'unknown' || entry.custody.kind !== 'unknown') return
      const running = apply(entry, decision, interrupted)
      entry.disposition = running
      const stopping = entry.stopping
      await running
      await stopping
    })()
      .catch(() => undefined)
      .finally(() => {
        entry.resolving = undefined
      })
    return entry.resolving
  }

  /** A stop asked through the handle acts only on a Job this acquisition owns. */
  const stopHandle = async (entry: Entry, mode: 'graceful' | 'forced'): Promise<StopStatus> => {
    if (mode === 'graceful') return 'unconfirmed'
    if (entry.custody.kind === 'unknown') await resolveUnknown(entry)
    if (!ownedByAcquisition(entry.custody)) return 'unconfirmed'
    return forceStop(entry)
  }

  /** The release of one Job: the custody is read again here, so a handover meanwhile is left alone. */
  const release = async (entry: Entry): Promise<void> => {
    switch (entry.custody.kind) {
      case 'acquisition':
      case 'reserved':
        await forceStop(entry)
        return
      case 'unknown':
        await resolveUnknown(entry)
        return
      case 'handedOver':
        return
      default: {
        const exhaustive: never = entry.custody
        return exhaustive
      }
    }
  }

  async function launch(
    request: StartRequest,
    resource: ManagedResource,
    name: string,
    identity: WindowsIdentity,
  ): Promise<FacilityResult<ProcessHandle>> {
    const ready = deferred<boolean>()
    const started = deferred<boolean>()
    const outcome = deferred<CommandOutcome>()
    const entry: Entry = {
      resource,
      name,
      origin: request.origin,
      identity,
      buffer: createOutputBuffer({ maxBufferedBytes: settings.maxBufferedBytes }),
      late: createLateOutput(),
      bridge: undefined,
      anchor: undefined,
      members: null,
      custody: { kind: 'acquisition' },
      went: false,
      finished: false,
      confirmed: false,
      nativeStopped: false,
      stopRequested: false,
      released: false,
      stopReply: deferred<StopStatus>(),
      issued: undefined,
      stopping: undefined,
      recording: undefined,
      disposition: undefined,
      resolving: undefined,
    }
    let startedAt = now()
    const elapsed = () => Math.max(0, Math.round(now() - startedAt))
    /** The bridge went away, its frames broke, or a stop ended the command: the effect is unknown. */
    const end = () => {
      if (entry.finished) return
      entry.finished = true
      entry.buffer.close()
      outcome.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: entry.buffer.summary(),
      })
      // What a command left in its Job, or a bridge that went away, is cleared by a forced stop.
      if (entry.went && !entry.confirmed) void forceStop(entry)
    }
    /** The main process exited: the outcome waits for the disposition, which precedes any stop or handover. */
    const exited = (frame: Extract<BridgeFrame, { t: 'exit' }>) => {
      if (entry.finished) return
      if (entry.stopRequested || frame.outputLost) return end()
      entry.finished = true
      entry.buffer.close()
      entry.members = frame.members
      const durationMs = elapsed()
      const running = dispose(entry)
        // A disposition that itself failed has no result: the Job stays with the acquisition.
        .catch((): ResidueReport => ({ kind: 'unknown' }))
        .then(residue => {
          outcome.resolve({
            kind: 'completed',
            exit: { kind: 'code', code: frame.code },
            durationMs,
            output: entry.buffer.summary(),
            residue,
          })
        })
      entry.disposition = running
    }
    entry.bridge = await startBridge({
      request: {
        mode: 'command',
        name,
        executable: request.executable,
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        stdin: request.stdin === undefined ? null : Buffer.from(request.stdin).toString('base64'),
        maxChunkBytes: settings.maxChunkBytes,
        stopBoundMs: settings.stopBoundMs,
      },
      maxChunkBytes: settings.maxChunkBytes,
      onFrame(frame) {
        switch (frame.t) {
          case 'ready':
            entry.anchor = frame.anchor
            ready.resolve(true)
            break
          case 'started':
            startedAt = now()
            started.resolve(true)
            break
          case 'data': {
            const bytes = Buffer.from(frame.b, 'base64')
            if (entry.finished) entry.late.append(frame.s, bytes)
            else entry.buffer.push(frame.s, bytes)
            break
          }
          case 'exit':
            exited(frame)
            break
          case 'stopped':
            if (frame.status === 'confirmed') entry.nativeStopped = true
            entry.stopReply.resolve(frame.status)
            break
          case 'fault':
            entry.nativeStopped ||= frame.stopped === true
            ready.resolve(false)
            started.resolve(false)
            entry.stopReply.resolve(entry.nativeStopped ? 'confirmed' : 'unconfirmed')
            entry.late.close()
            end()
            break
          case 'probe':
          case 'members':
          case 'identity':
            break
        }
      },
      onClosed() {
        ready.resolve(false)
        started.resolve(false)
        entry.stopReply.resolve('unconfirmed')
        // The frame channel is gone: a tail the handover gave, or gives later, observes nothing more.
        entry.late.close()
        end()
      },
    })
    live.add(entry)
    const refuse = async (reason: FacilityReason): Promise<FacilityResult<never>> => {
      await forceStop(entry)
      return { kind: 'rejected', requestId: request.requestId, reason }
    }
    const prepared = await within(ready.promise, settings.startBoundMs)
    if (prepared === undefined) {
      entry.bridge.disconnect()
      return { kind: 'unknown', requestId: request.requestId }
    }
    if (!prepared) return refuse('unavailable')
    let permit: Awaited<ReturnType<typeof ledger.permit>> = 'unavailable'
    try {
      permit = await ledger.permit(resource.key)
    } catch {
      /* No GO without a confirmed permit. */
    }
    if (permit !== 'confirmed') return refuse(permit)
    if (sealed || ledger.closed.aborted) return refuse('closed')
    entry.went = true
    entry.bridge.send('go')
    const running = await within(started.promise, settings.startBoundMs)
    if (running !== true) return { kind: 'unknown', requestId: request.requestId }
    return {
      kind: 'done',
      requestId: request.requestId,
      value: Object.freeze({
        process: Object.freeze({ id: name, generation: resource.key }),
        outputMode: 'separate',
        output: entry.buffer.output,
        outputPolicy: Object.freeze({
          maxBufferedBytes: settings.maxBufferedBytes,
          maxChunkBytes: settings.maxChunkBytes,
          overflow: 'discard',
        }),
        result: outcome.promise,
        stop: (mode: 'graceful' | 'forced') => stopHandle(entry, mode),
      }),
    }
  }

  async function start(request: StartRequest): Promise<FacilityResult<ProcessHandle>> {
    const rejected = (reason: FacilityReason): FacilityResult<never> => ({
      kind: 'rejected',
      requestId: request.requestId,
      reason,
    })
    const issue = invalid(request)
    if (issue !== undefined) return rejected(issue)
    // The checks before anything exists, in the order of the Linux facility: request, platform, facade.
    const reading = await input.prerequisites.ready()
    if (reading.kind !== 'satisfied') {
      input.unavailable(reading.kind === 'unsatisfied' ? reading.missing : [])
      return rejected('unavailable')
    }
    if (sealed || ledger.closed.aborted) return rejected('closed')
    const identity = await windowsIdentity(settings.stopBoundMs)
    if (identity === undefined) return rejected('unavailable')
    const key = randomUUID()
    const name = `Local\\omne-command-${key}`
    const resource: ManagedResource = {
      key,
      provider: input.provider,
      reference: {
        kind: 'object',
        entries: [
          { key: 'windowsJob', value: { kind: 'string', value: name } },
          { key: 'generation', value: { kind: 'string', value: key } },
          { key: 'scope', value: { kind: 'string', value: input.scope.ref } },
        ],
      },
    }
    let planned: Awaited<ReturnType<typeof ledger.plan>> = 'unavailable'
    try {
      planned = await ledger.plan(resource)
    } catch {
      /* A failed durable plan prevents native allocation. */
    }
    if (planned !== 'recorded') return rejected(planned)
    // The marker precedes the Job, so a restarted provider finds every Job that may exist.
    if (
      jobs !== undefined &&
      !(await jobs.record(key, { resource, scope: input.scope.ref, identity }))
    ) {
      // Nothing native exists: the planned resource is settled as stopped.
      await Promise.resolve(ledger.stopped(key, 'confirmed')).catch(() => undefined)
      return rejected('unavailable')
    }
    return launch(request, resource, name, identity)
  }

  const facility: CommandFacility<unknown> = {
    // Every command runs in its own Job with breakaway forbidden: no process can leave it.
    containment: 'sealed',
    start(request: StartRequest) {
      const snapshot = {
        ...request,
        args: [...request.args],
        env: { ...request.env },
        ...(request.stdin === undefined ? {} : { stdin: new Uint8Array(request.stdin) }),
      }
      const work = start(snapshot)
      pending.add(work)
      return work.finally(() => pending.delete(work))
    },
    ...(retentionBinding === undefined
      ? {}
      : { retention: retentionExtension(retentionBinding, () => sealed) }),
  }

  return Object.freeze({
    facility,
    seal() {
      sealed = true
    },
    inFlight: () => pending.size,
    settled: () => Promise.allSettled(pending).then(() => undefined),
    async stopAll() {
      const entries = [...live]
      for (const entry of entries) entry.released = true
      await Promise.all(entries.map(release))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
