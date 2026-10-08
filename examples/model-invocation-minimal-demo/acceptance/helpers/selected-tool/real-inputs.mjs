import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sdk } from './sdk.mjs'

export async function createRealInputs(directory) {
  const [
    S,
    SQL,
    I,
    AI,
    OG,
    ST,
    SEED,
    EIS,
    PUB,
    HISTORY,
    FIXED,
    AM,
    REG,
    KB,
    CLOCK,
    CREDENTIAL,
    IDENTITY,
    GOVERNANCE,
    REGISTRATION,
    JSON,
    EVAL,
    ASSET,
    ADMISSION,
  ] = await Promise.all([
    sdk('packages/core/storage'),
    sdk('packages/infra/storage-sql'),
    sdk('packages/core/identity-values'),
    sdk('packages/tenancy/account-identity-sql'),
    sdk('packages/tenancy/organization-governance-sql'),
    sdk('packages/session/session-tenancy-table'),
    sdk('packages/session/session-tenancy-table', './seed'),
    sdk('packages/assets/evaluation-input-store'),
    sdk('packages/assets/evaluation-input-store', './publication'),
    sdk('packages/assets/evaluation-input-store', './registry-history'),
    sdk('packages/assets/evaluation-input-store', './registry-inputs'),
    sdk('packages/assets/assembly-manifest-store'),
    sdk('packages/tools/asset-registry-local'),
    sdk('packages/core/kernel-basis', './testing'),
    sdk('packages/infra/clock-lease', './cordis'),
    sdk('packages/tenancy/credential-verification-scrypt', './cordis'),
    sdk('packages/tenancy/account-identity-sql', './cordis'),
    sdk('packages/tenancy/organization-governance-sql', './cordis'),
    sdk('packages/tenancy/account-registration-sequential', './cordis'),
    sdk('packages/core/content-blocks'),
    sdk('packages/core/asset-evaluation'),
    sdk('packages/core/asset-model'),
    sdk('packages/core/tool-admission'),
  ])
  const keys = { activation: I.generateHandoffKeyPair(), purge: I.generateHandoffKeyPair() }
  const storage = await SQL.openStorage({
    dialect: 'sqlite',
    file: join(directory, 'state.sqlite'),
    upgrade: false,
    migrations: S.composeMigrations([
      ...AI.accountIdentityMigrations,
      ...OG.organizationGovernanceMigrations({
        ownerAccountReference: { table: AI.ACCOUNT_TABLE, column: AI.ACCOUNT_ID_COLUMN },
        ownerAccountForeignKey: 'organization_owner_account_fk',
      }),
      ...(await sdk('packages/infra/clock-lease')).clockMigrations,
      ...ST.sessionTenancyMigrations,
      ...EIS.evaluationInputMigrations,
      ...AM.assemblyManifestMigrations,
      ...(await sdk('packages/session/session-log-sql')).sessionLogMigrations,
      ...(await sdk('packages/session/runtime-context-local')).runtimeContextMigrations,
    ]),
  })
  const assembly = await KB.bootAssembly({
    services: [{ name: 'storage', value: storage }],
    plugins: [
      { plugin: CLOCK.clockPlugin, config: {} },
      // Explicit low-cost credential configuration belongs only to this verification assembly.
      {
        plugin: CREDENTIAL.credentialsPlugin,
        config: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
      },
      {
        plugin: IDENTITY.accountIdentityPlugin,
        config: {
          credentialPolicy: { minLength: 8 },
          unactivatedRetention: 3600000,
          activationVerificationKeyPem: keys.activation.publicKeyPem,
          purgeVerificationKeyPem: keys.purge.publicKeyPem,
        },
      },
      {
        plugin: GOVERNANCE.organizationGovernancePlugin,
        config: {
          invitationTtlDefault: 3600000,
          affiliationRequestTtlDefault: 3600000,
          teamCreationKeyRetention: 3600000,
          purgeSigningKeyPem: keys.purge.privateKeyPem,
        },
      },
      {
        plugin: REGISTRATION.registrationPlugin,
        config: { activationSigningKeyPem: keys.activation.privateKeyPem },
      },
    ],
  })
  const { registration, logins, memberships, clock } = assembly.ctx
  const loginName = `selected-tool-${randomUUID()}`,
    password = randomUUID()
  assert.equal(await registration.register(loginName, password), 'registered')
  const issued = await logins.issue(loginName, password)
  assert.ok('ok' in issued)
  const exchanged = await logins.exchange(issued.ok.presentation)
  assert.ok('ok' in exchanged)
  const current = await memberships.currentTenant(exchanged.ok.loginStateId)
  assert.ok('ok' in current)
  const tenant = current.ok,
    session = `selected-tool-session-${randomUUID()}`,
    scope = { tenant, session }
  // Restricted acceptance bootstrap only. This is not a formal Session creation implementation.
  assert.equal(await storage.write(tx => SEED.seedHoldingTenant(tx, session, tenant)), 'created')
  const sessionTenancy = ST.createSessionTenancyReader(storage)
  const root = { category: 'agent_definition', name: 'selected-tool_root' }
  const tool = { category: 'tool', name: 'selected-tool_echo' }
  const extension = { category: 'loop_extension', name: ADMISSION.OFFICIAL_ADMISSION_NAME }
  const at = new Date().toISOString()
  const definition = description => ({
    name: tool.name,
    description,
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo.' } },
      required: ['text'],
    },
    permissions: { execute: { default: 'auto' } },
  })
  const factoryDefinition = definition('Return the factory marker.')
  const tenantDefinition = definition('Return the tenant marker.')
  const asset = (id, cap, content, customized = false) => ({
    id,
    capability: cap,
    origin: customized ? 'customized' : 'official',
    ...(customized ? { owner: { kind: 'tenant', tenant }, author: tenant, byAgent: false } : {}),
    versions: [
      { number: 1, content, publishedAt: at, ...(customized ? { publishedBy: tenant } : {}) },
    ],
  })
  const definitions = [
    asset('selected-tool-root', root, {
      category: 'agent_definition',
      body: JSON.toOpaqueJson({
        references: [{ capability: tool }, { capability: extension }],
        attributes: [],
      }),
    }),
    asset('selected-tool-factory', tool, { category: 'tool', definition: factoryDefinition }),
    asset('selected-tool-tenant', tool, { category: 'tool', definition: tenantDefinition }, true),
    asset('selected-tool-admission', extension, {
      category: 'loop_extension',
      extension: {
        name: extension.name,
        position: 'before_action',
        power: 'veto',
        implementation: { kind: 'builtin', builtinName: extension.name },
      },
    }),
  ]
  const holding = (cap, id, layer) => ({
    holder: layer === 'tenant' ? { layer, tenant } : { layer },
    capability: cap,
    asset: id,
    basis: { kind: layer === 'tenant' ? 'owned' : 'official' },
    versionSelection: { kind: 'current' },
    immutable: false,
    assignments: [],
    since: at,
  })
  const diagnostics = []
  const deps = {
    storage,
    storeKey: 'selected-tool-live-inputs',
    sessionTenancy,
    memberships,
    deployedOfficial: [root, tool, extension].map(capability => ({ capability, meta: false })),
    diagnostics: event => diagnostics.push(event),
    onDiagnosticFailure: () => {
      throw new Error('Input diagnostic failed')
    },
    monotonicNow: process.hrtime.bigint,
  }
  const publication = await PUB.publishLocalInputs(deps, {
    expectedRevision: null,
    definitions,
    scopes: [
      {
        holder: { layer: 'factory' },
        holdings: [
          holding(root, 'selected-tool-root', 'factory'),
          holding(tool, 'selected-tool-factory', 'factory'),
          holding(extension, 'selected-tool-admission', 'factory'),
        ],
      },
      { holder: { layer: 'organization', organization: tenant.organization }, holdings: [] },
      {
        holder: { layer: 'tenant', tenant },
        holdings: [holding(tool, 'selected-tool-tenant', 'tenant')],
      },
    ],
  })
  assert.ok('revision' in publication, JSON.writeJsonLossless(publication))
  const recipe = await PUB.captureSessionRecipe(deps, { session, tenant, rootDefinition: root })
  assert.ok('captured' in recipe, JSON.writeJsonLossless(recipe))
  const reader = EIS.createEvaluationInputReader(deps)
  const input = await reader.read(session, tenant)
  assert.ok('input' in input, JSON.writeJsonLossless(input))
  const evaluation = EVAL.evaluate(input.input)
  assert.ok('ok' in evaluation, JSON.writeJsonLossless(evaluation))
  const selected = evaluation.ok.assets.filter(item => item.capability.category === 'tool')
  assert.equal(selected.length, 1)
  assert.equal(selected[0].asset, 'selected-tool-tenant')
  assert.deepEqual(selected[0].replaced, ['factory'])
  const manifest = AM.createAssemblyManifestStore(storage)
  const history = HISTORY.createRegistryHistoryReader({ ...deps, manifestHistory: manifest })
  const fixed = FIXED.createRegistryInputReader(deps)
  const assets = REG.createAssetRegistry({
    manifest,
    clock,
    sessionTenancy,
    currentInputs: reader,
    fixedRootInput: fixed,
    historicalBody: history,
    deployedMeta: [],
    diagnostic: event => diagnostics.push(event),
    diagnosticFailure: () => {
      throw new Error('Registry diagnostic failed')
    },
    monotonicNow: process.hrtime.bigint,
    conflictPolicy: { maxRetries: 2 },
    maxInFlight: 8,
  })
  const filled = await assets.fill(
    session,
    evaluation.ok,
    `selected-tool-evaluation-${randomUUID()}`,
    [tool, extension],
  )
  assert.ok('snapshots' in filled, JSON.writeJsonLossless(filled))
  const report = await assets.refreshAvailability(
    session,
    { kind: 'start', runId: 'selected-tool-run' },
    1,
  )
  assert.ok('report' in report, JSON.writeJsonLossless(report))
  const found = await assets.lookup(session, 'tool', tool.name, {
    kind: 'run',
    report: report.report,
  })
  assert.ok('entry' in found, JSON.writeJsonLossless(found))
  assert.equal(found.entry.asset, 'selected-tool-tenant')
  await writeFile(join(directory, 'current-input.json'), JSON.writeJsonLossless(input.input), {
    mode: 0o600,
  })
  await writeFile(
    join(directory, 'selection.json'),
    JSON.writeJsonLossless({ evaluation, report, entry: found.entry }),
    { mode: 0o600 },
  )
  return {
    storage,
    assembly,
    logins,
    memberships,
    clock,
    actor: { account: exchanged.ok.accountId, loginState: exchanged.ok.loginStateId, tenant },
    sessionTenancy,
    scope,
    reader,
    manifest,
    history,
    fixed,
    assets,
    report: report.report,
    definitions,
    selected: {
      name: found.entry.name ?? tool.name,
      capability: ASSET.capabilityCanonicalString(tool),
      asset: found.entry.asset,
      version: JSON.jsonNumberSource(selected[0].version),
      definition: found.entry.content.definition,
    },
    JSON,
    I,
    async close() {
      await assets.close()
      await fixed.close()
      await history.close()
      await manifest.close()
      await reader.close()
      await sessionTenancy.close()
      await assembly.dispose()
      await storage.close()
    },
  }
}
