import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import {
  createStandaloneSettingsOwner,
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
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import { definition } from './world.ts'

const worlds: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

/**
 * A prepared service over a real independent target, with the value projection in the catalog.
 * Values are written through preparation and commit; the capture reads them back.
 */
async function open(reopen?: { root: string; scopeRef: string }) {
  const withoutAssets = settingsWithoutAssetsMaterials()
  const values = settingsValueProjectionMaterials()
  const w = await openPreparedServiceWorld(undefined, {
    sourceCapture: true,
    extraParticipants: [...withoutAssets.participants, ...values],
    ...reopen,
  })
  worlds.push(w)
  const { domain } = w.input.identity
  async function register(name: string, participants: string[]) {
    const manifest = combinationManifest({ catalog: w.world.materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `value-projection-${name}/1`,
      manifestDigest: manifestDigest(manifest.manifest),
    }
    const result = await w.world.storage.registerCombination({
      ...domain,
      ...registration,
      participants,
    })
    if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
    return registration
  }
  // The writers of the stored state and of the source gate, as the owner of a target needs them.
  const source = [
    ...w.world.participants.filter(
      name => name !== 'fixture.recovery-rollback' && name !== 'settings.source-finalization',
    ),
    'settings.source-snapshot',
    'settings.targets',
  ]
  const owner = createStandaloneSettingsOwner({
    storage: w.world.storage,
    domain,
    ...(await register('source', source)),
  })
  const capture = await register('capture', [
    ...new Set([
      ...source,
      ...settingsStandaloneMaterials().participants.map(item => item.participant),
      ...withoutAssets.participants.map(item => item.participant),
      ...values.map(item => item.participant),
    ]),
  ])
  const { target } = w.command
  if (reopen === undefined) {
    const provisioned = await owner.mutate({
      kind: 'provision',
      operationId: 'provision',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target,
        definition,
        sources: w.input.plan.sources.map(({ authorityRevision: _, ...source }) => source),
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      },
    })
    if (provisioned.kind !== 'committed') throw new Error(JSON.stringify(provisioned))
  }
  let revision = 0
  return {
    root: w.root,
    target,
    close: () => w.close(),
    /** One value written through preparation and commit, on the revision of the last write. */
    async write(change: Partial<typeof w.command> = {}) {
      w.updateCurrent(current => ({
        ...current,
        basis: { ...current.basis, valueRevision: revision },
      }))
      const command = { ...w.command, expectedRevision: revision, ...change }
      const prepared = await w.service.prepareChange(w.context, command)
      if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
      const result = await w.service.commitChange(w.context, {
        requestId: `commit-${command.operationId}`,
        preparation: prepared.preparation,
      })
      if (result.kind === 'committed') revision = result.revision
      return result
    },
    async capture(change?: (binding: SettingsProjectionBinding) => void, mismatch = false) {
      const binding: SettingsProjectionBinding = {
        domain,
        principalRef: w.context.principalRef,
        captureId: randomUUID(),
        request: {
          deploymentRef: 'test',
          mode: 'management',
          targets: [target],
          selectionRef: null,
        },
      }
      change?.(binding)
      const result = await w.world.storage.commit({
        identity: {
          ...domain,
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
