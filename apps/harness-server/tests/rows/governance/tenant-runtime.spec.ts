import { releasedDeclaration } from '../../../src/entry/permission-declarations.ts'
import { toolPermissionRelease } from '../../../src/entry/tool-permission-release.ts'
import type { ReleaseToolName } from '../../../src/entry/tool-release-manifest.ts'
import { canonicalDigest } from '@omne-harness/tool'
import {
  installToolAsset,
  toolAssetTarget,
} from '../../../src/rows/governance/tool-installation-assets.ts'
import { installToolOrganizationSource } from '../../../src/rows/governance/tool-installation-source.ts'
import { openTenantAssets } from '../../../src/rows/tenant-assets/host.ts'
import { canonicalText, decisionEvidence } from '@omne-harness/authorization'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeExecutionAttachmentId,
  decodePassageId,
} from '@omne-harness/agent-contract'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { agentPermissionOperation } from '../../../src/rows/authorization/current-tool-permission.ts'
import { CurrentPermissionService } from '../../../src/rows/governance/current-permission-service.ts'
import { okOf } from '../../entry/support.ts'
// @module-tag slow
import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  standingDestinationResolverKey,
} from '@omne-harness/identity/cordis'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { access, organizationCodec } from '@omne-harness/legal-identity'
import {
  createIndependentSettingsPoint,
  createSettingsRegistry,
  SettingDefinitionsSchema,
  targetSortKey,
  type AssetTarget,
  type SettingDefinitions,
} from '@omne-harness/settings'
import {
  projectSettingsSources,
  settingsSqlProtocol,
  settingsSqlReadHandler,
} from '@omne-harness/settings-local'
import type { TargetSnapshot } from '../../../src/rows/governance/target-snapshot.ts'
import {
  createTenantSettingsWrite,
  type ReleaseSettingsRebaseDecision,
} from '../../../src/rows/governance/tenant-settings-write.ts'
import { releaseRebaseAssignments } from '../../../src/rows/governance/tool-settings-rebase.ts'
import {
  capabilityId,
  createCategoryPoint,
  pinBody,
  readBodyText,
  type BodyContract,
} from '@omne-harness/assets'
import { toolCategoryDisplay } from '@omne-harness/tool-contract'
import { createAssetsLocal, createTenantPublisher } from '@omne-harness/assets-local'
import { createToolAssetCategory } from '../../../src/rows/governance/tool-assets.ts'
import { governedCapture } from '../../../src/rows/governance/governed-capture.ts'
import { GOVERNANCE_PROJECTION_READ } from '../../../src/rows/governance/storage-materials.ts'
import { calendarEnvironmentSettings } from '@omne-harness/calendar-local'
import { sessionIntakeSettings } from '@omne-harness/session-adapters/cordis'

const SHIPPED_INDEPENDENT_SETTINGS = [calendarEnvironmentSettings, sessionIntakeSettings]
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import {
  createIdentityQualifiedSettingsPreparation,
  SETTINGS_RECOVERY_PARTICIPANTS,
  SETTINGS_CHECKPOINT_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
} from '@omne-harness/settings-local/preparation'
import {
  SETTINGS_SEED_COMMIT,
  SETTINGS_SEED_READY,
  settingsSeedCurrent,
  settingsSeedParticipants,
} from './settings-value-seed.ts'
import {
  TARGET_SNAPSHOT,
  targetSnapshotCommands,
  targetSnapshotSchema,
} from '../../../dist/rows/governance/target-snapshot.js'
import { governanceStorageCombinations } from '../../../src/rows/governance/storage-combinations.ts'
import { parseInstant } from '@omne-harness/utc-instant'
import { productionStorageCatalog } from '../../../dist/rows/storage/production-catalog.js'
import {
  deriveTransactionDomain,
  openTenantDirectory,
} from '../../../src/rows/session-storage/directory.ts'
import { prepareTenantDirectory } from '../../../src/rows/session-storage/initialize.ts'
import { TenantGovernanceHost } from '../../../src/rows/governance/tenant-host.ts'
import { createTenantSettingsFace } from '../../../src/rows/governance/tenant-settings-service.ts'
import {
  openOrganizationSettingsSources,
  organizationSettingsSource,
} from '../../../src/rows/governance/organization-settings.ts'
import { prepareInstalledTenantGovernance } from '../../../src/rows/governance/tenant-installation.ts'
import { prepareTenantGovernanceWithSettings } from '../../../src/rows/governance/tenant-settings.ts'
import { monotonicClock } from '../../../src/shutdown.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { createToolGovernanceDefinitionSource } from '../../../src/rows/governance/tool-definition-source.ts'
import {
  prepareTenantGovernance,
  type TenantGovernanceOptions,
} from '../../../src/rows/governance/tenant-runtime.ts'
import { releaseIdentityConfig } from '../identity/fixtures.ts'
import { TENANT_B, providerConfig, textOf } from '../storage/fixtures/tree.ts'

import {
  SESSION_COMPOSITE_PARTICIPANTS,
  compositeManifestDigest,
} from '../../../src/rows/session-storage/composite.ts'
import { COMBINATION_VERSION } from '../../../src/rows/agent-journal/config.ts'
import { LOCAL_GOVERNANCE_OPENING } from '../../../src/local/operator-defaults.ts'

const cleanup: Array<() => unknown | Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function world(extraParticipants: SqlMaterialCatalog['participants'] = []) {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const production = await productionStorageCatalog(async () => release)
  const materials = {
    ...production,
    participants: [...production.participants, ...extraParticipants],
  }
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tenant-governance-')))
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
    loginIdentifier: 'runtime-user',
    credential: 'runtime-secret',
  })
  if (registered.kind !== 'succeeded') throw new Error(JSON.stringify(registered))
  const actor = authority.issuer.issueSystem({ component: 'governance-directory-fixture' })
  if (!('ok' in actor)) throw new Error('actor fixture')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: registered.tenant,
    work: { owner: 'governance', work: 'directory' },
  })
  if (!('ok' in issued)) throw new Error('directory principal fixture')
  const installationActor = authority.issuer.issueSystem({
    component: 'governance-installation-fixture',
  })
  if (!('ok' in installationActor)) throw new Error('installation actor fixture')
  const installation = authority.issuer.issueActingForTenant({
    actor: installationActor.ok,
    tenant: registered.tenant,
    work: { owner: 'harness.governance', work: 'installation' },
  })
  if (!('ok' in installation)) throw new Error('installation principal fixture')
  const principal = issued.ok,
    tenantRef = textOf(registered.tenant)
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
  const directoryRoot = join(dir, 'directory')
  const directoryFile = join(directoryRoot, 'tenants.json')
  prepareTenantDirectory({ storageRoot: directoryRoot, directoryFile })
  const directory = openTenantDirectory({
    file: directoryFile,
    async register(entry) {
      const result = await made.storage.registerCombination({
        ...entry.domain,
        combinationVersion: COMBINATION_VERSION,
        manifestDigest: session.digest,
        participants: SESSION_COMPOSITE_PARTICIPANTS,
      })
      return result.kind === 'registered'
        ? { kind: 'registered' }
        : { kind: 'unavailable', diagnostic: 'session-registration' }
    },
  })
  const published = await directory.ensureRegistered(tenantRef)
  if (published.kind !== 'ready') throw new Error(JSON.stringify(published))
  const toolCategory = createCategoryPoint()
  toolCategory.contribute({
    contract: createToolAssetCategory(release),
    display: toolCategoryDisplay,
    point: 'tool.tools',
  })
  const options: TenantGovernanceOptions = {
    materials,
    storage: made.storage,
    domain,
    scope,
    catalogPrincipal: principal,
    capture: governedCapture(toolCategory),
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
  return {
    release,
    options,
    principal,
    workPrincipal(session: string) {
      const actor = authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' })
      if ('failure' in actor) throw new Error('session actor')
      const result = authority.issuer.issueActingForTenant({
        actor: actor.ok,
        tenant: principal.tenant,
        work: { owner: 'session', work: session },
      })
      if ('failure' in result) throw new Error('session principal')
      return result.ok
    },
    installationPrincipal: installation.ok,
    loginPrincipal() {
      const actor = authority.issuer.issueSystem({ component: 'identity-login-fixture' })
      if ('failure' in actor) throw new Error('login actor')
      const result = authority.issuer.issueActingForTenant({
        actor: actor.ok,
        tenant: principal.tenant,
        work: { owner: 'identity-login', work: 'lgn_runtime' },
      })
      if ('failure' in result) throw new Error('login principal')
      return result.ok
    },
    directory,
    async reopenStorage() {
      await made.control.close({ initiator: 'disposal' })
      const reopened = await createSqliteStorage({
        config: providerConfig(dir),
        materials,
        closeLeases: { admit: () => ({}), release() {} },
      })
      if (reopened.kind !== 'created') throw new Error(JSON.stringify(reopened))
      cleanup.push(() => reopened.control.close({ initiator: 'disposal' }))
      expect(
        await reopened.storage.registerCombination({
          ...domain,
          combinationVersion: COMBINATION_VERSION,
          manifestDigest: session.digest,
          participants: SESSION_COMPOSITE_PARTICIPANTS,
        }),
      ).toMatchObject({ kind: 'registered' })
      return reopened.storage
    },
    setDestination(value: StandingDestinationResolver) {
      destination = value
    },
  }
}

it('opens the real tenant governance provider from the production material catalog', async () => {
  const w = await world()
  const assembly = prepareTenantGovernance(w.options)
  w.setDestination(assembly.destination)
  const runtime = await assembly.open()
  if (runtime.kind === 'created') cleanup.push(runtime.close)
  expect(runtime.kind).toBe('created')
})

