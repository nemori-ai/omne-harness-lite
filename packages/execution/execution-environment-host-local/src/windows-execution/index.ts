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
import { createCustodySteps, ownedByAcquisition, type Custody } from '../command-custody-steps.ts'
import {
  retentionBindingOf,
  retentionExtension,
  type RetentionBinding,
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
import type { WindowsJobIndex } from './recovery.ts'
import {
  commandJobName,
  retainedJobUnit,
  stopWindowsJob,
  windowsIdentity,
  type WindowsIdentity,
} from './supervision.ts'

export type WindowsCommandsInput = Omit<HostCommandsInput, 'prerequisites' | 'unavailable'> &
  Readonly<{
    prerequisites: PrerequisiteProbe<WindowsCommandReading>
    unavailable(missing: readonly WindowsPrerequisite[]): void
    jobs?: WindowsJobIndex | undefined
  }>
type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'
const now = () =>
  /* wall-clock: operation-timing -- Bound native operations and measure process duration. */ performance.now()

function invalid(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  const path = (value: string) => win32.isAbsolute(value) && !value.includes('\0')
  if (!path(request.executable) || !path(request.cwd)) return 'invalidInput'
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
  forcing: boolean
  released: boolean
  stopReply: ReturnType<typeof deferred<StopStatus>>
  breakReply: ReturnType<typeof deferred<boolean>>
  readonly ended: ReturnType<typeof deferred<void>>
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

  const issueStop = (entry: Entry): Promise<StopStatus> => {
    entry.issued ??= (async (): Promise<StopStatus> => {
      entry.stopRequested = true
      entry.forcing = true
      if (entry.nativeStopped) return 'confirmed'
      const deadline = now() + settings.stopBoundMs
      const remaining = () => Math.max(0, deadline - now())
      entry.stopReply = deferred<StopStatus>()
      let status: StopStatus =
        entry.bridge?.send('stop') === true
          ? ((await within(entry.stopReply.promise, remaining())) ?? 'unconfirmed')
          : 'unconfirmed'
      if (status === 'unconfirmed' && remaining() > 0) {
        const named = await stopWindowsJob(entry.name, remaining())
        status =
          named === 'confirmed' || (named === 'absent' && entry.anchor !== undefined)
            ? 'confirmed'
            : 'unconfirmed'
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

  const handoverDetails = (entry: Entry, view: RetainedProcessLedger) => ({
    unit: retainedJobUnit(entry.identity.session, entry.name),
    bootId: entry.identity.boot,
    origin: entry.origin,
    gatePid: entry.anchor,
    members: entry.members,
    ledger: view,
  })

  const enterIndex = async (
    entry: Entry,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef> => {
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
    const handed = await binding.index.commit(reservation, {
      ...handoverDetails(entry, binding.processes),
      output,
    })
    if (handed.marker === 'written') await jobs?.forget(entry.resource.key)
    return handed.process
  }

  const enterIndexStopping = (
    entry: Entry,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): void => {
    entry.bridge?.send('dispose')
    void binding.index
      .commitStopping(reservation, {
        ...handoverDetails(entry, binding.processes),
        ...(entry.issued === undefined
          ? {}
          : { issued: entry.issued.then((status): StopReading => ({ status })) }),
      })
      .then(async status => {
        if (status === 'confirmed') await jobs?.forget(entry.resource.key)
      })
  }

  const custody = createCustodySteps<Entry, undefined>({
    policy: settings.residuePolicy,
    retention,
    binding: retentionBinding,
    startBoundMs: settings.startBoundMs,
    live,
    forceStop,
    enterIndex,
    enterIndexStopping,
  })

  const gracefulStop = async (entry: Entry): Promise<StopStatus> => {
    if (!entry.finished) {
      // Marked before the event, so an exit it causes counts as stopped; unmarked when none went.
      const requested = entry.stopRequested
      entry.stopRequested = true
      entry.breakReply = deferred<boolean>()
      const sent =
        entry.bridge?.send('break') === true &&
        (await within(entry.breakReply.promise, settings.stopBoundMs)) === true
      if (!sent) entry.stopRequested = requested
      const ended =
        sent &&
        (await within(
          entry.ended.promise.then(() => true),
          settings.graceMs,
        ))
      if (ended !== true) {
        try {
          await ledger.stopped(entry.resource.key, 'unconfirmed')
        } catch {}
        return 'unconfirmed'
      }
    }
    return forceStop(entry)
  }

  const stopHandle = async (entry: Entry, mode: 'graceful' | 'forced'): Promise<StopStatus> => {
    if (!(await custody.ownsForStop(entry, undefined))) return 'unconfirmed'
    return mode === 'graceful' ? gracefulStop(entry) : forceStop(entry)
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
      forcing: false,
      released: false,
      stopReply: deferred<StopStatus>(),
      breakReply: deferred<boolean>(),
      ended: deferred<void>(),
      issued: undefined,
      stopping: undefined,
      recording: undefined,
      disposition: undefined,
      resolving: undefined,
    }
    let startedAt = now()
    const elapsed = () => Math.max(0, Math.round(now() - startedAt))
    const end = () => {
      if (entry.finished) return
      entry.finished = true
      entry.ended.resolve()
      entry.buffer.close()
      outcome.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: entry.buffer.summary(),
      })
      if (entry.went && !entry.confirmed) void forceStop(entry)
    }
    const exited = (frame: Extract<BridgeFrame, { t: 'exit' }>) => {
      if (entry.finished) return
      if (entry.forcing || frame.outputLost) return end()
      entry.finished = true
      entry.ended.resolve()
      entry.buffer.close()
      entry.members = frame.members
      const durationMs = elapsed()
      const running = custody
        .dispose(entry, undefined)
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
          case 'break':
            entry.breakReply.resolve(frame.sent)
            break
          case 'fault':
            entry.nativeStopped ||= frame.stopped === true
            ready.resolve(false)
            started.resolve(false)
            entry.stopReply.resolve(entry.nativeStopped ? 'confirmed' : 'unconfirmed')
            entry.breakReply.resolve(false)
            entry.late.close()
            end()
            break
          case 'probe':
          case 'members':
          case 'identity':
            break
          default: {
            const exhaustive: never = frame
            return exhaustive
          }
        }
      },
      onClosed() {
        ready.resolve(false)
        started.resolve(false)
        entry.stopReply.resolve('unconfirmed')
        entry.breakReply.resolve(false)
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
    } catch {}
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
    const reading = await input.prerequisites.ready()
    if (reading.kind !== 'satisfied') {
      input.unavailable(reading.kind === 'unsatisfied' ? reading.missing : [])
      return rejected('unavailable')
    }
    if (sealed || ledger.closed.aborted) return rejected('closed')
    const identity = await windowsIdentity(settings.startBoundMs)
    if (identity === undefined) return rejected('unavailable')
    const key = randomUUID()
    const name = commandJobName(key)
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
    } catch {}
    if (planned !== 'recorded') return rejected(planned)
    if (
      jobs !== undefined &&
      !(await jobs.record(key, { resource, scope: input.scope.ref, identity }))
    ) {
      await Promise.resolve(ledger.stopped(key, 'confirmed')).catch(() => undefined)
      return rejected('unavailable')
    }
    return launch(request, resource, name, identity)
  }

  const facility: CommandFacility<unknown> = {
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
      await Promise.all(entries.map(entry => custody.release(entry, undefined)))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
