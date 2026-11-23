import { describe, expect, it } from 'vitest'
import { capabilityId, readBodyText, type CapabilityId } from '@omne-harness/assets'
import { createTenantLayerStore } from '../src/layer-store.ts'
import type { AssetsLocal } from '../src/types.ts'

const id = (category: string, name: string): CapabilityId => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('fixture capability')
  return made.id
}

const HOLDING = {
  assetRef: 'asset-1',
  holdingRef: 'held-1',
  selection: { kind: 'pinned' },
  enabled: true,
  state: 'active',
  revision: 3,
  sourceLayout: [],
}

const LISTED = {
  category: 'note',
  name: 'a',
  assetRef: 'asset-1',
  version: 'v1',
  selection: 'pinned',
  enabled: true,
  holdingRef: 'held-1',
  origin: 'official',
  summary: null,
}

/** The tenant layer over a local store that answers what the case says, for the one method it calls. */
function storeOver(
  answers: Partial<Record<keyof AssetsLocal, unknown>>,
  category: 'directory' | 'data' | 'unknown' = 'data',
) {
  const local = Object.fromEntries(
    Object.entries(answers).map(([method, answer]) => [method, async () => answer]),
  ) as unknown as AssetsLocal
  const looked = { directory: { layout: {} }, data: {}, unknown: undefined }[category]
  const categories = { lookup: () => looked } as never
  return createTenantLayerStore(local, 'tenant-a', categories, [])
}

const LIST = { scopeRef: 'tenant-a', limit: 10, after: null } as never
const CHANGE = {
  operationId: 'op-1',
  holdingRef: 'held-1',
  expectedRevision: 3,
  change: { kind: 'enable', enabled: false },
} as never