it('reads the real Settings directory through its own Identity settlement route without inventing targets', async () => {
  const w = await world()
  const registry = createSettingsRegistry({ capacity: 1024 })
  cleanup.push(() => registry.close())
  for (const entry of w.release.manifest.entries)
    for (const definition of entry.governance.declaration.settings)
      expect(registry.registerContribution(definition).kind).toBe('registered')
  const assembly = prepareTenantGovernanceWithSettings({
    ...w.options,
    registry,
    clock: { now: () => 1000 },
    cursorLifetimeMs: 60_000,
  })
  w.setDestination(assembly.destination)
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const request = {
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management' as const,
    targets: [],
    selectionRef: null,
  }
  expect(await assembly.readSettings(request)).toMatchObject({
    completeness: 'complete',
    views: [],
  })
  expect(await runtime.close()).toMatchObject({ kind: 'closed' })
  expect(await assembly.readSettings(request)).toMatchObject({
    kind: 'rejected',
    reason: 'closing',
  })
})

it('settles an original Settings catalog hold after SQL restart before opening tenant business', async () => {
  const w = await world()
  const registry = createSettingsRegistry({ capacity: 1024 })
  cleanup.push(() => registry.close())
  let held: StandingReservation | undefined
  const options = {
    ...w.options,
    registry,
    clock: { now: () => 1000 },
    cursorLifetimeMs: 60_000,
    identity: {
      ...w.options.identity,
      reservations: {
        observe: w.options.identity.reservations.observe,
        release: w.options.identity.reservations.release,
        recover: w.options.identity.reservations.recover,
        async reserve(request: Parameters<typeof w.options.identity.reservations.reserve>[0]) {
          const result = await w.options.identity.reservations.reserve(request)
          if (result.kind === 'held') held = result.reservation
          return result
        },
        async settle() {
          return { kind: 'unavailable' as const, diagnostic: 'fixture-lost-settlement' }
        },
      },
    },
  }
  const first = prepareTenantGovernanceWithSettings(options)
  w.setDestination(first.destination)
  const runtime = await first.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  await first.readSettings({
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management',
    targets: [],
    selectionRef: null,
  })
  if (!held) throw new Error('No original catalog reservation')
  await runtime.close()
  const storage = await w.reopenStorage()
  const openBusiness = vi.fn()
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare() {
      const assembly = prepareTenantGovernanceWithSettings({ ...options, storage })
      return {
        ...assembly,
        open() {
          openBusiness()
          return assembly.open()
        },
      }
    },
  })
  cleanup.push(() => host.close(monotonicClock.now() + 3000))
  expect(await host.destination.seal(held)).toMatchObject({
    kind: 'terminal',
    outcome: 'committed',
  })
  expect(openBusiness).not.toHaveBeenCalled()
})

it('shares one real tenant runtime across concurrent application lookups', async () => {
  const w = await world()
  const prepare = vi.fn((tenantRef: string, domain: TenantGovernanceOptions['domain']) =>
    prepareTenantGovernance({
      ...w.options,
      domain,
      scope: { ...w.options.scope, tenantRef },
    }),
  )
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare,
  })
  w.setDestination(host.destination)
  const [first, second] = await Promise.all([
    host.runtime(w.options.scope.tenantRef),
    host.runtime(w.options.scope.tenantRef),
  ])
  if (first) cleanup.push(first.close)
  if (second && second !== first) cleanup.push(second.close)
  expect(first?.kind).toBe('created')
  expect(second).toBe(first)
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(
    await first?.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: w.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'page' })
})

it('does not prepare or register an unknown tenant', async () => {
  const w = await world()
  const prepare = vi.fn(() => prepareTenantGovernance(w.options))
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare,
  })
  expect(await host.runtime(textOf(TENANT_B))).toBeUndefined()
  expect(prepare).not.toHaveBeenCalled()
  expect(await w.directory.lookup.lookup({ tenant: textOf(TENANT_B) })).toEqual({
    kind: 'unregistered',
  })
  expect(await host.close(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
})

it('closes an opening that finishes after shutdown without handing it to the caller', async () => {
  const w = await world()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let late: Awaited<ReturnType<ReturnType<typeof prepareTenantGovernance>['open']>> | undefined
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare() {
      const original = prepareTenantGovernance({
        ...w.options,
        identity: {
          ...w.options.identity,
          verifier: {
            async verify(principal) {
              entered.resolve()
              await release.promise
              return w.options.identity.verifier.verify(principal)
            },
          },
        },
      })
      return {
        ...original,
        async open() {
          late = await original.open()
          return late
        },
      }
    },
  })
  w.setDestination(host.destination)
  cleanup.push(async () => {
    release.resolve()
    await host.close(monotonicClock.now() + 5000)
  })
  const opening = host.runtime(w.options.scope.tenantRef)
  await entered.promise
  expect(await host.close(monotonicClock.now())).toMatchObject({ kind: 'incomplete' })
  expect(await host.runtime(w.options.scope.tenantRef)).toBeUndefined()
  release.resolve()
  expect(await opening).toBeUndefined()
  expect(await host.close(monotonicClock.now() + 5000)).toEqual({ kind: 'settled' })
  if (late?.kind !== 'created') throw new Error('the real provider did not finish opening')
  expect(
    await late.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: w.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'unavailable' })
})

it('lets another tenant finish while the first tenant is still opening', async () => {
  const a = await world(),
    b = await world()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const host = new TenantGovernanceHost({
    domains: {
      lookup: input =>
        input.tenant === a.options.scope.tenantRef
          ? a.directory.lookup.lookup(input)
          : b.directory.lookup.lookup(input),
    },
    prepare(tenantRef) {
      const w = tenantRef === a.options.scope.tenantRef ? a : b
      return prepareTenantGovernance({
        ...w.options,
        identity: {
          ...w.options.identity,
          verifier: {
            async verify(principal) {
              if (w === a) {
                entered.resolve()
                await release.promise
              }
              return w.options.identity.verifier.verify(principal)
            },
          },
        },
      })
    },
  })
  a.setDestination(host.destination)
  b.setDestination(host.destination)
  cleanup.push(async () => {
    release.resolve()
    await host.close(monotonicClock.now() + 5000)
  })
  const opening = host.runtime(a.options.scope.tenantRef)
  await entered.promise
  const second = await host.runtime(b.options.scope.tenantRef)
  expect(second?.kind).toBe('created')
  release.resolve()
  const first = await opening
  expect(first?.kind).toBe('created')
  expect(first).not.toBe(second)
  expect(
    await first?.service.readCatalog(access(b.principal, b.principal.tenant), {
      scope: a.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'denied' })
})

it('coalesces one prepared opening, closes old reads, and reopens the original domain', async () => {
  const w = await world()
  const assembly = prepareTenantGovernance(w.options)
  w.setDestination(assembly.destination)
  const first = assembly.open(),
    concurrent = assembly.open()
  expect(first).toBe(concurrent)
  const runtime = await first
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const request = {
    scope: w.options.scope,
    mode: 'management' as const,
    targets: [],
    cursor: null,
    limit: 10,
  }
  expect(
    await runtime.service.readCatalog(access(w.principal, w.principal.tenant), request),
  ).toMatchObject({ kind: 'page', items: [], completeness: 'complete' })
  expect(await runtime.close()).toEqual({ kind: 'closed' })
  expect(
    await runtime.service.readCatalog(access(w.principal, w.principal.tenant), request),
  ).toMatchObject({ kind: 'unavailable' })
  expect(await assembly.open()).toBe(runtime)
  const replacement = prepareTenantGovernance(w.options)
  w.setDestination(replacement.destination)
  const reopened = await replacement.open()
  if (reopened.kind !== 'created') throw new Error(JSON.stringify(reopened))
  cleanup.push(reopened.close)
  expect(reopened.epoch).not.toBe(runtime.epoch)
  expect(
    await reopened.service.readCatalog(access(w.principal, w.principal.tenant), request),
  ).toMatchObject({ kind: 'page', items: [] })
})

it.each(['wrong-domain', 'unissued-reader'] as const)(
  'refuses %s before registering any combination',
  async scenario => {
    const w = await world()
    const registration = vi.fn(w.options.storage.registerCombination)
    const changed = {
      ...w.options,
      storage: { ...w.options.storage, registerCombination: registration },
      ...(scenario === 'wrong-domain'
        ? {
            domain: {
              ...w.options.domain,
              scope: { kind: 'tenant' as const, tenant: textOf(TENANT_B) },
            },
          }
        : { catalogPrincipal: { ...w.principal } }),
    }
    expect(await prepareTenantGovernance(changed).open()).toMatchObject({
      kind: 'unavailable',
      phase: 'binding',
      reason:
        scenario === 'wrong-domain'
          ? 'catalog reader is not of this tenant'
          : expect.stringMatching(/^catalog reader (verification answered|verified as)/),
    })
    expect(registration).not.toHaveBeenCalled()
  },
)

it('retries a refused registration with the same durable combination identities', async () => {
  const w = await world()
  const registration = vi
    .fn(w.options.storage.registerCombination)
    .mockRejectedValueOnce(new Error('fixture registration failure'))
  const options = {
    ...w.options,
    storage: { ...w.options.storage, registerCombination: registration },
  }
  const rejected = prepareTenantGovernance(options)
  expect(await rejected.open()).toMatchObject({
    kind: 'unavailable',
    phase: 'registration',
    reason: 'threw',
  })
  await rejected.open()
  expect(registration).toHaveBeenCalledTimes(1)
  const retry = prepareTenantGovernance(options)
  w.setDestination(retry.destination)
  const runtime = await retry.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  expect(registration.mock.calls[1]).toEqual(registration.mock.calls[0])
})

it('does not grant catalog access that the installation did not supply', async () => {
  const w = await world()
  const assembly = prepareTenantGovernance({ ...w.options, grants: [] })
  w.setDestination(assembly.destination)
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  expect(
    await runtime.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: w.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'denied' })
})

