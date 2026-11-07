import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { combinationManifest, manifestDigest, type DomainRef } from '@omne-harness/sql-contract'
import { organizationCodec } from '@omne-harness/legal-identity'
import {
  createOrganizationSettingsCurrent,
  createIdentityQualifiedSettingsPreparation,
} from '../src/preparation.ts'
import { createStandaloneSettingsOwner } from '../src/index.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { openIdentityWorld } from './identity-world.ts'
import { definition, command } from './world.ts'
export async function openOrganizationCurrentWorld() {
  const identity = await openIdentityWorld()
  const organization = organizationCodec.encode(identity.administrator.tenant.organization)
  if (!organization.ok) throw new Error('Invalid organization fixture')
  const target = { policyId: 'independent', targetRef: 'preferences', scopeRef: organization.value }
  const domain: DomainRef = { scope: { kind: 'system' }, transactionDomain: 'system.settings' }
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-organization-current/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = realpathSync(mkdtempSync(join(parent, 'case-')))
  const configuration = { destination: 'settings.organization', sourceRoute: 'settings.source' }
  const world = await openRecoveryWorld(root, domain, true, configuration)
  async function register(name: string, participants: string[]) {
    const manifest = combinationManifest({ catalog: world.materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `organization-${name}/1`,
      manifestDigest: manifestDigest(manifest.manifest),
    }
    const result = await world.storage.registerCombination({
      ...domain,
      ...registration,
      participants,
    })
    if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
    return registration
  }
  const common = world.participants.filter(p => p !== 'fixture.recovery-rollback')
  const capture = await register('capture', [
    ...common,
    'settings.targets',
    'settings.organization-capture-current',
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
        sourceId: 'organization',
        ownerRef: 'settings',
        scope: { kind: 'organization' as const, subjectRef: organization.value },
      },
    ],
    grants: [
      {
        sourceId: 'organization',
        actions: ['set' as const, 'clear' as const, 'lock' as const, 'unlock' as const],
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
  const current = createOrganizationSettingsCurrent({
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
      reservations: identity.identity.reservations,
    },
    backend: {
      storage: world.storage,
      domain,
      destination: configuration.destination,
      registrations: world.registrations,
      ...current,
      sources: {
        async reserve() {
          throw new Error('Organization update must not reserve itself')
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
    domain,
    target,
    root,
    principal: identity.administrator,
    command: command({ target, sourceId: 'organization' }),
    async close() {
      await backend.control.close()
      await owner.close()
      await world.close()
      await identity.close()
    },
  }
}
