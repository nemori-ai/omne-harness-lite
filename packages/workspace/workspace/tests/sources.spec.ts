import { describe, expect, it } from 'vitest'
import {
  tenantCodec,
  workspaceCodec,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import type {
  RegisteredWorkspace,
  SourceDigests,
  SourceFiles,
  SourceLayout,
  SourceLimits,
} from '@omne-harness/workspace-contract'
import { createSources } from '@omne-harness/workspace'
import { fakeAccess } from '@omne-harness/workspace/testing'
import { op, world } from './world.ts'

const ALICE = fakeAccess(1)
const BOB = fakeAccess(2)
const LIMITS: SourceLimits = { files: 4, fileBytes: 64, totalBytes: 128 }
// A made-up category: the sources know no category, they are handed a layout.
const GADGETS: SourceLayout = { category: 'gadget', namespace: 'gadgets', limits: LIMITS }
const WIDGETS: SourceLayout = { category: 'widget', namespace: 'widgets', limits: LIMITS }

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const tenantOf = (tenant: TenantId) => (tenantCodec.encode(tenant) as { value: string }).value
const workspaceOf = (id: WorkspaceId) => (workspaceCodec.encode(id) as { value: string }).value
const digests: SourceDigests = {
  file: bytes => `f:${text(bytes)}`,
  package: entries => `p:${entries.map(entry => `${entry.path}=${entry.digest}`).join(',')}`,
}

type Node = 'dir' | 'link' | Uint8Array

/** A tree of directories, files and links in memory; `during` changes it at the nth listing. */
function tree() {
  const nodes = new Map<string, Node>()
  const changes = new Map<number, () => void>()
  const broken = new Set<string>()
  let throwing = false
  let listings = 0
  const parents = (path: string) => {
    const parts = path.split('/').filter(Boolean)
    return parts.map((_, at) => `/${parts.slice(0, at + 1).join('/')}`)
  }
  const put = (path: string, node: Node) => {
    for (const parent of parents(path).slice(0, -1))
      if (!nodes.has(parent)) nodes.set(parent, 'dir')
    nodes.set(path, node)
  }
  const at = (root: string, path: readonly string[]) => [root, ...path].join('/')
  /** `linked` when a link is on the way, `missing` when nothing is there. */
  const reach = (path: string): Node | 'missing' | 'linked' => {
    for (const parent of parents(path)) {
      const node = nodes.get(parent)
      if (node === undefined) return 'missing'
      if (node === 'link') return 'linked'
    }
    return nodes.get(path)!
  }
  const below = (path: string) => [...nodes.keys()].filter(key => key.startsWith(`${path}/`))
  const files: SourceFiles = {
    async directories(root, path) {
      listings += 1
      changes.get(listings)?.()
      if (throwing) throw new Error('the disk is gone')
      const base = at(root, path)
      if (reach(base) !== 'dir') return null
      return below(base)
        .filter(key => !key.slice(base.length + 1).includes('/') && nodes.get(key) === 'dir')
        .map(key => key.slice(base.length + 1))
    },
    async files(root, path, limits) {
      const base = at(root, path)
      if (broken.has(base)) return { kind: 'unreadable' }
      const found = reach(base)
      if (found === 'missing' || found === 'linked') return { kind: found }
      if (found !== 'dir') return { kind: 'unreadable' }
      const inside = below(base)
      if (inside.some(key => nodes.get(key) === 'link')) return { kind: 'linked' }
      const read = inside
        .filter(key => nodes.get(key) instanceof Uint8Array)
        .map(key => ({ path: key.slice(base.length + 1), bytes: nodes.get(key) as Uint8Array }))
      const total = read.reduce((sum, file) => sum + file.bytes.byteLength, 0)
      if (
        read.length > limits.files ||
        total > limits.totalBytes ||
        read.some(file => file.bytes.byteLength > limits.fileBytes)
      )
        return { kind: 'over-limit' }
      return { kind: 'read', files: read }
    },
    async file(root, path, limit) {
      // The real port cannot reach anything without the instance's root.
      if (typeof root !== 'string') throw new Error('no root')
      if (broken.has(at(root, path))) return { kind: 'unreadable' }
      const found = reach(at(root, path))
      if (found === 'missing' || found === 'linked') return { kind: found }
      if (!(found instanceof Uint8Array)) return { kind: 'unreadable' }
      return found.byteLength > limit ? { kind: 'over-limit' } : { kind: 'bytes', bytes: found }
    },
  }
  return {
    files,
    write: (path: string, content: string) => put(path, new TextEncoder().encode(content)),
    link: (path: string) => put(path, 'link'),
    remove: (path: string) => {
      for (const key of [path, ...below(path)]) nodes.delete(key)
    },
    during: (listing: number, change: () => void) => changes.set(listing, change),
    break: (path: string) => broken.add(path),
    mend: (path: string) => broken.delete(path),
    throwing: () => {
      throwing = true
    },
    listings: () => listings,
  }
}

async function setup(store?: (store: ReturnType<typeof world>['store']) => object) {
  const w = world()
  const t = tree()
  w.things.put('/a', { kinds: ['plain', 'versioned'], resource: 'repo' })
  const made = await w.governance.register(ALICE, { operation: op('register-a'), address: '/a' })
  if (made.kind !== 'done') throw new Error(JSON.stringify(made))
  const sources = createSources({
    authority: w.authority,
    store: (store?.(w.store) ?? w.store) as typeof w.store,
    types: w.types,
    minting: w.minting,
    node: 'node-1',
    files: t.files,
    digests,
  })
  const target = { workspace: made.value.workspace, instance: made.value.instance }
  const adopt = (key: string, layouts: readonly SourceLayout[] = [GADGETS], access = ALICE) =>
    sources.adopt(access, { ...target, key, layouts })
  return { w, t, sources, made: made.value as RegisteredWorkspace, target, adopt }
}

const names = (answer: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['adopt']>>) =>
  answer.kind === 'adopted'
    ? answer.reading.packages.map(item => `${item.root}:${item.category}/${item.name}`)
    : answer.kind

describe('reading the source roots (C5)', () => {
  it('reads only the directories of the layouts under .omne.local and .omne, local first', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'shared lamp')
    s.t.write('/a/.omne.local/gadgets/lamp/MAIN.md', 'local lamp')
    s.t.write('/a/.omne/gadgets/fan/README.md', 'about')
    s.t.write('/a/.omne/gadgets/fan/MAIN.md', 'fan')
    s.t.write('/a/.omne/widgets/knob/MAIN.md', 'a category not handed in')
    s.t.write('/a/gadgets/stray/MAIN.md', 'outside the source roots')
    s.t.write('/a/.omne/gadgets/README.md', 'a file is not a package')
    const answer = await s.adopt('turn-1')
    expect(names(answer)).toEqual(['shared:gadget/fan', 'local:gadget/lamp', 'shared:gadget/lamp'])
    if (answer.kind !== 'adopted') throw new Error(answer.kind)
    expect(answer.fresh).toBe(true)
    expect(answer.reading.packages[0]?.entries.map(entry => entry.path)).toEqual([
      'MAIN.md',
      'README.md',
    ])
    const lamp = answer.reading.packages[1]!
    expect(lamp).toEqual({
      category: 'gadget',
      namespace: 'gadgets',
      name: 'lamp',
      root: 'local',
      version: 'p:MAIN.md=f:local lamp',
      entries: [{ path: 'MAIN.md', bytes: 10, digest: 'f:local lamp' }],
    })
  })

  it('leaves out a link, a package with a link inside, and a root that is a link', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/kept/MAIN.md', 'kept')
    s.t.link('/a/.omne/gadgets/aliased')
    s.t.write('/a/.omne/gadgets/inner/MAIN.md', 'inner')
    s.t.link('/a/.omne/gadgets/inner/elsewhere')
    s.t.link('/a/.omne.local')
    expect(names(await s.adopt('turn-1'))).toEqual(['shared:gadget/kept'])
  })

  it('reads an empty list when a root or a category directory is not there', async () => {
    const s = await setup()
    expect(names(await s.adopt('turn-1', [GADGETS, WIDGETS]))).toEqual([])
    s.t.write('/a/.omne/widgets/knob/MAIN.md', 'knob')
    expect(names(await s.adopt('turn-2', [GADGETS, WIDGETS]))).toEqual(['shared:widget/knob'])
  })

  it('leaves out a package over the limits of its category', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/big/MAIN.md', 'x'.repeat(65))
    s.t.write('/a/.omne/gadgets/small/MAIN.md', 'ok')
    expect(names(await s.adopt('turn-1'))).toEqual(['shared:gadget/small'])
  })

  it('reads once more when the roots change while they are read, and keeps the last reading when they change again', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    // Two layouts, two roots: four listings a pass. The fifth is the first of the second pass.
    s.t.during(5, () => s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2'))
    const settled = await s.adopt('turn-1', [GADGETS, WIDGETS])
    expect(s.t.listings()).toBe(12)
    if (settled.kind !== 'adopted') throw new Error(settled.kind)
    expect(settled.reading.packages[0]?.version).toBe('p:MAIN.md=f:v2')
    expect(settled.fresh).toBe(true)

    const before = s.t.listings()
    s.t.during(before + 5, () => s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v3'))
    s.t.during(before + 9, () => s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v4'))
    const kept = await s.adopt('turn-2', [GADGETS, WIDGETS])
    if (kept.kind !== 'adopted') throw new Error(kept.kind)
    expect(kept.fresh).toBe(false)
    expect(kept.reason).toMatch(/kept changing/u)
    expect(kept.reading.revision).toBe(settled.reading.revision)
    expect(kept.reading.packages[0]?.version).toBe('p:MAIN.md=f:v2')
  })

  it('keeps the files of a package in the order of their paths, whatever order they are listed in', async () => {
    const s = await setup()
    for (const name of ['m', 'z', 'a']) s.t.write(`/a/.omne/gadgets/lamp/${name}.md`, name)
    const read = await s.adopt('turn-1')
    if (read.kind !== 'adopted') throw new Error(read.kind)
    expect(read.reading.packages[0]?.entries.map(entry => entry.path)).toEqual([
      'a.md',
      'm.md',
      'z.md',
    ])
  })

  it('a pass that cannot be read ends the reading, even when the next one could be read', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    s.t.break('/a/.omne/gadgets/lamp')
    // One layout, two roots: two listings a pass. The third is the first of the second pass.
    s.t.during(3, () => s.t.mend('/a/.omne/gadgets/lamp'))
    const first = await s.adopt('turn-1')
    if (first.kind !== 'adopted') throw new Error(first.kind)
    expect(first.fresh).toBe(false)
    expect(first.reason).toBe('.omne/gadgets/lamp cannot be read')
  })

  it('a third pass that cannot be read gives its own reason', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    s.t.during(3, () => s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2'))
    s.t.during(5, () => s.t.break('/a/.omne/gadgets/lamp'))
    const kept = await s.adopt('turn-1')
    if (kept.kind !== 'adopted') throw new Error(kept.kind)
    expect(kept.reason).toBe('.omne/gadgets/lamp cannot be read')
  })
})

