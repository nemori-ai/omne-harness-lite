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
