// @module-tag slow — every case starts a peer on a local port, some a reference server process.
// MC3-11: the Streamable HTTP transport on real sockets, with the legacy HTTP+SSE fallback. The
// A layer is the scripted peer; the B layer is the SDK's servers and the reference server.
import { createServer as createTcpServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LEGACY_PROTOCOL_VERSIONS,
  isConnectionTarget,
  type ConnectionTarget,
  type PlainJson,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  actionNameOf,
  generationOf,
  jsonOf,
  taskIdOf,
  type PeerReceived,
  type PeerReply,
  type PeerScript,
} from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { leftover } from './fixtures/scripted/children.ts'
import {
  httpPeer,
  leftoverServers,
  type HttpPeer,
  type HttpPeerOptions,
} from './fixtures/scripted/http.ts'
import { bearerServer } from './fixtures/sdk/bearer-http.ts'
import { everythingHttp } from './fixtures/sdk/everything.ts'
import { legacyHttpServer } from './fixtures/sdk/legacy-http.ts'
import { settledWithin } from './fixtures/settle.ts'
import { failOnUnhandledErrors } from './unhandled.ts'

failOnUnhandledErrors()

const VERSIONS = ['2026-07-28']
const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const never = new AbortController().signal
const NOT_SENT = { failure: { kind: 'not-sent', cause: 'connection-unavailable' } }
const STREAM_BROKEN = { kind: 'no-answer', cause: 'stream-broken' }
const SECRET = 'secret-token-7f3a'

const factory = createLocalTransportFactory({
  clientInfo: { name: 'omne-harness-test', version: '0' },
  probeTimeoutMs: 300,
})

