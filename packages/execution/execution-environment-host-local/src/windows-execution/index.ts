import { randomUUID } from 'node:crypto'
import { win32 } from 'node:path'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  ProcessHandle,
} from '@omne-harness/execution-environment-contract'
import { createOutputBuffer, type HostCommands, type HostCommandsInput } from '../host-command.ts'
import { deferred, startBridge, within, type BridgeFrame } from './bridge.ts'
import { windowsBridgeExecutable } from './compile.ts'

export type WindowsCommandsInput = Omit<HostCommandsInput, 'prerequisites' | 'unavailable'>
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
  if (request.args.some(value => value.includes('\0'))) return 'invalidInput'
  if (
    Object.entries(request.env).some(
      ([key, value]) => !key || key.includes('=') || key.includes('\0') || value.includes('\0'),
    )
  )
    return 'invalidInput'
  const controlSize =
    JSON.stringify({
      executable: request.executable,
      cwd: request.cwd,
      args: request.args,
      env: request.env,
    }).length +
    4 * Math.ceil((request.stdin?.byteLength ?? 0) / 3) +
    256
  if (controlSize > 2 * 1024 * 1024) return 'capacity'
  return undefined
}

export async function stopWindowsResource(
  resource: ManagedResource,
  boundMs: number,
): Promise<StopStatus> {
  const ref = resource.reference
  if (process.platform !== 'win32' || ref.kind !== 'object') return 'unconfirmed'
  const name = ref.entries.find(entry => entry.key === 'windowsJob')?.value
  if (
    name?.kind !== 'string' ||
    !/^Local\\omne-command-[a-f0-9-]{36}$/u.test(name.value) ||
    name.value !== `Local\\omne-command-${resource.key}`
  )
    return 'unconfirmed'
  try {
    await windowsBridgeExecutable()
  } catch {
    return 'unconfirmed'
  }
  const reply = deferred<StopStatus>()
  const bridge = await startBridge({
    request: { mode: 'recover', name: name.value, stopBoundMs: boundMs },
    maxChunkBytes: 1,
    onFrame: frame => {
      if (frame.t === 'stopped') reply.resolve(frame.status)
      if (frame.t === 'fault') reply.resolve('unconfirmed')
    },
    onClosed: () => reply.resolve('unconfirmed'),
  })
  const status = (await within(reply.promise, boundMs + 10_000)) ?? 'unconfirmed'
  bridge.disconnect()
  await within(bridge.closed, boundMs)
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
    let confirmed = false
    let nativeStopped = false
    let finished = false
    let startedAt = now()
    const end = (frame?: Extract<BridgeFrame, { t: 'exit' }>) => {
      if (finished) return
      finished = true
      buffer.close()
      const elapsed = Math.max(0, Math.round(now() - startedAt))
      outcome.resolve(
        frame?.complete === true
          ? {
              kind: 'completed',
              exit: { kind: 'code', code: frame.code },
              durationMs: elapsed,
              output: buffer.summary(),
            }
          : {
              kind: 'failed',
              reason: 'effectUnknown',
              observedDurationMs: elapsed,
              output: buffer.summary(),
            },
      )
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
            buffer.push(frame.s, Buffer.from(frame.b, 'base64'))
            break
          case 'exit':
            end(frame)
            break
          case 'stopped':
            stopReply.resolve(frame.status)
            break
          case 'fault':
            nativeStopped = frame.stopped === true
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
        stopping ??= (async (): Promise<StopStatus> => {
          stopReply = deferred<StopStatus>()
          if (!nativeStopped) bridge.send('stop')
          let status: StopStatus = nativeStopped
            ? 'confirmed'
            : ((await within(stopReply.promise, settings.stopBoundMs)) ?? 'unconfirmed')
          if (status === 'unconfirmed')
            status = await stopWindowsResource(resource, settings.stopBoundMs)
          let recorded = false
          try {
            recorded = (await ledger.stopped(resource.key, status)) === 'recorded'
          } catch {
            /* Ledger failure retains responsibility. */
          }
          if (status === 'confirmed' && recorded) {
            confirmed = true
            live.delete(entry)
            bridge.send('dispose')
            bridge.disconnect()
            await within(bridge.closed, settings.stopBoundMs)
          }
          return status
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
    if (sealed || ledger.closed.aborted)
      return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
    if (process.platform !== 'win32')
      return { kind: 'rejected', requestId: request.requestId, reason: 'unavailable' }
    try {
      await windowsBridgeExecutable()
    } catch {
      return { kind: 'rejected', requestId: request.requestId, reason: 'unavailable' }
    }
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
