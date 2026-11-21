import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  evaluate,
  refusal,
  type BodyContract,
  MAX_ASSET_PAGE,
  type Candidate,
  type JsonValue,
  type PackageLayout,
} from '@omne-harness/assets'
import { createManagementTypes, createSources } from '@omne-harness/workspace'
import {
  createMemoryStore,
  fakeAccess,
  fakeAuthority,
  fakeMinting,
  fakeWorld,
} from '@omne-harness/workspace/testing'
import { operationId, type OperationId } from '@omne-harness/workspace-contract'
import { localSourceFiles } from '@omne-harness/workspace-filesystem'
import {
  assetDigests,
  layoutsOf,
  workspaceAssetRef,
  workspaceBody,
  workspaceLayerSource,
  workspaceReader,
} from '../src/index.ts'

const ALICE = fakeAccess(1)
const BOB = fakeAccess(2)
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const body = (name: string, said: string): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'name', value: { kind: 'string', value: name } },
    { key: 'text', value: { kind: 'string', value: said } },
  ],
})
/** What the layout declared: the body without the manifest the package is recorded with. */
const declared = (value: unknown) => {
  const tree = value as JsonValue | undefined
  if (tree?.kind !== 'object') return value
  return { ...tree, entries: tree.entries.filter(entry => entry.key !== 'manifest') }
}
const nameIn = (value: unknown): string | undefined => {
  const tree = value as JsonValue
  const found =
    tree.kind === 'object' ? tree.entries.find(entry => entry.key === 'name') : undefined
  return found?.value.kind === 'string' ? found.value.value : undefined
}

/** A directory category made up for this test: no workspace member knows it, nor any other. */
const gadgetLayout: PackageLayout = {
  namespace: 'gadgets',
  limits: { files: 8, fileBytes: 1024, totalBytes: 4096 },
  async inspect(pkg) {
    const manifest = await pkg.manifest()
    if (!('ok' in manifest))
      return { failure: { kind: 'source-failed', failure: manifest.failure } }
    const main = manifest.ok.entries.find(entry => entry.path === 'GADGET.md')
    if (main === undefined) return { failure: { kind: 'invalid-package', reason: 'no GADGET.md' } }
    const read = await pkg.open(main.path, main.digest)
    if (!('ok' in read)) return { failure: { kind: 'source-failed', failure: read.failure } }
    const [first, ...rest] = text(read.ok).split('\n')
    return { ok: body(first?.replace('name: ', '') ?? '', rest.join('\n')) }
  },
}
const gadget: BodyContract = {
  category: 'gadget',
  schema: { kind: 'null' } as JsonValue,
  judge(read, context) {
    const name = nameIn(read)
    if (context?.capabilityName !== undefined && name !== context.capabilityName)
      return refusal('name-mismatch')
    return { ok: true }
  },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  layout: gadgetLayout,
}

function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-layer-')))
  const write = (path: string, content: string) => {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return { root, write }
}

async function setup(contracts: readonly BodyContract[] = [gadget]) {
  const things = fakeWorld()
  const authority = fakeAuthority()
  const store = createMemoryStore()
  const types = createManagementTypes()
  types.contribute(things.type('plain'))
  const deps = { authority, store, types, minting: fakeMinting(), node: 'node-1' }
  const sources = createSources({ ...deps, files: localSourceFiles, digests: assetDigests })
  const p = project()
  things.put(p.root, { kinds: ['plain'] })
  const { createGovernance } = await import('@omne-harness/workspace')
  const governance = createGovernance(deps)
  const made = await governance.register(ALICE, {
    operation: operationId('register') as OperationId,
    address: p.root,
  })
  if (made.kind !== 'done') throw new Error(JSON.stringify(made))
  const { workspace, instance } = made.value
  const adopt = (key: string, access = ALICE) =>
    sources.adopt(access, { workspace, instance, key, layouts: layoutsOf(contracts) })
  const layer = (key: string, access = ALICE, using: typeof sources = sources) => {
    const input = {
      sources: using,
      access,
      key,
      contractOf: (category: string) => contracts.find(each => each.category === category),
    }
    return {
      source: workspaceLayerSource(input),
      body: workspaceBody(input),
      reader: workspaceReader(input),
    }
  }
  return { p, adopt, layer, governance, workspace, things, sources }
}

