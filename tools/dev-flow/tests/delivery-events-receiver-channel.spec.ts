// @module-tag slow
// Slow: real local SSE servers, filesystem ownership and a child CLI; GitHub is a recorded seam.
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { channelDelivery, reconnectDelay, SseDecoder } from '../src/delivery/events-channel.ts'
import {
  makeChannelConfig,
  readChannelConfig,
  receiverPaths,
  writePrivateJson,
  type ChannelConfig,
} from '../src/delivery/events-channel-config.ts'
import {
  prepareChannelHook,
  recoverChannelHook,
  removeChannelHook,
} from '../src/delivery/events-channel-hooks.ts'
import { serveChannelReceiver } from '../src/delivery/events-receiver-channel.ts'
import { checkChannelReceiver } from '../src/delivery/events-receiver-check.ts'
import {
  claimChannelReceiver,
  readReceiverHealth,
  readReceiverState,
} from '../src/delivery/events-receiver-state.ts'
import type { GhText } from '../src/delivery/events-gh.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const homes: string[] = []
const testRoot = resolve('../../tmp/issue-820-N01/tests')
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
function home() {
  mkdirSync(testRoot, { recursive: true })
  const value = realpathSync(mkdtempSync(join(testRoot, 'case-')))
  homes.push(value)
  return value
}
function deferred() {
  let resolveStop = () => {}
  const promise = new Promise<void>(resolve => {
    resolveStop = resolve
  })
  return { promise, resolve: resolveStop }
}
const repository = 'owner/repo'
function saved(channel: string, managed = false) {
  const file = join(home(), 'events.jsonl')
  const config = makeChannelConfig({
    repository,
    file,
    channel,
    ...(managed ? {} : { hookId: 42 }),
  })
  const path = receiverPaths(file).config
  writePrivateJson(path, config)
  return { config, path, file }
}
function hook(config: ChannelConfig, id = 42) {
  return {
    id,
    name: 'web',
    active: true,
    config: { url: config.webhookUrl, content_type: 'json' },
    events: config.events,
  }
}
function github() {
  const hooks = new Map<number, ReturnType<typeof hook>>()
  const calls: string[][] = []
  let nextId = 1
  const gh: GhText = argv => {
    calls.push([...argv])
    const method = argv[2],
      endpoint = argv.find(value => value.startsWith('repos/')) ?? ''
    const id = Number(endpoint.split('/').at(-1))
    if (method === 'POST') {
      const url =
        argv.find(value => value.startsWith('config[url]='))?.slice('config[url]='.length) ?? ''
      const record = {
        id: nextId++,
        name: 'web',
        active: true,
        config: { url, content_type: 'json' },
        events: argv
          .filter(value => value.startsWith('events[]='))
          .map(value => value.slice('events[]='.length)),
      }
      hooks.set(record.id, record)
      return JSON.stringify(record)
    }
    if (method === 'DELETE') {
      hooks.delete(id)
      return ''
    }
    if (endpoint.endsWith('hooks?per_page=100')) return JSON.stringify([[...hooks.values()]])
    if (!hooks.has(id)) throw new Error('HTTP 404 secret-channel-and-token')
    return JSON.stringify(hooks.get(id))
  }
  return { gh, calls, hooks }
}
async function relay(status = 200) {
  const connections: ServerResponse[] = []
  const server = createServer((_req, response) => {
    connections.push(response)
    response.writeHead(status, { 'content-type': 'text/event-stream' })
    if (status === 200) response.write(': heartbeat\n\n')
    else response.end('secret-server-error')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing address')
  return {
    url: `http://127.0.0.1:${address.port}/secret-channel`,
    connections,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
function delivery(id: string, number = 7) {
  return JSON.stringify({
    'x-github-event': 'issues',
    'x-github-delivery': id,
    body: {
      action: 'closed',
      repository: { full_name: repository },
      issue: { number, state: 'closed' },
    },
  })
}
function records(file: string) {
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
}
const noGithub: GhText = () => {
  throw new Error('unexpected GitHub access')
}

describe('channel stream and ownership', () => {
  it('decodes every UTF-8 byte boundary, multiline data, BOM, CR/LF and heartbeat frames', () => {
    const frames: unknown[] = []
    const decoder = new SseDecoder(frame => frames.push(frame))
    const data = Buffer.from(
      '\ufeff: heartbeat\r\nid: 1\rdata: {"text":\r\ndata: "中文😀"}\r\n\r\nevent: ready\ndata: ignored\n\n',
    )
    for (const byte of data) decoder.push(Uint8Array.of(byte))
    expect(frames).toEqual([
      { id: '1', event: 'message', data: '{"text":\n"中文😀"}' },
      { id: '1', event: 'ready', data: 'ignored' },
    ])
  })
  it('rejects oversize and invalid UTF-8 while malformed JSON has a redacted diagnostic', () => {
    expect(() => new SseDecoder(() => {}, 5).push(Buffer.from('data: secret'))).toThrow(
      'frame-too-large',
    )
    expect(() => new SseDecoder(() => {}).push(Uint8Array.of(255))).toThrow(
      'invalid-stream-encoding',
    )
    expect(() => channelDelivery('secret-token')).toThrow('invalid-channel-message')
    expect(reconnectDelay(0, () => 0)).toBe(1000)
    expect(reconnectDelay(4, () => 1)).toBe(19200)
    expect(reconnectDelay(100, () => 1)).toBe(30000)
  })
  it('records exact created hook ids and deletes only the matching owned hook', () => {
    const a = saved('https://smee.io/secret-a', true),
      b = saved('https://smee.io/secret-b', true),
      gh = github()
    const ownA = prepareChannelHook(a.config, a.path, gh.gh),
      ownB = prepareChannelHook(b.config, b.path, gh.gh)
    expect(ownA.ownership).toEqual({ kind: 'owned', hookId: 1 })
    expect(ownB.ownership).toEqual({ kind: 'owned', hookId: 2 })
    removeChannelHook(ownA, a.path, gh.gh)
    expect([...gh.hooks.keys()]).toEqual([2])
    expect(readChannelConfig(a.path).ownership).toEqual({ kind: 'deleted', hookId: 1 })
    expect(statSync(a.path).mode & 0o777).toBe(0o600)
  })
  it('recovers a lost create response by exact persisted instance URL without another POST', () => {
    const a = saved('https://smee.io/secret-a', true),
      gh = github()
    const lost: GhText = (argv, timeout) => {
      const result = gh.gh(argv, timeout)
      if (argv[2] === 'POST') throw new Error('lost')
      return result
    }
    expect(() => prepareChannelHook(a.config, a.path, lost)).toThrow('hook-create-outcome-unknown')
    const pending = readChannelConfig(a.path)
    expect(pending.ownership.kind).toBe('creating')
    const recovered = recoverChannelHook(pending, a.path, gh.gh)
    expect(recovered.ownership).toEqual({ kind: 'owned', hookId: 1 })
    expect(gh.calls.filter(call => call[2] === 'POST')).toHaveLength(1)
    removeChannelHook(recovered, a.path, gh.gh)
    expect(gh.hooks.size).toBe(0)
  })
  it('keeps borrowed, ambiguous and mismatched hooks untouched', () => {
    const borrowed = saved('https://smee.io/borrowed'),
      gh = github()
    removeChannelHook(borrowed.config, borrowed.path, noGithub)
    const a = saved('https://smee.io/managed', true)
    const own = prepareChannelHook(a.config, a.path, gh.gh)
    const foreign = gh.hooks.get(1)
    if (foreign === undefined) throw new Error('missing hook')
    foreign.config.url = 'https://smee.io/foreign'
    expect(() => removeChannelHook(own, a.path, gh.gh)).toThrow('hook-ownership-mismatch')
    const pending: ChannelConfig = {
      ...a.config,
      ownership: { kind: 'creating', requestedAt: new Date().toISOString() },
    }
    expect(() => recoverChannelHook(pending, a.path, gh.gh)).toThrow('hook-ownership-unknown')
    gh.hooks.set(2, hook(a.config, 2))
    gh.hooks.set(3, hook(a.config, 3))
    expect(() => recoverChannelHook(pending, a.path, gh.gh)).toThrow('hook-ownership-unknown')
    expect(gh.calls.some(call => call[2] === 'DELETE')).toBe(false)
  })
  it('refuses insecure config, duplicate writers and corrupt logs, and never kills a stale pid', async () => {
    const a = saved('https://smee.io/borrowed')
    chmodSync(a.path, 0o644)
    expect(() => readChannelConfig(a.path)).toThrow('insecure-config-permissions')
    chmodSync(a.path, 0o600)
    writeFileSync(receiverPaths(a.file).pid, '99999999\n')
    const own = claimChannelReceiver(a.config)
    try {
      expect(() => claimChannelReceiver(a.config)).toThrow('receiver-already-running')
    } finally {
      own.release()
    }
    expect(existsSync(receiverPaths(a.file).pid)).toBe(false)
    writeFileSync(a.file, 'truncated')
    const result = await serveChannelReceiver({
      configPath: a.path,
      repository,
      file: a.file,
      gh: noGithub,
      stopped: new Promise(() => {}),
      log: () => {},
    })
    expect(result).toBe(2)
    expect(readReceiverState(a.file).reasonCode).toBe('event-log-corrupt')
  })
})

describe('channel receiver against real loopback transport', () => {
  it('appends normalized events, skips bad/duplicate frames, and borrowed stop performs no GitHub operations', async () => {
    const server = await relay(),
      a = saved(server.url),
      stop = deferred(),
      logs: string[] = []
    const running = serveChannelReceiver({
      configPath: a.path,
      repository,
      file: a.file,
      gh: noGithub,
      stopped: stop.promise,
      log: line => logs.push(line),
    })
    try {
      await vi.waitFor(() =>
        expect(readReceiverHealth({ file: a.file, repository }).healthy).toBe(true),
      )
      const connection = server.connections[0]
      if (connection === undefined) throw new Error('missing connection')
      connection.write('data: broken-secret-token\n\n')
      for (const fragment of [
        `data: ${delivery('one').slice(0, 20)}`,
        `${delivery('one').slice(20)}\n\n`,
        `data: ${delivery('one')}\n\n`,
      ])
        connection.write(fragment)
      await vi.waitFor(() =>
        expect(records(a.file).filter(record => record.delivery === 'one')).toHaveLength(1),
      )
      expect(records(a.file).find(record => record.delivery === 'one')).toMatchObject({
        event: 'issues',
        number: 7,
        receiver: { instanceId: a.config.instanceId, repository, requiresReconcile: true },
      })
      expect(logs.join('\n')).not.toContain('secret-token')
      expect(logs.join('\n')).not.toContain(server.url)
    } finally {
      stop.resolve()
      expect(await running).toBe(0)
      await server.close()
    }
    expect(readReceiverState(a.file).state).toBe('stopped')
    expect(existsSync(receiverPaths(a.file).pid)).toBe(false)
  })
  it('reconnects once, emits a coverage gap and uses no GitHub polling while connected', async () => {
    const server = await relay(),
      a = saved(server.url),
      stop = deferred(),
      delays: number[] = [],
      gh = vi.fn(noGithub)
    const running = serveChannelReceiver({
      configPath: a.path,
      repository,
      file: a.file,
      gh,
      stopped: stop.promise,
      log: () => {},
      random: () => 0,
      sleep: async ms => {
        delays.push(ms)
      },
    })
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(1))
      server.connections[0]?.end()
      await vi.waitFor(() =>
        expect(records(a.file).some(record => record.action === 'reconnected')).toBe(true),
      )
      expect(delays).toEqual([1000])
      expect(
        records(a.file)
          .filter(record => record.event === 'receiver')
          .map(record => record.action),
      ).toEqual(['connected', 'disconnected', 'reconnected'])
      expect(gh).not.toHaveBeenCalled()
    } finally {
      stop.resolve()
      await running
      await server.close()
    }
  })
  it('retains owned resources on permanent channel failure and reports recovery-needed without secrets', async () => {
    const server = await relay(403),
      a = saved(server.url, true),
      gh = github(),
      logs: string[] = []
    try {
      expect(
        await serveChannelReceiver({
          configPath: a.path,
          repository,
          file: a.file,
          gh: gh.gh,
          stopped: new Promise(() => {}),
          log: value => logs.push(value),
        }),
      ).toBe(2)
      expect(readReceiverState(a.file)).toMatchObject({
        state: 'recovery-needed',
        reasonCode: 'channel-permission-or-expiry',
      })
      expect(gh.hooks.size).toBe(1)
      expect(logs.join('\n')).not.toContain('secret')
      expect(existsSync(receiverPaths(a.file).pid)).toBe(false)
    } finally {
      await server.close()
    }
  })
  it('stopping one managed receiver preserves the other receiver and its hook', async () => {
    const server = await relay(),
      a = saved(`${server.url}-a`, true),
      b = saved(`${server.url}-b`, true)
    const stopA = deferred(),
      stopB = deferred(),
      gh = github()
    const run = (item: typeof a, stop: ReturnType<typeof deferred>) =>
      serveChannelReceiver({
        configPath: item.path,
        repository,
        file: item.file,
        gh: gh.gh,
        stopped: stop.promise,
        log: () => {},
      })
    const runA = run(a, stopA),
      runB = run(b, stopB)
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(2))
      stopA.resolve()
      expect(await runA).toBe(0)
      expect(gh.hooks.size).toBe(1)
      server.connections[1]?.write(`data: ${delivery('after-stop')}\n\n`)
      await vi.waitFor(() =>
        expect(records(b.file).some(event => event.delivery === 'after-stop')).toBe(true),
      )
      expect(readReceiverHealth({ file: b.file, repository }).healthy).toBe(true)
    } finally {
      stopA.resolve()
      stopB.resolve()
      await Promise.all([runA, runB])
      await server.close()
    }
  })
  it('self-check requires hook evidence, a real delivery receipt and successful wait reconciliation', async () => {
    const server = await relay(),
      a = saved(server.url),
      stop = deferred()
    const running = serveChannelReceiver({
      configPath: a.path,
      repository,
      file: a.file,
      gh: noGithub,
      stopped: stop.promise,
      log: () => {},
    })
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(1))
      server.connections[0]?.write(`data: ${delivery('checked')}\n\n`)
      await vi.waitFor(() =>
        expect(records(a.file).some(event => event.delivery === 'checked')).toBe(true),
      )
      const args = {
        configPath: a.path,
        repository,
        file: a.file,
        delivery: 'checked',
        issue: 7,
        gh: vi.fn(() => JSON.stringify({ state: 'CLOSED' })),
      }
      await expect(checkChannelReceiver(args)).rejects.toThrow('owner-hook-evidence-required')
      const evidence = join(home(), 'owner.json')
      writePrivateJson(evidence, {
        repository,
        hook: hook(a.config),
        delivery: {
          guid: 'checked',
          event: 'issues',
          status_code: 200,
          delivered_at: new Date().toISOString(),
        },
      })
      expect(await checkChannelReceiver({ ...args, hookEvidence: evidence })).toMatchObject({
        kind: 'receiver-check',
        wait: 'reconcile',
        event: 'verified',
      })
      expect(args.gh).toHaveBeenCalledTimes(1)
    } finally {
      stop.resolve()
      await running
      await server.close()
    }
  })
})

