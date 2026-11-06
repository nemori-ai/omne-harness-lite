// The read port: `refresh` publishes whole listings under the publish boundary of SPEC S5 and
// invariant 2; `current` and `peer` answer from what is stored and connected, and never connect.
import { describe, expect, it } from 'vitest'
import type { AuthorizationDiscovery, CatalogKey } from '@omne-harness/mcp-contract'
import type {
  CatalogStore,
  ListingPage,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import type { Step } from './doubles/scripted-transport.ts'
import { jsonOf, peerIdentityOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice, bob, mallory } from './doubles/identities.ts'
import { armedStore } from './doubles/stalls.ts'
import {
  MAIN,
  adoptHttp,
  adoptStdio,
  page,
  storedRecord,
  usualScript,
  world,
  type World,
} from './doubles/world.ts'

const files = endpointRefOf('files')
const peer = peerIdentityOf()
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

async function record(w: World, key: CatalogKey = anonymousKey) {
  const read = await w.store.read(key)
  if (!('ok' in read)) throw new Error('store unavailable')
  return read.ok
}

const DISCOVERY: AuthorizationDiscovery = {
  resourceMetadataUrl: 'https://files.example.test/.well-known/oauth-protected-resource',
  metadata: 'unavailable',
  issuers: [],
  scopes: [],
}

describe('refresh publishes', () => {
  it('connects, lists one page and publishes revision 1 with the whole listing', async () => {
    const { w, discovery } = core(world({ script: usualScript(['read', 'write']) }))
    adoptStdio(w, files)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    expect(stored.actions.map(action => action.name)).toEqual(['read', 'write'])
    expect(stored.basis).toEqual({
      generation: 1,
      protocolVersion: peer.protocolVersion,
      capabilities: peer.capabilities,
    })
    expect(stored.freshness).toEqual({
      acquiredAt: '2026-11-03T12:00:00.000Z',
      changedNotified: false,
    })
  })

  it('reads every page up to the bound, with the cursor of the page before', async () => {
    const { w, discovery } = core(
      world({
        script: [
          { discover: peer },
          { listActions: page(['a'], 'p2') },
          { listActions: page(['b'], 'p3') },
          { listActions: page(['c']) },
        ],
      }),
    )
    adoptStdio(w, files)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
    expect(
      w.transports.calls.flatMap(call => (call.kind === 'listActions' ? [call.cursor] : [])),
    ).toEqual([undefined, 'p2', 'p3'])
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    expect(stored.actions.map(action => action.name)).toEqual(['a', 'b', 'c'])
  })

  it('publishes revision 2 on a second refresh and keeps a withdrawn action as unavailable', async () => {
    const { w, discovery } = core(
      world({
        script: [
          { discover: peer },
          { listActions: page(['read', 'write']) },
          { listActions: page(['read']) },
        ],
      }),
    )
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 2 },
    })
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    expect(stored.actions.map(action => [action.name, action.availability])).toEqual([
      ['read', { kind: 'available' }],
      ['write', { kind: 'unavailable', reason: 'no-longer-offered' }],
    ])
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
  })
})

