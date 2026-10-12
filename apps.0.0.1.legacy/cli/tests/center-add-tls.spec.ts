// @module-tag slow
// Generates a local certificate and sends actual HTTPS through the production client.
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:https'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { addCenter } from '../src/center-add.ts'
import { openCliCatalog } from '../src/catalog-open.ts'

let root: string
let certificate: string
let server: Server
let endpoint: string
const requests: {
  readonly method: string | undefined
  readonly body: string
  readonly authorization: string | undefined
}[] = []
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'omne-center-add-tls-'))
  const key = join(root, 'key.pem'),
    cert = join(root, 'cert.pem')
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
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  )
  certificate = await readFile(cert, 'utf8')
  server = createServer(
    { key: await readFile(key, 'utf8'), cert: certificate, minVersion: 'TLSv1.3' },
    (request, response) => {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', chunk => {
        body += String(chunk)
      })
      request.on('end', () => {
        requests.push({
          method: request.method,
          body,
          authorization: request.headers.authorization,
        })
        const text = JSON.stringify({ reachable: true, centerId: 'a'.repeat(32), version: '3' })
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(text),
          connection: 'close',
        })
        response.end(text)
      })
    },
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing TLS address')
  endpoint = `https://127.0.0.1:${address.port}/`
})
afterAll(async () => {
  if (server !== undefined) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  }
  if (root !== undefined) await rm(root, { force: true, recursive: true })
})
it('verifies an actual TLS center and saves the exact observed template without a login request', async () => {
  const owned = await openCliCatalog(join(root, '.omne'), {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  try {
    const input = {
      name: 'verified center',
      endpoint,
      trust: { mode: 'ca' as const, certificateAuthorities: certificate },
    }
    expect(
      (await addCenter(owned.catalog, input, { timeoutMs: 3000 }, async () => true)).kind,
    ).toBe('saved')
    expect(await owned.catalog.listCenters()).toEqual([
      { name: input.name, center: { centerId: 'a'.repeat(32), endpoint, trust: input.trust } },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(JSON.parse(requests[0]!.body)).toEqual({
      operation: 'composition.governance-center-entry/v1#S-18',
    })
    expect(requests[0]?.authorization).toBeUndefined()
    expect((await owned.catalog.readSelection()).selected).toBeNull()
  } finally {
    await owned.close()
  }
})
it('rejects untrusted TLS without overwriting the saved template', async () => {
  const owned = await openCliCatalog(join(root, '.omne'), {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  try {
    const before = await owned.catalog.listCenters()
    const count = requests.length
    expect(
      await addCenter(
        owned.catalog,
        { name: 'untrusted', endpoint, trust: { mode: 'ca' } },
        { timeoutMs: 3000 },
        async () => true,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'trust' })
    expect(await owned.catalog.listCenters()).toEqual(before)
    expect(requests).toHaveLength(count)
  } finally {
    await owned.close()
  }
})
