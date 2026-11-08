// @module-tag slow
import { z } from 'zod'
import { afterEach, expect, it } from 'vitest'
import { standingPrincipalRef } from '@omne-harness/identity'
import {
  createSessionPermissionWriteResolver,
  sessionPermissionResolvedQualificationSchema,
  type SessionPermissionCatalogReader,
} from '../../../src/rows/governance/session-permission-discovery.ts'
import { access, loginStateCodec } from '@omne-harness/legal-identity'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import {
  createGovernanceLocal,
  governanceDefinitionProjectionCommand,
} from '@omne-harness/governance-local'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import {
  SESSION_LOG_PARTICIPANTS,
  sessionCommandFacts,
} from '@omne-harness/session-storage-sql/participants'
import {
  commandDigest,
  type SessionCommand,
  type GuardCommand,
} from '@omne-harness/session-contract'
import {
  creation,
  adoption,
  evidence,
  sessionId,
  operationId,
  initializationFixtureGuard,
  initializationFixtureFacts,
  adoptedInitializationFixture,
} from '@omne-harness/session-contract/testing'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { openRegistrarWorld } from '../../../../../packages/governance/governance-local/tests/registrar-world.ts'
import { openProviderWorld } from '../../../../../packages/governance/governance-local/tests/provider-world.ts'
import { createSessionAccessCheck } from '../../../src/rows/authorization/adapters.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import { sessionPermissionQualification } from '../../../src/rows/governance/session-permission-qualification.ts'
import { sessionPermissionBasisParticipant } from '../../../dist/rows/governance/session-permission-basis.js'
import {
  sessionPermissionResultParticipant,
  SESSION_PERMISSION_RESULT,
} from '../../../dist/rows/governance/session-permission-result.js'

import {
  withSessionPermissionCommit,
  type SessionPermissionWriteContext,
} from '../../../src/rows/governance/session-permission-commit.ts'
const opened: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const w of opened.splice(0).reverse()) await w.close()
})

