// The call port `invoke` (SPEC MC-16): the send order, one failure of each step with the place
// given back, every "not sent" reason of R2, the mapping of the connection table's answers, the
// caller's abort after the send, and the outcomes through `classifyOutcome` and `toContentBlocks`.
import { describe, expect, it } from 'vitest'
import {
  LEGACY_PROTOCOL_VERSIONS,
  digestDefinition,
  markUnavailable,
  toContentBlocks,
  type ActionCatalogRecord,
  type CatalogKey,
  type DefinitionDigest,
  type InvokeRequest,
  type McpPorts,
} from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  credentialBindingOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  millisOf,
  taskIdOf,
  type PeerReply,
  type PeerScript,
} from '@omne-harness/mcp-contract/testing'
import type { TableRuntime } from '../src/internal/table.ts'
import { only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { alice, type Principal } from './doubles/identities.ts'
import { completed, listing, peer, services, taskHandle, text } from './doubles/peer.ts'
import { silentAdoption, stallingLanding } from './doubles/stalls.ts'
import { never, reshapedTransports } from './doubles/transports.ts'
import { INVALID, MAIN, adoptHttp, adoptStdio, storedRecord } from './doubles/world.ts'

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const c1 = correlationKeyOf('c1')
const c2 = correlationKeyOf('c2')
const ABSENT = { kind: 'absent' } as const
const TOOLS = listing([{ name: 'read' }])
const HI = completed([text('hi')])
const BEARER = { 'www-authenticate': 'Bearer scope="a"' }
const [LEGACY] = LEGACY_PROTOCOL_VERSIONS
const anonymousKey: CatalogKey = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' },
  holding: files.holding,
}
const credentialKey: CatalogKey = {
  tenant: alice.tenant,
  account: { kind: 'credential', binding: MAIN },
  holding: files.holding,
}
const nowhereKey: CatalogKey = {
  tenant: alice.tenant,
  account: { kind: 'credential', binding: credentialBindingOf('nowhere') },
  holding: files.holding,
}

/** The digest of `read` in a stored record. */
function digestOf(record: ActionCatalogRecord): DefinitionDigest {
  const known = record.actions.find(action => action.name === READ)
  if (known === undefined) throw new Error('read is not in the record')
  return known.definitionDigest
}

/** A peer that lists `read` and completes it, with `files` adopted for alice as stdio unless said. */
function arrange(
  script: PeerScript = {},
  options: Parameters<typeof peer>[1] &
    Readonly<{
      adopt?: 'stdio' | 'http' | 'none'
      runtime?: TableRuntime
      ports?: Partial<McpPorts<Principal, string>>
    }> = {},
) {
  const p = peer({ listing: { '': TOOLS }, calls: { read: HI }, ...script }, options)
  const adopt = options.adopt ?? 'stdio'
  if (adopt === 'stdio') adoptStdio(p, files)
  if (adopt === 'http') adoptHttp(p, files)
  const ports = { ...p.ports, ...options.ports }
  const { services: s, table } = services({ ...p, ports }, options.runtime)
  return { p, table, ...s }
}

type Arranged = ReturnType<typeof arrange>

/** Publishes the catalog of `ref` and answers the digest of `read`; the connection is then up. */
async function published(c: Arranged, ref = files): Promise<DefinitionDigest> {
  expect(await c.discovery.refresh(alice, { ref })).toMatchObject({ ok: { kind: 'published' } })
  const current = await c.discovery.current(alice, ref)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const known = current.ok.actions.find(action => action.name === READ)
  if (known === undefined) throw new Error('read is not known')
  return known.definitionDigest
}

function request(
  expectedDefinition: DefinitionDigest,
  extra: Partial<InvokeRequest> = {},
): InvokeRequest {
  return {
    ref: files,
    action: READ,
    args: jsonOf({}),
    expectedDefinition,
    correlationKey: c1,
    signal: new AbortController().signal,
    ...extra,
  }
}

const NOT_SENT = (reason: unknown) => ({ kind: 'not-sent', reason })
const CONNECTION_UNAVAILABLE = NOT_SENT({ kind: 'connection-unavailable' })

