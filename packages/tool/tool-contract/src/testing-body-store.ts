// The ToolBodyStore conformance suite and a non-durable double that conforms to it. The suite runs
// every multi-step sequence as separate calls, so a provider that co-commits steps is checked
// against the behaviour of the split steps; `crash` loses process state between two steps; the
// store clock is moved apart from the issuer's to check that the store judges the deadline with its
// own clock. The double keeps bytes in memory and declares `durability: 'none'`.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolInstant,
  manifestOf,
  sha256Hex,
  signBodyPermit,
  verifyBodyPermit,
  type ToolBodyManifest,
  type ToolBodyPermit,
  type ToolBodyPermitKey,
  type ToolBodyRef,
  type ToolBodyStore,
  type ToolInstant,
  type ToolInstantClock,
} from './body-store.ts'
import { decodeToolBodyId, decodeToolInstanceId } from './identity.ts'
import { conformanceCase, handle, type ConformanceCase } from './testing-case.ts'
import { callId, testingTenant } from './testing-values.ts'

/**
 * What the body store suite needs. A fresh fixture serves one case. `key` is the permit key the
 * store verifies with; the suite signs its own permits with it. `setStoreClock` moves the clock the
 * store reads, and every later operation of the store sees the new reading. `crash` loses every
 * process-held state of the store between two steps while durable bytes survive; a double without
 * process state may make it a no-op. `otherTenant` enables the isolation case.
 */
export interface ToolBodyStoreFixture {
  readonly store: ToolBodyStore
  readonly key: ToolBodyPermitKey
  readonly tenant: TenantId
  readonly otherTenant?: TenantId
  setStoreClock(now: ToolInstant): Promise<void> | void
  crash?(): Promise<void> | void
}

const T0 = Date.parse('2026-11-09T00:00:00.000Z')
/** The permit duration W of the suite. */
const W = 2_000
const EPSILON = 1_000

export function instantAt(offsetMs: number): ToolInstant {
  const decoded = decodeToolInstant(new Date(T0 + offsetMs).toISOString())
  assert.ok('ok' in decoded)
  return decoded.ok
}

const decoded = <T>(outcome: { ok: T } | { failure: unknown }): T => {
  assert.ok('ok' in outcome, 'the suite builds legal identities')
  return outcome.ok
}

const CALL = callId('call-body-store')
const INSTANCE = decoded(decodeToolInstanceId('exec-1'))
const CHUNKS = [
  new TextEncoder().encode('first chunk of the body '),
  new TextEncoder().encode('second chunk'),
]
const OTHER = new TextEncoder().encode('other bytes')

function bodyRef(tenant: TenantId, body: string): ToolBodyRef {
  return { tenant, call: CALL, body: decoded(decodeToolBodyId(body)) }
}

function permitFor(fixture: ToolBodyStoreFixture, body: ToolBodyRef, deadline = instantAt(W)) {
  return signBodyPermit(fixture.key, { ...body, instance: INSTANCE, generation: '1', deadline })
}

async function putAll(store: ToolBodyStore, permit: ToolBodyPermit, chunks = CHUNKS) {
  for (const [seq, bytes] of chunks.entries())
    assert.deepEqual(await store.put(permit, seq, bytes), { kind: 'kept' }, `put ${seq}`)
}

async function expectFound(
  store: ToolBodyStore,
  body: ToolBodyRef,
  manifest: ToolBodyManifest,
  chunks: readonly Uint8Array[],
  what: string,
) {
  assert.deepEqual(
    await store.read(body, { first: 0, count: chunks.length }),
    { kind: 'found', manifest, chunks: chunks.map((bytes, seq) => ({ seq, bytes })) },
    what,
  )
}

async function expectAbsent(store: ToolBodyStore, body: ToolBodyRef, what: string) {
  assert.deepEqual(await store.read(body, { first: 0, count: 8 }), { kind: 'absent' }, what)
}

/** A fixture at the issuer's time: the store clock reads T0 unless a case moves it. */
async function started(fixture: ToolBodyStoreFixture) {
  await fixture.setStoreClock(instantAt(0))
  const body = bodyRef(fixture.tenant, 'body-1')
  return {
    store: fixture.store,
    body,
    permit: permitFor(fixture, body),
    manifest: manifestOf(CHUNKS),
  }
}

