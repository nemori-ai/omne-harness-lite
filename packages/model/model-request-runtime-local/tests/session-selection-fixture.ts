import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  accountIdentityMigrations,
  accountIdentityPlugin,
  ACCOUNT_TABLE,
  ACCOUNT_ID_COLUMN,
  type LoginsService,
} from '@omne-harness-lite/account-identity'
import {
  registrationPlugin,
  type RegistrationService,
} from '@omne-harness-lite/account-registration'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import { clockMigrations, clockPlugin } from '@omne-harness-lite/clock'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  organizationGovernanceMigrations,
  organizationGovernancePlugin,
  type MembershipsService,
} from '@omne-harness-lite/organization-governance'
import { composeMigrations, narrow } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { modelCallContentMigrations } from '../src/reference-content.ts'
import {
  createSessionTenancyReader,
  sessionTenancyMigrations,
} from '@omne-harness-lite/session-tenancy-table'
import {
  createEvaluationInputReader,
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import {
  publishLocalInputs,
  captureSessionRecipe,
} from '@omne-harness-lite/evaluation-input-store/publication'
import {
  toOpaqueJson,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  AssetDefinition,
  AssetHolding,
  AttributeAssignment,
} from '@omne-harness-lite/asset-model'
import type { ModelCatalog, ProfileRow } from '@omne-harness-lite/model-profile-directory'
import { modelProfileDirectoryPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createSessionModelSelection } from '../src/session-selection.ts'
import { type SessionModelSelectionInput } from '../src/session-selection-types.ts'
import { ControlledSettlementOwner } from './settlement-fixture.ts'

export const ROOT = { category: 'agent_definition', name: 'example:selection-root' } as const
export const AT = '2026-09-28T00:00:00Z'
const PASSWORD = 'test-only-selection-password'
function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function memberships(value: unknown): value is MembershipsService {
  return object(value) && typeof value.participate === 'function'
}
function registration(value: unknown): value is RegistrationService {
  return object(value) && typeof value.register === 'function'
}
function logins(value: unknown): value is LoginsService {
  return object(value) && typeof value.issue === 'function' && typeof value.exchange === 'function'
}
function catalog(value: unknown): value is ModelCatalog {
  return (
    object(value) &&
    typeof value.listProfiles === 'function' &&
    typeof value.registerProfile === 'function'
  )
}
export function rootBody(model = true): JsonObject {
  const normative = readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/agent-definition/v1/examples.md',
      import.meta.url,
    ),
    'utf8',
  )
  const block = [...normative.matchAll(/```json\n([\s\S]*?)\n```/gu)][1]?.[1]
  if (block === undefined) throw new Error('Missing AD1 example')
  const parsed = readJsonStrict(block)
  if ('failed' in parsed || !object(parsed.ok) || !Array.isArray(parsed.ok.attributes))
    throw new Error('Invalid AD1 example')
  return {
    references: [],
    attributes: parsed.ok.attributes.filter(
      item => model || !object(item) || item.item !== 'model',
    ),
  }
}
export function profile(name = 'example/model-a'): ProfileRow['profile'] {
  return {
    routeName: name,
    origin: 'official',
    registration: 'listed',
    providers: ['test'],
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
      implementation: { name: 'test', revision: '1' },
      definition: { modelId: name, revision: '1' },
      configuration: { revision: '1', values: {} },
    },
    updatedAt: AT,
  }
}
export async function selectionHost(model = true, factoryCredential = false) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-session-selection-'))
  const keys = { activation: generateHandoffKeyPair(), purge: generateHandoffKeyPair() }
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'state.sqlite'),
    upgrade: false,
    migrations: composeMigrations([
      ...accountIdentityMigrations,
      ...organizationGovernanceMigrations({
        ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
        ownerAccountForeignKey: 'selection_owner_fk',
      }),
      ...clockMigrations,
      ...sessionTenancyMigrations,
      ...evaluationInputMigrations,
      ...modelProfileDirectoryMigrations,
      ...modelCallContentMigrations('sqlite'),
    ]),
  })
  const manifest = {
    ordinal: 1,
    entries: ['example/model-a', 'example/model-b'].map(name => {
      const { registration: _registration, updatedAt: _updatedAt, ...content } = profile(name)
      return content
    }),
  }
  const assembly = await bootAssembly({
    services: [{ name: 'storage', value: storage }],
    plugins: [
      { plugin: clockPlugin, config: {} },
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
      {
        plugin: modelProfileDirectoryPlugin,
        config: {
          faceMode: 'singleProcessCatalog',
          officialManifest: manifest,
          ...(factoryCredential ? { factoryCredentialRef: 'test-only-factory-ref' } : {}),
        },
      },
    ],
  })
  const membershipService: unknown = assembly.ctx.get('memberships'),
    registrationService: unknown = assembly.ctx.get('registration'),
    loginService: unknown = assembly.ctx.get('logins'),
    catalogService: unknown = assembly.ctx.get('modelCatalog')
  if (
    !memberships(membershipService) ||
    !registration(registrationService) ||
    !logins(loginService) ||
    !catalog(catalogService)
  )
    throw new Error('Real services missing')
  const actualCatalog = catalogService
  if ((await registrationService.register('selection-user', PASSWORD)) !== 'registered')
    throw new Error('Real registration failed')
  const issued = await loginService.issue('selection-user', PASSWORD)
  if (!('ok' in issued)) throw new Error('Real issue failed')
  const exchanged = await loginService.exchange(issued.ok.presentation)
  if (!('ok' in exchanged)) throw new Error('Real login failed')
  const current = await membershipService.currentTenant(exchanged.ok.loginStateId)
  if (!('ok' in current)) throw new Error('Real current tenant failed')
  const tenant = current.ok
  const parsedSession = parseOpaqueIdentifier('session_selection', 'SessionRef')
  if (!('ok' in parsedSession)) throw new Error('Session syntax')
  const session = parsedSession.ok
  // Controlled owner setup only: actual persistent mapping, not product cross-owner atomic creation.
  await storage.write(
    async tx =>
      await narrow<{ session_tenancy: { session: string; tenant: string } }>(tx)
        .insertInto('session_tenancy')
        .values({ session, tenant: writeJsonLossless(tenant) })
        .execute(),
  )
  const tenancy = createSessionTenancyReader(storage)
  const deps: InputSourceDependencies = {
    storage,
    storeKey: 'selection-inputs',
    deployedOfficial: [{ capability: ROOT, meta: false }],
    memberships: membershipService,
    sessionTenancy: tenancy,
    diagnostics() {},
    onDiagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
  }
  const reader = createEvaluationInputReader(deps)
  const definition: AssetDefinition = {
    id: 'selection_root_asset',
    capability: ROOT,
    origin: 'official',
    versions: [
      {
        number: 1,
        content: { category: 'agent_definition', body: toOpaqueJson(rootBody(model)) },
        publishedAt: AT,
      },
    ],
  }
  function holding(assignments: readonly AttributeAssignment[] = []): AssetHolding {
    return {
      holder: { layer: 'factory' },
      capability: ROOT,
      asset: definition.id,
      basis: { kind: 'official' },
      immutable: false,
      assignments,
      versionSelection: { kind: 'current' },
      since: AT,
    }
  }
  let revision: string | null = null
  async function publish(assignments: readonly AttributeAssignment[] = []) {
    const result = await publishLocalInputs(deps, {
      expectedRevision: revision,
      definitions: [definition],
      scopes: [
        { holder: { layer: 'factory' }, holdings: [holding()] },
        {
          holder: { layer: 'organization', organization: tenant.organization },
          holdings:
            assignments.length === 0
              ? []
              : [
                  {
                    ...holding(assignments),
                    holder: { layer: 'organization', organization: tenant.organization },
                  },
                ],
        },
        { holder: { layer: 'tenant', tenant }, holdings: [] },
      ],
    })
    if (!('revision' in result)) throw new Error(`Real publication failed: ${result.failure}`)
    revision = result.revision
  }
  await publish()
  const recipe = await captureSessionRecipe(deps, { session, tenant, rootDefinition: ROOT })
  if (!('captured' in recipe)) throw new Error(`Real recipe failed: ${recipe.failure}`)
  let log = await openJsonlSessionLog({
    dir: join(dir, 'log'),
    processOwnership: {
      current: `selection:${process.pid}`,
      async observeExit() {
        return 'unknown'
      },
    },
  })
  let generation = Object.freeze({})
  let owned: ReturnType<typeof createSessionModelSelection>[] = []
  function create(overrides: Partial<SessionModelSelectionInput> = {}) {
    const owner = new ControlledSettlementOwner()
    const input: SessionModelSelectionInput = {
      binding: { session, tenant, log, generation, currentGeneration: () => generation },
      owner,
      concurrent: 2,
      sessionTenancy: tenancy,
      catalog: actualCatalog,
      currentEvaluationInputs: reader,
      async projection(prefix) {
        // Actual full prefix: only records or known text UserMessages are covered in this M1 host.
        for (const entry of prefix.entries) {
          if (!object(entry.payload) || entry.payload.category !== 'record')
            return { unknown: true }
        }
        return { known: [] }
      },
      compatible(profile, projection) {
        const blocked = projection.filter(item => !profile.inputModalities.includes(item))
        return blocked.length === 0 ? { ok: true } : { blocked }
      },
      now: () => AT,
      diagnostic() {},
      onDiagnosticFailure() {},
      ...overrides,
    }
    const component = createSessionModelSelection(input)
    owned.push(component)
    return { component, owner, input }
  }
  return {
    dir,
    storage,
    tenant,
    session,
    tenancy,
    reader,
    catalog: actualCatalog,
    publish,
    create,
    get log() {
      return log
    },
    async replaceGeneration() {
      generation = Object.freeze({})
    },
    async reopen() {
      for (const value of owned) await value.close()
      owned = []
      await log.close()
      generation = Object.freeze({})
      log = await openJsonlSessionLog({
        dir: join(dir, 'log'),
        processOwnership: {
          current: `selection-reopen:${process.pid}`,
          async observeExit() {
            return 'unknown'
          },
        },
      })
    },
    async close() {
      for (const value of owned) await value.close()
      await log.close()
      await reader.close()
      await tenancy.close()
      await assembly.dispose()
      await storage.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
export function json(value: unknown): JsonValue {
  const copied = readJsonStrict(writeJsonLossless(value))
  if ('failed' in copied) throw new Error('JSON test capture')
  return copied.ok
}
