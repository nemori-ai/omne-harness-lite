import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import canonicalize from 'canonicalize'
import { createCalendarSettingsEnvironment } from '@omne-harness/calendar-local'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import {
  SettingDefinitionsSchema,
  createSettingsRegistry,
  type SettingsViewRequest,
} from '@omne-harness/settings'
import {
  createSettingsCatalog,
  createStandaloneSettingsOwner,
  settingsSqlMaterials,
  settingsStandaloneMaterials,
  settingsWithoutAssetsMaterials,
  settingsCatalogMaterials,
  standaloneSettingsProjectionCommand,
  settingsWithoutAssetsProjectionCommand,
  type SettingsProjectionBinding,
} from '@omne-harness/settings-local'
import { createSettingsCatalogDestination } from '@omne-harness/settings-local/identity'
import { inProcessPrincipalAuthority, standingPrincipalRef } from '@omne-harness/identity'
import {
  manualIdentityClock,
  adjustableInvitationTerms,
  adjustableLoginTerms,
} from '@omne-harness/identity/testing'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
  randomIdentifiers,
} from '@omne-harness/identity-sql'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { openScrypt } from '@omne-harness/scrypt'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error('Invalid fixture duration')
  return parsed.value
}
function canonical(value: unknown) {
  const text = canonicalize(value)
  if (text === undefined) throw new Error('Invalid fixture JSON')
  return text
}

function config(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 100,
    globalAdmissionLimit: 100,
    admissionWaitMs: 1000,
    lockWaitMs: 1000,
    maxCommandsPerCommit: 8,
    maxCommandBytes: 16 << 20,
    maxRequestBytes: 20 << 20,
    globalInFlightWriteBytes: 64 << 20,
    maxJsonDepth: 50,
    maxJsonMembers: 100000,
    maxResponseBytes: 1 << 20,
    maxOperationResponseBytes: 2 << 20,
    globalWriteResponseBytes: 64 << 20,
    maxDiagnosticBytes: 1024,
    maxWorkers: 4,
    reservedWriterSlots: 1,
    maxReadWorkersPerDomain: 1,
    readQueuePerDomain: 50,
    readQueueGlobal: 50,
    readQueueTimeoutMs: 10000,
    maxReadInputBytes: 1 << 20,
    maxReadResultBytes: 8 << 20,
    globalReadResultBytes: 32 << 20,
    readObservationMs: 10000,
    readerIdleMs: 60000,
    queryQueuePerDomain: 50,
    queryQueueGlobal: 50,
    controlQueuePerDomain: 50,
    controlQueueGlobal: 50,
    writesPerControlTurn: 1,
    groupMaxOperations: 1,
    groupCollectMs: 0,
    groupMaxInputBytes: 32 << 20,
    groupMaxResponseReservationBytes: 8 << 20,
    groupMaxExecutionSliceMs: 100,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 8 << 20,
    checkpointIntervalMs: 60000,
    checkpointWalBytes: 8 << 20,
    walReadPauseBytes: 64 << 20,
    walWriteStopBytes: 128 << 20,
    closeDeadlineMs: 10000,
  }
}