export function toolBodyStoreConformance(): readonly ConformanceCase<ToolBodyStoreFixture>[] {
  return [
    conformanceCase('BS', 'body.put-seal-read', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      await expectFound(store, body, manifest, CHUNKS, 'the sealed body reads back')
      assert.deepEqual(await store.read(body, { first: 1, count: 1 }), {
        kind: 'found',
        manifest,
        chunks: [{ seq: 1, bytes: CHUNKS[1] }],
      })
      assert.deepEqual(await store.read(body, { first: 2, count: 4 }), {
        kind: 'found',
        manifest,
        chunks: [],
      })
    }),
    conformanceCase('BS', 'body.read-before-seal-absent', async fixture => {
      const { store, body, permit } = await started(fixture)
      await putAll(store, permit)
      await expectAbsent(store, body, 'chunks without a manifest are not a body')
    }),
    conformanceCase('BS', 'body.put-idempotent-conditional', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      await putAll(store, permit)
      assert.deepEqual(await store.put(permit, 1, OTHER), { kind: 'conflict' })
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      await expectFound(store, body, manifest, CHUNKS, 'the first bytes of a sequence number stay')
    }),
    conformanceCase('BS', 'body.seal-idempotent-conditional', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      const other = manifestOf([CHUNKS[0]!])
      assert.deepEqual(await store.seal(permit, other), { kind: 'conflict' })
      await expectFound(store, body, manifest, CHUNKS, 'the first manifest stays')
    }),
    conformanceCase('BS', 'body.seal-not-ready', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      assert.deepEqual(await store.put(permit, 0, CHUNKS[0]!), { kind: 'kept' })
      assert.equal((await store.seal(permit, manifest)).kind, 'not-ready', 'a chunk is missing')
      assert.deepEqual(await store.put(permit, 1, CHUNKS[1]!), { kind: 'kept' })
      const wrongDigest = { ...manifest, digest: sha256Hex(OTHER) }
      assert.equal((await store.seal(permit, wrongDigest)).kind, 'not-ready', 'the digest differs')
      assert.deepEqual(await store.put(permit, 2, OTHER), { kind: 'kept' })
      assert.equal(
        (await store.seal(permit, manifest)).kind,
        'not-ready',
        'a chunk past the declared count makes the object differ from the manifest',
      )
      await expectAbsent(store, body, 'nothing sealed')
    }),
    conformanceCase('BS', 'body.put-after-seal', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      assert.deepEqual(await store.put(permit, 0, CHUNKS[0]!), { kind: 'kept' }, 'a replay')
      assert.deepEqual(await store.put(permit, 2, OTHER), { kind: 'conflict' }, 'immutable')
      await expectFound(store, body, manifest, CHUNKS, 'the sealed object is unchanged')
    }),
    conformanceCase('BS', 'body.delete-idempotent-no-tombstone', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      assert.deepEqual(await store.delete(body), { kind: 'deleted' })
      await expectAbsent(store, body, 'deleted')
      assert.deepEqual(await store.delete(body), { kind: 'deleted' }, 'idempotent')
      // No tombstone: a permit still within its deadline writes again. The ledger's parameter
      // constraints (G > W + 2ε, D > W + 2ε) keep this unreachable, not the store.
      assert.deepEqual(await store.put(permit, 0, CHUNKS[0]!), { kind: 'kept' })
      assert.deepEqual(await store.delete(body), { kind: 'deleted' })
      await expectAbsent(store, body, 'deleted again')
    }),
    conformanceCase('BS', 'body.permit-signature-binds-claims', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      const other = bodyRef(fixture.tenant, 'body-2')
      const forged: ToolBodyPermit = {
        claims: { ...permit.claims, ...other },
        signature: permit.signature,
      }
      assert.deepEqual(await store.put(forged, 0, CHUNKS[0]!), { kind: 'permit-invalid' })
      assert.deepEqual(await store.seal(forged, manifest), { kind: 'permit-invalid' })
      const otherKey = signBodyPermit({ secret: randomBytes(32) }, permit.claims)
      assert.deepEqual(await store.put(otherKey, 0, CHUNKS[0]!), { kind: 'permit-invalid' })
      await expectAbsent(store, other, 'nothing written under the forged claims')
      await expectAbsent(store, body, 'nothing written under the other key')
    }),
    conformanceCase('BS', 'body.permit-deadline-by-store-clock', async fixture => {
      const { store, body, permit, manifest } = await started(fixture)
      await fixture.setStoreClock(instantAt(W))
      assert.deepEqual(await store.put(permit, 0, CHUNKS[0]!), { kind: 'kept' }, 'at the deadline')
      await fixture.setStoreClock(instantAt(W + 1))
      assert.deepEqual(await store.put(permit, 1, CHUNKS[1]!), { kind: 'permit-expired' })
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'permit-expired' })
      await expectAbsent(store, body, 'an expired permit sealed nothing')
      // The store behind the issuer by ε still accepts: it reads only its own clock.
      await fixture.setStoreClock(instantAt(W - EPSILON))
      assert.deepEqual(await store.put(permit, 1, CHUNKS[1]!), { kind: 'kept' })
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      await expectFound(store, body, manifest, CHUNKS, 'sealed within the store clock')
    }),
    conformanceCase('BS', 'body.seal-then-crash-reseal', async fixture => {
      const crash = handle(fixture.crash, 'crash')
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      await crash()
      await expectFound(fixture.store, body, manifest, CHUNKS, 'a sealed body is durable')
      assert.deepEqual(await fixture.store.seal(permit, manifest), { kind: 'sealed' }, 'rerun')
      assert.deepEqual(await fixture.store.put(permit, 1, CHUNKS[1]!), { kind: 'kept' })
    }),
    conformanceCase('BS', 'body.delete-then-crash-redelete', async fixture => {
      const crash = handle(fixture.crash, 'crash')
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      assert.deepEqual(await store.delete(body), { kind: 'deleted' })
      await crash()
      await expectAbsent(fixture.store, body, 'the delete is durable')
      assert.deepEqual(await fixture.store.delete(body), { kind: 'deleted' }, 'rerun')
    }),
    conformanceCase('BS', 'body.tenant-isolation', async fixture => {
      const otherTenant = handle(fixture.otherTenant, 'otherTenant')
      const { store, body, permit, manifest } = await started(fixture)
      await putAll(store, permit)
      assert.deepEqual(await store.seal(permit, manifest), { kind: 'sealed' })
      const mirrored = { ...body, tenant: otherTenant }
      await expectAbsent(store, mirrored, 'the same call and body of another tenant is empty')
      assert.deepEqual(await store.delete(mirrored), { kind: 'deleted' })
      await expectFound(store, body, manifest, CHUNKS, 'the other tenant deleted nothing here')
    }),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

