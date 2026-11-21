// @module-tag slow
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type StandingDestinationResolver,
} from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  standingDestinationResolverKey,
} from '@omne-harness/identity/cordis'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { createIndependentSettingsPoint, createSettingsRegistry } from '@omne-harness/settings'
import { createCategoryPoint } from '@omne-harness/assets'
import { toolCategoryDisplay } from '@omne-harness/tool-contract'
import { calendarEnvironmentSettings } from '@omne-harness/calendar-local'
import { sessionIntakeSettings } from '@omne-harness/session-adapters/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import { releasedDeclaration } from '../../../src/entry/permission-declarations.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { openTenantAssets } from '../../../src/rows/tenant-assets/host.ts'
import { createToolAssetCategory } from '../../../src/rows/governance/tool-assets.ts'
import { governedCapture } from '../../../src/rows/governance/governed-capture.ts'
import { openOrganizationSettingsSources } from '../../../src/rows/governance/organization-settings.ts'
import { prepareInstalledTenantGovernance } from '../../../src/rows/governance/tenant-installation.ts'
import { createToolGovernanceDefinitionSource } from '../../../src/rows/governance/tool-definition-source.ts'
import type { TenantGovernanceOptions } from '../../../src/rows/governance/tenant-runtime.ts'
import { deriveTransactionDomain } from '../../../src/rows/session-storage/directory.ts'
import {
  SESSION_COMPOSITE_PARTICIPANTS,
  compositeManifestDigest,
} from '../../../src/rows/session-storage/composite.ts'
import { COMBINATION_VERSION } from '../../../src/rows/agent-journal/config.ts'
import { LOCAL_GOVERNANCE_OPENING } from '../../../src/local/operator-defaults.ts'
import { productionStorageCatalog } from '../../../dist/rows/storage/production-catalog.js'
import { releaseIdentityConfig } from '../identity/fixtures.ts'
import { providerConfig, textOf } from '../storage/fixtures/tree.ts'