it('freezes its data configuration before the first asynchronous opening', async () => {
  const w = await world()
  const original = structuredClone(w.options.scope)
  const assembly = prepareTenantGovernance(w.options)
  w.setDestination(assembly.destination)
  w.options.scope.logicalServiceId = 'changed-after-preparation'
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  expect(
    await runtime.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: original,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'page' })
})

it('publishes its opening promise before a verifier can reenter', async () => {
  const w = await world()
  let assembly: ReturnType<typeof prepareTenantGovernance>
  let reentered: ReturnType<ReturnType<typeof prepareTenantGovernance>['open']> | undefined
  let entered = false
  assembly = prepareTenantGovernance({
    ...w.options,
    identity: {
      ...w.options.identity,
      verifier: {
        verify(principal) {
          if (!entered) {
            entered = true
            reentered = assembly.open()
          }
          return w.options.identity.verifier.verify(principal)
        },
      },
    },
  })
  w.setDestination(assembly.destination)
  const opening = assembly.open()
  const result = await opening
  if (result.kind === 'created') cleanup.push(result.close)
  const nested = await reentered
  if (nested?.kind === 'created' && nested !== result) cleanup.push(nested.close)
  expect(result.kind).toBe('created')
  expect(reentered).toBe(opening)
  expect(nested).toBe(result)
})

async function installedWorld(extraParticipants: SqlMaterialCatalog['participants'] = []) {
  const w = await world(extraParticipants)
  const registry = createSettingsRegistry({ capacity: 1024 })
  cleanup.push(() => registry.close())
  for (const entry of w.release.manifest.entries)
    for (const definition of entry.governance.declaration.settings)
      expect(registry.registerContribution(definition).kind).toBe('registered')
  const independent = createIndependentSettingsPoint(registry)
  for (const definition of SHIPPED_INDEPENDENT_SETTINGS) independent.contribute(definition)
  const sources = await openOrganizationSettingsSources(w.options)
  if (sources.kind !== 'created') throw new Error(JSON.stringify(sources))
  cleanup.push(sources.close)
  const targets = sources.targets
  const categories = createCategoryPoint()
  categories.contribute({
    contract: createToolAssetCategory(w.release),
    display: toolCategoryDisplay,
    point: 'tool.tools',
  })
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-assets-')))
  cleanup.push(() => rmSync(packageRoot, { recursive: true, force: true }))
  let local: ReturnType<typeof openTenantAssets> | undefined
  const tenantAssets = () =>
    (local ??= openTenantAssets(
      { storage: w.options.storage, materials: w.options.materials, packageRoot, categories },
      w.options.domain,
    ))
  cleanup.push(async () => (await local)?.close())
  const warnings: string[] = []
  function prepare(
    organizationTargets = targets,
    independentSettings: () => readonly SettingDefinitions[] = () => independent.list(),
    storage: SqlStorage = w.options.storage,
  ) {
    const prepared = prepareInstalledTenantGovernance({
      ...w.options,
      storage,
      installationPrincipal: w.installationPrincipal,
      release: w.release,
      installationConcurrency: LOCAL_GOVERNANCE_OPENING.installationConcurrency,
      permissionDeclarations: () => w.release.manifest.entries.map(releasedDeclaration),
      organizationTargets,
      categories,
      tenantAssets,
      independentSettings,
      warn: message => warnings.push(message),
      registry,
      clock: { now: () => 1794096000000 },
      cursorLifetimeMs: 60000,
    })
    w.setDestination(prepared.destination)
    return prepared
  }
  return { w, sources, prepare, registry, categories, independent, tenantAssets, warnings }
}

// Ask declares no gate, so it has no settings to select.
const selectable = (definitionId: string) => definitionId !== 'tool.Ask'

it('installs the actual Tool release and adopts its original holdings before exposing the tenant backend', async () => {
  const { w, prepare } = await installedWorld()
  const prepared = prepare()
  const runtime = await prepared.open()
  expect(runtime).toMatchObject({ kind: 'created' })
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const catalog = await runtime.service.readCatalog(access(w.principal, w.principal.tenant), {
    scope: w.options.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 100,
  })
  expect(catalog).toMatchObject({ kind: 'page', completeness: 'complete' })
  if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
  expect(catalog.items.map(item => item.declaration.reference.definitionId).sort()).toEqual([
    'tool.Agents',
    'tool.Ask',
    'tool.BkgToolCalls',
    'tool.Calendar',
    'tool.Files',
    'tool.Notifications',
    'tool.Schedules',
    'tool.Screen',
    'tool.Sessions',
    'tool.Shell',
    'tool.Skills',
    'tool.SwitchWorkspace',
    'tool.TodoItems',
    'tool.Tools',
    'tool.Web',
  ])
  for (const item of catalog.items)
    expect(
      [item.availability, item.selectedTargets.length],
      item.declaration.reference.definitionId,
    ).toEqual(['available', selectable(item.declaration.reference.definitionId) ? 1 : 0])
  const settings = await prepared.readSettings({
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management',
    targets: [],
    selectionRef: null,
  })
  expect(settings).toMatchObject({ completeness: 'complete' })
  if ('kind' in settings) throw new Error(JSON.stringify(settings))
  const keyText = (key: readonly string[]) => JSON.stringify(key)
  const viewed = settings.views.map(view => keyText(targetSortKey(view.target).slice(1)))
  expect(viewed.sort()).toEqual(
    [
      ['independent', 'calendar', 'environment'],
      ['independent', 'session', 'intake'],
      ...[
        'Agents',
        'BkgToolCalls',
        'Calendar',
        'Files',
        'Notifications',
        'Schedules',
        'Screen',
        'Sessions',
        'Shell',
        'Skills',
        'SwitchWorkspace',
        'TodoItems',
        'Tools',
        'Web',
      ].map(name => ['asset', `harness.preinstalled.tool.${name}`]),
    ]
      .map(keyText)
      .sort(),
  )
  const tool = w.release.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const principal = w.workPrincipal('request-session')
  const block = judgeBlockIdentity({
    id: 'block-shell',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in block) throw new Error(block.rejected)
  const execution = okOf(decodeAgentExecutionId('execution'), 'execution')
  const position = {
    execution,
    passage: okOf(decodePassageId('passage'), 'passage'),
    action: okOf(decodeActionId('action'), 'action'),
  }
  const action = {
    principal,
    tenant: principal.tenant,
    operation: agentPermissionOperation(position),
    capability: { category: 'tool', name: tool.asset.name },
    definition: tool.asset.adoption,
    effectiveArguments: '{"command":"execute","intent":"test call","params":{"script":"echo"}}',
    gate: { id: 'run', title: '执行', default: 'ask' as const },
    origin: {
      kind: 'agent-action' as const,
      ...position,
      original: {
        ...block.ok,
        kind: 'tool_call' as const,
        callId: 'shell-1',
        name: 'Shell',
        arguments: { kind: 'object' as const, entries: [] },
      },
      advance: {
        execution,
        executionAttachment: okOf(decodeExecutionAttachmentId('attachment'), 'attachment'),
        instance: okOf(decodeAgentInstanceId('instance'), 'instance'),
        generation: '1',
        source: decisionEvidence('fixture-advance', '1', {}),
      },
    },
  }
  if (runtime.permissionBasis === undefined) throw new Error('permission reader not installed')
  const first = await runtime.permissionBasis.readCurrent({ ...action, inquiry: null })
  const request = first.request
  expect(request).toMatchObject({
    scope: { tenantId: w.options.scope.tenantRef, sessionId: 'request-session' },
    operation: action.operation,
    definition: tool.governance.interpretations.find(
      value => value.binding.enforcementKey === 'tool.run',
    )!.definition.reference,
  })
  const targets = settings.views.filter(
    view =>
      canonicalText(view.definition) === canonicalText(tool.governance.declaration.settings[0]),
  )
  expect(targets).toHaveLength(1)
  const target = targets[0]!.target
  expect(target).toEqual(toolAssetTarget(tool, w.options.scope.tenantRef))
  expect(request?.scope.targetId).toBe(canonicalText(target))
  expect(
    (
      await runtime.permissionBasis.readCurrent({
        ...action,
        principal: w.principal,
        inquiry: null,
      })
    ).request,
  ).toBeNull()
  expect(first).toMatchObject({ reading: { kind: 'unavailable' } })
  const boundary = new Context()
  cleanup.push(() => boundary.fiber.dispose())
  const routes: string[] = []
  let reader: CurrentPermissionService | undefined
  const provider = await boundary.plugin(ctx => {
    reader = new CurrentPermissionService(ctx, {
      identity: w.options.identity,
      async runtime(tenant) {
        routes.push(tenant)
        return runtime
      },
    })
  })
  if (reader === undefined) throw new Error('permission query service not installed')
  const read = (input: typeof action) => reader!.readCurrent({ ...input, inquiry: null })
  expect((await read(action)).request).toEqual(request)
  expect(routes).toEqual([w.options.scope.tenantRef])
  expect((await read({ ...action, principal: { ...principal } })).request).toBeNull()
  expect((await read({ ...action, principal: w.principal })).request).toBeNull()
  expect(routes).toHaveLength(1)
  expect(await read(action)).toMatchObject({ reading: { kind: 'unavailable' } })
  await provider.dispose()
  const opened = routes.length
  expect(await read(action)).toMatchObject({ request: null, reading: { kind: 'unavailable' } })
  expect(routes).toHaveLength(opened)
  expect(await prepared.open()).toBe(runtime)
})

it.each([false, true])(
  'remounts installed tools without rewriting original holdings or reviving disabled tools: %s',
  async disabled => {
    const { w, sources, prepare } = await installedWorld()
    const original = await prepare().open()
    if (original.kind !== 'created') throw new Error(JSON.stringify(original))
    cleanup.push(original.close)
    const categories = createCategoryPoint()
    categories.contribute({
      contract: createToolAssetCategory(w.release),
      display: toolCategoryDisplay,
      point: 'tool.tools',
    })
    const assets = createAssetsLocal({
      ...governanceStorageCombinations(w.options.materials).assets,
      domain: w.options.domain,
      storage: w.options.storage,
      categories,
    })
    cleanup.push(assets.close)
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('organization encoding failed')
    const lookups = w.release.manifest.entries.flatMap(entry =>
      entry.governance.declaration.settings.slice(0, 1).map(definition => ({
        holding: {
          holdingRef: `harness.preinstalled.tool.${entry.asset.name}`,
          scopeRef: w.options.scope.tenantRef,
        },
        source: organizationSettingsSource({ organizationId: organization.value, definition })
          .target,
      })),
    )
    if (disabled) {
      for (const { holding } of lookups) {
        expect(
          await assets.changeHolding({
            ...holding,
            operationId: `disable-${holding.holdingRef}`,
            expectedRevision: 1,
            change: { kind: 'setEnabled', enabled: false },
          }),
        ).toMatchObject({ kind: 'committed' })
      }
    }
    const before = await Promise.all(
      lookups.map(async ({ holding, source }) => ({
        holding: await assets.readHolding(holding),
        source: await sources.targets.readTarget(source),
      })),
    )
    expect(await original.close()).toEqual({ kind: 'closed' })
    const remounted = await prepare().open()
    expect(remounted).toMatchObject({ kind: 'created' })
    if (remounted.kind !== 'created') {
      if ('close' in remounted) cleanup.push(remounted.close)
      throw new Error(JSON.stringify(remounted))
    }
    cleanup.push(remounted.close)
    expect(remounted.epoch).not.toEqual(original.epoch)
    const catalog = await remounted.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: w.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 100,
    })
    expect(catalog).toMatchObject({ kind: 'page', completeness: 'complete' })
    if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
    expect(catalog.items).toHaveLength(w.release.manifest.entries.length)
    for (const item of catalog.items) {
      expect(item.selectedTargets).toHaveLength(
        !disabled && selectable(item.declaration.reference.definitionId) ? 1 : 0,
      )
      if (!disabled) expect(item.availability).toBe('available')
    }
    const after = await Promise.all(
      lookups.map(async ({ holding, source }) => ({
        holding: await assets.readHolding(holding),
        source: await sources.targets.readTarget(source),
      })),
    )
    expect(after).toEqual(before)
  },
)

