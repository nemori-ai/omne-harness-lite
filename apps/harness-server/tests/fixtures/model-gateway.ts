import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

export const GATEWAY_PATH = '/api/v1/chat/completions'
export const GATEWAY_REFUSAL = JSON.stringify({
  error: { message: 'local test gateway: every request is refused', code: 400 },
})

export type GatewayAnswer = Readonly<{
  status: number
  contentType: string
  body: string
  rest?: Readonly<{ after: Promise<void>; body: string }>
}>

export type GatewayScript = (request: Readonly<{ index: number; body: string }>) => GatewayAnswer

const refusal: GatewayScript = () => ({
  status: 400,
  contentType: 'application/json',
  body: GATEWAY_REFUSAL,
})

export type ModelGateway = Readonly<{
  url: string
  certPath: string
  requests(): number
  authorizations(): readonly (string | null)[]
  trustInProcess(): void
  close(): Promise<void>
}>

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

export async function startModelGateway(answer: GatewayScript = refusal): Promise<ModelGateway> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'harness-model-gateway-')))
  const { keyPath, certPath } = certificate(directory)
  const cert = readFileSync(certPath, 'utf8')
  let count = 0
  const authorizations: (string | null)[] = []
  const server = createServer({ key: readFileSync(keyPath), cert }, (request, response) => {
    const index = count
    count += 1
    authorizations.push(request.headers.authorization ?? null)
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const reply = answer({ index, body: Buffer.concat(chunks).toString('utf8') })
      response.writeHead(reply.status, { 'content-type': reply.contentType })
      if (reply.rest === undefined) {
        response.end(reply.body)
        return
      }
      const rest = reply.rest
      response.write(reply.body)
      void rest.after.then(
        () => response.end(rest.body),
        () => response.end(rest.body),
      )
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
    authorizations: () => [...authorizations],
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
