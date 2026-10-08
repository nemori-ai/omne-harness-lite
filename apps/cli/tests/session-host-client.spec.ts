import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, rm, chmod, mkdir, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sendSessionHostRequest } from '../src/session-host-client.ts'
import { parseSessionHostRequest, type SessionHostEndpoint } from '../src/session-host-protocol.ts'
import { startLocalSessionHost, type SessionHostPolicy } from '../src/session-host-server.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const serverPolicy: SessionHostPolicy = {
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
const waitPolicy = { maxResponseBytes: 4096, timeoutMs: 2000 }
const packet = parseSessionHostRequest({
  format: 'omne-session-host/1',
  binding: {
    formatVersion: 1,
    centerId: 'a'.repeat(32),
    tenant: { organization: 'team', account: 'owner' },
  },
  command: 'createSession',
  input: {
    operationKey: 'original-stable-key',
    definition: { category: 'agent_definition', name: 'original-agent' },
    executionType: 'interactive',
    mode: 'never',
    collaboration: 'co-work',
  },
})
if (!packet) throw new Error('invalid request fixture')
const request = packet
async function directory() {
  const home = await mkdtemp(join(tmpdir(), 'omne-host-client-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  return home
}
async function boot(execute: SessionHostEndpoint['execute']) {
  const home = await directory()
  const host = await startLocalSessionHost({
    home,
    endpoint: { execute },
    policy: serverPolicy,
    diagnostic: error => {
      throw error
    },
  })
  cleanup.push(() => host.close())
  return { home, host }
}
it('keeps the entire original request unconfirmed without creating a missing host namespace', async () => {
  const home = await directory()
  const reply = await sendSessionHostRequest({ home, request, policy: waitPolicy })
  expect(reply).toEqual({ kind: 'unconfirmed', request, reason: 'transportUnavailable' })
  await expect(lstat(join(home, 'run'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('refuses an unsafe actual socket before endpoint IO', async () => {
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => ({ failure: 'unavailable' }))
  const f = await boot(execute)
  await chmod(f.host.socketPath, 0o644)
  expect(await sendSessionHostRequest({ home: f.home, request, policy: waitPolicy })).toEqual({
    kind: 'unconfirmed',
    request,
    reason: 'transportUnavailable',
  })
  expect(execute).not.toHaveBeenCalled()
})
it('a caller abort affects only its wait and never retries or cancels the original endpoint operation', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  let finished = false
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => {
    entered.resolve()
    await gate.promise
    finished = true
    return { failure: 'unavailable' }
  })
  const f = await boot(execute),
    controller = new AbortController()
  const waiting = sendSessionHostRequest({
    home: f.home,
    request,
    policy: waitPolicy,
    signal: controller.signal,
  })
  try {
    await entered.promise
    controller.abort()
    expect(await waiting).toEqual({ kind: 'unconfirmed', request, reason: 'transportUnavailable' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(finished).toBe(false)
  } finally {
    gate.resolve()
  }
  await f.host.close()
  expect(finished).toBe(true)
  expect(execute).toHaveBeenCalledTimes(1)
})
it('a configured deadline preserves the original operation and accepted work without automatic retry', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => {
    entered.resolve()
    await gate.promise
    return { failure: 'unavailable' }
  })
  const f = await boot(execute)
  const waiting = sendSessionHostRequest({
    home: f.home,
    request,
    policy: { ...waitPolicy, timeoutMs: 300 },
  })
  try {
    await entered.promise
    expect(await waiting).toEqual({ kind: 'unconfirmed', request, reason: 'transportUnavailable' })
    expect(execute).toHaveBeenCalledTimes(1)
  } finally {
    gate.resolve()
  }
})
it('keeps host rejection and excessive response bytes unconfirmed instead of acknowledging an operation', async () => {
  const execute = vi.fn<SessionHostEndpoint['execute']>(async () => ({ failure: 'unavailable' }))
  const f = await boot(execute)
  expect(
    await sendSessionHostRequest({
      home: f.home,
      request,
      policy: { ...waitPolicy, maxResponseBytes: 8 },
    }),
  ).toEqual({ kind: 'unconfirmed', request, reason: 'invalidReply' })
  f.host.stopAdmission()
  expect(await sendSessionHostRequest({ home: f.home, request, policy: waitPolicy })).toEqual({
    kind: 'unconfirmed',
    request,
    reason: 'hostRejected',
  })
  expect(execute).toHaveBeenCalledTimes(1)
})
it.each([
  [
    'duplicate fields',
    '{"format":"omne-session-host/1","result":{},"result":{}}',
    'application/json',
  ],
  ['wrong envelope', '{"format":"another-protocol","result":{}}', 'application/json'],
  [
    'extra envelope field',
    '{"format":"omne-session-host/1","result":{},"access":{}}',
    'application/json',
  ],
  ['wrong media type', '{"format":"omne-session-host/1","result":{}}', 'text/plain'],
])('refuses a native peer with %s', async (_name, body, contentType) => {
  const home = await directory(),
    run = join(home, 'run'),
    socket = join(run, 'session-host.sock')
  await mkdir(run, { mode: 0o700 })
  const server = createServer((incoming, response) => {
    incoming.resume()
    response.writeHead(200, { 'content-type': contentType })
    response.end(body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, resolve)
  })
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      ),
  )
  await chmod(socket, 0o600)
  expect(await sendSessionHostRequest({ home, request, policy: waitPolicy })).toEqual({
    kind: 'unconfirmed',
    request,
    reason: 'invalidReply',
  })
})