describe('receiver CLI safety', () => {
  const cli = fileURLToPath(new URL('../src/delivery/events-receiver-cli.ts', import.meta.url))
  it('reports legacy 422 as receiver-error exit 2 without raw gh usage, secrets or deletion', () => {
    const directory = home(),
      bin = join(directory, 'bin'),
      ledger = join(directory, 'calls')
    mkdirSync(bin)
    writeGh(
      bin,
      `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(ledger)},process.argv.slice(2).join(' ')+'\\n');process.stderr.write('HTTP 422: Validation Failed secret-channel\\nUsage: gh webhook');process.exit(1)\n`,
    )
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        cli,
        'serve',
        '--mode',
        'legacy',
        '--port',
        '19847',
        '--file',
        join(directory, 'events.jsonl'),
        '--repo',
        repository,
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, ...ghEnv(bin) },
      },
    )
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('receiver-error')
    expect(result.stderr).toContain('legacy-hook-conflict')
    expect(result.stderr).not.toMatch(/Usage: gh|secret-channel/)
    expect(readFileSync(ledger, 'utf8')).not.toContain('DELETE')
  })
  it('refuses unowned clean and validates input without calling GitHub or exposing arguments', () => {
    const directory = home()
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        cli,
        'clean',
        '--repo',
        repository,
        '--file',
        join(directory, 'events.jsonl'),
      ],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toEqual({
      kind: 'receiver-error',
      reasonCode: 'invalid-receiver-config',
    })
  })
})

