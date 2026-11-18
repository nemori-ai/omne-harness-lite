import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { combinationManifest, manifestDigest, type DomainRef } from '@omne-harness/sql-contract'
import type { StandingReservations } from '@omne-harness/identity'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createTenantSettingsCurrent,
  createIdentityQualifiedSettingsPreparation,
} from '../src/preparation.ts'
import { createStandaloneSettingsOwner } from '../src/index.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { openIdentityWorld } from './identity-world.ts'
import { definition, command } from './world.ts'
export async function openTenantCurrentWorld(
  options: {
    wrapReservations?: (reservations: StandingReservations) => StandingReservations
    wrapStorage?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const identity = await openIdentityWorld()
  const tenant = tenantCodec.encode(identity.administrator.tenant)
  if (!tenant.ok) throw new Error('Invalid tenant fixture')
  const target = {
    kind: 'independent',
    providerId: 'example',
    definitionId: 'preferences',
    scopeRef: tenant.value,
  } as const
  const domain: DomainRef = {
    scope: { kind: 'tenant', tenant: tenant.value },
    transactionDomain: 'tenant/preferences',
  }
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-tenant-current/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = realpathSync(mkdtempSync(join(parent, 'case-')))
  const configuration = { destination: 'settings.tenant', sourceRoute: 'settings.tenant' }
  const world = await openRecoveryWorld(root, domain, true, configuration, {}, 'tenant')
  async function register(name: string, participants: string[]) {
    const manifest = combinationManifest({ catalog: world.materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `tenant-${name}/1`,
      manifestDigest: manifestDigest(manifest.manifest),
    }
    const result = await world.storage.registerCombination({
      ...domain,
      ...registration,
      participants,
    })
    if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
    return { ...registration, participants }
  }
  const common = world.participants.filter(p => p !== 'fixture.recovery-rollback')
  const capture = await register('capture', [
    ...common,
    'settings.targets',
    'settings.tenant-capture-current',
  ])
  const sourceRegistration = await register('source', [
    ...common.filter(p => p !== 'settings.source-finalization'),
    'settings.source-snapshot',
    'settings.targets',
  ])
  const owner = createStandaloneSettingsOwner({
    storage: world.storage,
    domain,
    ...sourceRegistration,
  })
  const record = {
    target,
    publicationRef: null,
    definition,
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: 'settings',
        scope: { kind: 'tenant' as const, subjectRef: tenant.value },
      },
    ],
    grants: [
      {
        sourceId: 'tenant',
        actions: ['set' as const, 'clear' as const],
      },
    ],
  }
  const created = await owner.mutate({
    kind: 'provision',
    operationId: 'provision',
    expectedRevision: null,
    record,
  })
  if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
  const current = createTenantSettingsCurrent({
    storage: world.storage,
    domain,
    capture,
    configuration,
  })
  const backend = createIdentityQualifiedSettingsPreparation({
    required: [],
    identity: {
      verifier: identity.authority.verifier,
      standing: identity.identity.standing,
      reservations:
        options.wrapReservations?.(identity.identity.reservations) ??
        identity.identity.reservations,
    },
    backend: {
      storage: options.wrapStorage?.(world.storage) ?? world.storage,
      domain,
      destination: configuration.destination,
      registrations: world.registrations,
      ...current,
      sources: {
        async reserve() {
          throw new Error('A tenant target change must not reserve a source')
        },
        async settle() {
          throw new Error('Unexpected external source obligation')
        },
      },
    },
  })
  identity.setResolver(backend.control.destination)
  return {
    identity,
    world,
    backend,
    current,
    owner,
    record,
    sourceRegistration,
    configuration,
    domain,
    target,
    root,
    principal: identity.administrator,
    command: command({ target, sourceId: 'tenant' }),
    async close() {
      await backend.control.close()
      await owner.close()
      await world.close()
      await identity.close()
    },
  }
}
