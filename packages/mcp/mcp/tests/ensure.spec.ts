// The connection table's `ensure`: reuse, rebuild, single flight, the setting defects of SPEC S4,
// the connection failures of R6 with their catalog marking, the credential handle lifecycle of
// S9, the connection bound, and the key that keeps tenants and peer accounts apart.
import { describe, expect, it } from 'vitest'
import type { Access } from '@omne-harness/legal-identity'
import {
  catalogKeyOf,
  isCatalogRevision,
  type AuthorizationDiscovery,
  type EndpointRef,
  type PeerAccount,
} from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint, AdoptionView } from '@omne-harness/mcp-contract/provider'
import { admit, admitWithoutEligibility, type AdmittedEndpoint } from '../src/internal/gate.ts'
import { createConnectionTable, type ConnectionTable } from '../src/internal/table.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { alice, binding, json, mallory, millis, peerIdentity, ref, away } from './doubles/values.ts'
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

const files = ref('files')
const peer = peerIdentity()

async function admitted(w: World, endpoint: EndpointRef, access: Access<Principal> = alice) {
  const decision = await admit(w.ports, access, endpoint)
  if (decision.kind !== 'admitted') throw new Error(`not admitted: ${decision.kind}`)
  return decision.endpoint
}

type Principal = Readonly<{ id: string }>

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
    expect(second.ok.transport).toBe(first.ok.transport)
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
    expect(
      await table.lose(
        first.ok.connection,
        first.ok.generation,
        'process-exited',
        'connection-unavailable',
      ),
    ).toBe('not-acquired')
    expect(first.ok.connection.isCurrent(first.ok.generation)).toBe(false)
    const second = await table.ensure(token, alice)
    if (!('ok' in second)) throw new Error('second ensure failed')
    expect(first.ok.generation).toBe(1)
    expect(second.ok.generation).toBe(2)
    expect(second.ok.transport).not.toBe(first.ok.transport)
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
    expect(a.ok.transport).toBe(b.ok.transport)
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
      connectBound: millis(5_000),
    })
    expect('ok' in answer).toBe(true)
  })

  it('does not use the connectBound when the connect-timeout setting is invalid', async () => {
    const w = world({ script: [{ discover: peer }] })
    adoptStdio(w, files, { settings: { connectTimeout: INVALID } })
    const table = tableOf(w)
    const answer = await table.ensure(await admitted(w, files), alice, {
      connectBound: millis(5_000),
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
    w.adoption.adopt({ tenant: alice.tenant, scope: 'ws', ref: files, body: json({ nonsense: 1 }) })
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

  it.each([
    ['process-exited', 'process-exited'],
    ['stream-broken', 'stream-broken'],
    ['abandoned', 'preparation-failed'],
  ] as const)(
    'discover without an answer (%s): effect-unknown with the cause, lost (%s)',
    async (cause, lost) => {
      const w = world({ script: [{ discover: { kind: 'no-answer', cause } }] })
      adoptStdio(w, files)
      const table = tableOf(w)
      const token = await admitted(w, files)
      const answer = await table.ensure(token, alice)
      expect(answer).toEqual({
        failure: {
          stage: 'connect',
          reason: { kind: 'effect-unknown', cause },
          catalog: 'not-acquired',
        },
      })
      expect(table.stateOf(alice.tenant, token.ref.holding)).toEqual({ kind: 'lost', reason: lost })
    },
  )

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
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millis(1)) } })
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
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millis(1)) } })
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
  it('does not share a connection between two tenants with the same holding and adoption revision', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    const { revision } = adoptStdio(w, files)
    w.adoption.adopt({
      tenant: away,
      scope: 'ws',
      ref: files,
      body: json({ name: 'files', transport: 'stdio', auth: 'none', launch: { command: 'x' } }),
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'absent' },
        connectTimeout: VALUE(millis(1000)),
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
    expect(theirs.ok.transport).not.toBe(ours.ok.transport)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(2)
  })

  it('does not share a connection between two peer accounts of the same adoption revision', async () => {
    // An adoption view that keeps one revision text while the credential binding changes. The
    // contract forbids this (AV5); the key must still keep the accounts apart.
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    const base = adoptHttp(w, files)
    w.credentials.store({
      tenant: alice.tenant,
      holding: files.holding,
      binding: binding('other'),
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
    current = { ...base, settings: { ...base.settings, credential: VALUE(binding('other')) } }
    const second = await admit(ports, alice, files)
    if (second.kind !== 'admitted') throw new Error('not admitted')
    const theirs = await table.ensure(second.endpoint, alice)
    if (!('ok' in ours) || !('ok' in theirs)) throw new Error('ensure failed')
    expect(theirs.ok.transport).not.toBe(ours.ok.transport)
    expect(theirs.ok.catalogKey.account).toEqual({ kind: 'credential', binding: 'other' })
    expect(ours.ok.catalogKey.account).toEqual({ kind: 'credential', binding: 'main' })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(2)
  })

  it('closes the connection of an earlier adoption revision before using the new one', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    adoptStdio(w, files)
    const table = tableOf(w)
    const first = await table.ensure(await admitted(w, files), alice)
    if (!('ok' in first)) throw new Error('ensure failed')
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const second = await table.ensure(await admitted(w, files), alice)
    if (!('ok' in second)) throw new Error('ensure failed')
    expect(first.ok.connection.isCurrent(first.ok.generation)).toBe(false)
    expect(second.ok.transport).not.toBe(first.ok.transport)
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