/**
 * The connection state as the status port reports it. A lost stdio connection carries a residual
 * here: the memory process's `stop()` rejects once the scripted transport cancelled its stdout,
 * which the table reads as `unconfirmed` (MC-14). The cases read the kind and the reason.
 */
async function state(c: Arranged) {
  const view = await c.status.inspect(alice, files)
  return 'ok' in view ? view.ok.connection : view.failure
}

describe('the send order: each step refuses with the place given back (SPEC MC-16)', () => {
  it('step 1: a second call on the same tenant, principal and correlation key is correlation-key-in-use while the first is in flight; another key is not', async () => {
    const gate = deferred<void>()
    const c = arrange(
      {},
      {
        transport: {
          pace: async received => {
            if (received.kind === 'request' && received.method === 'tools/call') await gate.promise
          },
        },
      },
    )
    const digest = await published(c)
    const first = c.invoker.invoke(alice, request(digest))
    await settled()
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'correlation-key-in-use' }),
    )
    const other = c.invoker.invoke(alice, request(digest, { correlationKey: c2 }))
    await settled()
    gate.resolve()
    expect(await first).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(await other).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(c.p.requests('tools/call')).toHaveLength(2)
  })

  it('step 2: not adopted is not-available-to-you, and the key is free again at once', async () => {
    const c = arrange({}, { adopt: 'none' })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'not-available-to-you' }),
    )
    adoptStdio(c.p, files)
    const known = await published(c)
    expect(await c.invoker.invoke(alice, request(known))).toMatchObject({ kind: 'sent' })
  })

  it('step 2: an endpoint blocked by a setting is blocked with the reason, and its connection is closed', async () => {
    const c = arrange()
    const digest = await published(c)
    c.p.eligibility.block(alice, files, 'disabled')
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'blocked', reason: 'disabled' }),
    )
    expect(await state(c)).toEqual({ kind: 'none' })
    expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 2: eligibility that cannot be read is unknown', async () => {
    const c = arrange()
    const digest = await published(c)
    c.p.eligibility.setUnreadable(alice, files, true)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(NOT_SENT({ kind: 'unknown' }))
  })

  it('step 3: the setting defects of S4 are the reasons, in the order of S4, before any catalog read', async () => {
    const c = arrange()
    const digest = await published(c)
    c.p.adoption.update(alice.tenant, files, {
      settings: { target: ABSENT, credential: ABSENT, connectTimeout: ABSENT },
    })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'config-missing', item: 'connect-timeout' }),
    )
    c.p.adoption.update(alice.tenant, files, {
      settings: { target: ABSENT, credential: ABSENT, connectTimeout: INVALID },
    })
    expect(
      await c.invoker.invoke(alice, request(digest, { connectBound: millisOf(1_000) })),
    ).toEqual(NOT_SENT({ kind: 'config-invalid', item: 'connect-timeout' }))
  })

  it('step 3: a missing credential of an authenticated endpoint is credential-unavailable (missing), K1', async () => {
    const c = arrange({}, { adopt: 'none' })
    adoptStdio(c.p, files, { auth: 'static', settings: { credential: ABSENT } })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'credential-unavailable', cause: 'missing' }),
    )
    expect(c.p.opens()).toBe(0)
  })

  it('step 4: no catalog, an action not listed, and an action marked unavailable are action-unavailable; nothing connects', async () => {
    const c = arrange()
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'action-unavailable' }),
    )
    expect(c.p.opens()).toBe(0)
    const known = await published(c)
    expect(
      await c.invoker.invoke(alice, request(known, { action: actionNameOf('write') })),
    ).toEqual(NOT_SENT({ kind: 'action-unavailable' }))
    const stored = await c.p.store.read(anonymousKey)
    if (!('ok' in stored) || stored.ok === 'absent') throw new Error('nothing stored')
    await c.p.store.write(
      anonymousKey,
      markUnavailable(stored.ok, 'landing-unavailable'),
      stored.ok.revision,
    )
    expect(await c.invoker.invoke(alice, request(known))).toEqual(
      NOT_SENT({ kind: 'action-unavailable' }),
    )
    expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 4: an expected definition that is not the current one is definition-changed', async () => {
    const c = arrange()
    await published(c)
    const stale = digestDefinition({
      name: READ,
      definition: jsonOf({ name: 'read', inputSchema: { type: 'object', properties: {} } }),
    })
    expect(await c.invoker.invoke(alice, request(stale))).toEqual(
      NOT_SENT({ kind: 'definition-changed' }),
    )
    expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 4: a catalog store that breaches its contract is unknown (MC-15)', async () => {
    const p = peer({ listing: { '': TOOLS }, calls: { read: HI } })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    adoptStdio(p, files)
    const store = { ...p.store, read: () => Promise.reject(new Error('down')) }
    const c = services({ ...p, ports: { ...p.ports, store } })
    expect(await c.services.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'unknown' }),
    )
  })

  it('step 5: after closeAll nothing connects: not sent, connection-unavailable (S8)', async () => {
    const c = arrange()
    const digest = await published(c)
    await c.connections.closeAll()
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(c.p.opens()).toBe(1)
  })

  it('step 5: a connection failure of the build is the reason as it is: credential-unavailable, landing-unavailable, authorization-required', async () => {
    const credential = arrange({}, { adopt: 'none' })
    adoptStdio(credential.p, files, {
      auth: 'static',
      settings: { credential: { kind: 'value', value: credentialBindingOf('nowhere') } },
    })
    const stored = await storedRecord(credential.p, nowhereKey, ['read'])
    const digest = digestOf(stored)
    expect(await credential.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'credential-unavailable', cause: 'missing' }),
    )

    const landing = arrange({}, { adopt: 'none' })
    adoptStdio(landing.p, files, { facilities: ['gpu'] })
    await storedRecord(landing.p, anonymousKey, ['read'])
    expect(await landing.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'landing-unavailable' }),
    )

    const authorization = arrange(
      { discover: { kind: 'http', status: 401, headers: BEARER } },
      { adopt: 'http' },
    )
    await storedRecord(authorization.p, credentialKey, ['read'])
    expect(await authorization.invoker.invoke(alice, request(digest))).toMatchObject(
      NOT_SENT({
        kind: 'authorization-required',
        discovery: { metadata: 'unavailable', issuers: [], scopes: ['a'] },
      }),
    )
    for (const c of [credential, landing, authorization])
      expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 5: a discover that fails on both paths is connection-unavailable; one without an answer (effect-unknown) is connection-unavailable too', async () => {
    const error = arrange({ discover: { kind: 'error', error: { code: -32603, message: 'boom' } } })
    const digest = digestOf(await storedRecord(error.p, anonymousKey, ['read']))
    expect(await error.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(error)).toMatchObject({ kind: 'lost', reason: 'discover-failed' })

    const broken = arrange({ discover: { kind: 'stream-breaks' } })
    await storedRecord(broken.p, anonymousKey, ['read'])
    expect(await broken.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(broken)).toMatchObject({ kind: 'lost', reason: 'stream-broken' })
    expect(broken.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 5: a call that joins a build past its join bound, and one queued past its section bound, are both connection-unavailable (the table answers pending and settings)', async () => {
    const joining = peer({ listing: { '': TOOLS }, calls: { read: HI } })
    adoptStdio(joining, files)
    const digest = digestOf(await storedRecord(joining, anonymousKey, ['read']))
    const stalled = stallingLanding(joining.landing)
    const bounds = manualBounds()
    const j = services(
      { ...joining, ports: { ...joining.ports, landing: stalled.port } },
      bounds.runtime,
    )
    const first = j.services.invoker.invoke(alice, request(digest))
    await settled()
    const second = j.services.invoker.invoke(alice, request(digest, { correlationKey: c2 }))
    await settled()
    bounds.fire('join')
    expect(await second).toEqual(CONNECTION_UNAVAILABLE)
    stalled.gate.resolve()
    expect(await first).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(joining.requests('tools/call')).toHaveLength(1)

    const queued = peer({ listing: { '': TOOLS }, calls: { read: HI } })
    adoptStdio(queued, files)
    await storedRecord(queued, anonymousKey, ['read'])
    // Adoption calls: the first invoke's gate (1) and its re-read (2, silent); the second's gate (3).
    const silent = silentAdoption(queued.adoption, only(2))
    const sectionBounds = manualBounds()
    const q = services(
      { ...queued, ports: { ...queued.ports, adoption: silent.port } },
      sectionBounds.runtime,
    )
    const held = q.services.invoker.invoke(alice, request(digest))
    await settled()
    const waiting = q.services.invoker.invoke(alice, request(digest, { correlationKey: c2 }))
    await settled()
    expect(silent.calls()).toBe(3)
    sectionBounds.fire('section', 1)
    expect(await waiting).toEqual(CONNECTION_UNAVAILABLE)
    sectionBounds.fire('section', 0)
    expect(await held).toEqual(CONNECTION_UNAVAILABLE)
    expect(queued.requests('tools/call')).toHaveLength(0)
  })

  it('step 7: a call the transport could not send is connection-unavailable and the connection is lost (S7); the catalog is marked', async () => {
    const c = arrange({ calls: { read: { kind: 'unsent' } } })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(c)).toMatchObject({ kind: 'lost', reason: 'stream-broken' })
    expect(c.p.requests('tools/call')).toHaveLength(0)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'action-unavailable' }),
    )
  })

  it('step 7: an ended legacy session is connection-unavailable and the connection is lost (session-ended)', async () => {
    const c = arrange(
      {
        discover: { kind: 'error', error: { code: -32601, message: 'Method not found' } },
        initialize: {
          kind: 'result',
          result: { protocolVersion: LEGACY, capabilities: { tools: {} } },
          headers: { 'mcp-session-id': 's1' },
        },
        calls: { read: { kind: 'http', status: 404 } },
      },
      { adopt: 'http' },
    )
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(c)).toEqual({ kind: 'lost', reason: 'session-ended' })
  })

  it('step 7: a call refused for authorization is authorization-required with the discovery, and the connection is lost', async () => {
    const c = arrange(
      { calls: { read: { kind: 'http', status: 401, headers: BEARER } } },
      { adopt: 'http' },
    )
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject(
      NOT_SENT({ kind: 'authorization-required', discovery: { scopes: ['a'] } }),
    )
    expect(await state(c)).toEqual({ kind: 'lost', reason: 'authorization-required' })
  })

  it('step 8: the signal after the send: the peer is told once, the outcome is unknown (abandoned), the key ends', async () => {
    const c = arrange({ calls: { read: { kind: 'silent' } } })
    const digest = await published(c)
    const controller = new AbortController()
    const call = c.invoker.invoke(alice, request(digest, { signal: controller.signal }))
    await settled()
    expect(c.p.requests('tools/call')).toHaveLength(1)
    controller.abort()
    expect(await call).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
    expect(c.p.cancels()).toBe(1)
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
    expect(await state(c)).toEqual({ kind: 'ready' })
  })

  it('step 8: the signal before the send is a cancel before the send: not sent, cancelled, no call on the wire', async () => {
    const c = arrange()
    const digest = await published(c)
    const controller = new AbortController()
    controller.abort()
    expect(await c.invoker.invoke(alice, request(digest, { signal: controller.signal }))).toEqual(
      NOT_SENT({ kind: 'cancelled' }),
    )
    expect(c.p.requests('tools/call')).toHaveLength(0)
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })

  it('arguments that are not a JSON object reject with TypeError before any place is taken (R2)', async () => {
    const c = arrange()
    const digest = await published(c)
    await expect(c.invoker.invoke(alice, request(digest, { args: jsonOf('x') }))).rejects.toThrow(
      TypeError,
    )
    expect(await c.invoker.cancel(alice, c1)).toBe('unknown')
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject({ kind: 'sent' })
  })
})

