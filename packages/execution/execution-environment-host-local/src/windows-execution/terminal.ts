import { randomUUID } from 'node:crypto'
import { win32 } from 'node:path'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OutputPolicy,
  ProcessHandle,
  RetainedTerminalLedger,
  TerminalFacility,
  TerminalInformation,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import type { HostTerminals, TerminalSettings } from '../host-terminal.ts'
import { deferred, within } from './bridge.ts'
import { windowsTerminalExecutable } from './compile.ts'
import { stopWindowsResource } from './index.ts'
import { startTerminalBridge, type TerminalBridge, type TerminalFrame } from './terminal-bridge.ts'
import {
  createWindowsTerminalCapacity,
  reserveTerminalWindow,
  type TerminalWindow,
  type WindowsTerminalCapacity,
} from './terminal-output.ts'

export { createWindowsTerminalCapacity } from './terminal-output.ts'
export type { WindowsTerminalLimits, WindowsTerminalCapacity } from './terminal-output.ts'
type CreateRequest = Parameters<TerminalFacility<unknown>['create']>[0]
type ExecuteRequest = Parameters<TerminalFacility<unknown>['execute']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'
type PlatformInput = Readonly<{
  provider: string
  settings: TerminalSettings
  capacity?: WindowsTerminalCapacity
}>
type ReservationInput = Readonly<{
  request: CreateRequest
  ledger: RetainedTerminalLedger
  scope: ScopeRef
  closed(): boolean
}>
type Leg = {
  id: string
  sequence: number
  acknowledged: boolean
  started: ReturnType<typeof deferred<boolean>>
  outcome: ReturnType<typeof deferred<CommandOutcome>>
  window: TerminalWindow
  next: TerminalWindow
  startedAt: number
  done: boolean
  foregroundCompleted: boolean
}
const now = () =>
  /* wall-clock: operation-timing -- Bound native control and measure one foreground invocation. */ performance.now()
const reject = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
  kind: 'rejected',
  requestId,
  reason,
})
const pathValid = (path: string) => win32.isAbsolute(path) && !path.includes('\0')
const envValid = (env: Readonly<Record<string, string>>) =>
  Object.entries(env).every(
    ([key, value]) =>
      key.length > 0 && !key.includes('=') && !key.includes('\0') && !value.includes('\0'),
  )
const geometryValid = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 32767

