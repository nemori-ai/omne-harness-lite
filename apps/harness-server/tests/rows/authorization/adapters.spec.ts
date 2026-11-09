// The access checks of the `authorization` row (APP-6b, DP-4 §3.4 and §3.5). The checks run against
// the real consumer contracts (`SessionAccessCheck`, `AgentAccessCheck`) and the real reference
// authorization pieces. Only the dependencies are test doubles: a verifier and a standing source
// whose answers and failures the test sets. Each case asks one question of the answer, and the
// recorders show which dependency was reached, because a denial before the dependencies must not
// call them (policy draft §3).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Service, Context } from '@deepseek-ai/cordis'
import { toolAccessGuardConformance, type ToolAccessGuardFixture } from '@omne-harness/tool/testing'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import {
  effectiveArgumentsOf,
  noArguments,
  referenceAdmissionCheck,
  referenceSystemActionAuthorization,
  type AdmissionInput,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  type AgentAccessOperation,
} from '@omne-harness/agent-contract'
import {
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type SystemPrincipal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionAccessRequest } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import {
  AGENT_HOST_COMPONENT,
  AGENT_POLICY,
  MAINTENANCE_GRANTS,
  SESSION_MAINTAINER_COMPONENT,
  SESSION_POLICY,
  TENANT_DOMAIN_SCANNER_COMPONENT,
  TOOL_RESIDENCY_COMPONENT,
  holderProjection,
  releaseMaintenanceGrants,
  type PolicyCell,
  type PolicyRow,
  type ReleaseGrant,
} from '../../../src/rows/authorization/index.ts'
import {
  createActionAdmission,
  createAgentAccessCheck,
  createSessionAccessCheck,
  createToolAccessGuard,
  type AccessPorts,
} from '../../../src/rows/authorization/adapters.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { authorizationConfig } from '../../../src/rows/authorization/action-rules.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../../../src/model/principals.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const A = fixtureTenant('a')
const B = fixtureTenant('b')
const OWN = sessionId('ses_own')
const OTHER = sessionId('ses_other')
const toolCallId = (text: string) => okOf(decodeToolCallId(text), 'tool call')

type StandingMode = 'member' | 'not-member' | 'unavailable' | 'throws'

function readingOf(mode: Exclude<StandingMode, 'throws'>): TenantStandingReading {
  const evidence = { record: 'standing/test', revision: '1' }
  if (mode === 'member')
    return {
      kind: 'member',
      role: { role: 'member', model: { model: 'm', revision: '1' } },
      qualifications: [],
      evidence,
    }
  if (mode === 'not-member') return { kind: 'not-member', evidence }
  return { kind: 'unavailable', diagnostic: 'the standing store is closed' }
}

/** The dependencies with switches and recorders, over the real reference authorization. */
function world(grantTable: typeof MAINTENANCE_GRANTS = MAINTENANCE_GRANTS) {
  const authority = inProcessPrincipalAuthority()
  const flags = { verifierThrows: false, standing: 'member' as StandingMode }
  const seen = {
    verifier: 0,
    standing: [] as TenantId[],
    admissions: [] as AdmissionInput[],
    matrix: [] as SystemActionRequest[],
  }

  const verifier: PrincipalVerifier = {
    verify: value => {
      seen.verifier += 1
      if (flags.verifierThrows) throw new Error('verifier SECRET-TEXT')
      return authority.verifier.verify(value)
    },
  }
  const standing: TenantStandingSource = {
    read: input => {
      seen.standing.push(input.tenant)
      if (flags.standing === 'throws') throw new Error('standing SECRET-TEXT')
      return Promise.resolve(readingOf(flags.standing))
    },
  }
  const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
  const systemActions = referenceSystemActionAuthorization({
    verifier,
    grants: releaseMaintenanceGrants(grantTable),
    clock: null,
  })
  const ports: AccessPorts = {
    admission: {
      check: input => {
        seen.admissions.push(input)
        return admission.check(input)
      },
    },
    systemActions: {
      check: input => {
        seen.matrix.push(input)
        return systemActions.check(input)
      },
    },
  }

  const system = (component: string): SystemPrincipal =>
    okOf(authority.issuer.issueSystem({ component }), `system ${component}`)
  const actor = system('sessionWorkPrincipals')
  const acting = (tenant: TenantId, owner: string, work: string): ActingForTenantPrincipal =>
    okOf(authority.issuer.issueActingForTenant({ actor, tenant, work: { owner, work } }), 'acting')

  return {
    flags,
    seen,
    ports,
    session: createSessionAccessCheck(ports),
    agent: createAgentAccessCheck(ports),
    system,
    issuer: authority.issuer,
    login: (tenant: TenantId = A) => acting(tenant, 'identity-login', 'lgs_x'),
    work: (session = OWN, tenant: TenantId = A) => acting(tenant, 'session', session),
    foreign: (tenant: TenantId = A) => acting(tenant, 'unknown-owner', 'x'),
    reached: () =>
      seen.verifier + seen.standing.length + seen.admissions.length + seen.matrix.length,
  }
}

/**
 * A Session request. The adapter reads the command kind, `input.tenant`, `input.session`,
 * `input.value.kind` and `input.fact.kind` and digests the rest, so the tests build commands with
 * these members only. The one cast is the shape of that minimal command.
 */
function sessionRequest(value: unknown): SessionAccessRequest<unknown> {
  return value as SessionAccessRequest<unknown>
}

function read(
  principal: unknown,
  operation: string,
  options: { tenant?: TenantId; session?: typeof OWN } = {},
) {
  return sessionRequest({
    access: { principal, tenant: options.tenant ?? A },
    operation,
    target: { kind: 'session', session: options.session ?? OWN },
  })
}

function mutate(
  principal: unknown,
  kind: string,
  extra: Record<string, unknown> = {},
  options: { tenant?: TenantId; session?: typeof OWN } = {},
) {
  const tenant = options.tenant ?? A
  const session = options.session ?? OWN
  return sessionRequest({
    access: { principal, tenant },
    operation: kind,
    target: { kind: 'session', session, command: { kind, input: { tenant, session, ...extra } } },
  })
}

