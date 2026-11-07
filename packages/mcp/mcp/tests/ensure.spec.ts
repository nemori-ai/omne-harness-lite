// The connection table's `ensure`: reuse, rebuild, single flight, the setting defects of SPEC S4,
// the connection failures of R6 with their catalog marking, the credential handle lifecycle of
// S9, the connection bound, and the key that keeps tenants and peer accounts apart.
import { describe, expect, it, vi } from 'vitest'
import type { Access } from '@omne-harness/legal-identity'
import {
  catalogKeyOf,
  isCatalogRevision,
  type AuthorizationDiscovery,
  type EndpointRef,
  type PeerAccount,
} from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  AdoptionView,
  ProcessLanding,
} from '@omne-harness/mcp-contract/provider'
import { admit, admitWithoutEligibility, type AdmittedEndpoint } from '../src/internal/gate.ts'
import { Connection } from '../src/internal/connection.ts'
import { loseOn } from '../src/internal/lost.ts'
import { createConnectionTable, type ConnectionTable, type Ensured } from '../src/internal/table.ts'
import type { Step } from './doubles/scripted-transport.ts'
import { deferred, settled } from './doubles/deferred.ts'
import {
  adoptionRevisionOf,
  credentialBindingOf,
  jsonOf,
  millisOf,
  peerIdentityOf,
  endpointRefOf,
} from '@omne-harness/mcp-contract/testing'
import { alice, mallory, away } from './doubles/identities.ts'
import {
  INVALID,
  MAIN,
  TARGET,
  VALUE,
  adoptHttp,
  adoptStdio,
  storedRecord,
  world,
  type World,
} from './doubles/world.ts'

const files = endpointRefOf('files')
const peer = peerIdentityOf()

/** The transport a usable connection hands to a request, read through its only door. */
function transportOf(ensured: Ensured): unknown {
  const wire = ensured.wire()
  if ('failure' in wire) throw new Error(`the connection takes no requests: ${wire.failure.cause}`)
  return wire.ok
}

async function admitted(w: World, endpoint: EndpointRef, access: Access<Principal> = alice) {
  const decision = await admit(w.ports, access, endpoint)
  if (decision.kind !== 'admitted') throw new Error(`not admitted: ${decision.kind}`)
  return decision.endpoint
}

type Principal = Readonly<{ id: string }>

/**
 * Two connections of one tenant and holding on one adoption revision, one for each peer account:
 * an adoption view that keeps one revision text while the credential binding changes. The
 * contract forbids this (AV5); the key must still keep the accounts apart.
 */
async function twoAccounts(after: readonly Step[] = []) {
  const w = world({ script: [{ discover: peer }, { discover: peer }, ...after] })
  const base = adoptHttp(w, files)
  w.credentials.store({
    tenant: alice.tenant,
    holding: files.holding,
    binding: credentialBindingOf('other'),
    secret: 's2',
  })
  let current: AdoptedEndpoint = base
  const adoption: AdoptionView<Principal, string> = {
    endpoints: async () => ({ ok: [current] }),
    endpoint: async () => ({ ok: current }),
  }
  const ports = { ...w.ports, adoption }
  const table = createConnectionTable(ports, w.config)
  const first = await admit(ports, alice, files)
  if (first.kind !== 'admitted') throw new Error('not admitted')
  const ours = await table.ensure(first.endpoint, alice)
  current = {
    ...base,
    settings: { ...base.settings, credential: VALUE(credentialBindingOf('other')) },
  }
  const second = await admit(ports, alice, files)
  if (second.kind !== 'admitted') throw new Error('not admitted')
  const theirs = await table.ensure(second.endpoint, alice)
  if (!('ok' in ours) || !('ok' in theirs)) throw new Error('ensure failed')
  return { w, table, ours: ours.ok, theirs: theirs.ok }
}

function tableOf(w: World): ConnectionTable<Principal> {
  return createConnectionTable(w.ports, w.config)
}

const DISCOVERY: AuthorizationDiscovery = {
  resourceMetadataUrl: 'https://files.example.test/.well-known/oauth-protected-resource',
  metadata: 'unavailable',
  issuers: [],
  scopes: [],
}

