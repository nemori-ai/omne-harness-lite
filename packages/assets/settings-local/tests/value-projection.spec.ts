import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  settingsStandaloneMaterials,
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
import { openPreparedTargetWorld } from './prepared-target-world.ts'

const worlds: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

/** A real independent target whose values the value projection reads back. */
async function open(reopen?: { root: string; scopeRef: string }) {
  const withoutAssets = settingsWithoutAssetsMaterials()
  const values = settingsValueProjectionMaterials()
  const w = await openPreparedTargetWorld({
    extraMaterials: { participants: [...withoutAssets.participants, ...values] },
    ...(reopen ? { reopen } : {}),
  })
  worlds.push(w)
  const capture = await w.register('capture', [
    ...new Set([
      ...w.ownerParticipants,
      ...settingsStandaloneMaterials().participants.map(item => item.participant),
      ...withoutAssets.participants.map(item => item.participant),
      ...values.map(item => item.participant),
    ]),
  ])
  if (reopen === undefined) {
    const provisioned = await w.provision()
    if (provisioned.kind !== 'committed') throw new Error(JSON.stringify(provisioned))
  }
  return {
    ...w,
    async capture(change?: (binding: SettingsProjectionBinding) => void, mismatch = false) {
      const binding: SettingsProjectionBinding = {
        domain: w.domain,
        principalRef: w.context.principalRef,
        captureId: randomUUID(),
        request: {
          deploymentRef: 'test',
          mode: 'management',
          targets: [w.target],
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
        ...capture,
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
  expect(await w.write()).toMatchObject({ kind: 'committed', revision: 1 })
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
    await w.write({
      requestId: 'second',
      operationId: 'second',
      action: { kind: 'set', value: false },
    }),
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
            ...w.target,
            ...(kind === 'missing' ? { targetRef: 'missing' } : { scopeRef: 'tenant-b' }),
          },
        ]
      }),
    ).toMatchObject({ kind: 'rolled_back' })
  },
)

it('reads the same stored value after the owning Worker is reopened', async () => {
  const w = await open()
  expect(await w.write()).toMatchObject({ kind: 'committed' })
  const before = await w.capture()
  worlds.splice(worlds.indexOf(w), 1)
  await w.close()
  const reopened = await open({ root: w.root, scopeRef: w.target.scopeRef })
  const after = await reopened.capture()
  if ('kind' in before || 'kind' in after) throw new Error('value capture unavailable')
  expect(after.views).toEqual(before.views)
})
