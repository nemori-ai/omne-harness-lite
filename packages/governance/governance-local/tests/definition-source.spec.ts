import { expect, it, vi } from 'vitest'
import type {
  GovernanceDefinitionBundle,
  GovernanceDefinitionSource,
} from '@omne-harness/governance-contract'
import { resolveDefinition } from '../src/definition-source.ts'
import { declaration } from './definition-fixture.ts'

function publication(value: GovernanceDefinitionBundle): GovernanceDefinitionSource {
  return { resolve: async () => ({ kind: 'definition', declaration: value }) }
}

it('looks up only the complete publication identity and preserves the publisher digest', async () => {
  const value = declaration()
  const source = publication(value)
  const resolve = vi.spyOn(source, 'resolve')
  const result = await resolveDefinition(source, value)
  expect(resolve).toHaveBeenCalledExactlyOnceWith({
    ownerId: 'example',
    definitionId: 'bundle',
    version: '1',
  })
  expect(result).toEqual({ kind: 'verified', declaration: value })
  if (result.kind !== 'verified') throw new Error('Expected verified publication')
  value.permissions[0]!.description = 'Changed after verification'
  expect(result.declaration.permissions[0]!.description).toBe('Allow creation of a schedule')
  expect(result.declaration.reference.digest).toBe('a'.repeat(64))
})

it.each(['ownerId', 'definitionId', 'version'] as const)(
  'rejects a source that answers another %s',
  async key => {
    const requested = declaration(),
      returned = declaration()
    returned.reference[key] = 'other'
    expect(await resolveDefinition(publication(returned), requested)).toEqual({
      kind: 'unavailable',
      owner: 'example',
    })
  },
)

it.each([
  [
    'digest',
    (value: GovernanceDefinitionBundle) => {
      value.reference.digest = 'b'.repeat(64)
    },
  ],
  [
    'origin',
    (value: GovernanceDefinitionBundle) => {
      value.origin = { kind: 'independent', providerId: 'other', definitionRef: 'other/1' }
      value.permissions[0]!.reference.origin = value.origin
    },
  ],
  [
    'setting',
    (value: GovernanceDefinitionBundle) => {
      value.settings[0]!.groups.push({ ...value.settings[0]!.groups[0]!, id: 'additional' })
    },
  ],
  [
    'permission',
    (value: GovernanceDefinitionBundle) => {
      value.permissions[0]!.supportedScopes[0]!.description = 'Another scope explanation'
    },
  ],
  [
    'enforcement',
    (value: GovernanceDefinitionBundle) => {
      value.enforcementBindings[0]!.implementationRef = 'another/1'
    },
  ],
] as const)('compares the complete %s, not only the publication digest', async (_field, mutate) => {
  const requested = declaration(),
    published = declaration()
  mutate(published)
  expect(await resolveDefinition(publication(published), requested)).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
})

it('fixes the request before awaiting the source', async () => {
  const requested = declaration(),
    published = declaration()
  const pending = Promise.withResolvers<void>()
  const source: GovernanceDefinitionSource = {
    async resolve() {
      await pending.promise
      return { kind: 'definition', declaration: published }
    },
  }
  const verification = resolveDefinition(source, requested)
  requested.reference.ownerId = 'another'
  requested.settings[0]!.items[0]!.presentation.description = 'Changed during lookup'
  pending.resolve()
  expect(await verification).toEqual({ kind: 'verified', declaration: published })
})

it('does not let schema normalization hide a difference in published text', async () => {
  const requested = declaration(),
    published = declaration()
  requested.permissions[0]!.supportedScopes[0]!.description = ' Original call only '
  expect(await resolveDefinition(publication(published), requested)).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  published.permissions[0]!.supportedScopes[0]!.description = ' Original call only '
  expect(await resolveDefinition(publication(published), declaration())).toEqual({
    kind: 'unavailable',
    owner: 'example',
  })
})

it('keeps missing, throwing, malformed and semantically invalid sources unavailable', async () => {
  const value = declaration()
  const invalid = declaration()
  invalid.enforcementBindings = []
  const sources: GovernanceDefinitionSource[] = [
    { resolve: async () => ({ kind: 'unavailable' }) },
    {
      resolve: async () => {
        throw new Error('Source disconnected')
      },
    },
    {
      resolve: async () =>
        Object.assign({ kind: 'definition' as const, declaration: value }, { allowed: true }),
    },
    publication(invalid),
  ]
  for (const source of sources)
    expect(await resolveDefinition(source, value)).toEqual({
      kind: 'unavailable',
      owner: 'example',
    })
})

it('refuses invalid requests without consulting the source', async () => {
  const source = publication(declaration())
  const resolve = vi.spyOn(source, 'resolve')
  const invalid = declaration()
  invalid.reference.version = ''
  expect(await resolveDefinition(source, invalid)).toEqual({
    kind: 'invalid-input',
    field: 'declaration',
    reason: 'shape',
  })
  invalid.reference.version = '1'
  invalid.permissions.push(...invalid.permissions)
  expect(await resolveDefinition(source, invalid)).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  expect(resolve).not.toHaveBeenCalled()
})

it('bounds encoded bytes and cumulative items on both sides of the lookup', async () => {
  const requested = declaration(),
    large = declaration()
  large.settings[0]!.items[0]!.valueSchema = { description: '界'.repeat(100_000) }
  const source = publication(large)
  const resolve = vi.spyOn(source, 'resolve')
  expect(await resolveDefinition(source, large)).toEqual({
    kind: 'limited',
    resource: 'declaration',
  })
  expect(resolve).not.toHaveBeenCalled()
  expect(await resolveDefinition(source, requested)).toEqual({
    kind: 'unavailable',
    owner: 'example',
  })
  const definition = large.settings[0]!
  definition.items = Array.from({ length: 128 }, (_, i) => ({
    ...requested.settings[0]!.items[0]!,
    id: 'item-' + i,
  }))
  expect(await resolveDefinition(source, large)).toEqual({
    kind: 'limited',
    resource: 'declaration',
  })
  expect(await resolveDefinition(source, requested)).toEqual({
    kind: 'unavailable',
    owner: 'example',
  })
})