function ok<T>(outcome: { ok: T } | { failure: unknown }, what: string): T {
  if (!('ok' in outcome)) throw new Error(`${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function credential(token = SECRET) {
  let rejections = 0
  const handle: HttpCredentialHandle & Readonly<{ rejections(): number }> = {
    purpose: 'http-authorization',
    async authorize(headers) {
      headers.set('authorization', `Bearer ${token}`)
      return { ok: true }
    },
    async reportRejection() {
      rejections += 1
    },
    async release() {},
    rejections: () => rejections,
  }
  return handle
}

function targetOf(peer: HttpPeer): ConnectionTarget {
  if (peer.material.kind !== 'streamable-http')
    throw new Error('the peer is not on Streamable HTTP')
  return peer.material.target
}

function materialOf(target: ConnectionTarget, handle?: HttpCredentialHandle): TransportMaterial {
  return {
    kind: 'streamable-http',
    target,
    ...(handle === undefined ? {} : { credential: handle }),
    generation: generationOf(1),
    instructionsByteLimit: 4096,
  }
}

async function open(material: TransportMaterial): Promise<McpTransport> {
  return ok(await factory.open(material, never), 'open')
}

async function scripted(
  script: PeerScript | ((target: string) => PeerScript),
  options: HttpPeerOptions = {},
): Promise<HttpPeer> {
  return httpPeer(script, { kind: 'streamable-http' }, VERSIONS, options)
}

const result = (value: PlainJson): PeerReply => ({ kind: 'result', result: value })
const METHOD_NOT_FOUND: PeerReply = {
  kind: 'error',
  error: { code: -32601, message: 'Method not found' },
}
const LEGACY = result({ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} })
const echo = { action: actionNameOf('echo'), args: jsonOf({ text: 'hi' }) }
const DONE = { content: [{ type: 'text', text: 'done' }] }

function requestsOf(received: readonly PeerReceived[], method: string) {
  return received.flatMap(entry =>
    entry.kind === 'request' && entry.method === method ? [entry] : [],
  )
}

function toolNames(tools: readonly { kind: string }[]): string[] {
  return tools.flatMap(tool => {
    if (tool.kind !== 'object' || !('entries' in tool)) return []
    const entries = (
      tool as { entries: readonly { key: string; value: { kind: string; value?: unknown } }[] }
    ).entries
    const name = entries.find(entry => entry.key === 'name')?.value
    return name?.kind === 'string' && typeof name.value === 'string' ? [name.value] : []
  })
}

afterEach(async () => {
  expect(await leftover(), 'child processes left alive').toEqual([])
  expect(await leftoverServers(), 'servers left listening').toEqual([])
})

describe('authorization (T4, R4)', () => {
  it("the SDK's bearer gate: a wrong token is authorization-required with the metadata it names; reportRejection once; the right token works", async () => {
    const server = await bearerServer(SECRET, ['files:read'])
    const wrong = credential('not-the-token')
    const refused = await open(materialOf(server.target, wrong))
    const failed = await refused.call(echo, never)
    expect(
      'failure' in failed &&
        failed.failure.kind === 'not-sent' &&
        failed.failure.cause === 'authorization-required',
    ).toBe(true)
    if (
      'failure' in failed &&
      failed.failure.kind === 'not-sent' &&
      failed.failure.cause === 'authorization-required'
    ) {
      expect(failed.failure.discovery.resourceMetadataUrl).toBe(server.metadataUrl)
      expect(failed.failure.discovery.metadata).toBe('fetched')
      expect(failed.failure.discovery.issuers).toEqual(['https://issuer.test'])
      expect(failed.failure.discovery.scopes).toEqual(['files:read'])
    }
    expect(wrong.rejections()).toBe(1)
    await refused.close()

    const right = credential()
    const transport = await open(materialOf(server.target, right))
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe('2026-07-28')
    const sent = ok(await transport.call(echo, never), 'call')
    expect((await sent.answer).kind).toBe('result')
    expect(right.rejections()).toBe(0)
    await transport.close()
    await server.close()
  })

  it('403 with insufficient_scope: authorization-required with the scope of the header; another 403: connection-unavailable without reportRejection', async () => {
    const scoped = await scripted({
      listing: {
        '': {
          kind: 'http',
          status: 403,
          headers: { 'www-authenticate': 'Bearer error="insufficient_scope", scope="files:write"' },
        },
      },
    })
    const handle = credential()
    const transport = await open(materialOf(targetOf(scoped), handle))
    const failed = await transport.listActions()
    expect(
      'failure' in failed &&
        failed.failure.kind === 'not-sent' &&
        failed.failure.cause === 'authorization-required' &&
        failed.failure.discovery.scopes,
    ).toEqual(['files:write'])
    expect(handle.rejections()).toBe(1)
    await transport.close()
    await scoped.close()

    const forbidden = await scripted({
      listing: { '': { kind: 'http', status: 403, body: 'origin not allowed' } },
    })
    const other = credential()
    const second = await open(materialOf(targetOf(forbidden), other))
    expect(await second.listActions()).toEqual(NOT_SENT)
    expect(other.rejections()).toBe(0)
    await second.close()
    await forbidden.close()
  })

  it('without resource_metadata the path address is tried before the root; with neither the root is reported unavailable', async () => {
    const METADATA = '/.well-known/oauth-protected-resource'
    const rootOnly = await scripted(target => ({
      listing: {
        '': { kind: 'http', status: 401, headers: { 'www-authenticate': 'Bearer realm="mcp"' } },
      },
      wellKnown: {
        [METADATA]: {
          resource: target,
          authorization_servers: ['https://root.test'],
          scopes_supported: ['a'],
        },
      },
    }))
    const transport = await open(materialOf(targetOf(rootOnly), credential()))
    const failed = await transport.listActions()
    const fetched = (await rootOnly.received()).flatMap(entry =>
      entry.kind === 'fetch' ? [new URL(entry.url).pathname] : [],
    )
    expect(fetched).toEqual([`${METADATA}/mcp`, METADATA])
    expect(
      'failure' in failed &&
        failed.failure.kind === 'not-sent' &&
        failed.failure.cause === 'authorization-required' &&
        failed.failure.discovery.issuers,
    ).toEqual(['https://root.test'])
    await transport.close()
    await rootOnly.close()

    const none = await scripted({
      listing: {
        '': { kind: 'http', status: 401, headers: { 'www-authenticate': 'Bearer scope="x y"' } },
      },
    })
    const bare = await open(materialOf(targetOf(none), credential()))
    const unavailable = await bare.listActions()
    expect(
      'failure' in unavailable &&
        unavailable.failure.kind === 'not-sent' &&
        unavailable.failure.cause === 'authorization-required'
        ? unavailable.failure.discovery
        : undefined,
    ).toMatchObject({
      resourceMetadataUrl: `${new URL(targetOf(none)).origin}${METADATA}`,
      metadata: 'unavailable',
      issuers: [],
      scopes: ['x', 'y'],
    })
    await bare.close()
    await none.close()
  })

  it('with resource_metadata in the challenge only the address it names is fetched', async () => {
    const NAMED = '/.well-known/oauth-protected-resource/named-document'
    const peer = await scripted(target => ({
      listing: {
        '': {
          kind: 'http',
          status: 401,
          headers: {
            'www-authenticate': `Bearer realm="mcp", resource_metadata="${new URL(NAMED, target).href}"`,
          },
        },
      },
      wellKnown: {
        [NAMED]: { resource: target, authorization_servers: ['https://named.test'] },
      },
    }))
    const transport = await open(materialOf(targetOf(peer), credential()))
    const failed = await transport.listActions()
    const fetched = (await peer.received()).flatMap(entry =>
      entry.kind === 'fetch' ? [new URL(entry.url).pathname] : [],
    )
    expect(fetched).toEqual([NAMED])
    expect(
      'failure' in failed &&
        failed.failure.kind === 'not-sent' &&
        failed.failure.cause === 'authorization-required' &&
        failed.failure.discovery,
    ).toMatchObject({
      resourceMetadataUrl: new URL(NAMED, targetOf(peer)).href,
      metadata: 'fetched',
      issuers: ['https://named.test'],
    })
    await transport.close()
    await peer.close()
  })

  it('the credential value appears in no answer, failure or discovery', async () => {
    const server = await bearerServer(SECRET, ['files:read'])
    const outcomes: unknown[] = []
    const transport = await open(materialOf(server.target, credential()))
    outcomes.push(await transport.discover(), await transport.listActions())
    const sent = ok(await transport.call(echo, never), 'call')
    outcomes.push(sent.requestId, await sent.answer, await transport.getTask(taskIdOf('t1')))
    await transport.close()
    const wrong = await open(materialOf(server.target, credential('another-secret-9b1c')))
    outcomes.push(await wrong.listActions())
    await wrong.close()
    const text = JSON.stringify(outcomes)
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('another-secret-9b1c')
    expect(text).not.toMatch(/Bearer /u)
    await server.close()
  })
})

describe('the waits that the signal and close() govern (T5, T4, T9)', () => {
  const ABANDONED = { kind: 'no-answer', cause: 'abandoned' }
  const CHALLENGE = { 'www-authenticate': 'Bearer realm="x"' }
  const refused: PeerReply = { kind: 'http', status: 401, headers: CHALLENGE }

  it("the peer takes the request and sends no answer head: the call's signal settles the answer within the bound", async () => {
    const peer = await scripted({ calls: { echo: { kind: 'silent' } } }, { holdHeads: true })
    const transport = await open(materialOf(targetOf(peer)))
    const controller = new AbortController()
    const call = transport.call(echo, controller.signal)
    setTimeout(() => controller.abort(), 50)
    const sent = await settledWithin(call)
    expect(sent).not.toBe('pending')
    if (sent === 'pending') return
    const answer = await settledWithin(ok(sent.settled, 'call').answer)
    expect(answer).toEqual({ settled: ABANDONED })
    await transport.close()
    await peer.close()
  })

  it("401 whose metadata fetch hangs: the call's signal ends the discovery within the bound; authorization-required, metadata unavailable, reportRejection once", async () => {
    const peer = await scripted({ calls: { echo: refused } }, { metadata: 'hangs' })
    const handle = credential()
    const transport = await open(materialOf(targetOf(peer), handle))
    const controller = new AbortController()
    const call = transport.call(echo, controller.signal)
    setTimeout(() => controller.abort(), 50)
    expect(await settledWithin(call)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'unavailable' },
        },
      },
    })
    expect(handle.rejections()).toBe(1)
    await transport.close()
    await peer.close()
  })

  it('401 whose metadata fetch hangs: close() ends the discovery within the bound with the same conclusion, reportRejection once before close() returned', async () => {
    const peer = await scripted({ listing: { '': refused } }, { metadata: 'hangs' })
    const handle = credential()
    const transport = await open(materialOf(targetOf(peer), handle))
    const listing = transport.listActions()
    for (let round = 0; round < 200; round += 1) {
      if ((await peer.received()).some(entry => entry.kind === 'fetch')) break
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    let rejectionsAtClose = -1
    await transport.close().then(() => {
      rejectionsAtClose = handle.rejections()
    })
    expect(await settledWithin(listing)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'unavailable' },
        },
      },
    })
    expect(rejectionsAtClose).toBe(1)
    await peer.close()
  })

  it('a metadata document that never ends counts as not fetched: the discovery settles with metadata unavailable', async () => {
    const peer = await scripted({ listing: { '': refused } }, { metadata: 'endless' })
    const transport = await open(materialOf(targetOf(peer), credential()))
    // Two candidate addresses, each read up to the 16 MiB bound over the loopback.
    expect(await settledWithin(transport.listActions(), 10_000)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'unavailable' },
        },
      },
    })
    await transport.close()
    await peer.close()
  })

  it('the fallback GET answered 401 with its body still to come when close() runs: reportRejection is not called', async () => {
    let seen = (): void => undefined
    const got = new Promise<void>(resolve => {
      seen = resolve
    })
    const plain = (status: number, body: string): PeerReply => ({
      kind: 'http',
      status,
      headers: { 'content-type': 'text/plain' },
      body,
    })
    const peer = await scripted(
      { discover: plain(404, 'nope'), initialize: plain(400, 'bad') },
      {
        sseRefusal: {
          status: 401,
          headers: { ...CHALLENGE, 'content-type': 'text/plain' },
          bodyDelayMs: 1_000,
        },
        onSseRequest: () => seen(),
      },
    )
    const handle = credential()
    const transport = await open(materialOf(targetOf(peer), handle))
    const discovering = transport.discover()
    await got
    await new Promise(resolve => setTimeout(resolve, 50))
    await transport.close()
    const rejectionsAtClose = handle.rejections()
    const outcome = await settledWithin(discovering)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(rejectionsAtClose).toBe(0)
    expect(handle.rejections()).toBe(0)
    expect(outcome).toEqual({ settled: NOT_SENT })
    await peer.close()
  })
})

describe('broken streams and re-sending (T8 D15, O05, O06, C04, O07)', () => {
  it('tools/list is sent once more with a new id after a broken stream; a second break is stream-broken', async () => {
    const peer = await scripted({
      listing: { '': [{ kind: 'stream-breaks' }, result({ tools: [] })] },
    })
    const transport = await open(materialOf(targetOf(peer)))
    expect(ok(await transport.listActions(), 'listActions')).toEqual({ tools: [] })
    const sent = requestsOf(await peer.received(), 'tools/list')
    expect(sent).toHaveLength(2)
    expect(sent[0]?.id).not.toBe(sent[1]?.id)
    await transport.close()
    await peer.close()

    const twice = await scripted({
      listing: { '': [{ kind: 'stream-breaks' }, { kind: 'stream-breaks' }] },
    })
    const second = await open(materialOf(targetOf(twice)))
    expect(await second.listActions()).toEqual({ failure: STREAM_BROKEN })
    expect(requestsOf(await twice.received(), 'tools/list')).toHaveLength(2)
    await second.close()
    await twice.close()
  })

  it('tools/call, tasks/update and tasks/cancel are not sent again; 5xx with a plain body is not either', async () => {
    const peer = await scripted({
      calls: { echo: { kind: 'stream-breaks' } },
      tasks: {
        t1: {
          update: { kind: 'stream-breaks' },
          cancel: { kind: 'http', status: 503, body: 'down' },
        },
      },
    })
    const transport = await open(materialOf(targetOf(peer)))
    const sent = ok(await transport.call(echo, never), 'call')
    expect(await sent.answer).toEqual(STREAM_BROKEN)
    expect(await transport.updateTask(taskIdOf('t1'), jsonOf({}))).toEqual({
      failure: STREAM_BROKEN,
    })
    expect(await transport.cancelTask(taskIdOf('t1'))).toEqual({ failure: STREAM_BROKEN })
    const received = await peer.received()
    expect(requestsOf(received, 'tools/call')).toHaveLength(1)
    expect(requestsOf(received, 'tasks/update')).toHaveLength(1)
    expect(requestsOf(received, 'tasks/cancel')).toHaveLength(1)
    await transport.close()
    await peer.close()
  })

  it('a connection refused is not-sent; a reset before the answer head is stream-broken (X01 versus a broken stream)', async () => {
    const refused = await scripted({ listing: { '': { kind: 'unsent' } } })
    const transport = await open(materialOf(targetOf(refused)))
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await refused.close()

    const resetting = createTcpServer(socket => socket.destroy())
    await new Promise<void>(resolve => resetting.listen(0, '127.0.0.1', () => resolve()))
    const address = resetting.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const target = `http://127.0.0.1:${port}/mcp`
    if (!isConnectionTarget(target)) throw new Error('bad target')
    const reset = await open(materialOf(target))
    expect(await reset.updateTask(taskIdOf('t1'), jsonOf({}))).toEqual({ failure: STREAM_BROKEN })
    await reset.close()
    await new Promise<void>(resolve => resetting.close(() => resolve()))
  })

  it('a redirect is not followed: a 302 to tools/list is not-sent and the peer saw one request', async () => {
    const peer = await scripted({
      listing: {
        '': { kind: 'http', status: 302, headers: { location: 'http://127.0.0.1:1/elsewhere' } },
      },
    })
    const transport = await open(materialOf(targetOf(peer)))
    expect(await transport.listActions()).toEqual(NOT_SENT)
    expect(requestsOf(await peer.received(), 'tools/list')).toHaveLength(1)
    await transport.close()
    await peer.close()
  })
})

