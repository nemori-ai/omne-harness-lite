// The qualification registry of the Model application module (`src/model/qualification.ts`,
// `tmp/wire-model/design.md` §2, §4): the synchronous `authorize`, `execution` and `current` only
// read what an asynchronous admission point captured. Real identity issuer and verifier; the
// standing source is scripted per test. Each case names the defect that turns it red.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
} from '@omne-harness/model-contract'
import type { CommandAction, ModelSendSource } from '@omne-harness/model/commands'
import type { SendDemand } from '@omne-harness/model-contract/provider'
import { currentForReader } from '../../src/entry/runtime-context-trust.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../../src/model/principals.ts'
import { ACTOR_OWNER, createModelQualification } from '../../src/model/qualification.ts'
import { ENTRY_COMPONENTS } from '../../src/entry/principals.ts'
import { SESSION_WORK_OWNER } from '../../src/rows/authorization/principals.ts'
import { fixtureTenant, okOf } from '../entry/support.ts'

const TENANT = fixtureTenant('a')
const OTHER = fixtureTenant('b')
const CALL = okOf(decodeModelCallId('mcall_one'), 'call')
const OTHER_CALL = okOf(decodeModelCallId('mcall_two'), 'call')
const INSTANCE = okOf(decodeModelInstanceId('minst_one'), 'instance')
const OPERATION = okOf(decodeModelOperationId('mop_claim'), 'operation')
const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:abc', revision: '7' },
})

function standingOf(reading: TenantStandingReading | 'throw'): TenantStandingSource {
  return {
    read: () =>
      reading === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(reading),
  }
}

function scene(reading: TenantStandingReading | 'throw' = MEMBER) {
  const authority = inProcessPrincipalAuthority()
  const sessionActor = okOf(
    authority.issuer.issueSystem({ component: ENTRY_COMPONENTS.sessionWork }),
    'actor',
  )
  const hostActor = okOf(authority.issuer.issueSystem({ component: MODEL_HOST_COMPONENT }), 'actor')
  const work = (tenant = TENANT): Principal =>
    okOf(
      authority.issuer.issueActingForTenant({
        actor: sessionActor,
        tenant,
        work: { owner: SESSION_WORK_OWNER, work: 'session-1' },
      }),
      'work principal',
    )
  const host = (tenant = TENANT, call = CALL): Principal =>
    okOf(
      authority.issuer.issueActingForTenant({
        actor: hostActor,
        tenant,
        work: { owner: MODEL_WORK_OWNER, work: call },
      }),
      'host principal',
    )
  const qualification = createModelQualification({
    verifier: authority.verifier,
    standing: standingOf(reading),
  })
  const alive = () => true
  const resource = { kind: 'call' as const, call: CALL, consumer: null }
  const authorize = (action: CommandAction, principal: unknown, call = CALL) =>
    qualification.authority.authorize({
      action,
      access: { principal, tenant: TENANT },
      resource: { ...resource, call },
    })
  return { authority, qualification, work, host, alive, authorize }
}

