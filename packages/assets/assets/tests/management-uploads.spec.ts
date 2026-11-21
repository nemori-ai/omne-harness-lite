import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantManagement,
  isReadBody,
  type BodyContract,
  type CapabilityId,
  type PackageReader,
  type StorePublication,
  type StoreUploads,
  type TenantLayerStore,
  type TenantPublishOutcome,
  type TenantPublishRequest,
} from '@omne-harness/assets'

type Principal = Readonly<{ tenant: string }>

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('identity')
  return made.id
}

const base = {
  schema: { kind: 'null' },
  judge: () => ({ ok: true }) as const,
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
} as const
const directory: BodyContract = {
  ...base,
  category: 'bundle',
  layout: {
    namespace: 'bundles',
    limits: { files: 2, fileBytes: 8, totalBytes: 16 },
    inspect: async () => ({ ok: { kind: 'null' } }),
  },
}
const display = { title: 'T', summary: 'S.' }

const BUNDLE = id('bundle', 'docs')
const ENTRIES = [{ path: 'README.md', bytes: 5 }]
const READER: PackageReader = {
  manifest: async () => ({ ok: { entries: [] } }),
  open: async () => ({ failure: 'entry-not-found' }),
}
const PUBLISHED: TenantPublishOutcome = {
  kind: 'published',
  version: 'v1',
  holdingRef: 'held-1',
  changed: true,
}

type Options = {
  publication?: StorePublication | 'throws'
  reader?: Awaited<ReturnType<StoreUploads['reader']>>
  publish?: TenantPublishOutcome | 'throws'
  uploads?: Partial<StoreUploads>
  recall?: Awaited<ReturnType<TenantLayerStore['recall']>>
}

function setup(options: Options = {}) {
  const categories = createCategoryPoint()
  categories.contribute({ contract: directory, display })
  categories.contribute({ contract: { ...base, category: 'note' }, display })
  categories.contribute({
    contract: {
      ...directory,
      category: 'tool',
      layout: { ...directory.layout!, namespace: 'tools' },
    },
    display,
    generalCreation: 'closed',
  })
  const published: TenantPublishRequest<Principal>[] = []
  const discarded: string[] = []
  const calls: string[] = []
  const uploads: StoreUploads = {
    async begin(input) {
      calls.push(`begin ${input.operationId}`)
      return { kind: 'accepted', partBytes: 4, received: [{ path: 'README.md', bytes: 0 }] }
    },
    resume: async () => ({ kind: 'absent' }),
    async append(input) {
      calls.push(`append ${input.path}@${input.offset}`)
      return { kind: 'received', bytes: input.offset + input.bytes.length }
    },
    async reader(operationId) {
      calls.push(`reader ${operationId}`)
      return options.reader ?? { kind: 'ready', capability: BUNDLE, from: READER }
    },
    async discard(operationId) {
      discarded.push(operationId)
    },
    ...options.uploads,
  }
  const store: TenantLayerStore = {
    list: async () => ({ kind: 'invalid' }),
    held: async () => ({ kind: 'absent' }),
    holding: async () => ({ kind: 'absent' }),
    change: async () => ({ kind: 'unknown' }),
    recall: async () => options.recall ?? { kind: 'not-found' },
    async recallPublication(operationId) {
      calls.push(`recall ${operationId}`)
      if (options.publication === 'throws') throw new Error('the receipts cannot be read')
      return options.publication ?? { kind: 'not-found' }
    },
    uploads,
    layer: {
      layer: 'tenant',
      list: async () => ({ state: 'invalid' }),
      candidates: async () => ({ layer: 'tenant', state: 'unavailable' }),
    },
  }
  const management = createTenantManagement<Principal>({
    acting: {
      admit: async input => (input.principal.tenant === input.tenant ? 'admitted' : 'denied'),
    },
    categories,
    publishing: {
      async publish(request) {
        published.push(request)
        if (options.publish === 'throws') throw new Error('the reply was lost')
        return options.publish ?? PUBLISHED
      },
    },
    storeOf: async () => store,
  })
  return { management, published, discarded, calls }
}

const scope = { tenant: 'alice', principal: { tenant: 'alice' } } as const
const other = { tenant: 'alice', principal: { tenant: 'mallory' } } as const

describe('creating from data', () => {
  it('hands the body to the publishing service under the operation', async () => {
    const s = setup()
    const body = { kind: 'null' } as const
    expect(
      await s.management.createFromData({
        ...scope,
        operationId: 'op-1',
        capability: id('note', 'a'),
        body,
      }),
    ).toEqual(PUBLISHED)
    expect(s.published).toEqual([
      {
        ...scope,
        operationId: 'op-1',
        capability: id('note', 'a'),
        content: { kind: 'data', body },
      },
    ])
  })

  it('a body from outside is read first: the publisher gets a read copy; a malformed one is refused and nothing is published', async () => {
    const s = setup()
    const body = { kind: 'object', entries: [{ key: 'a', value: { kind: 'string', value: 'x' } }] }
    await s.management.createFromData({
      ...scope,
      operationId: 'op-1',
      capability: id('note', 'a'),
      body: body as never,
    })
    const sent = s.published[0]?.content
    expect(sent?.kind === 'data' && isReadBody(sent.body)).toBe(true)
    expect(sent).toEqual({ kind: 'data', body })
    expect(
      await s.management.createFromData({
        ...scope,
        operationId: 'op-2',
        capability: id('note', 'a'),
        body: { kind: 'string' } as never,
      }),
    ).toEqual({ kind: 'invalid', reason: 'body-not-read' })
    expect(s.published).toHaveLength(1)
  })

  it('a publishing service that throws leaves the outcome unknown', async () => {
    const s = setup({ publish: 'throws' })
    expect(
      await s.management.createFromData({
        ...scope,
        operationId: 'op-1',
        capability: id('note', 'a'),
        body: { kind: 'null' },
      }),
    ).toEqual({ kind: 'unknown', operationId: 'op-1' })
  })
})

