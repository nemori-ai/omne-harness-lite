import { request as httpRequest, type IncomingMessage } from 'node:http'
import { connect } from 'node:net'
import {
  createServerEntry,
  type ServerEntry,
  type ServerEntryAccess,
  type ServerEntryConfig,
} from '../../src/index.ts'

export const encoder = new TextEncoder()
export const decoder = new TextDecoder()

export function baseConfig(overrides: Partial<ServerEntryConfig> = {}): ServerEntryConfig {
  return {
    listenAddress: '127.0.0.1',
    listenPort: 0,
    maxInFlightRequests: 64,
    maxBodyBytes: { small: 2048, input: 65536 },
    heartbeatIntervalMs: 40,
    jsonBudgets: {
      maxDepth: 16,
      maxItems: 4096,
      maxMembers: 256,
      maxStringLength: 65536,
      maxNumberLength: 32,
    },
    observation: { perLogin: 2, perInstance: 8 },
    ...overrides,
  }
}

export type Entry = Readonly<{
  entry: ServerEntry
  port: number
  stop(): Promise<void>
}>

export type EntryOptions = Readonly<{
  config?: Partial<ServerEntryConfig>
  access?: ServerEntryAccess
}>

export async function startEntry(options: EntryOptions = {}): Promise<Entry> {
  const entry = createServerEntry({
    config: baseConfig(options.config),
    ...(options.access === undefined ? {} : { access: options.access }),
  })
  const listening = await entry.start()
  return { entry, port: listening.port, stop: () => entry.stop() }
}

export type HttpReply = Readonly<{
  status: number
  headers: IncomingMessage['headers']
  body: Uint8Array
  text: string
  json: unknown
}>

export type RequestOptions = Readonly<{
  method?: string
  path?: string
  headers?: Readonly<Record<string, string>>
  body?: Uint8Array | string
}>

export function send(port: number, path: string, options: RequestOptions = {}): Promise<HttpReply> {
  const body =
    options.body === undefined
      ? new Uint8Array()
      : typeof options.body === 'string'
        ? encoder.encode(options.body)
        : options.body
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': String(body.byteLength),
    ...options.headers,
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? path,
        headers,
      },
      res => {
        const chunks: Uint8Array[] = []
        res.on('data', (chunk: Uint8Array) => chunks.push(chunk))
        res.on('end', () => {
          const bytes = Buffer.concat(chunks)
          const text = decoder.decode(bytes)
          let json: unknown
          try {
            json = text === '' ? undefined : JSON.parse(text)
          } catch {
            json = undefined
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: bytes, text, json })
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

export function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(text))
    const chunks: Uint8Array[] = []
    socket.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    socket.on('end', () => resolve(decoder.decode(Buffer.concat(chunks))))
    socket.on('close', () => resolve(decoder.decode(Buffer.concat(chunks))))
    socket.on('error', reject)
  })
}

export type SseClient = Readonly<{
  status: Promise<number>
  headers: Promise<IncomingMessage['headers']>
  chunks: string[]
  events: () => readonly unknown[]
  waitForEvents(count: number, timeoutMs?: number): Promise<readonly unknown[]>
  waitForText(needle: string, timeoutMs?: number): Promise<void>
  ended: Promise<void>
  close(): void
}>

export type StreamOptions = Readonly<{
  path: string
  headers?: Readonly<Record<string, string>>
}>

export function openStream(port: number, body: string, options: StreamOptions): SseClient {
  const chunks: string[] = []
  let resolveStatus: (status: number) => void = () => {}
  let resolveHeaders: (headers: IncomingMessage['headers']) => void = () => {}
  let resolveEnded: () => void = () => {}
  const status = new Promise<number>(resolve => {
    resolveStatus = resolve
  })
  const headers = new Promise<IncomingMessage['headers']>(resolve => {
    resolveHeaders = resolve
  })
  const ended = new Promise<void>(resolve => {
    resolveEnded = resolve
  })
  const bytes = encoder.encode(body)
  const req = httpRequest(
    {
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: options.path,
      headers: {
        'content-type': 'application/json',
        'content-length': String(bytes.byteLength),
        ...options.headers,
      },
    },
    res => {
      resolveStatus(res.statusCode ?? 0)
      resolveHeaders(res.headers)
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => chunks.push(chunk))
      res.on('end', () => resolveEnded())
      res.on('close', () => resolveEnded())
    },
  )
  req.on('error', () => resolveEnded())
  req.end(bytes)
  const text = () => chunks.join('')
  const events = (): readonly unknown[] =>
    text()
      .split('\n\n')
      .filter(block => block.startsWith('data: '))
      .map(block => JSON.parse(block.slice('data: '.length)) as unknown)
  const until = async (ready: () => boolean, timeoutMs: number, what: string): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (!ready()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${text()}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  return {
    status,
    headers,
    chunks,
    events,
    waitForEvents: async (count, timeoutMs = 2000) => {
      await until(() => events().length >= count, timeoutMs, `${count} events`)
      return events()
    },
    waitForText: (needle, timeoutMs = 2000) =>
      until(() => text().includes(needle), timeoutMs, `text ${needle}`),
    ended,
    close: () => req.destroy(),
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