function reserve(input: PlatformInput & ReservationInput & { capacity: WindowsTerminalCapacity }) {
  const { settings, ledger, capacity } = input
  const terminal = Object.freeze({ id: randomUUID(), generation: randomUUID() })
  const name = `Local\\omne-terminal-${terminal.id}`
  const resource: ManagedResource = Object.freeze({
    key: terminal.id,
    provider: input.provider,
    reference: {
      kind: 'object',
      entries: [
        { key: 'windowsJob', value: { kind: 'string', value: name } },
        { key: 'generation', value: { kind: 'string', value: terminal.generation } },
        { key: 'scope', value: { kind: 'string', value: input.scope.ref } },
      ],
    },
  } satisfies ManagedResource)
  const policy: OutputPolicy = Object.freeze({
    maxBufferedBytes: settings.maxBufferedBytes,
    maxChunkBytes: settings.maxChunkBytes,
    overflow: 'discard',
  })
  const reservedTerminal = capacity.terminal()
  if (reservedTerminal === undefined) return undefined
  const releaseTerminal = reservedTerminal
  let idle = reserveTerminalWindow(policy, capacity)
  if (idle === undefined) {
    releaseTerminal()
    return undefined
  }
  let state: TerminalInformation['state'] = 'idle'
  let cwd = input.request.cwd
  let leg: Leg | undefined
  let bridge: TerminalBridge | undefined
  let bridgeEnded = false
  let starting = false
  let cancelled = false
  let nativeStopped = false
  let confirmed = false
  let planned = false
  let outputFailed = false
  let absoluteOffset = 0
  let sequence = 0
  let completedSequence = 0
  let idleClosure:
    | Readonly<{ observedBytes: number; discardedBytes: number; releasedUndeliveredBytes: number }>
    | undefined
  let stopping: Promise<StopStatus> | undefined
  let recording:
    | { readonly status: StopStatus; readonly result: Promise<'recorded' | 'unavailable'> }
    | undefined
  let startResult: Promise<FacilityResult<{ terminal: TerminalRef }>> | undefined
  let stopReply = deferred<StopStatus>()
  const ready = deferred<boolean>()
  const opened = deferred<boolean>()
  const closed = () => cancelled || input.closed() || ledger.closed.aborted
  const completedFrame = (id: string) => {
    const prefix = `${terminal.generation}:`
    if (!id.startsWith(prefix)) return false
    const value = id.slice(prefix.length)
    const number = Number(value)
    return (
      Number.isSafeInteger(number) &&
      number > 0 &&
      number <= completedSequence &&
      String(number) === value
    )
  }
  const finish = (completed: boolean) => {
    const current = leg
    if (current === undefined || current.done) return
    current.done = true
    current.foregroundCompleted = completed
    current.started.resolve(false)
    const output = current.window.seal()
    idle = current.next
    leg = undefined
    const durationMs = Math.max(0, Math.round(now() - current.startedAt))
    current.outcome.resolve(
      completed && !outputFailed
        ? { kind: 'completed', exit: { kind: 'unknown' }, durationMs, output }
        : {
            kind: 'failed',
            reason: outputFailed ? 'unavailable' : 'effectUnknown',
            observedDurationMs: durationMs,
            output,
          },
    )
  }
  const invalidate = (reason: 'control' | 'output' = 'control') => {
    if (state === 'closed') return
    if (reason === 'output') outputFailed = true
    state = 'invalid'
    ready.resolve(false)
    opened.resolve(false)
    stopReply.resolve('unconfirmed')
    finish(false)
  }
  const frame = (value: TerminalFrame) => {
    switch (value.t) {
      case 'ready':
        ready.resolve(true)
        return
      case 'opened':
        cwd = value.cwd
        opened.resolve(true)
        return
      case 'started':
        if (completedFrame(value.id)) return
        if (leg?.id === value.id) {
          if (!leg.acknowledged) {
            leg.acknowledged = true
            leg.startedAt = now()
            leg.started.resolve(true)
          }
        } else invalidate()
        return
      case 'data': {
        const bytes = Buffer.from(value.b, 'base64')
        if (
          bytes.byteLength > Number.MAX_SAFE_INTEGER - absoluteOffset ||
          !(leg?.window ?? idle)?.push(bytes)
        ) {
          invalidate('output')
          void stop()
        } else absoluteOffset += bytes.byteLength
        return
      }
      case 'finished':
        if (completedFrame(value.id)) return
        if (leg?.id !== value.id) {
          invalidate()
          return
        }
        cwd = value.cwd
        completedSequence = leg.sequence
        finish(value.completed)
        state = value.restored && value.completed && !closed() && !outputFailed ? 'idle' : 'invalid'
        return
      case 'stopped':
        if (value.status === 'confirmed') nativeStopped = true
        stopReply.resolve(value.status)
        return
      case 'fault':
        if (value.stopped) nativeStopped = true
        stopReply.resolve(value.stopped ? 'confirmed' : 'unconfirmed')
        invalidate()
        return
      case 'outputLost':
        invalidate('output')
        return
      case 'legFault':
        if (!completedFrame(value.id)) invalidate()
        return
      case 'controlLost':
      case 'inputFault':
        invalidate()
        return
      default: {
        const exhaustive: never = value
        return exhaustive
      }
    }
  }
  async function stop(): Promise<StopStatus> {
    if (confirmed) return 'confirmed'
    cancelled = true
    state = 'invalid'
    if (starting) return 'unconfirmed'
    stopping ??= (async (): Promise<StopStatus> => {
      const deadline = now() + settings.stopBoundMs
      const remaining = () => Math.max(0, deadline - now())
      finish(false)
      if (bridge === undefined) nativeStopped = true
      if (!nativeStopped) {
        stopReply = deferred<StopStatus>()
        const sent = bridge?.send('stop') === true
        const response = sent ? await within(stopReply.promise, remaining()) : 'unconfirmed'
        if (response === 'confirmed') nativeStopped = true
        if (!nativeStopped && remaining() > 0)
          nativeStopped = (await stopWindowsResource(resource, remaining())) === 'confirmed'
      }
      if (nativeStopped) {
        bridge?.send('dispose')
        bridge?.disconnect()
        if (bridge !== undefined && !bridgeEnded)
          bridgeEnded =
            (await within(
              bridge.closed.then(() => true),
              remaining(),
            )) === true
      }
      const released = nativeStopped && (bridge === undefined || bridgeEnded)
      if (released && idle !== undefined) {
        idleClosure = idle.disposeIdle()
        idle = undefined
      }
      if (!planned && released) {
        confirmed = true
      } else {
        const status = released ? 'confirmed' : 'unconfirmed'
        recording ??= {
          status,
          result: Promise.resolve()
            .then(() => ledger.stopped(resource.key, status))
            .catch(() => 'unavailable'),
        }
        const recorded = await within(recording.result, remaining())
        const agrees = recording.status === status
        if (recorded !== undefined) recording = undefined
        confirmed = released && agrees && recorded === 'recorded'
      }
      if (confirmed) {
        state = 'closed'
        releaseTerminal()
      }
      return confirmed ? 'confirmed' : 'unconfirmed'
    })().finally(() => {
      stopping = undefined
    })
    return stopping
  }
  const start = async (): Promise<FacilityResult<{ terminal: TerminalRef }>> => {
    const request = input.request
    const refused = async (reason: FacilityReason) => {
      starting = false
      await stop()
      return reject(request.requestId, reason)
    }
    if (request.binding.kind !== 'host_machine') return refused('unsupported')
    if (
      !pathValid(request.cwd) ||
      !envValid(request.env) ||
      !geometryValid(request.geometry?.columns ?? settings.columns) ||
      !geometryValid(request.geometry?.rows ?? settings.rows)
    )
      return refused('invalidInput')
    if (
      Buffer.byteLength(JSON.stringify({ cwd: request.cwd, env: request.env })) + 512 >
      settings.maxControlBytes
    )
      return refused('capacity')
    if (closed()) return refused('closed')
    if (process.platform !== 'win32') return refused('unavailable')
    starting = true
    try {
      const executable = await windowsTerminalExecutable()
      if (closed()) return refused('closed')
      planned = true
      const plan = await ledger.plan(resource)
      planned = plan === 'recorded' || plan === 'unavailable'
      if (plan !== 'recorded') return refused(plan)
      if (closed()) return refused('closed')
      bridge = startTerminalBridge({
        executable,
        request: {
          name,
          cwd: request.cwd,
          env: request.env,
          columns: request.geometry?.columns ?? settings.columns,
          rows: request.geometry?.rows ?? settings.rows,
          maxChunkBytes: settings.maxChunkBytes,
          maxControlBytes: settings.maxControlBytes,
          stopBoundMs: settings.stopBoundMs,
        },
        maxChunkBytes: settings.maxChunkBytes,
        maxControlBytes: settings.maxControlBytes,
        onFrame: frame,
        onClosed() {
          bridgeEnded = true
          stopReply.resolve('unconfirmed')
          invalidate()
        },
      })
      const preparation = await within(ready.promise, settings.startBoundMs)
      if (preparation !== true) {
        starting = false
        if (preparation === false && nativeStopped) return refused('unavailable')
        await stop()
        return { kind: 'unknown', requestId: request.requestId }
      }
      const permit = await ledger.permit(resource.key)
      if (permit !== 'confirmed') return refused(permit)
      if (closed()) return refused('closed')
      bridge.send('go')
      if ((await within(opened.promise, settings.startBoundMs)) !== true) {
        starting = false
        await stop()
        return { kind: 'unknown', requestId: request.requestId }
      }
      if (closed()) return refused('closed')
      if (state === 'invalid') return { kind: 'unknown', requestId: request.requestId }
      return { kind: 'done', requestId: request.requestId, value: { terminal } }
    } catch {
      return refused('unavailable')
    } finally {
      starting = false
    }
  }
  const execute = async (request: ExecuteRequest): Promise<FacilityResult<ProcessHandle>> => {
    if (closed() || state === 'closed') return reject(request.requestId, 'closed')
    if (starting || state === 'running') return reject(request.requestId, 'busy')
    if (state === 'invalid' || bridge === undefined || idle === undefined)
      return reject(request.requestId, 'unavailable')
    if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
    if (request.terminal.id !== terminal.id || request.terminal.generation !== terminal.generation)
      return reject(request.requestId, 'notFound')
    if (
      request.script.includes('\0') ||
      (request.cwd !== undefined && !pathValid(request.cwd)) ||
      (request.env !== undefined && !envValid(request.env))
    )
      return reject(request.requestId, 'invalidInput')
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      state = 'invalid'
      return reject(request.requestId, 'capacity')
    }
    const message = {
      c: 'execute',
      id: `${terminal.generation}:${sequence + 1}`,
      script: request.script,
      cwd: request.cwd,
      env: request.env,
      stdin:
        request.stdin === undefined ? undefined : Buffer.from(request.stdin).toString('base64'),
    }
    if (Buffer.byteLength(JSON.stringify(message)) + 1 > settings.maxControlBytes)
      return reject(request.requestId, 'capacity')
    const next = reserveTerminalWindow(policy, capacity)
    if (next === undefined) return reject(request.requestId, 'capacity')
    sequence++
    const current: Leg = {
      id: message.id,
      sequence,
      acknowledged: false,
      started: deferred(),
      outcome: deferred(),
      window: idle,
      next,
      startedAt: now(),
      done: false,
      foregroundCompleted: false,
    }
    leg = current
    idle = undefined
    state = 'running'
    if (
      !bridge.send(message) ||
      (await within(current.started.promise, settings.startBoundMs)) !== true
    ) {
      invalidate()
      return { kind: 'unknown', requestId: request.requestId }
    }
    return {
      kind: 'done',
      requestId: request.requestId,
      value: Object.freeze({
        process: Object.freeze({ id: name, generation: terminal.generation }),
        outputMode: 'terminal',
        output: current.window.output,
        outputPolicy: policy,
        result: current.outcome.promise,
        async stop(mode: 'graceful' | 'forced'): Promise<StopStatus> {
          if (confirmed) return 'confirmed'
          if (current.done && !current.foregroundCompleted && state === 'invalid')
            return mode === 'forced' ? stop() : 'unconfirmed'
          if (current.done || leg !== current) return 'unconfirmed'
          if (mode === 'graceful') {
            bridge?.send('graceful')
            return 'unconfirmed'
          }
          return stop()
        },
      }),
    }
  }
  return Object.freeze({
    terminal,
    resource,
    start() {
      startResult ??= start()
      return startResult
    },
    execute,
    stop,
    information: (): TerminalInformation => ({ terminal, state, observedCwd: cwd }),
    closure: () => idleClosure,
    observation: () => ({ observedBytes: absoluteOffset }),
  })
}

