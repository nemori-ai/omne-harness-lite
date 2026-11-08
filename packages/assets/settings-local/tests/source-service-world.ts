import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { SettingDefinitions, SettingsChange } from '@omne-harness/settings'
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  createStandaloneSettingsOwner,
  createSettingsSqlBackend,
  settingsSqlMaterials,
  settingsStandaloneMaterials,
  standaloneSettingsGuards,
} from '../src/index.ts'
import {
  createSettingsSourceReservations,
  type SettingsSourceDestination,
} from '../src/preparation.ts'
import { config } from './config.ts'
import { definition, command } from './world.ts'
import { source as sourceFixture } from './source-retention-world.ts'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { organizationCodec } from '@omne-harness/legal-identity'
const organization = organizationCodec.encode(randomIdentifiers().organization())
if (!organization.ok) throw new Error('Invalid organization fixture')
export const source = {
  ...sourceFixture,
  target: { ...sourceFixture.target, scopeRef: organization.value },
}
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
  const settings = settingsSqlMaterials({ sourceCapture: true })
  const targets = settingsStandaloneMaterials()
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [...settings.participants, ...targets.participants],
    migrations: [...settings.migrations, ...targets.migrations],
    readHandlers: [...settings.readHandlers, ...targets.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = materials.participants.map(p => p.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const registration = {
    combinationVersion: 'settings-source-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
  }
  const made = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.storage.registerCombination({
    ...selectedSource.domain,
    ...registration,
    participants,
  })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const owner = createStandaloneSettingsOwner({
    storage: made.storage,
    domain: selectedSource.domain,
    ...registration,
  })
  if (!existingRoot) {
    const created = await owner.mutate({
      kind: 'provision',
      operationId: 'create-source',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target: selectedSource.target,
        definition: selectedDefinition,
        sources: [
          {
            sourceId: 'organization',
            ownerRef: 'settings',
            scope: { kind: 'organization', subjectRef: selectedSource.target.scopeRef },
          },
        ],
        grants: [{ sourceId: 'organization', actions: ['set', 'clear', 'lock', 'unlock'] }],
      },
    })
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
  }
  const authorize = async (
    principalRef: string,
    request: { target: typeof selectedSource.target },
  ) => ({
    kind: 'authorized' as const,
    scope: selectedSource.domain.scope,
    target: request.target,
    principalRef,
  })
  const backend = createSettingsSqlBackend({
    storage: made.storage,
    domain: selectedSource.domain,
    ...registration,
    access: { authorize },
    guards: standaloneSettingsGuards,
  })
  const options = {
    storage: made.storage,
    domain: selectedSource.domain,
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
  return {
    root,
    source: selectedSource,
    storage: made.storage,
    options,
    sources,
    owner,
    set(
      value: Extract<SettingsChange['action'], { kind: 'set' }>['value'] = true,
      expectedRevision = 0,
      operationId = 'set-source',
    ) {
      return backend.commit(
        'admin',
        command({
          target: selectedSource.target,
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
        }),
      )
    },
    async close() {
      await sources.control.close()
      await backend.close()
      await owner.close()
      const result = await made.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
    },
  }
}