describe('refresh keeps the earlier adoption', () => {
  it('superseded: another writer published between the read and the write', async () => {
    const listing = deferred<ListingPage>()
    const { w, discovery } = core(world({ script: [{ discover: peer }, { listActions: listing }] }))
    adoptStdio(w, files)
    const pending = discovery.refresh(alice, { ref: files })
    await settled()
    const other = await storedRecord(w, anonymousKey, ['other'])
    listing.resolve(page(['late']))
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
    expect(await record(w)).toEqual(other)
  })

  it('superseded: the connection that produced the listing is no longer the current one (invariant 2)', async () => {
    const listing = deferred<ListingPage>()
    const second = deferred<ListingPage>()
    const { w, discovery, connections } = core(
      world({
        script: [
          { discover: peer },
          { listActions: listing },
          { discover: peer },
          { listActions: second },
        ],
      }),
    )
    adoptStdio(w, files)
    const late = discovery.refresh(alice, { ref: files })
    await settled()
    expect(await connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    const next = discovery.refresh(alice, { ref: files })
    await settled()
    listing.resolve(page(['stale']))
    expect(await late).toEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
    expect(await record(w)).toBe('absent')
    second.resolve(page(['fresh']))
    expect(await next).toEqual({ ok: { kind: 'published', revision: 1 } })
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    expect(stored.actions.map(action => action.name)).toEqual(['fresh'])
    expect(stored.basis.generation).toBe(2)
  })

  it('cancelled: the refresh was aborted before the publish boundary', async () => {
    const listing = deferred<ListingPage>()
    const { w, discovery } = core(world({ script: [{ discover: peer }, { listActions: listing }] }))
    adoptStdio(w, files)
    const controller = new AbortController()
    const pending = discovery.refresh(alice, { ref: files, signal: controller.signal })
    await settled()
    controller.abort()
    listing.resolve(page(['read']))
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'cancelled' } } })
    expect(await record(w)).toBe('absent')
  })

  it.each([
    [
      'page-limit-exceeded',
      [
        { listActions: page(['a'], 'p2') },
        { listActions: page(['b'], 'p3') },
        { listActions: page(['c'], 'p4') },
      ],
    ],
    ['duplicate-action-name', [{ listActions: page(['a', 'a']) }]],
    ['action-invalid', [{ listActions: { tools: [jsonOf({ inputSchema: {} })] } }]],
    ['action-limit-exceeded', [{ listActions: page(['a', 'b', 'c']) }]],
  ] as const)(
    'listing-incomplete (%s): the listing is not adopted',
    async (defect, steps: readonly Step[]) => {
      const { w, discovery, status } = core(
        world({ script: [{ discover: peer }, ...steps], config: { maxActions: 2 } }),
      )
      adoptStdio(w, files)
      expect(await discovery.refresh(alice, { ref: files })).toEqual({
        ok: { kind: 'kept', reason: { kind: 'listing-incomplete', defect } },
      })
      expect(await record(w)).toBe('absent')
      expect(await status.inspect(alice, files)).toMatchObject({
        ok: { connection: { kind: 'ready' } },
      })
    },
  )

  it.each([
    { kind: 'no-answer', cause: 'stream-broken' },
    { kind: 'error-answer', code: -32603, message: 'internal' },
    { kind: 'answer-malformed', what: 'tools-missing' },
  ] as const)(
    'listing-incomplete (page-failed) on %o: the connection is degraded, the record kept',
    async failure => {
      const { w, discovery, status } = core(
        world({
          script: [
            { discover: peer },
            { listActions: page(['a'], 'p2') },
            { listActions: failure },
            { listActions: page(['b']) },
          ],
        }),
      )
      adoptStdio(w, files)
      const before = await storedRecord(w, anonymousKey, ['old'])
      expect(await discovery.refresh(alice, { ref: files })).toEqual({
        ok: { kind: 'kept', reason: { kind: 'listing-incomplete', defect: 'page-failed' } },
      })
      expect(await record(w)).toEqual(before)
      expect(await status.inspect(alice, files)).toMatchObject({
        ok: { connection: { kind: 'degraded', reason: 'list-failed' } },
      })
      expect(await discovery.refresh(alice, { ref: files })).toEqual({
        ok: { kind: 'published', revision: 2 },
      })
      expect(await status.inspect(alice, files)).toMatchObject({
        ok: { connection: { kind: 'ready' } },
      })
    },
  )
})

