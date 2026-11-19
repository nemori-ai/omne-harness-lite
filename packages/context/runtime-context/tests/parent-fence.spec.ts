import { describe, expect, it } from 'vitest'
import type { ContextBlockKey, ReplayRef, ScopeRef } from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  harness,
  issue,
  producer,
  reader,
  register,
  scope,
  supplied,
  tenantA,
  tenantB,
  type Harness,
} from './support.js'

const KEY = 'test.value' as ContextBlockKey
const OWN = 'test.own' as ContextBlockKey

function child(ref: string, parent: string): ScopeRef {
  const decoded = decodeScopeRef({ ref, parent: { ref: parent } })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}

async function begin(h: Harness, target: ScopeRef, supersedes: ReplayRef | null) {
  h.ports.bind(target, tenantA)
  const begun = await h.rc.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: null,
    supersedes,
  })
  if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${begun.kind}`)
  return begun.replay
}

async function open(h: Harness, target: ScopeRef) {
  const replay = await begin(h, target, null)
  const ready = await h.rc.finishReplay('holder', {
    replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(`finishReplay: ${ready.kind}`)
  return replay
}

// A tenant-level parent that holds the value, and a child scope whose reader reads through it.
async function world(childRegisters: boolean) {
  const h = harness()
  const parent = scope(`fence/parent/${childRegisters}`)
  const own = child(`fence/child/${childRegisters}`, parent.ref)
  const opened = await open(h, parent)
  await open(h, own)
  const value = await producer(h, tenantA, KEY, { declaration: supplied(KEY) })
  const local = await producer(h, tenantA, OWN, { declaration: supplied(OWN), name: 'local' })
  await register(h, parent, tenantA, KEY)
  if (childRegisters) await register(h, own, tenantA, KEY)
  await register(h, own, tenantA, OWN, childRegisters ? 1 : 0)
  await value.publish({ scope: parent, tenant: tenantA, value: 100 })
  await local.publish({ scope: own, tenant: tenantA, value: 7 })
  const view = await reader(h, await issue(h, own, tenantA, [KEY, OWN]))
  const read = async () => {
    const snapshot = await view.snapshot()
    if (snapshot.kind !== 'success') return { refused: snapshot }
    const blocks = Object.fromEntries(
      snapshot.value.blocks.map(block => [
        block.key,
        { ...block.state, from: block.evidence.scope.ref },
      ]),
    )
    const missing = Object.fromEntries(snapshot.value.missing.map(item => [item.key, item.cause]))
    return { blocks, missing }
  }
  return { h, parent, own, opened, read }
}

describe.each([
  ['the child has no registration of its own', false],
  ['the child registers the same block without a value', true],
])(
  'the parent hop checks the replay fence (CX-24, RcRead ParentChecksFence): %s',
  (_label, both) => {
    it('reads the value of the parent while the parent is open', async () => {
      const w = await world(both)
      const view = await w.read()
      expect(view.blocks?.[KEY]).toEqual({ kind: 'value', value: 100, from: w.parent.ref })
      expect(view.blocks?.[OWN]).toEqual({ kind: 'value', value: 7, from: w.own.ref })
    })

    it('reads the block of the parent as missing while the parent replays, never its old value and never as empty', async () => {
      const w = await world(both)
      await begin(w.h, w.parent, w.opened)
      const view = await w.read()
      expect(view.blocks?.[KEY]).toBeUndefined()
      expect(view.missing?.[KEY]).toBe('source-unavailable')
    })

    it('keeps reading the block the child itself holds while the parent replays', async () => {
      const w = await world(both)
      await begin(w.h, w.parent, w.opened)
      expect((await w.read()).blocks?.[OWN]).toMatchObject({ kind: 'value', value: 7 })
    })
  },
)

describe('the parent hop checks the tenant and the binding of each ancestor (CX-20)', () => {
  // A child of tenant A whose parent reference names a scope that tenant B holds, or one that is unbound.
  async function strangerAbove(bind: boolean) {
    const h = harness()
    const parent = scope(`fence/stranger/${bind}`)
    const own = child(`fence/under-stranger/${bind}`, parent.ref)
    h.ports.bind(parent, tenantB)
    const begun = await h.rc.beginReplay('holder', {
      scope: parent,
      tenant: tenantB,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(`beginReplay: ${begun.kind}`)
    await h.rc.finishReplay('holder', {
      replay: begun.replay,
      material: { registrations: [], checkpoints: [], end: null },
    })
    await open(h, own)
    const theirs = await producer(h, tenantB, KEY, { declaration: supplied(KEY) })
    await producer(h, tenantA, KEY, { declaration: supplied(KEY), name: 'ours' })
    await register(h, parent, tenantB, KEY)
    await theirs.publish({ scope: parent, tenant: tenantB, value: 666 })
    if (!bind) h.ports.answerBinding(parent, { kind: 'unbound' })
    return { h, parent, own }
  }

  it.each([
    ['belongs to another tenant', true],
    ['is not bound to any tenant now', false],
  ])(
    'never reads the value of an ancestor that %s, registered there or inherited',
    async (_l, bind) => {
      const w = await strangerAbove(bind)
      const through = await reader(w.h, await issue(w.h, w.own, tenantA, [KEY]))
      const first = await through.snapshot()
      expect(JSON.stringify(first)).not.toContain('666')
      await register(w.h, w.own, tenantA, KEY)
      const inherited = await reader(w.h, await issue(w.h, w.own, tenantA, [KEY]))
      const second = await inherited.snapshot()
      expect(JSON.stringify(second)).not.toContain('666')
      expect(second).toMatchObject({ kind: 'success' })
    },
  )
})

describe('an ancestor of the same tenant whose binding is gone', () => {
  it('is not read: the hop asks the binding each time, and the registration there does not count', async () => {
    const h = harness()
    const parent = scope('fence/unbound/parent')
    const own = child('fence/unbound/child', parent.ref)
    await open(h, parent)
    await open(h, own)
    const value = await producer(h, tenantA, KEY, { declaration: supplied(KEY) })
    await register(h, parent, tenantA, KEY)
    await value.publish({ scope: parent, tenant: tenantA, value: 100 })
    const view = await reader(h, await issue(h, own, tenantA, [KEY]))
    expect(JSON.stringify(await view.snapshot())).toContain('100')
    h.ports.answerBinding(parent, { kind: 'unbound' })
    expect(JSON.stringify(await view.snapshot())).not.toContain('100')
  })
})

describe('the child shadows the parent', () => {
  it('reads its own value of a block the parent holds too', async () => {
    const h = harness()
    const parent = scope('fence/shadow/parent')
    const own = child('fence/shadow/child', parent.ref)
    await open(h, parent)
    await open(h, own)
    const value = await producer(h, tenantA, KEY, { declaration: supplied(KEY) })
    await register(h, parent, tenantA, KEY)
    await register(h, own, tenantA, KEY)
    await value.publish({ scope: parent, tenant: tenantA, value: 100 })
    await value.publish({ scope: own, tenant: tenantA, value: 5 })
    const view = await reader(h, await issue(h, own, tenantA, [KEY]))
    const snapshot = await view.snapshot()
    if (snapshot.kind !== 'success') throw new Error(`snapshot: ${snapshot.kind}`)
    expect(snapshot.value.blocks).toMatchObject([
      { key: KEY, state: { kind: 'value', value: 5 }, evidence: { scope: { ref: own.ref } } },
    ])
  })
})

describe('the scope of the reader itself', () => {
  it('still refuses the whole read while its own fence is closed', async () => {
    const h = harness()
    const target = scope('fence/alone')
    const opened = await open(h, target)
    const view = await reader(h, await issue(h, target, tenantA, []))
    await begin(h, target, opened)
    expect(await view.snapshot()).toMatchObject({ kind: 'refused' })
  })
})
