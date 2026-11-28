import { createServer, type Server } from 'node:http'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import { listenFree } from '../scripted/http.ts'

/** The SDK's 2026-07-28 server whose tools can change; it tells every open listen, and counts what it was asked. */
export type ChangingServer = Readonly<{
  target: ConnectionTarget
  asked: ReadonlyMap<string, number>
  offer(tools: readonly string[]): void
  /** Cuts every open connection without answering. */
  drop(): void
  close(): Promise<void>
}>

const methodOf = (body: Buffer): string | undefined => {
  try {
    const { method } = JSON.parse(body.toString('utf8')) as { method?: unknown }
    return typeof method === 'string' ? method : undefined
  } catch {
    return undefined
  }
}

export async function changingServer(tools: readonly string[] = ['echo']): Promise<ChangingServer> {
  let offered = tools
  const asked = new Map<string, number>()
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'changing-http', version: '1' },
      { capabilities: { tools: { listChanged: true } } },
    )
    for (const name of offered)
      server.registerTool(
        name,
        { description: 'Echoes', inputSchema: z.object({ text: z.string() }) },
        async ({ text }) => ({ content: [{ type: 'text' as const, text }] }),
      )
    return server
  })
  const serve = toNodeHandler(handler)
  const http: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      const method = methodOf(body)
      if (method !== undefined) asked.set(method, (asked.get(method) ?? 0) + 1)
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
    asked,
    offer(next) {
      offered = next
      handler.notify.toolsChanged()
    },
    drop: () => http.closeAllConnections(),
    close: () =>
      new Promise<void>(resolve => {
        http.closeAllConnections()
        http.close(() => resolve())
      }),
  }
}