const businessValue = { value: { kind: 'business', owner: 'o', input: 'i', destination: 'd' } }
const ordinaryValue = { value: { kind: 'ordinary', input: 'i', message: 'm', origin: 'o' } }
const scopeReleaseFact = {
  fact: {
    kind: 'scope-release',
    archive: 'op_1',
    scope: 'scope_1',
    dispositions: ['released'],
    source: 'e',
  },
}

function pending(principal: unknown, tenant: TenantId = A) {
  return sessionRequest({
    access: { principal, tenant },
    operation: 'pending',
    target: { kind: 'tenant', tenant },
  })
}

function references(principal: unknown) {
  return sessionRequest({
    access: { principal, scope: 'system' },
    operation: 'references',
    target: { kind: 'resident-references', key: 'rk_1' },
  })
}

function releasedScopes(principal: unknown) {
  return sessionRequest({
    access: { principal, scope: 'system' },
    operation: 'releasedScopes',
    target: { kind: 'released-scopes' },
  })
}

describe('sessionAccessCheck: members and branches', () => {
  it('lets the login principal send ordinary input and not business input, and the work principal the reverse', async () => {
    const w = world()
    const login = w.login()
    const work = w.work()
    expect((await w.session.check(mutate(login, 'accept', ordinaryValue))).kind).toBe('allowed')
    expect(await w.session.check(mutate(login, 'accept', businessValue))).toEqual({
      kind: 'denied',
    })
    expect((await w.session.check(mutate(work, 'accept', businessValue))).kind).toBe('allowed')
    expect(await w.session.check(mutate(work, 'accept', ordinaryValue))).toEqual({ kind: 'denied' })
  })

  it('carries the evidence of the admission decision on an allowed answer', async () => {
    const w = world()
    const answer = await w.session.check(read(w.work(), 'readWork'))
    expect(answer).toMatchObject({ kind: 'allowed', evidence: { owner: 'authorization' } })
  })

  it('asks the tenant admission once, with the operation, the session and the digest of the command', async () => {
    const w = world()
    const request = mutate(w.work(), 'startRun', { note: 'x' })
    await w.session.check(request)
    expect(w.seen.admissions).toHaveLength(1)
    expect(w.seen.admissions[0]).toMatchObject({
      operation: { owner: 'session', name: 'startRun' },
      target: { owner: 'session', kind: 'session', key: OWN },
      requires: [],
      permit: null,
    })
    expect(w.seen.admissions[0]?.arguments).toEqual(
      effectiveArgumentsOf({ kind: 'startRun', input: { tenant: A, session: OWN, note: 'x' } }),
    )
    await w.session.check(read(w.work(), 'readWork'))
    expect(w.seen.admissions[1]?.arguments).toEqual(noArguments())
  })

  it('answers denied for a member whose standing ended, and for a principal that is no member cell', async () => {
    const w = world()
    w.flags.standing = 'not-member'
    expect(await w.session.check(read(w.work(), 'readWork'))).toEqual({ kind: 'denied' })
    w.flags.standing = 'member'
    expect(await w.session.check(read(w.login(), 'readWork'))).toEqual({ kind: 'denied' })
    expect(await w.session.check(read(w.foreign(), 'readWork'))).toEqual({ kind: 'denied' })
  })

  it('denies a principal that the verifier did not issue, even with the shape of a work principal', async () => {
    const w = world()
    const forged = { ...w.work() }
    expect(await w.session.check(read(forged, 'readWork'))).toEqual({ kind: 'denied' })
    expect(w.seen.standing).toEqual([])
  })

  it('lets the own login set the tenant settings and manage the session, with no named qualification', async () => {
    const w = world()
    for (const kind of ['configureAutoArchive', 'setRelation']) {
      expect((await w.session.check(mutate(w.login(), kind))).kind, kind).toBe('allowed')
    }
    expect(w.seen.admissions.map(input => input.requires)).toEqual([[], []])
  })

  it('denies the two operations to a login principal of another tenant, and reads nothing', async () => {
    const w = world()
    for (const kind of ['configureAutoArchive', 'setRelation']) {
      const request = mutate(w.login(B), kind, {}, { tenant: A })
      expect(await w.session.check(request), kind).toEqual({ kind: 'denied' })
    }
    expect(w.reached()).toBe(0)
  })

  it('denies the two operations to the work principal and to a foreign principal', async () => {
    const w = world()
    for (const kind of ['configureAutoArchive', 'setRelation']) {
      expect(await w.session.check(mutate(w.work(), kind)), kind).toEqual({ kind: 'denied' })
      expect(await w.session.check(mutate(w.foreign(), kind)), kind).toEqual({ kind: 'denied' })
    }
  })
})

