import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
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
  createGateReader,
  createOutputBuffer,
  type GateFrame,
  type HostCommands,
  type HostCommandsInput,
  type OutputBuffer,
} from '../host-command.ts'
import type { SessionReader } from './compile.ts'
import { domainReference, type DomainIndex } from './domain-index.ts'
import { macosResidue } from './residue.ts'
import {
  readBootId,
  readIdentity,
  stopRecordedDomain,
  type SessionCoordinate,
  type StopStatus,
} from './session.ts'

/** A macOS prerequisite a start found missing. */
export type MacosPrerequisite =
  | 'command-line-tools'
  | 'session-reader'
  | 'bash'
  | 'node-pty'
  | 'spawn-helper'

export type MacosCommandsInput = Omit<
  HostCommandsInput,
  'prerequisites' | 'retained' | 'unavailable'
> &
  Readonly<{
    /** The session reader, compiled on first use. */
    reader(): Promise<SessionReader>
    /** The cold index of the state directory; absent when there is none. */
    domains: DomainIndex | undefined
    unavailable(missing: readonly MacosPrerequisite[]): void
  }>

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
type Event = 'ready' | 'started' | 'spawnFailed' | 'ended' | 'late'

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a start and measure a process duration. */ performance.now()

const gateScript = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './command-gate.ts' : './command-gate.js',
    import.meta.url,
  ),
)

/** The environment of the gate itself: nothing of the provider's, so no secret reaches its session. */
export const gateEnvironment: Readonly<Record<string, string>> = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
})

const hasNul = (text: string) => text.includes('\u0000')
const invalidPath = (path: string) => !isAbsolute(path) || hasNul(path)

/** The request checks that need no process, in the order of the Linux facility. */
export function macosRequestIssue(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  if (invalidPath(request.executable) || invalidPath(request.cwd)) return 'invalidInput'
  if (request.args.some(arg => typeof arg !== 'string' || hasNul(arg))) return 'invalidInput'
  const invalidVariable = ([name, value]: readonly [string, unknown]) =>
    name === '' || name.includes('=') || hasNul(name) || typeof value !== 'string' || hasNul(value)
  if (Object.entries(request.env).some(invalidVariable)) return 'invalidInput'
  return undefined
}

/** What the reader's absence means as missing prerequisites. */
export const readerMissing = (
  reading: Extract<SessionReader, { kind: 'missing' }>,
): MacosPrerequisite =>
  reading.missing === 'commandLineTools' ? 'command-line-tools' : 'session-reader'

/** One command in its own session: the gate, its frames and its stop. */
type Entry = {
  readonly resource: ManagedResource
  readonly gate: ChildProcess
  readonly buffer: OutputBuffer
  readonly outcome: Promise<CommandOutcome>
  /** Known once the gate reported ready and its identity was read; before that no command ran. */
  coordinate: SessionCoordinate | undefined
  gateGone: boolean
  ended: boolean
  confirmed: boolean
  startedAt: number | undefined
  exit: Extract<GateFrame, { kind: 'exit' }>['exit'] | undefined
  members: number | null
  stopRequested: boolean
  released: boolean
  stopping: Promise<StopStatus> | undefined
  signal: ((event: Exclude<Event, 'late'>) => void) | undefined
  readonly exited: Promise<void>
  sendControl(message: Readonly<Record<string, unknown>>): void
  closeControl(): void
}

function deferred<T>(): Readonly<{ promise: Promise<T>; settle(value: T): void }> {
  let settle: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolve => {
    settle = resolve
  })
  return { promise, settle }
}

function nextEvent(entry: Entry, deadline: number): Promise<Event> {
  return new Promise(resolve => {
    if (entry.ended) return resolve('ended')
    const timer = setTimeout(
      () => {
        entry.signal = undefined
        resolve('late')
      },
      Math.max(0, deadline - monotonicMs()),
    )
    entry.signal = event => {
      clearTimeout(timer)
      entry.signal = undefined
      resolve(event)
    }
  })
}

/**
 * The command facility of one acquisition on macOS. Each command runs in a new POSIX session led
 * by its gate. Sessions do not meet closed containment, so nothing is retained: after the main
 * process exits the whole session is stopped, and `residue` tells why. A stop is confirmed only
 * when the session reader finds the session empty.
 */
