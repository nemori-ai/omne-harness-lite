import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type ReplyStep = Readonly<{
  kind: 'reply'
  text: string
  firstByteDelayMs?: number
  chunkGapMs?: number
  chunkChars?: number
}>
export type ToolCallStep = Readonly<{
  kind: 'tool-call'
  name: string
  arguments: unknown
  text?: string
  more?: readonly Readonly<{ name: string; arguments: unknown }>[]
}>
export type CutStep = Readonly<{
  kind: 'cut'
  text: string
  afterChars: number
  chunkGapMs?: number
}>
export type StatusStep = Readonly<{ kind: 'status'; code: number }>
export type RefuseStep = Readonly<{ kind: 'refuse' }>
export type HoldStep = Readonly<{
  kind: 'hold'
  gate: Gate
  head?: string
  after: ReplyStep | ToolCallStep | Readonly<{ kind: 'drop' }>
}>

export type ScriptStep = ReplyStep | ToolCallStep | CutStep | StatusStep | RefuseStep | HoldStep

export type Gate = Readonly<{ opened: Promise<void>; open(): void; isOpen(): boolean }>

export function gate(): Gate {
  let release = () => {}
  let open = false
  const opened = new Promise<void>(resolve => {
    release = resolve
  })
  return {
    opened,
    open: () => {
      open = true
      release()
    },
    isOpen: () => open,
  }
}

export type Arrival = Readonly<{
  index: number
  at: number
  step: ScriptStep['kind'] | 'unscripted'
  afterToolResult: boolean
  lastUserText: string
}>

export const UNSCRIPTED_REPLY = 'stub-unscripted-reply'

export type ProviderStub = Readonly<{
  url: string
  certPath: string
  push(...steps: ScriptStep[]): void
  clear(): void
  pending(): number
  arrivals(): readonly Arrival[]
  unscripted(): number
  waitArrivals(count: number, timeoutMs: number): Promise<boolean>
  close(): Promise<void>
}>

