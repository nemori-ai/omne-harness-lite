// @module-tag slow
import { rmSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { loginStateCodec, organizationCodec } from '@omne-harness/legal-identity'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { createSettingsRegistry } from '@omne-harness/settings'
import { assetsSettingsProjectionCommand } from '@omne-harness/assets-local'
import {
  createSettingsCatalog,
  settingsCatalogMaterials,
  standaloneSettingsProjectionCommand,
} from '@omne-harness/settings-local'
import { createSettingsCatalogDestination } from '@omne-harness/settings-local/identity'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import type { SessionAccessCheck, SessionCommand } from '@omne-harness/session-contract'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  creation,
  evidence,
  sessionId,
  operationId,
  initializationFixtureGuard,
  initializationFixtureFacts,
  adoptedInitializationFixture,
} from '@omne-harness/session-contract/testing'
import { openSourceServiceWorld } from '../../../../../packages/assets/settings-local/tests/source-service-world.ts'
import { settingsPreparationWorld } from './settings-preparation-world.ts'
import { createSessionAccessCheck } from '../../../src/rows/authorization/adapters.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import { createSessionPermissionBasisSource } from '../../../src/rows/governance/session-permission-basis-source.ts'
import {
  createSessionPermissionSettingsResolver,
  type SessionPermissionSettingsReader,
  type SessionPermissionMappedSource,
} from '../../../src/rows/governance/session-permission-settings.ts'
import { sessionPermissionBasisParticipant } from '../../../dist/rows/governance/session-permission-basis.js'

type Principal = ActingForTenantPrincipal
type Change = Extract<SessionCommand, { kind: 'change' }>

const closed: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of closed.splice(0).reverse()) await close()
})