export async function openSettingsComposition(
  options: {
    absentTimezone?: boolean
    failAfterStorage?: boolean
    lifecycle?: { leases: Set<object>; storageClosed: boolean }
  } = {},
) {
  const lifecycle = options.lifecycle ?? { leases: new Set<object>(), storageClosed: false }
  const cleanup: (() => void | Promise<void>)[] = []
  let closed: Promise<void> | undefined
  function close() {
    return (closed ??= (async () => {
      const errors: unknown[] = []
      for (const dispose of cleanup.splice(0).reverse()) {
        try {
          await dispose()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Composition cleanup failed')
    })())
  }
  try {
    const directory = fileURLToPath(
      new URL('../../../../tmp/r1-read-composition/databases/', import.meta.url),
    )
    mkdirSync(directory, { recursive: true })
    const root = realpathSync(mkdtempSync(join(directory, 'case-')))
    const ids = randomIdentifiers()
    const ada = ids.account(),
      bob = ids.account()
    const personalA = ids.organization(),
      personalB = ids.organization(),
      team = ids.organization()
    const subject = tenant(team, bob)
    const encoded = tenantCodec.encode(subject)
    if (!encoded.ok) throw new Error('Invalid fixture tenant')
    const scopeRef = encoded.value
    const domain = {
      scope: { kind: 'tenant' as const, tenant: scopeRef },
      transactionDomain: 'calendar.settings.composition',
    }
    const groups = [
      settingsSqlMaterials(),
      settingsStandaloneMaterials(),
      settingsWithoutAssetsMaterials(),
      settingsCatalogMaterials(),
    ]
    const identityMaterials = identitySqlMaterials()
    const materials: SqlMaterialCatalog = {
      catalogProtocol: 'sql-catalog/1',
      participants: [...groups.flatMap(m => m.participants), ...identityMaterials.participants],
      migrations: [...groups.flatMap(m => m.migrations), ...identityMaterials.migrations],
      readHandlers: [...groups.flatMap(m => m.readHandlers), ...identityMaterials.readHandlers],
      declaredCombinations: { tenant: null, system: null },
    }
    // The owner's publication and the catalog read, with the participants their facts depend on.
    // The plans of a prepared write (`commit-plan`, `ready-plan`, `checkpoint-plan`) stay out: only
    // an application gives their current facts. `recovery-plan` gives the finalization plan here.
    const participants = [
      'settings.source-snapshot',
      'settings.source-retention',
      'settings.terminal-observation',
      'settings.recovery-plan',
      'settings.terminal',
      'settings.persistence',
      'settings.targets',
      'settings.target-projection',
      'settings.without-assets',
      'settings.catalog-terminal',
      'settings.snapshot',
    ]
    const manifest = combinationManifest({ catalog: materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const opened = await createSqliteStorage({
      config: config(root),
      materials,
      closeLeases: {
        admit() {
          const lease = {}
          lifecycle.leases.add(lease)
          return lease
        },
        release(lease) {
          lifecycle.leases.delete(lease)
        },
      },
    })
    if (opened.kind !== 'created') throw new Error(JSON.stringify(opened))
    cleanup.push(async () => {
      const result = await opened.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed' || lifecycle.leases.size !== 0)
        throw new Error(JSON.stringify(result))
      lifecycle.storageClosed = true
    })
    if (options.failAfterStorage) throw new Error('injected initialization failure')
    const combination = {
      ...domain,
      combinationVersion: 'calendar-settings/1',
      manifestDigest: manifestDigest(manifest.manifest),
      participants,
    }
    for (const registration of [combination, identitySqlRegistration()]) {
      const result = await opened.storage.registerCombination(registration)
      if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
    }
    const terminalOptions = {
      storage: opened.storage,
      domain,
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
    }
    const scrypt = openScrypt({
      N: 1024,
      r: 8,
      p: 1,
      keylen: 32,
      saltBytes: 16,
      inFlight: 1,
      queue: 8,
    })
    if (!scrypt.ok) throw new Error('Scrypt initialization failed')
    cleanup.push(async () => {
      const result = await scrypt.module.close()
      if (result.code !== 'closed') throw new Error(JSON.stringify(result))
    })
    const decoy = scrypt.module.derive('decoy', () => ({ ok: true }))
    if (!('done' in decoy)) throw new Error('Scrypt admission failed')
    const material = await decoy.done
    if (material.code !== 'material') throw new Error('Scrypt material failed')
    const now = parseInstant('2026-11-06T00:00:00Z')
    if (!now.ok) throw new Error('Invalid fixture time')
    const clock = manualIdentityClock(now.value)
    const authority = inProcessPrincipalAuthority()
    const actor = authority.issuer.issueSystem({ component: 'calendar-settings-composition' })
    if (!('ok' in actor)) throw new Error('Principal actor issuance failed')
    const issuedActor = actor.ok
    function issue(selected: typeof subject) {
      const result = authority.issuer.issueActingForTenant({
        actor: issuedActor,
        tenant: selected,
        work: { owner: 'calendar', work: 'read-environment' },
      })
      if (!('ok' in result)) throw new Error('Principal issuance failed')
      return result.ok
    }
    const principal = issue(subject)
    const foreignPrincipal = issue(tenant(personalA, ada))
    const destination = 'calendar.settings'
    const accounts = [ada, bob],
      organizations = [personalA, personalB, team]
    const identity = createIdentitySql({
      storage: opened.storage,
      clock: clock.clock,
      terms: adjustableLoginTerms({
        maxLifetime: duration('PT86400S'),
        idlePeriod: duration('PT3600S'),
      }).source,
      invitationTerms: adjustableInvitationTerms({
        defaultDuration: duration('PT3600S'),
        maxDuration: duration('PT86400S'),
      }).source,
      scrypt: scrypt.module,
      decoyMaterial: material.material,
      principalVerifier: authority.verifier,
      accessRefreshGranularity: duration('PT60S'),
      destinationResolver: createSettingsCatalogDestination({ ...terminalOptions, destination }),
      identifiers: {
        account() {
          const value = accounts.shift()
          if (!value) throw new Error('Account IDs exhausted')
          return value
        },
        organization() {
          const value = organizations.shift()
          if (!value) throw new Error('Organization IDs exhausted')
          return value
        },
        login: ids.login,
      },
    })
    cleanup.push(() => identity.stop())
    const regA = await identity.operations.registerAndActivate({
      loginIdentifier: 'ada',
      credential: 'ada-secret',
    })
    const regB = await identity.operations.registerAndActivate({
      loginIdentifier: 'bob',
      credential: 'bob-secret',
    })
    const loginA = await identity.operations.issueLogin({
      loginIdentifier: 'ada',
      credential: 'ada-secret',
    })
    const loginB = await identity.operations.issueLogin({
      loginIdentifier: 'bob',
      credential: 'bob-secret',
    })
    if (
      regA.kind !== 'succeeded' ||
      regB.kind !== 'succeeded' ||
      loginA.kind !== 'succeeded' ||
      loginB.kind !== 'succeeded'
    )
      throw new Error('Identity registration/login failed')
    const organization = await identity.governance.createOrganization({
      login: loginA.login,
      actingTenant: regA.tenant,
      createCallId: 'team-create',
      name: 'Calendar composition',
      governanceModelId: 'default-team',
    })
    if (organization.kind !== 'succeeded') throw new Error(JSON.stringify(organization))
    const switchA = await identity.governance.switchCurrentTenant({
      login: loginA.login,
      actingTenant: regA.tenant,
      tenant: organization.tenant,
    })
    if (switchA.kind !== 'succeeded') throw new Error(JSON.stringify(switchA))
    const invitation = await identity.governance.issueMemberInvitation({
      login: loginA.login,
      actingTenant: organization.tenant,
      invitedLoginIdentifier: 'bob',
    })
    if (invitation.kind !== 'succeeded') throw new Error(JSON.stringify(invitation))
    const accepted = await identity.governance.acceptMemberInvitation({
      login: loginB.login,
      actingTenant: regB.tenant,
      invitation: invitation.invitation,
      expectedState: 'open',
    })
    if (accepted.kind !== 'succeeded') throw new Error(JSON.stringify(accepted))
    const switchB = await identity.governance.switchCurrentTenant({
      login: loginB.login,
      actingTenant: regB.tenant,
      tenant: subject,
    })
    if (switchB.kind !== 'succeeded') throw new Error(JSON.stringify(switchB))
    type Defaults = { timezone: string | null; calendar: string | null }
    const defined = (version: string, defaults: Defaults) => {
      const definition = SettingDefinitionsSchema.parse({
        providerId: 'calendar',
        definitionId: 'environment',
        version,
        groups: [
          {
            id: 'environment',
            parentId: null,
            title: 'Calendar environment',
            description: 'Calendar consumer settings',
            order: 0,
          },
        ],
        items: (['timezone', 'calendar'] as const).map(id => ({
          id,
          groupId: 'environment',
          category: 'preference',
          presentation: {
            title: id,
            description: `Consumer ${id}`,
            impact: 'Used by the next read',
            clear: 'Use the declared default',
            adoption: 'next-read',
          },
          valueSchema: id === 'timezone' ? { type: 'string' } : { type: ['string', 'null'] },
          default:
            id === 'timezone' && defaults.timezone === null
              ? { kind: 'absent' }
              : { kind: 'value', value: defaults[id] },
          merge: 'override',
          sensitivity: 'ordinary',
        })),
      })
      return {
        definition,
        ref: {
          providerId: definition.providerId,
          definitionId: definition.definitionId,
          version: definition.version,
          digest: createHash('sha256').update(canonical(definition)).digest('hex'),
        },
      }
    }
    const initial: Defaults = {
      timezone: options.absentTimezone ? null : 'Asia/Tokyo',
      calendar: 'jp',
    }
    let current = initial
    const first = defined('1', initial)
    const definition = first.definition
    let definitionRef = first.ref
    const registry = createSettingsRegistry({ capacity: 4 })
    cleanup.push(() => registry.close())
    const registration = registry.registerContribution(definition)
    if (registration.kind !== 'registered') throw new Error(JSON.stringify(registration))
    const target = { policyId: 'independent', targetRef: 'calendar-environment', scopeRef }
    const project = (binding: SettingsProjectionBinding) => [
      standaloneSettingsProjectionCommand(binding),
      settingsWithoutAssetsProjectionCommand(binding),
    ]
    const owner = createStandaloneSettingsOwner(terminalOptions)
    cleanup.push(() => owner.close())
    const publish = (
      operationId: string,
      expectedRevision: number | null,
      published: typeof definition,
    ) =>
      owner.mutate({
        kind: 'provision',
        operationId,
        expectedRevision,
        record: {
          publicationRef: null,
          target,
          definition: published,
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: 'deployment',
              scope: { kind: 'tenant', subjectRef: 'tenant-a' },
            },
          ],
          grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
        },
      })
    const provision = await publish('initial', null, definition)
    if (provision.kind !== 'committed') throw new Error(JSON.stringify(provision))
    const catalog = createSettingsCatalog({
      ...terminalOptions,
      deploymentRef: 'calendar-composition',
      destination,
      verifier: authority.verifier,
      reservations: identity.reservations,
      required: [],
      registry,
      project,
      clock: { now: () => 1000 },
      cursorLifetimeMs: 60000,
    })
    cleanup.push(() => catalog.close())
    const request: SettingsViewRequest = {
      deploymentRef: 'calendar-composition',
      mode: 'management',
      targets: [target],
      selectionRef: null,
    }
    const context = calendarCallContextSchema.parse({
      principalRef: standingPrincipalRef(principal),
      owner: { kind: 'tenant', tenantId: scopeRef, ownerId: 'calendar-consumer' },
      actor: { kind: 'system', actorRef: 'calendar-composition' },
      authContextRef: 'trusted-binding',
      requestId: 'read-environment',
      originatingSessionRef: null,
    })
    const foreign = tenantCodec.encode(tenant(personalA, ada))
    if (!foreign.ok) throw new Error('Invalid foreign tenant')
    const foreignContext = calendarCallContextSchema.parse({
      ...context,
      principalRef: standingPrincipalRef(foreignPrincipal),
      owner: { ...context.owner, tenantId: foreign.value },
    })
    // Intentionally return the original trusted binding for every context to exercise the adapter's owner check.
    const environment = createCalendarSettingsEnvironment({
      settings: catalog,
      resolve: async () => ({
        principal,
        owner: context.owner,
        request,
        target,
        definitionRef,
        timezoneItemId: 'timezone',
        calendarItemId: 'calendar',
      }),
    })
    return {
      root,
      principal,
      foreignPrincipal,
      request,
      context,
      foreignContext,
      environment,
      catalog,
      owner,
      registry,
      registration,
      definition,
      target,
      lifecycle,
      /**
       * The owner publishes another version of the definition with these defaults. A change by
       * the user goes through the Settings preparation service, which this world does not assemble.
       */
      async republish(change: Partial<Defaults>, expectedRevision: number) {
        const defaults = { ...current, ...change }
        const next = defined(String(expectedRevision + 1), defaults)
        const registered = registry.registerContribution(next.definition)
        if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
        const published = await publish(
          `republish-${randomUUID()}`,
          expectedRevision,
          next.definition,
        )
        if (published.kind === 'committed') {
          definitionRef = next.ref
          current = defaults
        }
        return published
      },
      removeMember: () =>
        identity.governance.removeMember({
          login: loginA.login,
          actingTenant: organization.tenant,
          organization: team,
          account: bob,
          expectedRole: 'member',
        }),
      close,
    }
  } catch (error) {
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Initialization and cleanup failed')
    }
    throw error
  }
}