describe('receiver restart and infrastructure faults', () => {
  it('restart preserves deduplication and signals a fresh bounded reconciliation boundary', async () => {
    const server = await relay(),
      a = saved(server.url)
    const firstStop = deferred(),
      first = serveChannelReceiver({
        configPath: a.path,
        file: a.file,
        repository,
        gh: noGithub,
        stopped: firstStop.promise,
        log: () => {},
      })
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(1))
      server.connections[0]?.write(`data: ${delivery('persisted')}\n\n`)
      await vi.waitFor(() =>
        expect(records(a.file).some(event => event.delivery === 'persisted')).toBe(true),
      )
    } finally {
      firstStop.resolve()
      await first
    }
    const secondStop = deferred(),
      second = serveChannelReceiver({
        configPath: a.path,
        file: a.file,
        repository,
        gh: noGithub,
        stopped: secondStop.promise,
        log: () => {},
      })
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(2))
      server.connections[1]?.write(`data: ${delivery('persisted')}\n\ndata: ${delivery('new')}\n\n`)
      await vi.waitFor(() =>
        expect(records(a.file).some(event => event.delivery === 'new')).toBe(true),
      )
      expect(records(a.file).filter(event => event.delivery === 'persisted')).toHaveLength(1)
      expect(records(a.file).filter(event => event.action === 'connected')).toHaveLength(2)
    } finally {
      secondStop.resolve()
      await second
      await server.close()
    }
  })
  it('the default local health check detects corruption within the five-second interval', async () => {
    const server = await relay(),
      a = saved(server.url),
      stop = deferred(),
      gh = vi.fn(noGithub)
    const running = serveChannelReceiver({
      configPath: a.path,
      file: a.file,
      repository,
      gh,
      stopped: stop.promise,
      log: () => {},
    })
    try {
      await vi.waitFor(() =>
        expect(readReceiverHealth({ file: a.file, repository }).healthy).toBe(true),
      )
      writeFileSync(a.file, 'corrupt\n')
      expect(readReceiverHealth({ file: a.file, repository }).reasonCode).toBe('event-log-corrupt')
      await expect(running).resolves.toBe(2)
      expect(readReceiverState(a.file).reasonCode).toBe('event-log-corrupt')
      expect(gh).not.toHaveBeenCalled()
    } finally {
      stop.resolve()
      await running
      await server.close()
    }
  }, 8000)
  it('does not mistake a replaced pid, dead process or live foreign writer for a healthy receiver', () => {
    const a = saved('https://smee.io/borrowed'),
      own = claimChannelReceiver(a.config)
    try {
      own.state.state = 'connected'
      own.state.reasonCode = 'coverage-gap'
      writePrivateJson(receiverPaths(a.file).state, own.state)
      writeFileSync(receiverPaths(a.file).pid, '99999999\n')
      expect(readReceiverHealth({ file: a.file, repository })).toMatchObject({
        healthy: false,
        reasonCode: 'receiver-pid-mismatch',
      })
      expect(() => own.release()).toThrow('receiver-process-identity-changed')
      writeFileSync(receiverPaths(a.file).pid, `${process.pid}\n`)
      writePrivateJson(receiverPaths(a.file).state, { ...own.state, pid: 99999999 })
      expect(readReceiverHealth({ file: a.file, repository })).toMatchObject({
        healthy: false,
        processAlive: false,
        reasonCode: 'receiver-process-dead',
      })
    } finally {
      writePrivateJson(receiverPaths(a.file).state, own.state)
      own.release()
    }
  })
})