// The projection read of the catalog answers as scripted; every other read goes to the store.
async function scriptedCatalogReads() {
  const { w, prepare } = await installedWorld()
  const base = w.options.storage
  type Read = Awaited<ReturnType<typeof base.read>>
  const script: { next: ((requestKey: string) => Read) | null } = { next: null }
  const storage: typeof base = {
    database: base.database,
    registerCombination: input => base.registerCombination(input),
    commit: (input, options) => base.commit(input, options),
    query: identity => base.query(identity),
    read: (input, options) =>
      script.next !== null && input.handler === GOVERNANCE_PROJECTION_READ
        ? Promise.resolve(script.next(input.requestKey))
        : base.read(input, options),
  }
  // A new assembly for each attempt, as the host of the tenant makes one after a failure.
  const open = async () => {
    const opened = await prepare(undefined, undefined, storage).open()
    if (opened.kind === 'created') cleanup.push(opened.close)
    else if ('close' in opened) await opened.close()
    return opened
  }
  return { script, open }
}

it('names the closed reason of a storage read that kept the tenant governance from opening, not its diagnostic', async () => {
  const { script, open } = await scriptedCatalogReads()
  script.next = requestKey => ({
    kind: 'unavailable',
    requestKey,
    reason: 'read_timeout',
    diagnostic: 'the reader ran 5000 ms on SELECT secret FROM somewhere',
  })
  const opened = await open()
  expect(opened).toMatchObject({
    kind: 'unavailable',
    phase: 'installation',
    reason: 'tool installation catalog (read_timeout)',
  })
  expect(JSON.stringify(opened)).not.toContain('SELECT')
})

it('does not name the reason of an earlier failure once a read came back', async () => {
  const { script, open } = await scriptedCatalogReads()
  script.next = requestKey => ({
    kind: 'unavailable',
    requestKey,
    reason: 'queue_timeout',
    diagnostic: null,
  })
  expect(await open()).toMatchObject({ reason: 'tool installation catalog (queue_timeout)' })
  // The store answers now; the projection itself gives no catalog, which is no storage reason.
  script.next = requestKey => ({
    kind: 'read',
    requestKey,
    output: { kind: 'stopped', participant: 'suite', reply: null },
  })
  expect(await open()).toMatchObject({ kind: 'unavailable', reason: 'tool installation catalog' })
})

it('retains and retries close responsibility for an unavailable installation', async () => {
  const w = await world()
  let canClose = false
  const close = vi.fn(async () =>
    canClose
      ? { kind: 'closed' as const }
      : { kind: 'pending' as const, phase: 'contributions' as const, inFlight: 0 },
  )
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare() {
      const original = prepareTenantGovernance(w.options)
      return {
        ...original,
        async open() {
          return {
            kind: 'unavailable' as const,
            owner: 'harness.tenant-governance',
            phase: 'installation' as const,
            reason: 'tool installation adopt',
            close,
          }
        },
      }
    },
  })
  expect(await host.runtime(w.options.scope.tenantRef)).toBeUndefined()
  expect(await host.close(monotonicClock.now() + 1000)).toMatchObject({ kind: 'incomplete' })
  expect(close).toHaveBeenCalledTimes(1)
  canClose = true
  expect(await host.close(monotonicClock.now() + 1000)).toEqual({ kind: 'settled' })
  expect(close).toHaveBeenCalledTimes(2)
})

it('closes an interrupted installation and resumes from original partial holdings on remount', async () => {
  const { w, sources, prepare } = await installedWorld()
  const interrupted = await prepare({
    ...sources.targets,
    async readTarget() {
      throw new Error('organization read transport failure')
    },
  }).open()
  expect(interrupted).toMatchObject({
    kind: 'unavailable',
    phase: 'installation',
    reason: expect.stringMatching(/^tool installation \S+$/),
  })
  if (!('close' in interrupted)) throw new Error('installation lost its close responsibility')
  cleanup.push(interrupted.close)
  expect(await interrupted.close()).toEqual({ kind: 'closed' })
  const retry = await prepare().open()
  expect(retry).toMatchObject({ kind: 'created' })
  if (retry.kind !== 'created') throw new Error(JSON.stringify(retry))
  cleanup.push(retry.close)
  const catalog = await retry.service.readCatalog(access(w.principal, w.principal.tenant), {
    scope: w.options.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 100,
  })
  expect(catalog).toMatchObject({ kind: 'page', completeness: 'complete' })
  if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
  expect(catalog.items).toHaveLength(w.release.manifest.entries.length)
  expect(catalog.items.every(item => item.availability === 'available')).toBe(true)
})

type TrustedRelease = Extract<
  Awaited<ReturnType<typeof loadProductionRelease>>,
  { kind: 'trusted' }
>

/**
 * The release a tenant ran before an upgrade that changed the source of one tool package: every
 * tool built from it gets another artifact digest, and with it another adoption and version.
 */
function releaseBeforeChange(
  release: TrustedRelease,
  pkg: string,
  retitled: ReleaseToolName | null,
): TrustedRelease {
  const manifest = structuredClone(release.manifest)
  manifest.entries = manifest.entries.map(entry => {
    if (entry.module.package !== pkg) return entry
    const name = entry.asset.name as ReleaseToolName
    const module = { ...entry.module, artifacts: `sha256:${'0'.repeat(64)}` }
    const adoption = { ...entry.asset.adoption, digest: canonicalDigest({ name, module }) }
    const gates =
      name === retitled
        ? entry.gates.map(gate => ({ ...gate, title: `旧${gate.title}` }))
        : entry.gates
    const governance = toolPermissionRelease({
      name,
      adoption,
      module,
      definition: entry.definition,
      gates,
    })
    return { ...entry, asset: { ...entry.asset, adoption }, module, gates, governance }
  })
  return { ...release, manifest, generation: canonicalDigest(manifest) }
}

const CHANGED_PACKAGE = '@omne-harness/tool-definitions'
type Upgrade = Readonly<{
  holding: 'enabled' | 'disabled' | 'removed'
  permissionsChanged: boolean
}>

async function upgradedWorld({ holding, permissionsChanged }: Upgrade) {
  const installed = await installedWorld()
  const { w, sources } = installed
  const earlier = releaseBeforeChange(
    w.release,
    CHANGED_PACKAGE,
    permissionsChanged ? 'Shell' : null,
  )
  const changed = earlier.manifest.entries.filter(entry => entry.module.package === CHANGED_PACKAGE)
  const before = earlier.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const after = w.release.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const categories = createCategoryPoint()
  categories.contribute({
    contract: createToolAssetCategory(earlier),
    display: toolCategoryDisplay,
    point: 'tool.tools',
  })
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-earlier-assets-')))
  cleanup.push(() => rmSync(packageRoot, { recursive: true, force: true }))
  const assets = await openTenantAssets(
    { storage: w.options.storage, materials: w.options.materials, packageRoot, categories },
    w.options.domain,
  )
  const tenantRef = w.options.scope.tenantRef
  for (const entry of changed)
    expect(await installToolAsset({ owner: assets, tenantRef, entry }), entry.asset.name).toEqual({
      kind: 'ready',
      target: toolAssetTarget(entry, tenantRef),
    })
  const target = toolAssetTarget(before, tenantRef)
  if (holding !== 'enabled') {
    const held = await assets.readHolding({ holdingRef: target.holdingRef, scopeRef: tenantRef })
    if (held.kind !== 'holding') throw new Error(JSON.stringify(held))
    expect(
      await assets.changeHolding({
        operationId: `${holding}-shell`,
        holdingRef: target.holdingRef,
        scopeRef: tenantRef,
        expectedRevision: held.holding.revision,
        change:
          holding === 'disabled' ? { kind: 'setEnabled', enabled: false } : { kind: 'remove' },
      }),
    ).toMatchObject({ kind: 'committed' })
  }
  await assets.close()
  const organization = organizationCodec.encode(w.installationPrincipal.tenant.organization)
  if (!organization.ok) throw new Error('organization fixture')
  const settings = (entry: typeof before) => entry.governance.declaration.settings[0]!
  for (const entry of changed)
    if (entry.governance.declaration.settings.length !== 0)
      expect(
        await installToolOrganizationSource({
          owner: sources.targets,
          organizationId: organization.value,
          definition: settings(entry),
        }),
        entry.asset.name,
      ).toMatchObject({ kind: 'ready' })
  const source = organizationSettingsSource({
    organizationId: organization.value,
    definition: settings(after),
  })
  return { ...installed, before, after, changed, target, source, settings }
}

