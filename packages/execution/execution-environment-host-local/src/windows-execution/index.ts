import { randomUUID } from 'node:crypto'
import { win32 } from 'node:path'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  ProcessHandle,
  ResidueReport,
} from '@omne-harness/execution-environment-contract'
import {
  createOutputBuffer,
  type HostCommands,
  type HostCommandsInput,
  type ResiduePolicy,
} from '../host-command.ts'
import type { PrerequisiteProbe } from '../host-probe.ts'
import { deferred, startBridge, within, type BridgeFrame } from './bridge.ts'
import { windowsBridgeExecutable } from './compile.ts'
import type { WindowsCommandReading, WindowsPrerequisite } from './prerequisites.ts'

export type WindowsCommandsInput = Omit<
  HostCommandsInput,
  'prerequisites' | 'unavailable' | 'tenant'
> &
  Readonly<{
    prerequisites: PrerequisiteProbe<WindowsCommandReading>
    unavailable(missing: readonly WindowsPrerequisite[]): void
  }>
type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'
type LiveCommand = { readonly resource: ManagedResource; stop(): Promise<StopStatus> }
const now = () =>
  /* wall-clock: operation-timing -- Bound native operations and measure process duration. */ performance.now()

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

/**
 * The residue of a Job whose main process exited. Until the provider hands Jobs over, every
 * leftover is stopped; an unread count is not empty.
 */
export function windowsResidue(
  members: number | null,
  policy: ResiduePolicy,
): Extract<ResidueReport, { kind: 'none' | 'stopping' }> {
  if (members === 0) return { kind: 'none' }
  return { kind: 'stopping', reason: policy === 'stop' ? 'policy' : 'uncontained' }
}

export function readWindowsJobReference(
  reference: ManagedResource['reference'],
): string | undefined {
  if (reference.kind !== 'object') return undefined
  const name = reference.entries.find(entry => entry.key === 'windowsJob')?.value
  return name?.kind === 'string' &&
    /^Local\\omne-(?:command|terminal)-[a-f0-9-]{36}$/u.test(name.value)
    ? name.value
    : undefined
}

export async function stopWindowsResource(
  resource: ManagedResource,
  boundMs: number,
): Promise<StopStatus> {
  const deadline = now() + boundMs
  const remaining = () => Math.max(0, deadline - now())
  const name = readWindowsJobReference(resource.reference)
  if (
    process.platform !== 'win32' ||
    name === undefined ||
    (name !== `Local\\omne-command-${resource.key}` &&
      name !== `Local\\omne-terminal-${resource.key}`)
  )
    return 'unconfirmed'
  try {
    if ((await within(windowsBridgeExecutable(), remaining())) === undefined) return 'unconfirmed'
  } catch {
    return 'unconfirmed'
  }
  const reply = deferred<StopStatus>()
  if (remaining() <= 0) return 'unconfirmed'
  const bridge = await startBridge({
    request: { mode: 'recover', name, stopBoundMs: Math.ceil(remaining()) },
    maxChunkBytes: 1,
    onFrame: frame => {
      if (frame.t === 'stopped') reply.resolve(frame.status)
      if (frame.t === 'fault') reply.resolve('unconfirmed')
    },
    onClosed: () => reply.resolve('unconfirmed'),
  })
  const status = (await within(reply.promise, remaining())) ?? 'unconfirmed'
  bridge.disconnect()
  if (
    (await within(
      bridge.closed.then(() => true),
      remaining(),
    )) !== true
  )
    bridge.terminate()
  return status
}

