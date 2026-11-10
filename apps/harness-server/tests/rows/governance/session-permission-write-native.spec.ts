// @module-tag slow
// A Session permission assignment is one Session commit. The basis source, the basis producer,
// the Session writer, the registered declaration and the login are the production modules.
import { afterEach, expect, it } from 'vitest'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import type { SessionPermissionCatalogReader } from '../../../src/rows/governance/session-permission-discovery.ts'
import { access, loginStateCodec } from '@omne-harness/legal-identity'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import { createGovernanceLocal } from '@omne-harness/governance-local'
import {
  createSessionStorage,
  sessionStorageMaterials,
  type SessionProtectedCommit,
} from '@omne-harness/session-storage-sql'
import {
  SESSION_LOG_PARTICIPANTS,
  sessionCommandFacts,
} from '@omne-harness/session-storage-sql/participants'
import {
  type SessionAccessCheck,
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
import {
  combinationManifest,
  manifestDigest,
  type CommitRequestV2,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { openRegistrarWorld } from '../../../../../packages/governance/governance-local/tests/registrar-world.ts'
import { openProviderWorld } from '../../../../../packages/governance/governance-local/tests/provider-world.ts'
import { createSessionAccessCheck } from '../../../src/rows/authorization/adapters.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import { sessionPermissionBasisParticipant } from '../../../dist/rows/governance/session-permission-basis.js'
import { createSessionPermissionBasisSource } from '../../../src/rows/governance/session-permission-basis-source.ts'

type Principal = ActingForTenantPrincipal
type Change = Extract<SessionCommand, { kind: 'change' }>
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
  'commits with the real login and registered declaration as one Session commit: %s',
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
        participants: [...material.participants, basis, clearBasis],
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
      'session',
      basis.participant,
      'governance.definition-projection',
      'governance.activation',
      'governance.metadata-plan',
    ])
    const clearCombination = await register('native-session-clear/1', [
      'execution-record',
      'session',
      clearBasis.participant,
    ])
    const entry = { tenant: w.scope.tenantRef, domain: w.activation.domain }
    // Every storage commit of the test, so a write can be shown to be one Session commit.
    const commits: CommitRequestV2[] = []
    const storage: SqlStorage = {
      ...w.activation.storage,
      commit: request => {
        commits.push(request)
        return w.activation.storage.commit(request)
      },
    }
    let source: ReturnType<typeof createSessionPermissionBasisSource> | undefined
    let plans = 0
    let tamper = (planned: Awaited<ReturnType<NonNullable<typeof source>>>) => planned
    // A change gets the real access check. The creation and the reads are fixture decisions.
    const accessCheck: SessionAccessCheck<Principal> = {
      check: request =>
        request.operation === 'change'
          ? checker.check(request)
          : Promise.resolve({ kind: 'allowed', evidence: evidence('fixture-not-a-change') }),
    }
    const port = createSessionStorage<Principal>({
      storage,
      combination: ordinary,
      domains: {
        resolve: async () => ({ kind: 'ready', entry }),
        snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [entry] } }),
      },
      accessCheck,
      cursorSigning: createFixedSessionCursorSigning(),
      protectedBasis: async commit => {
        if (source === undefined) throw new Error('source not installed')
        plans += 1
        return tamper(await source(commit))
      },
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
    const originalGuards: readonly GuardCommand[] = [
      {
        owner: 'fixture-context',
        participant: 'fixture-context',
        protocol: adoption('original-context'),
        facts: { kind: 'string', value: 'original' },
      },
    ]
    let readCatalog: SessionPermissionCatalogReader = async () => ({
      kind: 'unavailable',
      owner: 'test-not-installed',
    })
    let withdrawAfterDiscovery = false
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
    })
    if (made.kind !== 'created') throw new Error(JSON.stringify(made))
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
    source = createSessionPermissionBasisSource({
      scope: w.scope,
      domain: w.activation.domain,
      epoch: made.epoch,
      storage: w.activation.storage,
      login: () => w.identity.governance,
      readCatalog: request => readCatalog(request),
      combinations: {
        clear: clearCombination,
        unmapped: protectedCombination,
        mapped: protectedCombination,
      },
    })
    if (scenario === 'selected-definition')
      // The source states another definition than the one that the commit projects.
      tamper = planned => {
        if (!('ok' in planned)) return planned
        return {
          ok: {
            ...planned.ok,
            commands: planned.ok.commands.map(item => {
              if (item.participant !== basis.participant) return item
              const facts = structuredClone(item.facts) as {
                selection: { binding: { definition: { version: string } } }
              }
              facts.selection.binding.definition.version = 'other'
              return { ...item, facts: facts as unknown as typeof item.facts }
            }),
          },
        }
      }
    const before = await port.readWork(sessionAccess)
    const admitted = await checker.check(request)
    if (admitted.kind !== 'allowed' || admitted.writeQualification === undefined)
      throw new Error(JSON.stringify(admitted))
    const delivery = (value: Change): SessionProtectedCommit<Principal> => ({
      access: sessionAccess,
      command: value,
      qualification: admitted.writeQualification!,
      session: sessionCommandFacts(value, originalGuards),
    })
    // The qualification of this command does not qualify a write to another session.
    expect(
      await source({
        ...delivery(command),
        access: { ...sessionAccess, session: sessionId('another-session') },
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'change' } })
    // Nor does it qualify another content under the same operation.
    expect(
      await source(
        delivery({
          ...command,
          input: {
            ...command.input,
            declaration: { ...command.input.declaration, rule: { pick: 'deny', allowedSet: null } },
          },
        }),
      ),
    ).toEqual({ failure: { kind: 'denied', action: 'change' } })
    const commit = (value: Change, guards: readonly GuardCommand[] = originalGuards) =>
      port.commit({ access: sessionAccess, command: value, guards })
    const written = commits.length
    const answer = await commit(command)
    const succeeds = scenario === 'set' || scenario === 'clear-withdrawn'
    if (succeeds) expect(answer).toMatchObject({ ok: { recovered: false } })
    else
      expect(answer).toMatchObject({
        failure: { kind: scenario === 'stale-revision' ? 'changed' : 'unavailable' },
      })
    if (scenario === 'mapped-missing-source') {
      // The source could not form a basis: no commit, and no generation is used.
      expect(commits).toHaveLength(written)
      expect(await port.readWork(sessionAccess)).toEqual(before)
      return
    }
    // One Session commit. Its only writer command is the Session command; Governance gets none.
    expect(commits).toHaveLength(written + 1)
    expect(commits.at(-1)).toMatchObject({
      identity: { operation: command.input.operation },
      combinationVersion: 'native-session-permission/1',
    })
    expect(
      commits
        .at(-1)
        ?.commands.map(item => item.participant)
        .toSorted(),
    ).toEqual([basis.participant, 'governance.definition-projection', 'session'].toSorted())
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
    if (scenario === 'withdrawn') {
      // The refusal left no verdict. With the declaration registered again, the same operation
      // is decided on the facts of that time.
      const again = await service.contribute(access(principal, principal.tenant), {
        ...w.command('native-register-again'),
        declaration,
      })
      if (again.kind !== 'registered') throw new Error(JSON.stringify(again))
      expect(await commit(command)).toMatchObject({ ok: { recovered: false } })
      expect(await port.readWork(sessionAccess)).toMatchObject({
        ok: { permissions: { revision: '1' } },
      })
    }
    if (scenario === 'set') {
      const asked = plans
      const sent = commits.length
      // A redelivery with other guards is the same operation: the original result, no new basis.
      expect(await commit(command, [])).toMatchObject({ ok: { recovered: true } })
      expect(plans).toBe(asked)
      expect(commits).toHaveLength(sent)
      // The declaration is withdrawn after the write. The operation is still the committed one.
      await withdraw()
      expect(await commit(command, [])).toMatchObject({ ok: { recovered: true } })
      expect(await port.readWork(sessionAccess)).toEqual(state)
      const changedCommand: Change = {
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
      expect(await commit(changedCommand, [])).toMatchObject({ failure: { kind: 'conflict' } })
      expect(await port.readWork(sessionAccess)).toEqual(state)
    }
    if (scenario === 'clear-withdrawn') {
      await withdraw()
      const clearCommand: Change = {
        ...command,
        input: {
          ...command.input,
          operation: operationId('native-clear'),
          declaration: { ...command.input.declaration, rule: null, expectedRevision: '1' },
        },
      }
      expect(await commit(clearCommand, [])).toMatchObject({ ok: { recovered: false } })
      expect(commits.at(-1)).toMatchObject({ combinationVersion: 'native-session-clear/1' })
      expect(
        commits
          .at(-1)
          ?.commands.map(item => item.participant)
          .toSorted(),
      ).toEqual([clearBasis.participant, 'session'].toSorted())
      expect(await commit(clearCommand, [])).toMatchObject({ ok: { recovered: true } })
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