describe('the page and the headers (T2, T3)', () => {
  const bad = {
    name: 'bad',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', 'x-mcp-header': 'no token' } },
    },
  }
  const good = {
    name: 'good',
    inputSchema: { type: 'object', properties: { q: { type: 'string', 'x-mcp-header': 'X-Q' } } },
  }

  it('on the modern revision a tool with an invalid x-mcp-header declaration is withheld; on a legacy revision it is not checked', async () => {
    const modern = await scripted({ listing: { '': result({ tools: [bad, good] }) } })
    const transport = await open(materialOf(targetOf(modern)))
    const page = ok(await transport.listActions(), 'listActions')
    expect(toolNames(page.tools)).toEqual(['good'])
    expect(page.withheld).toEqual([{ name: { untrusted: 'bad' }, reason: 'header-invalid' }])
    await transport.close()
    await modern.close()

    const legacy = await scripted({
      discover: METHOD_NOT_FOUND,
      initialize: LEGACY,
      listing: { '': result({ tools: [bad, good] }) },
    })
    const old = await open(materialOf(targetOf(legacy)))
    expect(ok(await old.discover(), 'discover').protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    const unchecked = ok(await old.listActions(), 'listActions')
    expect(toolNames(unchecked.tools)).toEqual(['bad', 'good'])
    expect(unchecked.withheld).toBeUndefined()
    await old.close()
    await legacy.close()
  })

  it('every request carries the version in _meta and in MCP-Protocol-Version alike: the reference server answers no -32020', async () => {
    const server = await everythingHttp('streamableHttp')
    const transport = await open(materialOf(server.target))
    ok(await transport.discover(), 'discover')
    const page = ok(await transport.listActions(), 'listActions')
    expect(toolNames(page.tools)).toContain('echo')
    const sent = ok(
      await transport.call(
        { action: actionNameOf('echo'), args: jsonOf({ message: 'hi' }) },
        never,
      ),
      'call',
    )
    expect((await sent.answer).kind).toBe('result')
    await transport.close()
    await server.close()
  }, 30_000)
})

