import { describe, expect, it } from 'vitest'
import { Service, Context } from '@deepseek-ai/cordis'
import { toolAccessGuardConformance, type ToolAccessGuardFixture } from '@omne-harness/tool/testing'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import {
  decisionEvidence,
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
  identityGovernanceKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionAccessRequest } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import {
  AGENT_HOST_COMPONENT,
  MAINTENANCE_GRANTS,
  SESSION_MAINTAINER_COMPONENT,
  TENANT_DOMAIN_SCANNER_COMPONENT,
  TOOL_RESIDENCY_COMPONENT,
  releaseMaintenanceGrants,
  type ReleaseGrant,
} from '../../../src/rows/authorization/index.ts'
import {
  createActionAdmission,
  createAgentAccessCheck,
  createSessionAccessCheck,
  createToolAccessGuard,
  createToolAccountsGuard,
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
import { ownResolution } from './own-resolution.ts'
import { VERDICT_RELEASE } from '../../support/permission-release.ts'

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
    login: { queryCurrentTenant: () => Promise.reject(new Error('no login source')) },
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

function list(principal: unknown, tenant: TenantId = A, target: TenantId = tenant) {
  return sessionRequest({
    access: { principal, tenant },
    operation: 'directory.list',
    target: { kind: 'tenant', tenant: target },
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
    expect(await w.session.check(read(w.login(), 'readWork'))).toEqual({ kind: 'denied' })
    w.flags.standing = 'member'
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

  it('lets the own login change the permission mode, and denies the work principal of the Agent', async () => {
    const w = world()
    const declaration = {
      declaration: {
        kind: 'permission-mode',
        value: 'auto_permission',
        expectedRevision: '0',
        authorization: { owner: 'login-entry', record: 'login', revision: '1', digest: 'd' },
      },
    }
    expect((await w.session.check(mutate(w.login(), 'change', declaration))).kind).toBe('allowed')
    expect(await w.session.check(mutate(w.work(), 'change', declaration))).toEqual({
      kind: 'denied',
    })
    expect(await w.session.check(mutate(w.foreign(), 'change', declaration))).toEqual({
      kind: 'denied',
    })
  })

  describe('an authorization a person expressed on a card', () => {
    const card = { owner: 'cards', record: 'card-1', revision: '1', digest: 'c' }
    const said = { owner: 'cards', record: 'answer-1', revision: '1', digest: 'a' }
    const once = (source = said) => ({
      declaration: {
        kind: 'authorization-expression',
        authorization: card,
        expression: {
          scope: {
            kind: 'once',
            consumer: { owner: '@omne-harness/agent', work: 'execution', position: 'action' },
            target: 'Shell',
            argumentsDigest: 'd',
          },
          direction: 'grant',
          source,
        },
      },
    })
    const answering = (reply: unknown) => {
      const w = world()
      const read: unknown[] = []
      const cards = {
        read: async (input: unknown) => {
          read.push(input)
          return { ok: reply }
        },
      }
      const check = createSessionAccessCheck({ ...w.ports, cards: () => cards as never })
      return { w, read, check }
    }
    const chosen = (option: string, evidence = said) => ({
      kind: 'chosen',
      option,
      value: null,
      evidence,
    })

    it('lets the Run of this session write it when the card holds that very answer', async () => {
      const { w, read, check } = answering(chosen('allow-once'))
      expect((await check.check(mutate(w.work(), 'change', once()))).kind).toBe('allowed')
      expect(read).toMatchObject([{ card }])
    })

    it.each([
      ['another option', chosen('deny-once')],
      ['another answer', chosen('allow-once', { ...said, record: 'answer-2' })],
      ['no answer yet', { kind: 'pending' }],
      ['words instead of a choice', { kind: 'remark', text: 'go on', evidence: said }],
    ])('denies it when the card holds %s', async (_, reply) => {
      const { w, check } = answering(reply)
      expect(await check.check(mutate(w.work(), 'change', once()))).toEqual({ kind: 'denied' })
    })

    const gate = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke', basis: 'r7' }
    const forSession = (basis = gate.basis) => ({
      declaration: {
        kind: 'authorization-expression',
        authorization: card,
        expression: {
          scope: { kind: 'session', ...gate, basis },
          direction: 'grant',
          source: said,
        },
      },
    })
    const handingBack = (held: typeof gate | null) => ({
      ...chosen('allow-session'),
      value:
        held === null
          ? null
          : {
              kind: 'object',
              entries: Object.entries(held).map(([key, value]) => ({
                key,
                value: { kind: 'string', value },
              })),
            },
    })

    it('lets a release for the session through only for the gate and the basis the card holds', async () => {
      const held = answering(handingBack(gate))
      expect((await held.check.check(mutate(held.w.work(), 'change', forSession()))).kind).toBe(
        'allowed',
      )
      expect(
        await held.check.check(mutate(held.w.work(), 'change', forSession('another basis'))),
      ).toEqual({ kind: 'denied' })
      const none = answering(handingBack(null))
      expect(await none.check.check(mutate(none.w.work(), 'change', forSession()))).toEqual({
        kind: 'denied',
      })
    })

    it('lets a once release stand on the answer of a card that also hands back its gate', async () => {
      const { w, check } = answering({ ...handingBack(gate), option: 'allow-once' })
      expect((await check.check(mutate(w.work(), 'change', once()))).kind).toBe('allowed')
    })

    it('denies words that carry the same option and evidence: only a choice stands', async () => {
      const remark = { kind: 'remark', text: 'go on', option: 'allow-once', evidence: said }
      const { w, check } = answering(remark)
      expect(await check.check(mutate(w.work(), 'change', once()))).toEqual({ kind: 'denied' })
    })

    it('denies an expression no option of a card stands for, and reads no card for it', async () => {
      const declared = once()
      const revoked = {
        declaration: {
          ...declared.declaration,
          expression: { ...declared.declaration.expression, direction: 'revoke' },
        },
      }
      const { w, read, check } = answering(chosen('allow-once'))
      expect(await check.check(mutate(w.work(), 'change', revoked))).toEqual({ kind: 'denied' })
      expect(read).toEqual([])
    })

    it('reads the card as the work of the session, in its tenant, and only once the member check allows', async () => {
      const { w, read, check } = answering(chosen('allow-once'))
      const principal = w.work()
      await check.check(mutate(principal, 'change', once()))
      expect(read).toEqual([{ principal, tenant: A, card }])
      const refusing = createSessionAccessCheck({
        ...w.ports,
        admission: {
          check: async () => ({ kind: 'denied', reason: 'x', evidence: card }),
        } as never,
        cards: () =>
          ({
            read: async (input: unknown) => {
              read.push(input)
              return { ok: chosen('allow-once') }
            },
          }) as never,
      })
      expect(await refusing.check(mutate(principal, 'change', once()))).toMatchObject({
        kind: 'denied',
      })
      expect(read).toHaveLength(1)
    })

    it('denies a command that names another session than the one it is sent to', async () => {
      const { w, check } = answering(chosen('allow-once'))
      const sent = { tenant: A, session: OTHER, ...once() }
      const request = sessionRequest({
        access: { principal: w.work(), tenant: A },
        operation: 'change',
        target: { kind: 'session', session: OWN, command: { kind: 'change', input: sent } },
      })
      expect(await check.check(request)).toEqual({ kind: 'denied' })
    })

    it('lets a once release stand on an answer for always, whose setting could not be written', async () => {
      const { w, check } = answering(chosen('allow-always'))
      expect((await check.check(mutate(w.work(), 'change', once()))).kind).toBe('allowed')
      const session = answering(chosen('allow-always'))
      expect(await session.check.check(mutate(session.w.work(), 'change', forSession()))).toEqual({
        kind: 'denied',
      })
    })

    it('lets the release of the session be withdrawn only on an answer for always deny naming the gate', async () => {
      const revoke = () => {
        const declared = forSession()
        const expression = { ...declared.declaration.expression, direction: 'revoke' }
        return { declaration: { ...declared.declaration, expression } }
      }
      const held = answering({ ...handingBack(gate), option: 'deny-always' })
      expect((await held.check.check(mutate(held.w.work(), 'change', revoke()))).kind).toBe(
        'allowed',
      )
      const other = answering(handingBack(gate))
      expect(await other.check.check(mutate(other.w.work(), 'change', revoke()))).toEqual({
        kind: 'denied',
      })
    })

    it('denies the login, a foreign principal and the Run of another session, and reads no card', async () => {
      const { w, read, check } = answering(chosen('allow-once'))
      for (const principal of [w.login(), w.foreign(), w.work(OTHER)])
        expect(await check.check(mutate(principal, 'change', once()))).toEqual({ kind: 'denied' })
      expect(read).toEqual([])
    })

    it.each<[string, (() => unknown) | undefined, string]>([
      ['no card service is installed', undefined, 'the decision cards are not installed'],
      [
        'the card service is not there now',
        () => undefined,
        'the decision cards are not installed',
      ],
      [
        'the card cannot be read now',
        () => ({ read: async () => ({ failure: { kind: 'unavailable' } }) }),
        'the card answer could not be read now',
      ],
    ])('names why it waits when %s', async (_what, cards, diagnostic) => {
      const w = world()
      const check = createSessionAccessCheck({
        ...w.ports,
        ...(cards === undefined ? {} : { cards: cards as never }),
      })
      expect(await check.check(mutate(w.work(), 'change', once()))).toEqual({
        kind: 'unavailable',
        diagnostic,
      })
    })

    it('answers a card service that throws as a dependency failure, without its message', async () => {
      const w = world()
      const check = createSessionAccessCheck({
        ...w.ports,
        cards: () => ({ read: () => Promise.reject(new Error('card SECRET-TEXT')) }) as never,
      })
      expect(await check.check(mutate(w.work(), 'change', once()))).toEqual({
        kind: 'unavailable',
        diagnostic:
          'a dependency of the access check threw an exception; its message is not reported',
      })
    })

    it('answers denied, with nothing more, to each answer the card cannot stand on', async () => {
      const handing = (over: Record<string, unknown>) => ({ ...handingBack(gate), ...over })
      for (const reply of [
        { kind: 'pending' },
        { kind: 'declined', evidence: said },
        chosen('allow-once', { ...said, digest: 'other' }),
        chosen('deny-once'),
      ]) {
        const { w, check } = answering(reply)
        expect(await check.check(mutate(w.work(), 'change', once()))).toStrictEqual({
          kind: 'denied',
        })
      }
      for (const reply of [
        { kind: 'pending' },
        handing({ option: 'allow-once' }),
        handing({ evidence: { ...said, digest: 'other' } }),
        { ...handingBack({ ...gate, basis: 'r8' }) },
      ]) {
        const { w, check } = answering(reply)
        expect(await check.check(mutate(w.work(), 'change', forSession()))).toStrictEqual({
          kind: 'denied',
        })
      }
    })

    it('answers denied to a change whose declaration is no authorization expression of a card', async () => {
      const { w, read, check } = answering(chosen('allow-once'))
      const declared = once()
      const unknown = {
        declaration: {
          ...declared.declaration,
          expression: {
            ...declared.declaration.expression,
            scope: { kind: 'tenant' },
          },
        },
      }
      expect(await check.check(mutate(w.work(), 'change', unknown))).toStrictEqual({
        kind: 'denied',
      })
      expect(read).toEqual([])
    })

    it('answers unavailable while the cards cannot be read, and writes nothing on its own word', async () => {
      const w = world()
      expect((await w.session.check(mutate(w.work(), 'change', once()))).kind).toBe('unavailable')
      const failing = createSessionAccessCheck({
        ...w.ports,
        cards: () => ({ read: async () => ({ failure: { kind: 'unavailable' } }) }) as never,
      })
      expect((await failing.check(mutate(w.work(), 'change', once()))).kind).toBe('unavailable')
    })
  })

  it('denies the two operations to the work principal and to a foreign principal', async () => {
    const w = world()
    for (const kind of ['configureAutoArchive', 'setRelation']) {
      expect(await w.session.check(mutate(w.work(), kind)), kind).toEqual({ kind: 'denied' })
      expect(await w.session.check(mutate(w.foreign(), kind)), kind).toEqual({ kind: 'denied' })
    }
  })
})

describe('sessionAccessCheck: the subject kind of an allowed answer (SE-28)', () => {
  it('names a member for a login principal, on an intake and on any other allowed operation', async () => {
    const w = world()
    const login = w.login()
    expect(await w.session.check(mutate(login, 'accept', ordinaryValue))).toMatchObject({
      kind: 'allowed',
      subject: { kind: 'member' },
    })
    expect(await w.session.check(mutate(login, 'create'))).toMatchObject({
      kind: 'allowed',
      subject: { kind: 'member' },
    })
  })

  it('names the component for a system principal the matrix allows', async () => {
    const w = world()
    const maintainer = w.system(SESSION_MAINTAINER_COMPONENT)
    expect(await w.session.check(pending(maintainer))).toMatchObject({
      kind: 'allowed',
      subject: { kind: 'system', component: SESSION_MAINTAINER_COMPONENT },
    })
  })

  it('names no subject kind for a work principal: it sends no ordinary input', async () => {
    const w = world()
    const answer = await w.session.check(read(w.work(), 'readWork'))
    expect(answer.kind).toBe('allowed')
    expect(answer).not.toHaveProperty('subject')
  })

  it('a denied or unavailable answer carries nothing more', async () => {
    const w = world()
    expect(await w.session.check(mutate(w.login(), 'accept', businessValue))).toEqual({
      kind: 'denied',
    })
    w.flags.verifierThrows = true
    const down = await w.session.check(mutate(w.login(), 'accept', ordinaryValue))
    expect(down.kind).toBe('unavailable')
    expect(down).not.toHaveProperty('subject')
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

  it('lets the login and a work principal of the tenant list its sessions, and denies another tenant', async () => {
    const w = world()
    expect((await w.session.check(list(w.login()))).kind).toBe('allowed')
    expect(w.seen.admissions.at(-1)?.target).toMatchObject({ owner: 'session', kind: 'tenant' })
    expect((await w.session.check(list(w.work()))).kind).toBe('allowed')
    const reached = w.reached()
    expect(await w.session.check(list(w.login(B), B, A))).toEqual({ kind: 'denied' })
    expect(await w.session.check(list(w.login(B), A))).toEqual({ kind: 'denied' })
    expect(await w.session.check(list(w.work(OWN, B), A))).toEqual({ kind: 'denied' })
    expect(w.reached()).toBe(reached)
  })

  it('lets a work principal read the history of another session of its tenant, and nothing else of it', async () => {
    const w = world()
    for (const operation of ['history.begin', 'history.next'])
      expect((await w.session.check(read(w.work(OTHER), operation))).kind).toBe('allowed')
    expect(w.seen.admissions.at(-1)?.target).toEqual({
      owner: 'session',
      kind: 'session',
      key: OWN,
    })
    const reached = w.reached()
    for (const operation of [
      'readWork',
      'readPending',
      'readWaitingCalls',
      'readInputFate',
      'readBackgroundCalls',
      'resolveBackgroundCall',
      'history.since',
      'history.readModelView',
      'history.readCompactionContext',
      'queryOperation',
    ])
      expect(await w.session.check(read(w.work(OTHER), operation)), operation).toEqual({
        kind: 'denied',
      })
    expect(await w.session.check(mutate(w.work(OTHER), 'claim'))).toEqual({ kind: 'denied' })
    expect(await w.session.check(read(w.work(OTHER, B), 'history.begin'))).toEqual({
      kind: 'denied',
    })
    expect(w.reached()).toBe(reached)
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

  it('lets the current tenant work principal recover a message handoff after an unavailable preparation', async () => {
    const w = world()
    const target = { kind: 'execution', execution }
    expect(
      await w.agent.check(agentRequest(w.work(), 'read-message-handoff', target)),
    ).toHaveProperty('kind', 'allowed')
    for (const principal of [
      w.login(),
      w.work(OWN, B),
      w.system(AGENT_HOST_COMPONENT),
      w.foreign(),
    ])
      expect(
        await w.agent.check(agentRequest(principal, 'read-message-handoff', target)),
      ).toHaveProperty('kind', 'denied')
    expect(
      await w.agent.check(agentRequest(w.work(), 'read-message-handoff', scopeOf(OWN))),
    ).toHaveProperty('kind', 'denied')
    w.flags.standing = 'not-member'
    expect(
      await w.agent.check(agentRequest(w.work(), 'read-message-handoff', target)),
    ).toHaveProperty('kind', 'denied')
  })

  it('checks every compaction operation for a current tenant work principal and exact target kind', async () => {
    const w = world()
    const target = {
      kind: 'compaction',
      task: { authority: 'provider', task: 'task', requestDigest: 'digest' },
    }
    for (const operation of [
      'compaction.admit',
      'compaction.inspect',
      'compaction.cancel',
      'compaction.acknowledge',
    ] as const) {
      expect(await w.agent.check(agentRequest(w.work(), operation, target))).toHaveProperty(
        'kind',
        'allowed',
      )
      expect(await w.agent.check(agentRequest(w.login(), operation, target))).toHaveProperty(
        'kind',
        'denied',
      )
      expect(await w.agent.check(agentRequest(w.work(OWN, B), operation, target))).toHaveProperty(
        'kind',
        'denied',
      )
      expect(
        await w.agent.check(agentRequest(w.system(AGENT_HOST_COMPONENT), operation, target)),
      ).toHaveProperty('kind', 'denied')
      expect(
        await w.agent.check(agentRequest(w.work(), operation, { kind: 'execution', execution })),
      ).toHaveProperty('kind', 'denied')
    }
    expect(await w.agent.check(agentRequest(w.work(), 'invoke', target))).toHaveProperty(
      'kind',
      'denied',
    )
  })

  it('lets the Model host work principal M receive a result for its own tenant only, and nothing else', async () => {
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
    for (const operation of ['submit', 'control', 'resume', 'detach', 'invoke'] as const)
      expect(await w.agent.check(agentRequest(model(A), operation, target)), operation).toEqual({
        kind: 'denied',
      })
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
  it('does not treat a static allow as current permission', async () => {
    const w = world()
    const admission = createActionAdmission({
      readResolution: ownResolution,
      readAdmission: () => w.ports.admission,
      readPermission: () => undefined,
      actionRules: rules,
    })
    expect(await admission.admit(action(w.work()) as never)).toMatchObject({
      ok: { kind: 'unavailable' },
    })
  })
  it('requires the issued Session work principal, the correct tenant and current membership', async () => {
    const w = world()
    const admission = createActionAdmission({
      readResolution: ownResolution,
      readAdmission: () => w.ports.admission,
      readPermission: () => undefined,
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
      readResolution: ownResolution,
      readAdmission: () => w.ports.admission,
      readPermission: () => undefined,
      actionRules: rules,
    })
    for (const change of [
      { definition: { ...input.definition, name: 'Shell' } },
      { permissions: [{ need: 'permission' }] },
      { decision: {} },
    ]) {
      expect(await admission.admit({ ...input, ...change } as never)).toMatchObject({
        ok: { kind: 'undecidable' },
      })
    }
    const exact = createActionAdmission({
      readResolution: ownResolution,
      readAdmission: () => w.ports.admission,
      readPermission: () => ({
        check: async request => {
          expect(request.origin).toMatchObject({ original: input.original })
          return {
            kind: 'allow',
            evidence: decisionEvidence('permission-fixture', '1', request.operation),
            condition: null,
            release: VERDICT_RELEASE,
          }
        },
      }),
      actionRules: { ...rules, rules: [{ ...rules.rules[0], definition: input.definition }] },
    })
    expect(await exact.admit(input as never)).toMatchObject({ ok: { kind: 'allow' } })
    for (const field of ['owner', 'name', 'revision', 'digest']) {
      expect(
        await exact.admit({
          ...input,
          definition: { ...input.definition, [field]: 'other' },
        } as never),
      ).toMatchObject({ ok: { kind: 'undecidable' } })
    }
    for (const mode of ['throws', 'unavailable'] as const) {
      w.flags.standing = mode
      expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'unavailable' } })
    }
    w.flags.standing = 'member'
    w.flags.verifierThrows = true
    expect(await admission.admit(input as never)).toMatchObject({ ok: { kind: 'unavailable' } })
    for (const [readAdmission, kind] of [
      [() => undefined, 'unavailable'],
      [
        () => {
          throw new Error('SECRET')
        },
        'undecidable',
      ],
      [() => ({ check: async () => ({ kind: 'odd' }) as never }), 'undecidable'],
    ] as const) {
      const failed = createActionAdmission({
        readResolution: ownResolution,
        readAdmission,
        readPermission: () => undefined,
        actionRules: rules,
      })
      const result = await failed.admit(input as never)
      expect(result).toMatchObject({ ok: { kind } })
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
        readResolution: ownResolution,
        readAdmission: () => w.ports.admission,
        readPermission: () => undefined,
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
      readResolution: ownResolution,
      readAdmission: () => w.ports.admission,
      actionRules: { revision: 'ops-1', rules: [allow] },
      readPermission: () => ({
        check: async input => ({
          kind: 'allow',
          condition: null,
          release: VERDICT_RELEASE,
          evidence: decisionEvidence('permission-fixture', '1', {
            operation: input.operation,
            arguments: input.effectiveArguments,
          }),
        }),
      }),
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

  it('has no default allow: every action is undecidable, with or without permissions or a decision', async () => {
    const admission = createActionAdmission({
      readResolution: ownResolution,
      readAdmission: () => undefined,
      readPermission: () => undefined,
    })
    for (const input of [
      { permissions: [], decision: null },
      { permissions: [{ need: 'n' }], decision: null },
      { permissions: [], decision: { card: 'c', answer: 'a' } },
    ]) {
      const answer = await admission.admit(input as never)
      expect(answer).toMatchObject({ ok: { kind: 'undecidable' } })
      expect(JSON.stringify(answer)).not.toContain('"allow"')
    }
  })
})

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant')
  return encoded.value
}

describe('Tool usage list qualification', () => {
  it('lets a member or the session work of the tenant list its usage, asking the admission for the tenant', async () => {
    const w = world()
    const guard = createToolAccountsGuard(() => w.ports.admission)
    for (const principal of [w.login(), w.work()]) {
      expect(await guard.qualify({ principal, tenant: A })).toEqual({ kind: 'allowed' })
      expect(w.seen.admissions.at(-1)).toMatchObject({
        operation: { owner: 'tool', name: 'list-accounts' },
        target: { owner: 'tool', kind: 'tenant', key: tenantText(A) },
        arguments: noArguments(),
      })
    }
  })

  it('denies another tenant, a foreign or system principal, before reading the admission', async () => {
    const w = world()
    let reads = 0
    const guard = createToolAccountsGuard(() => {
      reads += 1
      return w.ports.admission
    })
    for (const [principal, tenant] of [
      [w.login(), B],
      [w.foreign(), A],
      [w.system('unlisted'), A],
      [{ subject: 'forged' }, A],
    ] as const)
      expect(await guard.qualify({ principal, tenant })).toEqual({
        kind: 'denied',
        reason: 'tenant-member-required',
      })
    expect(reads).toBe(0)
  })

  it('answers unavailable without an admission or when the dependency throws', async () => {
    const w = world()
    expect(
      await createToolAccountsGuard(() => undefined).qualify({ principal: w.login(), tenant: A }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'the tool access dependency is unavailable' })
    const broken = createToolAccountsGuard(() => {
      throw new Error('admission reader broke')
    })
    expect(await broken.qualify({ principal: w.login(), tenant: A })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the tool access request or dependency failed; exception text is not reported',
    })
  })

  it('answers as the admission does when it denies or cannot answer', async () => {
    const w = world()
    const answering = (answer: unknown) =>
      createToolAccountsGuard(() => ({ check: () => Promise.resolve(answer) }) as never).qualify({
        principal: w.login(),
        tenant: A,
      })
    expect(await answering({ kind: 'denied', reason: 'no-grant' })).toEqual({
      kind: 'denied',
      reason: 'no-grant',
    })
    expect(await answering({ kind: 'unavailable' })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the tool access dependency is unavailable',
    })
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
      'read-output',
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
  it('lets a member acting for the tenant read a call of that tenant, and only read it (tool/v1)', async () => {
    const w = world()
    const guard = createToolAccessGuard(() => w.ports.admission)
    const input = { principal: w.login(), tenant: A, call: toolCallId('tc_auth') }
    for (const action of ['lookup', 'read-result', 'read-output'] as const) {
      expect(await guard.qualify({ ...input, action })).toEqual({ kind: 'allowed' })
      expect(w.seen.admissions.at(-1)).toMatchObject({
        access: { principal: input.principal, tenant: A },
        operation: { owner: 'tool', name: action },
      })
    }
    const before = w.seen.admissions.length
    for (const action of [
      'admit',
      'query-operation',
      'control',
      'read-content',
      'release-delivery',
      'account',
      'recover',
      'write',
      'start',
    ] as const)
      expect(await guard.qualify({ ...input, action })).toEqual({
        kind: 'denied',
        reason: 'session-work-and-call-required',
      })
    expect(await guard.qualify({ ...input, tenant: B, action: 'lookup' })).toMatchObject({
      kind: 'denied',
    })
    for (const action of ['read-result', 'read-output'] as const)
      expect(await guard.qualify({ ...input, principal: w.foreign(), action })).toMatchObject({
        kind: 'denied',
      })
    for (const action of ['lookup', 'read-result', 'read-output'] as const)
      expect(
        await guard.qualify({ ...input, principal: w.system('sessionWorkPrincipals'), action }),
      ).toEqual({ kind: 'denied', reason: 'session-work-and-call-required' })
    expect(w.seen.admissions).toHaveLength(before)
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
        scope.provide(identityGovernanceKey, {
          queryCurrentTenant: async () => ({ kind: 'denied' }),
        })
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
      // The judged definition is in no catalog of this tree, so its action cannot be resolved.
      expect(await admission.admit(input as never)).toMatchObject({
        ok: { kind: 'unavailable', diagnostic: 'the action could not be resolved now' },
      })
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
      manifest: {
        provides: [tenantStandingKey, identityGovernanceKey],
        injects: [],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'standing',
        apply: (ctx: Context) => {
          new StandingImpl(ctx)
          ctx.provide(identityGovernanceKey, {
            queryCurrentTenant: async () => ({ kind: 'denied' }),
          })
        },
      },
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

    expect(run.result.exitCode, run.stderr.join('\n')).toBe(0)
    expect(run.of('row-state').map(r => [r['id'], r['state']])).toEqual([
      ['identity', 'ACTIVE'],
      ['authorization', 'ACTIVE'],
      ['probe', 'ACTIVE'],
    ])
    expect(answers['work']).toMatchObject({ kind: 'allowed' })
    expect(answers['holder']).toMatchObject({ kind: 'allowed' })
    expect(answers['intruder']).toEqual({ kind: 'denied' })
    expect(answers['agent']).toMatchObject({ kind: 'allowed' })
    // The judged definition is in no catalog of this tree, so its action cannot be resolved.
    expect(answers['admission']).toMatchObject({
      ok: { kind: 'unavailable', diagnostic: 'the action could not be resolved now' },
    })
    expect(answers['broken']).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify([answers, run.records, run.stderr])).not.toContain('SECRET-TEXT')
  })
})
