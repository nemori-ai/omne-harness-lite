// @module-tag slow — every case spawns a peer process on real pipes.
// MC3-10: the stdio transport on real processes. The A layer answers what a script says and what
// no script can say (`special-stdio.mjs`); the B layer is the SDK's own servers.
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { LEGACY_PROTOCOL_VERSIONS } from '@omne-harness/mcp-contract'
import type {
  McpTransport,
  ProcessHandle,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  actionNameOf,
  generationOf,
  jsonOf,
  type PeerScript,
} from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { spawnHandle } from './fixtures/process.ts'
import { leftover } from './fixtures/scripted/children.ts'
import { stdioPeer, type StdioPeer } from './fixtures/scripted/stdio.ts'
import { everythingStdio } from './fixtures/sdk/everything.ts'
import { settledWithin } from './fixtures/settle.ts'

const VERSIONS = ['2026-07-28']
const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const never = new AbortController().signal
const NOT_SENT = { failure: { kind: 'not-sent', cause: 'connection-unavailable' } }
const SPECIAL = fileURLToPath(new URL('./fixtures/scripted/special-stdio.mjs', import.meta.url))
const LEGACY_SDK = fileURLToPath(new URL('./fixtures/sdk/legacy-stdio.mjs', import.meta.url))
const MODERN_SDK = fileURLToPath(new URL('./fixtures/sdk/modern-stdio.mjs', import.meta.url))

const factory = createLocalTransportFactory({
  clientInfo: { name: 'omne-harness-test', version: '0' },
  probeTimeoutMs: 300,
})

