import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  accountIdentityMigrations,
  ACCOUNT_TABLE,
  ACCOUNT_ID_COLUMN,
} from '@omne-harness-lite/account-identity-sql'
import { accountIdentityPlugin } from '@omne-harness-lite/account-identity-sql/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import { registrationPlugin } from '@omne-harness-lite/account-registration-sequential/cordis'
import { type RegistrationService } from '@omne-harness-lite/account-registration'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification-scrypt/cordis'
import { clockMigrations } from '@omne-harness-lite/clock-lease'
import { clockPlugin } from '@omne-harness-lite/clock-lease/cordis'
import { generateHandoffKeyPair, type TenantId } from '@omne-harness-lite/identity-values'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import {
  type MembershipsService,
  type OrganizationsService,
  type OffersService,
} from '@omne-harness-lite/organization-governance'
import { composeMigrations, narrow } from '@omne-harness-lite/storage'
import { assemblyManifestMigrations } from '@omne-harness-lite/assembly-manifest-store'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createSessionTenancyReader,
  sessionTenancyMigrations,
} from '@omne-harness-lite/session-tenancy-table'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  AssetDefinition,
  AssetHolding,
  AttributeAssignment,
  CapabilityId,
  HoldingScope,
} from '@omne-harness-lite/asset-model'
import {
  createEvaluationInputReader,
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '../src/index.ts'
import { publishLocalInputs, captureSessionRecipe } from '../src/publication.ts'

export const ROOT: CapabilityId = { category: 'agent_definition', name: 'example:assistant' }
export const AT = '2026-09-27T00:00:00Z'
const PASSWORD = 'only-test-credential'
export const deployments = [{ capability: ROOT, meta: false }]
export const keys = { activation: generateHandoffKeyPair(), purge: generateHandoffKeyPair() }
export function parsed(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error('invalid test JSON')
  return result.ok
}
const normative = readFileSync(
  new URL(
    '../../../core/agent-definition/tests/fixtures/agent-definition-examples.md',
    import.meta.url,
  ),
  'utf8',
)
const fixture = [...normative.matchAll(/```json\n([\s\S]*?)\n```/gu)][1]?.[1]
if (fixture === undefined) throw new Error('missing normative AD1 example')
export function body(model = 'example/model-a'): JsonObject {
  const original = parsed(fixture as string) as JsonObject
  if (!Array.isArray(original.attributes)) throw new Error('missing normative declaration array')
  return {
    references: [],
    attributes: original.attributes.map(attribute => {
      const item = attribute as JsonObject
      return item.item === 'model' ? { ...item, default: model } : item
    }),
    uninterpreted: parsed('{"integer":9007199254740993,"decimal":0.10000000000000000001}'),
  }
}
export function asset(versions: readonly JsonObject[] = [body()]): AssetDefinition {
  return {
    id: 'ast_root',
    capability: ROOT,
    origin: 'official',
    versions: versions.map((entry, index) => ({
      number: index + 1,
      content: { category: 'agent_definition', body: entry },
      publishedAt: AT,
    })),
  } as unknown as AssetDefinition
}
export function assignment(item: string, value: JsonValue, immutable = false): AttributeAssignment {
  return { item, value, immutable, since: AT }
}
export function holding(
  holder: HoldingScope,
  assignments: readonly AttributeAssignment[] = [],
): AssetHolding {
  return {
    holder,
    capability: ROOT,
    asset: 'ast_root',
    basis: { kind: 'official' },
    immutable: false,
    assignments,
    versionSelection: { kind: 'current' },
    since: AT,
  }
}
export async function boot(
  file?: string,
  deployedOfficial: InputSourceDependencies['deployedOfficial'] = deployments,
) {
  const directory = file === undefined ? await mkdtemp(join(tmpdir(), 'omne-eis-')) : undefined
  const databaseFile = file ?? join(directory as string, 'state.sqlite')
  const storage = await openStorage({
    dialect: 'sqlite',
    file: databaseFile,
    migrations: composeMigrations([
      ...accountIdentityMigrations,
      ...organizationGovernanceMigrations({
        ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
        ownerAccountForeignKey: 'organization_owner_account_fk',
      }),
      ...clockMigrations,
      ...sessionTenancyMigrations,
      ...evaluationInputMigrations,
      ...assemblyManifestMigrations,
    ]),
    upgrade: false,
  })
  const assembly = await bootAssembly({
    services: [{ name: 'storage', value: storage }],
    plugins: [
      { plugin: clockPlugin, config: {} },
      // Reduced scrypt work only in this test composition; no product policy default.
      {
        plugin: credentialsPlugin,
        config: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
      },
      {
        plugin: accountIdentityPlugin,
        config: {
          credentialPolicy: { minLength: 8 },
          unactivatedRetention: 3600000,
          activationVerificationKeyPem: keys.activation.publicKeyPem,
          purgeVerificationKeyPem: keys.purge.publicKeyPem,
        },
      },
      {
        plugin: organizationGovernancePlugin,
        config: {
          invitationTtlDefault: 3600000,
          affiliationRequestTtlDefault: 3600000,
          teamCreationKeyRetention: 3600000,
          purgeSigningKeyPem: keys.purge.privateKeyPem,
        },
      },
      {
        plugin: registrationPlugin,
        config: { activationSigningKeyPem: keys.activation.privateKeyPem },
      },
    ],
  })
  const memberships = assembly.ctx.get('memberships') as MembershipsService
  const organizations = assembly.ctx.get('organizations') as OrganizationsService
  const offers = assembly.ctx.get('offers') as OffersService
  const logins = assembly.ctx.get('logins') as LoginsService
  const registration = assembly.ctx.get('registration') as RegistrationService
  const sessionTenancy = createSessionTenancyReader(storage)
  const diagnostics: JsonObject[] = []
  const diagnosticFailures: string[] = []
  const deps: InputSourceDependencies = {
    storage,
    storeKey: 'local-model-inputs',
    deployedOfficial,
    memberships,
    sessionTenancy,
    diagnostics: event => {
      diagnostics.push(event)
    },
    onDiagnosticFailure: stage => {
      diagnosticFailures.push(stage)
    },
    monotonicNow: process.hrtime.bigint,
  }
  const reader = createEvaluationInputReader(deps)
  return {
    storage,
    assembly,
    memberships,
    organizations,
    offers,
    logins,
    registration,
    sessionTenancy,
    diagnostics,
    diagnosticFailures,
    deps,
    reader,
    file: databaseFile,
    async identity(name: string) {
      const registered = await registration.register(name, PASSWORD)
      if (registered !== 'registered') throw new Error(`registration failed: ${registered}`)
      const issued = await logins.issue(name, PASSWORD)
      if (!('ok' in issued)) throw new Error('real login issue failed')
      const exchanged = await logins.exchange(issued.ok.presentation)
      if (!('ok' in exchanged)) throw new Error('real login exchange failed')
      const current = await memberships.currentTenant(exchanged.ok.loginStateId)
      if (!('ok' in current)) throw new Error('real current tenant failed')
      return { tenant: current.ok, login: exchanged.ok, presentation: issued.ok.presentation }
    },
    async mapSession(session: string, tenant: TenantId) {
      // Corruption/setup fixture uses this owner's real DB, not the restricted production seed entry.
      await storage.write(async tx => {
        await narrow<{ session_tenancy: { session: string; tenant: string } }>(tx)
          .insertInto('session_tenancy')
          .values({ session, tenant: writeJsonLossless(tenant) })
          .execute()
      })
    },
    async initialize(tenant: TenantId, session = 'session_a') {
      const result = await publishLocalInputs(deps, {
        expectedRevision: null,
        definitions: [asset()],
        scopes: [
          { holder: { layer: 'factory' }, holdings: [holding({ layer: 'factory' })] },
          { holder: { layer: 'organization', organization: tenant.organization }, holdings: [] },
          { holder: { layer: 'tenant', tenant }, holdings: [] },
        ],
      })
      if (!('revision' in result)) throw new Error(`real publication failed: ${result.failure}`)
      await this.mapSession(session, tenant)
      const captured = await captureSessionRecipe(deps, { session, tenant, rootDefinition: ROOT })
      if (!('captured' in captured))
        throw new Error(`real recipe capture failed: ${captured.failure}`)
    },
    async close(remove = true) {
      await reader.close()
      await sessionTenancy.close()
      await assembly.dispose()
      await storage.close()
      if (remove && directory !== undefined) await rm(directory, { recursive: true, force: true })
    },
  }
}
export type Host = Awaited<ReturnType<typeof boot>>
export async function withHost(run: (host: Host) => Promise<void>) {
  const host = await boot()
  try {
    await run(host)
  } finally {
    await host.close()
  }
}
export function gate() {
  let release!: () => void
  let entered!: () => void
  const wait = new Promise<void>(resolve => {
    release = resolve
  })
  const reached = new Promise<void>(resolve => {
    entered = resolve
  })
  return {
    reached,
    release,
    async pause() {
      entered()
      await wait
    },
  }
}