describe('the tenant layer over the local store', () => {
  it('lists held rows as the tenant layer; a refused list is invalid only for invalid input', async () => {
    const page = await storeOver({
      listHeld: { kind: 'page', items: [LISTED], next: null },
    }).list(LIST)
    expect(page).toMatchObject({ kind: 'page', items: [{ layer: 'tenant', holding: 'held-1' }] })
    expect(
      await storeOver({ listHeld: { kind: 'rejected', reason: 'invalid_input' } }).list(LIST),
    ).toEqual({ kind: 'invalid' })
    expect(
      await storeOver({ listHeld: { kind: 'rejected', reason: 'unavailable' } }).list(LIST),
    ).toEqual({ kind: 'unavailable' })
  })

  it('reads one held capability: its row, content by the category layout, and whether it has settings', async () => {
    const answers = (definitionRef: unknown) => ({
      readHeldCapability: {
        kind: 'holding',
        holding: HOLDING,
        selected: { version: 'v1', body: { text: 'hi' }, definitionRef },
      },
      readSummary: { kind: 'summary', summary: null },
    })
    expect(await storeOver(answers(null)).held(id('note', 'a'))).toMatchObject({
      kind: 'held',
      row: { layer: 'tenant', holding: 'held-1', version: 'v1' },
      content: { kind: 'data', body: { text: 'hi' } },
      settings: false,
    })
    const withSettings = await storeOver(answers({ providerId: 'p' })).held(id('note', 'a'))
    expect(withSettings).toMatchObject({ kind: 'held', settings: true })
  })

  it('shows a manifest as its files only in a category with a layout; a category it cannot find is data', async () => {
    const manifest = readBodyText(
      JSON.stringify({ manifest: { entries: [{ path: 'SKILL.md', bytes: 3, digest: 'd' }] } }),
      {
        maxBytes: 1000,
        maxDepth: 8,
        maxItems: 8,
        maxMembers: 8,
        maxStringLength: 100,
        maxNumberLength: 10,
      },
    )
    if (manifest.kind !== 'ok') throw new Error('fixture body')
    const answers = {
      readHeldCapability: {
        kind: 'holding',
        holding: HOLDING,
        selected: { version: 'v1', body: manifest.value, definitionRef: null },
      },
      readSummary: { kind: 'summary', summary: null },
    }
    expect(await storeOver(answers, 'directory').held(id('note', 'a'))).toMatchObject({
      content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 3 }] },
    })
    expect(await storeOver(answers, 'data').held(id('note', 'a'))).toMatchObject({
      content: { kind: 'data' },
    })
    expect(await storeOver(answers, 'unknown').held(id('note', 'a'))).toMatchObject({
      content: { kind: 'data' },
    })
  })

  it.each([
    [
      'a refused read',
      { readHeldCapability: { kind: 'rejected', reason: 'unavailable' } },
      'unavailable',
    ],
    ['no holding', { readHeldCapability: { kind: 'absent' } }, 'absent'],
    [
      'a holding with nothing selected',
      { readHeldCapability: { kind: 'holding', holding: HOLDING, selected: null } },
      'absent',
    ],
    [
      'a summary that cannot be read',
      {
        readHeldCapability: {
          kind: 'holding',
          holding: HOLDING,
          selected: { version: 'v1', body: {}, definitionRef: null },
        },
        readSummary: { kind: 'rejected', reason: 'unavailable' },
      },
      'unavailable',
    ],
  ] as const)('reads %s of one held capability as %s', async (_case, answers, kind) => {
    expect(await storeOver(answers).held(id('note', 'a'))).toEqual({ kind })
  })

  it('reads a holding; a refused read is unavailable', async () => {
    expect(
      await storeOver({
        readHolding: { kind: 'holding', holding: HOLDING, selected: null },
      }).holding('held-1'),
    ).toEqual({ kind: 'holding', state: 'active', enabled: true, origin: 'official', revision: 3 })
    expect(
      await storeOver({ readHolding: { kind: 'rejected', reason: 'unavailable' } }).holding(
        'held-1',
      ),
    ).toEqual({ kind: 'unavailable' })
  })

  it.each([
    [
      { kind: 'committed', changed: true },
      { kind: 'committed', changed: true },
    ],
    [{ kind: 'unknown' }, { kind: 'unknown' }],
    [{ kind: 'not_found' }, { kind: 'unavailable' }],
    [{ kind: 'rejected', reason: 'revision_conflict' }, { kind: 'conflict' }],
    [{ kind: 'rejected', reason: 'holding_removed' }, { kind: 'conflict' }],
    [{ kind: 'rejected', reason: 'missing_definition' }, { kind: 'conflict' }],
    [{ kind: 'rejected', reason: 'operation_conflict' }, { kind: 'operation-conflict' }],
    [{ kind: 'rejected', reason: 'unavailable' }, { kind: 'unavailable' }],
  ] as const)('answers a change the store answered %j as %j', async (answer, expected) => {
    expect(await storeOver({ changeHolding: answer }).change(CHANGE)).toEqual(expected)
  })

  it('recalls a change it does not know as not found, and one not known yet as unknown', async () => {
    expect(await storeOver({ recallChange: { kind: 'not_found' } }).recall(CHANGE)).toEqual({
      kind: 'not-found',
    })
    expect(await storeOver({ recallChange: { kind: 'unknown' } }).recall(CHANGE)).toEqual({
      kind: 'unknown',
    })
  })

  it.each([
    [
      {
        kind: 'published',
        category: 'note',
        name: 'a',
        version: 'v1',
        holdingRef: 'held-1',
        changed: true,
      },
      {
        kind: 'published',
        capability: id('note', 'a'),
        version: 'v1',
        holdingRef: 'held-1',
        changed: true,
      },
    ],
    [{ kind: 'not_found' }, { kind: 'not-found' }],
    [{ kind: 'unknown' }, { kind: 'unknown' }],
  ] as const)('recalls a publication the store answered %j as %j', async (answer, expected) => {
    expect(await storeOver({ recallPublication: answer }).recallPublication('op-1')).toEqual(
      expected,
    )
  })
})