describe('an upgrade that changed an official tool, over the state the earlier release left (#1433)', () => {
  const upgrades: readonly (Upgrade & { name: string })[] = [
    { name: 'rebuilt implementation, enabled tool', holding: 'enabled', permissionsChanged: false },
    {
      name: 'rebuilt implementation, disabled tool',
      holding: 'disabled',
      permissionsChanged: false,
    },
    { name: 'rebuilt implementation, removed tool', holding: 'removed', permissionsChanged: false },
    { name: 'changed permission items', holding: 'enabled', permissionsChanged: true },
  ]
  for (const upgrade of upgrades)
    it(`opens the tenant governance and moves every changed tool to the current release: ${upgrade.name}`, async () => {
      const { holding, permissionsChanged } = upgrade
      const enabled = holding === 'enabled'
      const { w, sources, prepare, warnings, before, after, changed, target, source, settings } =
        await upgradedWorld(upgrade)
      expect(changed.map(entry => entry.asset.name)).toContain('Web')
      expect(before.governance.declaration.reference.version).not.toBe(
        after.governance.declaration.reference.version,
      )
      expect(canonicalDigest(settings(before)) === canonicalDigest(settings(after))).toBe(
        !permissionsChanged,
      )
      const prepared = prepare()
      const runtime = await prepared.open()
      if ('close' in runtime) cleanup.push(runtime.close)
      if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
      expect(warnings).toEqual([])
      for (const entry of changed.filter(value => value.asset.name !== 'Shell')) {
        const current = w.release.manifest.entries.find(
          value => value.asset.name === entry.asset.name,
        )!
        const held = toolAssetTarget(entry, w.options.scope.tenantRef)
        expect(
          await prepared.assets.readHolding({
            holdingRef: held.holdingRef,
            scopeRef: held.scopeRef,
          }),
          entry.asset.name,
        ).toMatchObject({ selected: { version: current.governance.declaration.reference.version } })
      }
      expect(
        await prepared.assets.readHolding({
          holdingRef: target.holdingRef,
          scopeRef: target.scopeRef,
        }),
      ).toMatchObject(
        holding === 'removed'
          ? { kind: 'holding', holding: { state: 'removed' } }
          : {
              kind: 'holding',
              holding: { state: 'held', enabled },
              selected: { version: after.governance.declaration.reference.version },
            },
      )
      expect(await sources.targets.readTarget(source.target)).toMatchObject({
        kind: 'found',
        projection: { definition: settings(after) },
      })
      const catalog = await runtime.service.readCatalog(access(w.principal, w.principal.tenant), {
        scope: w.options.scope,
        mode: 'management',
        targets: [],
        cursor: null,
        limit: 100,
      })
      expect(catalog).toMatchObject({ kind: 'page', completeness: 'complete' })
      if (catalog.kind !== 'page') throw new Error(JSON.stringify(catalog))
      const shell = catalog.items.filter(
        item => item.declaration.reference.definitionId === 'tool.Shell',
      )
      expect(shell.map(item => item.declaration.reference)).toEqual([
        after.governance.declaration.reference,
      ])
      expect(shell[0]?.selectedTargets).toHaveLength(enabled ? 1 : 0)
    })
})

function releaseWithEarlierShellRun(release: TrustedRelease, prefix = '旧'): TrustedRelease {
  const manifest = structuredClone(release.manifest)
  manifest.entries = manifest.entries.map(entry => {
    if (entry.asset.name !== 'Shell') return entry
    const gates = entry.gates.map(gate =>
      gate.id === 'run' ? { ...gate, title: `${prefix}${gate.title}` } : gate,
    )
    const governance = toolPermissionRelease({
      name: 'Shell',
      adoption: entry.asset.adoption,
      module: entry.module,
      definition: entry.definition,
      gates,
    })
    return { ...entry, gates, governance }
  })
  return { ...release, manifest, generation: canonicalDigest(manifest) }
}

const DENY = { kind: 'value' as const, value: { pick: 'deny', allowedSet: null } }

function unpublishedShellSettings(release: TrustedRelease) {
  const entry = releaseWithEarlierShellRun(release, '更早的').manifest.entries.find(
    value => value.asset.name === 'Shell',
  )!
  const definition = entry.governance.declaration.settings[0]!
  const { providerId, definitionId, version } = definition
  return {
    kind: 'declared' as const,
    definition,
    definitionRef: {
      providerId,
      definitionId,
      version,
      digest: canonicalDigest(definition).slice(7),
    },
  }
}

async function shellStoredUnderEarlierRun(under: 'earlier' | 'unpublished' = 'earlier') {
  const installed = await installedWorld(settingsSeedParticipants())
  const { w } = installed
  const earlier = releaseWithEarlierShellRun(w.release)
  const before = earlier.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const after = w.release.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const tenantRef = w.options.scope.tenantRef
  const target = toolAssetTarget(before, tenantRef)
  const categories = createCategoryPoint()
  categories.contribute({
    contract: createToolAssetCategory(earlier),
    display: toolCategoryDisplay,
    point: 'tool.tools',
  })
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-earlier-shell-')))
  cleanup.push(() => rmSync(packageRoot, { recursive: true, force: true }))
  const assets = await openTenantAssets(
    { storage: w.options.storage, materials: w.options.materials, packageRoot, categories },
    w.options.domain,
  )
  expect(await installToolAsset({ owner: assets, tenantRef, entry: before })).toEqual({
    kind: 'ready',
    target,
  })
  const held = await assets.readHolding({ holdingRef: target.holdingRef, scopeRef: tenantRef })
  if (held.kind !== 'holding' || held.selected === null) throw new Error(JSON.stringify(held))
  const version = await assets.readVersion({
    assetRef: held.holding.assetRef,
    version: held.selected.version,
  })
  await assets.close()
  if (version.kind !== 'version' || version.version.declaration.kind !== 'declared')
    throw new Error(JSON.stringify(version))
  const stored =
    under === 'earlier' ? version.version.declaration : unpublishedShellSettings(w.release)
  const sources = projectSettingsSources(held.holding.sourceLayout, held.holding.ownerRevision)
  let revision = 0
  const snapshot = async (): Promise<TargetSnapshot> => ({
    binding: {
      scope: w.options.scope,
      epoch: 'earlier-release',
      mode: 'management',
      principalRef: standingPrincipalRef(w.principal),
      captureId: randomUUID(),
      transactionDomain: w.options.domain.transactionDomain,
      definition: before.governance.declaration.reference,
      target,
    },
    declaration: before.governance.declaration,
    declarationRevision: 1,
    adoptionRevision: 1,
    declarationSetDigest: canonicalDigest(earlier.generation).slice(7),
    values: {
      presence: revision === 0 ? 'absent' : 'present',
      view: {
        target,
        enabled: true,
        definitionRef: stored.definitionRef,
        definition: stored.definition,
        sources,
        grants: held.holding.grants,
        ownerRevision: held.holding.ownerRevision,
        state: { revision, sources: [{ id: 'tenant', values: [] }] },
      },
    },
    enforcementBindings: [],
  })
  const configuration = {
    destination: 'settings.earlier-shell',
    sourceRoute: 'settings.earlier-shell',
    required: [],
  }
  const { snapshot: _snapshot, ...registrations } = await seedRegistrations(w, 'earlier-shell')
  const seed = createIdentityQualifiedSettingsPreparation({
    identity: w.options.identity,
    required: [],
    backend: {
      storage: w.options.storage,
      domain: w.options.domain,
      destination: configuration.destination,
      registrations,
      ...settingsSeedCurrent({ configuration, snapshot }),
      access: {
        async authorize(principal, request) {
          return {
            kind: 'authorized',
            scope: request.scope,
            target: request.target,
            principalRef: standingPrincipalRef(principal),
          }
        },
      },
      sources: {
        async reserve() {
          throw new Error('no external source in setup')
        },
        async settle() {
          throw new Error('no external source in setup')
        },
      },
    },
  })
  w.setDestination(seed.control.destination)
  for (const itemId of ['run', 'read']) {
    const staged = await seed.service.prepareChange(w.principal, {
      protocol: 'settings/1',
      requestId: `earlier-${itemId}`,
      operationId: `earlier-${itemId}`,
      target,
      definitionRef: stored.definitionRef,
      expectedRevision: revision,
      sourceId: 'tenant',
      itemId,
      action: { kind: 'set', value: DENY.value },
    })
    if (staged.kind !== 'prepared') throw new Error(JSON.stringify(staged))
    const committed = await seed.service.commitChange(w.principal, {
      requestId: `earlier-${itemId}-commit`,
      preparation: staged.preparation,
    })
    if (committed.kind !== 'committed') throw new Error(JSON.stringify(committed))
    revision = committed.revision
  }
  await seed.control.close()
  const request = (targets: readonly AssetTarget[]) => ({
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management' as const,
    targets: [...targets],
    selectionRef: null,
  })
  async function changes() {
    const read = await w.options.storage.read({
      domain: w.options.domain,
      handler: settingsSqlReadHandler,
      protocol: settingsSqlProtocol,
      requestKey: randomUUID(),
      input: {
        domain: w.options.domain,
        principalRef: standingPrincipalRef(w.principal),
        target,
        kind: 'changes',
        afterRevision: 0,
        limit: 100,
      },
    })
    if (read.kind !== 'read') throw new Error(JSON.stringify(read))
    return read.output
  }
  return { ...installed, before, after, target, stored, request, changes }
}