describe('refresh fails', () => {
  it('a page not sent: connection-unavailable, the connection lost and the record marked', async () => {
    const { w, discovery, status } = core(
      world({
        script: [
          { discover: peer },
          { listActions: { kind: 'not-sent', cause: 'connection-unavailable' } },
        ],
      }),
    )
    adoptStdio(w, files)
    const before = await storedRecord(w, anonymousKey, ['old'])
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'stream-broken' } },
    })
    const after = await record(w)
    if (after === 'absent') throw new Error('record missing')
    expect(after.revision).toBe(before.revision + 1)
    expect(after.actions[0]?.availability).toEqual({
      kind: 'unavailable',
      reason: 'connection-unavailable',
    })
    expect(w.transports.calls.map(call => call.kind)).toEqual([
      'open',
      'discover',
      'listActions',
      'close',
    ])
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
  })

  it('a page refused with authorization-required: the discovery is carried', async () => {
    const { w, discovery, status } = core(
      world({
        script: [
          { discover: peer },
          {
            listActions: {
              kind: 'not-sent',
              cause: 'authorization-required',
              discovery: DISCOVERY,
            },
          },
        ],
      }),
    )
    adoptHttp(w, files)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'authorization-required', discovery: DISCOVERY },
    })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'authorization-required' } },
    })
  })

  it('marking after a connection failure meets a revision conflict: kept (superseded)', async () => {
    const { w, discovery } = core(
      world({
        script: [
          { discover: peer },
          { listActions: { kind: 'not-sent', cause: 'connection-unavailable' } },
        ],
      }),
    )
    adoptStdio(w, files)
    await storedRecord(w, anonymousKey, ['old'])
    const conflicting = {
      ...w,
      ports: {
        ...w.ports,
        store: {
          read: w.store.read,
          write: async () => ({ failure: 'revision-conflict' as const }),
        },
      },
    }
    const { discovery: other } = core(conflicting)
    expect(await other.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'kept', reason: { kind: 'superseded' } },
    })
    void discovery
  })

  it('marking after a connection failure meets an unavailable store: unknown', async () => {
    const { w, discovery } = core(
      world({
        script: [
          { discover: peer },
          { listActions: { kind: 'not-sent', cause: 'connection-unavailable' } },
        ],
      }),
    )
    adoptStdio(w, files)
    await storedRecord(w, anonymousKey, ['old'])
    w.store.setUnavailable(true)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({ failure: { kind: 'unknown' } })
  })

  it.each([
    [
      { kind: 'no-answer', cause: 'process-exited' },
      { kind: 'effect-unknown', cause: 'process-exited' },
    ],
    [{ kind: 'error-answer', code: -32600, message: 'bad' }, { kind: 'connection-unavailable' }],
    [{ kind: 'answer-malformed', what: 'discover-shape' }, { kind: 'connection-unavailable' }],
    [
      { kind: 'not-sent', cause: 'authorization-required', discovery: DISCOVERY },
      { kind: 'authorization-required', discovery: DISCOVERY },
    ],
  ] as const)('discover answers %o: refresh answers %o', async (failure, expected) => {
    const { w, discovery } = core(world({ script: [{ discover: failure }] }))
    adoptHttp(w, files)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({ failure: expected })
    expect(await record(w, credentialKey)).toBe('absent')
  })

  it('the store cannot be read: unknown, and no page is asked for', async () => {
    const { w, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    w.store.setUnavailable(true)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({ failure: { kind: 'unknown' } })
    expect(w.transports.calls.filter(call => call.kind === 'listActions')).toHaveLength(0)
  })

  it('the store cannot be written: unknown, no revision reported', async () => {
    const listing = deferred<ListingPage>()
    const { w, discovery } = core(world({ script: [{ discover: peer }, { listActions: listing }] }))
    adoptStdio(w, files)
    const pending = discovery.refresh(alice, { ref: files })
    await settled()
    w.store.setUnavailable(true)
    listing.resolve(page(['read']))
    expect(await pending).toEqual({ failure: { kind: 'unknown' } })
  })

  it('a caller that stopped before the refresh answered is told cancelled, whatever a step refused, as the exit of a call (MC-7, contract decision 31)', async () => {
    const { w, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    const controller = new AbortController()
    controller.abort()
    expect(await discovery.refresh(bob, { ref: files, signal: controller.signal })).toEqual({
      ok: { kind: 'kept', reason: { kind: 'cancelled' } },
    })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('the refusals of the gate and of the settings come first, without a transport', async () => {
    const { w, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    expect(await discovery.refresh(bob, { ref: files })).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(await discovery.refresh(mallory, { ref: files })).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    w.eligibility.block(alice, files, 'disabled')
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'blocked', reason: 'disabled' },
    })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('after closeAll: connection-unavailable before the gate, for an endpoint not adopted too; no port is asked (S8)', async () => {
    const { w, discovery, connections } = core(world({ script: usualScript() }))
    expect(await connections.closeAll()).toEqual([])
    const asked = { adoption: w.adoption.calls(), eligibility: w.eligibility.calls() }
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect({ adoption: w.adoption.calls(), eligibility: w.eligibility.calls() }).toEqual(asked)
    expect(w.transports.calls).toHaveLength(0)
  })

  it('closeAll while the refresh waits on the store before the listing: connection-unavailable, as a refresh that starts after closeAll; no page is asked after it, nothing is published (S8, MC-7)', async () => {
    const base = world({ script: usualScript() })
    adoptStdio(base, files)
    const store = armedStore(base.store)
    const { w, discovery, connections } = core({
      ...base,
      ports: { ...base.ports, store: store.port },
    })
    const read = store.arm()
    const pending = discovery.refresh(alice, { ref: files })
    await read.reached
    await connections.closeAll()
    const listed = w.transports.calls.filter(call => call.kind === 'listActions').length
    read.release()
    expect(await pending).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(w.transports.calls.filter(call => call.kind === 'listActions')).toHaveLength(listed)
    expect(await record(w)).toBe('absent')
  })

  it('closeAll while a page is asked: connection-unavailable, not the listing-incomplete the page failure would give, and nothing is published (S8, MC-7)', async () => {
    const listing = deferred<ListingPage | TransportFailure>()
    const { w, discovery, connections } = core(
      world({ script: [{ discover: peer }, { listActions: listing }] }),
    )
    adoptStdio(w, files)
    const pending = discovery.refresh(alice, { ref: files })
    await settled()
    expect(w.transports.calls.filter(call => call.kind === 'listActions')).toHaveLength(1)
    await connections.closeAll()
    listing.resolve({ kind: 'no-answer', cause: 'stream-broken' })
    expect(await pending).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(await record(w)).toBe('absent')
  })

  it('at whichever microtask closeAll lands, the refresh starts no step after it: no gate or store port and no page, and it answers connection-unavailable unless it published (S8, MC-7)', async () => {
    const LIMIT = 2_000
    let publishedBefore = false
    for (let k = 0; k < LIMIT && !publishedBefore; k += 1) {
      const base = world({ script: usualScript() })
      adoptStdio(base, files)
      const late: string[] = []
      let shut = (): boolean => false
      // The steps of MC-7 and the port that begins each: the gate (1st adoption, then
      // eligibility), the build (2nd adoption, its re-read), the stored record, each page, the
      // publish boundary (3rd adoption, then eligibility and a 4th adoption), the write. A step
      // begun before closeAll finishes; no step begins after it.
      const begins = new Set(['adoption.endpoint#1', 'adoption.endpoint#2', 'adoption.endpoint#3'])
      const seen = new Map<string, number>()
      const note = (port: string): void => {
        const nth = (seen.get(port) ?? 0) + 1
        seen.set(port, nth)
        const beginsStep = port.startsWith('store.') || begins.has(`${port}#${nth}`)
        if (beginsStep && shut()) late.push(`${port}#${nth}`)
      }
      const { adoption, eligibility, store } = base.ports
      const { discovery, connections, table } = core({
        ...base,
        ports: {
          ...base.ports,
          adoption: {
            endpoints(...args: Parameters<typeof adoption.endpoints>) {
              note('adoption.endpoints')
              return adoption.endpoints(...args)
            },
            endpoint(...args: Parameters<typeof adoption.endpoint>) {
              note('adoption.endpoint')
              return adoption.endpoint(...args)
            },
          },
          eligibility: {
            check(...args: Parameters<typeof eligibility.check>) {
              note('eligibility.check')
              return eligibility.check(...args)
            },
          },
          store: {
            read(...args: Parameters<typeof store.read>) {
              note('store.read')
              return store.read(...args)
            },
            write(...args: Parameters<typeof store.write>) {
              note('store.write')
              return store.write(...args)
            },
          },
        },
      })
      shut = () => table.isShut()
      const pages = (): number =>
        base.transports.calls.filter(call => call.kind === 'listActions').length
      const pending = discovery.refresh(alice, { ref: files })
      for (let i = 0; i < k; i += 1) await Promise.resolve()
      const closing = connections.closeAll()
      const pagesAtShut = pages()
      const answer = await pending
      await closing
      expect(late, `k=${k}: ports asked after closeAll`).toEqual([])
      expect(pages(), `k=${k}: pages asked after closeAll`).toBe(pagesAtShut)
      publishedBefore = 'ok' in answer && answer.ok.kind === 'published'
      if (!publishedBefore)
        expect(answer, `k=${k}`).toEqual({ failure: { kind: 'connection-unavailable' } })
    }
    expect(publishedBefore).toBe(true)
  })

  it('the caller aborts and closeAll begins while a page is asked: kept (cancelled), the stop ranks before the shutdown as at the exit of a call (S8, MC-7, MC-16)', async () => {
    const listing = deferred<ListingPage | TransportFailure>()
    const { w, discovery, connections } = core(
      world({ script: [{ discover: peer }, { listActions: listing }] }),
    )
    adoptStdio(w, files)
    const stop = new AbortController()
    const pending = discovery.refresh(alice, { ref: files, signal: stop.signal })
    await settled()
    expect(w.transports.calls.filter(call => call.kind === 'listActions')).toHaveLength(1)
    await connections.closeAll()
    stop.abort()
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'cancelled' } } })
    expect(await record(w)).toBe('absent')
  })

  it('closeAll while the store writes the listing: the refresh that published stays published (S8)', async () => {
    const base = world({ script: usualScript() })
    adoptStdio(base, files)
    const reached = deferred<void>()
    const held = deferred<void>()
    const store: CatalogStore = {
      read: key => base.store.read(key),
      async write(key, record, basedOn) {
        reached.resolve()
        await held.promise
        return base.store.write(key, record, basedOn)
      },
    }
    const { discovery, connections } = core({ ...base, ports: { ...base.ports, store } })
    const pending = discovery.refresh(alice, { ref: files })
    await reached.promise
    await connections.closeAll()
    held.resolve()
    expect(await pending).toEqual({ ok: { kind: 'published', revision: 1 } })
  })
})