describe('authorize for W: what the admission point captured', () => {
  it('a principal nobody qualified answers unavailable, never ok (defect: a default admission)', () => {
    const s = scene()
    expect(s.authorize('admit', s.work())).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'model-access-qualification' },
    })
  })

  it('a verified member W gets the subject reference: owner tenantStanding, subject and revision from the standing evidence', async () => {
    const s = scene()
    const principal = s.work()
    const release = await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    expect(s.authorize('admit', principal)).toEqual({
      ok: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
    })
    release()
    expect(s.authorize('admit', principal)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a hand-built copy of a W is rejected by the verifier: denied (defect: shape instead of origin)', async () => {
    const s = scene()
    const copy = structuredClone(s.work())
    const release = await s.qualification.qualify({ principal: copy, tenant: TENANT }, s.alive)
    expect(s.authorize('admit', copy)).toEqual({ failure: { kind: 'denied', action: 'admit' } })
    release()
  })

  it('a verifier that cannot answer makes the action unavailable, not denied and not ok', async () => {
    const s = scene()
    const principal = s.work()
    const unavailable = createModelQualification({
      verifier: { verify: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'x' }) },
      standing: standingOf(MEMBER),
    })
    await unavailable.qualify({ principal, tenant: TENANT }, s.alive)
    expect(
      unavailable.authority.authorize({
        action: 'facts',
        access: { principal, tenant: TENANT },
        resource: { kind: 'tenant' },
      }),
    ).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'principalVerifier' },
    })
  })

  it('standing not-member is denied; standing unavailable is unavailable (defect: member cached as permission)', async () => {
    const notMember = scene({
      kind: 'not-member',
      evidence: { record: 'standing:abc', revision: '0' },
    })
    const w1 = notMember.work()
    await notMember.qualification.qualify({ principal: w1, tenant: TENANT }, notMember.alive)
    expect(notMember.authorize('admit', w1)).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    const down = scene({ kind: 'unavailable', diagnostic: 'db' })
    const w2 = down.work()
    await down.qualification.qualify({ principal: w2, tenant: TENANT }, down.alive)
    expect(down.authorize('admit', w2)).toMatchObject({
      failure: { kind: 'unavailable', dependency: ACTOR_OWNER },
    })
    const threw = scene('throw')
    const w3 = threw.work()
    await threw.qualification.qualify({ principal: w3, tenant: TENANT }, threw.alive)
    expect(threw.authorize('admit', w3)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('W of another tenant than the access, or access of another tenant than the capture, is denied', async () => {
    const s = scene()
    const foreign = s.work(OTHER)
    await s.qualification.qualify({ principal: foreign, tenant: TENANT }, s.alive)
    expect(s.authorize('admit', foreign)).toEqual({ failure: { kind: 'denied', action: 'admit' } })
    const principal = s.work()
    await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    expect(
      s.qualification.authority.authorize({
        action: 'facts',
        access: { principal, tenant: OTHER },
        resource: { kind: 'tenant' },
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'facts' } })
  })

  it('W may admit, read facts, content, control, account, observe and handoff; not recovery or send', async () => {
    const s = scene()
    const principal = s.work()
    await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    for (const action of [
      'admit',
      'facts',
      'content',
      'control',
      'handoff',
      'account',
      'observe',
    ] as const)
      expect(s.authorize(action, principal), action).toHaveProperty('ok')
    for (const action of ['recovery', 'send'] as const)
      expect(s.authorize(action, principal), action).toEqual({
        failure: { kind: 'denied', action },
      })
  })

  it('a system principal or a login-shaped principal of the same issuer is denied (defect: any issued principal passes)', async () => {
    const s = scene()
    const system = okOf(s.authority.issuer.issueSystem({ component: 'anything' }), 'system')
    await s.qualification.qualify({ principal: system, tenant: TENANT }, s.alive)
    expect(s.authorize('facts', system)).toEqual({ failure: { kind: 'denied', action: 'facts' } })
  })

  it('two concurrent calls with the same W share one capture and the last release ends it', async () => {
    const s = scene()
    const principal = s.work()
    const first = await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    const second = await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    first()
    expect(s.authorize('facts', principal)).toHaveProperty('ok')
    second()
    second()
    expect(s.authorize('facts', principal)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('authorize for M: what resolve captured', () => {
  it('M may recover, send, read facts, content, account, observe and handoff on its call; not admit or control', () => {
    const s = scene()
    const principal = s.host()
    s.qualification.captureHost({
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current: s.alive,
    })
    for (const action of [
      'recovery',
      'send',
      'facts',
      'content',
      'handoff',
      'account',
      'observe',
    ] as const)
      expect(s.authorize(action, principal), action).toEqual({
        ok: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      })
    for (const action of ['admit', 'control'] as const)
      expect(s.authorize(action, principal), action).toEqual({
        failure: { kind: 'denied', action },
      })
  })

  it('M is bound to one call: another call is denied, the tenant-level scan is unavailable', () => {
    const s = scene()
    const principal = s.host()
    s.qualification.captureHost({
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current: s.alive,
    })
    expect(s.authorize('facts', principal, OTHER_CALL)).toEqual({
      failure: { kind: 'denied', action: 'facts' },
    })
    expect(
      s.qualification.authority.authorize({
        action: 'recovery',
        access: { principal, tenant: TENANT },
        resource: { kind: 'tenant' },
      }),
    ).toMatchObject({ failure: { kind: 'unavailable', dependency: 'model-recovery-scan' } })
  })

  it('an M-shaped principal that resolve did not capture is not admitted by qualify (defect: shape admits M)', async () => {
    const s = scene()
    const principal = s.host()
    await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    expect(s.authorize('send', principal)).toEqual({ failure: { kind: 'denied', action: 'send' } })
  })

  it('qualify leaves a captured M as it is, and the withdrawal ends the capture', async () => {
    const s = scene()
    const principal = s.host()
    const withdraw = s.qualification.captureHost({
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current: s.alive,
    })
    const release = await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    release()
    expect(s.authorize('send', principal)).toHaveProperty('ok')
    withdraw()
    expect(s.authorize('send', principal)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('the synchronous bridges: execution and current', () => {
  it('execution answers the binding reference only for the recorded instance of the call', () => {
    const s = scene()
    s.qualification.recordHostBinding({
      tenant: TENANT,
      call: CALL,
      instance: INSTANCE,
      operation: OPERATION,
      current: s.alive,
    })
    const execution = { tenant: TENANT, call: CALL, instance: INSTANCE, generation: '3' }
    expect(s.qualification.authority.execution(execution)).toEqual({
      ok: { owner: MODEL_HOST_COMPONENT, subject: INSTANCE, revision: '3' },
    })
    expect(
      s.qualification.authority.execution({
        ...execution,
        instance: okOf(decodeModelInstanceId('minst_other'), 'instance'),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'execution-channel' } })
    expect(s.qualification.authority.execution({ ...execution, call: OTHER_CALL })).toEqual({
      failure: { kind: 'denied', action: 'execution-channel' },
    })
  })

  it('current authorizes a send only for the captured M of that tenant and call; the factory supplier has no tenant binding', () => {
    const s = scene()
    const principal = s.host()
    s.qualification.captureHost({
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current: s.alive,
    })
    const demand = (overrides: Partial<SendDemand<unknown>>): SendDemand<unknown> =>
      ({
        principal,
        tenant: TENANT,
        call: CALL,
        supplier: { credential: { kind: 'factory' } },
        ...overrides,
      }) as SendDemand<unknown>
    const current: ModelSendSource<unknown>['current'] = s.qualification.sourceCurrent
    expect(current(demand({}))).toEqual({ ok: { authorized: true, noTenantBinding: true } })
    expect(current(demand({ call: OTHER_CALL }))).toEqual({
      ok: { authorized: false, noTenantBinding: true },
    })
    expect(current(demand({ principal: s.work() }))).toEqual({
      ok: { authorized: false, noTenantBinding: true },
    })
    expect(
      current(demand({ supplier: { credential: { kind: 'tenant', id: 'x' } } } as never)),
    ).toEqual({ ok: { authorized: true, noTenantBinding: false } })
  })

  it('after the host fiber retires, current is false for ever: M is denied and sends are not authorized', async () => {
    const s = scene()
    const principal = s.host()
    const root = new Context()
    const readers = new WeakMap<Context, () => boolean>()
    let current: (() => boolean) | undefined
    const fiber = root.plugin({
      name: 'host-stand-in',
      apply(ctx: Context) {
        current = currentForReader(readers, ctx)
      },
    })
    await fiber
    if (current === undefined) throw new Error('fixture: no current')
    s.qualification.captureHost({
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current,
    })
    s.qualification.recordHostBinding({
      tenant: TENANT,
      call: CALL,
      instance: INSTANCE,
      operation: OPERATION,
      current,
    })
    expect(s.authorize('send', principal)).toHaveProperty('ok')
    await fiber.dispose()
    expect(current()).toBe(false)
    expect(s.authorize('send', principal)).toEqual({ failure: { kind: 'denied', action: 'send' } })
    expect(
      s.qualification.authority.execution({
        tenant: TENANT,
        call: CALL,
        instance: INSTANCE,
        generation: '1',
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'execution-channel' } })
    expect(
      s.qualification.sourceCurrent({
        principal,
        tenant: TENANT,
        call: CALL,
        supplier: { credential: { kind: 'factory' } },
      } as SendDemand<unknown>),
    ).toEqual({ ok: { authorized: false, noTenantBinding: true } })
  })
})