describe('ensure: reuse, rebuild and single flight', () => {
  it('opens one transport and reuses it for a second ensure', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    const first = await table.ensure(token, alice)
    const second = await table.ensure(token, alice)
    if (!('ok' in first) || !('ok' in second)) throw new Error('ensure failed')
    expect(transportOf(second.ok)).toBe(transportOf(first.ok))
    expect(second.ok.generation).toBe(first.ok.generation)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    expect(w.landing.started()).toHaveLength(1)
  })

  it('rebuilds a lost connection with the next generation and a new transport', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    const first = await table.ensure(token, alice)
    if (!('ok' in first)) throw new Error('first ensure failed')
    const lostTransport = transportOf(first.ok)
    expect(
      await loseOn(table, first.ok, { reason: 'process-exited', mark: 'connection-unavailable' }),
    ).toBe('not-acquired')
    expect(first.ok.connection.isCurrent(first.ok.generation)).toBe(false)
    expect(first.ok.wire()).toEqual({
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
    const second = await table.ensure(token, alice)
    if (!('ok' in second)) throw new Error('second ensure failed')
    expect(first.ok.generation).toBe(1)
    expect(second.ok.generation).toBe(2)
    expect(transportOf(second.ok)).not.toBe(lostTransport)
    expect(second.ok.connection.isCurrent(second.ok.generation)).toBe(true)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(2)
    expect(w.landing.processes()[0]?.stops).toBe(1)
  })

  it('opens once for two concurrent ensures of the same key', async () => {
    const discover = deferred<typeof peer>()
    const w = world({ script: [{ discover }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    const first = table.ensure(token, alice)
    const second = table.ensure(token, alice)
    await settled()
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    discover.resolve(peer)
    const [a, b] = await Promise.all([first, second])
    if (!('ok' in a) || !('ok' in b)) throw new Error('ensure failed')
    expect(transportOf(a.ok)).toBe(transportOf(b.ok))
    expect(a.ok.generation).toBe(b.ok.generation)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
  })

  it('refuses a token that did not pass eligibility at the gate', async () => {
    const w = world()
    adoptStdio(w, files)
    const table = tableOf(w)
    const adoptedOnly = await admitWithoutEligibility(w.ports, alice, files)
    if (!('ok' in adoptedOnly)) throw new Error('not adopted')
    const forged: AdmittedEndpoint = adoptedOnly.ok as AdmittedEndpoint
    await expect(table.ensure(forged, alice)).rejects.toThrow(TypeError)
  })
})

describe('ensure: setting defects (S4)', () => {
  const cases: readonly [string, (w: World) => void, unknown][] = [
    [
      'target missing',
      w => adoptHttp(w, files, { settings: { target: { kind: 'absent' } } }),
      { kind: 'config-missing', item: 'target' },
    ],
    [
      'target invalid',
      w => adoptHttp(w, files, { settings: { target: INVALID } }),
      { kind: 'config-invalid', item: 'target' },
    ],
    [
      'credential invalid',
      w => adoptHttp(w, files, { settings: { credential: INVALID } }),
      { kind: 'config-invalid', item: 'credential' },
    ],
    [
      'connect-timeout missing without a connectBound',
      w => adoptStdio(w, files, { settings: { connectTimeout: { kind: 'absent' } } }),
      { kind: 'config-missing', item: 'connect-timeout' },
    ],
    [
      'connect-timeout invalid',
      w => adoptStdio(w, files, { settings: { connectTimeout: INVALID } }),
      { kind: 'config-invalid', item: 'connect-timeout' },
    ],
    [
      'a setting variable missing from processEnv',
      w => adoptStdio(w, files, { env: [{ name: 'HOME_DIR', source: 'setting' }] }),
      { kind: 'config-missing', item: 'env.HOME_DIR' },
    ],
  ]

  it.each(cases)('answers the refusal for %s and opens nothing', async (_name, adopt, reason) => {
    const w = world()
    adopt(w)
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({ failure: { stage: 'settings', reason } })
    expect(w.transports.calls).toHaveLength(0)
    expect(w.credentials.handles()).toHaveLength(0)
  })

  it('reports the first defect only, in the order target, credential, connect-timeout', async () => {
    const w = world()
    adoptHttp(w, files, {
      settings: { target: INVALID, credential: INVALID, connectTimeout: INVALID },
    })
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: { stage: 'settings', reason: { kind: 'config-invalid', item: 'target' } },
    })
  })

  it('uses the connectBound of the request when the connect-timeout setting is absent', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files, { settings: { connectTimeout: { kind: 'absent' } } })
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice, {
      connectBound: millisOf(5_000),
    })
    expect('ok' in answer).toBe(true)
  })

  it('does not use the connectBound when the connect-timeout setting is invalid', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files, { settings: { connectTimeout: INVALID } })
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice, {
      connectBound: millisOf(5_000),
    })
    expect(answer).toEqual({
      failure: { stage: 'settings', reason: { kind: 'config-invalid', item: 'connect-timeout' } },
    })
  })

  it('answers credential-unavailable (missing) when the credential setting is absent (K1)', async () => {
    const w = world()
    adoptHttp(w, files, { settings: { credential: { kind: 'absent' } } })
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: { stage: 'settings', reason: { kind: 'credential-unavailable', cause: 'missing' } },
    })
  })

  it('an adopted body it cannot read is refused at the gate: no token, nothing to ensure', async () => {
    const w = world()
    w.adoption.adopt({
      tenant: alice.tenant,
      scope: 'ws',
      ref: files,
      body: jsonOf({ nonsense: 1 }),
    })
    w.eligibility.grant(alice, files)
    expect(await admit(w.ports, alice, files)).toEqual({ kind: 'body-unreadable' })
    expect(w.eligibility.calls()).toBe(0)
  })
})

