import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { startLocalSessionHost, type LocalSessionHost } from '../src/session-host-server.ts'
import type { SessionHostEndpoint } from '../src/session-host-protocol.ts'
const homes: string[] = [],
  hosts: LocalSessionHost[] = []
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})
const packet = {
  format: 'omne-session-host/1',
  binding: {
    formatVersion: 1,
    centerId: 'a'.repeat(32),
    tenant: { organization: 'team', account: 'owner' },
  },
  command: 'readSession',
  session: 'original-session',
}
const policy = {
  maxRequestBytes: 2048,
  maxResponseBytes: 4096,
  maxConnections: 8,
  maxInFlight: 4,
  requestTimeoutMs: 2000,
  headersTimeoutMs: 1000,
  idleTimeoutMs: 1000,
  checkIntervalMs: 100,
  maxFailureRecords: 8,
  maxHeaderBytes: 8192,
}
async function boot(
  endpoint: SessionHostEndpoint = { execute: async () => ({ failure: 'unavailable' }) },
  selectedPolicy = policy,
  report?: (error: unknown) => void,
) {
  const home = await mkdtemp(join(tmpdir(), 'omne-host-'))
  homes.push(home)
  const diagnostic = report ?? vi.fn()
  const host = await startLocalSessionHost({ home, endpoint, policy: selectedPolicy, diagnostic })
  hosts.push(host)
  return { home, host, diagnostic }
}
function send(socketPath: string, data: unknown = packet) {
  const text = JSON.stringify(data)
  let request!: ReturnType<typeof httpRequest>
  const response = new Promise<{ status: number; body: string }>((resolve, reject) => {
    request = httpRequest(
      {
        socketPath,
        path: '/session',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) },
      },
      reply => {
        let body = ''
        reply.setEncoding('utf8')
        reply.on('data', chunk => {
          body += chunk
        })
        reply.on('error', reject)
        reply.on('end', () => resolve({ status: reply.statusCode!, body }))
      },
    )
    request.on('error', reject)
    request.end(text)
  })
  return { request, response }
}
it('owns a private actual Unix HTTP socket and refuses to replace a live host', async () => {
  const f = await boot()
  expect((await stat(f.host.socketPath)).mode & 0o777).toBe(0o600)
  expect((await stat(join(f.home, 'run'))).mode & 0o777).toBe(0o700)
  expect(await send(f.host.socketPath).response).toMatchObject({ status: 200 })
  await expect(
    startLocalSessionHost({
      home: f.home,
      endpoint: { execute: async () => ({ failure: 'denied' }) },
      policy,
      diagnostic: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: 'EADDRINUSE' })
  expect(await send(f.host.socketPath).response).toMatchObject({ status: 200 })
})
it('rejects shape/authority injection and excessive bodies before calling the borrowed endpoint', async () => {
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => ({ failure: 'unavailable' }))
  const f = await boot({ execute })
  expect(await send(f.host.socketPath, { ...packet, permit: {} }).response).toHaveProperty(
    'status',
    400,
  )
  expect(
    await send(f.host.socketPath, { ...packet, padding: 'x'.repeat(3000) }).response,
  ).toHaveProperty('status', 413)
  expect(execute).not.toHaveBeenCalled()
  expect(f.diagnostic).not.toHaveBeenCalled()
})
it('client disconnect does not cancel accepted endpoint work and close waits for that original work', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  let finished = false
  const f = await boot({
    execute: async () => {
      entered.resolve()
      await gate.promise
      finished = true
      return { failure: 'unavailable' }
    },
  })
  const client = send(f.host.socketPath)
  const error = client.response.catch(error => error)
  await entered.promise
  client.request.destroy(new Error('intentional client disconnect'))
  expect(await error).toBeInstanceOf(Error)
  let closed = false
  const close = f.host.close().then(() => {
    closed = true
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(closed).toBe(false)
  expect(finished).toBe(false)
  gate.resolve()
  await close
  expect(finished).toBe(true)
  expect(closed).toBe(true)
})
it('synchronously stops dispatch admission without closing its borrowed endpoint', async () => {
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => ({ failure: 'unavailable' }))
  const f = await boot({ execute })
  f.host.stopAdmission()
  expect(await send(f.host.socketPath).response).toHaveProperty('status', 503)
  expect(execute).not.toHaveBeenCalled()
})

it('reserves bounded dispatch before IO and returns capacity without executing a second operation', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => {
    entered.resolve()
    await gate.promise
    return { failure: 'unavailable' }
  })
  const f = await boot({ execute }, { ...policy, maxInFlight: 1 })
  const first = send(f.host.socketPath).response
  await entered.promise
  try {
    expect(await send(f.host.socketPath).response).toHaveProperty('status', 503)
    expect(execute).toHaveBeenCalledTimes(1)
  } finally {
    gate.resolve()
  }
  expect(await first).toHaveProperty('status', 200)
  expect(await send(f.host.socketPath).response).toHaveProperty('status', 200)
  expect(execute).toHaveBeenCalledTimes(2)
})
it('keeps the original endpoint defect and diagnostic defect at close and stops later dispatch', async () => {
  const original = new Error('controlled endpoint defect'),
    reporting = new Error('controlled diagnostic defect')
  const diagnostic = vi.fn(() => {
    throw reporting
  })
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => {
    throw original
  })
  const f = await boot({ execute }, policy, diagnostic)
  expect(await send(f.host.socketPath).response).toMatchObject({ status: 500 })
  expect(diagnostic).toHaveBeenCalledWith(original)
  expect(await send(f.host.socketPath).response).toHaveProperty('status', 503)
  expect(execute).toHaveBeenCalledTimes(1)
  hosts.splice(hosts.indexOf(f.host), 1)
  const closing = f.host.close()
  await expect(closing).rejects.toMatchObject({ errors: [original, reporting] })
  expect(f.host.close()).toBe(closing)
})
it('does not turn a completed operation with an excessive reply into a wire acknowledgement', async () => {
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => ({ failure: 'unavailable' }))
  const f = await boot({ execute }, { ...policy, maxResponseBytes: 8 })
  expect(await send(f.host.socketPath).response).toMatchObject({ status: 503 })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(f.diagnostic).not.toHaveBeenCalled()
})
