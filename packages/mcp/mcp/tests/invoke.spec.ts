// The call port `invoke` (SPEC MC-16): the send order, one failure of each step with the place
// given back, every "not sent" reason of R2, the mapping of the connection table's answers, the
// caller's abort after the send, and the outcomes through `classifyOutcome` and `toContentBlocks`.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  LEGACY_PROTOCOL_VERSIONS,
  digestDefinition,
  markUnavailable,
  toContentBlocks,
  type ActionCatalogRecord,
  type CatalogKey,
  type DefinitionDigest,
  type InvokeRequest,
  type InvokeResult,
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
  requestStateOf,
  taskIdOf,
  type PeerReply,
  type PeerScript,
} from '@omne-harness/mcp-contract/testing'
import { loseOn } from '../src/internal/lost.ts'
import type { CallRequest } from '@omne-harness/mcp-contract/provider'
import type { TableRuntime } from '../src/internal/table.ts'
import { only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { alice, type Principal } from './doubles/identities.ts'
import { completed, listing, peer, services, taskHandle, text, type Peer } from './doubles/peer.ts'
import { countedReads } from './doubles/ports.ts'
import { armedEligibility, silentAdoption, stallingLanding } from './doubles/stalls.ts'
import { never, reshapedTransports } from './doubles/transports.ts'
import { watchedCalls, type Watched } from './doubles/watched.ts'
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
      /** Ports shaped on the peer's own: a port that counts, stalls or answers otherwise. */
      shape?: (p: Peer) => Partial<McpPorts<Principal, string>>
    }> = {},
) {
  const p = peer({ listing: { '': TOOLS }, calls: { read: HI }, ...script }, options)
  const adopt = options.adopt ?? 'stdio'
  if (adopt === 'stdio') adoptStdio(p, files)
  if (adopt === 'http') adoptHttp(p, files)
  const ports = { ...p.ports, ...options.ports, ...options.shape?.(p) }
  const { services: s, table } = services({ ...p, ports }, options.runtime)
  return { p, table, ...s }
}