const sse = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`
const DONE = 'data: [DONE]\n\n'
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function certificate(directory: string): { keyPath: string; certPath: string } {
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
  const { BASELINE: _inherited, ...env } = process.env
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { env, stdio: 'ignore' },
  )
  return { keyPath, certPath }
}

function chunksOf(text: string, size: number): string[] {
  const parts: string[] = []
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i += size) parts.push(chars.slice(i, i + size).join(''))
  return parts
}

type RequestFacts = { model: string; afterToolResult: boolean; lastUserText: string }

function factsOf(body: string): RequestFacts {
  try {
    const parsed = JSON.parse(body) as {
      model?: string
      messages?: { role?: string; content?: unknown }[]
    }
    const messages = parsed.messages ?? []
    const last = messages.at(-1)
    const users = messages.filter(message => message.role === 'user')
    const content = users.at(-1)?.content
    const lastUserText =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map(part =>
                typeof part === 'object' && part !== null && 'text' in part
                  ? String(part.text)
                  : '',
              )
              .join('')
          : ''
    return { model: parsed.model ?? 'stub', afterToolResult: last?.role === 'tool', lastUserText }
  } catch {
    return { model: 'stub', afterToolResult: false, lastUserText: '' }
  }
}

function usage(text: string) {
  return {
    prompt_tokens: 10,
    completion_tokens: Math.max(1, text.length),
    total_tokens: 10 + Math.max(1, text.length),
  }
}

async function writeText(
  response: ServerResponse,
  facts: RequestFacts,
  text: string,
  gapMs: number,
  size: number,
  live: () => boolean,
): Promise<void> {
  let first = true
  for (const part of chunksOf(text, size)) {
    if (!live()) return
    const head = first ? { model: facts.model, provider: 'OpenAI' } : {}
    response.write(sse({ ...head, choices: [{ delta: { content: part } }] }))
    first = false
    if (gapMs > 0) await sleep(gapMs)
  }
}

async function serveReply(
  step: ReplyStep | ToolCallStep,
  response: ServerResponse,
  facts: RequestFacts,
  live: () => boolean,
  headWritten: boolean,
): Promise<void> {
  if (!headWritten) response.writeHead(200, { 'content-type': 'text/event-stream' })
  if (step.kind === 'reply') {
    if ((step.firstByteDelayMs ?? 0) > 0) await sleep(step.firstByteDelayMs ?? 0)
    await writeText(response, facts, step.text, step.chunkGapMs ?? 0, step.chunkChars ?? 16, live)
    if (!live()) return
    response.write(
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: usage(step.text) }),
    )
    response.end(DONE)
    return
  }
  if (step.text !== undefined) await writeText(response, facts, step.text, 0, 64, live)
  if (!live()) return
  response.write(
    sse({
      ...(step.text === undefined ? { model: facts.model, provider: 'OpenAI' } : {}),
      choices: [
        {
          delta: {
            tool_calls: [{ name: step.name, arguments: step.arguments }, ...(step.more ?? [])].map(
              (call, index) => ({
                index,
                id: `call_${String(index)}_${Math.random().toString(36).slice(2, 10)}`,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              }),
            ),
          },
        },
      ],
    }),
  )
  response.write(
    sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: usage('tool') }),
  )
  response.end(DONE)
}

export async function startProviderStub(): Promise<ProviderStub> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'matrix-provider-')))
  const { keyPath, certPath } = certificate(directory)
  const script: ScriptStep[] = []
  const arrivals: Arrival[] = []
  const sockets = new Set<Socket>()
  const waiters = new Set<() => void>()
  const gates = new Set<Gate>()
  const started = Date.now()

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const index = arrivals.length
    const step = script.shift()
    response.setHeader('connection', 'close')
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const facts = factsOf(Buffer.concat(chunks).toString('utf8'))
      arrivals.push({
        index,
        at: Date.now() - started,
        step: step?.kind ?? 'unscripted',
        afterToolResult: facts.afterToolResult,
        lastUserText: facts.lastUserText.slice(0, 200),
      })
      for (const wake of Array.from(waiters)) wake()
      let alive = true
      response.on('close', () => {
        alive = false
      })
      const live = () => alive && !response.destroyed
      void run(step, request, response, facts, live)
    })
  }

  async function run(
    step: ScriptStep | undefined,
    request: IncomingMessage,
    response: ServerResponse,
    facts: RequestFacts,
    live: () => boolean,
  ): Promise<void> {
    if (step === undefined) {
      await serveReply({ kind: 'reply', text: UNSCRIPTED_REPLY }, response, facts, live, false)
      return
    }
    switch (step.kind) {
      case 'refuse':
        request.socket.destroy()
        return
      case 'status':
        response.writeHead(step.code, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            error: { message: `stub status ${String(step.code)}`, code: step.code },
          }),
        )
        return
      case 'cut': {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        await writeText(
          response,
          facts,
          Array.from(step.text).slice(0, step.afterChars).join(''),
          step.chunkGapMs ?? 0,
          16,
          live,
        )
        await sleep(50)
        request.socket.destroy()
        return
      }
      case 'hold': {
        gates.add(step.gate)
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        if (step.head !== undefined) await writeText(response, facts, step.head, 0, 16, live)
        await step.gate.opened
        if (!live()) return
        if (step.after.kind === 'drop') {
          request.socket.destroy()
          return
        }
        await serveReply(step.after, response, facts, live, true)
        return
      }
      default:
        await serveReply(step, response, facts, live, false)
    }
  }

  const server: Server = createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath, 'utf8') },
    handle,
  )
  server.on('connection', (socket: Socket) => {
    if (script[0]?.kind === 'refuse') {
      script.shift()
      arrivals.push({
        index: arrivals.length,
        at: Date.now() - started,
        step: 'refuse',
        afterToolResult: false,
        lastUserText: '',
      })
      for (const wake of Array.from(waiters)) wake()
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `https://127.0.0.1:${String(port)}/api/v1/chat/completions`,
    certPath,
    push: (...steps) => {
      script.push(...steps)
    },
    clear: () => {
      script.length = 0
    },
    pending: () => script.length,
    arrivals: () => [...arrivals],
    unscripted: () => arrivals.filter(arrival => arrival.step === 'unscripted').length,
    waitArrivals: async (count, timeoutMs) => {
      const until = Date.now() + timeoutMs
      while (arrivals.length < count) {
        const left = until - Date.now()
        if (left <= 0) return false
        await new Promise<void>(resolve => {
          const wake = () => {
            waiters.delete(wake)
            clearTimeout(timer)
            resolve()
          }
          const timer = setTimeout(wake, left)
          waiters.add(wake)
        })
      }
      return true
    },
    close: async () => {
      for (const held of gates) held.open()
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
