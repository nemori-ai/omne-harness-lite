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

describe('login diagnostic qualification', () => {
  it('admits issued login only for inspect and read-account, then releases the capture', async () => {
    const s = scene()
    const actor = okOf(s.authority.issuer.issueSystem({ component: 'server-entry' }), 'actor')
    const principal = okOf(
      s.authority.issuer.issueActingForTenant({
        actor,
        tenant: TENANT,
        work: { owner: 'identity-login', work: 'login-1' },
      }),
      'login',
    )
    const release = await s.qualification.qualify({ principal, tenant: TENANT }, s.alive)
    for (const action of ['inspect', 'read-account'] as const)
      expect(s.authorize(action, principal), action).toHaveProperty('ok')
    for (const action of [
      'admit',
      'facts',
      'content',
      'control',
      'handoff',
      'account',
      'recovery',
      'observe',
      'send',
    ] as const)
      expect(s.authorize(action, principal), action).toEqual({
        failure: { kind: 'denied', action },
      })
    release()
    expect(s.authorize('inspect', principal)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('read leases', () => {
  function readerScene() {
    const s = scene()
    const actor = okOf(s.authority.issuer.issueSystem({ component: 'server-entry' }), 'actor')
    const principal = okOf(
      s.authority.issuer.issueActingForTenant({
        actor,
        tenant: TENANT,
        work: { owner: 'identity-login', work: 'login-1' },
      }),
      'login',
    )
    let read: TenantStandingSource['read'] = async () => MEMBER
    const qualification = createModelQualification({
      verifier: s.authority.verifier,
      standing: { read: input => read(input) },
    })
    return {
      ...s,
      principal,
      qualification,
      setRead(next: typeof read) {
        read = next
      },
    }
  }

  it('a revoked check cannot borrow a concurrent successful capture of the same principal', async () => {
    const s = readerScene()
    const access = { principal: s.principal, tenant: TENANT }
    const lease = await s.qualification.qualifyRead(access, s.alive)
    const blocked = Promise.withResolvers<TenantStandingReading>()
    s.setRead(() => blocked.promise)
    const revoked = lease.check('inspect', { kind: 'tenant' })
    // Let the verifier enter the held standing read before the competing qualification.
    await Promise.resolve()
    s.setRead(async () => MEMBER)
    const other = await s.qualification.qualifyRead(access, s.alive)
    blocked.resolve({ kind: 'not-member', evidence: { record: 'standing:abc', revision: '8' } })
    expect(await revoked).toEqual({ failure: { kind: 'denied', action: 'inspect' } })
    expect(await other.check('inspect', { kind: 'tenant' })).toEqual({ ok: undefined })
    lease.release()
    other.release()
    expect(
      s.qualification.authority.authorize({
        action: 'inspect',
        access,
        resource: { kind: 'tenant' },
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('fails after retirement or release, and keeps standing failure explicit', async () => {
    const s = readerScene()
    let live = true
    const access = { principal: s.principal, tenant: TENANT }
    const lease = await s.qualification.qualifyRead(access, () => live)
    s.setRead(async () => {
      throw new Error('private standing details')
    })
    expect(await lease.check('inspect', { kind: 'tenant' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    s.setRead(async () => MEMBER)
    live = false
    expect(await lease.check('inspect', { kind: 'tenant' })).toMatchObject({
      failure: { kind: 'denied' },
    })
    live = true
    lease.release()
    expect(await lease.check('inspect', { kind: 'tenant' })).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  it('rejects copied and foreign login principals before naming a call', async () => {
    const s = readerScene()
    for (const access of [
      { principal: structuredClone(s.principal), tenant: TENANT },
      { principal: s.principal, tenant: OTHER },
    ]) {
      const lease = await s.qualification.qualifyRead(access, s.alive)
      expect(await lease.check('inspect', { kind: 'tenant' })).toMatchObject({
        failure: { kind: 'denied' },
      })
      lease.release()
    }
  })
})

describe('host read leases', () => {
  async function hostRead(read: TenantStandingSource['read']) {
    const s = scene()
    const principal = s.host()
    const qualification = createModelQualification({
      verifier: s.authority.verifier,
      standing: { read },
    })
    const lifetime = { current: true }
    const registration = {
      principal,
      tenant: TENANT,
      call: CALL,
      actor: { owner: ACTOR_OWNER, subject: 'standing:abc', revision: '7' },
      current: () => lifetime.current,
    }
    const unregister = qualification.captureHost(registration)
    const lease = await qualification.qualifyRead(
      { principal, tenant: TENANT },
      () => lifetime.current,
    )
    const check = () => lease.check('inspect', { kind: 'call', call: CALL, consumer: null })
    return { qualification, registration, lifetime, unregister, lease, check }
  }

  it.each([
    ['member', MEMBER, { ok: undefined }],
    [
      'membership revoked',
      { kind: 'not-member', evidence: { record: 'standing:abc', revision: '8' } },
      { failure: { kind: 'denied', action: 'inspect' } },
    ],
    [
      'standing unavailable',
      { kind: 'unavailable', diagnostic: 'standing offline' },
      { failure: { kind: 'unavailable' } },
    ],
  ] as const)('rechecks host standing: %s', async (_name, reading, expected) => {
    const s = await hostRead(async () => reading)
    try {
      expect(await s.check()).toMatchObject(expected)
    } finally {
      s.lease.release()
      s.unregister()
    }
  })

  it.each(['release', 'retire', 'unregister', 'replace'] as const)(
    'denies a host read when %s happens while standing is pending',
    async change => {
      const pending = Promise.withResolvers<TenantStandingReading>()
      const entered = Promise.withResolvers<void>()
      const s = await hostRead(() => {
        entered.resolve()
        return pending.promise
      })
      const result = s.check()
      await entered.promise
      let removeReplacement: (() => void) | undefined
      if (change === 'release') s.lease.release()
      if (change === 'retire') s.lifetime.current = false
      if (change === 'unregister') s.unregister()
      if (change === 'replace') removeReplacement = s.qualification.captureHost(s.registration)
      pending.resolve(MEMBER)
      try {
        expect(await result).toEqual({ failure: { kind: 'denied', action: 'inspect' } })
      } finally {
        s.lease.release()
        s.unregister()
        removeReplacement?.()
      }
    },
  )
})

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
      'inspect',
      'read-account',
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
      'inspect',
      'read-account',
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

  it('the binding table is bounded: dropHostBindings forgets every binding, and a record drops the stale ones (defect: a table that only grows)', () => {
    const s = scene()
    const calls = Array.from({ length: 8 }, (_, i) =>
      okOf(decodeModelCallId(`mcall_bounded${i}`), 'call'),
    )
    const record = (call: (typeof calls)[number], current: () => boolean) =>
      s.qualification.recordHostBinding({
        tenant: TENANT,
        call,
        instance: INSTANCE,
        operation: OPERATION,
        current,
      })
    const execution = (call: (typeof calls)[number]) =>
      s.qualification.authority.execution({
        tenant: TENANT,
        call,
        instance: INSTANCE,
        generation: '1',
      })
    for (const call of calls) record(call, s.alive)
    for (const call of calls) expect(execution(call)).toHaveProperty('ok')
    s.qualification.dropHostBindings()
    for (const call of calls)
      expect(execution(call)).toEqual({ failure: { kind: 'denied', action: 'execution-channel' } })
    // A retired host's bindings go on the next record, even without an explicit drop.
    let live = true
    const retiring = () => live
    record(calls[0]!, retiring)
    live = false
    record(calls[1]!, s.alive)
    live = true
    expect(execution(calls[0]!)).toEqual({
      failure: { kind: 'denied', action: 'execution-channel' },
    })
    expect(execution(calls[1]!)).toHaveProperty('ok')
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
        ...overrides,
      }) as SendDemand<unknown>
    const current: ModelSendSource<unknown>['current'] = s.qualification.sourceCurrent
    expect(current(demand({}))).toEqual({ ok: { authorized: true } })
    expect(current(demand({ call: OTHER_CALL }))).toEqual({ ok: { authorized: false } })
    expect(current(demand({ principal: s.work() }))).toEqual({ ok: { authorized: false } })
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
      } as SendDemand<unknown>),
    ).toEqual({ ok: { authorized: false } })
  })
})
