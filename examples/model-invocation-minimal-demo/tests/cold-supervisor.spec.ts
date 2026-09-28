import { mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDemoSupervisor, type DemoSupervisorOptions } from '../src/demo-supervisor.ts'
import { createLocalTls } from './local-tls.ts'

describe('C14 actual supervised worker', () => {
  it('reserves the data root before asynchronous startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-race-'))
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
    })
    const firstOpen = supervisor.open()
    await expect(supervisor.open()).rejects.toThrow('already owned')
    const first = await firstOpen
    expect(supervisor.inspect().state).toBe('alive')
    expect((await first.close()).complete).toBe(true)
  }, 30_000)

  it('rejects a too-small configured envelope before spawning a worker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-small-ipc-'))
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 200,
      maxCommands: 1,
      dedicatedRoot: true,
    })
    await expect(supervisor.open()).rejects.toThrow('start packet exceeds configured IPC bound')
    expect(supervisor.inspect().state).toBe('none')
  }, 30_000)

  it('keeps one worker for turns, observes SIGKILL, and reconciles dispatched without another HTTP request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-supervisor-'))
    const server = await createLocalTls(join(root, 'tls'))
    server.setMode('hold')
    const keyFile = join(root, 'key')
    await writeFile(keyFile, 'controlled-key', { mode: 0o600 })
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      keyFile,
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: server.developmentTransport.baseUrl,
        ca: server.developmentTransport.tls.ca,
      },
    })
    try {
      const first = await supervisor.open()
      expect(supervisor.inspect().state).toBe('alive')
      expect(await first.models()).toHaveProperty('displayList')
      expect(await first.currentModel()).toHaveProperty('effectiveModel')
      expect(supervisor.inspect().state).toBe('alive')
      const sending = first.send('hold the first response', async () => undefined)
      await server.received.promise
      expect(server.requests).toHaveLength(1)
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      const reopened = await supervisor.open()
      expect(reopened.workerIdentity).not.toBe(first.workerIdentity)
      expect(reopened.session).toBe(first.session)
      expect(server.requests).toHaveLength(1)
      expect(await reopened.history()).toBeInstanceOf(Array)
      const settled = await reopened.totals()
      expect(settled.responses).toBe(1)
      expect(settled.cost.unknownCount).toBe(1)
      expect((await reopened.close()).complete).toBe(true)
      expect((await supervisor.close()).complete).toBe(true)
    } finally {
      server.finishHeld()
      await server.close()
    }
  }, 45_000)

  it('preserves exact upstream usage and cost and an empty HTTP failure through real IPC', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-exact-ipc-'))
    const server = await createLocalTls(
      join(root, 'tls'),
      async () => undefined,
      0,
      undefined,
      '{"prompt_tokens":9007199254740993,"completion_tokens":3,"total_tokens":9007199254740996,"prompt_tokens_details":{"cached_tokens":4,"cache_write_tokens":0},"cost":0.000000000000000123456789}',
    )
    const keyFile = join(root, 'key')
    await writeFile(keyFile, 'controlled-key', { mode: 0o600 })
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      keyFile,
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: server.developmentTransport.baseUrl,
        ca: server.developmentTransport.tls.ca,
      },
    })
    try {
      const conversation = await supervisor.open()
      expect((await conversation.send('exact usage', async () => undefined)).kind).toBe('saved')
      const usage = await conversation.totals()
      expect(usage.usage.input_tokens.knownSum.toString()).toBe('9007199254740989')
      expect(usage.usage.cache_read_tokens.knownSum.toString()).toBe('4')
      expect(usage.cost.knownSum.toString()).toBe('0.000000000000000123456789')
      server.setMode('http503empty')
      const failed = await conversation.send('empty failure', async () => undefined)
      expect(failed.kind).toBe('failed')
      if (failed.kind === 'failed') expect(failed.response).toBeDefined()
      expect((await conversation.totals()).responses).toBe(2)
      expect((await conversation.close()).complete).toBe(true)
    } finally {
      await server.close()
    }
  }, 45_000)

  it('reconciles the old dispatch before attempting a missing new credential file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-missing-key-'))
    const server = await createLocalTls(join(root, 'tls'))
    server.setMode('hold')
    const keyFile = join(root, 'key')
    await writeFile(keyFile, 'controlled-key', { mode: 0o600 })
    const dataDirectory = join(root, 'data')
    const supervisor = createDemoSupervisor({
      dataDirectory,
      keyFile,
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: server.developmentTransport.baseUrl,
        ca: server.developmentTransport.tls.ca,
      },
    })
    try {
      const first = await supervisor.open()
      const sending = first.send('old request', async () => undefined)
      await server.received.promise
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      await unlink(keyFile)
      await expect(supervisor.open()).rejects.toThrow('demo worker start unavailable')
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      const logRoot = join(dataDirectory, 'session-logs')
      const files = (await readdir(logRoot, { recursive: true })).filter(path =>
        path.endsWith('entries.jsonl'),
      )
      const serialized = (
        await Promise.all(files.map(path => readFile(join(logRoot, path), 'utf8')))
      ).join('\n')
      expect(serialized).toContain('runtime_lost')
      expect(server.requests).toHaveLength(1)
    } finally {
      server.finishHeld()
      await server.close()
    }
  }, 45_000)

  it('does not classify an IPC disconnect as process exit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-disconnect-'))
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
    })
    await supervisor.open()
    expect(supervisor.disconnectWorkerIpc()).toBe(true)
    expect(supervisor.inspect().state).toBe('alive')
    await expect(supervisor.open()).rejects.toThrow('already owned')
    expect((await supervisor.waitWorkerExit(false)).exited).toBe(true)
    await expect(supervisor.open()).rejects.toThrow('exit or resource close is unconfirmed')
  }, 30_000)

  it('does not transfer exit authority to a newly started supervisor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-unknown-'))
    const server = await createLocalTls(join(root, 'tls'))
    server.setMode('hold')
    const keyFile = join(root, 'key')
    await writeFile(keyFile, 'controlled-key', { mode: 0o600 })
    const options: DemoSupervisorOptions = {
      dataDirectory: join(root, 'data'),
      keyFile,
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 1_048_576,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: server.developmentTransport.baseUrl,
        ca: server.developmentTransport.tls.ca,
      },
    }
    const firstOwner = createDemoSupervisor(options)
    const stranger = createDemoSupervisor(options)
    try {
      const first = await firstOwner.open()
      const sending = first.send('lost owner', async () => undefined)
      await server.received.promise
      expect(firstOwner.signalWorker('SIGKILL')).toBe(true)
      expect(await firstOwner.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      await expect(stranger.open()).rejects.toThrow('demo worker start unavailable')
      expect(await stranger.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect(server.requests).toHaveLength(1)
    } finally {
      server.finishHeld()
      await server.close()
    }
  }, 45_000)
})
