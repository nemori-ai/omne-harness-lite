// Machine guard of the RcRead model (runtime-context-contract verification/models/RcRead.tla),
// properties P4 (tenant isolation along the parent chain) and P5 (the read cache never changes a
// read). Two mechanisms, one with a read cache of two entries and one without, run the same
// seeded sequence of publications, producer replacements and reads. Every read of the cached
// instance must equal the read of the uncached one, and a reader of one tenant must only see the
// values of its own tenant. A failure prints the seed.
//
// Scopes: a1 (tenant A), b1 (tenant B), a2 (A, parent a1) and bx (B, parent a1). The key is
// registered in all four; only a1 and b1 are published. a2 inherits a1's value; bx must not,
// because its parent belongs to another tenant (RC-03: every hop checks its own tenant).
// a1 never begins a replay here: a child read while its parent replays is a known defect.
import { describe, expect, it } from 'vitest'
import type {
  ContextBlockKey,
  ContextReader,
  ProducerHandle,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  harness,
  issue,
  open,
  producer,
  reader,
  register,
  scope,
  supplied,
  tenantA,
  tenantB,
  type Harness,
} from './support.js'

/** A small deterministic generator (mulberry32), so a failing sequence can be replayed. */
function random(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { below: (n: number) => Math.floor(next() * n) }
}

const KEY = 'test.value' as ContextBlockKey

function child(ref: string, parent: string): ScopeRef {
  const decoded = decodeScopeRef({ ref, parent: { ref: parent } })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}

const a1 = scope('diff/a1')
const b1 = scope('diff/b1')
const a2 = child('diff/a2', 'diff/a1')
const bx = child('diff/bx', 'diff/a1')
/** The scopes and the tenant of each; the readers are made in this order. */
const SCOPES: readonly [ScopeRef, TenantId][] = [
  [a1, tenantA],
  [b1, tenantB],
  [a2, tenantA],
  [bx, tenantB],
]

type World = {
  h: Harness
  handles: Map<TenantId, ProducerHandle>
  readers: ContextReader[]
}

const declarations = new Map([
  [tenantA, supplied(KEY)],
  [tenantB, supplied(KEY)],
])
/** The one declaration object of a tenant, so a new producer only changes the generation. */
function declarationOf(tenant: TenantId) {
  const declaration = declarations.get(tenant)
  if (!declaration) throw new Error('no declaration')
  return declaration
}

async function world(readCacheEntries: number): Promise<World> {
  const h = harness({ readCacheEntries })
  for (const [target, tenant] of SCOPES) await open(h, target, tenant)
  const handles = new Map<TenantId, ProducerHandle>()
  for (const tenant of [tenantA, tenantB])
    handles.set(tenant, await producer(h, tenant, KEY, { declaration: declarationOf(tenant) }))
  for (const [target, tenant] of SCOPES) await register(h, target, tenant, KEY)
  const readers: ContextReader[] = []
  for (const [target, tenant] of SCOPES)
    readers.push(await reader(h, await issue(h, target, tenant, [KEY])))
  return { h, handles, readers }
}

/** The read without its cursor, which names the instance and is not part of the read value. */
function normal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normal)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !/cursor/i.test(k))
      .map(([k, v]) => [k, normal(v)]),
  )
}

/** Every value a successful read discloses. */
function valuesOf(read: unknown): number[] {
  const found: number[] = []
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.kind === 'value' && typeof o.value === 'number') found.push(o.value)
      Object.values(o).forEach(walk)
    }
  }
  walk(read)
  return found
}

type Op =
  | { kind: 'publish'; tenant: TenantId; value: number }
  | { kind: 'replace'; tenant: TenantId }
  | { kind: 'read'; reader: number }

async function apply(w: World, op: Op): Promise<unknown> {
  if (op.kind === 'publish') {
    const target = op.tenant === tenantA ? a1 : b1
    return (w.handles.get(op.tenant) as ProducerHandle).publish({
      scope: target,
      tenant: op.tenant,
      value: op.value,
    })
  }
  if (op.kind === 'replace') {
    // The same declaration object: only the generation changes (runtime-context SPEC 读取缓存).
    const next = await producer(w.h, op.tenant, KEY, { declaration: declarationOf(op.tenant) })
    w.handles.set(op.tenant, next)
    return null
  }
  return (w.readers[op.reader] as ContextReader).snapshot()
}

function schedule(seed: number, length: number): Op[] {
  const rnd = random(seed)
  const ops: Op[] = []
  let a = 100
  let b = 200
  for (let i = 0; i < length; i++) {
    const roll = rnd.below(10)
    if (roll < 2) ops.push({ kind: 'publish', tenant: tenantA, value: a++ })
    else if (roll < 4) ops.push({ kind: 'publish', tenant: tenantB, value: b++ })
    else if (roll === 4)
      ops.push({ kind: 'replace', tenant: rnd.below(2) === 0 ? tenantA : tenantB })
    else ops.push({ kind: 'read', reader: rnd.below(SCOPES.length) })
  }
  return ops
}

/** Runs one seed on a cached and an uncached instance; returns the violations found. */
async function differential(seed: number, length: number): Promise<string[]> {
  const cached = await world(2)
  const plain = await world(0)
  const violations: string[] = []
  for (const [step, op] of schedule(seed, length).entries()) {
    const got = await apply(cached, op)
    const want = await apply(plain, op)
    if (op.kind !== 'read') continue
    const where = `seed=${String(seed)} step=${String(step)} reader=${String(op.reader)}`
    if (JSON.stringify(normal(got)) !== JSON.stringify(normal(want)))
      violations.push(
        `P5 ${where}: cached ${JSON.stringify(normal(got))} uncached ${JSON.stringify(normal(want))}`,
      )
    const tenant = (SCOPES[op.reader] as [ScopeRef, TenantId])[1]
    for (const read of [got, want])
      for (const value of valuesOf(read))
        if ((tenant === tenantA) !== value < 200)
          violations.push(
            `P4 ${where}: a reader of ${tenant === tenantA ? 'A' : 'B'} saw ${String(value)}`,
          )
  }
  return violations
}

describe('RcRead guard: the read cache and the parent chain refine the model', () => {
  it('P4 and P5 hold over 60 seeded sequences of publications, replacements and reads', async () => {
    const violations: string[] = []
    for (let seed = 1; seed <= 60; seed++) violations.push(...(await differential(seed, 40)))
    expect(violations).toEqual([])
  })

  it('the sequences reach an inherited value, a replaced generation and a cache hit', async () => {
    const w = await world(2)
    await apply(w, { kind: 'publish', tenant: tenantA, value: 100 })
    // a2 inherits a1's value through its parent; bx does not.
    expect(valuesOf(await apply(w, { kind: 'read', reader: 2 }))).toEqual([100])
    expect(valuesOf(await apply(w, { kind: 'read', reader: 3 }))).toEqual([])
    expect(valuesOf(await apply(w, { kind: 'read', reader: 0 }))).toEqual([100])
    expect(valuesOf(await apply(w, { kind: 'read', reader: 0 }))).toEqual([100])
    expect(w.h.diagnostics.some(d => d.kind === 'read-cache' && d.result === 'hit')).toBe(true)
    // A new generation drops the stored value; the next read does not serve it.
    await apply(w, { kind: 'replace', tenant: tenantA })
    expect(valuesOf(await apply(w, { kind: 'read', reader: 0 }))).toEqual([])
  })
})
