import { canonicalText } from '@omne-harness/authorization'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  createIdentityQualifiedSettingsPreparation,
  SETTINGS_CHECKPOINT_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
  SETTINGS_RECOVERY_PARTICIPANTS,
  type SettingsPreparationService,
} from '@omne-harness/settings-local/preparation'
import {
  settingsCurrentMaterials,
  settingsCurrentParticipant,
} from '../../../dist/rows/governance/settings-current.js'
import { createSettingsCurrentProjection } from '../../../dist/rows/governance/settings-preparation.js'
import { governanceAdoptionWorld } from './governance-adoption-world.ts'

export async function settingsPreparationWorld(
  options: Parameters<typeof governanceAdoptionWorld>[0] = {},
) {
  const configuration = {
    destination: 'settings.preparation',
    required: [],
    sourceRoute: 'settings.preparation',
  }
  const w = await governanceAdoptionWorld({
    ...options,
    preparedSettings: true,
    extraParticipants: [
      ...settingsCurrentMaterials(configuration),
      ...(options.extraParticipants ?? []),
    ],
  })
  await w.setup()
  const registered = await w.service.contribute(w.access, {
    scope: w.scope,
    contributorId: 'tools',
    generation: '1',
    operationId: 'settings-register-shell',
    declaration: w.declaration,
  })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const catalog = await w.service.readCatalog(w.access, {
    scope: w.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 10,
  })
  if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
  const epoch = catalog.snapshot.epoch
  const snapshot = await w.captureSnapshot(epoch, 'management')
  if ('kind' in snapshot) throw new Error(JSON.stringify(snapshot))
  const dependencies = w.snapshotParticipants.filter(
    value => !SETTINGS_RECOVERY_PARTICIPANTS.includes(value),
  )
  const capture = await w.register('settings-capture', [
    ...dependencies,
    ...SETTINGS_RECOVERY_PARTICIPANTS,
    settingsCurrentParticipant('capture'),
  ])
  const registrations = {
    checkpoint: await w.register('settings-checkpoint', SETTINGS_CHECKPOINT_PARTICIPANTS),
    ready: await w.register('settings-ready', [
      ...dependencies,
      ...SETTINGS_READY_PARTICIPANTS,
      settingsCurrentParticipant('ready'),
    ]),
    commit: await w.register('settings-commit', [
      ...dependencies,
      ...SETTINGS_COMMIT_PARTICIPANTS,
      settingsCurrentParticipant('commit'),
    ]),
    recovery: await w.register('settings-recovery', SETTINGS_RECOVERY_PARTICIPANTS),
  }
  const projection = createSettingsCurrentProjection<ActingForTenantPrincipal>({
    storage: w.storage,
    domain: w.domain,
    capture,
    location: {
      scope: w.scope,
      epoch,
      mode: 'management',
      definition: w.declaration.reference,
      target: w.target,
    },
  })
  const prepared = createIdentityQualifiedSettingsPreparation({
    identity: w.identity,
    required: [],
    backend: {
      storage: w.storage,
      domain: w.domain,
      destination: configuration.destination,
      registrations,
      ...projection,
      access: {
        async authorize(_principal, request) {
          return canonicalText(request.target) === canonicalText(w.target)
            ? {
                kind: 'authorized',
                scope: request.scope,
                target: request.target,
                principalRef: w.principalRef,
              }
            : { kind: 'rejected', reason: 'forbidden' }
        },
      },
      sources: {
        async reserve() {
          throw new Error('This target has no external source')
        },
        async settle() {
          throw new Error('This target has no external source')
        },
      },
    },
  })
  w.setSettingsDestination(prepared.control.destination)
  const command: Parameters<
    SettingsPreparationService<ActingForTenantPrincipal>['prepareChange']
  >[1] = {
    protocol: 'settings/1',
    requestId: 'request',
    operationId: 'change-invoke',
    target: w.target,
    definitionRef: snapshot.values.view.definitionRef,
    expectedRevision: 0,
    sourceId: 'tenant',
    itemId: 'invoke',
    action: { kind: 'set', value: { pick: 'deny', allowedSet: null } },
  }
  return {
    ...w,
    prepared: prepared.service,
    command,
    epoch,
    registrations,
    projection,
    async withdraw() {
      return w.service.withdraw(w.access, {
        operationId: 'withdraw-settings',
        contribution: registered.contribution,
      })
    },
    async close() {
      await prepared.control.close()
      await w.close()
    },
  }
}