const PUBLISHED = {
  kind: 'publishAndHold',
  operationId: 'op-1',
  category: 'note',
  name: 'a',
  version: 'v2',
  holding: { holdingRef: 'held-1', scopeRef: 'tenant-a' },
}
const DISABLED = {
  kind: 'changeHolding',
  operationId: 'op-1',
  holdingRef: 'held-1',
  scopeRef: 'tenant-a',
  change: { kind: 'setEnabled', enabled: false },
}
const COMMITTED = { kind: 'committed', operationId: 'op-1', revision: 2, changed: true }
const recorded = (command: object, result: object = COMMITTED) => ({
  kind: 'recorded',
  command,
  result,
})
const HELD_A = { kind: 'holding', holding: { category: 'note', name: 'a' }, selected: null }

describe('an operation recalled by its id alone', () => {
  it('a publication and hold answers its capability, version and outcome', async () => {
    expect(await storeOver({ readOperation: recorded(PUBLISHED) }).recallById('op-1')).toEqual({
      kind: 'publish',
      capability: id('note', 'a'),
      version: 'v2',
      outcome: { kind: 'published', version: 'v2', holdingRef: 'held-1', changed: true },
    })
  })

  it('a publication that was refused answers the refusal as a publish outcome', async () => {
    const refused = recorded(PUBLISHED, { kind: 'rejected', reason: 'version_conflict' })
    expect(await storeOver({ readOperation: refused }).recallById('op-1')).toMatchObject({
      kind: 'publish',
      outcome: { kind: 'conflict' },
    })
  })

  it('a change of enablement or a removal reads its capability from the holding', async () => {
    expect(
      await storeOver({ readOperation: recorded(DISABLED), readHolding: HELD_A }).recallById(
        'op-1',
      ),
    ).toEqual({
      kind: 'change',
      holding: 'held-1',
      capability: id('note', 'a'),
      change: { kind: 'setEnabled', enabled: false },
      answer: { kind: 'committed', changed: true },
    })
    const removal = recorded(
      { ...DISABLED, change: { kind: 'remove' } },
      { kind: 'rejected', reason: 'revision_conflict' },
    )
    expect(
      await storeOver({ readOperation: removal, readHolding: HELD_A }).recallById('op-1'),
    ).toMatchObject({ change: { kind: 'remove' }, answer: { kind: 'conflict' } })
  })

  it.each([
    ['is absent', { kind: 'absent' }],
    ['cannot be read', { kind: 'rejected', reason: 'unavailable' }],
  ])('a change whose holding %s gives no capability', async (_, holding) => {
    expect(
      await storeOver({ readOperation: recorded(DISABLED), readHolding: holding }).recallById(
        'op-1',
      ),
    ).toMatchObject({ kind: 'change', capability: null })
  })

  it.each([
    ['nothing under the id', { kind: 'not_found' }],
    ['a change of another tenant', recorded({ ...DISABLED, scopeRef: 'tenant-b' })],
    [
      'a publication held for another tenant',
      recorded({ ...PUBLISHED, holding: { holdingRef: 'held-1', scopeRef: 'tenant-b' } }),
    ],
    ['a hold', recorded({ kind: 'hold', operationId: 'op-1' })],
    ['a publication not held', recorded({ kind: 'publish', operationId: 'op-1' })],
    [
      'another change of a holding',
      recorded({ ...DISABLED, change: { kind: 'selectVersion', selection: { kind: 'follow' } } }),
    ],
  ])('%s is not found', async (_, answer) => {
    expect(
      await storeOver({ readOperation: answer, readHolding: HELD_A }).recallById('op-1'),
    ).toEqual({ kind: 'not-found' })
  })

  it.each([
    ['a receipt not known', { kind: 'unknown', operationId: 'op-1' }],
    ['a refused read', { kind: 'rejected', reason: 'unavailable' }],
  ])('%s is unavailable', async (_, answer) => {
    expect(await storeOver({ readOperation: answer }).recallById('op-1')).toEqual({
      kind: 'unavailable',
    })
  })
})