describe('ensure: connection failures (R6) mark the catalog and release what was taken', () => {
  async function keyOf(w: World, adopted: AdoptedEndpoint, account: PeerAccount) {
    return catalogKeyOf(alice.tenant, adopted, account)
  }
  const credentialAccount: PeerAccount = { kind: 'credential', binding: MAIN }

  it('an error of this package while marking reaches the caller; it is not read as a store breach (MC-5, MC-15)', async () => {
    const w = world()
    const adopted = adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
    })
    w.credentials.reject(alice.tenant, MAIN)
    const record = await storedRecord(w, await keyOf(w, adopted, credentialAccount), ['read'])
    // A record at the last revision: the next one cannot be counted (contract `nextRevision`).
    const last = Number.MAX_SAFE_INTEGER
    if (!isCatalogRevision(last)) throw new TypeError('not a catalog revision')
    let writes = 0
    const store = {
      ...w.ports.store,
      read: async () => ({ ok: { ...record, revision: last } }),
      write: async (...args: Parameters<typeof w.ports.store.write>) => {
        writes += 1
        return w.ports.store.write(...args)
      },
    }
    const table = createConnectionTable({ ...w.ports, store }, w.config)
    await expect(table.ensure(await admitted(w, files), alice)).rejects.toThrow(RangeError)
    expect(writes).toBe(0)
  })

  it('an error of this package in a build reaches a call that joined it while it still waits (P7)', async () => {
    const w = world()
    const adopted = adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
    })
    w.credentials.reject(alice.tenant, MAIN)
    const record = await storedRecord(w, await keyOf(w, adopted, credentialAccount), ['read'])
    const last = Number.MAX_SAFE_INTEGER
    if (!isCatalogRevision(last)) throw new TypeError('not a catalog revision')
    // The mark of the failed build waits here until the second call has joined it.
    const marking = deferred<void>()
    let reads = 0
    const store = {
      ...w.ports.store,
      read: async () => {
        reads += 1
        await marking.promise
        return { ok: { ...record, revision: last } }
      },
    }
    const table = createConnectionTable({ ...w.ports, store }, w.config)
    const endpoint = await admitted(w, files)
    const began = table.ensure(endpoint, alice)
    await settled()
    const joined = table.ensure(endpoint, alice)
    await settled()
    marking.resolve()
    await expect(began).rejects.toThrow(RangeError)
    await expect(joined).rejects.toThrow(RangeError)
    expect(reads).toBe(1)
  })

  it('credential rejected: credential-unavailable (rejected), actions marked, revision one higher', async () => {
    const w = world()
    const adopted = adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
    })
    w.credentials.reject(alice.tenant, MAIN)
    const key = await keyOf(w, adopted, credentialAccount)
    const before = await storedRecord(w, key, ['read', 'write'])
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'credential-unavailable', cause: 'rejected' },
        catalog: 'marked',
      },
    })
    const after = await w.store.read(key)
    if (!('ok' in after) || after.ok === 'absent') throw new Error('record missing')
    expect(after.ok.revision).toBe(before.revision + 1)
    expect(after.ok.actions.map(action => action.availability)).toEqual([
      { kind: 'unavailable', reason: 'credential-unavailable' },
      { kind: 'unavailable', reason: 'credential-unavailable' },
    ])
  })

  it('credential unreadable: credential-unavailable (unknown)', async () => {
    const w = world()
    adoptHttp(w, files)
    w.credentials.setUnreadable(alice.tenant, MAIN, true)
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'credential-unavailable', cause: 'unknown' },
        catalog: 'not-acquired',
      },
    })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('landing refused: landing-unavailable, the process credential handle released exactly once', async () => {
    const w = world()
    const adopted = adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
      facilities: ['gpu'],
    })
    const key = await keyOf(w, adopted, credentialAccount)
    await storedRecord(w, key, ['read'])
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: { stage: 'connect', reason: { kind: 'landing-unavailable' }, catalog: 'marked' },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    const after = await w.store.read(key)
    if (!('ok' in after) || after.ok === 'absent') throw new Error('record missing')
    expect(after.ok.actions[0]?.availability).toEqual({
      kind: 'unavailable',
      reason: 'landing-unavailable',
    })
    const token = await admitted(w, files)
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'preparation-failed',
    })
  })

  it('open refused with authorization-required: the discovery is carried, the HTTP handle released once', async () => {
    const w = world({
      script: [
        { open: { kind: 'not-sent', cause: 'authorization-required', discovery: DISCOVERY } },
      ],
    })
    const adopted = adoptHttp(w, files)
    const key = await keyOf(w, adopted, credentialAccount)
    await storedRecord(w, key, ['read'])
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'authorization-required', discovery: DISCOVERY },
        catalog: 'marked',
      },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    const after = await w.store.read(key)
    if (!('ok' in after) || after.ok === 'absent') throw new Error('record missing')
    expect(after.ok.actions[0]?.availability).toEqual({
      kind: 'unavailable',
      reason: 'authorization-required',
    })
    const token = await admitted(w, files)
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'authorization-required',
    })
  })

  it('discover refused with connection-unavailable: the process is stopped, the handle released once', async () => {
    const w = world({
      script: [{ discover: { kind: 'not-sent', cause: 'connection-unavailable' } }],
    })
    const adopted = adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
    })
    const key = await keyOf(w, adopted, credentialAccount)
    await storedRecord(w, key, ['read'])
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toEqual({
      failure: { stage: 'connect', reason: { kind: 'connection-unavailable' }, catalog: 'marked' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.transports.calls.map(call => call.kind)).toEqual(['open', 'discover', 'close'])
    const after = await w.store.read(key)
    if (!('ok' in after) || after.ok === 'absent') throw new Error('record missing')
    expect(after.ok.actions[0]?.availability).toEqual({
      kind: 'unavailable',
      reason: 'connection-unavailable',
    })
  })

  it('discover answered with an error: connection-unavailable, lost (discover-failed)', async () => {
    const w = world({
      script: [{ discover: { kind: 'error-answer', code: -32600, message: 'bad request' } }],
    })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    const answer = await table.ensure(token, alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'connection-unavailable' },
        catalog: 'not-acquired',
      },
    })
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'discover-failed',
    })
  })

  it('discover answered unreadably: connection-unavailable, lost (discover-failed)', async () => {
    const w = world({
      script: [{ discover: { kind: 'answer-malformed', what: 'discover-shape' } }],
    })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    const answer = await table.ensure(token, alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'connection-unavailable' },
        catalog: 'not-acquired',
      },
    })
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'discover-failed',
    })
  })

  it.each([
    [{ kind: 'no-answer', cause: 'process-exited', unusable: 'process-exited' }, 'process-exited'],
    [{ kind: 'no-answer', cause: 'stream-broken', unusable: 'stream-broken' }, 'stream-broken'],
    [{ kind: 'no-answer', cause: 'stream-broken', unusable: 'session-ended' }, 'session-ended'],
    [{ kind: 'no-answer', cause: 'stream-broken' }, 'preparation-failed'],
    [{ kind: 'no-answer', cause: 'abandoned' }, 'preparation-failed'],
  ] as const)(
    'discover without an answer (%o): effect-unknown with the cause, lost for the mark, else preparation-failed (%s) (S7, MC-5)',
    async (failure, lost) => {
      const w = world({ script: [{ discover: failure }] })
      adoptStdio(w, files)
      const table = tableOf(w)
      const token = await admitted(w, files)
      const answer = await table.ensure(token, alice)
      expect(answer).toEqual({
        failure: {
          stage: 'connect',
          reason: { kind: 'effect-unknown', cause: failure.cause },
          catalog: 'not-acquired',
        },
      })
      expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({ kind: 'lost', reason: lost })
    },
  )

  it('discover not sent on a line that ended (X02, marked stream-broken): connection-unavailable, lost (stream-broken) (S7, MC-5)', async () => {
    const w = world({
      script: [
        {
          discover: {
            kind: 'not-sent',
            cause: 'connection-unavailable',
            unusable: 'stream-broken',
          },
        },
      ],
    })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    expect(await table.ensure(token, alice)).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'connection-unavailable' },
        catalog: 'not-acquired',
      },
    })
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'stream-broken',
    })
  })

  it('a failed stdio attempt still counts a generation; a failed HTTP attempt does not', async () => {
    const stdio = world({
      script: [
        { discover: { kind: 'not-sent', cause: 'connection-unavailable' } },
        { discover: peer },
      ],
    })
    adoptStdio(stdio, files)
    const stdioTable = tableOf(stdio)
    await stdioTable.ensure(await admitted(stdio, files), alice)
    const recovered = await stdioTable.ensure(await admitted(stdio, files), alice)
    if (!('ok' in recovered)) throw new Error('stdio rebuild failed')
    expect(recovered.ok.generation).toBe(2)

    const http = world({
      script: [
        { discover: { kind: 'not-sent', cause: 'connection-unavailable' } },
        { discover: peer },
      ],
    })
    adoptHttp(http, files)
    const httpTable = tableOf(http)
    await httpTable.ensure(await admitted(http, files), alice)
    const negotiated = await httpTable.ensure(await admitted(http, files), alice)
    if (!('ok' in negotiated)) throw new Error('http rebuild failed')
    expect(negotiated.ok.generation).toBe(1)
  })

  it('reports a revision conflict of the marking write', async () => {
    const w = world()
    const adopted = adoptHttp(w, files)
    w.credentials.reject(alice.tenant, MAIN)
    const key = await keyOf(w, adopted, credentialAccount)
    await storedRecord(w, key, ['read'])
    const conflicting = {
      ...w.ports,
      store: {
        read: w.store.read,
        write: async () => ({ failure: 'revision-conflict' as const }),
      },
    }
    const table = createConnectionTable(conflicting, w.config)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toMatchObject({ failure: { catalog: 'revision-conflict' } })
  })

  it('reports an unavailable store when marking', async () => {
    const w = world()
    adoptHttp(w, files)
    w.credentials.reject(alice.tenant, MAIN)
    w.store.setUnavailable(true)
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice)
    expect(answer).toMatchObject({ failure: { catalog: 'unavailable' } })
  })
})

