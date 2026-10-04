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
import {
  createAssemblyManifestStore,
  assemblyManifestMigrations,
} from '@omne-harness-lite/assembly-manifest-store'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createSessionTenancyReader,
  sessionTenancyMigrations,
} from '@omne-harness-lite/session-tenancy-table'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import {
  createEvaluationInputReader,
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import { publishLocalInputs } from '@omne-harness-lite/evaluation-input-store/publication'
import { createRegistryHistoryReader } from '@omne-harness-lite/evaluation-input-store/registry-history'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import { createAssetRegistry } from '@omne-harness-lite/asset-registry'

const activation = generateHandoffKeyPair(),
  purge = generateHandoffKeyPair()
export const session = 'runner_chain_session'
export const root = { category: 'agent_definition', name: 'example:root' } as const
export const a = { category: 'loop_extension', name: 'example:a' } as const
export const b = { category: 'loop_extension', name: 'example:b' } as const
const at = '2026-09-29T00:00:00Z'
export async function chainHost() {
  const directory = await mkdtemp(join(tmpdir(), 'omne-runner-chain-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'state.sqlite'),
    upgrade: false,
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
  })
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
          activationVerificationKeyPem: activation.publicKeyPem,
          purgeVerificationKeyPem: purge.publicKeyPem,
        },
      },
      {
        plugin: organizationGovernancePlugin,
        config: {
          invitationTtlDefault: 3600000,
          affiliationRequestTtlDefault: 3600000,
          teamCreationKeyRetention: 3600000,
          purgeSigningKeyPem: purge.privateKeyPem,
        },
      },
      { plugin: registrationPlugin, config: { activationSigningKeyPem: activation.privateKeyPem } },
    ],
  })
  // This assembly's named services are supplied by the actual typed plugins above.
  const memberships = assembly.ctx.get('memberships') as MembershipsService
  const registration = assembly.ctx.get('registration') as RegistrationService
  const logins = assembly.ctx.get('logins') as LoginsService
  if ((await registration.register('runner', 'fixture-password')) !== 'registered')
    throw new Error('registration failed')
  const issued = await logins.issue('runner', 'fixture-password')
  if (!('ok' in issued)) throw new Error('login failed')
  const exchanged = await logins.exchange(issued.ok.presentation)
  if (!('ok' in exchanged)) throw new Error('exchange failed')
  const current = await memberships.currentTenant(exchanged.ok.loginStateId)
  if (!('ok' in current)) throw new Error('tenant failed')
  const tenant = current.ok
  await storage.write(async tx => {
    await narrow<{ session_tenancy: { session: string; tenant: string } }>(tx)
      .insertInto('session_tenancy')
      .values({ session, tenant: writeJsonLossless(tenant) })
      .execute()
  })
  const sessionTenancy = createSessionTenancyReader(storage)
  const manifest = createAssemblyManifestStore(storage)
  const references = [b, a].map(capability => ({ capability }))
  const extensions: NonConnectorEvaluationInput['definitions'] = [a, b].map(capability => {
    const definition = judgeDefinition({
      name: capability.name,
      position: 'before_model_call',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: capability.name },
    })
    if ('rejected' in definition) throw new Error('fixture extension rejected')
    return {
      id: `ast_${capability.name.split(':')[1]}`,
      capability,
      origin: 'official',
      versions: [
        {
          number: 1,
          content: { category: 'loop_extension', extension: definition.ok },
          publishedAt: at,
        },
      ],
    }
  })
  const definitions: NonConnectorEvaluationInput['definitions'] = [
    {
      id: 'ast_root',
      capability: root,
      origin: 'official',
      versions: [
        {
          number: 1,
          content: {
            category: 'agent_definition',
            body: toOpaqueJson({ references, attributes: [] }),
          },
          publishedAt: at,
        },
      ],
    },
    ...extensions,
  ]
  const input: NonConnectorEvaluationInput = {
    tenant,
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references,
      attributes: [],
      source: { asset: 'ast_root', version: 1 },
    },
    definitions,
    holdings: definitions.map(definition => ({
      holder: { layer: 'factory' },
      capability: definition.capability,
      asset: definition.id,
      basis: { kind: 'official' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: [],
      since: at,
    })),
  }
  const evaluated = evaluate(input)
  if (!('ok' in evaluated)) throw new Error(`evaluation failed: ${writeJsonLossless(evaluated)}`)
  const deps: InputSourceDependencies = {
    storage,
    storeKey: 'runner-history',
    deployedOfficial: [a, b].map(capability => ({ capability, meta: false })),
    sessionTenancy,
    memberships,
    diagnostics() {},
    onDiagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
  }
  const publication = await publishLocalInputs(deps, {
    expectedRevision: null,
    definitions: extensions,
    scopes: [
      {
        holder: { layer: 'factory' },
        holdings: input.holdings.filter(item => item.capability.category === 'loop_extension'),
      },
    ],
  })
  if (!('revision' in publication)) throw new Error(`publication failed: ${publication.failure}`)
  const history = createRegistryHistoryReader({ ...deps, manifestHistory: manifest })
  const inputs = createEvaluationInputReader(deps)
  let currentInput = input
  const registry = createAssetRegistry({
    manifest,
    sessionTenancy,
    historicalBody: history,
    currentInputs: {
      async read() {
        return { input: currentInput }
      },
    },
    fixedRootInput: {
      async read() {
        return { input: currentInput }
      },
    },
    clock: assembly.ctx.get('clock') as Parameters<typeof createAssetRegistry>[0]['clock'],
    deployedMeta: [],
    diagnostic() {},
    diagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
    conflictPolicy: { maxRetries: 1 },
    maxInFlight: 4,
  })
  const binding = { session, tenant, logGeneration: 'physical_runner_log' }
  const evaluation = evaluated.ok
  const order = [b, a]
  const composition = order.map(capability => {
    const asset = evaluation.assets.find(item => item.capability.name === capability.name)
    if (!asset) throw new Error('missing asset')
    return {
      capability: asset.capability,
      asset: asset.asset,
      version: asset.version,
      from: asset.from,
    }
  })
  return {
    registry,
    async publishNewerBodies() {
      return publishLocalInputs(deps, {
        expectedRevision: publication.revision,
        definitions: extensions.map(asset => ({
          ...asset,
          versions: [
            ...asset.versions,
            {
              number: 2,
              content: {
                category: 'loop_extension',
                extension: {
                  name: asset.capability.name,
                  position: 'after_persist_message',
                  power: 'observe',
                  implementation: { kind: 'builtin', builtinName: 'example:new-generation' },
                },
              },
              publishedAt: '2026-09-29T01:00:00Z',
            },
          ],
        })),
        scopes: [
          {
            holder: { layer: 'factory' },
            holdings: input.holdings.filter(item => item.capability.category === 'loop_extension'),
          },
        ],
      })
    },
    setInput(value: NonConnectorEvaluationInput) {
      currentInput = value
    },
    storage,
    assembly,
    sessionTenancy,
    manifest,
    history,
    inputs,
    input,
    evaluation,
    order,
    composition,
    binding,
    sources: { sessionTenancy, manifest, history, isActive: () => true },
    record(at: number, kind: 'given' | 'reuse' | 'mint' = 'given', entries = composition) {
      return {
        evaluation: kind === 'mint' ? { kind } : { kind, ref: 'evaluation_one' },
        tables: { loop_extension: { filledAt: at, composition: entries } },
        content: {
          evaluation,
          compositionOrder: order,
          filledBy:
            kind === 'given'
              ? { kind: 'assembly' }
              : kind === 'reuse'
                ? { kind: 'asset_change' }
                : { kind: 'reload', command: 'omne-official:reload-loop_extension' },
        },
      }
    },
    async close() {
      await registry.close()
      await history.close()
      await inputs.close()
      await sessionTenancy.close()
      await manifest.close()
      await assembly.dispose()
      await storage.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
export type ChainHost = Awaited<ReturnType<typeof chainHost>>
