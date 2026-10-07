import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import {
  captureCommandArguments,
  type TerminalCreateRequest,
  type TerminalExecuteRequest,
  type CommandOutcome,
} from '@omne-harness-lite/execution-environments'
import { captureHostNativePolicy, type HostNativePolicy } from './native-policy.ts'
import {
  nativeManagerEnvironment,
  observeWithin,
  observeHostPreparation,
  stopHostResource,
  validHostCoordinate,
  type HostProcessCoordinate,
  type HostRecoveryControl,
  type HostPreparation,
} from './native-control.ts'
import { captureTerminalFrame, type TerminalFrame } from './native-frames.ts'
import { createOutputBuffer } from './output-buffer.ts'
import { clearHostResourceDirectory } from './resource-directory.ts'
import type { HostPreparedProcess } from './native-command.ts'

export interface HostTerminalControl extends HostRecoveryControl {
  readonly information: () => {
    readonly state: 'idle' | 'running' | 'invalid' | 'closed'
    readonly observedCwd: string
  }
}
export interface HostPreparedTerminal extends HostRecoveryControl {
  readonly go: () => Promise<
    | { readonly kind: 'created'; readonly terminal: HostTerminalControl }
    | { readonly kind: 'rejected'; readonly reason: 'effectUnknown' | 'closed' }
  >
}
interface Leg {
  readonly id: string
  readonly output: ReturnType<typeof createOutputBuffer>
  readonly result: ReturnType<typeof Promise.withResolvers<CommandOutcome>>
  readonly done: ReturnType<typeof Promise.withResolvers<void>>
  readonly started: number
  sent: boolean
  closed: boolean
  completed: boolean
  timer?: ReturnType<typeof setTimeout>
}
const unusableTerminal = (
  state: ReturnType<HostTerminalControl['information']>['state'],
  closed: boolean,
) => state !== 'idle' || closed
const lifecycleFrameKind = (
  frame: TerminalFrame,
): frame is Extract<TerminalFrame, { kind: 'ready' | 'created' }> =>
  frame.kind === 'ready' || frame.kind === 'created'
const implementations = new WeakMap<
  HostTerminalControl,
  {
    prepare: (
      request: Omit<TerminalExecuteRequest, 'terminal'>,
      policy: HostNativePolicy,
    ) => HostPreparation<HostPreparedProcess>
  }
>()