it.each(['set', 'organization-deny', 'tenant-deny', 'selected-source'] as const)(
  'judges a mapped Session write on real Settings and the current organization value: %s',
  async scenario => {
    const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
    const catalog = settingsCatalogMaterials()
    const bases = {
      clear: sessionPermissionBasisParticipant({ mode: 'clear', requiredConstraintIds: [] }),
      unmapped: sessionPermissionBasisParticipant({ mode: 'unmapped', requiredConstraintIds: [] }),
      mapped: sessionPermissionBasisParticipant({ mode: 'mapped', requiredConstraintIds: [] }),
    }
    let readSettings: SessionPermissionSettingsReader = async () => ({
      kind: 'rejected',
      reason: 'unavailable',
    })
    let route: SessionPermissionMappedSource['source'] | undefined
    const w = await settingsPreparationWorld({
      extraParticipants: [
        ...session.participants,
        ...catalog.participants,
        ...Object.values(bases),
      ],
      extraMigrations: [...session.migrations, ...catalog.migrations],
      extraReadHandlers: session.readHandlers,
    })
    closed.push(() => w.close())
    const registry = createSettingsRegistry({ capacity: 16 })
    for (const definition of w.declaration.settings)
      expect(registry.registerContribution(definition).kind).toBe('registered')
    const registration = await w.register('session-settings-catalog', [
      ...new Set([...w.snapshotParticipants, 'settings.catalog-terminal', 'settings.snapshot']),
    ])
    const catalogOptions = {
      storage: w.storage,
      domain: w.domain,
      ...registration,
      destination: 'settings.catalog',
    }
    w.setSettingsCatalogDestination(createSettingsCatalogDestination(catalogOptions))
    const reader = createSettingsCatalog({
      ...catalogOptions,
      deploymentRef: w.scope.deploymentId,
      verifier: w.identity.verifier,
      reservations: w.identity.reservations,
      required: [],
      registry,
      project: binding => [
        assetsSettingsProjectionCommand(binding),
        standaloneSettingsProjectionCommand(binding),
      ],
      clock: { now: () => 1000 },
      cursorLifetimeMs: 60000,
    })
    closed.push(async () => {
      await reader.close()
      registry.close()
    })
    readSettings = request => reader.read(w.principal, request)
    const organization = organizationCodec.encode(w.principal.tenant.organization)
    if (!organization.ok) throw new Error('Organization encoding')
    route = {
      domain: { scope: { kind: 'system' }, transactionDomain: 'system.settings' },
      target: {
        policyId: 'independent',
        scopeRef: organization.value,
        targetRef: 'shell-permission',
      },
    }
    const definition = w.declaration.settings[0]
    if (!definition) throw new Error('Settings declaration')
    const source = await openSourceServiceWorld(
      { seal: async () => ({ kind: 'unavailable' }) },
      undefined,
      route,
      definition,
    )
    closed.unshift(async () => {
      await source.close()
      rmSync(source.root, { recursive: true, force: true })
    })
    expect(
      await source.set({
        pick: scenario === 'organization-deny' ? 'deny' : 'auto',
        allowedSet: null,
      }),
    ).toMatchObject({ kind: 'committed' })
    if (scenario === 'tenant-deny') {
      const prepared = await w.prepared.prepareChange(w.principal, w.command)
      if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
      expect(
        await w.prepared.commitChange(w.principal, {
          requestId: 'deny-tenant',
          preparation: prepared.preparation,
        }),
      ).toMatchObject({ kind: 'committed' })
    }
    const login = await w.identityOperations.issueLogin({
      loginIdentifier: 'governance-user',
      credential: 'test-secret',
    })
    if (login.kind !== 'succeeded') throw new Error('Login')
    const encoded = loginStateCodec.encode(login.login),
      actor = w.issuer.issueSystem({ component: 'mapped-session-test' })
    if (!encoded.ok || !('ok' in actor)) throw new Error('Login principal material')
    const issued = w.issuer.issueActingForTenant({
      actor: actor.ok,
      tenant: w.principal.tenant,
      work: { owner: 'identity-login', work: encoded.value },
    })
    if (!('ok' in issued)) throw new Error('Login principal')
    const principal = issued.ok
    const ordinary = await w.register('session-ordinary', [...SESSION_LOG_PARTICIPANTS])
    const mapped = await w.register('session-mapped', [
      ...new Set([
        'execution-record',
        'session',
        bases.mapped.participant,
        'governance.definition-projection',
        ...w.snapshotParticipants,
      ]),
    ])
    const unused = await w.register('session-clear', [
      'execution-record',
      'session',
      bases.clear.participant,
    ])
    const checker = createSessionAccessCheck({
      admission: referenceAdmissionCheck({
        verifier: w.identity.verifier,
        standing: w.identity.standing,
        permits: null,
      }),
      login: w.identityGovernance,
      systemActions: {
        check: async () => {
          throw new Error('Not system')
        },
      },
    })
    const read: SqlStorage['read'] = (input, readOptions) =>
      (input.domain.scope.kind === 'system' ? source.options.storage : w.storage).read(
        input,
        readOptions,
      )
    const basisSource = createSessionPermissionBasisSource({
      scope: w.scope,
      domain: w.domain,
      epoch: w.epoch,
      storage: { read },
      login: () => w.identityGovernance,
      settings: createSessionPermissionSettingsResolver({
        read: request => readSettings(request),
        organizationSource: async () =>
          route === undefined || scenario !== 'selected-source'
            ? route
            : { ...route, target: { ...route.target, targetRef: 'replaced-source' } },
      }),
      readCatalog: request => w.service.readCatalog(w.access, request),
      combinations: { clear: unused, unmapped: unused, mapped },
    })
    const accessCheck: SessionAccessCheck<Principal> = {
      check: request =>
        request.operation === 'change'
          ? checker.check(request)
          : Promise.resolve({ kind: 'allowed', evidence: evidence('fixture-not-a-change') }),
    }
    const entry = { tenant: w.scope.tenantRef, domain: w.domain }
    const port = createSessionStorage<Principal>({
      storage: w.storage,
      combination: ordinary,
      domains: {
        resolve: async () => ({ kind: 'ready', entry }),
        snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [entry] } }),
      },
      accessCheck,
      cursorSigning: createFixedSessionCursorSigning(),
      protectedBasis: basisSource,
    })
    const sessionAccess = {
      principal,
      tenant: principal.tenant,
      session: sessionId('mapped-permission-session'),
    }
    const create = {
      kind: 'create',
      input: {
        tenant: principal.tenant,
        session: sessionAccess.session,
        operation: operationId('create'),
        creation: creation(),
      },
    } satisfies SessionCommand
    expect(
      await port.commit({
        access: sessionAccess,
        command: create,
        guards: [
          initializationFixtureGuard(
            initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
          ),
        ],
      }),
    ).toHaveProperty('ok')
    const permission = w.declaration.permissions[0]
    if (!permission) throw new Error('Permission')
    const command = {
      kind: 'change',
      input: {
        tenant: principal.tenant,
        session: sessionAccess.session,
        operation: operationId('set-permission'),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: permission.capabilityId,
          enforcementKey: permission.enforcementKey,
          definition: permission.reference,
          rule: { pick: 'auto', allowedSet: null },
          expectedRevision: '0',
          authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
        },
      },
    } satisfies SessionCommand
    const commit = (value: Change) =>
      port.commit({ access: sessionAccess, command: value, guards: [] })
    const before = await port.readWork(sessionAccess)
    const outcome = await commit(command)
    expect(outcome).toMatchObject(
      scenario === 'set' ? { ok: { recovered: false } } : { failure: { kind: 'unavailable' } },
    )
    if (scenario !== 'set') {
      expect(await port.readWork(sessionAccess)).toEqual(before)
      return
    }
    expect(await port.readWork(sessionAccess)).toMatchObject({
      ok: {
        permissions: {
          revision: '1',
          assignments: [{ rule: { pick: 'auto', allowedSet: null } }],
        },
      },
    })
    expect(await commit(command)).toMatchObject({ ok: { recovered: true } })
    expect(
      await source.set({ pick: 'deny', allowedSet: null }, 1, 'set-source-again'),
    ).toMatchObject({ kind: 'committed' })
    const next: Change = {
      ...command,
      input: {
        ...command.input,
        operation: operationId('set-permission-again'),
        declaration: { ...command.input.declaration, expectedRevision: '1' },
      },
    }
    expect(await commit(next)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await commit(command)).toMatchObject({ ok: { recovered: true } })
    expect(await port.readWork(sessionAccess)).toMatchObject({
      ok: { permissions: { revision: '1' } },
    })
  },
)
