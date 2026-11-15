import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readJsonText } from '@omne-harness/json-text'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { FETCH_BAD_PORTS } from './listen.ts'
import { plain, type FakeServer } from './fake-server.ts'

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const ROUTE = /^\/api\/([^/]+)\/v(\d+)\/([^/]+)$/

export type FakeHttp = { readonly origin: string; close(): Promise<void> }

/** Serves a `FakeServer` over the server entry's HTTP wire, for a client in another process. */
export async function serveFakeHttp(
  fake: FakeServer,
  contracts: readonly ProtocolContract[],
): Promise<FakeHttp> {
  const observes = (name: string, major: number, operation: string): boolean =>
    contracts.some(
      contract =>
        contract.name === name && contract.major === major && operation in contract.observations,
    )

  const server: Server = createServer((request, response) => {
    void (async () => {
      const route = ROUTE.exec(request.url ?? '')
      const text = await bodyOf(request)
      const read = readJsonText(text, {
        maxBytes: 1 << 20,
        maxDepth: 64,
        maxItems: 10_000,
        maxMembers: 1_000,
        maxStringLength: 1 << 20,
        maxNumberLength: 64,
      })
      if (route === null || read.kind !== 'ok' || request.method !== 'POST') {
        response.writeHead(404).end()
        return
      }
      const [, name = '', major = '', operation = ''] = route
      const authorization = request.headers.authorization
      const tenant = request.headers['omne-acting-tenant']
      const transport = fake.connect({
        ...(authorization === undefined ? {} : { proof: authorization.replace(/^Bearer /, '') }),
        ...(typeof tenant === 'string' ? { tenant } : {}),
      })
      const protocol = { name, major: Number(major) }
      const messageId = String(request.headers['omne-message-id'] ?? '')
      if (observes(name, protocol.major, operation)) {
        const gone = new AbortController()
        response.on('close', () => gone.abort())
        const frames = transport.observe({
          protocol,
          observation: operation,
          messageId,
          open: read.value,
          signal: gone.signal,
        })
        const first = await frames.next()
        if (first.done === true && first.value.kind === 'refused') {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ outcome: first.value.outcome, body: {} }))
          return
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        const send = (event: unknown): void =>
          void response.write(`data: ${JSON.stringify(event)}\n\n`)
        for (let next = first; !gone.signal.aborted; next = await frames.next()) {
          if (next.done === true) {
            send({
              kind: 'ended',
              reason: next.value.kind === 'ended' ? next.value.reason : 'closed',
            })
            break
          }
          send({ kind: 'frame', frame: plain(next.value) })
        }
        response.end()
        return
      }
      const report = await transport.call({ protocol, operation, messageId, body: read.value })
      if (report.kind !== 'answered') {
        response.writeHead(503).end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ outcome: report.outcome, body: plain(report.body) }))
    })().catch(() => response.writeHead(500).end())
  })

  for (;;) {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    if (!FETCH_BAD_PORTS.has(port)) {
      return {
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>(resolve => {
            server.closeAllConnections()
            server.close(() => resolve())
          }),
      }
    }
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