describe('adopting the sources for a key (C6)', () => {
  it('a tenant with no relation is not permitted, and nothing is recorded for the key', async () => {
    const s = await setup()
    expect(await s.adopt('turn-1', [GADGETS], BOB)).toEqual({ kind: 'not-permitted' })
    expect(await s.w.store.adoption(tenantOf(BOB.tenant), 'turn-1')).toEqual({
      kind: 'read',
      value: null,
    })
  })

  it('a store that cannot be read answers unavailable and records nothing', async () => {
    const s = await setup()
    s.w.store.fail('unreadable')
    expect(await s.adopt('turn-1')).toEqual({ kind: 'unavailable', diagnostic: 'store' })
    s.w.store.fail('none')
    expect(await s.sources.adopted(ALICE, { key: 'turn-1' })).toEqual({ kind: 'none' })
  })

  it('keeps the last reading, or the empty one, with the reason, when the instance cannot be used', async () => {
    const s = await setup()
    s.w.things.things.get('/a')!.state = 'gone'
    const empty = await s.adopt('turn-1')
    expect(empty).toMatchObject({
      kind: 'adopted',
      fresh: false,
      reading: { revision: 0, packages: [] },
    })
    if (empty.kind === 'adopted') expect(empty.reason).toMatch(/cannot be used now/u)

    s.w.things.things.get('/a')!.state = 'present'
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    const read = await s.adopt('turn-2')
    s.w.things.things.get('/a')!.state = 'gone'
    const kept = await s.adopt('turn-3')
    if (read.kind !== 'adopted' || kept.kind !== 'adopted') throw new Error('not adopted')
    expect(kept).toMatchObject({ fresh: false, reading: read.reading })
  })

  it('counts a reading only when it differs from the last one', async () => {
    const s = await setup()
    const revision = async () =>
      (await s.w.store.sourceRevision(tenantOf(ALICE.tenant), workspaceOf(s.made.workspace))) as {
        value: number
      }
    const start = (await revision()).value
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    const first = await s.adopt('turn-1')
    expect((await revision()).value).toBe(start + 1)
    const same = await s.adopt('turn-2')
    expect((await revision()).value).toBe(start + 1)
    if (first.kind !== 'adopted' || same.kind !== 'adopted') throw new Error('not adopted')
    expect(same.reading.revision).toBe(first.reading.revision)
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2')
    const changed = await s.adopt('turn-3')
    expect((await revision()).value).toBe(start + 2)
    if (changed.kind === 'adopted') expect(changed.reading.revision).toBe(start + 2)
  })

  it('takes a recorded key back without reading again, whatever changed since', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    const first = await s.adopt('turn-1')
    const listed = s.t.listings()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2')
    expect(await s.adopt('turn-1')).toEqual(first)
    s.w.things.things.get('/a')!.state = 'gone'
    expect(await s.adopt('turn-1')).toEqual(first)
    expect(s.t.listings()).toBe(listed)
    expect(await s.sources.adopted(ALICE, { key: 'turn-1' })).toEqual(first)
  })

  it('a recorded key reads nothing once the relation ends, or while the store cannot be read', async () => {
    const s = await setup()
    await s.w.governance.grantParticipation(ALICE, {
      operation: op('grant'),
      workspace: s.target.workspace,
      target: BOB.tenant,
    })
    expect((await s.adopt('turn-1', [GADGETS], BOB)).kind).toBe('adopted')
    s.w.store.fail('unreadable')
    expect((await s.adopt('turn-1', [GADGETS], BOB)).kind).toBe('unavailable')
    s.w.store.fail('none')
    await s.w.governance.remove(ALICE, {
      operation: op('remove'),
      workspace: s.target.workspace,
      target: BOB.tenant,
    })
    expect(await s.adopt('turn-1', [GADGETS], BOB)).toEqual({ kind: 'not-permitted' })
    expect(await s.sources.adopted(BOB, { key: 'turn-1' })).toEqual({
      kind: 'not-permitted',
    })
  })

  it('a key whose answer was lost is taken back by the same key', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    s.w.store.fail('lost')
    expect(await s.adopt('turn-1')).toEqual({ kind: 'unavailable', diagnostic: 'store' })
    s.w.store.fail('none')
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2')
    const taken = await s.adopt('turn-1')
    if (taken.kind !== 'adopted') throw new Error(taken.kind)
    expect(taken.reading.packages[0]?.version).toBe('p:MAIN.md=f:v1')
  })
})