describe('an upgrade that changed one gate of an official tool, over values stored under the earlier release (#1433)', () => {
  it('the release preparation rebases a target whose declaration changed: the unchanged item keeps its value, the changed one returns to its default', async () => {
    const { w, prepare, target, stored, request, changes } =
      await shellStoredUnderEarlierRun('unpublished')
    const assembly = prepare()
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
    cleanup.push(runtime.close)
    expect(await assembly.readSettings(request([target]))).toEqual({
      kind: 'rejected',
      reason: 'definition_changed',
    })
    const write = createTenantSettingsWrite({
      scope: w.options.scope,
      domain: w.options.domain,
      storage: w.options.storage,
      materials: w.options.materials,
      identity: w.options.identity,
      writer: w.principal,
      release: () => w.release,
      epoch: async () => runtime.epoch,
    })
    cleanup.push(write.close)
    const decided: unknown[] = []
    const decide: ReleaseSettingsRebaseDecision = (values, definition) => {
      decided.push(values)
      return releaseRebaseAssignments(stored.definition, values.state, definition)
    }
    expect(await write.rebase(target, decide)).toEqual({ kind: 'rebased', revision: 3 })
    expect(decided).toEqual([
      {
        definitionRef: stored.definitionRef,
        state: {
          revision: 2,
          sources: [
            {
              id: 'tenant',
              values: [
                { itemId: 'read', value: DENY, locked: false },
                { itemId: 'run', value: DENY, locked: false },
              ],
            },
          ],
        },
      },
    ])
    const read = await assembly.readSettings(request([target]))
    if ('kind' in read) throw new Error(JSON.stringify(read))
    expect(read.views[0]?.state).toEqual({
      revision: 3,
      sources: [{ id: 'tenant', values: [{ itemId: 'read', value: DENY, locked: false }] }],
    })
    expect(await changes()).toMatchObject({
      kind: 'changes',
      changes: [
        { revision: 1, kind: 'value', itemId: 'run' },
        { revision: 2, kind: 'value', itemId: 'read' },
        { revision: 3, kind: 'rebase' },
      ],
    })
    expect(await write.rebase(target, decide)).toEqual({ kind: 'current' })
  })

  it('opens the tenant governance with the stored values moved to the current release', async () => {
    const { prepare, warnings, after, target, request, changes } =
      await shellStoredUnderEarlierRun()
    const assembly = prepare()
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
    cleanup.push(runtime.close)
    expect(warnings).toEqual([])
    const read = await assembly.readSettings(request([target]))
    if ('kind' in read) throw new Error(JSON.stringify(read))
    expect(read.views[0]?.definitionRef.version).toBe(
      after.governance.declaration.settings[0]?.version,
    )
    expect(read.views[0]?.state).toEqual({
      revision: 3,
      sources: [{ id: 'tenant', values: [{ itemId: 'read', value: DENY, locked: false }] }],
    })
    expect(await changes()).toMatchObject({ changes: [{}, {}, { revision: 3, kind: 'rebase' }] })
    expect(await assembly.readSettings(request([]))).toMatchObject({ completeness: 'complete' })
  })

  it('finishes the rebase on the next open after the holding moved to the current version and the process stopped', async () => {
    const { w, prepare, tenantAssets, warnings, after, target, request, changes } =
      await shellStoredUnderEarlierRun()
    const assets = await tenantAssets()
    expect(
      await installToolAsset({ owner: assets, tenantRef: w.options.scope.tenantRef, entry: after }),
    ).toEqual({ kind: 'ready', target })
    const assembly = prepare()
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
    cleanup.push(runtime.close)
    expect(warnings).toEqual([])
    const read = await assembly.readSettings(request([target]))
    if ('kind' in read) throw new Error(JSON.stringify(read))
    expect(read.views[0]?.state).toEqual({
      revision: 3,
      sources: [{ id: 'tenant', values: [{ itemId: 'read', value: DENY, locked: false }] }],
    })
    expect(await changes()).toMatchObject({ changes: [{}, {}, { revision: 3, kind: 'rebase' }] })
  })

  it('leaves the target alone with one warning when no version declares the stored definition, the others unaffected', async () => {
    const { w, prepare, warnings, after, target, stored, request, changes } =
      await shellStoredUnderEarlierRun('unpublished')
    const assembly = prepare()
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
    cleanup.push(runtime.close)
    expect(warnings).toEqual([
      `tool installation left the settings of tool Shell in tenant ${w.options.scope.tenantRef} as stored: no version of harness.tool.Shell declares ${canonicalText(stored.definitionRef)}`,
    ])
    expect(
      await assembly.assets.readHolding({
        holdingRef: target.holdingRef,
        scopeRef: target.scopeRef,
      }),
    ).toMatchObject({ selected: { version: after.governance.declaration.reference.version } })
    expect(await assembly.readSettings(request([target]))).toEqual({
      kind: 'rejected',
      reason: 'definition_changed',
    })
    expect(await changes()).toMatchObject({ changes: [{ revision: 1 }, { revision: 2 }] })
    const files = toolAssetTarget(
      w.release.manifest.entries.find(entry => entry.asset.name === 'Files')!,
      w.options.scope.tenantRef,
    )
    expect(await assembly.readSettings(request([files]))).toMatchObject({
      completeness: 'complete',
      views: [{ target: files }],
    })
    const catalog = await runtime.service.readCatalog(access(w.principal, w.principal.tenant), {
      scope: w.options.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 100,
    })
    expect(catalog).toMatchObject({ kind: 'page', completeness: 'complete' })
  })
})

it('a group that cannot be opened leaves the tenant, the other group and the asset settings available', async () => {
  const { w, prepare } = await installedWorld()
  const altered: SettingDefinitions = {
    ...calendarEnvironmentSettings,
    groups: calendarEnvironmentSettings.groups.map(group => ({
      ...group,
      description: `${group.description}（同一版本的另一份内容）`,
    })),
  }
  const request = {
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management' as const,
    targets: [],
    selectionRef: null,
  }
  const earlier = prepare(undefined, () => [altered, sessionIntakeSettings])
  const first = await earlier.open()
  if (first.kind !== 'created') throw new Error(JSON.stringify(first))
  expect(await earlier.readSettings(request)).toHaveProperty('views')
  expect(await first.close()).toEqual({ kind: 'closed' })

  const later = prepare(undefined, () => SHIPPED_INDEPENDENT_SETTINGS)
  const runtime = await later.open()
  expect(runtime).toMatchObject({ kind: 'created' })
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const settings = await later.readSettings(request)
  if ('kind' in settings) throw new Error(JSON.stringify(settings))
  expect(settings).toMatchObject({ completeness: 'complete', unavailableProviders: [] })
  const independent = settings.views.filter(view => view.target.kind === 'independent')
  expect(independent.map(view => view.definition.providerId).sort()).toEqual([
    'calendar',
    'session',
  ])
  expect(independent.find(view => view.definition.providerId === 'calendar')?.definition).toEqual(
    altered,
  )
  expect(settings.views.filter(view => view.target.kind === 'asset')).toHaveLength(
    w.release.manifest.entries.filter(entry => entry.governance.declaration.settings.length > 0)
      .length,
  )
})

async function seedRegistrations(w: Awaited<ReturnType<typeof world>>, name: string) {
  async function register(phase: string, participants: readonly string[]) {
    const selected = [...new Set(participants)]
    const manifest = combinationManifest({ catalog: w.options.materials, participants: selected })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `test-${name}-${phase}/1`,
      manifestDigest: manifestDigest(manifest.manifest),
    }
    expect(
      await w.options.storage.registerCombination({
        ...w.options.domain,
        ...registration,
        participants: selected,
      }),
    ).toMatchObject({ kind: 'registered' })
    return registration
  }
  const dependencies = governanceStorageCombinations(
    w.options.materials,
  ).settingsCatalog.participants.filter(
    value =>
      !SETTINGS_RECOVERY_PARTICIPANTS.includes(value) &&
      value !== 'settings.catalog-terminal' &&
      value !== 'settings.snapshot',
  )
  return {
    snapshot: await register('snapshot', [...dependencies, ...SETTINGS_RECOVERY_PARTICIPANTS]),
    checkpoint: await register('checkpoint', SETTINGS_CHECKPOINT_PARTICIPANTS),
    ready: await register('ready', [
      ...dependencies,
      ...SETTINGS_READY_PARTICIPANTS,
      SETTINGS_SEED_READY,
    ]),
    commit: await register('commit', [
      ...dependencies,
      ...SETTINGS_COMMIT_PARTICIPANTS,
      SETTINGS_SEED_COMMIT,
    ]),
    recovery: await register('recovery', SETTINGS_RECOVERY_PARTICIPANTS),
  }
}