describe('sessionAccessCheck: the steps before the dependencies (policy draft §3)', () => {
  it('denies a work principal on the target of another session, and reads nothing', async () => {
    const w = world()
    expect(await w.session.check(read(w.work(OTHER), 'readWork'))).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it('denies a principal of another tenant, and reads nothing', async () => {
    const w = world()
    expect(await w.session.check(read(w.work(OWN, B), 'readWork'))).toEqual({ kind: 'denied' })
    expect(await w.session.check(read(w.login(B), 'history.begin'))).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it('checks only the tenant of a work principal on `pending`, whatever session its work names', async () => {
    const w = world()
    expect((await w.session.check(pending(w.work(OTHER)))).kind).toBe('allowed')
    expect(await w.session.check(pending(w.work(OWN, B), A))).toEqual({ kind: 'denied' })
    expect(w.seen.admissions[0]?.target).toEqual({
      owner: 'session',
      kind: 'tenant',
      key: expect.any(String),
    })
  })

  it.each([
    [
      'the command names another operation',
      (p: unknown) => ({ ...mutate(p, 'claim'), operation: 'startRun' }),
    ],
    [
      'the command names another session',
      (p: unknown) => {
        const request = mutate(p, 'claim')
        return { ...request, target: { ...request.target, session: OTHER } }
      },
    ],
    [
      'the command names another tenant',
      (p: unknown) => ({
        access: { principal: p, tenant: A },
        operation: 'claim',
        target: {
          kind: 'session',
          session: OWN,
          command: { kind: 'claim', input: { tenant: B, session: OWN } },
        },
      }),
    ],
    ['a mutation carries no command', (p: unknown) => read(p, 'claim')],
    [
      'a read carries a command',
      (p: unknown) => ({ ...mutate(p, 'readWork'), operation: 'readWork' }),
    ],
    [
      'the target kind is not the one of the operation',
      (p: unknown) => ({ ...pending(p), operation: 'readWork' }),
    ],
  ])('denies when %s, and reads nothing', async (_name, build) => {
    const w = world()
    expect(await w.session.check(sessionRequest(build(w.work())))).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it.each(['constructor', '__proto__', 'hasOwnProperty', 'toString', 'valueOf'])(
    'denies the prototype key %s as an operation instead of throwing',
    async key => {
      const w = world()
      const principal = w.work()
      for (const request of [read(principal, key), mutate(principal, key), pending(principal)]) {
        const forged = sessionRequest({ ...request, operation: key })
        expect(await w.session.check(forged)).toEqual({ kind: 'denied' })
      }
      expect(w.reached()).toBe(0)
    },
  )

  it('fixes the request before the first await: a later change of the request changes nothing', async () => {
    const w = world()
    const request = mutate(w.work(), 'startRun')
    const pendingAnswer = w.session.check(request)
    if (request.target.kind === 'session' && 'command' in request.target) {
      Object.assign(request.target, { session: OTHER })
      Object.assign(request.target.command.input, { session: OTHER })
    }
    expect((await pendingAnswer).kind).toBe('allowed')
    expect(w.seen.admissions[0]?.target.key).toBe(OWN)
  })
})

describe('sessionAccessCheck: dependencies that fail (验收 1)', () => {
  it('answers unavailable when the verifier throws, and does not report the exception text', async () => {
    const w = world()
    w.flags.verifierThrows = true
    const answer = await w.session.check(read(w.work(), 'readWork'))
    expect(answer.kind).toBe('unavailable')
    expect(JSON.stringify(answer)).not.toContain('SECRET-TEXT')
  })

  it.each<StandingMode>(['unavailable', 'throws'])(
    'answers unavailable when the standing source is %s',
    async mode => {
      const w = world()
      w.flags.standing = mode
      const answer = await w.session.check(read(w.work(), 'readWork'))
      expect(answer.kind).toBe('unavailable')
      expect(JSON.stringify(answer)).not.toContain('SECRET-TEXT')
    },
  )

  it('answers unavailable when the admission port itself throws or answers outside its contract', async () => {
    const w = world()
    const throwing = createSessionAccessCheck({
      ...w.ports,
      admission: {
        check: () => {
          throw new Error('port SECRET-TEXT')
        },
      },
    })
    const answer = await throwing.check(read(w.work(), 'readWork'))
    expect(answer.kind).toBe('unavailable')
    expect(JSON.stringify(answer)).not.toContain('SECRET-TEXT')

    const odd = createSessionAccessCheck({
      ...w.ports,
      admission: { check: () => Promise.resolve({ kind: 'maybe' } as never) },
    })
    expect((await odd.check(read(w.work(), 'readWork'))).kind).toBe('unavailable')
  })

  it('answers unavailable for a request it cannot read, instead of denied', async () => {
    const w = world()
    const broken = sessionRequest({ operation: 'readWork' })
    expect((await w.session.check(broken)).kind).toBe('unavailable')
  })

  it('denies a cell that the table denies without asking the dependencies, even while they are down', async () => {
    const w = world()
    w.flags.verifierThrows = true
    expect(await w.session.check(read(w.login(), 'startRun'))).toEqual({ kind: 'denied' })
  })
})

describe('sessionAccessCheck: system principals and the matrix', () => {
  it('passes `references` for the holder of the record only, and not for a copy of its shape', async () => {
    const w = world()
    expect((await w.session.check(references(w.system(TOOL_RESIDENCY_COMPONENT)))).kind).toBe(
      'allowed',
    )
    expect(await w.session.check(references(w.system('someone-else')))).toEqual({ kind: 'denied' })
    expect(
      await w.session.check(references({ kind: 'system', component: TOOL_RESIDENCY_COMPONENT })),
    ).toEqual({ kind: 'denied' })
  })

  it('passes `pending` of any tenant for the session maintainer, the S3 recovery scanner, only', async () => {
    const w = world()
    const maintainer = w.system(SESSION_MAINTAINER_COMPONENT)
    for (const tenant of [A, B]) {
      const answer = await w.session.check(pending(maintainer, tenant))
      expect(answer, 'the maintainer reads pending').toMatchObject({
        kind: 'allowed',
        evidence: { record: `maintenance-grant/${SESSION_MAINTAINER_COMPONENT}` },
      })
    }
    for (const other of [
      'sessionPrincipals.coordinator',
      TENANT_DOMAIN_SCANNER_COMPONENT,
      TOOL_RESIDENCY_COMPONENT,
      AGENT_HOST_COMPONENT,
    ])
      expect(await w.session.check(pending(w.system(other))), other).toEqual({ kind: 'denied' })
    expect(
      await w.session.check(pending({ kind: 'system', component: SESSION_MAINTAINER_COMPONENT })),
      'a copy of the maintainer shape',
    ).toEqual({ kind: 'denied' })
  })

  it('gives the session maintainer no other system cell', async () => {
    const w = world()
    const maintainer = w.system(SESSION_MAINTAINER_COMPONENT)
    expect(await w.session.check(references(maintainer))).toEqual({ kind: 'denied' })
    expect(await w.session.check(releasedScopes(maintainer))).toEqual({ kind: 'denied' })
    expect(await w.session.check(mutate(maintainer, 'receive', scopeReleaseFact))).toEqual({
      kind: 'denied',
    })
  })

  it('denies every login and work principal on the system requests, and reads nothing', async () => {
    const w = world()
    for (const principal of [w.login(), w.work()]) {
      expect(await w.session.check(references(principal))).toEqual({ kind: 'denied' })
      expect(await w.session.check(releasedScopes(principal))).toEqual({ kind: 'denied' })
    }
    expect(w.reached()).toBe(0)
  })

  it('denies a system principal on an operation outside the matrix, and reads nothing', async () => {
    const w = world()
    const holder = w.system(TOOL_RESIDENCY_COMPONENT)
    expect(await w.session.check(read(holder, 'readWork'))).toEqual({ kind: 'denied' })
    expect(await w.session.check(mutate(holder, 'startRun'))).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it('binds the matrix request to the row of the operation (granted table, to see the request)', async () => {
    const everything: ReleaseGrant = {
      ...MAINTENANCE_GRANTS[TOOL_RESIDENCY_COMPONENT],
      purposes: [
        'resident-references',
        'released-scopes',
        'pending-sessions',
        'scope-release-receive',
      ],
    }
    const w = world({ ...MAINTENANCE_GRANTS, [TOOL_RESIDENCY_COMPONENT]: everything })
    const holder = w.system(TOOL_RESIDENCY_COMPONENT)

    expect((await w.session.check(releasedScopes(holder))).kind).toBe('allowed')
    expect(w.seen.matrix[0]).toMatchObject({
      scope: 'system',
      operation: { owner: 'session', name: 'releasedScopes' },
      target: {
        kind: 'system',
        resource: { owner: 'session', kind: 'released-scopes', key: 'deployment' },
      },
      arguments: noArguments(),
    })

    expect((await w.session.check(pending(holder, B))).kind).toBe('allowed')
    expect(w.seen.matrix[1]).toMatchObject({
      operation: { owner: 'session', name: 'pending' },
      target: { kind: 'tenant', tenant: B, resource: { owner: 'session', kind: 'tenant' } },
    })

    const receive = mutate(holder, 'receive', scopeReleaseFact)
    expect((await w.session.check(receive)).kind).toBe('allowed')
    expect(w.seen.matrix[2]).toMatchObject({
      operation: { owner: 'session', name: 'receive' },
      target: {
        kind: 'tenant',
        tenant: A,
        resource: { owner: 'session', kind: 'session', key: OWN },
      },
      arguments: effectiveArgumentsOf(scopeReleaseFact.fact),
    })
    // The tenant admission was never asked for a system principal.
    expect(w.seen.admissions).toEqual([])
  })

  it('denies a system `receive` for any fact other than `scope-release`, and reads nothing', async () => {
    const w = world()
    const request = mutate(w.system(TOOL_RESIDENCY_COMPONENT), 'receive', {
      fact: { kind: 'execution', producer: 'p', source: 'e' },
    })
    expect(await w.session.check(request)).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it('denies a system `receive` when no grant record names the purpose (the release table has none in wave 1)', async () => {
    const w = world()
    const request = mutate(w.system(TOOL_RESIDENCY_COMPONENT), 'receive', scopeReleaseFact)
    expect(await w.session.check(request)).toEqual({ kind: 'denied' })
    expect(w.seen.matrix).toHaveLength(1)
  })
})

function agentRequest(
  principal: unknown,
  operation: AgentAccessOperation,
  target: unknown,
  tenant: TenantId = A,
) {
  return { access: { principal, tenant }, operation, target } as Parameters<
    ReturnType<typeof createAgentAccessCheck>['check']
  >[0]
}

const execution = okOf(decodeAgentExecutionId('agx_abcdefghjkmnpqrstvwxyz2345'), 'execution')
const instance = okOf(decodeAgentInstanceId('agi_abcdefghjkmnpqrstvwxyz2345'), 'instance')
const definition = { owner: 'o', name: 'n', revision: '1', digest: 'd' }
const scopeOf = (record: string, owner = 'session') => ({
  kind: 'scope' as const,
  scope: { owner, record, revision: '1', digest: 'd' },
  definition,
})

describe('agentAccessCheck', () => {
  it('lets the work principal invoke on an execution and asks the admission in the agent vocabulary', async () => {
    const w = world()
    const target = { kind: 'execution' as const, execution }
    const answer = await w.agent.check(agentRequest(w.work(), 'invoke', target))
    expect(answer.kind).toBe('allowed')
    expect(w.seen.admissions[0]).toMatchObject({
      operation: { owner: 'agent', name: 'invoke' },
      target: { owner: 'agent', kind: 'execution' },
      requires: [],
      permit: null,
    })
  })

  it('checks the work binding of a `reserve` on a scope: only the scope of its own session', async () => {
    const w = world()
    expect((await w.agent.check(agentRequest(w.work(), 'reserve', scopeOf(OWN)))).kind).toBe(
      'allowed',
    )
    const before = w.reached()
    expect(await w.agent.check(agentRequest(w.work(), 'reserve', scopeOf(OTHER)))).toEqual({
      kind: 'denied',
    })
    expect(await w.agent.check(agentRequest(w.work(), 'reserve', scopeOf(OWN, 'tool')))).toEqual({
      kind: 'denied',
    })
    expect(w.reached()).toBe(before)
  })

  it('denies the operations with an unwritten caller, for the work principal', async () => {
    const w = world()
    const target = { kind: 'execution' as const, execution }
    for (const operation of [
      'read',
      'events',
      'acknowledge',
      'observe',
      'connect',
      'settle',
    ] as const) {
      expect(await w.agent.check(agentRequest(w.work(), operation, target))).toEqual({
        kind: 'denied',
      })
    }
    expect(w.reached()).toBe(0)
  })

  it('lets only the work principal receive a result, and only for its own tenant', async () => {
    const w = world()
    const target = { kind: 'execution' as const, execution }
    expect((await w.agent.check(agentRequest(w.work(), 'receive-result', target))).kind).toBe(
      'allowed',
    )
    expect(await w.agent.check(agentRequest(w.login(), 'receive-result', target))).toEqual({
      kind: 'denied',
    })
    expect(
      await w.agent.check(agentRequest(w.system(AGENT_HOST_COMPONENT), 'receive-result', target)),
    ).toEqual({ kind: 'denied' })
    expect(await w.agent.check(agentRequest(w.work(OWN, B), 'receive-result', target))).toEqual({
      kind: 'denied',
    })
  })

  it('lets the Model host work principal M receive a result for its own tenant only, and nothing else (R2-D248)', async () => {
    const w = world()
    const target = { kind: 'execution' as const, execution }
    const host = w.system(MODEL_HOST_COMPONENT)
    const model = (tenant: TenantId): ActingForTenantPrincipal =>
      okOf(
        w.issuer.issueActingForTenant({
          actor: host,
          tenant,
          work: { owner: MODEL_WORK_OWNER, work: 'call-1' },
        }),
        'model work principal',
      )
    expect(await w.agent.check(agentRequest(model(A), 'receive-result', target))).toMatchObject({
      kind: 'allowed',
    })
    expect(await w.agent.check(agentRequest(model(B), 'receive-result', target))).toEqual({
      kind: 'denied',
    })
    // The member cells of the work column, which W passes: M passes none of them.
    for (const operation of ['submit', 'control', 'resume', 'detach', 'invoke'] as const)
      expect(await w.agent.check(agentRequest(model(A), operation, target)), operation).toEqual({
        kind: 'denied',
      })
    // M's shape with an actor of another component is not M.
    const forged = okOf(
      w.issuer.issueActingForTenant({
        actor: w.system('sessionWorkPrincipals'),
        tenant: A,
        work: { owner: MODEL_WORK_OWNER, work: 'call-1' },
      }),
      'forged',
    )
    expect(await w.agent.check(agentRequest(forged, 'receive-result', target))).toEqual({
      kind: 'denied',
    })
  })

  it('lets the agent host publish, quiesce and withdraw an instance, and nobody else', async () => {
    const w = world()
    const target = { kind: 'instance' as const, instance }
    for (const operation of ['publish', 'quiesce', 'withdraw'] as const) {
      expect(
        (await w.agent.check(agentRequest(w.system(AGENT_HOST_COMPONENT), operation, target))).kind,
      ).toBe('allowed')
      expect(
        await w.agent.check(agentRequest(w.system('someone-else'), operation, target)),
      ).toEqual({ kind: 'denied' })
      expect(await w.agent.check(agentRequest(w.work(), operation, target))).toEqual({
        kind: 'denied',
      })
    }
    expect(w.seen.matrix[0]).toMatchObject({
      operation: { owner: 'agent', name: 'publish' },
      target: { kind: 'tenant', tenant: A, resource: { owner: 'agent', kind: 'instance' } },
      arguments: noArguments(),
    })
  })

  it('keeps the agent host out of every other cell, and publishing off other targets', async () => {
    const w = world()
    const host = w.system(AGENT_HOST_COMPONENT)
    expect(
      await w.agent.check(agentRequest(host, 'invoke', { kind: 'execution', execution })),
    ).toEqual({ kind: 'denied' })
    expect(
      await w.agent.check(agentRequest(host, 'publish', { kind: 'execution', execution })),
    ).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(0)
  })

  it('answers unavailable when the verifier or the standing source fails, not denied', async () => {
    const w = world()
    const target = { kind: 'execution' as const, execution }
    w.flags.verifierThrows = true
    expect((await w.agent.check(agentRequest(w.work(), 'invoke', target))).kind).toBe('unavailable')
    w.flags.verifierThrows = false
    w.flags.standing = 'throws'
    expect((await w.agent.check(agentRequest(w.work(), 'invoke', target))).kind).toBe('unavailable')
    w.flags.standing = 'member'
    w.flags.verifierThrows = true
    expect(
      (
        await w.agent.check(
          agentRequest(w.system(AGENT_HOST_COMPONENT), 'publish', { kind: 'instance', instance }),
        )
      ).kind,
    ).toBe('unavailable')
  })

  it.each(['constructor', '__proto__', 'toString'])(
    'denies the prototype key %s as an operation',
    async key => {
      const w = world()
      const request = agentRequest(w.work(), 'invoke', { kind: 'execution', execution })
      expect(await w.agent.check({ ...request, operation: key as AgentAccessOperation })).toEqual({
        kind: 'denied',
      })
      expect(w.reached()).toBe(0)
    },
  )
})

describe('agentActionAdmission', () => {
  const rules = { revision: 'ops-1', rules: [{ id: 'files', effect: 'allow', tool: 'Files' }] }
  function action(principal: unknown) {
    return {
      principal,
      tenant: A,
      execution: 'e',
      passage: 'p',
      action: 'a',
      original: { name: 'Files', arguments: '{}' },
      effectiveArguments: '{}',
      definition: { owner: 'tool', name: 'Files', revision: '1', digest: 'd' },
      permissions: [],
      decision: null,
    }
  }
  it('requires the issued Session work principal, the correct tenant and current membership', async () => {
    const w = world()
    const admission = createActionAdmission({
      readAdmission: () => w.ports.admission,
      actionRules: rules,
    })
    for (const principal of [
      w.login(),
      w.foreign(),
      w.system('unknown'),
      { ...w.work() },
      w.work(OWN, B),
    ]) {
      expect(await admission.admit(action(principal) as never)).toMatchObject({
        ok: { kind: 'deny' },
      })
    }
    w.flags.standing = 'not-member'
    expect(await admission.admit(action(w.work()) as never)).toMatchObject({
      ok: { kind: 'deny', reason: 'not-member' },
    })
  })
  it('closes missing rules, unmatched tools or definitions, unsupported interpreters and failed dependencies', async () => {
    const w = world()
    const input = action(w.work())
    const admission = createActionAdmission({
      readAdmission: () => w.ports.admission,
      actionRules: rules,
    })
    for (const change of [
      { definition: { ...input.definition, name: 'Shell' } },
      { permissions: [{ need: 'permission' }] },
      { decision: {} },
    ]) {
      expect(await admission.admit({ ...input, ...change } as never)).toMatchObject({
        ok: { kind: 'unavailable' },
      })
    }
    const exact = createActionAdmission({
      readAdmission: () => w.ports.admission,
      actionRules: { ...rules, rules: [{ ...rules.rules[0], definition: input.definition }] },
    })
    expect(await exact.admit(input as never)).toMatchObject({ ok: { kind: 'allow' } })
    for (const field of ['owner', 'name', 'revision', 'digest']) {
      expect(
        await exact.admit({
          ...input,
          definition: { ...input.definition, [field]: 'other' },
        } as never),
      ).toMatchObject({ ok: { kind: 'unavailable' } })
    }
    for (const mode of ['throws', 'unavailable'] as const) {
      w.flags.standing = mode
      expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'unavailable' } })
    }
    w.flags.standing = 'member'
    w.flags.verifierThrows = true
    expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'unavailable' } })
    for (const readAdmission of [
      () => undefined,
      () => {
        throw new Error('SECRET')
      },
      () => ({ check: async () => ({ kind: 'odd' }) as never }),
    ]) {
      const failed = createActionAdmission({ readAdmission, actionRules: rules })
      const result = await failed.admit(input as never)
      expect(result).toMatchObject({ ok: { kind: 'unavailable' } })
      expect(JSON.stringify(result)).not.toContain('SECRET')
    }
  })
  it('rejects invalid configuration instead of granting through unknown fields', () => {
    for (const config of [
      { grants: {} },
      { actionRules: { revision: '', rules: [] } },
      { actionRules: { ...rules, rules: [rules.rules[0], rules.rules[0]] } },
      {
        actionRules: {
          ...rules,
          rules: [{ id: 'r', effect: 'allow', tool: 'Files', extra: true }],
        },
      },
    ]) {
      expect(authorizationConfig.safeParse(config).success).toBe(false)
    }
  })
  it('applies configured rules with deny precedence and binds evidence to the fixed action', async () => {
    const w = world()
    const input = {
      principal: w.work(),
      tenant: A,
      execution: 'execution',
      passage: 'passage',
      action: 'action',
      original: { name: 'Files', arguments: '{}' },
      effectiveArguments: '{"secret":"value"}',
      definition: { owner: 'tool', name: 'Files', revision: '1', digest: 'd' },
      permissions: [],
      decision: null,
    }
    const allow = { id: 'files', effect: 'allow', tool: 'Files' }
    const deny = { id: 'blocked-files', effect: 'deny', tool: 'Files' }
    for (const rules of [
      [allow, deny],
      [deny, allow],
    ]) {
      const admission = createActionAdmission({
        readAdmission: () => w.ports.admission,
        actionRules: { revision: 'ops-2', rules },
      })
      const result = await admission.admit(input as never)
      expect(result).toMatchObject({
        ok: {
          kind: 'deny',
          reason: 'rule/blocked-files',
          evidence: { record: 'action-rule/blocked-files', revision: 'ops-2' },
        },
      })
      expect(JSON.stringify(result)).not.toContain('secret')
    }
    const admission = createActionAdmission({
      readAdmission: () => w.ports.admission,
      actionRules: { revision: 'ops-1', rules: [allow] },
    })
    const pending = admission.admit(input as never)
    Object.assign(input, { action: 'changed', effectiveArguments: 'changed' })
    Object.assign(allow, { effect: 'deny' })
    const answer = await pending
    expect(answer).toMatchObject({ ok: { kind: 'allow' } })
    expect(w.seen.admissions.at(-1)?.target.key).toBe('["execution","passage","action"]')
    expect(w.seen.admissions.at(-1)?.arguments).toEqual(effectiveArgumentsOf('{"secret":"value"}'))
    expect(await admission.admit(input as never)).not.toEqual(answer)
  })

  it('has no default allow: every action is unavailable, with or without permissions or a decision', async () => {
    const admission = createActionAdmission()
    for (const input of [
      { permissions: [], decision: null },
      { permissions: [{ need: 'n' }], decision: null },
      { permissions: [], decision: { card: 'c', answer: 'a' } },
    ]) {
      const answer = await admission.admit(input as never)
      expect(answer).toMatchObject({ ok: { kind: 'unavailable' } })
      expect(JSON.stringify(answer)).not.toContain('"allow"')
    }
  })
})

describe('Tool access qualification', () => {
  function fixture(): ToolAccessGuardFixture<unknown> {
    const w = world()
    const guard = createToolAccessGuard(() => w.ports.admission)
    const allowed = {
      principal: w.work(),
      tenant: A,
      call: toolCallId('tc_auth'),
      action: 'admit' as const,
    }
    return {
      guard,
      allowed,
      unlisted: { ...allowed, principal: w.system('unlisted') },
      otherTenant: { ...allowed, tenant: B },
      forgedTenant: { ...allowed, tenant: { ...A } },
      breakDependency: () => {
        w.flags.verifierThrows = true
      },
    }
  }
  for (const check of toolAccessGuardConformance<unknown>()) {
    it(check.name, async () => {
      const subject = fixture()
      // The suite is only evidence if the fixture really separates listed from unlisted principals.
      expect(await subject.guard.qualify(subject.allowed)).toEqual({ kind: 'allowed' })
      expect(await subject.guard.qualify(subject.unlisted)).toMatchObject({ kind: 'denied' })
      await expect(check.run(subject)).resolves.toBeUndefined()
    })
  }
  it.each([42, ''])('denies malformed call %j before reading admission', async call => {
    const w = world()
    let reads = 0
    const guard = createToolAccessGuard(() => {
      reads += 1
      return w.ports.admission
    })
    const input = { principal: w.work(), tenant: A, call, action: 'admit' }
    expect(await guard.qualify(input as never)).toMatchObject({ kind: 'denied' })
    expect(reads).toBe(0)
    expect(w.seen.admissions).toHaveLength(0)
  })
  it('maps every supported action, rejects unknown roles and reads dependencies again after retirement', async () => {
    const w = world()
    let live = true
    const guard = createToolAccessGuard(() => (live ? w.ports.admission : undefined))
    const input = { principal: w.work(), tenant: A, call: toolCallId('tc_auth') }
    for (const action of [
      'admit',
      'lookup',
      'query-operation',
      'control',
      'accept-decision',
      'accept-resource',
      'read-process',
      'read-wait',
      'read-diagnostics',
      'read-result',
      'read-content',
      'release-delivery',
      'account',
      'recover',
      'write',
      'start',
    ] as const) {
      expect(await guard.qualify({ ...input, action })).toEqual({ kind: 'allowed' })
      expect(w.seen.admissions.at(-1)).toMatchObject({
        operation: { owner: 'tool', name: action },
        target: { owner: 'tool', kind: 'call', key: input.call },
        arguments: noArguments(),
      })
    }
    expect(await guard.qualify({ ...input, action: 'invalidate' })).toMatchObject({
      kind: 'unavailable',
    })
    for (const principal of [w.login(), w.foreign(), { ...input.principal }])
      expect(await guard.qualify({ ...input, principal, action: 'admit' })).toMatchObject({
        kind: 'denied',
      })
    expect(await guard.qualify({ ...input, action: 'unknown' } as never)).toMatchObject({
      kind: 'denied',
    })
    expect(await guard.qualify({ ...input, action: 'start', call: null })).toMatchObject({
      kind: 'denied',
    })
    const request = { ...input, action: 'admit' as const }
    const pending = guard.qualify(request)
    Object.assign(request, { call: toolCallId('tc_changed'), tenant: B })
    expect(await pending).toEqual({ kind: 'allowed' })
    expect(w.seen.admissions.at(-1)?.target.key).toBe('tc_auth')
    live = false
    expect(await guard.qualify({ ...input, tenant: A, action: 'admit' })).toMatchObject({
      kind: 'unavailable',
    })
    const failing = createToolAccessGuard(() => {
      throw new Error('SECRET')
    })
    const failure = await failing.qualify({ ...input, tenant: A, action: 'admit' })
    expect(failure).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(failure)).not.toContain('SECRET')
  })
})

describe('the row', () => {
  it('loads configured action admission in Cordis and retires the old allowing reference', async () => {
    const ctx = new Context()
    const authority = inProcessPrincipalAuthority()
    const actor = okOf(
      authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }),
      'actor',
    )
    const principal = okOf(
      authority.issuer.issueActingForTenant({
        actor,
        tenant: A,
        work: { owner: 'session', work: OWN },
      }),
      'work',
    )
    const provider = await ctx.plugin({
      name: 'identity-fixture',
      apply(scope: Context) {
        scope.provide(principalVerifierKey, authority.verifier)
        scope.provide(tenantStandingKey, { read: async () => readingOf('member') })
        scope.provide(identityClockKey, {
          now: () => Promise.reject(new Error('no grant of this case has an end time')),
        })
      },
    })
    const row = await ctx.plugin(authorization, {
      actionRules: { revision: 'live-1', rules: [{ id: 'files', tool: 'Files', effect: 'allow' }] },
    })
    const input = {
      principal,
      tenant: A,
      execution: 'e',
      passage: 'p',
      action: 'a',
      original: { name: 'Files', arguments: '{}' },
      effectiveArguments: '{}',
      definition: { owner: 'tool', name: 'Files', revision: '1', digest: 'd' },
      permissions: [],
      decision: null,
    }
    try {
      const admission = ctx.agentActionAdmission
      expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'allow' } })
      await row.dispose()
      expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'unavailable' } })
    } finally {
      await row.dispose()
      await provider.dispose()
    }
  })
  it('declares the manifest of the `authorization` row of the table, as a real row without a shutdown phase', () => {
    const declaration = rowDeclarationOf(authorization)
    const table = serveProfile().stubManifests.get('authorization' as never)
    expect(declaration).toMatchObject({
      row: 'authorization',
      implementation: 'real',
      lifecycle: { kind: 'none' },
    })
    expect(declaration?.manifest.provides.toSorted()).toEqual(
      [...(table?.provides ?? [])].toSorted(),
    )
    expect(declaration?.manifest.injects.toSorted()).toEqual([...(table?.injects ?? [])].toSorted())
    expect(declaration?.manifest.phase).toBe(table?.phase)
  })

  it('takes action rules configuration without a maintenance grant service (验收 3)', () => {
    expect(authorization.Config).toBeDefined()
    expect(authorization.inject).toEqual(expect.not.arrayContaining(['maintenanceGrants']))
  })

  it('serves the three keys over the verifier and the standing source, and runs the checks on the live tree', async () => {
    const authority = inProcessPrincipalAuthority()
    const flags = { verifierThrows: false }
    const holder = okOf(
      authority.issuer.issueSystem({ component: TOOL_RESIDENCY_COMPONENT }),
      'holder',
    )
    const intruder = okOf(authority.issuer.issueSystem({ component: 'someone-else' }), 'intruder')
    const actor = okOf(
      authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }),
      'actor',
    )
    const work = okOf(
      authority.issuer.issueActingForTenant({
        actor,
        tenant: A,
        work: { owner: 'session', work: OWN },
      }),
      'work',
    )
    const answers: Record<string, unknown> = {}

    class VerifierImpl extends Service {
      constructor(ctx: Context) {
        super(ctx, principalVerifierKey)
      }
      verify(value: unknown) {
        if (flags.verifierThrows) throw new Error('boom SECRET-TEXT')
        return authority.verifier.verify(value)
      }
    }
    class StandingImpl extends Service {
      constructor(ctx: Context) {
        super(ctx, tenantStandingKey)
      }
      read() {
        return Promise.resolve(readingOf('member'))
      }
    }
    const identityRow = defineRow({
      row: 'identity',
      implementation: 'real',
      manifest: { provides: [tenantStandingKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: { name: 'standing', apply: (ctx: Context) => void new StandingImpl(ctx) },
    })
    const probeRow = defineRow({
      row: 'probe',
      implementation: 'real',
      manifest: {
        provides: [],
        injects: ['sessionAccessCheck', 'agentAccessCheck', 'agentActionAdmission'],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'probe',
        inject: ['sessionAccessCheck', 'agentAccessCheck', 'agentActionAdmission'],
        apply: (ctx: Context) => {
          // The services are taken while the plugin runs; the continuation below has no active context.
          const { sessionAccessCheck, agentAccessCheck, agentActionAdmission } = ctx
          answers['run'] = (async () => {
            answers['work'] = await sessionAccessCheck.check(read(work, 'readWork'))
            answers['holder'] = await sessionAccessCheck.check(references(holder))
            answers['intruder'] = await sessionAccessCheck.check(references(intruder))
            answers['agent'] = await agentAccessCheck.check(
              agentRequest(work, 'invoke', { kind: 'execution', execution }),
            )
            answers['admission'] = await agentActionAdmission.admit({
              principal: work,
              tenant: A,
              execution: 'e',
              passage: 'p',
              action: 'a',
              original: { name: 'Files', arguments: '{}' },
              effectiveArguments: '{}',
              definition: { owner: 'tool', name: 'Files', revision: '1', digest: 'd' },
              permissions: [],
              decision: null,
            } as never)
            flags.verifierThrows = true
            answers['broken'] = await sessionAccessCheck.check(read(work, 'readWork'))
          })()
        },
      },
    })
    const verifierModule = {
      name: principalVerifierKey,
      implementation: 'real' as const,
      install(scope: Context) {
        new VerifierImpl(scope)
      },
    }

    const run = await serveOnce({
      distribution: {
        rows: [
          { id: 'identity', plugin: 'identityRow', config: {} },
          {
            id: 'authorization',
            plugin: 'authorization',
            config: {
              actionRules: {
                revision: 'serve-1',
                rules: [{ id: 'files', effect: 'allow', tool: 'Files' }],
              },
            },
          },
          { id: 'probe', plugin: 'probeRow', config: {} },
        ],
      },
      plugins: { identityRow, authorization, probeRow },
      entryObjects: [verifierModule, identityClock],
    })
    await answers['run']

    expect(run.result.exitCode).toBe(0)
    expect(run.of('row-state').map(r => [r['id'], r['state']])).toEqual([
      ['identity', 'ACTIVE'],
      ['authorization', 'ACTIVE'],
      ['probe', 'ACTIVE'],
    ])
    expect(answers['work']).toMatchObject({ kind: 'allowed' })
    expect(answers['holder']).toMatchObject({ kind: 'allowed' })
    // Unlisted components have no maintenance purpose.
    expect(answers['intruder']).toEqual({ kind: 'denied' })
    expect(answers['agent']).toMatchObject({ kind: 'allowed' })
    expect(answers['admission']).toMatchObject({ ok: { kind: 'allow' } })
    expect(answers['broken']).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify([answers, run.records, run.stderr])).not.toContain('SECRET-TEXT')
  })
})