describe('reading a file of an adopted package', () => {
  const at = { category: 'gadget', name: 'lamp', root: 'shared', path: 'MAIN.md' } as const

  it('answers the bytes of the file the reading recorded, and changed once it is not that file', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    const input = { key: 'turn-1', at: { ...at, digest: 'f:v1' } }
    const read = await s.sources.open(ALICE, input)
    expect(read.kind === 'bytes' && text(read.bytes)).toBe('v1')
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v2')
    expect(await s.sources.open(ALICE, input)).toEqual({ kind: 'changed' })
    s.t.remove('/a/.omne/gadgets/lamp')
    expect(await s.sources.open(ALICE, input)).toEqual({ kind: 'changed' })
  })

  it('answers not found for a file, a package or a key the reading does not have', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    const open = (key: string, more: object) =>
      s.sources.open(ALICE, { key, at: { ...at, digest: 'f:v1', ...more } })
    expect(await open('turn-1', { path: 'OTHER.md' })).toEqual({ kind: 'not-found' })
    expect(await open('turn-1', { name: 'fan' })).toEqual({ kind: 'not-found' })
    expect(await open('turn-1', { digest: 'f:v0' })).toEqual({ kind: 'not-found' })
    expect(await open('turn-2', {})).toEqual({ kind: 'not-found' })
  })

  it("a key is the caller's own: another tenant finds nothing under it", async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    const input = { key: 'turn-1', at: { ...at, digest: 'f:v1' } }
    expect(await s.sources.open(BOB, input)).toEqual({ kind: 'not-found' })
    expect(await s.sources.adopted(BOB, { key: 'turn-1' })).toEqual({ kind: 'none' })
  })

  it('is not permitted to an access whose tenant is no tenant, whatever its key', async () => {
    const s = await setup()
    await s.adopt('turn-1')
    const nobody = { ...ALICE, tenant: {} as never }
    expect(await s.sources.adopted(nobody, { key: 'turn-1' })).toEqual({ kind: 'not-permitted' })
  })

  it('a key given again with another workspace answers the reading it was given first', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    s.w.things.put('/b', { kinds: ['plain'] })
    const b = await s.w.governance.register(ALICE, { operation: op('register-b'), address: '/b' })
    if (b.kind !== 'done') throw new Error(JSON.stringify(b))
    const first = await s.adopt('turn-1')
    const target = { workspace: b.value.workspace, instance: b.value.instance }
    const again = await s.sources.adopt(ALICE, { ...target, key: 'turn-1', layouts: [GADGETS] })
    expect(again).toEqual(first)
    expect(again.kind === 'adopted' && again.reading.workspace).toEqual(s.target.workspace)
    const input = { key: 'turn-1', at: { ...at, digest: 'f:v1' } }
    const read = await s.sources.open(ALICE, input)
    expect(read.kind === 'bytes' && text(read.bytes)).toBe('v1')
  })

  it('reads nothing recorded for a caller no longer admitted, at whichever check it is refused', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    const input = { key: 'turn-1', at: { ...at, digest: 'f:v1' } }
    s.w.authority.admits(() => 'denied')
    expect(await s.sources.adopted(ALICE, { key: 'turn-1' })).toEqual({
      kind: 'not-permitted',
    })
    expect(await s.sources.open(ALICE, input)).toEqual({ kind: 'not-permitted' })
    let asked = 0
    s.w.authority.admits(() => (asked++ === 0 ? 'allowed' : 'denied'))
    expect(await s.sources.open(ALICE, input)).toEqual({ kind: 'not-permitted' })
  })
})

