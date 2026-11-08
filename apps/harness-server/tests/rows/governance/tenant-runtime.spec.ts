import { canonicalText } from '@omne-harness/authorization'
import { CurrentPermissionService } from '../../../src/rows/governance/current-permission-service.ts'
// @module-tag slow
// Real Identity and SQLite providers; only the clock and caller installation are test inputs.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
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
import type { SettingsSourceRequest } from '@omne-harness/settings-local/preparation'
import { createSettingsRegistry } from '@omne-harness/settings'
import { createCategoryRegistry } from '@omne-harness/assets'
import { createAssetsLocal } from '@omne-harness/assets-local'
import { createToolAssetCategory } from '../../../src/rows/governance/tool-assets.ts'
import { createGovernanceLocal } from '@omne-harness/governance-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import {
  createIdentityQualifiedSettingsPreparation,
  SETTINGS_RECOVERY_PARTICIPANTS,
  SETTINGS_CHECKPOINT_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
} from '@omne-harness/settings-local/preparation'
import {
  settingsCurrentMaterials,
  settingsCurrentParticipant,
} from '../../../dist/rows/governance/settings-current.js'
import { createSettingsCurrentProjection } from '../../../dist/rows/governance/settings-preparation.js'
import { governanceStorageCombinations } from '../../../src/rows/governance/storage-combinations.ts'
import { createGovernanceAdoptionProjection } from '../../../src/rows/governance/adoption-current.ts'
import { governanceCatalogProjection } from '../../../src/rows/governance/catalog-current.ts'
import { parseInstant } from '@omne-harness/utc-instant'
import { productionStorageCatalog } from '../../../dist/rows/storage/production-catalog.js'
import {
  deriveTransactionDomain,
  openTenantDirectory,
} from '../../../src/rows/session-storage/directory.ts'
import { prepareTenantDirectory } from '../../../src/rows/session-storage/initialize.ts'
import { TenantGovernanceHost } from '../../../src/rows/governance/tenant-host.ts'
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
  const options: TenantGovernanceOptions = {
    materials,
    storage: made.storage,
    domain,
    scope,
    catalogPrincipal: principal,
    destination: 'harness.governance',
    sourceRoute: 'harness.governance.session-write',
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

it('retains an organization source across application remount with the original Identity principal', async () => {
  const w = await world()
  const definition = w.release.manifest.entries.flatMap(
    entry => entry.governance.declaration.settings,
  )[0]
  if (!definition) throw new Error('Missing released settings')
  const organization = organizationCodec.encode(w.principal.tenant.organization)
  if (!organization.ok) throw new Error('Invalid organization')
  const source = organizationSettingsSource({ organizationId: organization.value, definition })
  // The destination fixture stands for an operation already recognized by its original owner.
  const destination = {
    async recognize(request: SettingsSourceRequest) {
      return { kind: 'known' as const, request }
    },
    async seal(request: SettingsSourceRequest) {
      return { kind: 'terminal' as const, request, outcome: 'aborted' as const }
    },
  }
  const opened = await openOrganizationSettingsSources({ ...w.options, destination })
  if (opened.kind !== 'created') throw new Error(JSON.stringify(opened))
  cleanup.push(opened.close)
  expect(
    await opened.targets.mutate({
      kind: 'provision',
      operationId: 'install-source',
      expectedRevision: null,
      record: {
        publicationRef: null,
        target: source.target,
        definition,
        sources: [
          {
            sourceId: 'organization',
            ownerRef: 'settings',
            scope: { kind: 'organization', subjectRef: organization.value },
          },
        ],
        grants: [],
      },
    }),
  ).toMatchObject({ kind: 'committed' })
  const request: SettingsSourceRequest = {
    source,
    destination: {
      ownerRef: 'governance',
      identity: {
        domain: w.options.domain,
        principalRef: standingPrincipalRef(w.principal),
        operation: { operationId: 'original-operation' },
      },
      attemptId: 'original-attempt',
      commandDigest: 'a'.repeat(64),
      route: w.options.sourceRoute,
    },
  }
  const held = await opened.reservations.reserve(w.principal, request)
  expect(held).toMatchObject({ kind: 'held', snapshot: { presence: 'absent' } })
  await opened.close()
  expect(await opened.reservations.reserve(w.principal, request)).toMatchObject({
    kind: 'rejected',
    reason: 'closing',
  })
  const remounted = await openOrganizationSettingsSources({ ...w.options, destination })
  if (remounted.kind !== 'created') throw new Error(JSON.stringify(remounted))
  cleanup.push(remounted.close)
  expect(await remounted.reservations.reserve(w.principal, request)).toEqual(held)
  expect(await remounted.recover({ after: null, limit: 10 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(await remounted.reservations.reserve(w.principal, request)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('refuses cloned principals and another organization before asking a destination to recognize a source', async () => {
  const w = await world()
  const definition = w.release.manifest.entries.flatMap(
    entry => entry.governance.declaration.settings,
  )[0]
  if (!definition) throw new Error('Missing released settings')
  const other = organizationCodec.encode(TENANT_B.organization)
  if (!other.ok) throw new Error('Invalid organization')
  const recognize = vi.fn(async () => ({ kind: 'unavailable' as const }))
  const opened = await openOrganizationSettingsSources({
    ...w.options,
    destination: {
      recognize,
      async seal() {
        return { kind: 'unavailable' }
      },
    },
  })
  if (opened.kind !== 'created') throw new Error(JSON.stringify(opened))
  cleanup.push(opened.close)
  const request: SettingsSourceRequest = {
    source: organizationSettingsSource({ organizationId: other.value, definition }),
    destination: {
      ownerRef: 'governance',
      identity: {
        domain: w.options.domain,
        principalRef: standingPrincipalRef(w.principal),
        operation: { operationId: 'original-operation' },
      },
      attemptId: 'original-attempt',
      commandDigest: 'a'.repeat(64),
      route: w.options.sourceRoute,
    },
  }
  expect(await opened.reservations.reserve(w.principal, request)).toMatchObject({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await opened.reservations.reserve(structuredClone(w.principal), request)).toMatchObject({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(recognize).not.toHaveBeenCalled()
})

it('opens the real tenant governance provider from the production material catalog', async () => {
  const w = await world()
  const assembly = prepareTenantGovernance(w.options)
  w.setDestination(assembly.destination)
  const runtime = await assembly.open()
  if (runtime.kind === 'created') cleanup.push(runtime.close)
  expect(runtime.kind).toBe('created')
})

it.each(['held', 'lost-reserve-reply'] as const)(
  'recovers an original Governance source request through the application router after SQL restart: %s',
  async fault => {
    const w = await world()
    const boot = prepareTenantGovernance(w.options)
    w.setDestination(boot.destination)
    const initial = await boot.open()
    if (initial.kind !== 'created') throw new Error(JSON.stringify(initial))
    expect(await initial.close()).toMatchObject({ kind: 'closed' })
    const definition = w.release.manifest.entries.flatMap(
      entry => entry.governance.declaration.settings,
    )[0]
    if (!definition) throw new Error('Missing released settings')
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('Invalid organization')
    const source = organizationSettingsSource({ organizationId: organization.value, definition })
    let host: TenantGovernanceHost
    async function openSources(storage: SqlStorage) {
      const result = await openOrganizationSettingsSources({
        ...w.options,
        storage,
        destination: {
          recognize: request => host.sourceDestination.recognize(request),
          seal: request => host.sourceDestination.seal(request),
        },
      })
      if (result.kind !== 'created') throw new Error(JSON.stringify(result))
      cleanup.push(result.close)
      return result
    }
    let sources = await openSources(w.options.storage)
    const openBusiness = vi.fn()
    function mount(storage: SqlStorage) {
      const mounted = new TenantGovernanceHost({
        domains: w.directory.lookup,
        prepare() {
          const prepared = prepareTenantGovernance({
            ...w.options,
            storage,
            sourceReservations: sources.reservations,
          })
          return {
            ...prepared,
            open() {
              openBusiness()
              return prepared.open()
            },
          }
        },
      })
      cleanup.push(() => mounted.close(monotonicClock.now() + 3000))
      return mounted
    }
    host = mount(w.options.storage)
    w.setDestination(host.destination)
    const provision = (operationId: string, expectedRevision: number | null) =>
      sources.targets.mutate({
        kind: 'provision',
        operationId,
        expectedRevision,
        record: {
          publicationRef: null,
          target: source.target,
          definition,
          sources: [
            {
              sourceId: 'organization',
              ownerRef: 'settings',
              scope: { kind: 'organization', subjectRef: organization.value },
            },
          ],
          grants: [],
        },
      })
    expect(await provision('install-source', null)).toMatchObject({ kind: 'committed' })
    const combinations = governanceStorageCombinations(w.options.materials)
    const reference = ({ combinationVersion, manifestDigest }: typeof combinations.metadata) => ({
      combinationVersion,
      manifestDigest,
    })
    let original: SettingsSourceRequest | undefined
    const observedReplies: unknown[] = []
    const plan = vi.fn(() => {
      throw new Error('named business-plan refusal fixture')
    })
    const made = await createGovernanceLocal({
      ...w.options,
      metadata: reference(combinations.metadata),
      combinations: {
        mutation: reference(combinations.mutation),
        adoption: reference(combinations.adoption),
        catalog: reference(combinations.catalog),
      },
      current: {
        adoption: createGovernanceAdoptionProjection(w.options.domain.transactionDomain),
        catalog: governanceCatalogProjection,
      },
      sourceReservations: {
        async reserve(principal, request) {
          const reply = await sources.reservations.reserve(principal, request)
          observedReplies.push(reply)
          original = structuredClone(request)
          if (fault === 'lost-reserve-reply') throw new Error('fixture lost source reply')
          return reply
        },
        // Keep the actual held responsibility until the SQL Worker has restarted.
        async settle() {
          return { kind: 'rejected', reason: 'unavailable' }
        },
      },
      externalWrites: {
        sourceRoute: w.options.sourceRoute,
        principalOf: (principal: typeof w.principal) => principal,
        async resolve() {
          return {
            kind: 'qualified',
            qualification: { fixture: 'business-admission' },
            required: [],
            source,
          }
        },
        plan,
      },
    })
    if (made.kind !== 'created' || !made.externalWrites) throw new Error(JSON.stringify(made))
    cleanup.push(made.close)
    const result = await made.externalWrites.execute(w.principal, {
      operationId: 'original-source-operation',
      write: {
        owner: 'fixture.business',
        protocol: 'fixture-write/1',
        targetRef: 'target',
        commandDigest: 'original',
        command: { pick: 'deny' },
      },
    })
    expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
    expect(observedReplies).toMatchObject([{ kind: 'held' }])
    expect(plan).toHaveBeenCalledTimes(fault === 'held' ? 1 : 0)
    if (!original) throw new Error('Original source request was not persisted')
    expect(await provision('replace-while-held', 1)).toMatchObject({ kind: 'rejected' })
    expect(await made.close()).toMatchObject({ kind: 'pending' })
    await sources.close()
    const storage = await w.reopenStorage()
    host = mount(storage)
    sources = await openSources(storage)
    expect(await host.sourceDestination.recognize(original)).toEqual({
      kind: 'known',
      request: original,
    })
    const wrong = {
      ...original,
      destination: { ...original.destination, attemptId: 'different-attempt' },
    }
    expect(await host.sourceDestination.seal(wrong)).toMatchObject({ kind: 'unavailable' })
    expect(await provision('replace-before-recovery', 1)).toMatchObject({ kind: 'rejected' })
    if (fault === 'held') {
      expect(await sources.recover({ after: null, limit: 10 })).toMatchObject({
        kind: 'recovered',
        items: [{ request: original, result: { kind: 'settled', outcome: 'aborted' } }],
      })
      expect(openBusiness).not.toHaveBeenCalled()
    } else {
      // The default first lookup invokes original Governance historical recovery.
      expect(await host.runtime(w.options.scope.tenantRef)).toMatchObject({ kind: 'created' })
      expect(await sources.recover({ after: null, limit: 10 })).toMatchObject({
        kind: 'recovered',
        items: [],
      })
    }
    expect(await sources.reservations.settle(original)).toMatchObject({
      kind: 'settled',
      outcome: 'aborted',
    })
    expect(await provision('replace-after-recovery', 1)).toMatchObject({
      kind: 'committed',
      revision: 2,
    })
    expect(await host.runtime(w.options.scope.tenantRef)).toMatchObject({ kind: 'created' })
    expect(openBusiness).toHaveBeenCalledTimes(1)
  },
)

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
        recover: w.options.identity.reservations.recover,
        async reserve(request: Parameters<typeof w.options.identity.reservations.reserve>[0]) {
          const result = await w.options.identity.reservations.reserve(request)
          if (result.kind === 'held') held = result.reservation
          return result
        },
        // Lose only settlement delivery; the original reservation and directory terminal persist.
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
  const host = new TenantGovernanceHost({ domains: w.directory.lookup, prepare })
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
  const host = new TenantGovernanceHost({ domains: w.directory.lookup, prepare })
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
  expect(await rejected.open()).toMatchObject({ kind: 'unavailable', phase: 'registration' })
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
  let prepared: ReturnType<typeof prepareInstalledTenantGovernance> | undefined
  const sources = await openOrganizationSettingsSources({
    ...w.options,
    destination: {
      recognize: request =>
        prepared?.sourceDestination.recognize(request) ?? Promise.resolve({ kind: 'unavailable' }),
      seal: request =>
        prepared?.sourceDestination.seal(request) ?? Promise.resolve({ kind: 'unavailable' }),
    },
  })
  if (sources.kind !== 'created') throw new Error(JSON.stringify(sources))
  cleanup.push(sources.close)
  const targets = sources.targets
  const reservations = sources.reservations
  function prepare(organizationTargets = targets) {
    prepared = prepareInstalledTenantGovernance({
      ...w.options,
      installationPrincipal: w.installationPrincipal,
      release: w.release,
      organizationTargets,
      registry,
      clock: { now: () => 1794096000000 },
      cursorLifetimeMs: 60000,
      sourceReservations: reservations,
    })
    w.setDestination(prepared.destination)
    return prepared
  }
  return { w, sources, prepare }
}

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
    'tool.Files',
    'tool.Shell',
    'tool.TodoItems',
    'tool.Tools',
  ])
  expect(
    catalog.items.every(
      item => item.availability === 'available' && item.selectedTargets.length === 1,
    ),
  ).toBe(true)
  const settings = await prepared.readSettings({
    deploymentRef: w.options.scope.deploymentId,
    mode: 'management',
    targets: [],
    selectionRef: null,
  })
  expect(settings).toMatchObject({ completeness: 'complete' })
  if ('kind' in settings) throw new Error(JSON.stringify(settings))
  expect(settings.views).toHaveLength(4)
  const tool = w.release.manifest.entries.find(entry => entry.asset.name === 'Shell')!
  const principal = w.workPrincipal('request-session')
  const { ledgerWorld } =
    await import('../../../../../packages/tool/tool-storage-sql/tests/fixtures/ledger.ts')
  const fixture = await ledgerWorld(principal.tenant)
  const action = {
    principal,
    tenant: principal.tenant,
    operation: { owner: 'tool', operationId: fixture.input.call },
    definition: tool.asset.adoption,
    effectiveArguments: fixture.input.request.arguments.effective,
    origin: {
      kind: 'tool-call' as const,
      call: fixture.input.call,
      admission: fixture.input.operation,
      request: fixture.input.request,
    },
  }
  const request = await runtime.permissionRequest(action)
  expect(request).toMatchObject({
    scope: { tenantId: w.options.scope.tenantRef, sessionId: 'request-session' },
    operation: action.operation,
    definition: tool.governance.interpretations[0]!.definition.reference,
  })
  const targets = settings.views.filter(
    view =>
      canonicalText(view.definition) === canonicalText(tool.governance.declaration.settings[0]),
  )
  expect(targets).toHaveLength(1)
  const target = targets[0]!.target
  expect(request?.scope.targetId).toBe(canonicalText(target))
  expect(await runtime.permissionRequest({ ...action, principal: w.principal })).toBeUndefined()
  if (request === undefined || runtime.permissionBasis === undefined)
    throw new Error('permission reader not installed')
  expect(
    await runtime.permissionBasis.readCurrent({ ...action, inquiry: null }, request),
  ).toMatchObject({ kind: 'unavailable' })
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
  expect(await reader.request(action)).toEqual(request)
  expect(routes).toEqual([w.options.scope.tenantRef])
  expect(await reader.request({ ...action, principal: { ...principal } })).toBeUndefined()
  expect(await reader.request({ ...action, principal: w.principal })).toBeUndefined()
  expect(routes).toHaveLength(1)
  expect(await reader.readCurrent({ ...action, inquiry: null }, request)).toMatchObject({
    kind: 'unavailable',
  })
  await provider.dispose()
  const opened = routes.length
  expect(await reader.request(action)).toBeUndefined()
  expect(await reader.readCurrent({ ...action, inquiry: null }, request)).toMatchObject({
    kind: 'unavailable',
  })
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
    const categories = createCategoryRegistry()
    categories.register(createToolAssetCategory(w.release))
    const assets = createAssetsLocal({
      ...governanceStorageCombinations(w.options.materials).assets,
      domain: w.options.domain,
      storage: w.options.storage,
      categories,
    })
    cleanup.push(assets.close)
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('organization encoding failed')
    const lookups = w.release.manifest.entries.map(entry => ({
      holding: {
        holdingRef: `harness.preinstalled.tool.${entry.asset.name}`,
        scopeRef: w.options.scope.tenantRef,
      },
      source: organizationSettingsSource({
        organizationId: organization.value,
        definition: entry.governance.declaration.settings[0]!,
      }).target,
    }))
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
      expect(item.selectedTargets).toHaveLength(disabled ? 0 : 1)
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
  expect(interrupted).toMatchObject({ kind: 'unavailable', phase: 'installation' })
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

it('preserves a nonempty Settings assignment across default tenant installation remount', async () => {
  const configuration = {
    destination: 'settings.installation-preservation',
    sourceRoute: 'settings.installation-preservation',
    required: [],
  }
  const { w, prepare } = await installedWorld(settingsCurrentMaterials(configuration))
  const assembly = prepare()
  const runtime = await assembly.open()
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(runtime.close)
  const entry = w.release.manifest.entries.find(value => value.asset.name === 'Shell')
  if (!entry) throw new Error('Shell release absent')
  const target = {
    policyId: 'asset',
    targetRef: 'harness.preinstalled.tool.Shell',
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
  async function register(name: string, participants: readonly string[]) {
    const selected = [...new Set(participants)]
    const manifest = combinationManifest({ catalog: w.options.materials, participants: selected })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `test-installation-${name}/1`,
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
  const capture = await register('capture', [
    ...dependencies,
    ...SETTINGS_RECOVERY_PARTICIPANTS,
    settingsCurrentParticipant('capture'),
  ])
  const registrations = {
    checkpoint: await register('checkpoint', SETTINGS_CHECKPOINT_PARTICIPANTS),
    ready: await register('ready', [
      ...dependencies,
      ...SETTINGS_READY_PARTICIPANTS,
      settingsCurrentParticipant('ready'),
    ]),
    commit: await register('commit', [
      ...dependencies,
      ...SETTINGS_COMMIT_PARTICIPANTS,
      settingsCurrentParticipant('commit'),
    ]),
    recovery: await register('recovery', SETTINGS_RECOVERY_PARTICIPANTS),
  }
  const settings = createIdentityQualifiedSettingsPreparation({
    identity: w.options.identity,
    required: [],
    backend: {
      storage: w.options.storage,
      domain: w.options.domain,
      destination: configuration.destination,
      registrations,
      ...createSettingsCurrentProjection({
        storage: w.options.storage,
        domain: w.options.domain,
        capture,
        location: {
          scope: w.options.scope,
          epoch: runtime.epoch,
          mode: 'management',
          definition: entry.governance.declaration.reference,
          target,
        },
      }),
      // This setup capability seeds one original tenant value; it does not test user editing policy.
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
    itemId: 'invoke',
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
        itemId: 'invoke',
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