describe('the legacy session and cancellation (T3, T5, T8 S07)', () => {
  it("the SDK's 2025 transport with sessions: the session id is carried back; after DELETE the next request is session-ended and the transport is unusable", async () => {
    const server = await legacyHttpServer()
    const transport = await open(materialOf(server.target))
    const identity = ok(await transport.discover(), 'discover')
    expect(LEGACY_PROTOCOL_VERSIONS).toContain(identity.protocolVersion)
    expect(toolNames(ok(await transport.listActions(), 'listActions').tools)).toEqual(['echo'])
    const [session] = server.sessions()
    expect(session).toBeDefined()
    const ended = await fetch(server.target, {
      method: 'DELETE',
      headers: { 'mcp-session-id': session ?? '' },
    })
    await ended.text()
    expect(await transport.listActions()).toEqual({
      failure: { kind: 'not-sent', cause: 'session-ended' },
    })
    expect(await transport.getTask(taskIdOf('t1'))).toEqual(NOT_SENT)
    await transport.close()
    await server.close()
  })

  it('on the modern revision cancelRequest ends the answer stream and sends no notification', async () => {
    const peer = await scripted({ calls: { echo: { kind: 'silent' } } })
    const transport = await open(materialOf(targetOf(peer)))
    const sent = ok(await transport.call(echo, never), 'call')
    await transport.cancelRequest(sent.requestId)
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    const received = await peer.received()
    expect(received.filter(entry => entry.kind === 'stream-aborted')).toEqual([
      { kind: 'stream-aborted', id: sent.requestId },
    ])
    expect(
      received.filter(
        entry => entry.kind === 'notification' && entry.method === 'notifications/cancelled',
      ),
    ).toEqual([])
    await transport.close()
    await peer.close()
  })
})

