import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantManagement,
  digestBytes,
  pinBody,
  readBodyText,
  type BodyContract,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { createTenantLayerStore } from '../src/layer-store.ts'
import { createTenantPublisher } from '../src/tenant-publisher.ts'
import { openWorld, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const display = { title: 'Test', summary: 'A category that exists only in these tests.' }
const NOTE_SUMMARY = { title: 'A note', description: 'One sentence.', facts: [] }

function category(name: string, directory: boolean): BodyContract {
  return {
    category: name,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(directory
      ? {
          layout: {
            namespace: `${name}s`,
            limits: { files: 4, fileBytes: 64, totalBytes: 128 },
            inspect: async () => ({ ok: { kind: 'object', entries: [] } }),
          },
        }
      : { summarize: () => NOTE_SUMMARY }),
  }
}

function id(name: string, capability: string): CapabilityId {
  const made = capabilityId(name, capability)
  if (!made.ok) throw new Error('identity')
  return made.id
}

function read(text: string): JsonValue {
  const result = readBodyText(text, {
    maxBytes: 64,
    maxDepth: 2,
    maxItems: 4,
    maxMembers: 4,
    maxStringLength: 32,
    maxNumberLength: 8,
  })
  if (result.kind !== 'ok') throw new Error('body')
  return result.value
}

const encoder = new TextEncoder()
function files(content: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(Object.entries(content).map(([path, text]) => [path, encoder.encode(text)]))
  return {
    async manifest() {
      return {
        ok: {
          entries: [...bytes].map(([path, data]) => ({
            path,
            bytes: data.length,
            digest: digestBytes(data),
          })),
        },
      }
    },
    async open(path) {
      const data = bytes.get(path)
      return data === undefined ? { failure: 'entry-not-found' } : { ok: data }
    },
  }
}

type Principal = Readonly<{ tenant: string }>
const ALICE = { tenant: 'tenant-a', principal: { tenant: 'tenant-a' } } as const

async function world() {
  const categories = createCategoryPoint()
  categories.contribute({ contract: category('note', false), display })
  categories.contribute({ contract: category('bundle', true), display })
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'assets-management-')))
  const opened = await openWorld({ categories, packageRoot })
  worlds.push(opened)
  const publisher = createTenantPublisher(opened.owner, 'tenant-a')
  const management = createTenantManagement<Principal>({
    acting: {
      admit: async ({ principal, tenant }) => (principal.tenant === tenant ? 'admitted' : 'denied'),
    },
    categories,
    storeOf: async tenant =>
      tenant === 'tenant-a'
        ? createTenantLayerStore(opened.owner, 'tenant-a', categories)
        : undefined,
  })
  async function publish(
    name: string,
    text = '{"a":1}',
    operationId = `publish-${name}-${Buffer.from(text).toString('hex')}`,
  ) {
    const outcome = await publisher.publish({
      operationId,
      capability: id('note', name),
      content: { kind: 'data', body: read(text) },
    })
    if (outcome.kind !== 'published') throw new Error(JSON.stringify(outcome))
    return outcome.holdingRef
  }
  async function names(category = 'note') {
    const page = await management.list({ ...ALICE, category, after: null, limit: 10 })
    if (page.kind !== 'page') throw new Error(JSON.stringify(page))
    return page.items.map(item => `${item.capability.name}:${item.enabled ? 'on' : 'off'}`)
  }
  return { ...opened, publisher, management, publish, names }
}

