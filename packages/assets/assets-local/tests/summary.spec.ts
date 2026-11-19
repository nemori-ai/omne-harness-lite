import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  readBodyText,
  type AssetSummary,
  type BodyContract,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { createTenantPublisher } from '../src/tenant-publisher.ts'
import { openWorld, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const display = { title: 'Test', summary: 'A category that exists only in these tests.' }

function category(
  name: string,
  summarize: BodyContract['summarize'] | undefined,
  directory = false,
): BodyContract {
  return {
    category: name,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(summarize === undefined ? {} : { summarize }),
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

function entries(body: JsonValue): number {
  if (body.kind !== 'object') return -1
  const manifest = body.entries.find(entry => entry.key === 'manifest')?.value
  if (manifest?.kind !== 'object') return -1
  const list = manifest.entries.find(entry => entry.key === 'entries')?.value
  return list?.kind === 'array' ? list.items.length : -1
}

const NOTE: AssetSummary = { title: 'A note', description: 'One sentence.', facts: [] }

async function world() {
  const categories = createCategoryPoint()
  categories.contribute({ contract: category('note', () => NOTE), display })
  categories.contribute({ contract: category('plain', undefined), display })
  categories.contribute({
    contract: category('versioned', (_, context) => ({
      title: 'versioned',
      description: context?.definition ?? '',
      facts: [],
    })),
    display,
  })
  categories.contribute({
    contract: category('broken', () => {
      throw new Error('summarize is broken')
    }),
    display,
  })
  categories.contribute({
    contract: category(
      'bundle',
      body => ({
        title: 'A bundle',
        description: 'Files.',
        facts: [{ name: 'files', text: String(entries(body)) }],
      }),
      true,
    ),
    display,
  })
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'assets-summary-')))
  const opened = await openWorld({ categories, packageRoot })
  worlds.push(opened)
  return { ...opened, publisher: createTenantPublisher(opened.owner, 'tenant-a') }
}

async function listedSummary(w: Awaited<ReturnType<typeof world>>, category: string) {
  const page = await w.owner.listHeld({ category, after: null, limit: 10 })
  if (page.kind !== 'page') throw new Error(page.kind)
  return page.items.map(item => item.summary)
}

describe('the asset summary of a published version', () => {
  it('is derived at publish by the category and listed with the holding', async () => {
    const w = await world()
    const outcome = await w.publisher.publish({
      operationId: 'publish-note',
      capability: id('note', 'a'),
      content: { kind: 'data', body: read('{"a":1}') },
    })
    expect(outcome).toMatchObject({ kind: 'published', changed: true })
    expect(await listedSummary(w, 'note')).toEqual([NOTE])
  })

  it('of a directory version is computed from the record body, which carries the manifest', async () => {
    const w = await world()
    const outcome = await w.publisher.publish({
      operationId: 'publish-bundle',
      capability: id('bundle', 'b'),
      content: { kind: 'directory', from: files({ 'a.txt': 'a', 'b/c.txt': 'c' }) },
    })
    expect(outcome).toMatchObject({ kind: 'published', changed: true })
    expect(await listedSummary(w, 'bundle')).toEqual([
      { title: 'A bundle', description: 'Files.', facts: [{ name: 'files', text: '2' }] },
    ])
  })

  it('is absent when the category supplies no summarize', async () => {
    const w = await world()
    await w.publisher.publish({
      operationId: 'publish-plain',
      capability: id('plain', 'a'),
      content: { kind: 'data', body: read('{"a":1}') },
    })
    expect(await listedSummary(w, 'plain')).toEqual([null])
  })

  it('is absent when summarize throws, and the publish goes through', async () => {
    const w = await world()
    const outcome = await w.publisher.publish({
      operationId: 'publish-broken',
      capability: id('broken', 'a'),
      content: { kind: 'data', body: read('{"a":1}') },
    })
    expect(outcome).toMatchObject({ kind: 'published', changed: true })
    expect(await listedSummary(w, 'broken')).toEqual([null])
  })

  it('belongs to its version: a following holding lists the summary of the version it follows', async () => {
    const w = await world()
    const versions: string[] = []
    for (const [operationId, text] of [
      ['publish-1', '{"a":1}'],
      ['publish-2', '{"a":2}'],
    ] as const) {
      const outcome = await w.publisher.publish({
        operationId,
        capability: id('versioned', 'a'),
        content: { kind: 'data', body: read(text) },
      })
      if (outcome.kind !== 'published') throw new Error(outcome.kind)
      versions.push(outcome.version)
    }
    expect(await listedSummary(w, 'versioned')).toEqual([
      { title: 'versioned', description: versions[1], facts: [] },
    ])
  })
})
