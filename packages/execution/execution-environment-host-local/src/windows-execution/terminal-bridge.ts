import { spawn } from 'node:child_process'
import { deferred } from './bridge.ts'

export type TerminalFrame =
  | { readonly t: 'ready' | 'controlLost' | 'outputLost' | 'inputFault' }
  | { readonly t: 'opened'; readonly cwd: string }
  | { readonly t: 'started' | 'legFault'; readonly id: string }
  | ({
      readonly t: 'finished'
      readonly v: 3
      readonly id: string
      readonly cwd: string
      readonly restored: boolean
      /** The script ran `exit N`: the shell ends after this answer. */
      readonly ended: boolean
    } &
      /** `code` is the exit code the shell host derived by the SPEC's rule. */
      (
        | { readonly completed: true; readonly elapsedMs: number; readonly code: number }
        | { readonly completed: false; readonly elapsedMs: null; readonly code: null }
      ))
  | { readonly t: 'data'; readonly b: string }
  | { readonly t: 'stopped'; readonly status: 'confirmed' | 'unconfirmed' }
  | { readonly t: 'fault'; readonly stopped: boolean }

export function parseTerminalFrame(text: string, maxChunkBytes: number): TerminalFrame | undefined {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null || !('t' in value)) return undefined
  switch (value.t) {
    case 'ready':
    case 'controlLost':
    case 'outputLost':
    case 'inputFault':
      return { t: value.t }
    case 'fault':
      return { t: value.t, stopped: 'stopped' in value && value.stopped === true }
    case 'opened':
      return 'cwd' in value && typeof value.cwd === 'string'
        ? { t: value.t, cwd: value.cwd }
        : undefined
    case 'started':
    case 'legFault':
      return 'id' in value && typeof value.id === 'string'
        ? { t: value.t, id: value.id }
        : undefined
    case 'finished':
      if (
        !(
          'v' in value &&
          value.v === 3 &&
          'id' in value &&
          typeof value.id === 'string' &&
          'cwd' in value &&
          typeof value.cwd === 'string' &&
          'restored' in value &&
          typeof value.restored === 'boolean' &&
          'completed' in value &&
          typeof value.completed === 'boolean' &&
          'elapsedMs' in value &&
          'code' in value &&
          'ended' in value &&
          typeof value.ended === 'boolean'
        )
      )
        return undefined
      if (
        value.completed &&
        typeof value.elapsedMs === 'number' &&
        Number.isSafeInteger(value.elapsedMs) &&
        value.elapsedMs >= 0 &&
        typeof value.code === 'number' &&
        Number.isSafeInteger(value.code)
      )
        return {
          t: 'finished',
          v: 3,
          id: value.id,
          cwd: value.cwd,
          restored: value.restored,
          ended: value.ended,
          completed: true,
          elapsedMs: value.elapsedMs,
          code: value.code,
        }
      if (!value.completed && value.elapsedMs === null && value.code === null)
        return {
          t: 'finished',
          v: 3,
          id: value.id,
          cwd: value.cwd,
          restored: value.restored,
          ended: value.ended,
          completed: false,
          elapsedMs: null,
          code: null,
        }
      return undefined
    case 'data':
      return 's' in value &&
        value.s === 'terminal' &&
        'b' in value &&
        typeof value.b === 'string' &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.b) &&
        Buffer.byteLength(value.b, 'base64') <= maxChunkBytes
        ? { t: value.t, b: value.b }
        : undefined
    case 'stopped':
      return 'status' in value && (value.status === 'confirmed' || value.status === 'unconfirmed')
        ? { t: value.t, status: value.status }
        : undefined
    default:
      return undefined
  }
}

export function startTerminalBridge(
  input: Readonly<{
    executable: string
    request: object
    maxControlBytes: number
    maxChunkBytes: number
    onFrame(frame: TerminalFrame): void
    onClosed(): void
  }>,
) {
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows'
  const child = spawn(input.executable, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
    env: { SystemRoot: systemRoot, WINDIR: systemRoot },
  })
  const closed = deferred<void>()
  let pending = ''
  let failed = false
  // A broken transport is a fault of the broker that will not answer a stop. The control pipe stays
  // open: the broker stops its own Job when it closes, and the stop by Job name confirms only while
  // the Job is still there.
  const fault = () => {
    if (failed) return
    failed = true
    input.onFrame({ t: 'fault', stopped: false })
  }
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (text: string) => {
    if (failed) return
    pending += text
    for (;;) {
      const end = pending.indexOf('\n')
      if (end < 0) break
      if (end > input.maxControlBytes) return fault()
      const line = pending.slice(0, end)
      pending = pending.slice(end + 1)
      try {
        const frame = parseTerminalFrame(line, input.maxChunkBytes)
        if (frame === undefined) return fault()
        input.onFrame(frame)
      } catch {
        return fault()
      }
    }
    if (pending.length > input.maxControlBytes) fault()
  })
  child.stderr.resume()
  child.stdin.on('error', fault)
  child.once('error', fault)
  child.once('close', () => {
    closed.resolve()
    input.onClosed()
  })
  child.stdin.write(`${JSON.stringify(input.request)}\n`)
  return Object.freeze({
    closed: closed.promise,
    send(message: 'go' | 'stop' | 'dispose' | 'graceful' | object): boolean {
      if (failed || child.stdin.destroyed || child.stdin.writableEnded) return false
      child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`)
      return true
    },
    disconnect() {
      child.stdin.end()
    },
  })
}

export type TerminalBridge = ReturnType<typeof startTerminalBridge>
