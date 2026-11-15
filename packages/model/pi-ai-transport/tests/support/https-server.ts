import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import type { IncomingHttpHeaders, ServerResponse } from 'node:http'
import { createServer, type Server } from 'node:https'
import { createServer as createTcpServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Certificate {
  readonly key: Buffer
  readonly cert: Buffer
  dispose(): void
}

export function createCertificate(): Certificate {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pi-ai-transport-tls-')))
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
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { env, stdio: 'ignore' },
  )
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  }
}

export interface CapturedRequest {
  readonly method: string | undefined
  readonly path: string | undefined
  readonly headers: IncomingHttpHeaders
  readonly body: Uint8Array
}

export type RequestHandler = (res: ServerResponse, request: CapturedRequest) => unknown

export interface HttpsFixture {
  readonly url: URL
  readonly ca: Buffer
  readonly requests: readonly CapturedRequest[]
  nextRequest(): Promise<CapturedRequest>
  openedSockets(): number
  closedSockets(): number
  resetConnections(): void
  close(): Promise<void>
}

export async function startHttpsServer(
  certificate: Certificate,
  handler: RequestHandler,
): Promise<HttpsFixture> {
  const requests: CapturedRequest[] = []
  const waiters: ((request: CapturedRequest) => void)[] = []
  const accepted = new Set<Socket>()
  let opened = 0
  let closed = 0
  const server: Server = createServer(
    { key: certificate.key, cert: certificate.cert },
    (req, res) => {
      readAll(req)
        .then(async body => {
          const captured: CapturedRequest = {
            method: req.method,
            path: req.url,
            headers: req.headers,
            body,
          }
          requests.push(captured)
          for (const waiter of waiters.splice(0)) waiter(captured)
          await handler(res, captured)
        })
        .catch(() => res.destroy())
    },
  )
  server.on('secureConnection', socket => {
    opened += 1
    accepted.add(socket)
    socket.once('close', () => {
      closed += 1
      accepted.delete(socket)
    })
  })
  await listen(server)
  return {
    url: new URL(`https://127.0.0.1:${port(server)}/`),
    ca: certificate.cert,
    requests,
    nextRequest: () => new Promise(resolve => waiters.push(resolve)),
    openedSockets: () => opened,
    closedSockets: () => closed,
    resetConnections: () => {
      for (const socket of accepted) socket.destroy()
    },
    close: async () => {
      server.closeAllConnections()
      await closeServer(server)
    },
  }
}

export interface BlackHole {
  readonly url: URL
  close(): Promise<void>
}

export async function startBlackHole(): Promise<BlackHole> {
  const sockets = new Set<Socket>()
  const server = createTcpServer(socket => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
  })
  await listen(server)
  return {
    url: new URL(`https://127.0.0.1:${port(server)}/`),
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await closeServer(server)
    },
  }
}

async function readAll(stream: AsyncIterable<unknown>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) throw new Error('request body chunk is not bytes')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

interface Listener {
  listen(port: number, host: string, callback: () => void): unknown
  address(): string | { port: number } | null
  close(callback: (error?: Error) => void): unknown
}

function listen(server: Listener): Promise<void> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}

function port(server: Listener): number {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server has no TCP port')
  return address.port
}

function closeServer(server: Listener): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close(error => (error === undefined ? resolve() : reject(error))),
  )
}