export function createMacosHostCommands(input: MacosCommandsInput): HostCommands {
  const { settings, ledger, retention } = input
  const live = new Set<Entry>()
  const inFlight = new Set<Promise<unknown>>()
  let sealed = false

  const scopeClosed = () =>
    retention !== undefined &&
    (retention.released.aborted || retention.processes?.closed.aborted === true)

  const forceStop = (entry: Entry): Promise<StopStatus> => {
    if (entry.confirmed) return Promise.resolve('confirmed')
    entry.stopping ??= (async (): Promise<StopStatus> => {
      entry.stopRequested = true
      const reading = await input.reader()
      let status: StopStatus = 'unconfirmed'
      const coordinate = entry.coordinate
      if (coordinate === undefined) {
        // No session was recorded: no GO went out, so no command ran. The gate alone is stopped.
        if (!entry.gateGone) entry.gate.kill('SIGKILL')
        status = await Promise.race([
          entry.exited.then((): StopStatus => 'confirmed'),
          new Promise<StopStatus>(resolve =>
            setTimeout(resolve, settings.stopBoundMs, 'unconfirmed'),
          ),
        ])
      } else if (reading.kind === 'ready')
        status = await stopRecordedDomain({
          reader: reading.path,
          coordinate,
          bootId: await readBootId(),
          boundMs: settings.stopBoundMs,
        })
      // The session went first, the gate with it; only then the channel, as on Linux, so a stopped
      // command ends as effectUnknown rather than with an exit frame of the gate's own stop.
      entry.closeControl()
      let recorded: Awaited<ReturnType<typeof ledger.stopped>> = 'unavailable'
      try {
        recorded = await ledger.stopped(entry.resource.key, status)
      } catch {
        /* The ledger did not record it: the stop responsibility stays open. */
      }
      if (status === 'confirmed' && recorded === 'recorded') {
        // A marker that cannot be removed stays listed; its recovery finds the session empty.
        await input.domains?.forget(entry.resource.key)
        entry.confirmed = true
        live.delete(entry)
      }
      return status
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }

  const gracefulStop = async (entry: Entry): Promise<StopStatus> => {
    if (entry.exit === undefined && !entry.ended) {
      entry.sendControl({ c: 'term' })
      const exited = await Promise.race([
        entry.exited.then(() => true),
        new Promise<false>(resolve => setTimeout(resolve, settings.graceMs, false)),
      ])
      if (!exited) {
        try {
          await ledger.stopped(entry.resource.key, 'unconfirmed')
        } catch {
          /* Unconfirmed either way. */
        }
        return 'unconfirmed'
      }
    }
    return forceStop(entry)
  }

  /** The residue after the exit frame; the whole session is stopped either way. */
  const dispose = (entry: Entry): ResidueReport => {
    const residue = macosResidue({
      members: entry.members,
      policy: settings.residuePolicy,
      bound: retention?.processes !== undefined,
      sameScope: retention?.scope.ref === input.scope.ref,
      closed: scopeClosed() || entry.released || entry.stopRequested,
    })
    void forceStop(entry)
    return residue
  }

  const launch = (resource: ManagedResource, request: StartRequest, reader: string): Entry => {
    const gate = spawn(process.execPath, [gateScript, resource.key, reader], {
      detached: true,
      cwd: '/',
      env: { ...gateEnvironment },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
    const pipe = gate.stdio[3]
    const writable: Writable | undefined =
      pipe !== null && pipe !== undefined && 'write' in pipe ? pipe : undefined
    writable?.on('error', () => undefined)
    gate.stderr?.resume()
    const buffer = createOutputBuffer({ maxBufferedBytes: settings.maxBufferedBytes })
    const frames = createGateReader({ maxChunkBytes: settings.maxChunkBytes })
    const outcome = deferred<CommandOutcome>()
    const exited = deferred<void>()
    const entry: Entry = {
      resource,
      gate,
      buffer,
      outcome: outcome.promise,
      coordinate: undefined,
      gateGone: false,
      ended: false,
      confirmed: false,
      startedAt: undefined,
      exit: undefined,
      members: null,
      stopRequested: false,
      released: false,
      stopping: undefined,
      signal: undefined,
      exited: exited.promise,
      closeControl: () => writable?.end(),
      sendControl: message => {
        if (writable !== undefined && !writable.writableEnded)
          writable.write(`${JSON.stringify(message)}\n`)
      },
    }
    const elapsed = () =>
      entry.startedAt === undefined ? 0 : Math.round(monotonicMs() - entry.startedAt)
    const endOutput = () => {
      if (entry.ended) return
      entry.ended = true
      buffer.close()
      exited.settle()
      entry.signal?.('ended')
    }
    const onExit = (exit: NonNullable<Entry['exit']>) => {
      const durationMs = elapsed()
      endOutput()
      const residue = dispose(entry)
      outcome.settle({ kind: 'completed', exit, durationMs, output: buffer.summary(), residue })
    }
    /** The gate went away, or its frames broke, without an exit frame: the outcome is unknown. */
    const end = () => {
      if (entry.ended) return
      endOutput()
      outcome.settle({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: buffer.summary(),
      })
      if (!entry.confirmed && entry.startedAt !== undefined) void forceStop(entry)
    }
    const apply = (frame: GateFrame) => {
      switch (frame.kind) {
        case 'ready':
          entry.signal?.('ready')
          break
        case 'started':
          entry.startedAt = monotonicMs()
          entry.signal?.('started')
          break
        case 'spawnFailed':
          entry.signal?.('spawnFailed')
          break
        case 'data':
          buffer.push(frame.stream, frame.bytes)
          break
        case 'exit':
          entry.exit = frame.exit
          entry.members = frame.members
          onExit(frame.exit)
          break
        default: {
          const exhaustive: never = frame
          return exhaustive
        }
      }
    }
    gate.stdout?.on('data', (bytes: Buffer) => {
      if (entry.ended) return
      const step = frames.push(bytes)
      if (step.kind === 'fault') {
        end()
        void forceStop(entry)
        return
      }
      for (const frame of step.frames) apply(frame)
    })
    gate.once('exit', () => {
      entry.gateGone = true
    })
    gate.once('close', end)
    gate.once('error', () => {
      entry.gateGone = true
      end()
    })
    writable?.write(
      `${JSON.stringify({
        executable: request.executable,
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        stdin: request.stdin === undefined ? null : Buffer.from(request.stdin).toString('base64'),
        maxChunkBytes: settings.maxChunkBytes,
      })}\n`,
    )
    live.add(entry)
    return entry
  }

  const handleOf = (entry: Entry, bootId: string): ProcessHandle =>
    Object.freeze({
      process: Object.freeze({ id: entry.resource.key, generation: bootId }),
      outputMode: 'separate',
      output: entry.buffer.output,
      outputPolicy: Object.freeze({
        maxBufferedBytes: settings.maxBufferedBytes,
        maxChunkBytes: settings.maxChunkBytes,
        overflow: 'discard',
      }),
      result: entry.outcome,
      stop: (mode: 'graceful' | 'forced') =>
        mode === 'graceful' ? gracefulStop(entry) : forceStop(entry),
    })

  const start = async (request: StartRequest): Promise<FacilityResult<ProcessHandle>> => {
    const requestId = request.requestId
    const rejected = (reason: FacilityReason): FacilityResult<never> => ({
      kind: 'rejected',
      requestId,
      reason,
    })
    const issue = macosRequestIssue(request)
    if (issue !== undefined) return rejected(issue)
    const reading = await input.reader()
    if (reading.kind !== 'ready') {
      input.unavailable([readerMissing(reading)])
      return rejected('unavailable')
    }
    if (sealed) return rejected('closed')
    const bootId = await readBootId()
    if (bootId === undefined) return rejected('unavailable')
    const key = randomUUID()
    const resource: ManagedResource = {
      key,
      provider: input.provider,
      reference: domainReference(key, bootId, input.scope),
    }
    let planned: Awaited<ReturnType<typeof ledger.plan>> = 'unavailable'
    try {
      planned = await ledger.plan(resource)
    } catch {
      /* A failed durable plan prevents any process. */
    }
    if (planned !== 'recorded') return rejected(planned)
    const deadline = monotonicMs() + settings.startBoundMs
    const entry = launch(resource, request, reading.path)
    const refuse = async (reason: FacilityReason) => {
      await forceStop(entry)
      return rejected(sealed ? 'closed' : reason)
    }
    const ready = await nextEvent(entry, deadline)
    if (ready === 'late') {
      // No GO is sent from now on; the gate exits once its channel ends.
      entry.closeControl()
      return { kind: 'unknown', requestId }
    }
    if (ready !== 'ready' || entry.gate.pid === undefined) return refuse('unavailable')
    const identity = await readIdentity({
      reader: reading.path,
      pid: entry.gate.pid,
      boundMs: Math.max(1, deadline - monotonicMs()),
    })
    if (identity?.kind !== 'alive' || identity.sid !== entry.gate.pid) return refuse('unavailable')
    const coordinate: SessionCoordinate = {
      bootId,
      sessions: [{ sid: identity.sid, start: identity.start }],
    }
    // The marker exists before GO: a provider that dies after this point leaves a listed domain.
    if (
      input.domains !== undefined &&
      !(await input.domains.record(resource, input.scope, coordinate))
    )
      return refuse('unavailable')
    entry.coordinate = coordinate
    let permit: Awaited<ReturnType<typeof ledger.permit>> = 'unavailable'
    try {
      permit = await ledger.permit(key)
    } catch {
      /* No GO without a confirmed permit. */
    }
    if (permit !== 'confirmed') return refuse(permit)
    if (sealed) return refuse('closed')
    entry.sendControl({ c: 'go' })
    const started = await nextEvent(entry, deadline)
    if (started === 'started') return { kind: 'done', requestId, value: handleOf(entry, bootId) }
    if (started === 'spawnFailed') return refuse('unavailable')
    // GO went out: the command may have started. The resource stays for the stop.
    return { kind: 'unknown', requestId }
  }

  return Object.freeze({
    facility: {
      start(request: StartRequest) {
        const running = start(request)
        inFlight.add(running)
        return running.finally(() => inFlight.delete(running))
      },
    },
    seal() {
      sealed = true
    },
    inFlight: () => inFlight.size,
    settled: () => Promise.allSettled(inFlight).then(() => undefined),
    async stopAll() {
      const entries = [...live]
      for (const entry of entries) entry.released = true
      await Promise.all(entries.map(entry => forceStop(entry)))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