describe('receiver policy and object hints', () => {
  it('caps every failed connection retry at 30 seconds and stops without a pending timer', async () => {
    const a = saved('https://smee.io/secret-channel'),
      stop = deferred(),
      delays: number[] = []
    const fetcher = vi.fn(async () => {
      throw new Error('private URL and credential')
    })
    const result = await serveChannelReceiver({
      configPath: a.path,
      file: a.file,
      repository,
      gh: noGithub,
      stopped: stop.promise,
      log: () => {},
      fetcher,
      random: () => 0,
      sleep: async ms => {
        delays.push(ms)
        if (delays.length === 7) stop.resolve()
      },
    })
    expect(result).toBe(0)
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
    expect(fetcher).toHaveBeenCalledTimes(7)
  })
  it('persists workflow/check/deployment locating fields without storing the raw webhook body', async () => {
    const server = await relay(),
      a = saved(server.url),
      stop = deferred()
    const running = serveChannelReceiver({
      configPath: a.path,
      file: a.file,
      repository,
      gh: noGithub,
      stopped: stop.promise,
      log: () => {},
    })
    try {
      await vi.waitFor(() => expect(server.connections.length).toBe(1))
      const body = {
        repository: { full_name: repository },
        workflow_run: { id: 81, run_attempt: 2, head_sha: 'A'.repeat(40) },
        check_run: { id: 82, check_suite: { id: 83 } },
        deployment: { id: 84, ref: 'refs/heads/main' },
        deployment_status: { id: 85 },
        secret: 'never-persist',
      }
      server.connections[0]?.write(
        `data: ${JSON.stringify({ 'x-github-event': 'workflow_run', 'x-github-delivery': 'run', body })}\n\n`,
      )
      await vi.waitFor(() =>
        expect(records(a.file).some(event => event.delivery === 'run')).toBe(true),
      )
      expect(records(a.file).find(event => event.delivery === 'run').subject).toMatchObject({
        runId: 81,
        runAttempt: 2,
        headSha: 'a'.repeat(40),
        checkRunId: 82,
        checkSuiteId: 83,
        deploymentId: 84,
        deploymentStatusId: 85,
      })
      expect(readFileSync(a.file, 'utf8')).not.toContain('never-persist')
      rmSync(a.file)
      expect(readReceiverHealth({ file: a.file, repository })).toMatchObject({
        healthy: false,
        reasonCode: 'event-log-missing',
      })
    } finally {
      stop.resolve()
      await running
      await server.close()
    }
  })
  it('refuses a managed configuration from another host without reading or deleting hooks', () => {
    const a = saved('https://smee.io/secret', true)
    writePrivateJson(a.path, { ...a.config, ownerHost: 'a-different-host' })
    expect(() => readChannelConfig(a.path)).toThrow('managed-config-belongs-to-another-host')
  })
})

