import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  standaloneSettingsGuards,
  standaloneSettingsProjectionCommand,
  settingsWithoutAssetsMaterials,
  settingsWithoutAssetsProjectionCommand,
  type SettingsProjectionBinding,
} from '../src/index.ts'
import {
  SETTINGS_VALUE_PROJECTION,
  SettingsValueProjectionSchema,
  settingsValueProjectionCommand,
} from '../src/value-projection.ts'
import { settingsValueProjectionMaterials } from '../src/value-projection-materials.ts'
import { command, context, definition, openWorld } from './world.ts'
import { ownerSources } from './sources.ts'

const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

async function open(root?: string) {
  const standalone = settingsStandaloneMaterials()
  const withoutAssets = settingsWithoutAssetsMaterials()
  const w = await openWorld({
    ...(root === undefined ? {} : { root }),
    authority: {
      guards: standaloneSettingsGuards,
      materials: {
        participants: [
          ...standalone.participants,
          ...withoutAssets.participants,
          ...settingsValueProjectionMaterials(),
        ],
        migrations: standalone.migrations,
        readHandlers: standalone.readHandlers,
      },
    },
  })
  worlds.push(w)
  const owner = createStandaloneSettingsOwner({
    ...w.combination,
    domain: w.domain,
    storage: w.storage,
  })
  const target = command().target
  if (root === undefined) {
    const provisioned = await owner.mutate({
      kind: 'provision',
      operationId: 'provision',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target,
        definition,
        sources: ownerSources('tenant'),
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      },
    })
    if (provisioned.kind !== 'committed') throw new Error(JSON.stringify(provisioned))
  }
  return {
    ...w,
    async capture(change?: (binding: SettingsProjectionBinding) => void, mismatch = false) {
      const binding: SettingsProjectionBinding = {
        domain: w.domain,
        principalRef: context.principalRef,
        captureId: randomUUID(),
        request: {
          deploymentRef: 'test',
          mode: 'management',
          targets: [target],
          selectionRef: null,
        },
      }
      change?.(binding)
      const result = await w.storage.commit({
        identity: {
          ...w.domain,
          operation: 'fixture.settings-value',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: w.combination.combinationVersion,
        manifestDigest: w.combination.manifestDigest,
        commands: [
          standaloneSettingsProjectionCommand(binding),
          settingsWithoutAssetsProjectionCommand(binding),
          settingsValueProjectionCommand(
            mismatch ? { ...binding, captureId: 'another-capture' } : binding,
          ),
        ],
      })
      if (result.kind !== 'committed') return result
      return SettingsValueProjectionSchema.parse(
        result.responses.find(value => value.participant === SETTINGS_VALUE_PROJECTION.participant)
          ?.reply.response,
      )
    },
  }
}

it('reads committed assignments on the next capture without a reload or notification', async () => {
  const w = await open()
  expect(await w.capture()).toMatchObject({
    views: [
      {
        presence: 'absent',
        view: { state: { revision: 0, sources: [{ id: 'tenant', values: [] }] } },
      },
    ],
  })
  expect(await w.backend.commit(context, command())).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.capture()).toMatchObject({
    views: [
      {
        presence: 'present',
        view: {
          state: {
            revision: 1,
            sources: [
              {
                id: 'tenant',
                values: [{ itemId: 'enabled', value: { kind: 'value', value: true } }],
              },
            ],
          },
        },
      },
    ],
  })
  expect(
    await w.backend.commit(
      context,
      command({
        requestId: 'second',
        operationId: 'second',
        expectedRevision: 1,
        action: { kind: 'set', value: false },
      }),
    ),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.capture()).toMatchObject({
    views: [
      {
        view: {
          state: {
            revision: 2,
            sources: [{ values: [{ value: { kind: 'value', value: false } }] }],
          },
        },
      },
    ],
  })
})

it('does not join values to another capture', async () => {
  const w = await open()
  expect(await w.capture(undefined, true)).toMatchObject({ kind: 'rolled_back' })
})

it.each(['missing', 'foreign'] as const)(
  'does not return a complete empty result for a %s target',
  async kind => {
    const w = await open()
    expect(
      await w.capture(binding => {
        binding.request.targets = [
          {
            ...command().target,
            ...(kind === 'missing' ? { targetRef: 'missing' } : { scopeRef: 'tenant-b' }),
          },
        ]
      }),
    ).toMatchObject({ kind: 'rolled_back' })
  },
)

it('reads the same stored value after the owning Worker is reopened', async () => {
  const w = await open()
  expect(await w.backend.commit(context, command())).toMatchObject({ kind: 'committed' })
  const before = await w.capture()
  await w.close()
  const reopened = await open(w.root)
  const after = await reopened.capture()
  if ('kind' in before || 'kind' in after) throw new Error('value capture unavailable')
  expect(after.views).toEqual(before.views)
})
