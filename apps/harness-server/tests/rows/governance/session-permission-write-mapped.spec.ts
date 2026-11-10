// @module-tag slow
import { rmSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { access, loginStateCodec, organizationCodec } from '@omne-harness/legal-identity'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { createSettingsRegistry } from '@omne-harness/settings'
import { assetsSettingsProjectionCommand } from '@omne-harness/assets-local'
import {
  createSettingsCatalog,
  settingsCatalogMaterials,
  standaloneSettingsProjectionCommand,
} from '@omne-harness/settings-local'
import { createSettingsCatalogDestination } from '@omne-harness/settings-local/identity'
import { createIdentityQualifiedSettingsSources } from '@omne-harness/settings-local/preparation'
import {
  createGovernanceLocalSourceDestination,
  type GovernanceLocalOptions,
} from '@omne-harness/governance-local'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import type { SessionCommand } from '@omne-harness/session-contract'
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
import {
  createSessionPermissionWriteResolver,
  sessionPermissionResolvedQualificationSchema,
  type SessionPermissionCatalogReader,
} from '../../../src/rows/governance/session-permission-discovery.ts'
import {
  createSessionPermissionSettingsResolver,
  type SessionPermissionSettingsReader,
  type SessionPermissionMappedSource,
} from '../../../src/rows/governance/session-permission-settings.ts'
import { createSessionPermissionWritePlan } from '../../../src/rows/governance/session-permission-plan.ts'
import { withSessionPermissionCommit } from '../../../src/rows/governance/session-permission-commit.ts'
import { sessionPermissionBasisParticipant } from '../../../dist/rows/governance/session-permission-basis.js'
import { sessionPermissionResultParticipant } from '../../../dist/rows/governance/session-permission-result.js'

const closed: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of closed.splice(0).reverse()) await close()
})

