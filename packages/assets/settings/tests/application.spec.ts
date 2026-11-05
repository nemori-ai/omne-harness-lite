import { expect, it } from 'vitest'
import {
  createSettingsQueries,
  createSettingsCommands,
  defineSettings,
  type SettingsBasis,
  type SettingsReadPort,
  type SettingsCommitPort,
} from '../src/index.ts'

const declared = defineSettings({
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  groups: [
    {
      id: 'general',
      parentId: null,
      title: 'General',
      description: 'Common preferences',
      order: 0,
    },
  ],
  items: ['first', 'second'].map(id => ({
    id,
    groupId: 'general',
    category: 'preference',
    presentation: {
      title: id,
      description: 'Display help during use',
      impact: 'Used on the next read',
      clear: 'Use the outer value',
      adoption: 'next-read',
    },
    valueSchema: { type: 'boolean' },
    default: { kind: 'value', value: false },
    merge: 'override',
    sensitivity: 'ordinary',
  })),
})
if (declared.kind !== 'defined') throw new Error('invalid fixture')
const definition = declared.definition
const target = { policyId: 'independent', targetRef: 'service', scopeRef: 'tenant-a' }
const definitionRef = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  digest: 'a'.repeat(64),
}
const command = {
  protocol: 'settings/1',
  requestId: 'r1',
  operationId: 'o1',
  target,
  definitionRef,
  expectedRevision: 0,
  sourceId: 'tenant',
  itemId: 'first',
  action: { kind: 'set', value: true },
}
const view = {
  deploymentRef: 'deployment',
  mode: 'management',
  targets: [target],
  selectionRef: null,
}
const request = { view, filter: '', locale: 'en', pageSize: 1, cursor: null }
function fixture() {
  let denied = false
  let reads = 0
  const basis: SettingsBasis = {
    scopeKey: 'trusted-tenant-a',
    revision: '1',
    completeness: 'complete',
    unavailableProviders: [],
    views: [
      {
        target,
        definitionRef,
        definition,
        state: { revision: 0, sources: [{ id: 'tenant', values: [] }] },
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      },
    ],
  }
  const port: SettingsReadPort<object> = {
    read: async () => {
      reads++
      return denied ? { kind: 'rejected', reason: 'forbidden' } : basis
    },
  }
  return {
    queries: createSettingsQueries(port),
    basis,
    deny: () => {
      denied = true
    },
    reads: () => reads,
  }
}
it('paginates one deterministic view and rechecks access on every page', async () => {
  const f = fixture()
  const first = await f.queries.readCatalog({}, request)
  expect(first).toMatchObject({
    kind: 'catalog',
    entries: [{ item: { id: 'first' } }],
    nextCursor: { offset: 1 },
  })
  if (first.kind !== 'catalog') throw new Error('expected catalog')
  const second = await f.queries.readCatalog({}, { ...request, cursor: first.nextCursor })
  expect(second).toMatchObject({
    kind: 'catalog',
    entries: [{ item: { id: 'second' } }],
    nextCursor: null,
  })
  f.deny()
  expect(await f.queries.readCatalog({}, { ...request, cursor: first.nextCursor })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(f.reads()).toBe(3)
})
it('rejects changed basis, cross-scope cursors and changed filter', async () => {
  const f = fixture()
  const first = await f.queries.readCatalog({}, request)
  if (first.kind !== 'catalog') throw new Error('expected catalog')
  for (const cursor of [
    { ...first.nextCursor, revision: 'old' },
    { ...first.nextCursor, scopeKey: 'tenant-b' },
  ]) {
    expect(await f.queries.readCatalog({}, { ...request, cursor })).toEqual({
      kind: 'rejected',
      reason: 'basis_changed',
    })
  }
  expect(
    await f.queries.readCatalog({}, { ...request, filter: 'second', cursor: first.nextCursor }),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
})
it('requires explicit runtime selection without contacting the provider', async () => {
  const f = fixture()
  expect(await f.queries.evaluate({}, { ...view, mode: 'runtime' })).toEqual({
    kind: 'rejected',
    reason: 'invalid_input',
  })
  expect(f.reads()).toBe(0)
})
it('refuses incomplete runtime evaluation while retaining a partial management catalog', async () => {
  const f = fixture()
  const port: SettingsReadPort<object> = {
    read: async () => ({
      ...f.basis,
      completeness: 'partial',
      unavailableProviders: ['known-provider'],
    }),
  }
  const queries = createSettingsQueries(port)
  expect(await queries.readCatalog({}, request)).toMatchObject({
    kind: 'catalog',
    completeness: 'partial',
  })
  expect(await queries.evaluate({}, view)).toEqual({ kind: 'rejected', reason: 'unavailable' })
})
it('previews without committing or changing the captured basis', async () => {
  const f = fixture()
  const before = structuredClone(f.basis)
  expect(await f.queries.previewChange({}, { view, command })).toMatchObject({
    kind: 'changed',
    state: { revision: 1 },
  })
  expect(f.basis).toEqual(before)
  const projected = await f.queries.evaluate({}, view)
  expect(projected).toMatchObject({
    kind: 'complete',
    entries: [{ resolution: { value: { kind: 'value', value: false } } }, {}],
  })
  expect(Object.isFrozen(projected)).toBe(true)
})
it('maps read dependency failures and unknown writes separately', async () => {
  const queries = createSettingsQueries({
    read: async () => {
      throw new Error('private-provider-detail')
    },
  })
  expect(await queries.evaluate({}, view)).toEqual({ kind: 'rejected', reason: 'unavailable' })
  const port: SettingsCommitPort<object> = {
    commit: async () => {
      throw new Error('lost response')
    },
    getOperation: async () => ({
      kind: 'committed',
      operationId: 'o1',
      revision: 1,
      changed: true,
    }),
    readChanges: async () => ({ kind: 'changes', changes: [], nextRevision: null }),
  }
  const commands = createSettingsCommands(port)
  expect(await commands.change({}, command)).toEqual({ kind: 'unknown', operationId: 'o1' })
  expect(await commands.getOperation({}, { target, operationId: 'o1' })).toMatchObject({
    kind: 'committed',
    operationId: 'o1',
  })
})
it('rejects invalid commands before persistence and keeps trusted context separate', async () => {
  const observed: unknown[] = []
  const port: SettingsCommitPort<object> = {
    commit: async context => {
      observed.push(context)
      return { kind: 'committed', operationId: 'o1', revision: 1, changed: true }
    },
    getOperation: async () => ({ kind: 'not_found' }),
    readChanges: async () => ({ kind: 'changes', changes: [], nextRevision: null }),
  }
  const commands = createSettingsCommands(port)
  expect(await commands.change({}, { ...command, principal: 'admin' })).toEqual({
    kind: 'rejected',
    reason: 'invalid_input',
  })
  expect(observed).toEqual([])
  const trusted = Object.freeze({ token: 'opaque-context' })
  await commands.change(trusted, command)
  expect(observed[0]).toBe(trusted)
})