export interface MemoryToolBodyStore extends ToolBodyStore {
  readonly durability: 'none'
  /** The next operation answers `unavailable` and changes nothing. */
  failNext(): void
}

type Kept = { chunks: Map<number, Uint8Array>; manifest: ToolBodyManifest | null }

function refKey(body: ToolBodyRef): string {
  return JSON.stringify([
    body.tenant.organization.text,
    body.tenant.account.text,
    body.call,
    body.body,
  ])
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

/** Whether the chunks hold exactly what `manifest` declares, as the digest of the whole. */
export function chunksHold(
  chunks: ReadonlyMap<number, Uint8Array>,
  manifest: ToolBodyManifest,
): string | null {
  if (chunks.size !== manifest.chunks)
    return `the store holds ${chunks.size} chunks, the manifest declares ${manifest.chunks}`
  const ordered: Uint8Array[] = []
  for (let seq = 0; seq < manifest.chunks; seq += 1) {
    const chunk = chunks.get(seq)
    if (chunk === undefined) return `chunk ${seq} is missing`
    ordered.push(chunk)
  }
  const actual = manifestOf(ordered)
  if (actual.bytes !== manifest.bytes)
    return `the chunks hold ${actual.bytes} bytes, the manifest declares ${manifest.bytes}`
  return actual.digest === manifest.digest
    ? null
    : 'the digest of the chunks differs from the manifest'
}

const sameManifest = (a: ToolBodyManifest, b: ToolBodyManifest) =>
  a.chunks === b.chunks && a.bytes === b.bytes && a.digest === b.digest

export function createMemoryToolBodyStore(
  input: Readonly<{ key: ToolBodyPermitKey; clock: ToolInstantClock }>,
): MemoryToolBodyStore {
  const kept = new Map<string, Kept>()
  let failing = false

  const unavailable = () => {
    if (!failing) return null
    failing = false
    return { kind: 'unavailable', diagnostic: 'injected' } as const
  }
  const of = (body: ToolBodyRef): Kept => {
    const key = refKey(body)
    const existing = kept.get(key)
    if (existing !== undefined) return existing
    const created: Kept = { chunks: new Map(), manifest: null }
    kept.set(key, created)
    return created
  }
  const permitFault = (permit: ToolBodyPermit) => {
    const verdict = verifyBodyPermit(input.key, permit, input.clock.now())
    if (verdict === 'invalid-signature') return { kind: 'permit-invalid' } as const
    return verdict === 'expired' ? ({ kind: 'permit-expired' } as const) : null
  }

  return {
    durability: 'none',
    failNext: () => {
      failing = true
    },
    put: (permit, seq, bytes) => {
      const fault = unavailable() ?? permitFault(permit)
      if (fault !== null) return Promise.resolve(fault)
      const target = of(permit.claims)
      const existing = target.chunks.get(seq)
      if (existing !== undefined)
        return Promise.resolve({ kind: sameBytes(existing, bytes) ? 'kept' : 'conflict' })
      if (target.manifest !== null) return Promise.resolve({ kind: 'conflict' })
      target.chunks.set(seq, Uint8Array.from(bytes))
      return Promise.resolve({ kind: 'kept' })
    },
    seal: (permit, manifest) => {
      const fault = unavailable() ?? permitFault(permit)
      if (fault !== null) return Promise.resolve(fault)
      const target = of(permit.claims)
      if (target.manifest !== null)
        return Promise.resolve({
          kind: sameManifest(target.manifest, manifest) ? 'sealed' : 'conflict',
        })
      const diagnostic = chunksHold(target.chunks, manifest)
      if (diagnostic !== null) return Promise.resolve({ kind: 'not-ready', diagnostic })
      target.manifest = { ...manifest }
      return Promise.resolve({ kind: 'sealed' })
    },
    read: (body, range) => {
      const fault = unavailable()
      if (fault !== null) return Promise.resolve(fault)
      const target = kept.get(refKey(body))
      if (target === undefined || target.manifest === null)
        return Promise.resolve({ kind: 'absent' })
      const chunks = [...target.chunks.entries()]
        .filter(([seq]) => seq >= range.first && seq < range.first + range.count)
        .sort(([a], [b]) => a - b)
        .map(([seq, bytes]) => ({ seq, bytes: Uint8Array.from(bytes) }))
      return Promise.resolve({ kind: 'found', manifest: { ...target.manifest }, chunks })
    },
    delete: body => {
      const fault = unavailable()
      if (fault !== null) return Promise.resolve(fault)
      kept.delete(refKey(body))
      return Promise.resolve({ kind: 'deleted' })
    },
  }
}

/** A manual clock for a participant of the suite. */
export function createManualInstantClock(
  start: ToolInstant,
): ToolInstantClock & { set(now: ToolInstant): void } {
  let now = start
  return {
    now: () => now,
    set: next => {
      now = next
    },
  }
}

export function memoryToolBodyStoreFixture(): ToolBodyStoreFixture {
  const key = { secret: randomBytes(32) }
  const clock = createManualInstantClock(instantAt(0))
  return {
    store: createMemoryToolBodyStore({ key, clock }),
    key,
    tenant: testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
    otherTenant: testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
    setStoreClock: now => clock.set(now),
    crash: () => {},
  }
}
