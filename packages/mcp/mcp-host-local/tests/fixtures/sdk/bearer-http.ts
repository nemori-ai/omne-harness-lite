// A modern Streamable HTTP peer behind the SDK's bearer gate: `createMcpHandler` served through
// `toNodeHandler`, every request first checked by `requireBearerAuth`, and the protected resource
// metadata at the RFC 9728 address. The B layer for the authorization flow (contract T4, R4).
import { createServer, type Server } from 'node:http'
import { toNodeHandler } from '@modelcontextprotocol/node'
import {
  McpServer,
  OAuthError,
  OAuthErrorCode,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import { listenFree } from '../scripted/http.ts'

export type BearerServer = Readonly<{
  target: ConnectionTarget
  metadataUrl: string
  close(): Promise<void>
}>

function echoServer(): McpServer {
  const server = new McpServer(
    { name: 'bearer-http', version: '1' },
    { capabilities: { tools: {} } },
  )
  server.registerTool(
    'echo',
    { description: 'Echoes the text', inputSchema: z.object({ text: z.string() }) },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  )
  return server
}

/** Serves the peer; only `token` is accepted, and it carries `scopes`. */
export async function bearerServer(
  token: string,
  scopes: readonly string[],
): Promise<BearerServer> {
  let server: Server | undefined
  let metadataUrl = ''
  let target = ''
  const handler = toNodeHandler(createMcpHandler(echoServer))
  const gate = () =>
    requireBearerAuth({
      resourceMetadataUrl: metadataUrl,
      verifier: {
        async verifyAccessToken(candidate) {
          if (candidate !== token)
            throw new OAuthError(OAuthErrorCode.InvalidToken, 'unknown token')
          return {
            token,
            clientId: 'test',
            scopes: [...scopes],
            expiresAt: Date.now() / 1000 + 3600,
          }
        },
      },
    })
  server = createServer(async (request, response) => {
    response.setHeader('connection', 'close')
    const url = new URL(request.url ?? '/', target)
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          resource: target,
          authorization_servers: ['https://issuer.test'],
          scopes_supported: [...scopes],
        }),
      )
      return
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers))
      if (typeof value === 'string') headers.set(name, value)
    const verdict = await gate()(new Request(url, { method: request.method ?? 'GET', headers }))
    if (verdict instanceof Response) {
      const answered: { [name: string]: string } = {}
      verdict.headers.forEach((value, name) => {
        answered[name] = value
      })
      response.writeHead(verdict.status, answered).end(await verdict.text())
      return
    }
    await handler(
      {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
      },
      response,
    )
  })
  const port = await listenFree(server)
  target = `http://127.0.0.1:${port}/mcp`
  metadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(target))
  if (!isConnectionTarget(target)) throw new Error(`not a connection target: ${target}`)
  const listening = server
  return {
    target,
    metadataUrl,
    async close() {
      listening.closeAllConnections()
      await new Promise<void>(resolve => listening.close(() => resolve()))
    },
  }
}
