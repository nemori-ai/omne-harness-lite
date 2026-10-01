import { mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { record } from '../src/demo-ipc.ts'
import { createDemoSupervisor, type DemoSupervisorOptions } from '../src/demo-supervisor.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

async function durableEntries(dataDirectory: string): Promise<string> {
  const logRoot = join(dataDirectory, 'session-logs')
  const files = (await readdir(logRoot, { recursive: true })).filter(path =>
    path.endsWith('entries.jsonl'),
  )
  return (await Promise.all(files.map(path => readFile(join(logRoot, path), 'utf8')))).join('\n')
}

describe('C14 actual supervised worker', () => {
  it('keeps the clock available for owned work but not after physical application close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-clock-'))
    const server = await createLocalTls(join(root, 'tls'))
    try {
      const conversation = await openDemo(
        join(root, 'data'),
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        128,
        Buffer.from('controlled-clock-key'),
        { developmentTransport: server.developmentTransport },
      )
      expect(conversation.application.currentTime()).not.toBe('unavailable')
      expect((await conversation.close()).complete).toBe(true)
      expect(conversation.application.currentTime()).toBe('unavailable')
    } finally {
      await server.close()
    }
  }, 30_000)

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

  it('preserves a durable first-token time when the old worker dies after opening', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-opened-'))
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
      const sending = first.send('opened but unfinished', async () => undefined)
      await server.contentSent.promise
      await vi.waitFor(
        async () => expect(await durableEntries(dataDirectory)).toContain('model_call_opened'),
        {
          timeout: 10_000,
        },
      )
      const before = await durableEntries(dataDirectory)
      let firstTokenAt: unknown
      for (const line of before.split('\n').filter(Boolean)) {
        const batch: unknown = JSON.parse(line)
        if (!record(batch) || !Array.isArray(batch.entries)) continue
        for (const entry of batch.entries) {
          if (!record(entry) || !record(entry.payload) || !record(entry.payload.value)) continue
          if (entry.payload.value.kind === 'model_call_opened')
            firstTokenAt = entry.payload.value.firstTokenAt
        }
      }
      expect(typeof firstTokenAt).toBe('string')
      if (typeof firstTokenAt !== 'string') throw new Error('opened first-token time missing')
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      const reopened = await supervisor.open()
      const after = await durableEntries(dataDirectory)
      expect(after).toContain('"outcome":"interrupted"')
      expect(after.split(firstTokenAt).length).toBeGreaterThan(2)
      expect(server.requests).toHaveLength(1)
      expect((await reopened.totals()).cost.unknownCount).toBe(1)
      expect((await reopened.close()).complete).toBe(true)
    } finally {
      server.finishHeld()
      await server.close()
    }
  }, 50_000)

  it('recognizes the original complete batch when the worker receipt is lost', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-lost-receipt-'))
    const server = await createLocalTls(join(root, 'tls'))
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
      const dropped = supervisor.dropNextSendResult()
      if (dropped === undefined) throw new Error('receipt loss was not armed')
      const sending = first.send('complete then lose receipt', async () => undefined)
      expect(await dropped).toBe(true)
      const originalBytes = await durableEntries(dataDirectory)
      expect(originalBytes).toContain('"outcome":"complete"')
      expect(server.requests).toHaveLength(1)
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await sending).kind).toBe('unconfirmed')
      const successor = await supervisor.open()
      expect(await durableEntries(dataDirectory)).toBe(originalBytes)
      expect((await successor.totals()).responses).toBe(1)
      expect(server.requests).toHaveLength(1)
      expect((await successor.close()).complete).toBe(true)
    } finally {
      await server.close()
    }
  }, 45_000)

  it('ignores an actual old-worker result delivered after a successor has an in-flight call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-late-result-'))
    const server = await createLocalTls(join(root, 'tls'))
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
    let heldFinished = false
    try {
      const first = await supervisor.open()
      const dropped = supervisor.dropNextSendResult()
      if (dropped === undefined) throw new Error('old-result retention was not armed')
      const oldSend = first.send('old complete', async () => undefined)
      expect(await dropped).toBe(true)
      expect(supervisor.signalWorker('SIGKILL')).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect((await oldSend).kind).toBe('unconfirmed')
      server.setMode('hold')
      const successor = await supervisor.open()
      expect(successor.workerIdentity).not.toBe(first.workerIdentity)
      let successorSettled = false
      const nextSend = successor
        .send('new held request', async () => undefined)
        .then(result => {
          successorSettled = true
          return result
        })
      await vi.waitFor(() => expect(server.requests).toHaveLength(2), { timeout: 10_000 })
      expect(supervisor.replayDroppedSendResultAgainstCurrentWorker()).toBe(true)
      await Promise.resolve()
      expect(successorSettled).toBe(false)
      successor.stopActive()
      server.finishHeld()
      heldFinished = true
      expect((await nextSend).kind).not.toBe('saved')
      await vi.waitFor(() => expect(server.closedSockets()).toBeGreaterThanOrEqual(2), {
        timeout: 10_000,
      })
      await vi.waitFor(async () => expect((await successor.close()).complete).toBe(true), {
        timeout: 10_000,
      })
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect(server.requests).toHaveLength(2)
    } finally {
      if (!heldFinished) server.finishHeld()
      await server.close()
    }
  }, 50_000)

  it('preserves exact upstream usage and cost through real IPC and reopen', async () => {
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
      expect(server.requests).toHaveLength(1)
      expect((await conversation.totals()).responses).toBe(1)
      expect((await conversation.close()).complete).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      const successor = await supervisor.open()
      expect(successor.workerIdentity).not.toBe(conversation.workerIdentity)
      expect(successor.session).toBe(conversation.session)
      const reopenedUsage = await successor.totals()
      expect(reopenedUsage.responses).toBe(1)
      expect(reopenedUsage.usage.input_tokens.knownSum.toString()).toBe('9007199254740989')
      expect(reopenedUsage.usage.cache_read_tokens.knownSum.toString()).toBe('4')
      expect(reopenedUsage.cost.knownSum.toString()).toBe('0.000000000000000123456789')
      expect(server.requests).toHaveLength(1)
      expect((await successor.close()).complete).toBe(true)
    } finally {
      await server.close()
    }
  }, 45_000)

  it('preserves an empty HTTP failure through real IPC and reopen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-empty-http-ipc-'))
    const server = await createLocalTls(join(root, 'tls'))
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
      expect((await conversation.send('ordinary usage', async () => undefined)).kind).toBe('saved')
      expect(server.requests).toHaveLength(1)
      server.setMode('http503empty')
      const failed = await conversation.send('empty failure', async () => undefined)
      expect(server.requests).toHaveLength(2)
      expect(failed.kind).toBe('failed')
      if (failed.kind === 'failed') expect(failed.response).toBeDefined()
      expect((await conversation.totals()).responses).toBe(2)
      expect((await conversation.close()).complete).toBe(true)
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      const successor = await supervisor.open()
      expect(successor.workerIdentity).not.toBe(conversation.workerIdentity)
      expect(successor.session).toBe(conversation.session)
      expect((await successor.totals()).responses).toBe(2)
      expect(server.requests).toHaveLength(2)
      expect((await successor.close()).complete).toBe(true)
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
      const serialized = await durableEntries(dataDirectory)
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

  it('stops a held send while close crosses the IPC control path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-close-race-'))
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
      const conversation = await supervisor.open()
      const sending = conversation.send('held close', async () => undefined)
      await server.received.promise
      await expect(conversation.history()).rejects.toThrow('remote history unavailable')
      conversation.stopActive()
      const closing = conversation.close()
      await server.socketClosed.promise
      expect((await closing).complete).toBe(true)
      expect((await sending).kind).not.toBe('saved')
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect(server.requests).toHaveLength(1)
    } finally {
      server.finishHeld()
      await server.close()
    }
  }, 45_000)

  it('retains a bounded command when native child IPC reports write backpressure and still closes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-ipc-backpressure-'))
    const server = await createLocalTls(join(root, 'tls'))
    const supervisor = createDemoSupervisor({
      dataDirectory: join(root, 'data'),
      multiplier: '1.1',
      reserveTokens: '256',
      maxOutputTokens: 128,
      retirementWaitMilliseconds: 2000,
      maxPacketBytes: 8 * 1024 * 1024,
      maxCommands: 1,
      dedicatedRoot: true,
      developmentTransport: {
        baseUrl: server.developmentTransport.baseUrl,
        ca: server.developmentTransport.tls.ca,
      },
    })
    try {
      const conversation = await supervisor.open()
      const sending = conversation.send('x'.repeat(4 * 1024 * 1024), async () => undefined)
      expect(supervisor.inspect().nativeIpcBackpressureObserved).toBe(true)
      await expect(conversation.history()).rejects.toThrow('remote history unavailable')
      conversation.stopActive()
      expect((await conversation.close()).complete).toBe(true)
      expect((await sending).kind).not.toBe('saved')
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect(server.failures).toEqual([])
    } finally {
      await server.close()
    }
  }, 45_000)

  it('keeps the close control path available while terminal delivery is slow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cold-demo-slow-output-'))
    const server = await createLocalTls(join(root, 'tls'))
    const keyFile = join(root, 'key')
    const dataDirectory = join(root, 'data')
    await writeFile(keyFile, 'controlled-key', { mode: 0o600 })
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
    const observed = deferred()
    const release = deferred()
    try {
      const conversation = await supervisor.open()
      const sending = conversation.send('slow terminal', async () => {
        observed.resolve()
        await release.promise
      })
      await observed.promise
      await server.contentSent.promise
      conversation.stopActive()
      let closeSettled = false
      const closing = conversation.close().then(result => {
        closeSettled = true
        return result
      })
      await vi.waitFor(() => expect(closeSettled).toBe(true), { timeout: 3_000 })
      expect((await closing).complete).toBe(false)
      expect(supervisor.inspect().state).toBe('alive')
      release.resolve()
      const sent = await sending
      expect(sent.kind).not.toBe('saved')
      // This result records the first stop attempt while observer delivery was still held.
      expect(sent.released).toBe(false)
      await vi.waitFor(async () => expect((await conversation.close()).complete).toBe(true), {
        timeout: 10_000,
      })
      expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      expect(server.requests).toHaveLength(1)
      expect(await durableEntries(dataDirectory)).toContain('"outcome":"interrupted"')
    } finally {
      release.resolve()
      await server.close()
    }
  }, 45_000)

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
