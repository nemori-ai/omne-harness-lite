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

type Fields = Readonly<Record<string, unknown>>

const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

const text = (value: unknown): value is string => typeof value === 'string'
const flag = (value: unknown): value is boolean => typeof value === 'boolean'
const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

/** A version 3 `finished` frame: a completed one carries its elapsed time and code, else both are null. */
function finishedFrame(fields: Fields): TerminalFrame | undefined {
  const { v, id, cwd, restored, completed, elapsedMs, code, ended } = fields
  if (v !== 3 || !text(id) || !text(cwd) || !flag(restored) || !flag(ended)) return undefined
  const frame = { t: 'finished', v: 3, id, cwd, restored, ended } as const
  if (completed === true && whole(elapsedMs) && elapsedMs >= 0 && whole(code))
    return { ...frame, completed: true, elapsedMs, code }
  if (completed === false && elapsedMs === null && code === null)
    return { ...frame, completed: false, elapsedMs: null, code: null }
  return undefined
}

function dataFrame({ s, b }: Fields, maxChunkBytes: number): TerminalFrame | undefined {
  return s === 'terminal' &&
    text(b) &&
    base64.test(b) &&
    Buffer.byteLength(b, 'base64') <= maxChunkBytes
    ? { t: 'data', b }
    : undefined
}

export function parseTerminalFrame(json: string, maxChunkBytes: number): TerminalFrame | undefined {
  const value: unknown = JSON.parse(json)
  if (typeof value !== 'object' || value === null) return undefined
  const fields: Fields = { ...value }
  const t = fields['t']
  switch (t) {
    case 'ready':
    case 'controlLost':
    case 'outputLost':
    case 'inputFault':
      return { t }
    case 'fault':
      return { t, stopped: fields['stopped'] === true }
    case 'opened':
      return text(fields['cwd']) ? { t, cwd: fields['cwd'] } : undefined
    case 'started':
    case 'legFault':
      return text(fields['id']) ? { t, id: fields['id'] } : undefined
    case 'finished':
      return finishedFrame(fields)
    case 'data':
      return dataFrame(fields, maxChunkBytes)
    case 'stopped': {
      const status = fields['status']
      return status === 'confirmed' || status === 'unconfirmed' ? { t, status } : undefined
    }
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