describe('beginning an upload', () => {
  const begin = (capability = BUNDLE, who: typeof scope | typeof other = scope) => ({
    ...who,
    operationId: 'up-1',
    capability,
    entries: ENTRIES,
  })

  it('a principal who may not act for the tenant is denied and nothing is begun', async () => {
    const s = setup()
    expect(await s.management.beginUpload(begin(BUNDLE, other))).toEqual({ kind: 'denied' })
    expect(s.calls).toEqual([])
  })

  it.each([
    ['a category not there', id('gone', 'x'), { kind: 'unknown-category' }],
    [
      'a category closed to general creation',
      id('tool', 'x'),
      { kind: 'invalid', reason: 'creation-closed' },
    ],
    ['a data category', id('note', 'x'), { kind: 'invalid', reason: 'not-a-directory-category' }],
  ])('%s is refused before the store', async (_label, capability, answer) => {
    const s = setup()
    expect(await s.management.beginUpload(begin(capability))).toEqual(answer)
    expect(s.calls).toEqual([])
  })

  it('a directory category is begun in the store, and its answer passes through', async () => {
    const s = setup()
    expect(await s.management.beginUpload(begin())).toEqual({
      kind: 'accepted',
      partBytes: 4,
      received: [{ path: 'README.md', bytes: 0 }],
    })
    expect(s.calls).toEqual(['begin up-1'])
  })

  it('a store that throws answers unavailable', async () => {
    const s = setup({
      uploads: {
        begin: async () => {
          throw new Error('disk')
        },
      },
    })
    expect(await s.management.beginUpload(begin())).toEqual({ kind: 'unavailable' })
  })
})

describe('appending to an upload', () => {
  const part = (who: typeof scope | typeof other = scope) => ({
    ...who,
    operationId: 'up-1',
    path: 'README.md',
    offset: 0,
    bytes: new TextEncoder().encode('hel'),
  })

  it('passes the part to the store and answers what it received', async () => {
    const s = setup()
    expect(await s.management.appendUpload(part())).toEqual({ kind: 'received', bytes: 3 })
  })

  it('a principal who may not act for the tenant is denied and nothing is written', async () => {
    const s = setup()
    expect(await s.management.appendUpload(part(other))).toEqual({ kind: 'denied' })
    expect(s.calls).toEqual([])
  })

  it('a store that throws answers unavailable', async () => {
    const s = setup({
      uploads: {
        append: async () => {
          throw new Error('disk')
        },
      },
    })
    expect(await s.management.appendUpload(part())).toEqual({ kind: 'unavailable' })
  })
})

describe('committing an upload: table one, third row', () => {
  const commit = (who: typeof scope | typeof other = scope) => ({ ...who, operationId: 'up-1' })

  it('a receipt under the operation is the answer: nothing is read or published again', async () => {
    const s = setup({
      publication: {
        kind: 'published',
        capability: BUNDLE,
        version: 'v1',
        holdingRef: 'held-1',
        changed: false,
      },
    })
    expect(await s.management.createFromUpload(commit())).toEqual({
      kind: 'published',
      version: 'v1',
      holdingRef: 'held-1',
      changed: false,
    })
    expect(s.calls).toEqual(['recall up-1'])
    expect(s.published).toEqual([])
  })

  it('a refused receipt is answered as it was refused', async () => {
    const s = setup({ publication: { kind: 'conflict' } })
    expect(await s.management.createFromUpload(commit())).toEqual({ kind: 'conflict' })
    expect(s.published).toEqual([])
  })

  it.each([
    ['no upload', { kind: 'absent' }],
    ['an upload not collected', { kind: 'incomplete', missing: ['README.md'] }],
    ['a store that cannot read it', { kind: 'unavailable' }],
  ] as const)(
    'without a receipt, %s is the answer and nothing is published',
    async (_label, reader) => {
      const s = setup({ reader })
      expect(await s.management.createFromUpload(commit())).toEqual(reader)
      expect(s.published).toEqual([])
    },
  )

  it('a collected upload is published as a directory of its own capability, then discarded', async () => {
    const s = setup()
    expect(await s.management.createFromUpload(commit())).toEqual(PUBLISHED)
    expect(s.calls).toEqual(['recall up-1', 'reader up-1'])
    expect(s.published).toEqual([
      {
        ...scope,
        operationId: 'up-1',
        capability: BUNDLE,
        content: { kind: 'directory', from: READER },
      },
    ])
    expect(s.discarded).toEqual(['up-1'])
  })

  it.each([
    ['refused', { kind: 'invalid', reason: 'bad' }],
    ['unknown', { kind: 'unknown', operationId: 'up-1' }],
  ] as const)('a publication %s keeps the upload', async (_label, outcome) => {
    const s = setup({ publish: outcome })
    expect(await s.management.createFromUpload(commit())).toEqual(outcome)
    expect(s.discarded).toEqual([])
  })

  it('a publication that throws is unknown, and the upload is kept', async () => {
    const s = setup({ publish: 'throws' })
    expect(await s.management.createFromUpload(commit())).toEqual({
      kind: 'unknown',
      operationId: 'up-1',
    })
    expect(s.discarded).toEqual([])
  })

  it('a discard that fails does not change the outcome', async () => {
    const s = setup({
      uploads: {
        discard: async () => {
          throw new Error('disk')
        },
      },
    })
    expect(await s.management.createFromUpload(commit())).toEqual(PUBLISHED)
  })

  it('receipts that cannot be read answer unavailable', async () => {
    const s = setup({ publication: 'throws' })
    expect(await s.management.createFromUpload(commit())).toEqual({ kind: 'unavailable' })
  })

  it('a principal who may not act for the tenant is denied before any receipt is read', async () => {
    const s = setup()
    expect(await s.management.createFromUpload(commit(other))).toEqual({ kind: 'denied' })
    expect(s.calls).toEqual([])
  })
})