it.each([
  'set',
  'withdrawn',
  'missing-constraint',
  'stale-revision',
  'clear-withdrawn',
  'selected-definition',
  'mapped-missing-source',
] as const)(
  'uses the real login and registered declaration at the Session write boundary: %s',
  async scenario => {
    const basis = sessionPermissionBasisParticipant({
      mode: 'unmapped',
      requiredConstraintIds: scenario === 'missing-constraint' ? ['edit-policy'] : [],
    })
    const clearBasis = sessionPermissionBasisParticipant({
      mode: 'clear',
      requiredConstraintIds: [],
    })
    const material = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
    const w = await openRegistrarWorld(
      {
        ...material,
        participants: [
          ...material.participants,
          basis,
          clearBasis,
          sessionPermissionResultParticipant(),
        ],
      },
      { maxJsonDepth: 64 },
    )
    opened.push(w)
    const { options, definition } = await openProviderWorld(w)
    const declaration = {
      ...definition,
      settings: scenario === 'mapped-missing-source' ? definition.settings : [],
      permissions: definition.permissions.map(p => ({
        ...p,
        settings: scenario === 'mapped-missing-source' ? p.settings : null,
        assignmentLayers: ['session' as const],
      })),
    }
    const login = await w.identity.operations.issueLogin({
      loginIdentifier: 'bob',
      credential: 'secret-bob',
    })
    if (login.kind !== 'succeeded') throw new Error(JSON.stringify(login))
    const encoded = loginStateCodec.encode(login.login)
    if (!encoded.ok) throw new Error('login encoding')
    const authority = { issuer: w.issuer, verifier: w.verifier }
    const actor = authority.issuer.issueSystem({ component: 'native-session-write-test' })
    if (!('ok' in actor)) throw new Error('actor')
    const issued = authority.issuer.issueActingForTenant({
      actor: actor.ok,
      tenant: w.principal.tenant,
      work: { owner: 'identity-login', work: encoded.value },
    })
    if (!('ok' in issued)) throw new Error('principal')
    const principal = issued.ok
    const principalRef = standingPrincipalRef(principal)
    const checker = createSessionAccessCheck({
      admission: referenceAdmissionCheck({
        verifier: authority.verifier,
        standing: w.identity.standing,
        permits: null,
      }),
      login: w.identity.governance,
      systemActions: {
        check: async () => {
          throw new Error('not a system action')
        },
      },
    })
    async function register(name: string, participants: readonly string[]) {
      const result = combinationManifest({ catalog: w.activation.materials, participants })
      if (result.kind !== 'manifest') throw new Error(JSON.stringify(result))
      const combination = {
        combinationVersion: name,
        manifestDigest: manifestDigest(result.manifest),
      }
      expect(
        await w.activation.storage.registerCombination({
          ...w.activation.domain,
          ...combination,
          participants,
        }),
      ).toMatchObject({ kind: 'registered' })
      return combination
    }
    const ordinary = await register('native-session-ordinary/1', SESSION_LOG_PARTICIPANTS)
    const protectedCombination = await register('native-session-permission/1', [
      'execution-record',
      'governance.definition-projection',
      'governance.external-write-basis',
      basis.participant,
      'session',
      SESSION_PERMISSION_RESULT.participant,
      'governance.external-write-terminal',
      'governance.activation',
    ])
    const clearCombination = await register('native-session-clear/1', [
      'execution-record',
      'governance.external-write-basis',
      clearBasis.participant,
      'session',
      SESSION_PERMISSION_RESULT.participant,
      'governance.external-write-terminal',
      'governance.activation',
    ])
    const entry = { tenant: w.scope.tenantRef, domain: w.activation.domain }
    const port = createSessionStorage({
      storage: w.activation.storage,
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
      session: sessionId('native-permission-session'),
    }
    const create = {
      kind: 'create',
      input: {
        tenant: principal.tenant,
        session: sessionAccess.session,
        operation: operationId('native-create'),
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
    const permission = declaration.permissions[0]!
    const command = {
      kind: 'change',
      input: {
        tenant: principal.tenant,
        session: sessionAccess.session,
        operation: operationId('native-permission-change'),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: permission.capabilityId,
          enforcementKey: permission.enforcementKey,
          definition: permission.reference,
          rule: { pick: 'allow', allowedSet: null },
          expectedRevision: scenario === 'stale-revision' ? '1' : '0',
          authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
        },
      },
    } satisfies SessionCommand
    const request = {
      access: access(principal, principal.tenant),
      operation: 'change' as const,
      target: { kind: 'session' as const, session: sessionAccess.session, command },
    }
    const admitted = await checker.check(request)
    if (admitted.kind !== 'allowed' || admitted.writeQualification === undefined)
      throw new Error(JSON.stringify(admitted))
    const originalGuards: readonly GuardCommand[] = [
      {
        owner: 'fixture-context',
        participant: 'fixture-context',
        protocol: adoption('original-context'),
        facts: { kind: 'string', value: 'original' },
      },
    ]
    const checked = {
      request,
      evidence: admitted.evidence,
      writeQualification: admitted.writeQualification,
      guards: originalGuards,
    }
    const initialSession = sessionCommandFacts(command, originalGuards)
    const encodedCommand = initialSession.facts['command']
    if (encodedCommand === undefined) throw new Error('Session command was not encoded')
    let readCatalog: SessionPermissionCatalogReader = async () => ({
      kind: 'unavailable',
      owner: 'test-not-installed',
    })
    let withdrawAfterDiscovery = false
    const resolveWrite = createSessionPermissionWriteResolver({
      login: () => w.identity.governance,
      scope: w.scope,
      readCatalog: request => readCatalog(request),
    })
    const made = await createGovernanceLocal({
      ...options,
      identity: { ...options.identity, verifier: authority.verifier },
      grants: [
        ...options.grants
          .filter(grant => grant.action !== 'catalog-management')
          .map(grant => ({ ...grant, principalRef })),
        {
          principalRef: w.principalRef,
          scope: w.scope,
          action: 'catalog-management',
          required: [],
        },
      ],
      definitions: { resolve: async () => ({ kind: 'definition', declaration }) },
      externalWrites: {
        sourceRoute: 'native-session-permission',
        principalOf: (context: SessionPermissionWriteContext) => context.principal,
        resolve: async (checkedPrincipal, intent, context) => {
          const resolved = await resolveWrite(checkedPrincipal, intent, context)
          if (scenario !== 'selected-definition' || resolved.kind !== 'qualified') return resolved
          const selected = sessionPermissionResolvedQualificationSchema.parse(
            resolved.qualification,
          )
          if (selected.kind !== 'set') throw new Error('Set selection required')
          return {
            ...resolved,
            qualification: {
              ...selected,
              definition: { ...selected.definition, version: 'other' },
            },
          }
        },
        plan: input => {
          const selected = sessionPermissionResolvedQualificationSchema.parse(
            input.command.write.qualification,
          )
          const qualification = selected.original
          const clear = selected.kind === 'clear'
          return {
            combination: clear ? clearCombination : protectedCombination,
            writer: 'session',
            commands: [
              qualification.commandFacts,
              ...(selected.kind === 'clear'
                ? []
                : [
                    governanceDefinitionProjectionCommand({
                      scope: input.binding.ref.scope,
                      epoch: input.epoch,
                      principalRef: input.binding.ref.principalRef,
                      captureId: input.binding.ref.operationId,
                      transactionDomain: input.transactionDomain,
                      definition:
                        scenario === 'selected-definition'
                          ? declaration.reference
                          : selected.definition,
                    }),
                  ]),
              { participant: clear ? clearBasis.participant : basis.participant, facts: {} },
              { participant: SESSION_PERMISSION_RESULT.participant, facts: {} },
            ],
          }
        },
      },
    })
    if (made.kind !== 'created' || !made.externalWrites) throw new Error(JSON.stringify(made))
    opened.push(made)
    const registered = await made.service.contribute(access(principal, principal.tenant), {
      ...w.command('native-register'),
      declaration,
    })
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    const service = made.service
    readCatalog = async request => {
      const page = await service.readCatalog(access(w.principal, w.principal.tenant), request)
      if (withdrawAfterDiscovery && page.kind === 'page') {
        withdrawAfterDiscovery = false
        await withdraw()
      }
      return page
    }
    expect(
      await service.readCatalog(access(principal, principal.tenant), {
        scope: w.scope,
        mode: 'management',
        targets: [],
        limit: 100,
        cursor: null,
      }),
    ).toMatchObject({ kind: 'denied' })
    const contribution = registered.contribution
    async function withdraw() {
      expect(
        await service.withdraw(access(principal, principal.tenant), {
          operationId: 'withdraw-before-write',
          contribution,
        }),
      ).toMatchObject({ kind: 'released' })
    }
    withdrawAfterDiscovery = scenario === 'withdrawn'
    const before = await port.readWork(sessionAccess)
    const intent = {
      operationId: command.input.operation,
      write: {
        owner: 'session',
        protocol: 'session.permission-assignment/1',
        targetRef: sessionAccess.session,
        commandDigest: commandDigest(command),
        command: z.json().parse(encodedCommand),
      },
    }
    const qualification = sessionPermissionQualification(checked, command, originalGuards)
    if (qualification === null) throw new Error('qualification not retained')
    const context = { principal, qualification }
    expect(
      await resolveWrite(
        principal,
        { ...intent, write: { ...intent.write, targetRef: 'another-session' } },
        context,
      ),
    ).toMatchObject({ kind: 'denied' })
    if (scenario === 'mapped-missing-source')
      expect(await resolveWrite(principal, intent, context)).toMatchObject({
        kind: 'unavailable',
        owner: 'harness.session-permission-settings-source',
      })
    const writes = made.externalWrites
    const protectedView = withSessionPermissionCommit(port, checked, async () => ({
      writes,
      storage: w.activation.storage,
    }))
    const noBackend = withSessionPermissionCommit(port, checked, async () => undefined)
    expect(
      await noBackend.commit({ access: sessionAccess, command, guards: originalGuards }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await port.readWork(sessionAccess)).toEqual(before)
    const throughPort = await protectedView.commit({
      access: sessionAccess,
      command,
      guards: originalGuards,
    })
    if (scenario === 'set' || scenario === 'clear-withdrawn')
      expect(throughPort).toMatchObject({ ok: { recovered: false } })
    else
      expect(throughPort).toMatchObject({
        failure: { kind: scenario === 'stale-revision' ? 'changed' : 'unavailable' },
      })
    const result = await writes.execute(context, intent)
    if (scenario === 'mapped-missing-source') {
      expect(result).toMatchObject({
        kind: 'unavailable',
        owner: 'governance-external-write',
      })
      expect(await port.readWork(sessionAccess)).toEqual(before)
      return
    }
    const succeeds = scenario === 'set' || scenario === 'clear-withdrawn'
    expect(result).toMatchObject({ kind: 'terminal', outcome: succeeds ? 'committed' : 'aborted' })
    const state = await port.readWork(sessionAccess)
    const readCurrentAssignment = () =>
      w.activation.storage.read({
        domain: w.activation.domain,
        requestKey: 'native-session-permission-current',
        handler: 'session.permission-current',
        protocol: '1',
        input: {
          tenant: w.scope.tenantRef,
          session: sessionAccess.session,
          capabilityId: command.input.declaration.capabilityId,
          enforcementKey: command.input.declaration.enforcementKey,
        },
      })
    expect(await readCurrentAssignment()).toMatchObject({
      kind: 'read',
      output: succeeds
        ? {
            kind: 'current',
            revision: '1',
            assignment: {
              definition: command.input.declaration.definition,
              rule: { pick: 'allow', allowedSet: null },
            },
          }
        : { kind: 'current', revision: '0', assignment: null },
    })
    if (succeeds && 'ok' in state)
      expect(await readCurrentAssignment()).toMatchObject({
        kind: 'read',
        output: { assignment: state.ok.permissions.assignments[0] },
      })
    if (succeeds)
      expect(state).toMatchObject({
        ok: {
          permissions: {
            revision: '1',
            assignments: [{ rule: { pick: 'allow', allowedSet: null } }],
          },
        },
      })
    else expect(state).toEqual(before)
    expect(await writes.execute(context, intent)).toEqual(result)
    if (scenario === 'set') {
      const recalledQualification = sessionPermissionQualification(checked, command, [])
      if (recalledQualification === null) throw new Error('recall qualification')
      const recalled = await writes.execute(
        { principal, qualification: recalledQualification },
        intent,
      )
      expect(
        await protectedView.commit({ access: sessionAccess, command, guards: [] }),
      ).toMatchObject({ ok: { recovered: true } })
      expect(recalled).toEqual(result)
      expect(await port.readWork(sessionAccess)).toEqual(state)
      const changedCommand = {
        ...command,
        input: {
          ...command.input,
          declaration: {
            ...command.input.declaration,
            rule: { pick: 'deny', allowedSet: null },
            expectedRevision: '1',
          },
        },
      }
      const changedRequest = { ...request, target: { ...request.target, command: changedCommand } }
      const changedAccess = await checker.check(changedRequest)
      if (changedAccess.kind !== 'allowed' || changedAccess.writeQualification === undefined)
        throw new Error('changed intent login')
      const changedView = withSessionPermissionCommit(
        port,
        {
          request: changedRequest,
          evidence: changedAccess.evidence,
          writeQualification: changedAccess.writeQualification,
        },
        async () => ({ writes, storage: w.activation.storage }),
      )
      expect(
        await changedView.commit({ access: sessionAccess, command: changedCommand, guards: [] }),
      ).toMatchObject({ failure: { kind: 'conflict' } })
      expect(await port.readWork(sessionAccess)).toEqual(state)
    }
    if (scenario === 'clear-withdrawn') {
      await withdraw()
      const clearCommand = {
        ...command,
        input: {
          ...command.input,
          operation: operationId('native-clear'),
          declaration: { ...command.input.declaration, rule: null, expectedRevision: '1' },
        },
      }
      const clearRequest = { ...request, target: { ...request.target, command: clearCommand } }
      const clearAccess = await checker.check(clearRequest)
      if (clearAccess.kind !== 'allowed' || clearAccess.writeQualification === undefined)
        throw new Error(JSON.stringify(clearAccess))
      const clearView = withSessionPermissionCommit(
        port,
        {
          request: clearRequest,
          evidence: clearAccess.evidence,
          writeQualification: clearAccess.writeQualification,
        },
        async () => ({ writes, storage: w.activation.storage }),
      )
      expect(
        await clearView.commit({ access: sessionAccess, command: clearCommand, guards: [] }),
      ).toMatchObject({ ok: { recovered: false } })
      expect(
        await clearView.commit({ access: sessionAccess, command: clearCommand, guards: [] }),
      ).toMatchObject({ ok: { recovered: true } })
      expect(await port.readWork(sessionAccess)).toMatchObject({
        ok: { permissions: { revision: '2', assignments: [] } },
      })
      expect(await readCurrentAssignment()).toMatchObject({
        kind: 'read',
        output: { kind: 'current', revision: '2', assignment: null },
      })
    }
  },
)
