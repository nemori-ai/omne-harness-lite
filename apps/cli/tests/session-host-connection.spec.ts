import { afterEach, expect, it, vi } from 'vitest'
import { fork, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectSessionHost, readExistingSessionModel } from '../src/session-host-connection.ts'
import { sessionHostAddress } from '../src/session-host-io.ts'
import { startLocalSessionHost } from '../src/session-host-server.ts'
import { sendSessionHostRequest } from '../src/session-host-client.ts'
import { prepareStateDirectory } from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'

const homes: string[] = [],
  children: ChildProcess[] = [],
  servers: Server[] = []
const closes: (() => Promise<void>)[] = []
const binding = checkedTenantBinding({
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
})
const policy = {
  timeoutMs: 100,
  maxResponseBytes: 65536,
  startupTimeoutMs: 5000,
  pollIntervalMs: 20,
}
const hostPolicy = {
  maxRequestBytes: 65536,
  maxResponseBytes: 65536,
  maxConnections: 8,
  maxInFlight: 4,
  requestTimeoutMs: 1000,
  headersTimeoutMs: 1000,
  idleTimeoutMs: 1000,
  checkIntervalMs: 100,
  maxFailureRecords: 8,
  maxHeaderBytes: 8192,
}
async function home() {
  const path = await mkdtemp(join(tmpdir(), 'connect-'))
  homes.push(path)
  return path
}
function child(home: string, mode?: string) {
  const process = fork(
    fileURLToPath(new URL('./session-connection-worker.ts', import.meta.url)),
    [home, ...(mode ? [mode] : [])],
    { execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  )
  children.push(process)
  return process
}
afterEach(async () => {
  for (const close of closes.splice(0)) await close()
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  for (const process of children.splice(0)) {
    if (process.exitCode !== null || process.signalCode !== null) continue
    const stopped = once(process, 'exit', { signal: AbortSignal.timeout(5000) })
    process.kill('SIGTERM')
    await stopped
  }
  for (const path of homes.splice(0)) await rm(path, { recursive: true, force: true })
})
it('attaches to a responsive host without allocating another process', async () => {
  const path = await home()
  const host = await startLocalSessionHost({
    home: path,
    binding,
    policy: hostPolicy,
    endpoint: { execute: async () => ({ kind: 'creationNotReady' }) },
    diagnostic(error) {
      throw error
    },
  })
  closes.push(host.close)
  const launch = vi.fn(() => {
    throw new Error('must not launch')
  })
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'connected', defaults: null })
  expect(launch).not.toHaveBeenCalled()
})
it('starts one actual child for an absent channel and returns after its protocol is ready', async () => {
  const path = await home()
  const launch = vi.fn(() => child(path))
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'connected', defaults: null })
  expect(launch).toHaveBeenCalledOnce()
  expect(children[0]?.exitCode).toBeNull()
})
it('retains an existing unresponsive socket and never launches over it', async () => {
  const path = await home(),
    address = sessionHostAddress(path, binding)
  await prepareStateDirectory(path, address.directory)
  const server = createServer(socket => {
    socket.on('data', () => {})
    socket.on('error', () => {})
    socket.on('end', () => socket.destroy())
  })
  servers.push(server)
  server.listen(address.socketPath)
  await once(server, 'listening')
  await chmod(address.socketPath, 0o600)
  const launch = vi.fn(() => {
    throw new Error('must not launch')
  })
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'unconfirmed', reason: 'existingChannelUnavailable' })
  expect(launch).not.toHaveBeenCalled()
})
it('reports an actual startup exit without retrying the process', async () => {
  const path = await home(),
    launch = vi.fn(() => child(path, 'exit'))
  await expect(
    connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).rejects.toThrow('Session host exited before readiness: 7')
  expect(launch).toHaveBeenCalledOnce()
})
it('cancels only the client wait while the independently started host becomes ready', async () => {
  const path = await home(),
    abort = new AbortController()
  let ready: Promise<unknown> | undefined
  const launch = vi.fn(() => {
    const process = child(path, 'delayed')
    ready = once(process, 'message', { signal: AbortSignal.timeout(5000) })
    process.once('spawn', () => abort.abort())
    return process
  })
  expect(
    await connectSessionHost({ home: path, binding, policy, signal: abort.signal, launch }),
  ).toEqual({ kind: 'unconfirmed', reason: 'cancelled' })
  await ready
  expect(children[0]?.exitCode).toBeNull()
  expect(
    await sendSessionHostRequest({
      home: path,
      request: { format: 'omne-session-host/1', binding, command: 'readCreationDefaults' },
      policy: { timeoutMs: policy.timeoutMs, maxResponseBytes: policy.maxResponseBytes },
    }),
  ).toEqual({ kind: 'reply', result: { kind: 'creationNotReady' } })
  expect(launch).toHaveBeenCalledOnce()
})
it('does not start a process when already cancelled', async () => {
  const launch = vi.fn(() => {
    throw new Error('must not launch')
  })
  expect(
    await connectSessionHost({
      home: await home(),
      binding,
      policy,
      signal: AbortSignal.abort(),
      launch,
    }),
  ).toEqual({ kind: 'unconfirmed', reason: 'cancelled' })
  expect(launch).not.toHaveBeenCalled()
})
it('keeps the child alive after the startup wait expires', async () => {
  const path = await home()
  let ready: Promise<unknown> | undefined
  const launch = vi.fn(() => {
    const process = child(path, 'delayed')
    ready = once(process, 'message', { signal: AbortSignal.timeout(5000) })
    return process
  })
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy: { ...policy, startupTimeoutMs: 1 },
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'unconfirmed', reason: 'startupTimeout' })
  await ready
  expect(children[0]?.exitCode).toBeNull()
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'connected', defaults: null })
  expect(launch).toHaveBeenCalledOnce()
})
it('refuses an unexpected ready reply without launching over the existing host', async () => {
  const path = await home()
  const host = await startLocalSessionHost({
    home: path,
    binding,
    policy: hostPolicy,
    endpoint: { execute: async () => ({ failure: 'denied' }) },
    diagnostic(error) {
      throw error
    },
  })
  closes.push(host.close)
  const launch = vi.fn(() => {
    throw new Error('must not launch')
  })
  expect(
    await connectSessionHost({
      home: path,
      binding,
      policy,
      signal: new AbortController().signal,
      launch,
    }),
  ).toEqual({ kind: 'unconfirmed', reason: 'invalidReply' })
  expect(launch).not.toHaveBeenCalled()
})