describe('the management service over the local assets of a tenant', () => {
  it('lists the held assets of one category with their holding, origin and summary; disabled ones in, removed ones out', async () => {
    const w = await world()
    const a = await w.publish('a')
    await w.publish('b')
    const c = await w.publish('c')
    await w.management.setEnabled({
      ...ALICE,
      operationId: 'disable-a',
      holding: a,
      enabled: false,
    })
    await w.management.remove({ ...ALICE, operationId: 'remove-c', holding: c })
    const page = await w.management.list({ ...ALICE, category: 'note', after: null, limit: 10 })
    expect(page).toMatchObject({
      kind: 'page',
      next: null,
      completeness: 'complete',
      items: [
        {
          capability: { name: 'a' },
          enabled: false,
          holding: a,
          origin: 'customized',
          summary: NOTE_SUMMARY,
        },
        { capability: { name: 'b' }, enabled: true, origin: 'customized' },
      ],
    })
  })

  it('refuses the principal of another tenant on every method, and says nothing of the asset', async () => {
    const w = await world()
    const a = await w.publish('a')
    const bob = { tenant: 'tenant-a', principal: { tenant: 'tenant-b' } }
    expect(await w.management.list({ ...bob, category: 'note', after: null, limit: 10 })).toEqual({
      kind: 'denied',
    })
    expect(await w.management.describe({ ...bob, capability: id('note', 'a') })).toEqual({
      kind: 'denied',
    })
    expect(await w.management.remove({ ...bob, operationId: 'remove', holding: a })).toEqual({
      kind: 'denied',
    })
    expect(await w.names()).toEqual(['a:on'])
  })

  it('describes a data asset with its body, and a directory asset with its files, without their bytes', async () => {
    const w = await world()
    await w.publish('a', '{"a":7}')
    expect(await w.management.describe({ ...ALICE, capability: id('note', 'a') })).toMatchObject({
      kind: 'asset',
      revision: 1,
      content: { kind: 'data', body: read('{"a":7}') },
      standing: { kind: 'selected' },
      settings: false,
      row: { summary: NOTE_SUMMARY, origin: 'customized' },
    })
    await w.publisher.publish({
      operationId: 'publish-bundle',
      capability: id('bundle', 'b'),
      content: { kind: 'directory', from: files({ 'README.md': 'hello', 'docs/a.txt': 'abc' }) },
    })
    expect(await w.management.describe({ ...ALICE, capability: id('bundle', 'b') })).toMatchObject({
      kind: 'asset',
      content: {
        kind: 'directory',
        entries: [
          { path: 'README.md', bytes: 5 },
          { path: 'docs/a.txt', bytes: 3 },
        ],
      },
      row: { summary: null },
    })
  })

  it('a disabled asset is described as filtered out for being disabled; a removed one is absent', async () => {
    const w = await world()
    const a = await w.publish('a')
    await w.management.setEnabled({ ...ALICE, operationId: 'off', holding: a, enabled: false })
    expect(await w.management.describe({ ...ALICE, capability: id('note', 'a') })).toMatchObject({
      standing: { kind: 'filtered', reason: 'disabled' },
    })
    await w.management.remove({ ...ALICE, operationId: 'gone', holding: a })
    expect(await w.management.describe({ ...ALICE, capability: id('note', 'a') })).toEqual({
      kind: 'absent',
    })
  })

  it('disable, enable and remove answer as table two says, and every read sees the new state', async () => {
    const w = await world()
    const a = await w.publish('a')
    const change = (operationId: string, enabled: boolean) =>
      w.management.setEnabled({ ...ALICE, operationId, holding: a, enabled })
    expect(await change('off-1', false)).toEqual({ kind: 'changed' })
    expect(await w.names()).toEqual(['a:off'])
    expect(await change('off-2', false)).toEqual({ kind: 'no-change' })
    expect(await change('on-1', true)).toEqual({ kind: 'changed' })
    expect(await w.management.remove({ ...ALICE, operationId: 'rm-1', holding: a })).toEqual({
      kind: 'changed',
    })
    expect(await w.names()).toEqual([])
    expect(await change('on-2', true)).toEqual({ kind: 'not-writable', reason: 'removed' })
    expect(await w.management.remove({ ...ALICE, operationId: 'rm-2', holding: a })).toEqual({
      kind: 'no-change',
    })
    expect(
      await w.management.setEnabled({
        ...ALICE,
        operationId: 'x',
        holding: 'held-none',
        enabled: false,
      }),
    ).toEqual({
      kind: 'absent',
    })
  })

  it('the same operation sent again answers its first receipt; with another input it is an operation conflict', async () => {
    const w = await world()
    const a = await w.publish('a')
    const off = { ...ALICE, operationId: 'off', holding: a, enabled: false }
    expect(await w.management.setEnabled(off)).toEqual({ kind: 'changed' })
    expect(await w.management.setEnabled(off)).toEqual({ kind: 'changed' })
    expect(await w.management.setEnabled({ ...off, enabled: true })).toEqual({
      kind: 'operation-conflict',
    })
    expect(await w.management.remove({ ...ALICE, operationId: 'off', holding: a })).toEqual({
      kind: 'operation-conflict',
    })
    expect(await w.names()).toEqual(['a:off'])
  })

  it('a holding the deployment installed is official: it is listed, but not disabled or removed', async () => {
    const w = await world()
    await w.owner.publish({
      operationId: 'deploy-publish',
      assetRef: 'note/d',
      expectedRevision: 0,
      pinned: pinBody({
        identity: id('note', 'd'),
        version: 'v1',
        source: 'deploy',
        body: read('1'),
      }),
    })
    await w.owner.hold({
      operationId: 'deploy-hold',
      holdingRef: 'deployment.note.d',
      scopeRef: 'tenant-a',
      assetRef: 'note/d',
      selection: { kind: 'pinned', version: 'v1' },
      sources: [
        {
          sourceId: 'deploy',
          ownerRef: 'deployment',
          scope: { kind: 'tenant', subjectRef: 'tenant-a' },
        },
      ],
      grants: [],
    })
    const holding = 'deployment.note.d'
    expect(
      await w.management.list({ ...ALICE, category: 'note', after: null, limit: 10 }),
    ).toMatchObject({
      items: [{ holding, origin: 'official' }],
    })
    expect(
      await w.management.setEnabled({ ...ALICE, operationId: 'off', holding, enabled: false }),
    ).toEqual({
      kind: 'not-writable',
      reason: 'official',
    })
    expect(await w.management.remove({ ...ALICE, operationId: 'rm', holding })).toEqual({
      kind: 'not-writable',
      reason: 'official',
    })
    expect(await w.names()).toEqual(['d:on'])
  })

  it('the old reference of a holding removed and created again never reaches the new one', async () => {
    const w = await world()
    const old = await w.publish('a', '{"a":1}')
    await w.management.remove({ ...ALICE, operationId: 'rm', holding: old })
    const fresh = await w.publish('a', '{"a":2}')
    expect(fresh).not.toBe(old)
    expect(
      await w.management.setEnabled({
        ...ALICE,
        operationId: 'off-old',
        holding: old,
        enabled: false,
      }),
    ).toEqual({
      kind: 'not-writable',
      reason: 'removed',
    })
    expect(await w.management.remove({ ...ALICE, operationId: 'rm-old', holding: old })).toEqual({
      kind: 'no-change',
    })
    expect(await w.names()).toEqual(['a:on'])
  })

  it('an unregistered category is unknown-category; a cursor that is no name is invalid', async () => {
    const w = await world()
    expect(
      await w.management.list({ ...ALICE, category: 'nobody', after: null, limit: 10 }),
    ).toEqual({
      kind: 'unknown-category',
    })
    expect(await w.management.list({ ...ALICE, category: 'note', after: '', limit: 10 })).toEqual({
      kind: 'invalid',
    })
  })
})