describe('what the sources answer when something on the way fails', () => {
  it('a reading that agrees is read in two passes, no more', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    // One layout, two roots: two listings a pass.
    expect(s.t.listings()).toBe(4)
  })

  it('keeps the last reading when a package cannot be read, or the roots cannot be listed at all', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    const first = await s.adopt('turn-1')
    s.t.break('/a/.omne/gadgets/lamp')
    const kept = await s.adopt('turn-2')
    if (first.kind !== 'adopted' || kept.kind !== 'adopted') throw new Error('not adopted')
    expect(kept).toMatchObject({ fresh: false, reading: first.reading })
    expect(kept.reason).toBe('.omne/gadgets/lamp cannot be read')
    s.t.throwing()
    const thrown = await s.adopt('turn-3')
    expect(thrown).toMatchObject({ kind: 'adopted', fresh: false })
    if (thrown.kind === 'adopted')
      expect(thrown.reason).toMatch(/cannot be read: Error: the disk is gone/u)
  })

  it('is not permitted for a workspace that is no workspace, a caller not admitted, or an instance not of it', async () => {
    const s = await setup()
    const layouts = [GADGETS]
    expect(
      await s.sources.adopt(ALICE, {
        ...s.target,
        workspace: 'nothing' as never,
        key: 'k',
        layouts,
      }),
    ).toEqual({ kind: 'not-permitted' })
    const before = s.w.authority.asked().length
    s.w.authority.admits(() => 'denied')
    expect(await s.adopt('turn-1')).toEqual({ kind: 'not-permitted' })
    expect(s.w.authority.asked().slice(before)[0]).toEqual({
      action: 'workspace.attach',
      target: workspaceOf(s.made.workspace),
    })
    s.w.authority.admits(() => 'allowed')
    const other = { ...s.target, instance: 'wsi_00000000000000000000000099' as never }
    expect(await s.sources.adopt(ALICE, { ...other, key: 'turn-2', layouts })).toEqual({
      kind: 'not-permitted',
    })
    expect(await s.sources.adopted(ALICE, { key: 'turn-2' })).toEqual({ kind: 'none' })
  })

  it('answers unavailable and records nothing when the type cannot look at the instance', async () => {
    const s = await setup()
    s.w.things.things.get('/a')!.state = 'unreadable'
    expect((await s.adopt('turn-1')).kind).toBe('unavailable')
    s.w.things.things.get('/a')!.state = 'present'
    expect(await s.sources.adopted(ALICE, { key: 'turn-1' })).toEqual({ kind: 'none' })
  })

  it('answers unavailable when the adoption cannot be read though the workspace can', async () => {
    const s = await setup(store => ({
      ...store,
      adoption: async () => ({ kind: 'unavailable' }) as const,
    }))
    expect(await s.adopt('turn-1')).toEqual({ kind: 'unavailable', diagnostic: 'store' })
  })

  it('is not permitted when the relation ends between the read and the commit, and records nothing', async () => {
    const s = await setup()
    await s.w.governance.grantParticipation(ALICE, {
      operation: op('grant'),
      workspace: s.target.workspace,
      target: BOB.tenant,
    })
    s.w.store.interleave(async () => {
      await s.w.governance.remove(ALICE, {
        operation: op('remove'),
        workspace: s.target.workspace,
        target: BOB.tenant,
      })
    })
    expect(await s.adopt('turn-1', [GADGETS], BOB)).toEqual({ kind: 'not-permitted' })
    expect(await s.w.store.adoption(tenantOf(BOB.tenant), 'turn-1')).toEqual({
      kind: 'read',
      value: null,
    })
  })

  it('keeps, for another instance, the reading made on the first one, and counts a new one there', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    const onA = await s.adopt('turn-1')
    s.w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    const added = await s.w.instances.associate(ALICE, {
      operation: op('associate-b'),
      workspace: s.target.workspace,
      address: '/b',
    })
    if (added.kind !== 'done') throw new Error(JSON.stringify(added))
    const layouts = [GADGETS]
    const b = { workspace: s.target.workspace, instance: added.value.instance }
    s.w.things.things.get('/b')!.state = 'gone'
    const kept = await s.sources.adopt(ALICE, { ...b, key: 'turn-2', layouts })
    if (onA.kind !== 'adopted' || kept.kind !== 'adopted') throw new Error('not adopted')
    expect(kept.reading.instance).toBe(s.target.instance)
    expect(kept.reading.revision).toBe(onA.reading.revision)
    s.w.things.things.get('/b')!.state = 'present'
    s.t.write('/b/.omne/gadgets/lamp/MAIN.md', 'v1')
    const onB = await s.sources.adopt(ALICE, { ...b, key: 'turn-3', layouts })
    if (onB.kind !== 'adopted') throw new Error(onB.kind)
    expect(onB.reading.instance).toBe(added.value.instance)
    expect(onB.reading.revision).toBe(onA.reading.revision + 1)
  })
})