function ok<T>(outcome: { ok: T } | { failure: unknown }, what: string): T {
  if (!('ok' in outcome)) throw new Error(`${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

async function open(material: TransportMaterial): Promise<McpTransport> {
  return ok(await factory.open(material, never), 'open')
}

// An SDK peer loads the SDK before it answers the probe; under load that is more than the 300 ms
// the A-layer cases need to be short. Its probe waits long enough for a cold start.
const sdkFactory = createLocalTransportFactory({
  clientInfo: { name: 'omne-harness-test', version: '0' },
  probeTimeoutMs: 5_000,
})

async function openSdk(material: TransportMaterial): Promise<McpTransport> {
  return ok(await sdkFactory.open(material, never), 'open')
}

function materialOf(process: ProcessHandle): TransportMaterial {
  return { kind: 'stdio', process, generation: generationOf(1), instructionsByteLimit: 4096 }
}

/** A special peer process, by mode. */
function special(mode: string) {
  const spawned = spawnHandle([SPECIAL, mode])
  return {
    material: materialOf(spawned.handle),
    exited: spawned.exited,
    close: () => spawned.handle.stop(),
  }
}

async function scripted(script: PeerScript): Promise<StdioPeer> {
  return stdioPeer(script, { kind: 'stdio' }, VERSIONS)
}

const echo = (text: string) => ({ action: actionNameOf('echo'), args: jsonOf({ text }) })

afterEach(async () => {
  expect(await leftover(), 'child processes left alive').toEqual([])
})

describe('what the peer writes on stdout (T2, F4)', () => {
  it('drops the lines that are not JSON and the answer still arrives', async () => {
    const peer = special('noisy')
    const transport = await open(peer.material)
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe('2026-07-28')
    await transport.close()
    await peer.close()
  })

  it('a line above the 16 MiB byte bound breaks the stream: stream-broken, then not-sent', async () => {
    const peer = special('huge-line')
    const transport = await open(peer.material)
    expect(await transport.discover()).toEqual({
      failure: { kind: 'no-answer', cause: 'stream-broken' },
    })
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  }, 60_000)
})

describe('the process and the pipe (T8 S01, S02, X02)', () => {
  it('a process that exits before it answers: no-answer (process-exited), then not-sent', async () => {
    const peer = special('exit-before-answer')
    const transport = await open(peer.material)
    expect(await transport.discover()).toEqual({
      failure: { kind: 'no-answer', cause: 'process-exited' },
    })
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it('a process that ends stdout and stays alive: stream-broken after the exit window, then not-sent', async () => {
    const peer = special('end-stdout')
    const transport = await open(peer.material)
    expect(await transport.discover()).toEqual({
      failure: { kind: 'no-answer', cause: 'stream-broken' },
    })
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it('a process that exited before open: the first request is not-sent, nothing was written', async () => {
    const peer = special('exit-at-start')
    await peer.exited
    const transport = await open(peer.material)
    expect(await transport.discover()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it('a process that answers and exits: the answer is read, the next request is not-sent', async () => {
    const peer = special('answer-then-exit')
    const transport = await open(peer.material)
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe('2026-07-28')
    await peer.exited
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it("the SDK server's tool that exits the process: the call's answer is process-exited", async () => {
    const spawned = spawnHandle([MODERN_SDK])
    const transport = await openSdk(materialOf(spawned.handle))
    ok(await transport.discover(), 'discover')
    const sent = ok(
      await transport.call({ action: actionNameOf('crash'), args: jsonOf({}) }, never),
      'call',
    )
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'process-exited' })
    await transport.close()
    await spawned.handle.stop()
  })
})

describe('the legacy peer and the probe time (T3)', () => {
  it('an SDK server that speaks only the 2025 revisions: discover falls back to initialize, then echo works', async () => {
    const spawned = spawnHandle([LEGACY_SDK])
    const transport = await openSdk(materialOf(spawned.handle))
    const identity = ok(await transport.discover(), 'discover')
    expect(identity.protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    expect(identity.serverInfo).toEqual({
      untrusted: jsonOf({ name: 'legacy-stdio', version: '1' }),
    })
    const page = ok(await transport.listActions(), 'listActions')
    expect(
      page.tools.map(tool =>
        tool.kind === 'object'
          ? tool.entries.find(entry => entry.key === 'name')?.value
          : undefined,
      ),
    ).toEqual([jsonOf('echo')])
    const sent = ok(await transport.call(echo('hello'), never), 'call')
    const answer = await sent.answer
    expect(answer.kind).toBe('result')
    await transport.close()
    await spawned.handle.stop()
  })

  it('no answer within the probe time: the legacy path; the late discover answer is dropped', async () => {
    const peer = await scripted({
      discover: { kind: 'silent' },
      initialize: {
        kind: 'result',
        result: { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} },
      },
      listing: { '': { kind: 'result', result: { tools: [] } } },
    })
    const transport = await open(peer.material)
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    expect(ok(await transport.listActions(), 'listActions')).toEqual({ tools: [] })
    const methods = (await peer.received()).flatMap(entry =>
      entry.kind === 'request' || entry.kind === 'notification' ? [entry.method] : [],
    )
    expect(methods).toEqual([
      'server/discover',
      'initialize',
      'notifications/initialized',
      'tools/list',
    ])
    await transport.close()
    await peer.close()
  })
})

describe('a peer that does not read stdin (T5)', () => {
  it("the pipe is full: the call's signal settles the answer, the transport is unusable, and close() returns, each within the bound", async () => {
    const peer = special('deaf')
    const transport = await open(peer.material)
    const controller = new AbortController()
    // 1 MiB of arguments: far above the 64 KiB a pipe takes before the writer must wait.
    const blob = { kind: 'string', value: 'x'.repeat(1 << 20) } as const
    const call = transport.call(
      {
        action: actionNameOf('echo'),
        args: { kind: 'object', entries: [{ key: 'blob', value: blob }] },
      },
      controller.signal,
    )
    setTimeout(() => controller.abort(), 50)
    const sent = await settledWithin(call)
    expect(sent).not.toBe('pending')
    if (sent === 'pending') return
    expect(await settledWithin(ok(sent.settled, 'call').answer)).toEqual({
      settled: { kind: 'no-answer', cause: 'abandoned' },
    })
    expect(await settledWithin(transport.listActions())).toEqual({ settled: NOT_SENT })
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
    await peer.close()
  })

  it('small calls that departed sit in the buffer to a peer that does not read stdin: close() returns within the bound, before the process stops', async () => {
    const spawned = spawnHandle([SPECIAL, 'deaf'])
    try {
      const transport = await open(materialOf(spawned.handle))
      const stdin = spawned.child.stdin
      if (stdin === null) throw new Error('the child has no stdin')
      // 4 KB calls: the pipe takes 64 KiB before a write must wait; the first one Node keeps in
      // its own buffer is still accepted (below the 16 KiB high-water mark), so the call departs.
      let calls = 0
      for (; calls < 200 && stdin.writableLength === 0; calls += 1) {
        const sent = await settledWithin(transport.call(echo('x'.repeat(4000)), never))
        expect(sent, `call ${calls + 1}`).not.toBe('pending')
        if (sent === 'pending') return
      }
      expect(stdin.writableLength).toBeGreaterThan(0)
      expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
      expect(spawned.child.exitCode).toBeNull()
    } finally {
      await spawned.handle.stop()
    }
  })
})

describe('cancellation (T5)', () => {
  it('cancelRequest sends notifications/cancelled with the request id and the _meta of the negotiated version', async () => {
    const peer = await scripted({ calls: { echo: { kind: 'silent' } } })
    const transport = await open(peer.material)
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo('x'), never), 'call')
    await transport.cancelRequest(sent.requestId)
    const [cancelled] = (await peer.received()).flatMap(entry =>
      entry.kind === 'notification' && entry.method === 'notifications/cancelled' ? [entry] : [],
    )
    expect(cancelled?.params).toMatchObject({
      requestId: sent.requestId,
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
    })
    await transport.close()
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    await peer.close()
  })

  it("the SDK server's slow tool: the cancel notification does not settle the answer; close() abandons it", async () => {
    const spawned = spawnHandle([MODERN_SDK])
    const transport = await openSdk(materialOf(spawned.handle))
    ok(await transport.discover(), 'discover')
    const sent = ok(
      await transport.call({ action: actionNameOf('slow'), args: jsonOf({ ms: 60_000 }) }, never),
      'call',
    )
    await transport.cancelRequest(sent.requestId)
    const settled = await Promise.race([
      sent.answer.then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('pending'), 100)),
    ])
    expect(settled).toBe('pending')
    await transport.close()
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    await spawned.handle.stop()
  })
})

describe('the reference server (B layer)', () => {
  it('server-everything on stdio: the tools are listed and echo answers', async () => {
    const peer = everythingStdio()
    const transport = await openSdk(materialOf(peer.handle))
    const identity = ok(await transport.discover(), 'discover')
    expect(identity.protocolVersion).toBe('2026-07-28')
    const names: string[] = []
    let cursor: string | undefined
    do {
      const page = ok(await transport.listActions(cursor), 'listActions')
      for (const tool of page.tools) {
        const name =
          tool.kind === 'object'
            ? tool.entries.find(entry => entry.key === 'name')?.value
            : undefined
        if (name?.kind === 'string') names.push(name.value)
      }
      cursor = page.nextCursor
    } while (cursor !== undefined)
    expect(names).toContain('echo')
    expect(names.length).toBeGreaterThanOrEqual(20)
    const sent = ok(
      await transport.call(
        { action: actionNameOf('echo'), args: jsonOf({ message: 'hi' }) },
        never,
      ),
      'call',
    )
    const answer = await sent.answer
    expect(answer.kind).toBe('result')
    await transport.close()
    await peer.close()
  })
})