const op = (name: string) => operationId(name) as OperationId
const lamp = capabilityId('gadget', 'lamp')
if (!lamp.ok) throw new Error('capability')
/** A second directory category whose packages may share a name with the gadgets. */
const widget: BodyContract = {
  ...gadget,
  category: 'widget',
  layout: { ...gadgetLayout, namespace: 'widgets' },
}

describe('a category made up for the test goes through without a line of the workspace changed (C7)', () => {
  it('is found, evaluated, given its body and read, from the package under .omne', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    expect((await s.adopt('turn-1')).kind).toBe('adopted')
    const l = s.layer('turn-1')
    const layer = await l.source.candidates(lamp.id)
    expect(layer).toMatchObject({ layer: 'workspace', state: 'read' })
    if (layer.state !== 'read') throw new Error(layer.state)
    expect(layer.candidates.map(each => each.asset)).toEqual(['workspace/shared/gadget/lamp'])
    const won = evaluate({ layers: [layer], eligible: () => 'yes' })
    if (won.kind !== 'winner') throw new Error(won.kind)
    const read = await l.body(won.candidate)
    expect(declared(read)).toEqual(body('lamp', 'A lamp.'))
    expect(JSON.stringify(read)).toContain('"key":"manifest"')
    const reader = l.reader({ assetRef: won.candidate.asset, version: won.candidate.version })
    const manifest = await reader.manifest()
    if (!('ok' in manifest)) throw new Error('manifest')
    const [entry] = manifest.ok.entries
    const opened = await reader.open(entry!.path, entry!.digest)
    expect('ok' in opened && text(opened.ok)).toBe('name: lamp\nA lamp.')
    expect(won.candidate.version).toBe(assetDigests.package(manifest.ok.entries))
  })

  it('does not make a candidate of a package whose directory and declared name differ', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: torch\nNot a lamp.')
    await s.adopt('turn-1')
    expect(await s.layer('turn-1').source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'read',
      candidates: [],
    })
  })

  it('gives the local package first, and a local one left out does not hide the shared one', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nshared')
    s.p.write('.omne.local/gadgets/lamp/GADGET.md', 'name: lamp\nlocal')
    await s.adopt('turn-1')
    const l = s.layer('turn-1')
    const layer = await l.source.candidates(lamp.id)
    if (layer.state !== 'read') throw new Error(layer.state)
    expect(layer.candidates.map(each => each.asset)).toEqual([
      'workspace/local/gadget/lamp',
      'workspace/shared/gadget/lamp',
    ])
    const first = evaluate({ layers: [layer], eligible: () => 'yes' })
    expect(first.kind === 'winner' && first.candidate.asset).toBe('workspace/local/gadget/lamp')
    const local = (candidate: Candidate) => candidate.asset.includes('/local/')
    const shared = evaluate({ layers: [layer], eligible: c => (local(c) ? 'no' : 'yes') })
    expect(shared.kind === 'winner' && declared(await l.body(shared.candidate))).toEqual(
      body('lamp', 'shared'),
    )
  })

  it('reads as not applicable for a category with no layout, or a key with no adoption', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    await s.adopt('turn-1')
    const other = capabilityId('widget', 'knob')
    if (!other.ok) throw new Error('capability')
    expect(await s.layer('turn-1').source.candidates(other.id)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
    expect(await s.layer('turn-2').source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
  })

  it('reads nothing once the relation ends: the layer is unavailable, not empty', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    const target = { workspace: s.workspace, target: BOB.tenant }
    await s.governance.grantParticipation(ALICE, { operation: op('grant'), ...target })
    await s.adopt('turn-b', BOB)
    expect((await s.layer('turn-b', BOB).source.candidates(lamp.id)).state).toBe('read')
    await s.governance.remove(ALICE, { operation: op('remove'), ...target })
    expect(await s.layer('turn-b', BOB).source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'unavailable',
    })
    const page = { category: 'gadget', after: null, limit: 2 }
    expect(await s.layer('turn-b', BOB).source.list(page)).toEqual({
      layer: 'workspace',
      state: 'unavailable',
    })
    // A key is its tenant's own: another tenant has no adoption under it.
    expect(await s.layer('turn-b').source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
  })

  it('answers material unavailable for a file changed after the turn adopted it', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    await s.adopt('turn-1')
    const l = s.layer('turn-1')
    const layer = await l.source.candidates(lamp.id)
    if (layer.state !== 'read') throw new Error(layer.state)
    const [candidate] = layer.candidates
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nChanged.')
    const reader = l.reader({ assetRef: candidate!.asset, version: candidate!.version })
    const manifest = await reader.manifest()
    if (!('ok' in manifest)) throw new Error('manifest')
    const [entry] = manifest.ok.entries
    expect(await reader.open(entry!.path, entry!.digest)).toEqual({
      failure: 'material-unavailable',
    })
    expect(await l.body(candidate!)).toBeUndefined()
    expect(await l.reader({ assetRef: candidate!.asset, version: 'other' }).manifest()).toEqual({
      failure: 'package-not-found',
    })
  })

  it('leaves out a package its layout refuses, or that declares no object, and reads the layer', async () => {
    const odd: BodyContract = {
      ...gadget,
      category: 'odd',
      judge: () => ({ ok: true }),
      layout: {
        ...gadgetLayout,
        namespace: 'odds',
        inspect: async () => ({ ok: { kind: 'null' } }),
      },
    }
    const s = await setup([gadget, odd])
    s.p.write('.omne/gadgets/lamp/OTHER.md', 'no GADGET.md here')
    s.p.write('.omne/odds/lamp/ANY.md', 'anything')
    await s.adopt('turn-1')
    const l = s.layer('turn-1')
    expect(await l.source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'read',
      candidates: [],
    })
    const oddLamp = capabilityId('odd', 'lamp')
    if (!oddLamp.ok) throw new Error('capability')
    expect(await l.source.candidates(oddLamp.id)).toEqual({
      layer: 'workspace',
      state: 'read',
      candidates: [],
    })
  })

  it('reads the layer as unavailable for a package the turn adopted that cannot be read now, never as gone', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    s.p.write('.omne/gadgets/fan/GADGET.md', 'name: fan\nA fan.')
    s.p.write('.omne/gadgets/torch/GADGET.md', 'name: other\nNot a torch.')
    await s.adopt('turn-1')
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nChanged.')
    const source = s.layer('turn-1').source
    expect(await source.candidates(lamp.id)).toEqual({ layer: 'workspace', state: 'unavailable' })
    const fan = capabilityId('gadget', 'fan')
    if (!fan.ok) throw new Error('capability')
    expect((await source.candidates(fan.id)).state).toBe('read')
    const page = await source.list({ category: 'gadget', after: null, limit: 10 })
    expect('page' in page && page.page.items.map(item => item.asset)).toEqual([
      'workspace/shared/gadget/fan',
      'workspace/shared/gadget/lamp',
    ])
  })

  it('lists the valid packages of a category by page, after the reference given', async () => {
    const s = await setup()
    for (const name of ['fan', 'lamp', 'torch'])
      s.p.write(`.omne/gadgets/${name}/GADGET.md`, `name: ${name}\n${name}`)
    s.p.write('.omne/gadgets/wrong/GADGET.md', 'name: right\nmismatch')
    await s.adopt('turn-1')
    const source = s.layer('turn-1').source
    const first = await source.list({ category: 'gadget', after: null, limit: 2 })
    if (!('page' in first)) throw new Error(JSON.stringify(first))
    expect(first.page.items.map(item => item.asset)).toEqual([
      'workspace/shared/gadget/fan',
      'workspace/shared/gadget/lamp',
    ])
    expect(first.page.next).toBe('workspace/shared/gadget/lamp')
    const second = await source.list({ category: 'gadget', after: first.page.next, limit: 2 })
    if (!('page' in second)) throw new Error(JSON.stringify(second))
    expect(second.page.items.map(item => item.asset)).toEqual(['workspace/shared/gadget/torch'])
    expect(second.page.next).toBeNull()
    expect(await source.list({ category: 'gadget', after: null, limit: 0 })).toEqual({
      state: 'invalid',
    })
  })
})