describe('refresh publish boundary: eligibility', () => {
  it('revoked while listing: not-available-to-you, nothing published', async () => {
    const listing = deferred<ListingPage>()
    const { w, discovery } = core(world({ script: [{ discover: peer }, { listActions: listing }] }))
    adoptStdio(w, files)
    const pending = discovery.refresh(alice, { ref: files })
    await settled()
    w.eligibility.revoke(alice, files)
    listing.resolve(page(['read']))
    expect(await pending).toEqual({ failure: { kind: 'not-available-to-you' } })
    expect(await record(w)).toBe('absent')
  })

  it('blocked while listing: blocked, nothing published, the connection closed', async () => {
    const listing = deferred<ListingPage>()
    const { w, discovery, status } = core(
      world({ script: [{ discover: peer }, { listActions: listing }] }),
    )
    adoptStdio(w, files)
    const pending = discovery.refresh(alice, { ref: files })
    await settled()
    w.eligibility.block(alice, files, 'disabled')
    listing.resolve(page(['read']))
    expect(await pending).toEqual({ failure: { kind: 'blocked', reason: 'disabled' } })
    expect(await record(w)).toBe('absent')
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
  })
})

describe('refresh: two concurrent refreshes', () => {
  async function race(order: 'first-then-second' | 'second-then-first') {
    const first = deferred<ListingPage>()
    const second = deferred<ListingPage>()
    const { w, discovery } = core(
      world({ script: [{ discover: peer }, { listActions: first }, { listActions: second }] }),
    )
    adoptStdio(w, files)
    const a = discovery.refresh(alice, { ref: files })
    const b = discovery.refresh(alice, { ref: files })
    await settled()
    if (order === 'first-then-second') {
      first.resolve(page(['from-first']))
      await settled()
      second.resolve(page(['from-second']))
    } else {
      second.resolve(page(['from-second']))
      await settled()
      first.resolve(page(['from-first']))
    }
    const answers = await Promise.all([a, b])
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    return { answers, stored, w }
  }

  it.each(['first-then-second', 'second-then-first'] as const)(
    'publishes exactly once (%s) and keeps the listing that was published',
    async order => {
      const { answers, stored, w } = await race(order)
      expect(answers).toContainEqual({ ok: { kind: 'published', revision: 1 } })
      expect(answers).toContainEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
      expect(stored.revision).toBe(1)
      expect(stored.actions.map(action => action.name)).toEqual([
        order === 'first-then-second' ? 'from-first' : 'from-second',
      ])
      expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    },
  )
})

