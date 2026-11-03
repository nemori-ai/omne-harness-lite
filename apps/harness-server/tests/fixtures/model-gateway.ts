// A local Model gateway for the release-tree tests (R2-D258): a real HTTPS server on 127.0.0.1 with a
// self-signed certificate, so a test never sends a Model call to a real supplier. Every request gets
// the same answer, HTTP 400 with an error body, so a Run that calls the Model ends the same way each
// time. The send path accepts only `https:` routes, so the certificate must be trusted:
// - a `serve` child process trusts it through `NODE_EXTRA_CA_CERTS` (`certPath`);
// - a tree in the test process trusts it through `trustInProcess()`, which `close()` undoes.
// No vitest import: the r9 driver (`tests/r9/drive.ts`) uses this file too. The certificate comes
// from `openssl`, as in model-host-local's `tests/support/https-server.ts` (tests do not import across
// members).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

/** The path the route names; the gateway answers on any path. */
export const GATEWAY_PATH = '/api/v1/chat/completions'
/** The error body of every answer. */
export const GATEWAY_REFUSAL = JSON.stringify({
  error: { message: 'local test gateway: every request is refused', code: 400 },
})

export type ModelGateway = Readonly<{
  /** The `https:` route URL on 127.0.0.1. */
  url: string
  /** The PEM certificate file, for `NODE_EXTRA_CA_CERTS` of a child process. Deleted by `close()`. */
  certPath: string
  /** How many requests reached the gateway. */
  requests(): number
  /** Adds the certificate to the default trust of this process until `close()`. */
  trustInProcess(): void
  /** Stops the server, restores the trust of this process, deletes the certificate. */
  close(): Promise<void>
}>

function certificate(directory: string): { keyPath: string; certPath: string } {
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
  return { keyPath, certPath }
}

export async function startModelGateway(): Promise<ModelGateway> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'harness-model-gateway-')))
  const { keyPath, certPath } = certificate(directory)
  const cert = readFileSync(certPath, 'utf8')
  let count = 0
  const server = createServer({ key: readFileSync(keyPath), cert }, (request, response) => {
    count += 1
    request.resume()
    request.on('end', () => {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(GATEWAY_REFUSAL)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  let restore: string[] | undefined
  return {
    url: `https://127.0.0.1:${String(port)}${GATEWAY_PATH}`,
    certPath,
    requests: () => count,
    trustInProcess: () => {
      if (restore !== undefined) return
      restore = getCACertificates('default')
      setDefaultCACertificates([...restore, cert])
    },
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      if (restore !== undefined) setDefaultCACertificates(restore)
      restore = undefined
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
