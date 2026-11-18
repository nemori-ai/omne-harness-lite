import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  pinBody,
  readBodyText,
  type BodyContract,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { createTenantPublisher, newHoldingRef } from '../src/tenant-publisher.ts'
import { openWorld, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const encoder = new TextEncoder()
const display = { title: 'Test', summary: 'A category that exists only in these tests.' }

function category(name: string, directory: boolean, accepts = true): BodyContract {
  return {
    category: name,
    schema: { kind: 'null' },
    judge: () => (accepts ? { ok: true } : { ok: false, rejected: 'refused' }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(directory
      ? {
          layout: {
            namespace: `${name}s`,
            limits: { files: 2, fileBytes: 16, totalBytes: 32 },
            inspect: async () => ({ ok: { kind: 'object', entries: [] } }),
          },
        }
      : {}),
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

async function world(packageRoot?: string) {
  const categories = createCategoryPoint()
  categories.contribute({ contract: category('note', false), display })
  categories.contribute({ contract: category('refused', false, false), display })
  categories.contribute({ contract: category('bundle', true), display })
  const opened = await openWorld({
    categories,
    ...(packageRoot === undefined ? {} : { packageRoot }),
  })
  worlds.push(opened)
  return { ...opened, publisher: createTenantPublisher(opened.owner, 'tenant-a') }
}

const root = () => realpathSync(mkdtempSync(join(tmpdir(), 'assets-tenant-publisher-')))

describe('the tenant publisher answers in the outcomes of the publish service', () => {
  it('数据型：发布并持有，持有引用由这次操作生成，版本是正文的摘要；同一操作再发认回', async () => {
    const w = await world()
    const content = { kind: 'data', body: read('{"a":1}') } as const
    const first = await w.publisher.publish({
      operationId: 'publish-1',
      capability: id('note', 'a'),
      content,
    })
    const minted = newHoldingRef('publish-1')
    expect(minted).toMatch(/^held-[0-9a-f]{32}$/)
    expect(first).toMatchObject({ kind: 'published', holdingRef: minted, changed: true })
    expect(await w.owner.readHolding({ holdingRef: minted, scopeRef: 'tenant-a' })).toMatchObject({
      kind: 'holding',
      holding: {
        assetRef: 'note/a',
        state: 'held',
        sourceLayout: [{ sourceId: 'tenant', scope: { kind: 'tenant', subjectRef: 'tenant-a' } }],
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      },
    })
    expect(
      await w.publisher.publish({ operationId: 'publish-1', capability: id('note', 'a'), content }),
    ).toEqual(first)
  })

  it('在持时再发布：新版本落在同一份持有上', async () => {
    const w = await world()
    const first = await w.publisher.publish({
      operationId: 'publish-1',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('1') },
    })
    const second = await w.publisher.publish({
      operationId: 'publish-2',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('2') },
    })
    expect(second).toMatchObject({ kind: 'published', changed: true })
    expect(second.kind === 'published' && first.kind === 'published').toBe(true)
    if (second.kind === 'published' && first.kind === 'published')
      expect(second.holdingRef).toBe(first.holdingRef)
  })

  it('同一操作标识、不同正文：operation-conflict', async () => {
    const w = await world()
    await w.publisher.publish({
      operationId: 'publish-1',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('1') },
    })
    expect(
      await w.publisher.publish({
        operationId: 'publish-1',
        capability: id('note', 'a'),
        content: { kind: 'data', body: read('2') },
      }),
    ).toEqual({ kind: 'operation-conflict' })
  })

  it('移除之后同名再发布：一份新的持有，引用不同，旧的那份仍是已移除', async () => {
    const w = await world()
    await w.publisher.publish({
      operationId: 'publish-1',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('1') },
    })
    const old = newHoldingRef('publish-1')
    await w.owner.changeHolding({
      operationId: 'remove',
      holdingRef: old,
      scopeRef: 'tenant-a',
      expectedRevision: 1,
      change: { kind: 'remove' },
    })
    const again = await w.publisher.publish({
      operationId: 'publish-2',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('2') },
    })
    expect(again).toEqual({
      kind: 'published',
      version: expect.any(String),
      holdingRef: newHoldingRef('publish-2'),
      changed: true,
    })
    expect(newHoldingRef('publish-2')).not.toBe(old)
    expect(await w.owner.readHolding({ holdingRef: old, scopeRef: 'tenant-a' })).toMatchObject({
      holding: { state: 'removed' },
    })
    expect(await w.owner.readHeldCapability({ capability: id('note', 'a') })).toMatchObject({
      holding: { holdingRef: newHoldingRef('publish-2'), state: 'held' },
    })
  })

  it('两个操作同时新建同名：恰好一个成功，另一个答 conflict；之后再发落在成功的那一份上', async () => {
    const w = await world()
    const both = await Promise.all(
      ['race-1', 'race-2'].map(operationId =>
        w.publisher.publish({
          operationId,
          capability: id('note', 'a'),
          content: { kind: 'data', body: read(operationId === 'race-1' ? '1' : '2') },
        }),
      ),
    )
    const kinds = both.map(outcome => outcome.kind).sort()
    expect(kinds).toEqual(['conflict', 'published'])
    const winner = both.find(outcome => outcome.kind === 'published')
    const next = await w.publisher.publish({
      operationId: 'after-race',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('3') },
    })
    expect(next).toMatchObject({
      kind: 'published',
      holdingRef: winner?.kind === 'published' ? winner.holdingRef : 'none',
    })
  })

  it('这个能力身份由部署持有：invalid、held-by-deployment，不写', async () => {
    const w = await world()
    await w.owner.publish({
      operationId: 'deploy-publish',
      assetRef: 'note/a',
      expectedRevision: 0,
      pinned: pinBody({
        identity: id('note', 'a'),
        version: 'v1',
        source: 'deploy',
        body: read('1'),
      }),
    })
    await w.owner.hold({
      operationId: 'deploy-hold',
      holdingRef: 'harness.preinstalled.note.a',
      scopeRef: 'tenant-a',
      assetRef: 'note/a',
      selection: { kind: 'pinned', version: 'v1' },
      sources: [
        {
          sourceId: 'deploy',
          ownerRef: 'harness-server.release',
          scope: { kind: 'tenant', subjectRef: 'tenant-a' },
        },
      ],
      grants: [{ sourceId: 'deploy', actions: ['set', 'clear'] }],
    })
    expect(
      await w.publisher.publish({
        operationId: 'publish-1',
        capability: id('note', 'a'),
        content: { kind: 'data', body: read('2') },
      }),
    ).toEqual({ kind: 'invalid', reason: 'held-by-deployment' })
  })

  it('判定不过、正文不是读过的：invalid', async () => {
    const w = await world()
    expect(
      await w.publisher.publish({
        operationId: 'publish-1',
        capability: id('refused', 'a'),
        content: { kind: 'data', body: read('1') },
      }),
    ).toEqual({ kind: 'invalid', reason: 'invalid-input' })
    expect(
      await w.publisher.publish({
        operationId: 'publish-2',
        capability: id('note', 'a'),
        content: { kind: 'data', body: { kind: 'null' } },
      }),
    ).toEqual({ kind: 'invalid', reason: 'body-not-read' })
  })

  it('目录型：发布并持有；超限 invalid；没有根目录 unavailable；读口读不出 unavailable', async () => {
    const w = await world(root())
    expect(
      await w.publisher.publish({
        operationId: 'publish-1',
        capability: id('bundle', 'b'),
        content: { kind: 'directory', from: files({ 'README.md': 'one' }) },
      }),
    ).toMatchObject({ kind: 'published', holdingRef: newHoldingRef('publish-1'), changed: true })
    expect(
      await w.publisher.publish({
        operationId: 'publish-2',
        capability: id('bundle', 'b'),
        content: { kind: 'directory', from: files({ a: '1', b: '2', c: '3' }) },
      }),
    ).toEqual({ kind: 'invalid', reason: 'limit-exceeded:files' })
    const broken: PackageReader = {
      manifest: async () => ({ failure: 'unavailable' }),
      open: async () => ({ failure: 'unavailable' }),
    }
    expect(
      await w.publisher.publish({
        operationId: 'publish-3',
        capability: id('bundle', 'b'),
        content: { kind: 'directory', from: broken },
      }),
    ).toEqual({ kind: 'unavailable' })
    const rootless = await world()
    expect(
      await rootless.publisher.publish({
        operationId: 'publish-1',
        capability: id('bundle', 'b'),
        content: { kind: 'directory', from: files({ 'README.md': 'one' }) },
      }),
    ).toEqual({ kind: 'unavailable' })
  })
})
