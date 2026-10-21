// Test support for the network seam: a self-signed certificate from openssl in a private
// temporary directory, a real local HTTPS server that records what it receives, and a TCP
// listener that accepts connections but never completes a TLS handshake.
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
  /** Deletes the private directory. */
  dispose(): void
}

/** One self-signed certificate for 127.0.0.1 and localhost, valid for a day. */
export function createCertificate(): Certificate {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pi-ai-transport-tls-')))
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
  // The child gets the inherited environment without the repository's BASELINE override.
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

/** Answers one request. It runs after the whole request body has arrived. */
export type RequestHandler = (res: ServerResponse, request: CapturedRequest) => unknown

export interface HttpsFixture {
  /** `https://127.0.0.1:<port>/` */
  readonly url: URL
  readonly ca: Buffer
  /** Every request received so far, in arrival order. */
  readonly requests: readonly CapturedRequest[]
  /** Resolves with the next request that arrives after this call. */
  nextRequest(): Promise<CapturedRequest>
  /** TLS connections accepted so far. */
  openedSockets(): number
  /** Accepted TLS connections that have since closed. */
  closedSockets(): number
  /** Destroys every connection and closes the listener. */
  close(): Promise<void>
}

export async function startHttpsServer(
  certificate: Certificate,
  handler: RequestHandler,
): Promise<HttpsFixture> {
  const requests: CapturedRequest[] = []
  const waiters: ((request: CapturedRequest) => void)[] = []
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
    socket.once('close', () => {
      closed += 1
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
    close: async () => {
      server.closeAllConnections()
      await closeServer(server)
    },
  }
}

export interface BlackHole {
  /** `https://127.0.0.1:<port>/`: TCP connects succeed; no byte ever comes back. */
  readonly url: URL
  close(): Promise<void>
}

/** Accepts TCP connections and keeps them open silently, so a TLS handshake never completes. */
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
