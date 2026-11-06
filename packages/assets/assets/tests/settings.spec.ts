import { expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryRegistry,
  pinBody,
  readBodyText,
  projectAssetSettings,
  type BodyContract,
} from '../src/index.ts'
import { defineSettings } from '@omne-harness/settings'
const body = readBodyText('{"enabled":true}', {
  maxBytes: 1000,
  maxDepth: 8,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
})
const id = capabilityId('service', 'example')
if (body.kind !== 'ok' || !id.ok) throw new Error('invalid fixture')
const pinned = pinBody({
  identity: id.id,
  version: 'release-1',
  source: 'owner-source',
  body: body.value,
})
const checked = defineSettings({
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
  items: [
    {
      id: 'enabled',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: 'Show tips',
        description: 'Show help during use',
        impact: 'Used on next read',
        clear: 'Use the outer value',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
if (checked.kind !== 'defined') throw new Error('invalid settings')
const definition = checked.definition
function category(settings?: BodyContract['settings']): BodyContract {
  return {
    category: 'service',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(settings ? { settings } : {}),
  }
}
it('derives settings from the selected fixed body and preserves concrete asset identity', () => {
  const registry = createCategoryRegistry()
  let selected: unknown
  registry.register(
    category((body, context) => {
      selected = { body, context }
      return definition
    }),
  )
  expect(projectAssetSettings(registry, { assetRef: 'asset-a', pinned })).toMatchObject({
    kind: 'declared',
    assetRef: 'asset-a',
    version: 'release-1',
    source: 'owner-source',
    definition,
  })
  expect(projectAssetSettings(registry, { assetRef: 'asset-b', pinned })).toMatchObject({
    kind: 'declared',
    assetRef: 'asset-b',
  })
  expect(selected).toEqual({
    body: pinned.body,
    context: { capabilityName: 'example', definition: 'release-1' },
  })
})
it('allows categories without settings and does not create a holding', () => {
  const registry = createCategoryRegistry()
  registry.register(category())
  expect(projectAssetSettings(registry, { assetRef: 'asset-a', pinned })).toEqual({ kind: 'none' })
})
it('distinguishes absent category, invalid body and unavailable declaration provider', () => {
  expect(projectAssetSettings(createCategoryRegistry(), { assetRef: 'asset-a', pinned })).toEqual({
    kind: 'rejected',
    reason: 'unknown_category',
  })
  const rejecting = createCategoryRegistry()
  rejecting.register({ ...category(), judge: () => ({ ok: false, rejected: 'invalid' }) })
  expect(projectAssetSettings(rejecting, { assetRef: 'asset-a', pinned })).toEqual({
    kind: 'rejected',
    reason: 'invalid_body',
  })
  const unavailable = createCategoryRegistry()
  unavailable.register(
    category(() => {
      throw new Error('private details')
    }),
  )
  expect(projectAssetSettings(unavailable, { assetRef: 'asset-a', pinned })).toEqual({
    kind: 'rejected',
    reason: 'provider_unavailable',
  })
})
it('rejects invalid semantic metadata from a provider', () => {
  const registry = createCategoryRegistry()
  registry.register(
    category(() => ({ ...definition, groups: [{ ...definition.groups[0]!, title: '' }] })),
  )
  expect(projectAssetSettings(registry, { assetRef: 'asset-a', pinned })).toEqual({
    kind: 'rejected',
    reason: 'invalid_declaration',
  })
})
