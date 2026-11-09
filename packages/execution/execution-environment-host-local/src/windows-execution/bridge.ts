import { spawn } from 'node:child_process'
import { windowsBridgeExecutable } from './compile.ts'

export type BridgeFrame =
  | { readonly t: 'ready' | 'started' }
  | { readonly t: 'fault'; readonly stopped?: boolean }
  | { readonly t: 'data'; readonly s: 'stdout' | 'stderr'; readonly b: string }
  /** The main process exited; `members` are the Job's other processes, null when unread. */
  | {
      readonly t: 'exit'
      readonly code: number
      readonly members: number | null
      readonly outputLost: boolean
    }
  | { readonly t: 'probe'; readonly ok: boolean }
  | { readonly t: 'stopped'; readonly status: 'confirmed' | 'unconfirmed' }

type Fields = Readonly<Record<string, unknown>>

const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function dataFrame({ s, b }: Fields, maxChunkBytes: number): BridgeFrame | undefined {
  return (s === 'stdout' || s === 'stderr') &&
    typeof b === 'string' &&
    base64.test(b) &&
    Buffer.byteLength(b, 'base64') <= maxChunkBytes
    ? { t: 'data', s, b }
    : undefined
}

function exitFrame({ code, members, outputLost }: Fields): BridgeFrame | undefined {
  const count = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  return typeof code === 'number' &&
    Number.isSafeInteger(code) &&
    (members === null || count(members)) &&
    typeof outputLost === 'boolean'
    ? { t: 'exit', code, members, outputLost }
    : undefined
}

function parseFrame(text: string, maxChunkBytes: number): BridgeFrame | undefined {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) return undefined
  const fields: Fields = { ...value }
  switch (fields['t']) {
    case 'ready':
    case 'started':
      return { t: fields['t'] }
    case 'fault':
      return { t: 'fault', stopped: fields['stopped'] === true }
    case 'data':
      return dataFrame(fields, maxChunkBytes)
    case 'exit':
      return exitFrame(fields)
    case 'probe':
      return typeof fields['ok'] === 'boolean' ? { t: 'probe', ok: fields['ok'] } : undefined
    case 'stopped': {
      const status = fields['status']
      return status === 'confirmed' || status === 'unconfirmed'
        ? { t: 'stopped', status }
        : undefined
    }
    default:
      return undefined
  }
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

export function within<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), milliseconds)
    void promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function startBridge(input: {
  readonly request: object
  readonly maxChunkBytes: number
  readonly onFrame: (frame: BridgeFrame) => void
  readonly onClosed: () => void
}) {
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows'
  const frameLimit = Math.max(1024, 4 * Math.ceil(input.maxChunkBytes / 3) + 128)
  const child = spawn(await windowsBridgeExecutable(), [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
    env: { SystemRoot: systemRoot, WINDIR: systemRoot },
  })
  let pending = ''
  let broken = false
  const closed = deferred<void>()
  const fault = () => {
    if (broken) return
    broken = true
    input.onFrame({ t: 'fault' })
    child.stdin.end()
  }
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (text: string) => {
    if (broken) return
    pending += text
    for (;;) {
      const newline = pending.indexOf('\n')
      if (newline < 0) break
      if (newline > frameLimit) return fault()
      const line = pending.slice(0, newline).trimEnd()
      pending = pending.slice(newline + 1)
      try {
        const frame = parseFrame(line, input.maxChunkBytes)
        if (frame === undefined) return fault()
        input.onFrame(frame)
      } catch {
        return fault()
      }
    }
    if (pending.length > frameLimit) fault()
  })
  child.stderr.resume()
  child.stdin.on('error', fault)
  child.once('error', fault)
  child.once('close', () => {
    closed.resolve()
    input.onClosed()
  })
  child.stdin.write(`${JSON.stringify(input.request)}\n`)
  return {
    closed: closed.promise,
    send(command: 'go' | 'stop' | 'dispose') {
      if (broken || child.stdin.destroyed || child.stdin.writableEnded) return false
      child.stdin.write(`${command}\n`)
      return true
    },
    disconnect() {
      child.stdin.end()
    },
    terminate() {
      child.kill()
    },
  }
}
