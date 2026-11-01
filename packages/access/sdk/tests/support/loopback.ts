import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Received {
  readonly method: string | undefined
  readonly url: string | undefined
  readonly headers: IncomingHttpHeaders
  readonly body: Buffer
}

export interface Reply {
  readonly status: number
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string | Buffer
}

export interface LoopbackServer {
  readonly origin: string
  readonly port: number
  readonly received: Received[]
  close(): Promise<void>
}

export function jsonReply(status: number, value: unknown): Reply {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  }
}

/** A real HTTP server on 127.0.0.1 that records each request and answers with `handler`. */
export async function startLoopback(
  handler: (received: Received) => Reply | Promise<Reply>,
): Promise<LoopbackServer> {
  const received: Received[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const item: Received = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      }
      received.push(item)
      void Promise.resolve(handler(item)).then(reply => {
        response.writeHead(reply.status, reply.headers)
        response.end(reply.body)
      })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    received,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** A port that nothing listens on: bind, read the number, release. */
export async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}