it('preserves a nonempty Settings assignment across default tenant installation remount', async () => {
  const configuration = {
    destination: 'settings.installation-preservation',
    sourceRoute: 'settings.installation-preservation',
    required: [],
  }
  const { w, prepare } = await installedWorld(settingsSeedParticipants())
  const assembly = prepare()
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const entry = w.release.manifest.entries.find(value => value.asset.name === 'Shell')
  if (!entry) throw new Error('Shell release absent')
  const target = {
    kind: 'asset' as const,
    holdingRef: 'harness.preinstalled.tool.Shell',
    scopeRef: w.options.scope.tenantRef,
  }
  const request = {
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management' as const,
    targets: [target],
    selectionRef: null,
  }
  const initial = await assembly.readSettings(request)
  if ('kind' in initial || initial.views.length !== 1) throw new Error(JSON.stringify(initial))
  const view = initial.views[0]
  if (!view) throw new Error('original view absent')
  const { snapshot: snapshots, ...registrations } = await seedRegistrations(w, 'installation')
  const settings = createIdentityQualifiedSettingsPreparation({
    identity: w.options.identity,
    required: [],
    backend: {
      storage: w.options.storage,
      domain: w.options.domain,
      destination: configuration.destination,
      registrations,
      ...settingsSeedCurrent({
        configuration,
        snapshot: async () => {
          const result = await w.options.storage.commit({
            identity: {
              ...w.options.domain,
              operation: 'test.settings-seed-snapshot',
              protocolVersion: '2',
              operationKey: randomUUID(),
            },
            ...snapshots,
            commands: targetSnapshotCommands({
              scope: w.options.scope,
              epoch: runtime.epoch,
              mode: 'management',
              principalRef: standingPrincipalRef(w.principal),
              captureId: randomUUID(),
              transactionDomain: w.options.domain.transactionDomain,
              definition: entry.governance.declaration.reference,
              target,
            }),
          })
          if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
          return targetSnapshotSchema.parse(
            result.responses.find(value => value.participant === TARGET_SNAPSHOT.participant)?.reply
              .response,
          )
        },
      }),
      access: {
        async authorize(principal, request) {
          return {
            kind: 'authorized',
            scope: request.scope,
            target: request.target,
            principalRef: standingPrincipalRef(principal),
          }
        },
      },
      sources: {
        async reserve() {
          throw new Error('no external source in setup')
        },
        async settle() {
          throw new Error('no external source in setup')
        },
      },
    },
  })
  cleanup.push(settings.control.close)
  w.setDestination({
    seal: reservation =>
      reservation.binding.destination === configuration.destination
        ? settings.control.destination.seal(reservation)
        : assembly.destination.seal(reservation),
  })
  const staged = await settings.service.prepareChange(w.principal, {
    protocol: 'settings/1',
    requestId: 'preserve-setting',
    operationId: 'preserve-setting',
    target,
    definitionRef: view.definitionRef,
    expectedRevision: 0,
    sourceId: 'tenant',
    itemId: 'run',
    action: { kind: 'set', value: { pick: 'deny', allowedSet: null } },
  })
  expect(staged).toMatchObject({ kind: 'prepared' })
  if (staged.kind !== 'prepared') throw new Error(JSON.stringify(staged))
  expect(
    await settings.service.commitChange(w.principal, {
      requestId: 'preserve-setting-commit',
      preparation: staged.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  const before = await assembly.readSettings(request)
  expect(before).not.toEqual(initial)
  if ('kind' in before) throw new Error(JSON.stringify(before))
  expect(before.views[0]?.state.revision).toBe(1)
  expect(before.views[0]?.state.sources).toContainEqual({
    id: 'tenant',
    values: [
      {
        itemId: 'run',
        value: { kind: 'value', value: { pick: 'deny', allowedSet: null } },
        locked: false,
      },
    ],
  })
  await settings.control.close()
  expect(await runtime.close()).toEqual({ kind: 'closed' })
  const next = prepare()
  const remounted = await next.open()
  expect(remounted).toMatchObject({ kind: 'created' })
  if (remounted.kind !== 'created') throw new Error(JSON.stringify(remounted))
  cleanup.push(remounted.close)
  const after = await next.readSettings(request)
  if ('kind' in after) throw new Error(JSON.stringify(after))
  expect(after.views).toEqual(before.views)
})

it('opens a group of independent settings declared only in this test, and keeps its target when it is withdrawn', async () => {
  const { w, prepare, independent } = await installedWorld()
  const gadget = SettingDefinitionsSchema.parse({
    providerId: 'test.gadget',
    definitionId: 'environment',
    version: '1',
    groups: [
      { id: 'general', parentId: null, title: '小工具', description: '只在这个用例里', order: 0 },
    ],
    items: [
      {
        id: 'mode',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: '方式',
          description: '小工具怎样跑',
          impact: '下一次读时生效',
          clear: '回到默认',
          adoption: 'next-read',
        },
        valueSchema: { type: 'string' },
        default: { kind: 'value', value: 'quiet' },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  })
  const withdraw = independent.contribute(gadget)
  const assembly = prepare()
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const request = {
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management' as const,
    targets: [],
    selectionRef: null,
  }
  const groups = async () => {
    const read = await assembly.readSettings(request)
    if ('kind' in read) throw new Error(JSON.stringify(read))
    return read.views
      .filter(view => view.target.kind === 'independent')
      .map(view => targetSortKey(view.target).slice(2).join('/'))
      .sort()
  }
  const opened = await groups()
  expect(opened).toEqual(['calendar/environment', 'session/intake', 'test.gadget/environment'])
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare: () => assembly,
  })
  cleanup.push(async () => {
    await host.close(monotonicClock.now() + 3000)
  })
  const face = createTenantSettingsFace({
    host,
    scope: w.options.scope,
    storage: w.options.storage,
    release: () => w.release,
    identity: { verifier: w.options.identity.verifier, standing: w.options.identity.standing },
    active: () => true,
  })
  const login = w.loginPrincipal()
  const independentList = async () => {
    const page = await face.list({
      principal: login,
      tenant: login.tenant,
      scope: { kind: 'independent' },
      after: null,
      limit: 100,
    })
    if (page.kind !== 'listed') throw new Error(JSON.stringify(page))
    return page.items.map(view =>
      view.owner.kind === 'independent'
        ? `${view.owner.providerId}/${view.owner.definitionId}/${view.item}/${view.declaration.group.title}`
        : `asset/${view.item}`,
    )
  }
  const listedBefore = await independentList()
  expect(listedBefore).toContain('test.gadget/environment/mode/小工具')
  expect(listedBefore.filter(text => text.startsWith('asset/'))).toEqual([])
  withdraw()
  expect(await groups()).toEqual(opened)
  expect(await independentList()).toEqual(listedBefore)
})

it('lists the settings of a holding whose category exists only in this test, beside the tools, from the definition its version stored', async () => {
  const { w, prepare, categories } = await installedWorld()
  const gadget = SettingDefinitionsSchema.parse({
    providerId: 'test.gadget',
    definitionId: 'preferences',
    version: '1',
    groups: [{ id: 'general', parentId: null, title: 'General', description: 'Gadget', order: 0 }],
    items: [
      {
        id: 'enabled',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: 'Enabled',
          description: 'Whether the gadget runs',
          impact: 'Used on next read',
          clear: 'Use the outer value',
          adoption: 'next-read',
        },
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: false },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  })
  const contract: BodyContract = {
    category: 'gadget',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    settings: () => gadget,
  }
  const display = { title: 'Gadget', summary: 'A category that exists only in this test.' }
  const withdraw = categories.contribute({ contract, display, point: 'test.site7' })
  const assembly = prepare()
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const assets = createAssetsLocal({
    ...governanceStorageCombinations(w.options.materials).assets,
    domain: w.options.domain,
    storage: w.options.storage,
    categories,
  })
  cleanup.push(assets.close)
  const identity = capabilityId('gadget', 'one')
  const body = readBodyText('{}', {
    maxBytes: 100,
    maxDepth: 4,
    maxItems: 4,
    maxMembers: 4,
    maxStringLength: 16,
    maxNumberLength: 16,
  })
  if (!identity.ok || body.kind !== 'ok') throw new Error('gadget fixture')
  const tenantRef = w.options.scope.tenantRef
  expect(
    await assets.publish({
      operationId: 'gadget-publish',
      assetRef: 'test/gadget/one',
      pinned: pinBody({ identity: identity.id, version: '1', source: 'test', body: body.value }),
      expectedRevision: 0,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await assets.hold({
      operationId: 'gadget-hold',
      holdingRef: 'test.gadget.one',
      scopeRef: tenantRef,
      assetRef: 'test/gadget/one',
      selection: { kind: 'follow' },
      sources: [
        {
          sourceId: 'tenant',
          ownerRef: 'test.gadget',
          scope: { kind: 'tenant', subjectRef: tenantRef },
        },
      ],
      grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
    }),
  ).toMatchObject({ kind: 'committed' })
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare: () => assembly,
  })
  cleanup.push(async () => {
    await host.close(monotonicClock.now() + 3000)
  })
  const face = createTenantSettingsFace({
    host,
    scope: w.options.scope,
    storage: w.options.storage,
    release: () => w.release,
    identity: { verifier: w.options.identity.verifier, standing: w.options.identity.standing },
    active: () => true,
  })
  const login = w.loginPrincipal()
  async function listed() {
    const page = await face.list({
      principal: login,
      tenant: login.tenant,
      scope: { kind: 'asset' },
      after: null,
      limit: 100,
    })
    if (page.kind !== 'listed') throw new Error(JSON.stringify(page))
    expect(page.completeness).toBe('complete')
    return page.items.map(item =>
      item.owner.kind === 'asset'
        ? `${item.owner.category}/${item.owner.name}/${item.item}`
        : `independent/${item.item}`,
    )
  }
  const tools = w.release.manifest.entries
    .flatMap(entry => entry.gates.map(gate => `tool/${entry.asset.name}/${gate.id}`))
    .sort()
  const first = await listed()
  expect(first).toEqual(['gadget/one/enabled', ...tools])

  withdraw()
  expect(await listed()).toEqual(first)

  categories.contribute({
    contract,
    display: { title: 'Renamed', summary: 'Another name.' },
    point: 'test.site6',
  })
  expect(await listed()).toEqual(first)
})

const presentation = (title: string) => ({
  title,
  description: `${title} of the gadget`,
  impact: 'Used on next read',
  clear: 'Use the outer value',
  adoption: 'next-read' as const,
})
/** The settings a gadget version declares: the version is part of the definition, as for model providers. */
function gadgetDefinition(version: string) {
  return SettingDefinitionsSchema.parse({
    providerId: 'test.gadget',
    definitionId: 'preferences',
    version,
    groups: [{ id: 'general', parentId: null, title: 'General', description: 'Gadget', order: 0 }],
    items: [
      {
        id: 'enabled',
        groupId: 'general',
        category: 'preference',
        presentation: presentation('Enabled'),
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: false },
        merge: 'override',
        sensitivity: 'ordinary',
      },
      {
        id: 'mode',
        groupId: 'general',
        category: 'governance',
        presentation: presentation('Mode'),
        valueSchema: { type: 'string' },
        default: { kind: 'value', value: 'off' },
        merge: 'override',
        sensitivity: 'ordinary',
      },
      {
        id: 'token',
        groupId: 'general',
        category: 'binding',
        presentation: presentation('Token'),
        valueSchema: { type: 'string' },
        default: { kind: 'absent' },
        merge: 'override',
        sensitivity: 'secret',
      },
    ],
  })
}
const gadgetContract: BodyContract = {
  category: 'gadget',
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  settings: (_body, context) => gadgetDefinition(context?.definition ?? 'unpinned'),
}
const GADGET = { kind: 'asset', category: 'gadget', name: 'one' } as const

function gadgetBody(text: string) {
  const body = readBodyText(text, {
    maxBytes: 100,
    maxDepth: 4,
    maxItems: 4,
    maxMembers: 4,
    maxStringLength: 16,
    maxNumberLength: 16,
  })
  if (body.kind !== 'ok') throw new Error('gadget body')
  return body.value
}

/**
 * A tenant with one gadget published the way a tenant publishes, through the real governance
 * writer. `beforeHeldCommit` runs once, just before the commit of a held target reaches storage.
 */
async function heldGadget(beforeHeldCommit?: (world: HeldGadget) => Promise<void>) {
  const { w, prepare, categories } = await installedWorld()
  categories.contribute({
    contract: gadgetContract,
    display: { title: 'Gadget', summary: 'A category that exists only in this test.' },
    point: 'test.site5',
  })
  const base = w.options.storage
  let armed = beforeHeldCommit
  const storage: SqlStorage = {
    database: base.database,
    registerCombination: input => base.registerCombination(input),
    async commit(input, options) {
      const run = armed
      if (
        run !== undefined &&
        input.combinationVersion.startsWith('harness-governance-heldSettingsCommit/')
      ) {
        armed = undefined
        await run(world)
      }
      return base.commit(input, options)
    },
    query: identity => base.query(identity),
    read: (input, options) => base.read(input, options),
  }
  const assembly = prepare(undefined, undefined, storage)
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const assets = createAssetsLocal({
    ...governanceStorageCombinations(w.options.materials).assets,
    domain: w.options.domain,
    storage: base,
    categories,
  })
  cleanup.push(assets.close)
  const tenantRef = w.options.scope.tenantRef
  const publisher = createTenantPublisher(assets, tenantRef)
  const made = capabilityId('gadget', 'one')
  if (!made.ok) throw new Error('gadget identity')
  const capability = made.id
  async function publish(operationId: string, text: string) {
    const outcome = await publisher.publish({
      operationId,
      capability,
      content: { kind: 'data', body: gadgetBody(text) },
    })
    if (outcome.kind !== 'published') throw new Error(JSON.stringify(outcome))
    return outcome
  }
  async function holding() {
    const held = await assets.readHeldCapability({ capability })
    if (held.kind !== 'holding') throw new Error(JSON.stringify(held))
    return held.holding
  }
  async function change(
    operationId: string,
    change: Readonly<{ kind: 'remove' }> | Readonly<{ kind: 'setEnabled'; enabled: boolean }>,
  ) {
    const current = await holding()
    const result = await assets.changeHolding({
      operationId,
      holdingRef: current.holdingRef,
      scopeRef: tenantRef,
      expectedRevision: current.revision,
      change,
    })
    expect(result).toMatchObject({ kind: 'committed', changed: true })
  }
  const host = new TenantGovernanceHost({
    domains: w.directory.lookup,
    prepare: () => assembly,
  })
  cleanup.push(async () => {
    await host.close(monotonicClock.now() + 3000)
  })
  const face = createTenantSettingsFace({
    host,
    scope: w.options.scope,
    storage: base,
    release: () => w.release,
    identity: { verifier: w.options.identity.verifier, standing: w.options.identity.standing },
    active: () => true,
  })
  const login = w.loginPrincipal()
  const item = (id: string) => ({ principal: login, tenant: login.tenant, owner: GADGET, item: id })
  async function revision(id: string) {
    const described = await face.describe(item(id))
    if (described.kind !== 'described') throw new Error(JSON.stringify(described))
    return described.item.revision
  }
  async function set(id: string, operation: string, value: unknown, at?: string) {
    return face.set({
      ...item(id),
      operation,
      expectedRevision: at ?? (await revision(id)),
      value: { kind: 'ordinary', value: value as never },
    })
  }
  async function clear(id: string, operation: string) {
    return face.clear({ ...item(id), operation, expectedRevision: await revision(id) })
  }
  const world = { face, item, publish, change, holding, set, clear, revision }
  await publish('gadget-publish-1', '{"v":1}')
  return world
}
type HeldGadget = Awaited<ReturnType<typeof heldGadget>>

describe('the ordinary settings of an asset that no release governs (#1390)', () => {
  it('lists them with the definition the held version stored, the list complete, the official tools beside them', async () => {
    const world = await heldGadget()
    const { face, item } = world
    const listed = await face.list({
      ...item('enabled'),
      scope: { kind: 'asset' },
      after: null,
      limit: 100,
    })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.completeness).toBe('complete')
    expect(
      listed.items
        .filter(value => value.owner.kind === 'asset' && value.owner.category === 'gadget')
        .map(value => value.item),
    ).toEqual(['enabled', 'mode', 'token'])
  })

  it('writes a legal value, answers no-change for the same value, invalid for a wrong one, conflict for a stale revision', async () => {
    const world = await heldGadget()
    const before = await world.revision('enabled')
    expect(await world.set('enabled', 'set-true', true)).toEqual({
      kind: 'written',
      revision: String(Number(before) + 1),
    })
    expect(await world.face.describe(world.item('enabled'))).toMatchObject({
      item: { own: { kind: 'set', value: true }, effective: { source: 'tenant' } },
    })
    expect(await world.set('enabled', 'set-true-again', true)).toEqual({ kind: 'no-change' })
    expect(await world.set('enabled', 'set-text', 'yes')).toMatchObject({ kind: 'invalid' })
    expect(await world.set('enabled', 'set-stale', false, before)).toEqual({ kind: 'conflict' })
  })

  it('clears a value back to the default, and a clear with nothing set is no-change', async () => {
    const world = await heldGadget()
    await world.set('enabled', 'set-true', true)
    expect(await world.clear('enabled', 'clear-1')).toMatchObject({ kind: 'written' })
    expect(await world.face.describe(world.item('enabled'))).toMatchObject({
      item: { own: { kind: 'unset' }, effective: { value: { kind: 'set', value: false } } },
    })
    expect(await world.clear('enabled', 'clear-2')).toEqual({ kind: 'no-change' })
  })

  it('writes the settings of a disabled holding: disabling keeps them and those who may change them still can', async () => {
    const world = await heldGadget()
    await world.change('disable', { kind: 'setEnabled', enabled: false })
    expect(await world.set('enabled', 'set-disabled', true)).toMatchObject({ kind: 'written' })
  })

  it('a second write with the same operation is the first one: it takes effect once', async () => {
    const world = await heldGadget()
    const at = await world.revision('enabled')
    const first = await world.set('enabled', 'set-once', true, at)
    expect(first).toMatchObject({ kind: 'written' })
    expect(await world.set('enabled', 'set-once', true, at)).toEqual(first)
    expect(await world.revision('enabled')).toBe((first as { revision: string }).revision)
  })

  it('a permission item without the governance declaration that interprets it is not writable; it is still described', async () => {
    const world = await heldGadget()
    expect(await world.face.describe(world.item('mode'))).toMatchObject({ kind: 'described' })
    expect(await world.set('mode', 'set-mode', 'on')).toEqual({
      kind: 'not-writable',
      reason: 'not-a-source',
    })
  })

  it('a secret item is not writable through this path', async () => {
    const world = await heldGadget()
    expect(await world.set('token', 'set-token', 'sk-1')).toMatchObject({ kind: 'not-writable' })
  })

  it('a holding removed between prepare and commit leaves no effective value: the write is unavailable', async () => {
    const world = await heldGadget(async w => w.change('remove-before-commit', { kind: 'remove' }))
    expect(await world.set('enabled', 'set-then-removed', true)).toEqual({ kind: 'unavailable' })
    expect(await world.face.describe(world.item('enabled'))).toEqual({ kind: 'not-visible' })
  })

  it('a version with another definition published between prepare and commit makes the write a conflict', async () => {
    const world = await heldGadget(async w => {
      await w.publish('gadget-publish-2', '{"v":2}')
    })
    expect(await world.set('enabled', 'set-then-new-version', true)).toEqual({ kind: 'conflict' })
    expect(await world.face.describe(world.item('enabled'))).toMatchObject({
      item: { own: { kind: 'unset' } },
    })
  })

  it('a holding removed and created again under the same name starts from the defaults', async () => {
    const world = await heldGadget()
    await world.set('enabled', 'set-old', true)
    const old = await world.holding()
    await world.change('remove', { kind: 'remove' })
    await world.publish('gadget-publish-again', '{"v":3}')
    expect((await world.holding()).holdingRef).not.toBe(old.holdingRef)
    expect(await world.face.describe(world.item('enabled'))).toMatchObject({
      item: { own: { kind: 'unset' }, effective: { value: { kind: 'set', value: false } } },
    })
  })
})
