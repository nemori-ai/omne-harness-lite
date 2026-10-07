import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import {
  captureCommandRequest,
  type CommandRequest,
  type ProcessHandle,
  type CommandOutcome,
} from '@omne-harness-lite/execution-environments'
import { captureHostNativePolicy, type HostNativePolicy } from './native-policy.ts'
import { clearHostGateEntry } from './native-evidence.ts'
import { captureCommandFrame } from './native-frames.ts'
import { createOutputBuffer } from './output-buffer.ts'
import {
  createHostProcessCoordinate,
  hostScopeState,
  nativeManagerEnvironment,
  observeWithin,
  observeHostPreparation,
  stopHostResource,
  validHostCoordinate,
  type HostProcessCoordinate,
  type HostPreparation,
  type HostRecoveryControl,
} from './native-control.ts'

export interface HostPreparedProcess extends HostRecoveryControl {
  readonly process: ProcessHandle
  readonly go: () => Promise<'started' | 'closed' | 'unavailable'>
}
type Completion = { readonly code: number | null; readonly signal: string | null }

function captureInput(request: CommandRequest, policy: HostNativePolicy): string | undefined {
  const copied = captureCommandRequest(request)
  if (!copied) return undefined
  const data = JSON.stringify({
    ...copied,
    kind: 'go',
    stdin: copied.stdin && Buffer.from(copied.stdin).toString('base64'),
  })
  return Buffer.byteLength(data) <= policy.maxInputBytes ? data + '\n' : undefined
}

export async function prepareHostProcess(
  request: CommandRequest,
  rawPolicy: HostNativePolicy,
  coordinate: HostProcessCoordinate,
): Promise<HostPreparation<HostPreparedProcess>> {
  const policy = captureHostNativePolicy(rawPolicy),
    input = captureInput(request, policy)
  if (!input || !validHostCoordinate(coordinate))
    return { kind: 'rejected', reason: 'invalidInput' }
  const original = Object.freeze({ ...coordinate })
  const start = performance.now(),
    output = createOutputBuffer(policy.output)
  const ready = Promise.withResolvers<boolean>(),
    done = Promise.withResolvers<void>()
  const result = Promise.withResolvers<CommandOutcome>()
  const launcher = spawn(
    '/usr/bin/systemd-run',
    [
      '--user',
      '--scope',
      '--quiet',
      `--unit=${original.unit}`,
      '--property=KillMode=control-group',
      `--property=TimeoutStopSec=${policy.stopDeadlineMs}ms`,
      process.execPath,
      fileURLToPath(new URL('./process-gate.js', import.meta.url)),
      original.unit,
      String(policy.output.maxChunkBytes),
    ],
    { env: nativeManagerEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let closed = false,
    sent = false,
    entered = false,
    drained = false,
    broken = false
  let completion: Completion | undefined,
    buffered = ''
  let deadline: ReturnType<typeof setTimeout> | undefined
  function closePermission() {
    closed = true
    launcher.stdin.destroy()
  }
  launcher.stdin.on('error', () => {
    closed = true
  })
  launcher.stderr.on('data', () => {
    /* Manager diagnostics are not user command output. */
  })
  function failFrame() {
    broken = true
    closePermission()
  }
  function acceptFrame(line: string) {
    const frame = captureCommandFrame(line, policy.output.maxChunkBytes)
    if (!frame) {
      failFrame()
      return
    }
    if (frame.kind === 'ready') {
      if (entered || sent) failFrame()
      else {
        entered = true
        ready.resolve(true)
      }
      return
    }
    if (!sent || completion) {
      failFrame()
      return
    }
    if (frame.kind === 'output') output.append(frame.stream, frame.data)
    else completion = { code: frame.code, signal: frame.signal }
  }
  launcher.stdout.on('data', (data: Buffer) => {
    buffered += data.toString('utf8')
    const maxFrame = policy.output.maxChunkBytes * 2 + 1024
    let end = buffered.indexOf('\n')
    while (end !== -1) {
      if (end > maxFrame) failFrame()
      else acceptFrame(buffered.slice(0, end))
      buffered = buffered.slice(end + 1)
      end = buffered.indexOf('\n')
    }
    if (buffered.length > maxFrame) {
      buffered = ''
      failFrame()
    }
  })
  launcher.on('error', () => {
    broken = true
    ready.resolve(false)
  })
  async function finish() {
    drained = true
    clearTimeout(deadline)
    ready.resolve(false)
    done.resolve()
    const clean = (await hostScopeState(original, policy)) === 'inactive'
    const duration = performance.now() - start
    const outcome: CommandOutcome =
      sent && completion && clean && !broken
        ? {
            kind: 'completed',
            exit:
              completion.code === null
                ? { signal: completion.signal ?? 'unknown' }
                : { code: completion.code },
            durationMs: duration,
            output: output.summary(),
          }
        : {
            kind: 'failed',
            reason: 'effectUnknown',
            observedDurationMs: duration,
            output: output.summary(),
          }
    output.end()
    result.resolve(outcome)
    if (!clean) await control.stop('forced')
  }
  launcher.on('close', () => {
    void finish().catch(() => {
      output.end()
      result.resolve({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: performance.now() - start,
        output: output.summary(),
      })
    })
  })
  const control: HostPreparedProcess = Object.freeze({
    coordinate: original,
    closePermission,
    settled: done.promise,
    async stop(mode: 'graceful' | 'forced') {
      closePermission()
      // An entered gate cannot initiate a late scope creation; an unentered launch must drain.
      if (!entered && !drained) await observeWithin(done.promise, policy.stopDeadlineMs)
      return stopHostResource(original, policy, async () => entered || drained, mode)
    },
    process: Object.freeze({
      output: output.output,
      outputPolicy: policy.output,
      result: result.promise,
      stop: (mode: 'graceful' | 'forced') => control.stop(mode),
    }),
    async go() {
      if (closed || sent || !entered || drained) return 'closed'
      sent = true
      deadline = setTimeout(() => {
        broken = true
        void control.stop('forced')
      }, policy.commandDeadlineMs)
      return new Promise<'started' | 'unavailable'>(resolve => {
        launcher.stdin.end(input, (error?: Error | null) =>
          resolve(error ? 'unavailable' : 'started'),
        )
      })
    },
  })
  return observeHostPreparation(ready.promise, control, policy, () => closed)
}

export async function executeHostCommand(request: CommandRequest, policy: HostNativePolicy) {
  const prepared = await prepareHostProcess(request, policy, await createHostProcessCoordinate())
  if (prepared.kind !== 'ready') return prepared
  if ((await prepared.control.go()) !== 'started')
    return { kind: 'unknown' as const, control: prepared.control }
  return {
    kind: 'started' as const,
    process: {
      ...prepared.control.process,
      async stop(mode: 'graceful' | 'forced') {
        if ((await prepared.control.stop(mode)) !== 'confirmed') return 'unconfirmed' as const
        return (await clearHostGateEntry(prepared.control.coordinate))
          ? ('confirmed' as const)
          : ('unconfirmed' as const)
      },
    },
  }
}