describe('the layouts the sources are handed', () => {
  it('are the directory categories registered, by their own namespace and limits', () => {
    const { layout: _layout, ...rest } = gadget
    const data: BodyContract = { ...rest, category: 'note' }
    expect(layoutsOf([gadget, data])).toEqual([
      { category: 'gadget', namespace: 'gadgets', limits: gadgetLayout.limits },
    ])
    expect(workspaceAssetRef({ root: 'local', category: 'gadget', name: 'lamp' })).toBe(
      'workspace/local/gadget/lamp',
    )
  })
})

describe('finding one package of the reading again', () => {
  async function three() {
    const s = await setup([gadget, widget])
    s.p.write('.omne/gadgets/fan/GADGET.md', 'name: fan\nfan')
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nshared')
    s.p.write('.omne.local/gadgets/lamp/GADGET.md', 'name: lamp\nlocal')
    s.p.write('.omne/widgets/lamp/GADGET.md', 'name: lamp\nwidget')
    await s.adopt('turn-1')
    return s
  }

  it('gives only the packages of the category and name asked, each as a plain candidate', async () => {
    const s = await three()
    const read = await s.layer('turn-1').source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    expect(read.candidates).toEqual([
      expect.objectContaining({ asset: 'workspace/local/gadget/lamp' }),
      {
        asset: 'workspace/shared/gadget/lamp',
        version: read.candidates[1]!.version,
        disabled: false,
        immutable: false,
        replaceLocked: false,
      },
    ])
  })

  it('reads the body and files of the package the reference names, not another', async () => {
    const s = await three()
    const l = s.layer('turn-1')
    const read = await l.source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const [local, shared] = read.candidates
    expect(declared(await l.body(shared!))).toEqual(body('lamp', 'shared'))
    expect(declared(await l.body(local!))).toEqual(body('lamp', 'local'))
    const reader = l.reader({ assetRef: local!.asset, version: local!.version })
    const manifest = await reader.manifest()
    if (!('ok' in manifest)) throw new Error('manifest')
    const [entry] = manifest.ok.entries
    const opened = await reader.open(entry!.path, entry!.digest)
    expect('ok' in opened && text(opened.ok)).toBe('name: lamp\nlocal')
  })

  it('answers package not found for a reference that is not one of this layer', async () => {
    const s = await three()
    const l = s.layer('turn-1')
    const read = await l.source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const version = read.candidates[1]!.version
    for (const assetRef of [
      'other/shared/gadget/lamp',
      'workspace/shared/gadget/lamp/more',
      'workspace/shared/gadget',
      'workspace/nowhere/gadget/lamp',
    ])
      expect(await l.reader({ assetRef, version }).manifest()).toEqual({
        failure: 'package-not-found',
      })
    const other = { ...read.candidates[1]!, version: 'other' }
    expect(await l.body(other)).toBeUndefined()
    const reader = l.reader({ assetRef: other.asset, version: 'other' })
    expect(await reader.open('GADGET.md', 'any')).toEqual({ failure: 'package-not-found' })
    const none = s.layer('turn-2')
    expect(await none.body(read.candidates[1]!)).toBeUndefined()
    expect(await none.reader({ assetRef: other.asset, version }).manifest()).toEqual({
      failure: 'package-not-found',
    })
  })

  it('reads the files of that very package when others have the same version', async () => {
    const s = await setup([gadget, widget])
    const same = 'name: lamp\nsame'
    for (const path of ['.omne/gadgets/fan', '.omne/gadgets/lamp', '.omne.local/gadgets/lamp'])
      s.p.write(`${path}/GADGET.md`, same)
    s.p.write('.omne/widgets/lamp/GADGET.md', same)
    await s.adopt('turn-1')
    const l = s.layer('turn-1')
    const read = await l.source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const { version } = read.candidates[1]!
    const open = async (assetRef: string) => {
      const reader = l.reader({ assetRef, version })
      const manifest = await reader.manifest()
      if (!('ok' in manifest)) throw new Error('manifest')
      return reader.open('GADGET.md', manifest.ok.entries[0]!.digest)
    }
    s.p.write('.omne/widgets/lamp/GADGET.md', 'name: lamp\nchanged')
    expect(await open('workspace/shared/widget/lamp')).toEqual({ failure: 'material-unavailable' })
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nchanged')
    expect(await open('workspace/shared/gadget/lamp')).toEqual({ failure: 'material-unavailable' })
    expect('ok' in (await open('workspace/local/gadget/lamp'))).toBe(true)
  })

  it('answers entry not found for a file the reading does not have at that digest', async () => {
    const s = await three()
    const l = s.layer('turn-1')
    const read = await l.source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const reader = l.reader({
      assetRef: read.candidates[1]!.asset,
      version: read.candidates[1]!.version,
    })
    expect(await reader.open('GADGET.md', 'not-its-digest')).toEqual({ failure: 'entry-not-found' })
    expect(await reader.open('OTHER.md', 'any')).toEqual({ failure: 'entry-not-found' })
  })
})