export function createWindowsRetainedTerminalFactory(input: PlatformInput) {
  const capacity = input.capacity ?? createWindowsTerminalCapacity()
  return (reservation: ReservationInput) =>
    reserve({
      ...input,
      ...reservation,
      capacity,
      request: {
        ...reservation.request,
        env: { ...reservation.request.env },
        ...(reservation.request.geometry === undefined
          ? {}
          : { geometry: { ...reservation.request.geometry } }),
      },
    })
}

export function createWindowsHostTerminals(
  input: PlatformInput & Omit<ReservationInput, 'request' | 'closed'>,
): HostTerminals {
  const capacity = input.capacity ?? createWindowsTerminalCapacity()
  const entries = new Map<string, NonNullable<ReturnType<typeof reserve>>>()
  const pending = new Set<Promise<unknown>>()
  let sealed = false
  const closed = () => sealed || input.ledger.closed.aborted
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work)
    return work.finally(() => {
      pending.delete(work)
    })
  }
  const find = (terminal: TerminalRef) => {
    const entry = entries.get(terminal.id)
    return entry?.terminal.generation === terminal.generation ? entry : undefined
  }
  const resources = () =>
    [...entries.values()]
      .filter(entry => entry.information().state !== 'closed')
      .map(entry => entry.resource)
  const pruneClosed = () => {
    for (const [id, entry] of entries)
      if (entry.information().state === 'closed') entries.delete(id)
  }
  const facility: TerminalFacility<unknown> = {
    create(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      pruneClosed()
      if (request.retain !== undefined)
        return Promise.resolve(reject(request.requestId, 'unsupported'))
      const entry = reserve({
        ...input,
        request: {
          ...request,
          env: { ...request.env },
          ...(request.geometry === undefined ? {} : { geometry: { ...request.geometry } }),
        },
        closed,
        capacity,
      })
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'capacity'))
      entries.set(entry.terminal.id, entry)
      return track(
        entry.start().then(answer => {
          if (entry.information().state === 'closed') entries.delete(entry.terminal.id)
          return answer
        }),
      )
    },
    execute(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      const entry = find(request.terminal)
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'notFound'))
      return track(
        entry.execute({
          ...request,
          terminal: { ...request.terminal },
          ...(request.env === undefined ? {} : { env: { ...request.env } }),
          ...(request.stdin === undefined ? {} : { stdin: request.stdin.slice() }),
        }),
      )
    },
    close(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      const entry = find(request.terminal)
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'notFound'))
      return track(
        entry
          .stop()
          .then(status => ({ kind: 'done', requestId: request.requestId, value: { status } })),
      )
    },
    async list(request) {
      if (closed()) return reject(request.requestId, 'closed')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: [...entries.values()].map(entry => entry.information()),
      }
    },
  }
  return Object.freeze({
    facility,
    seal() {
      sealed = true
    },
    inFlight: () => pending.size,
    settled: () => Promise.allSettled(pending).then(() => undefined),
    async stopAll() {
      await Promise.all([...entries.values()].map(entry => entry.stop()))
      pruneClosed()
      return resources()
    },
    unconfirmed: resources,
  })
}