describe('ensure: the connection bound', () => {
  it('answers connection-unavailable at the bound with the mark pending; the started process is stopped after', async () => {
    const never = deferred<'opened'>()
    const w = world({ script: [{ open: never }] })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(1)) } })
    const table = tableOf(w)
    const token = await admitted(w, files)
    const answer = await table.ensure(token, alice)
    expect(answer).toEqual({
      failure: {
        stage: 'connect',
        reason: { kind: 'connection-unavailable' },
        catalog: 'pending',
      },
    })
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'preparation-failed',
    })
  })

  it('records a residual when the stopped process confirms only the root', async () => {
    const never = deferred<'opened'>()
    const w = world({ script: [{ open: never }], stop: 'root-only' })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(1)) } })
    const table = tableOf(w)
    const token = await admitted(w, files)
    await table.ensure(token, alice)
    await settled()
    expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({
      kind: 'lost',
      reason: 'preparation-failed',
      residual: [{ kind: 'process', confirmed: 'root-only' }],
    })
  })
})

describe('ensure: the connection key (invariant 1)', () => {
  it('answers no usable connection for a key that never connected, without throwing', () => {
    const table = tableOf(world())
    expect(
      table.current({
        tenant: alice.tenant,
        holding: files.holding,
        adoptionRevision: adoptionRevisionOf('r1'),
        account: { kind: 'anonymous' },
      }),
    ).toBeUndefined()
  })

  it('does not share a connection between two tenants with the same holding and adoption revision', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    const { revision } = adoptStdio(w, files)
    w.adoption.adopt({
      tenant: away,
      scope: 'ws',
      ref: files,
      body: jsonOf({ name: 'files', transport: 'stdio', auth: 'none', launch: { command: 'x' } }),
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'absent' },
        connectTimeout: VALUE(millisOf(1000)),
      },
    })
    w.eligibility.grant(mallory, files)
    // The double gives every adoption its own revision. Here both tenants read one revision, so
    // the tenant is the only part of the two connection keys that differs.
    const adoption: AdoptionView<Principal, string> = {
      endpoints: (access, scope) => w.ports.adoption.endpoints(access, scope),
      endpoint: async (access, endpoint) => {
        const read = await w.ports.adoption.endpoint(access, endpoint)
        return 'ok' in read && read.ok !== 'not-adopted' ? { ok: { ...read.ok, revision } } : read
      },
    }
    const ports = { ...w.ports, adoption }
    const table = createConnectionTable(ports, w.config)
    const ourToken = await admit(ports, alice, files)
    const theirToken = await admit(ports, mallory, files)
    if (ourToken.kind !== 'admitted' || theirToken.kind !== 'admitted')
      throw new Error('not admitted')
    const ours = await table.ensure(ourToken.endpoint, alice)
    const theirs = await table.ensure(theirToken.endpoint, mallory)
    if (!('ok' in ours) || !('ok' in theirs)) throw new Error('ensure failed')
    expect(theirs.ok.adoptionRevision).toBe(ours.ok.adoptionRevision)
    expect(transportOf(theirs.ok)).not.toBe(transportOf(ours.ok))
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(2)
  })

  it('does not share a connection between two peer accounts of the same adoption revision', async () => {
    const { w, ours, theirs } = await twoAccounts()
    expect(transportOf(theirs)).not.toBe(transportOf(ours))
    expect(theirs.catalogKey.account).toEqual({ kind: 'credential', binding: 'other' })
    expect(ours.catalogKey.account).toEqual({ kind: 'credential', binding: 'main' })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(2)
  })

  it('a close of the holding refuses requests on each of its connections at once, not one after the other (MC-10)', async () => {
    const { table, ours, theirs } = await twoAccounts()
    const closing = table.close(alice.tenant, files.holding)
    const refused = { failure: { kind: 'not-sent', cause: 'connection-unavailable' } }
    expect(ours.wire()).toEqual(refused)
    expect(theirs.wire()).toEqual(refused)
    expect(table.currentOf(alice.tenant, files.holding)).toEqual([])
    expect(await closing).toEqual({ kind: 'released', process: 'no-process' })
  })

  it('a close that raised an error of this package on one connection waits for the others, then rejects with an AggregateError that holds the error (MC-10, P7)', async () => {
    // The first connection's close stalls on its transport; the second connection's close hits a
    // defect of this package after its teardown, when the table reads its generation to forget it.
    const closing = deferred<'closed'>()
    const { w, table, ours, theirs } = await twoAccounts([{ close: closing }])
    const defect = new Error('a defect of this package while forgetting the entry')
    let armed = false
    const original = Object.getOwnPropertyDescriptor(Connection.prototype, 'generation')?.get
    if (original === undefined) throw new Error('Connection has no generation getter')
    const generation = vi
      .spyOn(Connection.prototype, 'generation', 'get')
      .mockImplementation(function (this: Connection) {
        if (armed && this.key.account.kind === 'credential' && this.key.account.binding === 'other')
          throw defect
        return original.call(this)
      })
    try {
      armed = true
      const outcome = table.close(alice.tenant, files.holding).then(
        () => 'resolved' as const,
        (error: unknown) => error,
      )
      let answered = false
      void outcome.then(() => {
        answered = true
      })
      await settled()
      // The second connection's close has failed; the first one's has not ended: no answer yet.
      expect(answered).toBe(false)
      expect(w.transports.calls.filter(call => call.kind === 'close')).toHaveLength(2)
      closing.resolve('closed')
      const thrown = await outcome
      expect(thrown).toBeInstanceOf(AggregateError)
      expect(thrown instanceof AggregateError ? thrown.errors : []).toEqual([defect])
      expect(thrown instanceof Error ? thrown.message : '').toBe(
        'the MCP connections of the holding did not close cleanly',
      )
      const refused = { failure: { kind: 'not-sent', cause: 'connection-unavailable' } }
      expect(ours.wire()).toEqual(refused)
      expect(theirs.wire()).toEqual(refused)
    } finally {
      generation.mockRestore()
    }
  })

  it('closes the connection of an earlier adoption revision before using the new one', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const first = await table.ensure(await admitted(w, files), alice)
    if (!('ok' in first)) throw new Error('ensure failed')
    const earlierTransport = transportOf(first.ok)
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const second = await table.ensure(await admitted(w, files), alice)
    if (!('ok' in second)) throw new Error('ensure failed')
    expect(first.ok.connection.isCurrent(first.ok.generation)).toBe(false)
    expect(first.ok.wire()).toEqual({
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
    expect(transportOf(second.ok)).not.toBe(earlierTransport)
    expect(w.transports.calls.map(call => call.kind)).toEqual([
      'open',
      'discover',
      'close',
      'open',
      'discover',
    ])
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
  })

  it('carries the target and the HTTP handle in the material of an HTTP connection', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptHttp(w, files)
    const table = tableOf(w)
    await table.ensure(await admitted(w, files), alice)
    const opens = w.transports.calls.flatMap(call => (call.kind === 'open' ? [call.material] : []))
    expect(opens[0]).toMatchObject({ kind: 'streamable-http', target: TARGET, generation: 1 })
    expect(opens[0]?.kind === 'streamable-http' && opens[0].credential?.purpose).toBe(
      'http-authorization',
    )
  })

  it('carries the process in the material of a stdio connection, with the credential variables', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const table = tableOf(w)
    await table.ensure(await admitted(w, files), alice)
    const opens = w.transports.calls.flatMap(call => (call.kind === 'open' ? [call.material] : []))
    expect(opens[0]).toMatchObject({ kind: 'stdio', generation: 1, instructionsByteLimit: 4096 })
    expect(w.landing.started()[0]?.env.credentials.map(item => item.name)).toEqual(['TOKEN'])
  })
})