describe('owned hook deletion recovery', () => {
  it('reconciles an exact 404 after a lost DELETE response without issuing another DELETE', () => {
    const a = saved('https://smee.io/managed', true),
      gh = github()
    const owned = prepareChannelHook(a.config, a.path, gh.gh)
    const lost: GhText = (argv, timeout) => {
      const result = gh.gh(argv, timeout)
      if (argv[2] === 'DELETE') throw new Error('lost response')
      return result
    }
    expect(() => removeChannelHook(owned, a.path, lost)).toThrow('hook-delete-failed')
    expect(readChannelConfig(a.path).ownership.kind).toBe('owned')
    const calls: string[][] = []
    const missing: GhText = argv => {
      calls.push([...argv])
      if (argv.includes('--paginate')) return JSON.stringify([[]])
      throw Object.assign(new Error('private'), { stderr: Buffer.from('gh: Not Found (HTTP 404)') })
    }
    expect(recoverChannelHook(readChannelConfig(a.path), a.path, missing).ownership).toEqual({
      kind: 'deleted',
      hookId: 1,
    })
    expect(calls).toHaveLength(2)
    expect(calls.every(call => call[2] === 'GET')).toBe(true)
  })
  it('does not mistake permission errors, ambiguous errors or network failures for deletion', () => {
    for (const stderr of ['gh: Forbidden (HTTP 403)', 'connection reset', 'Not Found']) {
      const a = saved('https://smee.io/managed', true),
        gh = github()
      const owned = prepareChannelHook(a.config, a.path, gh.gh)
      const failed: GhText = () => {
        throw Object.assign(new Error('private'), { stderr })
      }
      expect(() => removeChannelHook(owned, a.path, failed)).toThrow('hook-get-failed')
      expect(readChannelConfig(a.path).ownership).toEqual(owned.ownership)
    }
  })
})

