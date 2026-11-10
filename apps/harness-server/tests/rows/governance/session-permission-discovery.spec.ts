import { expect, it } from 'vitest'
import type { GovernanceCatalogPage } from '@omne-harness/governance-contract'
import { declaration } from '../../../../../packages/governance/governance-local/tests/definition-fixture.ts'
import { scope } from '../../../../../packages/governance/governance-local/tests/operation-world.ts'
import { discoverSessionPermissionDeclaration } from '../../../src/rows/governance/session-permission-discovery.ts'

function fixture() {
  const definition = declaration()
  const permission = definition.permissions[0]
  if (permission === undefined) throw new Error('Missing fixture permission')
  const change = {
    definition: permission.reference,
    capabilityId: permission.capabilityId,
    enforcementKey: permission.enforcementKey,
    rule: { pick: 'allow', allowedSet: null },
  }
  const item: GovernanceCatalogPage['items'][number] = {
    declaration: definition,
    contributions: [],
    selectedTargets: [],
    availability: 'available',
  }
  const page: GovernanceCatalogPage = {
    kind: 'page',
    items: [item],
    completeness: 'complete',
    unavailableOwners: [],
    nextCursor: null,
    snapshot: {
      scope,
      epoch: 'first',
      adoptionRevision: 0,
      declarationRevision: 1,
      declarationSetDigest: 'a'.repeat(64),
      selectedDefinitions: [],
    },
  }
  return { definition, change, page, item }
}

it('finds an exact permission only after finishing the same catalog snapshot', async () => {
  const { definition, change, page, item } = fixture()
  const unrelated = { ...item, declaration: { ...definition, permissions: [] } }
  const result = await discoverSessionPermissionDeclaration({
    scope,
    change,
    readCatalog: async request =>
      request.cursor === null ? { ...page, items: [unrelated], nextCursor: 'second' } : page,
  })
  expect(result).toEqual({ kind: 'found', declaration: definition })
})

it.each([
  'snapshot',
  'scope',
  'partial',
  'duplicate',
  'unavailable',
  'cursor-cycle',
  'empty-page',
  'throw',
] as const)('does not select from an uncertain catalog: %s', async scenario => {
  const { change, page, item } = fixture()
  const result = await discoverSessionPermissionDeclaration({
    scope,
    change,
    readCatalog: async request => {
      if (scenario === 'throw') throw new Error('fixture-reader-failure')
      if (scenario === 'scope')
        return {
          ...page,
          snapshot: { ...page.snapshot, scope: { ...scope, deploymentId: 'other' } },
        }
      if (scenario === 'partial')
        return { ...page, completeness: 'partial', unavailableOwners: ['another-owner'] }
      if (scenario === 'duplicate') return { ...page, items: [item, item] }
      if (scenario === 'unavailable')
        return { ...page, items: [{ ...item, availability: 'unavailable' }] }
      if (scenario === 'empty-page') return { ...page, items: [], nextCursor: 'second' }
      const unrelated = { ...item, declaration: { ...item.declaration, permissions: [] } }
      if (request.cursor === null) return { ...page, items: [unrelated], nextCursor: 'second' }
      if (scenario === 'cursor-cycle') return { ...page, items: [unrelated], nextCursor: 'second' }
      return { ...page, snapshot: { ...page.snapshot, declarationRevision: 2 } }
    },
  })
  expect(result).toEqual({ kind: 'unavailable' })
})

it('keeps the original query across a catalog await and rejects a different permission reference', async () => {
  const { definition, change, page } = fixture()
  const result = await discoverSessionPermissionDeclaration({
    scope,
    change,
    readCatalog: async () => {
      change.enforcementKey = 'different'
      return page
    },
  })
  expect(result).toEqual({ kind: 'found', declaration: definition })
  expect(
    await discoverSessionPermissionDeclaration({ scope, change, readCatalog: async () => page }),
  ).toEqual({ kind: 'unavailable' })
})