describe('recalling an operation', () => {
  const recall = (
    request: Parameters<ReturnType<typeof setup>['management']['recall']>[0]['request'],
  ) => ({
    ...scope,
    operationId: 'op-1',
    request,
  })
  const receipt: StorePublication = {
    kind: 'published',
    capability: id('note', 'a'),
    version: 'v1',
    holdingRef: 'held-1',
    changed: true,
  }

  it('a creation answers its receipt, or an operation conflict when it was another capability', async () => {
    const s = setup({ publication: receipt })
    expect(
      await s.management.recall(recall({ kind: 'create', capability: id('note', 'a') })),
    ).toEqual(PUBLISHED)
    expect(
      await s.management.recall(recall({ kind: 'create', capability: id('note', 'b') })),
    ).toEqual({
      kind: 'operation-conflict',
    })
    expect(s.published).toEqual([])
  })

  it('a creation without a receipt was not committed, whatever is staged under its operation', async () => {
    const s = setup({ reader: { kind: 'absent' } })
    expect(
      await s.management.recall(recall({ kind: 'create', capability: id('note', 'a') })),
    ).toEqual({
      kind: 'not-committed',
    })
    expect(s.calls).toEqual(['recall op-1'])
  })

  it.each([
    ['still staged and collected', undefined, { kind: 'not-committed' }],
    [
      'still staged and not collected',
      { kind: 'incomplete', missing: ['a'] } as const,
      { kind: 'not-committed' },
    ],
    ['not staged', { kind: 'absent' } as const, { kind: 'absent' }],
    ['unreadable', { kind: 'unavailable' } as const, { kind: 'unavailable' }],
  ])('a commit without a receipt, %s, answers %j', async (_label, reader, answer) => {
    const s = setup(reader === undefined ? {} : { reader })
    expect(await s.management.recall(recall({ kind: 'commit' }))).toEqual(answer)
    expect(s.published).toEqual([])
  })

  it('a begin answers what the store resumes, and one not there was not committed', async () => {
    const accepted = {
      kind: 'accepted',
      partBytes: 4,
      received: [{ path: 'README.md', bytes: 2 }],
    } as const
    const begin = { kind: 'begin', capability: BUNDLE, entries: ENTRIES } as const
    expect(await setup().management.recall(recall(begin))).toEqual({ kind: 'not-committed' })
    const s = setup({ uploads: { resume: async () => accepted } })
    expect(await s.management.recall(recall(begin))).toEqual(accepted)
    expect(s.calls).toEqual([])
  })

  it.each([
    ['setEnabled', { kind: 'setEnabled', holding: 'held-1', enabled: false } as const],
    ['remove', { kind: 'remove', holding: 'held-1' } as const],
  ])('%s answers its receipt, or not committed without one', async (_label, request) => {
    expect(await setup().management.recall(recall(request))).toEqual({ kind: 'not-committed' })
    const s = setup({ recall: { kind: 'committed', changed: false } })
    expect(await s.management.recall(recall(request))).toEqual({ kind: 'no-change' })
  })

  it('a principal who may not act for the tenant is denied; receipts that throw are unavailable', async () => {
    const s = setup()
    expect(
      await s.management.recall({ ...other, operationId: 'op-1', request: { kind: 'commit' } }),
    ).toEqual({ kind: 'denied' })
    const t = setup({ publication: 'throws' })
    expect(await t.management.recall(recall({ kind: 'commit' }))).toEqual({ kind: 'unavailable' })
  })
})