export async function prepareHostTerminal(
  rawRequest: TerminalCreateRequest,
  rawPolicy: HostNativePolicy,
  rawCoordinate: HostProcessCoordinate,
): Promise<HostPreparation<HostPreparedTerminal>> {
  const args = captureCommandArguments('createTerminal', [rawRequest]),
    policy = captureHostNativePolicy(rawPolicy)
  if (!args || !validHostCoordinate(rawCoordinate))
    return { kind: 'rejected', reason: 'invalidInput' }
  const request = args[0] as TerminalCreateRequest
  const input = JSON.stringify({ kind: 'go', ...request }) + '\n'
  if (Buffer.byteLength(input) > policy.maxInputBytes)
    return { kind: 'rejected', reason: 'invalidInput' }
  const coordinate = Object.freeze({ ...rawCoordinate })
  const launcher = spawn(
    '/usr/bin/systemd-run',
    [
      '--user',
      '--scope',
      '--quiet',
      `--unit=${coordinate.unit}`,
      '--property=KillMode=control-group',
      `--property=TimeoutStopSec=${policy.stopDeadlineMs}ms`,
      process.execPath,
      fileURLToPath(new URL('./terminal-gate.js', import.meta.url)),
      coordinate.unit,
      coordinate.boot,
      String(policy.output.maxChunkBytes),
      String(policy.terminalColumns),
      String(policy.terminalRows),
    ],
    { env: nativeManagerEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const decoder = new StringDecoder('utf8')
  const ready = Promise.withResolvers<boolean>(),
    created = Promise.withResolvers<boolean>(),
    done = Promise.withResolvers<void>()
  let entered = false,
    drained = false,
    closed = false,
    sent = false,
    state: ReturnType<HostTerminalControl['information']>['state'] = 'idle'
  let observedCwd = request.cwd,
    buffered = '',
    leg: Leg | undefined
  function invalidate() {
    state = 'invalid'
    ready.resolve(false)
    created.resolve(false)
    if (leg && !leg.completed) {
      clearTimeout(leg.timer)
      leg.output.end()
      leg.done.resolve()
      leg.result.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: performance.now() - leg.started,
        output: leg.output.summary(),
      })
    }
    void terminal.stop('forced')
  }
  let stopping: Promise<'confirmed' | 'unconfirmed'> | undefined
  function closePermission() {
    closed = true
    launcher.stdin.destroy()
  }
  async function stopOriginal(mode: 'graceful' | 'forced') {
    closePermission()
    if (!entered && !drained) await observeWithin(done.promise, policy.stopDeadlineMs)
    const result = await stopHostResource(coordinate, policy, async () => entered || drained, mode)
    if (result === 'confirmed') {
      state = 'closed'
      if (!(await clearHostResourceDirectory(coordinate))) return 'unconfirmed'
    }
    return result
  }
  const terminal: HostTerminalControl = Object.freeze({
    coordinate,
    closePermission,
    settled: done.promise,
    information: () => ({ state, observedCwd }),
    stop(mode: 'graceful' | 'forced') {
      if (!stopping) {
        stopping = stopOriginal(mode).finally(() => {
          stopping = undefined
        })
      }
      return stopping
    },
  })
  function lifecycleFrame(frame: Extract<TerminalFrame, { kind: 'ready' | 'created' }>) {
    if (frame.kind === 'ready') {
      if (entered || sent) {
        invalidate()
        return
      }
      entered = true
      ready.resolve(true)
    } else {
      if (!sent) {
        invalidate()
        return
      }
      observedCwd = frame.cwd
      created.resolve(true)
    }
  }
  function receive(value: unknown) {
    const frame = captureTerminalFrame(value, policy.output.maxChunkBytes)
    if (!frame) {
      invalidate()
      return
    }
    if (lifecycleFrameKind(frame)) {
      lifecycleFrame(frame)
      return
    }
    const original = leg
    if (!original || frame.id !== original.id || !original.sent || original.completed) {
      invalidate()
      return
    }
    if (frame.kind === 'output') {
      original.output.append(frame.data)
      return
    }
    original.completed = true
    state = 'idle'
    observedCwd = frame.cwd
    clearTimeout(original.timer)
    original.output.end()
    original.done.resolve()
    original.result.resolve({
      kind: 'completed',
      exit: { code: frame.code },
      durationMs: performance.now() - original.started,
      output: original.output.summary(),
    })
  }
  launcher.stdout.on('data', (data: Buffer) => {
    buffered += decoder.write(data)
    let end = buffered.indexOf('\n')
    const maximum = policy.output.maxChunkBytes * 2 + 16384
    while (end !== -1) {
      try {
        if (end > maximum) throw new Error('Terminal frame too large')
        receive(JSON.parse(buffered.slice(0, end)))
      } catch {
        invalidate()
      }
      buffered = buffered.slice(end + 1)
      end = buffered.indexOf('\n')
    }
    if (buffered.length > maximum) {
      buffered = ''
      invalidate()
    }
  })
  launcher.stderr.on('data', () => {
    /* Manager output is not user command output. */
  })
  launcher.stdin.on('error', invalidate)
  launcher.on('error', invalidate)
  launcher.on('close', () => {
    drained = true
    done.resolve()
    if (state !== 'closed') invalidate()
  })
  implementations.set(terminal, {
    prepare(value, legPolicy) {
      if (unusableTerminal(state, closed)) return { kind: 'rejected', reason: 'unavailable' }
      const id = randomUUID(),
        message =
          JSON.stringify({
            kind: 'command',
            id,
            ...value,
            stdin: value.stdin && Buffer.from(value.stdin).toString('base64'),
          }) + '\n'
      if (Buffer.byteLength(message) > legPolicy.maxInputBytes)
        return { kind: 'rejected', reason: 'invalidInput' }
      const original: Leg = {
        id,
        output: createOutputBuffer(legPolicy.output),
        result: Promise.withResolvers<CommandOutcome>(),
        done: Promise.withResolvers<void>(),
        started: performance.now(),
        sent: false,
        closed: false,
        completed: false,
      }
      leg = original
      state = 'running'
      const stop = async (mode: 'graceful' | 'forced') =>
        original.completed ? ('confirmed' as const) : terminal.stop(mode)
      const control: HostPreparedProcess = {
        coordinate,
        settled: original.done.promise,
        closePermission() {
          original.closed = true
          if (!original.sent) {
            original.completed = true
            state = 'idle'
            original.output.end()
            original.done.resolve()
            original.result.resolve({
              kind: 'failed',
              reason: 'unavailable',
              observedDurationMs: performance.now() - original.started,
              output: original.output.summary(),
            })
          }
        },
        stop,
        process: {
          outputMode: 'terminal',
          output: original.output.output,
          outputPolicy: legPolicy.output,
          result: original.result.promise,
          stop,
        },
        async go() {
          if (original.closed || original.sent || closed) return 'closed'
          original.sent = true
          original.timer = setTimeout(invalidate, legPolicy.commandDeadlineMs)
          return new Promise<'started' | 'unavailable'>(resolve =>
            launcher.stdin.write(message, error => resolve(error ? 'unavailable' : 'started')),
          )
        },
      }
      return { kind: 'ready', control }
    },
  })
  const control: HostPreparedTerminal = {
    ...terminal,
    async go() {
      if (closed || sent) return { kind: 'rejected', reason: 'closed' }
      sent = true
      launcher.stdin.write(input)
      const value = await observeWithin(created.promise, policy.preparationDeadlineMs)
      return value?.value
        ? { kind: 'created', terminal }
        : { kind: 'rejected', reason: 'effectUnknown' }
    },
  }
  return observeHostPreparation(ready.promise, control, policy, () => closed)
}
export async function prepareHostTerminalCommand(
  terminal: HostTerminalControl,
  rawRequest: Omit<TerminalExecuteRequest, 'terminal'>,
  rawPolicy: HostNativePolicy,
): Promise<HostPreparation<HostPreparedProcess>> {
  const policy = captureHostNativePolicy(rawPolicy)
  const args = captureCommandArguments('executeTerminal', [
    { ...rawRequest, terminal: { id: 'native', generation: 'native' } },
  ])
  if (!args) return { kind: 'rejected', reason: 'invalidInput' }
  const request = args[0] as TerminalExecuteRequest
  if (Object.keys(request.env ?? {}).some(key => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)))
    return { kind: 'rejected', reason: 'invalidInput' }
  const original = implementations.get(terminal)
  const { terminal: _reference, ...command } = request
  return original ? original.prepare(command, policy) : { kind: 'rejected', reason: 'invalidInput' }
}
