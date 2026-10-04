import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateHandoffKeyPair,
  parseTenantId,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { bootAssembly, type Assembly } from '@omne-harness-lite/kernel-basis/testing'
import { composeMigrations, type MigrationFragment } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { clockMigrations, clockPlugin } from '@omne-harness-lite/clock'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import { type MembershipsService } from '@omne-harness-lite/organization-governance'
import type { ModelProfileContent, ModelProfileRef } from '@omne-harness-lite/model-profile'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { modelProfileDirectoryMigrations } from '../src/migrations.ts'
import { MODEL_DIRECTORY_DIAGNOSTICS } from '@omne-harness-lite/model-profile-directory/cordis'
import { modelProfileDirectoryPlugin } from '../src/cordis.ts'
import type {
  ModelCatalog,
  ModelCatalogRead,
  OfficialManifest,
  DiagnosticSink,
  ProfileRow,
} from '@omne-harness-lite/model-profile-directory'

export const alice = unwrap(parseTenantId({ organization: 'O', account: 'Alice' }))
export const bob = unwrap(parseTenantId({ organization: 'O', account: 'Bob' }))
export const outsider = unwrap(parseTenantId({ organization: 'Q', account: 'Other' }))
export const scope = { layer: 'tenant', tenant: alice } as const
export function content(
  routeName = 'route',
  revision = 'c1',
  values: ModelProfileContent['adaptation']['configuration']['values'] = {},
): ModelProfileContent {
  return {
    routeName,
    origin: 'custom',
    providers: ['provider'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 512,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation: {
      implementation: { name: 'unregistered', revision: 'i1' },
      definition: { modelId: routeName, revision: 'd1' },
      configuration: { revision, values },
    },
  }
}
export const official = (
  routeName = 'official',
  revision = 'c1',
  values: ModelProfileContent['adaptation']['configuration']['values'] = {},
): ModelProfileContent => ({ ...content(routeName, revision, values), origin: 'official' })
const seed: MigrationFragment = {
  name: 'directory_test_memberships_seed',
  migration: {
    async up(db) {
      await db.schema
        .createTable('directory_test_account')
        .addColumn('account_id', 'text', c => c.primaryKey())
        .execute()
    },
  },
}
export function file(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-directory-${label}-`)), 'db.sqlite')
}
export async function open(file: string): Promise<SqlStorage> {
  return openStorage({
    dialect: 'sqlite',
    file,
    upgrade: false,
    migrations: composeMigrations([
      seed,
      ...organizationGovernanceMigrations({
        ownerAccountReference: { table: 'directory_test_account', column: 'account_id' },
        ownerAccountForeignKey: 'directory_test_owner_fk',
      }),
      ...clockMigrations,
      ...modelProfileDirectoryMigrations,
    ]),
  })
}
export async function seedMemberships(storage: SqlStorage): Promise<void> {
  await storage.write(async tx => {
    for (const organization of ['O', 'Q'])
      await tx.db
        .insertInto('organization')
        .values({
          organization_id: organization,
          kind: 'team',
          parent: null,
          owner_account: null,
          created_at: 1,
        })
        .onConflict(oc => oc.column('organization_id').doNothing())
        .execute()
    for (const tenant of [alice, bob, outsider])
      await tx.db
        .insertInto('membership')
        .values({
          organization_id: tenant.organization,
          account_id: tenant.account,
          effective: 1,
          role: tenant === bob ? 'member' : 'superAdministrator',
        })
        .onConflict(oc => oc.columns(['organization_id', 'account_id']).doNothing())
        .execute()
  })
}
export function service<T>(
  assembly: Assembly,
  key: string,
  check: (value: unknown) => value is T,
): T {
  const value: unknown = assembly.ctx.get(key)
  if (!check(value)) throw new Error(`missing test service ${key}`)
  return value
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
export function catalog(assembly: Assembly): ModelCatalog {
  return service(
    assembly,
    'modelCatalog',
    (value): value is ModelCatalog => record(value) && typeof value.registerProfile === 'function',
  )
}
export function reading(assembly: Assembly): ModelCatalogRead {
  return service(
    assembly,
    'modelCatalogRead',
    (value): value is ModelCatalogRead => record(value) && typeof value.listProfiles === 'function',
  )
}
export function memberships(assembly: Assembly): MembershipsService {
  return service(
    assembly,
    'memberships',
    (value): value is MembershipsService => record(value) && typeof value.standing === 'function',
  )
}
export async function boot(
  storage: SqlStorage,
  manifest: OfficialManifest = { ordinal: 1, entries: [] },
  diagnostics?: DiagnosticSink,
  sharedClock?: Clock,
  onWithdraw?: (ref: ModelProfileRef) => void,
): Promise<Assembly> {
  const keys = generateHandoffKeyPair()
  // Real memberships/clock, but trusted fixture rows and unused accounts/logins stubs.
  // This establishes v1 standing consumption, not real login or bootstrap provenance.
  return bootAssembly({
    services: [
      ...(diagnostics === undefined ? [] : [{ name: MODEL_DIRECTORY_DIAGNOSTICS, value: diagnostics }]),
      { name: 'storage', value: storage },
      ...(sharedClock === undefined ? [] : [{ name: 'clock', value: sharedClock }]),
      {
        name: 'accounts',
        value: {
          participate: () => ({
            read: () => {
              throw new Error('unused account fixture')
            },
          }),
        },
      },
      {
        name: 'logins',
        value: {
          participate: () => ({
            verify: () => {
              throw new Error('unused login fixture')
            },
          }),
        },
      },
    ],
    plugins: [
      ...(sharedClock === undefined ? [{ plugin: clockPlugin, config: {} }] : []),
      {
        plugin: organizationGovernancePlugin,
        config: {
          invitationTtlDefault: 1000,
          affiliationRequestTtlDefault: 1000,
          teamCreationKeyRetention: 1000,
          purgeSigningKeyPem: keys.privateKeyPem,
        },
      },
      {
        plugin: {
          name: 'directory-test-observer',
          apply(ctx: import('@deepseek-ai/cordis').Context) {
            if (onWithdraw !== undefined) ctx.on('profile.withdrawn', onWithdraw)
          },
        },
      },
      {
        plugin: modelProfileDirectoryPlugin,
        config: {
          faceMode: 'singleProcessCatalog',
          officialManifest: manifest,
          factoryCredentialRef: 'factory-ref',
        },
      },
    ],
  })
}
export function actualClock(assembly: Assembly): Clock {
  return service(
    assembly,
    'clock',
    (value): value is Clock => record(value) && typeof value.now === 'function',
  )
}
export async function setup(label: string, manifest?: OfficialManifest) {
  const path = file(label)
  const storage = await open(path)
  await seedMemberships(storage)
  const assembly = await boot(storage, manifest)
  return {
    path,
    storage,
    assembly,
    catalog: catalog(assembly),
    read: reading(assembly),
    close: async () => {
      await assembly.dispose()
      await storage.close()
    },
  }
}
export function expectRow(result: ProfileRow | { readonly failure: string }): ProfileRow {
  if ('failure' in result) throw new Error(`expected profile: ${result.failure}`)
  return result
}
export async function setEffective(
  storage: SqlStorage,
  tenant: TenantId,
  effective: boolean,
): Promise<void> {
  await storage.write(async tx => {
    await tx.db
      .updateTable('membership')
      .set({ effective: effective ? 1 : 0 })
      .where('organization_id', '=', tenant.organization)
      .where('account_id', '=', tenant.account)
      .execute()
  })
}
