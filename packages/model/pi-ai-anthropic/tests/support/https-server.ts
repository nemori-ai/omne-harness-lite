// Test support of the two-family integration: a self-signed certificate from openssl in a private
// temporary directory, and a real local HTTPS server that records each request body and answers
// through a handler. The transport member keeps its own copy for its tests; tests do not import
// across members, so this one stays small and covers only what the integration needs.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type Certificate = Readonly<{
  key: Buffer
  cert: Buffer
  /** Deletes the private directory. */
  dispose(): void
}>

/** One self-signed certificate for 127.0.0.1, valid for a day. */
export function createCertificate(): Certificate {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pi-ai-anthropic-tls-')))
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
      'subjectAltName=IP:127.0.0.1',
    ],
    { env, stdio: 'ignore' },
  )
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  }
}

export type ReceivedRequest = Readonly<{ path: string | undefined; body: string }>

export type HttpsFixture = Readonly<{
  /** `https://127.0.0.1:<port>/` */
  url: URL
  /** Every request received so far, in arrival order. */
  requests: readonly ReceivedRequest[]
  /** Destroys every connection and closes the listener. */
  close(): Promise<void>
}>

/** Starts the server; the handler runs after the whole request body has arrived. */
export async function startHttpsServer(
  certificate: Certificate,
  handler: (res: ServerResponse, request: ReceivedRequest) => void,
): Promise<HttpsFixture> {
  const requests: ReceivedRequest[] = []
  const server = createServer({ key: certificate.key, cert: certificate.cert }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('error', () => res.destroy())
    req.on('end', () => {
      const received = { path: req.url, body: Buffer.concat(chunks).toString('utf8') }
      requests.push(received)
      handler(res, received)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server has no TCP port')
  return {
    url: new URL(`https://127.0.0.1:${address.port}/`),
    requests,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error === undefined ? resolve() : reject(error))),
      )
    },
  }
}