describe('a category taken away, a reading that cannot be had', () => {
  it('reads a category taken away after the turn adopted it as none', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    await s.adopt('turn-1')
    const read = await s.layer('turn-1').source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const input = {
      sources: s.sources,
      access: ALICE,
      key: 'turn-1',
      contractOf: () => undefined,
    }
    expect(await workspaceLayerSource(input).candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
    const page = { category: 'gadget', after: null, limit: 1 }
    expect(await workspaceLayerSource(input).list(page)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
    expect(await workspaceBody(input)(read.candidates[0]!)).toBeUndefined()
  })

  it('reads the layer as unavailable when the sources throw, and a file as unavailable when they cannot read it', async () => {
    const s = await setup()
    s.p.write('.omne/gadgets/lamp/GADGET.md', 'name: lamp\nA lamp.')
    await s.adopt('turn-1')
    const throwing = {
      ...s.sources,
      adopted: async () => {
        throw new Error('the store is gone')
      },
    }
    expect(await s.layer('turn-1', ALICE, throwing).source.candidates(lamp.id)).toEqual({
      layer: 'workspace',
      state: 'unavailable',
    })
    const read = await s.layer('turn-1').source.candidates(lamp.id)
    if (read.state !== 'read') throw new Error(read.state)
    const failing = {
      ...s.sources,
      open: async () => ({ kind: 'unavailable', diagnostic: 'files' }) as const,
    }
    const [candidate] = read.candidates
    const reader = s.layer('turn-1', ALICE, failing).reader({
      assetRef: candidate!.asset,
      version: candidate!.version,
    })
    expect(await reader.open('GADGET.md', 'any')).toEqual({ failure: 'unavailable' })
  })
})

describe('listing by page', () => {
  async function names() {
    const s = await setup()
    for (const name of ['fan', 'lamp', 'torch'])
      s.p.write(`.omne/gadgets/${name}/GADGET.md`, `name: ${name}\n${name}`)
    await s.adopt('turn-1')
    return s
  }

  it('gives one entry a page at the smallest page, and no next once the page holds the rest', async () => {
    const s = await names()
    const source = s.layer('turn-1').source
    const one = await source.list({ category: 'gadget', after: null, limit: 1 })
    if (!('page' in one)) throw new Error(JSON.stringify(one))
    expect(one).toEqual({
      layer: 'workspace',
      state: 'read',
      page: {
        items: [
          {
            capability: { category: 'gadget', name: 'fan' },
            layer: 'workspace',
            asset: 'workspace/shared/gadget/fan',
            version: one.page.items[0]!.version,
            selection: 'follow',
            enabled: true,
          },
        ],
        next: 'workspace/shared/gadget/fan',
        completeness: 'complete',
      },
    })
    const all = await source.list({ category: 'gadget', after: null, limit: 3 })
    expect('page' in all && all.page.next).toBeNull()
    expect('page' in all && all.page.items.length).toBe(3)
  })

  it('takes the largest page, and refuses one larger', async () => {
    const s = await names()
    const source = s.layer('turn-1').source
    const largest = await source.list({ category: 'gadget', after: null, limit: MAX_ASSET_PAGE })
    expect('page' in largest && largest.page.items.length).toBe(3)
    expect(
      await source.list({ category: 'gadget', after: null, limit: MAX_ASSET_PAGE + 1 }),
    ).toEqual({ state: 'invalid' })
  })

  it('lists nothing for a turn with no adoption', async () => {
    const s = await names()
    const page = { category: 'gadget', after: null, limit: 2 }
    expect(await s.layer('turn-2').source.list(page)).toEqual({
      layer: 'workspace',
      state: 'not-applicable',
    })
  })
})