describe('the legacy HTTP+SSE fallback (T3, T8 I07)', () => {
  const sseScript: PeerScript = {
    discover: METHOD_NOT_FOUND,
    initialize: [
      {
        kind: 'http',
        status: 404,
        headers: { 'content-type': 'text/html' },
        body: '<html>not found</html>',
      },
      LEGACY,
    ],
    listing: { '': result({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }) },
    calls: { echo: result(DONE) },
  }

  it('after initialize is refused with a plain 4xx, the GET stream and its endpoint carry initialize, the listing and a call', async () => {
    const peer = await scripted(sseScript, { legacySse: true })
    const handle = credential()
    const transport = await open(materialOf(targetOf(peer), handle))
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    expect(toolNames(ok(await transport.listActions(), 'listActions').tools)).toEqual(['echo'])
    const sent = ok(await transport.call(echo, never), 'call')
    expect(await sent.answer).toEqual({ kind: 'result', result: jsonOf(DONE) })
    const received = await peer.received()
    expect(requestsOf(received, 'initialize')).toHaveLength(2)
    expect(requestsOf(received, 'tools/list')[0]?.headers?.['mcp-session-id']).toBeUndefined()
    // Before the GET the requests go to the target; after it, every message goes to the endpoint.
    expect(peer.requestLines()).toEqual([
      'POST /mcp',
      'POST /mcp',
      'GET /mcp',
      ...Array<string>(4).fill('POST /message'),
    ])
    await transport.close()
    await peer.close()
  })

  it('the stream breaking fails every request in flight with stream-broken, re-sends nothing, and leaves the transport unusable', async () => {
    const peer = await scripted(
      { ...sseScript, listing: { '': { kind: 'silent' } } },
      { legacySse: true },
    )
    const transport = await open(materialOf(targetOf(peer)))
    ok(await transport.discover(), 'discover')
    const listing = transport.listActions()
    await new Promise(resolve => setTimeout(resolve, 50))
    peer.breakStreams()
    expect(await listing).toEqual({ failure: STREAM_BROKEN })
    expect(requestsOf(await peer.received(), 'tools/list')).toHaveLength(1)
    expect(await transport.listActions()).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it('a 404 from the endpoint after initialize ends the session (S07)', async () => {
    const peer = await scripted(sseScript, { legacySse: true })
    const transport = await open(materialOf(targetOf(peer)))
    ok(await transport.discover(), 'discover')
    peer.endSessions()
    expect(await transport.listActions()).toEqual({
      failure: { kind: 'not-sent', cause: 'session-ended' },
    })
    expect(await transport.getTask(taskIdOf('t1'))).toEqual(NOT_SENT)
    await transport.close()
    await peer.close()
  })

  it('the fallback that does not hold reports connection-unavailable: no stream, a cross-origin endpoint', async () => {
    const noStream = await scripted(sseScript)
    const transport = await open(materialOf(targetOf(noStream)))
    expect(await transport.discover()).toEqual(NOT_SENT)
    await transport.close()
    await noStream.close()

    const crossOrigin = await scripted(sseScript, {
      legacySse: true,
      endpointOrigin: 'http://127.0.0.1:1',
    })
    const second = await open(materialOf(targetOf(crossOrigin)))
    expect(await second.discover()).toEqual(NOT_SENT)
    expect(requestsOf(await crossOrigin.received(), 'initialize')).toHaveLength(1)
    await second.close()
    await crossOrigin.close()
  })

  it('the reference server in its sse mode: the tools are listed and echo answers on the stream', async () => {
    const server = await everythingHttp('sse')
    const transport = await open(materialOf(server.target))
    const identity = ok(await transport.discover(), 'discover')
    expect(LEGACY_PROTOCOL_VERSIONS).toContain(identity.protocolVersion)
    const page = ok(await transport.listActions(), 'listActions')
    expect(toolNames(page.tools)).toContain('echo')
    const sent = ok(
      await transport.call(
        { action: actionNameOf('echo'), args: jsonOf({ message: 'hi' }) },
        never,
      ),
      'call',
    )
    expect((await sent.answer).kind).toBe('result')
    await transport.close()
    await server.close()
  }, 30_000)
})