describe('reading a file when something on the way fails', () => {
  const at = { category: 'gadget', name: 'lamp', root: 'shared', path: 'MAIN.md' } as const

  it('finds the file by its category and root too', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    const open = (more: object) =>
      s.sources.open(ALICE, { key: 'turn-1', at: { ...at, digest: 'f:v1', ...more } })
    expect(await open({ root: 'local' })).toEqual({ kind: 'not-found' })
    expect(await open({ category: 'widget' })).toEqual({ kind: 'not-found' })
  })

  it('answers changed for an empty file that was taken away, and unavailable for one that cannot be read', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    s.t.write('/a/.omne/gadgets/lamp/EMPTY.md', '')
    await s.adopt('turn-1')
    const input = (path: string, digest: string) => ({
      workspace: s.target.workspace,
      key: 'turn-1',
      at: { ...at, path, digest },
    })
    s.t.remove('/a/.omne/gadgets/lamp/EMPTY.md')
    expect(await s.sources.open(ALICE, input('EMPTY.md', 'f:'))).toEqual({ kind: 'changed' })
    s.t.break('/a/.omne/gadgets/lamp/MAIN.md')
    expect(await s.sources.open(ALICE, input('MAIN.md', 'f:v1'))).toEqual({
      kind: 'unavailable',
      diagnostic: 'files',
    })
  })

  it('answers changed once the instance it was read from cannot be used', async () => {
    const s = await setup()
    s.t.write('/a/.omne/gadgets/lamp/MAIN.md', 'v1')
    await s.adopt('turn-1')
    s.w.things.things.get('/a')!.state = 'gone'
    const input = { key: 'turn-1', at: { ...at, digest: 'f:v1' } }
    expect(await s.sources.open(ALICE, input)).toEqual({ kind: 'changed' })
    s.w.things.things.get('/a')!.state = 'unreadable'
    expect((await s.sources.open(ALICE, input)).kind).toBe('unavailable')
  })
})
