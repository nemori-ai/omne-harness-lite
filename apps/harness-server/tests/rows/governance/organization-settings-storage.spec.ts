// @module-tag slow
// Real production materials and SQLite. Destination recognition is a named owner fixture.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { settingsSourceIdentities } from '@omne-harness/settings'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import {
  createSettingsSourceReservations,
  type SettingsSourceRequest,
} from '@omne-harness/settings-local/preparation'
import { organizationCodec } from '@omne-harness/legal-identity'
import { productionStorageCatalog } from '../../../dist/rows/storage/production-catalog.js'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { organizationSettingsCombination } from '../../../src/rows/governance/organization-settings-combination.ts'
import { installToolOrganizationSource } from '../../../src/rows/governance/tool-installation-source.ts'
import { providerConfig, TENANT_A, textOf } from '../storage/fixtures/tree.ts'

const cleanup: Array<() => unknown | Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function world() {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error('Tool release unavailable')
  const definition = release.manifest.entries.flatMap(
    entry => entry.governance.declaration.settings,
  )[0]
  if (!definition) throw new Error('Release has no settings definition')
  const catalog = await productionStorageCatalog(async () => release)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'organization-settings-')))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const made = await createSqliteStorage({
    config: providerConfig(root),
    materials: catalog,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  cleanup.push(() => made.control.close({ initiator: 'disposal' }))
  const domain = { scope: { kind: 'system' as const }, transactionDomain: 'system.settings' }
  const { participants, ...registration } = organizationSettingsCombination(catalog)
  expect(
    await made.storage.registerCombination({ ...domain, ...registration, participants }),
  ).toMatchObject({ kind: 'registered' })
  const organization = organizationCodec.encode(TENANT_A.organization)
  if (!organization.ok) throw new Error('Invalid fixture organization')
  const target = {
    policyId: 'independent',
    scopeRef: organization.value,
    targetRef: 'permission-source',
  }
  const owner = createStandaloneSettingsOwner({ storage: made.storage, domain, ...registration })
  cleanup.push(() => owner.close())
  const sources = createSettingsSourceReservations<string>({
    storage: made.storage,
    domain,
    registration,
    access: {
      async authorize(principalRef, request) {
        return {
          kind: 'authorized',
          principalRef,
          scope: domain.scope,
          target: request.source.target,
        }
      },
    },
    destination: {
      async recognize(request) {
        return { kind: 'known', request }
      },
      async seal(request) {
        return { kind: 'terminal', request, outcome: 'aborted' }
      },
    },
  })
  cleanup.push(() => sources.control.close())
  const request: SettingsSourceRequest = {
    source: { domain, target },
    destination: {
      ownerRef: 'governance',
      identity: {
        domain: {
          scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
          transactionDomain: 'tenant.fixture',
        },
        principalRef: 'source-reader-fixture',
        operation: { operationId: 'source-operation' },
      },
      attemptId: 'source-attempt',
      commandDigest: 'a'.repeat(64),
      route: 'harness.governance.session-write',
    },
  }
  const provision = (operationId: string, expectedRevision: number | null) =>
    owner.mutate({
      kind: 'provision',
      operationId,
      expectedRevision,
      record: {
        publicationRef: null,
        target,
        definition,
        sources: [
          {
            sourceId: 'organization',
            ownerRef: 'settings',
            scope: { kind: 'organization', subjectRef: organization.value },
          },
        ],
        grants: [{ sourceId: 'organization', actions: ['set', 'clear', 'lock', 'unlock'] }],
      },
    })
  return { sources, request, provision, owner, definition, organizationId: organization.value }
}

it('captures an installed empty organization source and holds it until the original destination settles', async () => {
  const w = await world()
  expect(await w.owner.readTarget(w.request.source.target)).toEqual({ kind: 'not_found' })
  expect(await w.provision('install-source', null)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  const held = await w.sources.service.reserve('source-reader-fixture', w.request)
  expect(held).toMatchObject({
    kind: 'held',
    snapshot: { presence: 'absent', state: { revision: 0 } },
  })
  expect(await w.provision('replace-while-held', 1)).toMatchObject({ kind: 'rejected' })
  expect(await w.sources.service.settle(w.request)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.sources.service.reserve('source-reader-fixture', w.request)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.provision('replace-after-settlement', 1)).toMatchObject({
    kind: 'committed',
    revision: 2,
  })
  expect(await w.owner.readTarget(w.request.source.target)).toMatchObject({
    kind: 'found',
    retired: false,
    projection: { target: w.request.source.target, ownerRevision: 2 },
  })
})

it('does not convert an uninstalled organization target into an empty source', async () => {
  const w = await world()
  expect(await w.sources.service.reserve('source-reader-fixture', w.request)).toMatchObject({
    kind: 'rejected',
  })
})

it('installs one shared organization target concurrently without rewriting it or reviving retirement', async () => {
  const w = await world()
  const input = { owner: w.owner, definition: w.definition, organizationId: w.organizationId }
  const [first, second] = await Promise.all([
    installToolOrganizationSource(input),
    installToolOrganizationSource(input),
  ])
  expect(first).toMatchObject({ kind: 'ready' })
  expect(second).toEqual(first)
  if (first.kind !== 'ready') throw new Error(JSON.stringify(first))
  const before = await w.owner.readTarget(first.source.target)
  expect(before).toMatchObject({
    kind: 'found',
    projection: { ownerRevision: 1, definition: w.definition },
  })
  expect(await installToolOrganizationSource(input)).toEqual(first)
  expect(await w.owner.readTarget(first.source.target)).toEqual(before)
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'operator-retire',
      target: first.source.target,
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await installToolOrganizationSource(input)).toEqual({
    kind: 'inactive',
    source: first.source,
  })
  expect(await w.owner.readTarget(first.source.target)).toMatchObject({
    kind: 'found',
    retired: true,
    projection: { ownerRevision: 2 },
  })
})

it('preserves revoked source grants on version adoption and refuses a rebound definition identity', async () => {
  const w = await world()
  const input = { owner: w.owner, definition: w.definition, organizationId: w.organizationId }
  const installed = await installToolOrganizationSource(input)
  if (installed.kind !== 'ready') throw new Error(JSON.stringify(installed))
  const first = await w.owner.readTarget(installed.source.target)
  if (first.kind !== 'found') throw new Error(JSON.stringify(first))
  const record = {
    publicationRef: null,
    target: installed.source.target,
    definition: w.definition,
    sources: settingsSourceIdentities(first.projection.sources),
    grants: [],
  }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'revoke-grants',
      expectedRevision: 1,
      record,
    }),
  ).toMatchObject({ kind: 'committed' })
  const nextDefinition = { ...w.definition, version: 'installation-test-v2' }
  expect(await installToolOrganizationSource({ ...input, definition: nextDefinition })).toEqual({
    kind: 'unavailable',
  })
  expect(await w.owner.readTarget(installed.source.target)).toMatchObject({
    kind: 'found',
    projection: { ownerRevision: 2, grants: [], definition: w.definition },
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'explicit-definition-adoption',
      expectedRevision: 2,
      record: { ...record, definition: nextDefinition },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await installToolOrganizationSource({ ...input, definition: nextDefinition })).toEqual(
    installed,
  )
  expect(await installToolOrganizationSource(input)).toEqual({ kind: 'unavailable' })
  const updated = await w.owner.readTarget(installed.source.target)
  expect(updated).toMatchObject({
    kind: 'found',
    projection: {
      ownerRevision: 3,
      grants: [],
      definition: nextDefinition,
    },
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'rebind-identity',
      expectedRevision: 3,
      record: { ...record, definition: { ...nextDefinition, providerId: 'another-owner' } },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await installToolOrganizationSource({ ...input, definition: nextDefinition })).toEqual({
    kind: 'unavailable',
  })
  expect(await w.owner.readTarget(installed.source.target)).toMatchObject({
    kind: 'found',
    projection: {
      ownerRevision: 4,
      definition: { providerId: 'another-owner' },
    },
  })
})