const cleanup: Array<() => unknown> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function governedTenant() {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const materials = await productionStorageCatalog(async () => release)
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'governance-reopen-')))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const made = await createSqliteStorage({
    config: providerConfig(dir),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  cleanup.push(() => made.control.close({ initiator: 'disposal' }))
  const root = new Context(),
    authority = inProcessPrincipalAuthority()
  cleanup.push(() => root.fiber.dispose())
  const instant = parseInstant('2026-11-08T00:00:00Z')
  if (!instant.ok) throw new Error('clock fixture')
  let destination: StandingDestinationResolver | undefined
  await root.plugin(ctx => {
    ctx.provide(storageKey, made.storage)
    ctx.provide(principalVerifierKey, authority.verifier)
    ctx.provide(identityClockKey, { now: async () => ({ kind: 'read', instant: instant.value }) })
    ctx.provide(standingDestinationResolverKey, {
      seal: (reservation: Parameters<StandingDestinationResolver['seal']>[0]) =>
        destination?.seal(reservation) ??
        Promise.resolve({ kind: 'unavailable', diagnostic: 'not-installed' }),
    })
  })
  await root.plugin(IdentitySqlPlugin, releaseIdentityConfig())
  const registered = await root.identityOperations.registerAndActivate({
    loginIdentifier: 'reopen-user',
    credential: 'reopen-secret',
  })
  if (registered.kind !== 'succeeded') throw new Error(JSON.stringify(registered))
  const issue = (component: string, owner: string, work: string) => {
    const actor = authority.issuer.issueSystem({ component })
    if (!('ok' in actor)) throw new Error('actor fixture')
    const issued = authority.issuer.issueActingForTenant({
      actor: actor.ok,
      tenant: registered.tenant,
      work: { owner, work },
    })
    if (!('ok' in issued)) throw new Error('principal fixture')
    return issued.ok
  }
  const principal = issue('governance-directory-fixture', 'governance', 'directory')
  const tenantRef = textOf(registered.tenant)
  const scope = {
    tenantRef,
    deploymentId: 'test',
    logicalServiceId: 'harness-governance',
    visibility: { kind: 'tenant' as const, tenantRef },
  }
  const domain = {
    scope: { kind: 'tenant' as const, tenant: tenantRef },
    transactionDomain: deriveTransactionDomain(tenantRef),
  }
  const session = compositeManifestDigest(materials)
  if (session.kind !== 'manifest') throw new Error(session.diagnostic)
  const registeredSession = await made.storage.registerCombination({
    ...domain,
    combinationVersion: COMBINATION_VERSION,
    manifestDigest: session.digest,
    participants: SESSION_COMPOSITE_PARTICIPANTS,
  })
  if (registeredSession.kind !== 'registered') throw new Error(JSON.stringify(registeredSession))
  const categories = createCategoryPoint()
  categories.contribute({
    contract: createToolAssetCategory(release),
    display: toolCategoryDisplay,
  })
  const options: TenantGovernanceOptions = {
    materials,
    storage: made.storage,
    domain,
    scope,
    catalogPrincipal: principal,
    capture: governedCapture(categories),
    destination: 'harness.governance',
    identity: {
      verifier: authority.verifier,
      standing: root.tenantStanding,
      reservations: root.standingReservations,
    },
    grants: [
      {
        principalRef: standingPrincipalRef(principal),
        scope,
        action: 'catalog-management',
        required: [],
      },
    ],
    definitions: createToolGovernanceDefinitionSource(() => release),
    recoveryPagesPerPass: 4,
    closeTimeoutMs: 3000,
  }
  const registry = createSettingsRegistry({ capacity: 1024 })
  cleanup.push(() => registry.close())
  for (const entry of release.manifest.entries)
    for (const definition of entry.governance.declaration.settings)
      expect(registry.registerContribution(definition).kind).toBe('registered')
  const independent = createIndependentSettingsPoint(registry)
  for (const definition of [calendarEnvironmentSettings, sessionIntakeSettings])
    independent.contribute(definition)
  const sources = await openOrganizationSettingsSources(options)
  if (sources.kind !== 'created') throw new Error(JSON.stringify(sources))
  cleanup.push(sources.close)
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-reopen-assets-')))
  cleanup.push(() => rmSync(packageRoot, { recursive: true, force: true }))
  let local: ReturnType<typeof openTenantAssets> | undefined
  const tenantAssets = () =>
    (local ??= openTenantAssets(
      { storage: made.storage, materials, packageRoot, categories },
      domain,
    ))
  cleanup.push(async () => (await local)?.close())
  const warnings: string[] = []
  const prepare = () => {
    const prepared = prepareInstalledTenantGovernance({
      ...options,
      installationPrincipal: issue(
        'governance-installation-fixture',
        'harness.governance',
        'installation',
      ),
      release,
      installationConcurrency: LOCAL_GOVERNANCE_OPENING.installationConcurrency,
      permissionDeclarations: () => release.manifest.entries.map(releasedDeclaration),
      organizationTargets: sources.targets,
      categories,
      tenantAssets,
      independentSettings: () => independent.list(),
      warn: message => warnings.push(message),
      registry,
      clock: { now: () => 1794096000000 },
      cursorLifetimeMs: 60000,
    })
    destination = prepared.destination
    return prepared
  }
  const file = (transactionDomain: string) =>
    join(dir, 'domains', `${Buffer.from(transactionDomain).toString('hex')}.sqlite`)
  return {
    prepare,
    warnings,
    deploymentRef: scope.deploymentId,
    files: { identity: file('system.identity'), tenant: file(domain.transactionDomain) },
  }
}

function storedBytes(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    let bytes = 0
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
    for (const { name } of tables)
      for (const row of db.prepare(`SELECT * FROM "${String(name)}"`).all())
        for (const value of Object.values(row))
          bytes +=
            typeof value === 'string'
              ? Buffer.byteLength(value)
              : value instanceof Uint8Array
                ? Buffer.byteLength(unpackText(value))
                : value === null
                  ? 0
                  : 8
    return bytes
  } finally {
    db.close()
  }
}

it('reopens the same tenant governance six times without growing the identity or tenant database', async () => {
  const tenant = await governedTenant()
  const after: Array<Record<'identity' | 'tenant', number>> = []
  for (let index = 0; index < 6; index++) {
    const prepared = tenant.prepare()
    const runtime = await prepared.open()
    if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
    expect(
      await prepared.readSettings({
        deploymentRef: tenant.deploymentRef,
        mode: 'management',
        targets: [],
        selectionRef: null,
      }),
    ).toMatchObject({ completeness: 'complete' })
    expect(await runtime.close()).toMatchObject({ kind: 'closed' })
    after.push({
      identity: storedBytes(tenant.files.identity),
      tenant: storedBytes(tenant.files.tenant),
    })
  }
  expect(tenant.warnings.filter(message => message.startsWith('settings catalog'))).toEqual([])
  expect(after[5]).toEqual(after[1])
}, 120000)