export function createWindowsHostCommands(input: WindowsCommandsInput): HostCommands {
  const { settings, ledger } = input
  const live = new Set<LiveCommand>()
  const pending = new Set<Promise<unknown>>()
  let sealed = false

  async function launch(
    request: StartRequest,
    resource: ManagedResource,
    name: string,
  ): Promise<FacilityResult<ProcessHandle>> {
    const buffer = createOutputBuffer({ maxBufferedBytes: settings.maxBufferedBytes })
    const ready = deferred<boolean>()
    const started = deferred<boolean>()
    const outcome = deferred<CommandOutcome>()
    let stopReply = deferred<StopStatus>()
    let stopping: Promise<StopStatus> | undefined
    let recording:
      | { readonly status: StopStatus; readonly result: Promise<'recorded' | 'unavailable'> }
      | undefined
    let confirmed = false
    let nativeStopped = false
    let finished = false
    let went = false
    let stopIssued = false
    let startedAt = now()
    const elapsed = () => Math.max(0, Math.round(now() - startedAt))
    /** The bridge went away, its frames broke, or a stop ended the command: the effect is unknown. */
    const end = () => {
      if (finished) return
      finished = true
      buffer.close()
      outcome.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: buffer.summary(),
      })
      // What a command left in its Job, or a bridge that went away, is cleared by a forced stop.
      if (went && !confirmed) void entry.stop()
    }
    /** The main process exited; the provider, not the bridge, decides what becomes of the Job. */
    const exited = (frame: Extract<BridgeFrame, { t: 'exit' }>) => {
      if (finished) return
      if (stopIssued || frame.outputLost) return end()
      finished = true
      buffer.close()
      const durationMs = elapsed()
      const residue = windowsResidue(frame.members, settings.residuePolicy)
      void entry.stop()
      outcome.resolve({
        kind: 'completed',
        exit: { kind: 'code', code: frame.code },
        durationMs,
        output: buffer.summary(),
        residue,
      })
    }
    const bridge = await startBridge({
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
            ready.resolve(true)
            break
          case 'started':
            startedAt = now()
            started.resolve(true)
            break
          case 'data':
            if (!finished) buffer.push(frame.s, Buffer.from(frame.b, 'base64'))
            break
          case 'exit':
            exited(frame)
            break
          case 'probe':
            break
          case 'stopped':
            if (frame.status === 'confirmed') nativeStopped = true
            stopReply.resolve(frame.status)
            break
          case 'fault':
            nativeStopped ||= frame.stopped === true
            ready.resolve(false)
            started.resolve(false)
            stopReply.resolve(nativeStopped ? 'confirmed' : 'unconfirmed')
            end()
            break
        }
      },
      onClosed() {
        ready.resolve(false)
        started.resolve(false)
        stopReply.resolve('unconfirmed')
        end()
      },
    })
    const entry: LiveCommand = {
      resource,
      stop() {
        if (confirmed) return Promise.resolve('confirmed')
        stopIssued = true
        stopping ??= (async (): Promise<StopStatus> => {
          const deadline = now() + settings.stopBoundMs
          const remaining = () => Math.max(0, deadline - now())
          stopReply = deferred<StopStatus>()
          const sent = !nativeStopped && bridge.send('stop')
          let status: StopStatus = nativeStopped
            ? 'confirmed'
            : sent
              ? ((await within(stopReply.promise, remaining())) ?? 'unconfirmed')
              : 'unconfirmed'
          if (status === 'unconfirmed' && remaining() > 0)
            status = await stopWindowsResource(resource, remaining())
          if (status === 'confirmed') {
            nativeStopped = true
            bridge.send('dispose')
            bridge.disconnect()
          }
          let recorded = false
          let answered = false
          try {
            recording ??= { status, result: ledger.stopped(resource.key, status) }
            const answer = await within(recording.result, remaining())
            answered = answer !== undefined
            recorded = recording.status === status && answer === 'recorded'
            if (answer !== undefined) recording = undefined
          } catch {
            recording = undefined
            /* Ledger failure retains responsibility. */
          }
          if (status === 'confirmed' && recorded) {
            confirmed = true
            live.delete(entry)
            await within(bridge.closed, remaining())
          }
          return answered ? status : 'unconfirmed'
        })().finally(() => {
          stopping = undefined
        })
        return stopping
      },
    }
    live.add(entry)
    const refuse = async (reason: FacilityReason): Promise<FacilityResult<never>> => {
      await entry.stop()
      return { kind: 'rejected', requestId: request.requestId, reason }
    }
    const prepared = await within(ready.promise, settings.startBoundMs)
    if (prepared === undefined) {
      bridge.disconnect()
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
    went = true
    bridge.send('go')
    const running = await within(started.promise, settings.startBoundMs)
    if (running !== true) return { kind: 'unknown', requestId: request.requestId }
    return {
      kind: 'done',
      requestId: request.requestId,
      value: Object.freeze({
        process: Object.freeze({ id: name, generation: resource.key }),
        outputMode: 'separate',
        output: buffer.output,
        outputPolicy: Object.freeze({
          maxBufferedBytes: settings.maxBufferedBytes,
          maxChunkBytes: settings.maxChunkBytes,
          overflow: 'discard',
        }),
        result: outcome.promise,
        stop: (mode: 'graceful' | 'forced'): Promise<StopStatus> =>
          mode === 'forced' ? entry.stop() : Promise.resolve('unconfirmed'),
      }),
    }
  }

  async function start(request: StartRequest): Promise<FacilityResult<ProcessHandle>> {
    const issue = invalid(request)
    if (issue !== undefined)
      return { kind: 'rejected', requestId: request.requestId, reason: issue }
    // The checks before anything exists, in the order of the Linux facility: request, platform, facade.
    const reading = await input.prerequisites.ready()
    if (reading.kind !== 'satisfied') {
      input.unavailable(reading.kind === 'unsatisfied' ? reading.missing : [])
      return { kind: 'rejected', requestId: request.requestId, reason: 'unavailable' }
    }
    if (sealed || ledger.closed.aborted)
      return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
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
    if (planned !== 'recorded')
      return { kind: 'rejected', requestId: request.requestId, reason: planned }
    return launch(request, resource, name)
  }

  return Object.freeze({
    facility: {
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
    },
    seal() {
      sealed = true
    },
    inFlight: () => pending.size,
    settled: () => Promise.allSettled(pending).then(() => undefined),
    async stopAll() {
      await Promise.all([...live].map(entry => entry.stop()))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
