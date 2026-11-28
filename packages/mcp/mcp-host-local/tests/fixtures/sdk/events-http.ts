import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import { listenFree } from '../scripted/http.ts'

type Happened = Readonly<{
  eventId: string
  name: string
  timestamp: string
  data: object
  cursor: string
}>

/** The SDK's 2026-07-28 server with the events extension: polls find what happened, streams hear it. */
export type EventsServer = Readonly<{
  target: ConnectionTarget
  /** The headers of each event request, in order. */
  headers: readonly IncomingHttpHeaders[]
  emit(name: string, data: object): void
  terminate(code: number): void
  close(): Promise<void>
}>

const PARAMS = z
  .object({ name: z.string(), cursor: z.string().nullable().optional() })
  .passthrough()

export async function eventsServer(): Promise<EventsServer> {
  const happened: Happened[] = []
  const hearing = new Set<(event: Happened | Readonly<{ code: number }>) => void>()
  const headers: IncomingHttpHeaders[] = []
  const from = (cursor: string | null | undefined) => Number(cursor ?? happened.length)
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'events-http', version: '1' },
      { capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/events': {} } } },
    )
    server.server.setRequestHandler(
      'events/poll',
      { params: PARAMS, result: z.object({}).passthrough() },
      async ({ name, cursor }) => ({
        events: happened.slice(from(cursor)).filter(event => event.name === name),
        cursor: String(happened.length),
        truncated: false,
        hasMore: false,
        nextPollMs: 100,
      }),
    )
    server.server.setRequestHandler(
      'events/stream',
      { params: PARAMS, result: z.object({}).passthrough() },
      async ({ name, cursor }, ctx) => {
        const { notify, signal, id } = ctx.mcpReq
        const meta = { 'io.modelcontextprotocol/subscriptionId': id }
        const send = (method: string, params: object) =>
          notify({ method, params: { ...params, _meta: meta } } as never).catch(() => undefined)
        await send('notifications/events/active', {
          cursor: String(happened.length),
          truncated: false,
          heartbeatMs: 1000,
        })
        for (const event of happened.slice(from(cursor)).filter(each => each.name === name))
          await send('notifications/events/event', event)
        await new Promise<void>(resolve => {
          const hear = (event: Happened | Readonly<{ code: number }>) => {
            if ('code' in event) {
              void send('notifications/events/terminated', {
                error: { code: event.code, message: 'ended' },
              }).then(done)
              return
            }
            if (event.name === name) void send('notifications/events/event', event)
          }
          const done = () => {
            hearing.delete(hear)
            resolve()
          }
          hearing.add(hear)
          signal.addEventListener('abort', done, { once: true })
        })
        return {}
      },
    )
    return server
  })
  const serve = toNodeHandler(handler)
  const http: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      if (body.toString('utf8').includes('"events/')) headers.push(request.headers)
      void serve(
        {
          method: request.method ?? 'GET',
          url: request.url ?? '/',
          headers: request.headers,
          [Symbol.asyncIterator]: async function* () {
            yield body
          },
        },
        response,
      )
    })
  })
  const port = await listenFree(http)
  const target = `http://127.0.0.1:${String(port)}/mcp`
  if (!isConnectionTarget(target)) throw new Error(target)
  return {
    target,
    headers,
    emit(name, data) {
      const event = {
        eventId: `ev-${String(happened.length + 1)}`,
        name,
        timestamp: new Date(0).toISOString(),
        data,
        cursor: String(happened.length + 1),
      }
      happened.push(event)
      for (const hear of hearing) hear(event)
    },
    terminate(code) {
      for (const hear of hearing) hear({ code })
    },
    close: () =>
      new Promise<void>(resolve => {
        http.closeAllConnections()
        http.close(() => resolve())
      }),
  }
}
