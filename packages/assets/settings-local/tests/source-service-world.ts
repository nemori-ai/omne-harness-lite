import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { SettingDefinitions, SettingsChange } from '@omne-harness/settings'
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { standingReservationId, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { organizationCodec, tenant } from '@omne-harness/legal-identity'
import { createStandaloneSettingsOwner } from '../src/index.ts'
import {
  createOrganizationSettingsCurrent,
  createSettingsPreparationBackend,
  createSettingsSourceReservations,
  type SettingsPreparationOptions,
  type SettingsSourceDestination,
} from '../src/preparation.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { definition, command } from './world.ts'
import { source as sourceFixture } from './source-retention-world.ts'
const organization = organizationCodec.encode(randomIdentifiers().organization())
if (!organization.ok) throw new Error('Invalid organization fixture')
export const source = {
  ...sourceFixture,
  target: { ...sourceFixture.target, scopeRef: organization.value },
}
const configuration = { destination: 'settings.organization', sourceRoute: 'settings.source' }
/**
 * One organization source target with its source reservations. The value of the target is written
 * through preparation and commit, with the real organization current participants.
 */
export async function openSourceServiceWorld(
  destination: Pick<SettingsSourceDestination, 'seal'> &
    Partial<Pick<SettingsSourceDestination, 'recognize'>>,
  existingRoot?: string,
  selectedSource = source,
  selectedDefinition: SettingDefinitions = definition,
) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-source-service/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = existingRoot ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const { domain, target } = selectedSource
  const world = await openRecoveryWorld(root, domain, true, configuration)
  async function register(name: string, participants: string[]) {
    const manifest = combinationManifest({ catalog: world.materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `settings-source-${name}/1`,
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
  const registration = await register('test', [
    ...common.filter(p => p !== 'settings.source-finalization'),
    'settings.source-snapshot',
    'settings.targets',
  ])
  const owner = createStandaloneSettingsOwner({ storage: world.storage, domain, ...registration })
  if (!existingRoot) {
    const created = await owner.mutate({
      kind: 'provision',
      operationId: 'create-source',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target,
        definition: selectedDefinition,
        sources: [
          {
            sourceId: 'organization',
            ownerRef: 'settings',
            scope: { kind: 'organization', subjectRef: target.scopeRef },
          },
        ],
        grants: [{ sourceId: 'organization', actions: ['set', 'clear', 'lock', 'unlock'] }],
      },
    })
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
  }
  const authorize = async (principalRef: string, request: { target: typeof target }) => ({
    kind: 'authorized' as const,
    scope: domain.scope,
    target: request.target,
    principalRef,
  })
  const options = {
    storage: world.storage,
    domain,
    registration,
    destination: {
      recognize:
        destination.recognize?.bind(destination) ??
        (async request => ({ kind: 'known' as const, request })),
      seal: destination.seal.bind(destination),
    },
    access: {
      authorize: (principalRef: string, request: { source: typeof source }) =>
        authorize(principalRef, { target: request.source.target }),
    },
  }
  const sources = createSettingsSourceReservations(options)
  // The writer of the value: an administrator of the organization that owns the target.
  const owning = organizationCodec.parse(target.scopeRef)
  if (!owning.ok) throw new Error('Invalid organization of the source target')
  const administrator: ActingForTenantPrincipal = {
    kind: 'acting-for-tenant',
    actor: { kind: 'system', component: 'settings-source-test' },
    tenant: tenant(owning.value, randomIdentifiers().account()),
    work: { owner: 'settings-source-test', work: 'set-source' },
  }
  const preparation: SettingsPreparationOptions<ActingForTenantPrincipal> = {
    storage: world.storage,
    domain,
    destination: configuration.destination,
    registrations: world.registrations,
    ...createOrganizationSettingsCurrent({
      storage: world.storage,
      domain,
      capture: { ...capture },
      configuration,
    }),
    standing: {
      async reserve(_principal, request) {
        return {
          kind: 'held',
          reservation: { ...request, id: standingReservationId(request.binding, request.required) },
        }
      },
      async settle(request) {
        return prepared.control.destination.seal({
          ...request,
          id: standingReservationId(request.binding, request.required),
        })
      },
    },
    sources: {
      async reserve() {
        throw new Error('A write of the source target must not reserve a source')
      },
      async settle() {
        throw new Error('Unexpected source obligation')
      },
    },
  }
  const prepared = createSettingsPreparationBackend(preparation)
  return {
    root,
    source: selectedSource,
    storage: world.storage,
    options,
    sources,
    owner,
    async set(
      value: Extract<SettingsChange['action'], { kind: 'set' }>['value'] = true,
      expectedRevision = 0,
      operationId = 'set-source',
    ) {
      const change = command({
        target,
        definitionRef: {
          providerId: selectedDefinition.providerId,
          definitionId: selectedDefinition.definitionId,
          version: selectedDefinition.version,
          digest: createHash('sha256').update(canonicalize(selectedDefinition)!).digest('hex'),
        },
        itemId: selectedDefinition.items[0]!.id,
        sourceId: 'organization',
        action: { kind: 'set', value },
        expectedRevision,
        operationId,
      })
      const preparation = await prepared.service.prepareChange(administrator, change)
      if (preparation.kind !== 'prepared') return preparation
      return prepared.service.commitChange(administrator, {
        requestId: `commit-${operationId}`,
        preparation: preparation.preparation,
      })
    },
    async close() {
      await sources.control.close()
      await prepared.control.close()
      await owner.close()
      await world.close()
    },
  }
}