it('reports an absent host without creating its channel', async () => {
  const path = await home()
  expect(
    await readExistingSessionModel({
      home: path,
      binding,
      policy: { timeoutMs: 100, maxResponseBytes: 65536 },
      signal: new AbortController().signal,
    }),
  ).toEqual({ kind: 'absent' })
})
it.each([
  [
    { kind: 'initialModel', routeName: 'live-route' },
    { kind: 'ready', routeName: 'live-route' },
  ],
  [
    { kind: 'initialModel', routeName: '' },
    { kind: 'unavailable', reason: 'invalidReply' },
  ],
  [
    { kind: 'initialModel', routeName: 'live-route', extra: true },
    { kind: 'unavailable', reason: 'invalidReply' },
  ],
] as const)(
  'reads an existing host model without accepting malformed data %#',
  async (reply, expected) => {
    const path = await home()
    const host = await startLocalSessionHost({
      home: path,
      binding,
      policy: hostPolicy,
      endpoint: { execute: async () => reply },
      diagnostic(error) {
        throw error
      },
    })
    closes.push(host.close)
    expect(
      await readExistingSessionModel({
        home: path,
        binding,
        policy: { timeoutMs: 1000, maxResponseBytes: 65536 },
        signal: new AbortController().signal,
      }),
    ).toEqual(expected)
  },
)
it('keeps an existing unresponsive channel distinct from an absent host', async () => {
  const path = await home(),
    address = sessionHostAddress(path, binding)
  await prepareStateDirectory(path, address.directory)
  const server = createServer(socket => socket.destroy())
  servers.push(server)
  server.listen(address.socketPath)
  await once(server, 'listening')
  await chmod(address.socketPath, 0o600)
  expect(
    await readExistingSessionModel({
      home: path,
      binding,
      policy: { timeoutMs: 100, maxResponseBytes: 65536 },
      signal: new AbortController().signal,
    }),
  ).toEqual({ kind: 'unavailable', reason: 'transportUnavailable' })
})