describe('ensure: the adoption is read again before a build (MC-5)', () => {
  it('answers not-available-to-you for a token of an endpoint withdrawn after the gate, and builds nothing', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    w.adoption.withdraw(alice.tenant, files)
    expect(await table.ensure(token, alice)).toEqual({
      failure: { stage: 'settings', reason: { kind: 'not-available-to-you' } },
    })
    expect(w.transports.calls).toHaveLength(0)
    expect(w.landing.started()).toHaveLength(0)
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
  })

  it('answers unknown when the adoption cannot be read again, and builds nothing', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const token = await admitted(w, files)
    w.adoption.setUnreadable(true)
    expect(await table.ensure(token, alice)).toEqual({
      failure: { stage: 'settings', reason: { kind: 'unknown' } },
    })
    expect(w.transports.calls).toHaveLength(0)
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
  })
})

describe('ensure: a close against the build (MC-10, MC-5, P16)', () => {
  const STOPPED = { failure: { stage: 'settings', reason: { kind: 'connection-unavailable' } } }

  it('a release after the process started: the build answers the refusal and tears nothing down; the release stops the process once and reports what that stop confirmed', async () => {
    const discover = deferred<typeof peer>()
    const w = world({ script: [{ discover }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const building = table.ensure(await admitted(w, files), alice)
    await settled()
    const releasing = table.close(alice.tenant, files.holding)
    discover.resolve(peer)
    expect(await building).toEqual(STOPPED)
    expect(await releasing).toEqual({ kind: 'released', process: 'tree-confirmed' })
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.trace).toEqual(['transport.close', 'process.stop'])
  })

  it('a release while the transport opens: the build asks no discover, and the release closes the transport that opened', async () => {
    const open = deferred<'opened'>()
    const w = world({ script: [{ open }] })
    adoptHttp(w, files)
    const table = tableOf(w)
    const building = table.ensure(await admitted(w, files), alice)
    await settled()
    expect(w.transports.calls.map(call => call.kind)).toEqual(['open'])
    const releasing = table.close(alice.tenant, files.holding)
    open.resolve('opened')
    expect(await building).toEqual(STOPPED)
    expect(await releasing).toEqual({ kind: 'released', process: 'no-process' })
    expect(w.transports.calls.map(call => call.kind)).toEqual(['open', 'close'])
  })

  it('a release while the build stops what the earlier connection left: the build asks no credential', async () => {
    const w = world({ script: [{ discover: peer }], stop: 'root-only' })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const second = deferred<void>()
    let stops = 0
    const landing: ProcessLanding<Principal> = {
      async start(access, launch, env) {
        const answer = await w.landing.start(access, launch, env)
        if ('failure' in answer) return answer
        const process = answer.ok
        return {
          ok: {
            ...process,
            async stop() {
              stops += 1
              if (stops === 2) await second.promise
              return process.stop()
            },
          },
        }
      },
    }
    const table = createConnectionTable({ ...w.ports, landing }, w.config)
    const endpoint = await admitted(w, files)
    expect(await table.ensure(endpoint, alice)).toMatchObject({ ok: { generation: 1 } })
    expect(await table.close(alice.tenant, files.holding)).toEqual({
      kind: 'released',
      process: 'root-only',
    })
    const building = table.ensure(endpoint, alice)
    await settled()
    expect(stops).toBe(2)
    const releasing = table.close(alice.tenant, files.holding)
    second.resolve()
    expect(await building).toEqual(STOPPED)
    await releasing
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  const SWEEPS = [
    { close: 'release', joined: false },
    { close: 'release', joined: true },
    { close: 'closeAll', joined: false },
    { close: 'closeAll', joined: true },
  ] as const

  it.each(SWEEPS)(
    'at whichever microtask the $close begins (joined: $joined), an ensure that settles after it hands over no handle of the closed connection; the close stops the process once and reports tree-confirmed',
    async ({ close, joined }) => {
      const LIMIT = 40
      const CLOCK_LIMIT = 1000
      let refused = false
      let handed = false
      for (let m = 0; m < LIMIT; m += 1) {
        const discover = deferred<typeof peer>()
        const w = world({ script: [{ discover }] })
        adoptStdio(w, files)
        const table = tableOf(w)
        const endpoint = await admitted(w, files)
        const first = table.ensure(endpoint, alice)
        const answer = joined ? table.ensure(endpoint, alice) : first
        await settled()
        // A clock of microtask turns. A callback on `answer` runs at most one turn after the
        // settlement, so an answer that settled before the close is seen at most one turn after.
        // The clock stops after CLOCK_LIMIT turns: a close that waits on a timer or I/O would
        // otherwise starve the macrotask queue, and the test would spin instead of failing.
        let tick = 0
        let running = true
        const clock = (async () => {
          while (running && tick < CLOCK_LIMIT) {
            await Promise.resolve()
            tick += 1
          }
        })()
        let answeredAt = Number.POSITIVE_INFINITY
        void answer.then(() => {
          answeredAt = tick
        })
        discover.resolve(peer)
        while (tick < m) await Promise.resolve()
        const closedAt = tick
        const closing =
          close === 'release' ? table.close(alice.tenant, files.holding) : table.closeAll()
        const result = await answer
        const report = await closing
        running = false
        await clock
        if ('ok' in result) {
          handed = true
          expect(
            answeredAt - closedAt,
            `m=${m}: settled after the close began`,
          ).toBeLessThanOrEqual(1)
        } else {
          refused = true
          expect(result, `m=${m}`).toEqual(STOPPED)
        }
        expect(w.landing.processes(), `m=${m}`).toEqual([{ stops: 1 }])
        expect(report, `m=${m}`).toEqual(
          close === 'release'
            ? { kind: 'released', process: 'tree-confirmed' }
            : [{ ref: files, process: 'tree-confirmed' }],
        )
      }
      expect({ refused, handed }).toEqual({ refused: true, handed: true })
    },
  )
})