// ---- The row specification (验收 5) -------------------------------------------------------------

const DOC = readFileSync(
  new URL('../../../docs/rows/authorization-policy.md', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

function region(name: string): string {
  const open = `<!-- policy:${name} -->`
  const a = DOC.indexOf(open)
  const b = DOC.indexOf(`<!-- /policy:${name} -->`)
  if (a < 0 || b < a) throw new Error(`the row specification has no region ${name}`)
  return DOC.slice(a + open.length, b).trim()
}

/** The verdict of a cell in the words of the table regions. */
function labelOf(cell: PolicyCell): string {
  const branch =
    (cell.verdict === 'member' || cell.verdict === 'matrix') && cell.when !== undefined
      ? `，只限${cell.when.kind === 'routed' ? '输入种类' : '事实种类'} ${cell.when.kinds.join('、')}`
      : ''
  switch (cell.verdict) {
    case 'member':
      return `放行（成员）${branch}`
    case 'matrix':
      return `放行（矩阵 ${cell.purpose}）${branch}`
    case 'deny':
      return '拒绝'
  }
}

function textOf(cell: PolicyCell): string {
  switch (cell.verdict) {
    case 'member':
    case 'matrix':
      return cell.source
    case 'deny':
      return cell.basis
  }
}

/** The rows of a table region: operation to the three verdict cells. */
function docCells(table: string): Map<string, string[]> {
  const rows = new Map<string, string[]>()
  for (const line of region(table).split('\n')) {
    const cells = line
      .replace(/^\|\s*/, '')
      .replace(/\s*\|$/, '')
      .split(/\s*(?<!\\)\|\s*/)
      .map(cell => cell.replaceAll('\\|', '|'))
    const operation = /^`(.+)`$/.exec(cells[0] ?? '')?.[1]
    if (operation !== undefined) rows.set(operation, cells.slice(1))
  }
  return rows
}

describe('the row specification agrees with the tables', () => {
  const tables = [
    ['session', SESSION_POLICY],
    ['agent', AGENT_POLICY],
  ] as const

  it.each(tables)(
    'lists every operation of the %s table with the verdict of every cell',
    (name, policy) => {
      const rows = docCells(`${name}-table`)
      expect([...rows.keys()].toSorted()).toEqual(Object.keys(policy).toSorted())
      for (const [operation, row] of Object.entries<PolicyRow>(policy)) {
        expect(rows.get(operation), operation).toEqual([
          labelOf(row.login),
          labelOf(row.work),
          labelOf(row.system),
        ])
      }
    },
  )

  it.each(tables)('gives the source or the basis of every cell of the %s table', (name, policy) => {
    const notes = region(`${name}-notes`)
    for (const [operation, row] of Object.entries<PolicyRow>(policy)) {
      expect(notes, operation).toContain(`- \`${operation}\``)
      for (const cell of [row.login, row.work, row.system]) {
        const text = textOf(cell)
        expect(notes, `${operation}: ${text}`).toContain(text)
      }
    }
  })

  it('shows the grant table and the projection of the holders', () => {
    const grants = region('grants')
    for (const [holder, grant] of Object.entries(MAINTENANCE_GRANTS)) {
      expect(grants).toContain(`\`${holder}\``)
      for (const purpose of grant.purposes) expect(grants).toContain(`\`${purpose}\``)
    }
    const projection = region('projection')
    const projected = holderProjection({
      session: SESSION_POLICY,
      agent: AGENT_POLICY,
      grants: MAINTENANCE_GRANTS,
    })
    for (const [holder, cells] of Object.entries(projected)) {
      const line = projection.split('\n').find(row => row.includes(`\`${holder}\``)) ?? ''
      expect(line, holder).not.toBe('')
      for (const cell of cells) {
        const named = `${cell.table === 'session' ? 'Session' : 'Agent'} \`${cell.operation}\``
        expect(line, holder).toContain(named)
      }
    }
  })
})