it.each(['set', 'organization-deny', 'tenant-deny', 'selected-source'] as const)(
  'uses real Settings and retained organization values for Session writes: %s',
  async scenario => {
    const session = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
    const catalog = settingsCatalogMaterials()
    const bases = {
      clear: sessionPermissionBasisParticipant({ mode: 'clear', requiredConstraintIds: [] }),
      unmapped: sessionPermissionBasisParticipant({ mode: 'unmapped', requiredConstraintIds: [] }),
      mapped: sessionPermissionBasisParticipant({ mode: 'mapped', requiredConstraintIds: [] }),
    }
    let readCatalog: SessionPermissionCatalogReader = async () => ({
      kind: 'unavailable',
      owner: 'not-installed',
    })
    let readSettings: SessionPermissionSettingsReader = async () => ({
      kind: 'rejected',
      reason: 'unavailable',
    })
    let route: SessionPermissionMappedSource['source'] | undefined
    let reservations: GovernanceLocalOptions['sourceReservations']
    const w = await settingsPreparationWorld({
      extraParticipants: [
        ...session.participants,
        ...catalog.participants,
        ...Object.values(bases),
        sessionPermissionResultParticipant(),
      ],
      extraMigrations: [...session.migrations, ...catalog.migrations],
      extraReadHandlers: session.readHandlers,
      sourceReservations: {
        reserve: (principal, request) =>
          reservations?.reserve(principal, request) ??
          Promise.resolve({ kind: 'rejected', reason: 'unavailable' }),
        settle: request =>
          reservations?.settle(request) ??
          Promise.resolve({ kind: 'rejected', reason: 'unavailable' }),
      },
      async externalWrites({ register, snapshotParticipants, scope }) {
        const common = [
          'execution-record',
          'governance.external-write-basis',
          'session',
          'harness.session-permission-result',
          'governance.external-write-terminal',
          'governance.activation',
        ]
        const combination = async (mode: 'clear' | 'unmapped' | 'mapped') =>
          register(`session-${mode}`, [
            ...new Set([
              ...common,
              bases[mode].participant,
              ...(mode === 'clear' ? [] : ['governance.definition-projection']),
              ...(mode === 'mapped'
                ? snapshotParticipants.filter(value => value !== 'governance.metadata-plan')
                : []),
            ]),
          ])
        const registrations = {
          clear: { combination: await combination('clear'), requiredConstraintIds: [] },
          unmapped: { combination: await combination('unmapped'), requiredConstraintIds: [] },
          mapped: { combination: await combination('mapped'), requiredConstraintIds: [] },
        }
        const resolve = createSessionPermissionWriteResolver({
          login: () => w.identityGovernance,
          scope,
          readCatalog: request => readCatalog(request),
          settings: createSessionPermissionSettingsResolver({
            read: request => readSettings(request),
            organizationSource: async () => route,
          }),
        })
        return {
          sourceRoute: 'governance.session-permission-write',
          principalOf: context => context.principal,
          async resolve(principal, intent, context) {
            const result = await resolve(principal, intent, context)
            if (scenario !== 'selected-source' || result.kind !== 'qualified') return result
            const selected = sessionPermissionResolvedQualificationSchema.parse(
              result.qualification,
            )
            if (selected.kind !== 'set' || selected.settings.kind !== 'mapped')
              throw new Error('Mapped selection required')
            return {
              ...result,
              qualification: {
                ...selected,
                settings: {
                  ...selected.settings,
                  source: {
                    ...selected.settings.source,
                    target: { ...selected.settings.source.target, targetRef: 'replaced-source' },
                  },
                },
              },
            }
          },
          plan: createSessionPermissionWritePlan(registrations),
        }
      },
    })
    closed.push(() => w.close())
    readCatalog = request => w.service.readCatalog(w.access, request)
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
      createGovernanceLocalSourceDestination({
        ...w.coordination,
        sourceRoute: 'governance.session-permission-write',
      }),
      undefined,
      route,
      definition,
    )
    const qualified = createIdentityQualifiedSettingsSources({
      identity: w.identity,
      backend: {
        ...source.options,
        access: {
          async authorize(principal: ActingForTenantPrincipal, input) {
            return {
              kind: 'authorized',
              scope: input.source.domain.scope,
              target: input.source.target,
              principalRef: standingPrincipalRef(principal),
            }
          },
        },
      },
    })
    reservations = qualified.service
    closed.unshift(async () => {
      await qualified.control.close()
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
    const entry = { tenant: w.scope.tenantRef, domain: w.domain }
    const port = createSessionStorage({
      storage: w.storage,
      combination: ordinary,
      domains: {
        resolve: async () => ({ kind: 'ready', entry }),
        snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [entry] } }),
      },
      accessCheck: {
        check: async () => ({ kind: 'allowed', evidence: evidence('fixture-create-only') }),
      },
      cursorSigning: createFixedSessionCursorSigning(),
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
    const request = {
      access: access(principal, principal.tenant),
      operation: 'change' as const,
      target: { kind: 'session' as const, session: sessionAccess.session, command },
    }
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
    const admitted = await checker.check(request)
    if (admitted.kind !== 'allowed' || !admitted.writeQualification || !w.externalWrites)
      throw new Error('Admission or writer')
    const writes = w.externalWrites
    const view = withSessionPermissionCommit(
      port,
      { request, evidence: admitted.evidence, writeQualification: admitted.writeQualification },
      async () => ({ writes, storage: w.storage }),
    )
    const before = await port.readWork(sessionAccess)
    const outcome = await view.commit({ access: sessionAccess, command, guards: [] })
    expect(outcome).toMatchObject(
      scenario === 'set' ? { ok: { recovered: false } } : { failure: { kind: 'unavailable' } },
    )
    if (scenario === 'set') {
      expect(await port.readWork(sessionAccess)).toMatchObject({
        ok: {
          permissions: {
            revision: '1',
            assignments: [{ rule: { pick: 'auto', allowedSet: null } }],
          },
        },
      })
      expect(await view.commit({ access: sessionAccess, command, guards: [] })).toMatchObject({
        ok: { recovered: true },
      })
    } else expect(await port.readWork(sessionAccess)).toEqual(before)
  },
)