describe('the outcome of a sent call (SPEC R5, O1–O6, D1–D5)', () => {
  it('complete: the content through toContentBlocks, no schema means no-schema and no validator call', async () => {
    const c = arrange()
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: {
        kind: 'complete',
        content: toContentBlocks([jsonOf(text('hi'))]),
        output: { kind: 'no-schema' },
      },
    })
    expect(c.p.checks.calls()).toBe(0)
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
  })

  it('complete with a declared output schema: the validator is called once with structured content, not called without it', async () => {
    const schema = { type: 'object' }
    const withStructured = arrange({
      listing: { '': listing([{ name: 'read', outputSchema: schema }]) },
      calls: { read: completed([text('hi')], { structuredContent: { n: 1 } }) },
    })
    const digest = await published(withStructured)
    expect(await withStructured.invoker.invoke(alice, request(digest))).toMatchObject({
      outcome: { kind: 'complete', structured: jsonOf({ n: 1 }), output: { kind: 'conforms' } },
    })
    expect(withStructured.p.checks.calls()).toBe(1)

    const without = arrange({ listing: { '': listing([{ name: 'read', outputSchema: schema }]) } })
    const known = await published(without)
    expect(await without.invoker.invoke(alice, request(known))).toMatchObject({
      outcome: {
        kind: 'complete',
        output: { kind: 'violates', reason: 'structured-content-missing' },
      },
    })
    expect(without.p.checks.calls()).toBe(0)
  })

  it('toolError: the action failed; no validator call even with a schema', async () => {
    const c = arrange({
      listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) },
      calls: { read: completed([text('no')], { isError: true, structuredContent: { e: 1 } }) },
    })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: {
        kind: 'toolError',
        content: toContentBlocks([jsonOf(text('no'))]),
        structured: jsonOf({ e: 1 }),
      },
    })
    expect(c.p.checks.calls()).toBe(0)
  })

  it('inputRequired carries the requests, the state and the generation it was issued at', async () => {
    const c = arrange({
      calls: {
        read: {
          kind: 'result',
          result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } },
        },
      },
    })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: {
        kind: 'inputRequired',
        inputRequests: { untrusted: jsonOf({ q: 1 }) },
        requestState: 's1',
        issuedAt: 1,
      },
    })
  })

  it('task carries the task id, the generation and the hints', async () => {
    const c = arrange({ calls: { read: taskHandle('t1', { pollIntervalMs: 500 }) } })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: { kind: 'task', taskId: 't1', issuedAt: 1, pollIntervalMs: 500 },
    })
  })

  it('protocolError: a JSON-RPC error of the peer as it is', async () => {
    const c = arrange({
      calls: { read: { kind: 'error', error: { code: -32602, message: 'bad' } } },
    })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: {
        kind: 'protocolError',
        fault: { kind: 'peer-error', code: -32602, message: 'bad' },
      },
    })
    expect(await state(c)).toEqual({ kind: 'ready' })
  })

  it.each([
    ['stream-breaks', 'stream-broken'],
    ['process-exits', 'process-exited'],
  ] as const)(
    'unknown (%s): the answer never came, the outcome is unknown with the cause, the connection is lost with it (S7)',
    async (reply, cause) => {
      const c = arrange({ calls: { read: { kind: reply } satisfies PeerReply } })
      const digest = await published(c)
      expect(await c.invoker.invoke(alice, request(digest))).toEqual({
        kind: 'sent',
        outcome: { kind: 'unknown', cause },
      })
      expect(await state(c)).toMatchObject({ kind: 'lost', reason: cause })
      expect(c.p.cancels()).toBe(0)
    },
  )

  it('progress notifications reach the observer as untrusted values; an observer that throws changes nothing (S6)', async () => {
    // The scripted transport catches an observer's error itself; the gate hands one notification
    // to the observer directly, so the throw reaches this package's wrapper.
    const c = arrange(
      {
        calls: {
          read: {
            kind: 'result',
            result: { resultType: 'complete', content: [text('hi')] },
            notifications: [{ method: 'notifications/progress', params: { progress: 1 } }],
          },
        },
      },
      {
        callGate: {
          notify: { kind: 'log', notification: { untrusted: jsonOf({ level: 'info' }) } },
        },
      },
    )
    const digest = await published(c)
    const seen: unknown[] = []
    expect(
      await c.invoker.invoke(
        alice,
        request(digest, {
          observe: notification => {
            seen.push(notification)
            throw new Error('observer bug')
          },
        }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({ kind: 'log' })
    expect(seen[1]).toMatchObject({
      kind: 'progress',
      notification: { untrusted: { kind: 'object' } },
    })
  })
})

describe('the call keeps its one exit whatever the peer or the host does (SPEC MC-16 step 13)', () => {
  const throwing = () => {
    throw new Error('schema engine: unsupported keyword')
  }

  it('a checkOutput that throws is absorbed: the call answers sent with violates (output-check-failed), the key is free again, and a task that follows is recorded', async () => {
    const c = arrange(
      {
        listing: { '': listing([{ name: 'read', outputSchema: { type: 'object' } }]) },
        calls: {
          read: [completed([text('hi')], { structuredContent: { n: 1 } }), taskHandle('t1')],
        },
        tasks: { t1: { get: { kind: 'result', result: { taskId: 't1', status: 'working' } } } },
      },
      { ports: { checkOutput: throwing } },
    )
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject({
      kind: 'sent',
      outcome: {
        kind: 'complete',
        structured: jsonOf({ n: 1 }),
        output: { kind: 'violates', reason: 'output-check-failed' },
      },
    })
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject({
      kind: 'sent',
      outcome: { kind: 'task', taskId: 't1' },
    })
    expect(
      await c.invoker.queryTask(alice, {
        ref: files,
        taskId: taskIdOf('t1'),
        issuedAt: generationOf(1),
      }),
    ).toEqual({ ok: { status: 'working' } })
    expect(await state(c)).toEqual({ kind: 'ready' })
  })

  it('a call that breaches its contract (T9) is sent with an unknown effect: unknown (abandoned), no cancel, the key has ended and is free again', async () => {
    const base = peer({ listing: { '': TOOLS }, calls: { read: { kind: 'silent' } } })
    adoptStdio(base, files)
    let breached = 0
    const transports = reshapedTransports(base.ports.transports, transport => ({
      call: (request, signal, observe) => {
        breached += 1
        return breached === 1
          ? Promise.reject(new Error('transport bug'))
          : transport.call(request, signal, observe)
      },
    }))
    const { services: s, table } = services({ ...base, ports: { ...base.ports, transports } })
    const c = { p: base, table, ...s }
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
    expect(base.cancels()).toBe(0)
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
    expect(await state(c)).toEqual({ kind: 'ready' })
    const next = c.invoker.invoke(alice, request(digest))
    await settled()
    expect(breached).toBe(2)
    expect(await c.invoker.cancel(alice, c1)).toBe('signalled')
    expect(await next).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
  })

  it('a call sent on one generation, whose connection is lost and rebuilt before call returns: a later cancel answers unknown and tells no peer (MC-12)', async () => {
    const gate = deferred<void>()
    let calls = 0
    const base = peer({ listing: { '': TOOLS }, calls: { read: { kind: 'silent' } } })
    const transports = reshapedTransports(base.ports.transports, transport => ({
      async call(request, signal, observe) {
        const called = await transport.call(request, signal, observe)
        calls += 1
        if (calls !== 1 || 'failure' in called) return called
        // The send is recorded only once the case lets `call` return; the answer never comes.
        await gate.promise
        return { ok: { requestId: called.ok.requestId, answer: never() } }
      },
    }))
    adoptStdio(base, files)
    const { services: s, table } = services({ ...base, ports: { ...base.ports, transports } })
    const c = { p: base, table, ...s }
    const digest = await published(c)
    const [first] = table.currentOf(alice.tenant, files.holding)
    if (first === undefined) throw new Error('no connection')
    expect(first.generation).toBe(1)
    const controller = new AbortController()
    const call = c.invoker.invoke(alice, request(digest, { signal: controller.signal }))
    await settled()
    expect(base.requests('tools/call')).toHaveLength(1)
    expect(
      await table.lose(
        first.connection,
        first.generation,
        'stream-broken',
        'connection-unavailable',
      ),
    ).not.toBe('not-current')
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: {} })
    const [second] = table.currentOf(alice.tenant, files.holding)
    expect(second?.generation).toBe(2)
    gate.resolve()
    await settled()
    await settled()
    expect(await c.invoker.cancel(alice, c1)).toBe('unknown')
    expect(base.cancels()).toBe(0)
    controller.abort()
    expect(await call).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
  })
})