describe('current and peer do not connect', () => {
  it('current: not-acquired before any refresh, with no transport opened', async () => {
    const { w, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    expect(await discovery.current(alice, files)).toEqual({ ok: { kind: 'not-acquired' } })
    expect(await discovery.peer(alice, files)).toEqual({ failure: { kind: 'not-connected' } })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('current: basisCurrent is no-connection, then matches, then differs', async () => {
    const { w, discovery } = core(world({ script: usualScript(['read']) }))
    adoptStdio(w, files)
    await storedRecord(w, anonymousKey, ['read'])
    expect(await discovery.current(alice, files)).toMatchObject({
      ok: { kind: 'acquired', revision: 1, basisCurrent: 'no-connection' },
    })
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 2 },
    })
    const matches = await discovery.current(alice, files)
    expect(matches).toMatchObject({
      ok: { kind: 'acquired', revision: 2, basisCurrent: 'matches' },
    })
    if (!('ok' in matches) || matches.ok.kind !== 'acquired') throw new Error('not acquired')
    expect(matches.ok.actions.map(action => action.name)).toEqual(['read'])
    // The stored basis names other capabilities than the connection negotiated.
    const stored = await record(w)
    if (stored === 'absent') throw new Error('nothing stored')
    const rebased = {
      ...stored,
      basis: { ...stored.basis, capabilities: jsonOf({ tools: { listChanged: true } }) },
    }
    expect(await w.store.write(anonymousKey, rebased, stored.revision)).toEqual({ ok: true })
    expect(await discovery.current(alice, files)).toMatchObject({
      ok: { kind: 'acquired', basisCurrent: 'differs' },
    })
    // Member order of the capabilities does not make the basis differ.
    const reordered = {
      ...stored,
      basis: { ...stored.basis, capabilities: jsonOf({ tools: {} }) },
    }
    expect(await w.store.write(anonymousKey, reordered, stored.revision)).toEqual({ ok: true })
    expect(await discovery.current(alice, files)).toMatchObject({
      ok: { kind: 'acquired', basisCurrent: 'matches' },
    })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
  })

  it('peer: the negotiated facts and the generation once connected', async () => {
    const { w, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(await discovery.peer(alice, files)).toEqual({ ok: { peer, generation: 1 } })
  })

  it('current and peer: a missing credential is config-missing (credential), not a connection failure', async () => {
    const { w, discovery } = core(world())
    adoptHttp(w, files, { settings: { credential: { kind: 'absent' } } })
    expect(await discovery.current(alice, files)).toEqual({
      failure: { kind: 'config-missing', item: 'credential' },
    })
    expect(await discovery.peer(alice, files)).toEqual({
      failure: { kind: 'config-missing', item: 'credential' },
    })
  })

  it('current: an unavailable store is unknown, not not-acquired', async () => {
    const { w, discovery } = core(world())
    adoptStdio(w, files)
    w.store.setUnavailable(true)
    expect(await discovery.current(alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('current and peer: the gate answers first', async () => {
    const { w, discovery } = core(world())
    adoptStdio(w, files)
    expect(await discovery.current(mallory, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(await discovery.peer(bob, files)).toEqual({ failure: { kind: 'not-available-to-you' } })
  })
})