it('retains ownership when a hook 404 cannot be disambiguated by a complete authorized list', () => {
  for (const list of ['forbidden', 'still-listed']) {
    const a = saved('https://smee.io/managed', true),
      gh = github()
    const owned = prepareChannelHook(a.config, a.path, gh.gh)
    const hidden: GhText = argv => {
      if (!argv.includes('--paginate'))
        throw Object.assign(new Error('private'), { stderr: 'gh: Not Found (HTTP 404)' })
      if (list === 'forbidden')
        throw Object.assign(new Error('private'), { stderr: 'gh: Forbidden (HTTP 403)' })
      return JSON.stringify([[{ id: 1 }]])
    }
    expect(() => recoverChannelHook(owned, a.path, hidden)).toThrow()
    expect(readChannelConfig(a.path).ownership).toEqual({ kind: 'owned', hookId: 1 })
    expect(gh.hooks.size).toBe(1)
  }
})

it('can subscribe to an owner-managed URL while retaining borrowed ownership', () => {
  const owner = saved('https://smee.io/managed', true)
  const subscriber = saved(owner.config.webhookUrl)
  expect(readChannelConfig(subscriber.path).ownership).toEqual({ kind: 'borrowed', hookId: 42 })
  expect(readChannelConfig(subscriber.path).webhookUrl).toBe(owner.config.webhookUrl)
  removeChannelHook(subscriber.config, subscriber.path, noGithub)
})