/** The calls of the gate's two ports, which no step after a shutdown may add to. */
function gateCalls(p: Peer) {
  return { adoption: p.adoption.calls(), eligibility: p.eligibility.calls() }
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

/** One call to scan: the call port it runs on, and how to start it. */
type Scanned = Readonly<{ watched: Watched; start: () => Promise<InvokeResult> }>

/**
 * The scan of S8 over the microtasks of one call: `closeAll` lands k microtasks after the call
 * starts, for k = 0, 1, … until the call had answered by then or was on the wire. At every k the
 * transport's `call` is not entered after the shutdown began, and a call that answers after it
 * began, not sent, answers connection-unavailable, whatever step it was at. `prepare` builds a
 * fresh world each time on the transports it is given. Answers the first k the call was done at.
 */
async function scanShutdown(
  prepare: (transports: (p: Peer) => McpPorts<Principal, string>['transports']) => Promise<Scanned>,
): Promise<number> {
  const LIMIT = 400
  for (let k = 0; k < LIMIT; k += 1) {
    let shut = false
    const afterShut: boolean[] = []
    const { watched, start } = await prepare(p =>
      reshapedTransports(p.ports.transports, transport => ({
        call(request, signal, observe) {
          afterShut.push(shut)
          return transport.call(request, signal, observe)
        },
      })),
    )
    // What `prepare` sent itself (a first call before a continuation) is not this call's.
    afterShut.length = 0
    const before = watched.concluded()
    const call = start()
    for (let i = 0; i < k; i += 1) await Promise.resolve()
    const answered = watched.concluded() > before
    shut = true
    const closing = watched.table.closeAll()
    const result = await call
    await closing
    expect(afterShut, `k=${k}: transport.call entered after closeAll`).not.toContain(true)
    if (answered || afterShut.includes(false)) return k
    if (result.kind === 'not-sent')
      expect(result.reason, `k=${k}`).toEqual({ kind: 'connection-unavailable' })
  }
  throw new Error(`the call was still under way ${LIMIT} microtasks after it started`)
}

describe('the send order: each step refuses with the place given back (SPEC MC-16)', () => {
  it('step 2: a second call on the same tenant, principal and correlation key is correlation-key-in-use while the first is in flight; another key is not', async () => {
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

  it('step 3: not adopted is not-available-to-you, and the key is free again at once', async () => {
    const c = arrange({}, { adopt: 'none' })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'not-available-to-you' }),
    )
    adoptStdio(c.p, files)
    const known = await published(c)
    expect(await c.invoker.invoke(alice, request(known))).toMatchObject({ kind: 'sent' })
  })

  it('step 3: an endpoint blocked by a setting is blocked with the reason, and its connection is closed', async () => {
    const c = arrange()
    const digest = await published(c)
    c.p.eligibility.block(alice, files, 'disabled')
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'blocked', reason: 'disabled' }),
    )
    expect(await state(c)).toEqual({ kind: 'none' })
    expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 3: eligibility that cannot be read is unknown', async () => {
    const c = arrange()
    const digest = await published(c)
    c.p.eligibility.setUnreadable(alice, files, true)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(NOT_SENT({ kind: 'unknown' }))
  })

  it('step 4: the setting defects of S4 are the reasons, in the order of S4, before any catalog read', async () => {
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

  it('step 8: at whichever microtask closeAll lands, the transport is not called after it: a shutdown between the last wait and the send is read before the send', async () => {
    const LIMIT = 400
    let sentBefore = false
    for (let k = 0; k < LIMIT && !sentBefore; k += 1) {
      let shut = false
      const afterShut: boolean[] = []
      const c = arrange(
        {},
        {
          shape: p => ({
            transports: reshapedTransports(p.ports.transports, transport => ({
              call(request, signal, observe) {
                afterShut.push(shut)
                return transport.call(request, signal, observe)
              },
            })),
          }),
        },
      )
      const digest = await published(c)
      const call = c.invoker.invoke(alice, request(digest))
      for (let i = 0; i < k; i += 1) await Promise.resolve()
      shut = true
      const closing = c.connections.closeAll()
      const result = await call
      await closing
      expect(afterShut, `k=${k}: transport.call entered after closeAll`).not.toContain(true)
      if (result.kind === 'not-sent')
        expect(result.reason, `k=${k}`).toEqual({ kind: 'connection-unavailable' })
      sentBefore = afterShut.includes(false)
    }
    expect(sentBefore).toBe(true)
  })

  it('step 3: at whichever microtask closeAll lands, a call that step 4 would refuse for a setting defect answers connection-unavailable, not the defect', async () => {
    const answeredAt = await scanShutdown(async transports => {
      const p = peer({ listing: { '': TOOLS }, calls: { read: HI } })
      adoptStdio(p, files, { settings: { connectTimeout: ABSENT } })
      const digest = digestOf(await storedRecord(p, anonymousKey, ['read']))
      const watched = watchedCalls({ ...p, ports: { ...p.ports, transports: transports(p) } })
      return { watched, start: () => watched.calls.invoke(alice, request(digest)) }
    })
    expect(answeredAt).toBeGreaterThan(0)
  })

  it('step 3: at whichever microtask closeAll lands, a continuation that is not sent answers connection-unavailable, as a first call, not the unknown of step 6', async () => {
    const asks: PeerReply = {
      kind: 'result',
      result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } },
    }
    const answeredAt = await scanShutdown(async transports => {
      const p = peer({ listing: { '': TOOLS }, calls: { read: [asks, HI] } })
      adoptStdio(p, files)
      const digest = digestOf(await storedRecord(p, anonymousKey, ['read']))
      const watched = watchedCalls({ ...p, ports: { ...p.ports, transports: transports(p) } })
      const first = await watched.calls.invoke(alice, request(digest))
      if (first.kind !== 'sent' || first.outcome.kind !== 'inputRequired')
        throw new Error('the first call was not asked for input')
      const { issuedAt } = first.outcome
      const start = () =>
        watched.calls.continueWithInput(alice, {
          ref: files,
          action: READ,
          args: jsonOf({}),
          issuedAt,
          correlationKey: c2,
          signal: new AbortController().signal,
          requestState: requestStateOf('s1'),
        })
      return { watched, start }
    })
    expect(answeredAt).toBeGreaterThan(0)
  })

  it('step 3: closeAll while the call waits on the gate, where step 4 then finds no connect-timeout: connection-unavailable, as a call that starts after closeAll, not config-missing', async () => {
    let armed: ReturnType<typeof armedEligibility> | undefined
    const c = arrange(
      {},
      {
        adopt: 'none',
        shape: p => ({ eligibility: (armed = armedEligibility(p.eligibility)).port }),
      },
    )
    if (armed === undefined) throw new Error('not shaped')
    adoptStdio(c.p, files, { settings: { connectTimeout: ABSENT } })
    const digest = digestOf(await storedRecord(c.p, anonymousKey, ['read']))
    const gate = armed.arm()
    const call = c.invoker.invoke(alice, request(digest))
    await gate.reached
    await c.connections.closeAll()
    gate.release()
    expect(await call).toEqual(CONNECTION_UNAVAILABLE)
    expect(await c.invoker.invoke(alice, request(digest, { correlationKey: c2 }))).toEqual(
      CONNECTION_UNAVAILABLE,
    )
    expect(c.p.opens()).toBe(0)
  })

  it('step 4 and 7: the request connectBound stands in for a missing connect-timeout, and bounds the build: without it the call is not sent (config-missing), with 1 ms a landing that does not answer is connection-unavailable at that bound', async () => {
    let stalled: ReturnType<typeof stallingLanding> | undefined
    const c = arrange(
      {},
      { adopt: 'none', shape: p => ({ landing: (stalled = stallingLanding(p.landing)).port }) },
    )
    if (stalled === undefined) throw new Error('not shaped')
    adoptStdio(c.p, files, { settings: { connectTimeout: ABSENT } })
    const digest = digestOf(await storedRecord(c.p, anonymousKey, ['read']))
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'config-missing', item: 'connect-timeout' }),
    )
    expect(stalled.calls()).toBe(0)
    expect(await c.invoker.invoke(alice, request(digest, { connectBound: millisOf(1) }))).toEqual(
      CONNECTION_UNAVAILABLE,
    )
    expect(stalled.calls()).toBe(1)
    stalled.gate.resolve()
  })

  it('step 9: a first call carries no continuation on the wire; the transport gets the action and the arguments only', async () => {
    const requests: CallRequest[] = []
    const c = arrange(
      {},
      {
        shape: p => ({
          transports: reshapedTransports(p.ports.transports, transport => ({
            call(request, signal, observe) {
              requests.push(request)
              return transport.call(request, signal, observe)
            },
          })),
        }),
      },
    )
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject({ kind: 'sent' })
    expect(requests).toEqual([{ action: READ, args: jsonOf({}) }])
  })

  it('step 4: a missing credential of an authenticated endpoint is credential-unavailable (missing), K1', async () => {
    const c = arrange({}, { adopt: 'none' })
    adoptStdio(c.p, files, { auth: 'static', settings: { credential: ABSENT } })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'credential-unavailable', cause: 'missing' }),
    )
    expect(c.p.opens()).toBe(0)
  })

  it('step 5: no catalog, an action not listed, and an action marked unavailable are action-unavailable; nothing connects', async () => {
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

  it('step 5: an expected definition that is not the current one is definition-changed', async () => {
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

  it('step 5: a catalog store that breaches its contract is unknown (MC-15)', async () => {
    const p = peer({ listing: { '': TOOLS }, calls: { read: HI } })
    const digest = digestDefinition({ name: READ, definition: jsonOf({ name: 'read' }) })
    adoptStdio(p, files)
    const store = { ...p.store, read: () => Promise.reject(new Error('down')) }
    const c = services({ ...p, ports: { ...p.ports, store } })
    expect(await c.services.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'unknown' }),
    )
  })

  it('step 3: after closeAll nothing is asked: not sent, connection-unavailable; the gate, the store and the build are left alone (S8)', async () => {
    let store: ReturnType<typeof countedReads> | undefined
    const c = arrange({}, { shape: p => ({ store: (store = countedReads(p.store)) }) })
    if (store === undefined) throw new Error('not shaped')
    const digest = await published(c)
    await c.connections.closeAll()
    const asked = { ...gateCalls(c.p), reads: store.reads() }
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect({ ...gateCalls(c.p), reads: store.reads() }).toEqual(asked)
    expect(c.p.opens()).toBe(1)
  })

  it('step 3: closeAll while the call waits on the gate: not sent, connection-unavailable; the store is not read and nothing is built after it (S8)', async () => {
    let store: ReturnType<typeof countedReads> | undefined
    let armed: ReturnType<typeof armedEligibility> | undefined
    const c = arrange(
      {},
      {
        shape: p => ({
          store: (store = countedReads(p.store)),
          eligibility: (armed = armedEligibility(p.eligibility)).port,
        }),
      },
    )
    if (store === undefined || armed === undefined) throw new Error('not shaped')
    const digest = await published(c)
    const gate = armed.arm()
    const call = c.invoker.invoke(alice, request(digest))
    await gate.reached
    await c.connections.closeAll()
    const reads = store.reads()
    gate.release()
    expect(await call).toEqual(CONNECTION_UNAVAILABLE)
    expect(store.reads()).toBe(reads)
    expect(c.p.opens()).toBe(1)
    expect(c.p.requests('tools/call')).toHaveLength(0)
  })

  it('step 7: a connection failure of the build is the reason as it is: credential-unavailable, landing-unavailable, authorization-required', async () => {
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

  it('step 7: a discover that fails on both paths is connection-unavailable; one without an answer (effect-unknown) is connection-unavailable too', async () => {
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

  it('step 7: a call that joins a build past its join bound, and one queued past its section bound, are both connection-unavailable (the table answers pending and settings)', async () => {
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

  it('step 9: a call the transport could not send is connection-unavailable and the connection is lost (S7); the catalog is marked', async () => {
    const c = arrange({ calls: { read: { kind: 'unsent' } } })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(c)).toMatchObject({ kind: 'lost', reason: 'stream-broken' })
    expect(c.p.requests('tools/call')).toHaveLength(0)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(
      NOT_SENT({ kind: 'action-unavailable' }),
    )
  })

  it('step 9 (S7, T1): a call not sent with the mark loses the connection; one not sent without it (HTTP, before it left) leaves the connection ready', async () => {
    const marked = arrange({ calls: { read: { kind: 'unsent' } } })
    const markedDigest = await published(marked)
    expect(await marked.invoker.invoke(alice, request(markedDigest))).toEqual(
      CONNECTION_UNAVAILABLE,
    )
    expect(await state(marked)).toMatchObject({ kind: 'lost', reason: 'stream-broken' })

    const unmarked = arrange({ calls: { read: { kind: 'unsent' } } }, { adopt: 'http' })
    const digest = await published(unmarked)
    expect(await unmarked.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    expect(await state(unmarked)).toEqual({ kind: 'ready' })
  })

  it.each([
    ['a 5xx', { kind: 'http', status: 503, body: 'down' }],
    ['a broken answer stream', { kind: 'stream-breaks' }],
  ] as const)(
    'step 12 (S7, T1): %s on one HTTP call is unknown (stream-broken) without the mark, and the connection stays ready for the next call',
    async (_what, reply) => {
      const c = arrange({ calls: { read: [reply, HI] } }, { adopt: 'http' })
      const digest = await published(c)
      expect(await c.invoker.invoke(alice, request(digest))).toEqual({
        kind: 'sent',
        outcome: { kind: 'unknown', cause: 'stream-broken' },
      })
      expect(await state(c)).toEqual({ kind: 'ready' })
      expect(await c.invoker.invoke(alice, request(digest, { correlationKey: c2 }))).toMatchObject({
        kind: 'sent',
        outcome: { kind: 'complete' },
      })
      expect(c.p.requests('tools/call')).toHaveLength(2)
    },
  )

  it('step 9: an ended legacy session is connection-unavailable and the connection is lost (session-ended)', async () => {
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

  it('step 9: a call refused for authorization is authorization-required with the discovery, and the connection is lost', async () => {
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

  it('step 11: the signal after the send: the peer is told once, the outcome is unknown (abandoned), the key ends, nothing is sent again', async () => {
    const c = arrange({ calls: { read: { kind: 'silent' } } })
    const digest = await published(c)
    const controller = new AbortController()
    const call = c.invoker.invoke(alice, request(digest, { signal: controller.signal }))
    await settled()
    expect(c.p.requests('tools/call')).toHaveLength(1)
    controller.abort()
    expect(await call).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
    await settled()
    expect(c.p.cancels()).toBe(1)
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(await c.invoker.cancel(alice, c1)).toBe('no-call-in-flight')
    expect(await state(c)).toEqual({ kind: 'ready' })
  })

  it('step 8: at whichever microtask the close of the connection begins, it is not sent on after it; the call goes on a new connection or is not sent (MC-10)', async () => {
    const LIMIT = 400
    let sentBefore = false
    for (let k = 0; k < LIMIT && !sentBefore; k += 1) {
      let released = false
      const onReleased: boolean[] = []
      const c = arrange(
        {},
        {
          shape: p => ({
            transports: reshapedTransports(p.ports.transports, (transport, opened) => ({
              call(request, signal, observe) {
                if (opened === 1) onReleased.push(released)
                return transport.call(request, signal, observe)
              },
            })),
          }),
        },
      )
      const digest = await published(c)
      const call = c.invoker.invoke(alice, request(digest))
      for (let i = 0; i < k; i += 1) await Promise.resolve()
      // The table's close, which `release` reaches once its gate passed: it begins in this run.
      released = true
      const releasing = c.table.close(alice.tenant, files.holding)
      const result = await call
      await releasing
      expect(
        onReleased,
        `k=${k}: the closed connection's transport was called after the close began`,
      ).not.toContain(true)
      if (result.kind === 'not-sent')
        expect(result.reason, `k=${k}`).toEqual({ kind: 'connection-unavailable' })
      sentBefore = onReleased.includes(false)
    }
    expect(sentBefore).toBe(true)
  })

  it('step 7: a release while the call builds the connection closes it first: the build goes no further, the call is not sent, and nothing is marked (MC-10, MC-5)', async () => {
    const negotiating = deferred<void>()
    const c = arrange(
      {},
      {
        shape: p => ({
          transports: reshapedTransports(p.ports.transports, (transport, opened) =>
            opened === 2
              ? {
                  async discover() {
                    await negotiating.promise
                    return transport.discover()
                  },
                }
              : {},
          ),
        }),
      },
    )
    const digest = await published(c)
    expect(await c.connections.release(alice, files)).toMatchObject({ ok: { kind: 'released' } })
    const stored = await c.p.store.read(anonymousKey)
    const call = c.invoker.invoke(alice, request(digest))
    await settled()
    expect(c.p.opens()).toBe(2)
    const releasing = c.connections.release(alice, files)
    await settled()
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    negotiating.resolve()
    expect(await call).toEqual(CONNECTION_UNAVAILABLE)
    expect(await releasing).toMatchObject({ ok: { kind: 'released' } })
    expect(c.p.requests('tools/call')).toHaveLength(0)
    expect(await c.p.store.read(anonymousKey)).toEqual(stored)
  })

  it('step 11: the signal after the send, once closeAll began: unknown (abandoned), and the peer is not told; the transport closing settles its own requests (S8, T5)', async () => {
    let cancelRequests = 0
    const c = arrange(
      {},
      {
        shape: p => ({
          transports: reshapedTransports(p.ports.transports, transport => ({
            async call(request, signal, observe) {
              const called = await transport.call(request, signal, observe)
              return 'ok' in called ? { ok: { ...called.ok, answer: never() } } : called
            },
            cancelRequest(requestId) {
              cancelRequests += 1
              return transport.cancelRequest(requestId)
            },
          })),
        }),
      },
    )
    const digest = await published(c)
    const controller = new AbortController()
    const call = c.invoker.invoke(alice, request(digest, { signal: controller.signal }))
    await settled()
    expect(c.p.requests('tools/call')).toHaveLength(1)
    const closing = c.connections.closeAll()
    controller.abort()
    expect(await call).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
    await closing
    await settled()
    expect(cancelRequests).toBe(0)
    expect(c.p.cancels()).toBe(0)
  })

  it('step 2: a signal that fired before the call is a cancel before the send: not sent, cancelled, no call on the wire', async () => {
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

  it('arguments whose value tree fails judgeJsonValue reject with TypeError before any place is taken, not as a connection failure (R2)', async () => {
    const c = arrange()
    const digest = await published(c)
    const args: JsonValue = {
      kind: 'object',
      entries: [{ key: 'n', value: { kind: 'number', lexeme: 'NaN' } }],
    }
    await expect(c.invoker.invoke(alice, request(digest, { args }))).rejects.toThrow(TypeError)
    expect(c.p.requests('tools/call')).toHaveLength(0)
    expect(await c.invoker.cancel(alice, c1)).toBe('unknown')
    expect(await c.invoker.invoke(alice, request(digest))).toMatchObject({ kind: 'sent' })
  })
})

describe('the outcome of a sent call (SPEC R5, O1–O6, D1–D5)', () => {
  it('step 12: complete: the content through toContentBlocks, no schema means no-schema and no validator call', async () => {
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

  it('step 12: complete with a declared output schema: the validator is called once with structured content, not called without it', async () => {
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

  it('step 12: toolError: the action failed; no validator call even with a schema', async () => {
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

  it('step 12: inputRequired carries the requests, the state and the generation it was issued at', async () => {
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

  it('step 12: task carries the task id, the generation and the hints', async () => {
    const c = arrange({ calls: { read: taskHandle('t1', { pollIntervalMs: 500 }) } })
    const digest = await published(c)
    expect(await c.invoker.invoke(alice, request(digest))).toEqual({
      kind: 'sent',
      outcome: { kind: 'task', taskId: 't1', issuedAt: 1, pollIntervalMs: 500 },
    })
  })

  it('step 12: protocolError: a JSON-RPC error of the peer as it is', async () => {
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
    'unknown (%s): the answer never came on stdio, it carries the mark, the outcome is unknown with the cause, the connection is lost with it (S7, T1)',
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

  it.each([
    ['unsent', CONNECTION_UNAVAILABLE],
    ['stream-breaks', { kind: 'sent', outcome: { kind: 'unknown', cause: 'stream-broken' } }],
  ] as const)(
    'a lost connection whose close() never answers: the call (%s) answers within a few turns, and the connection refuses requests at once (P14)',
    async (reply, expected) => {
      const base = peer({ listing: { '': TOOLS }, calls: { read: { kind: reply } } })
      adoptStdio(base, files)
      let closes = 0
      const transports = reshapedTransports(base.ports.transports, () => ({
        close: () => {
          closes += 1
          return never()
        },
      }))
      const { services: s, table } = services({ ...base, ports: { ...base.ports, transports } })
      const c = { p: base, table, ...s }
      const digest = await published(c)
      let answer: InvokeResult | 'pending' = 'pending'
      void c.invoker.invoke(alice, request(digest)).then(result => {
        answer = result
      })
      for (let turn = 0; turn < 5; turn += 1) await settled()
      expect(answer).toEqual(expected)
      expect(closes).toBe(1)
      expect(await state(c)).toMatchObject({ kind: 'lost' })
    },
  )

  it.each([
    ['unsent', CONNECTION_UNAVAILABLE],
    ['stream-breaks', { kind: 'sent', outcome: { kind: 'unknown', cause: 'stream-broken' } }],
  ] as const)(
    'a call (%s) whose answer loses the connection: in the run that hands over the answer the table already reports the connection lost (the synchronous part of lose, P14)',
    async (reply, expected) => {
      const c = arrange({ calls: { read: { kind: reply } } })
      const digest = await published(c)
      const seen = await c.invoker.invoke(alice, request(digest)).then(result => ({
        result,
        state: c.table.stateOf(alice.tenant, files.holding).kind,
      }))
      expect(seen).toEqual({ result: expected, state: 'lost' })
    },
  )

  it('closeAll joins the teardown that a call started on the connection it lost: it answers after that teardown, which closes the transport once; the catalog mark of the loss may come after closeAll (MC-10, MC-14)', async () => {
    const closeHeld = deferred<void>()
    const writeHeld = deferred<void>()
    let closes = 0
    let writes = 0
    let holding = false
    const c = arrange(
      { calls: { read: { kind: 'unsent' } } },
      {
        shape: p => ({
          transports: reshapedTransports(p.ports.transports, transport => ({
            async close() {
              if (holding) {
                closes += 1
                await closeHeld.promise
              }
              return transport.close()
            },
          })),
          store: {
            ...p.store,
            async write(key, record, basedOn) {
              if (holding) {
                writes += 1
                await writeHeld.promise
              }
              return p.store.write(key, record, basedOn)
            },
          },
        }),
      },
    )
    const digest = await published(c)
    holding = true
    expect(await c.invoker.invoke(alice, request(digest))).toEqual(CONNECTION_UNAVAILABLE)
    let closedAll = false
    const closing = c.connections.closeAll().then(closed => {
      closedAll = true
      return closed
    })
    await settled()
    expect(closes).toBe(1)
    expect(closedAll).toBe(false)
    closeHeld.resolve()
    await closing
    expect(closes).toBe(1)
    await settled()
    expect(writes).toBe(1)
    writeHeld.resolve()
  })

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

  it('step 13: a checkOutput that throws is absorbed: the call answers sent with violates (output-check-failed), the key is free again, and a task that follows is recorded', async () => {
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

  it('step 13: a call that breaches its contract (T9) is sent with an unknown effect: unknown (abandoned), no cancel, the key has ended and is free again', async () => {
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

  it('step 10: a call sent on one generation, whose connection is lost and rebuilt before call returns: a later cancel answers unknown and tells no peer (MC-12)', async () => {
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
      await loseOn(table, first, { reason: 'stream-broken', mark: 'connection-unavailable' }),
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
