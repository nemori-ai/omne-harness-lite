import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import { domainCallerOf } from '../../../src/rows/tool-bindings/domain-caller.ts'
import {
  holdLiveCall,
  liveCallKey,
  liveCallOrigin,
  liveCalls,
} from '../../../src/rows/tool-bindings/live-calls.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const textOf = (tenant: TenantId) => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant text')
  return text.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const work = (
  tenant: TenantId,
  owner = SESSION_WORK_OWNER,
  component = SESSION_WORK_COMPONENT,
) => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component },
  tenant,
  work: { owner, work: 'session-1' },
})
const access = (principal: unknown = work(A)) => ({ principal, tenant: A, call: 'call-1' as never })
const scope = () => {
  const finished: string[] = []
  return {
    finished,
    scope: {
      context: {},
      limits: {},
      finish: async (exit: string) => {
        finished.push(exit)
        return { ok: undefined }
      },
    } as never,
  }
}
const newContext = () => ({ root: {} }) as unknown as Context

describe('a call held live while its scope is open', () => {
  const key = liveCallKey(textOf(A), 'call-1')

  it('is registered with its access until its scope finishes', async () => {
    const ctx = newContext()
    const { finished, scope: open } = scope()
    const held = holdLiveCall(ctx, access(), open)
    expect(liveCalls(ctx).get(key)).toEqual(access())
    await held.finish('returned')
    expect(finished).toEqual(['returned'])
    expect(liveCalls(ctx).has(key)).toBe(false)
  })

  it('leaves a later hold of the same call in place when an earlier one finishes', async () => {
    const ctx = newContext()
    const first = holdLiveCall(ctx, access(), scope().scope)
    holdLiveCall(ctx, access(), scope().scope)
    const later = liveCalls(ctx).get(key)
    await first.finish('returned')
    expect(liveCalls(ctx).get(key)).toBe(later)
  })
})

describe('where a live call runs', () => {
  it('names the agent as the domain caller names it, its session and the call', async () => {
    const ctx = newContext()
    holdLiveCall(ctx, access(), scope().scope)
    const verifier = {
      verify: async (principal: unknown) => ({ kind: 'verified', principal }),
    } as unknown as PrincipalVerifier
    const caller = await domainCallerOf(verifier, work(A), A)
    expect(liveCallOrigin(ctx)(textOf(A), 'call-1')).toEqual({
      actorRef: caller?.actorRef,
      session: 'session-1',
      call: 'call-1',
    })
    expect(caller?.actorRef).toMatch(/^principal\/1\//)
  })

  it('answers nothing for another tenant, another call, or once the scope finished', async () => {
    const ctx = newContext()
    const held = holdLiveCall(ctx, access(), scope().scope)
    const origin = liveCallOrigin(ctx)
    expect(origin(textOf(B), 'call-1')).toBeUndefined()
    expect(origin(textOf(A), 'call-2')).toBeUndefined()
    await held.finish('returned')
    expect(origin(textOf(A), 'call-1')).toBeUndefined()
  })

  it.each([
    ['a login principal', work(A, 'identity-login')],
    ['another component', work(A, SESSION_WORK_OWNER, 'other')],
    ['the work of another tenant', work(B)],
  ])('answers nothing when the live call is not session work: %s', (_, principal) => {
    const ctx = newContext()
    holdLiveCall(ctx, access(principal), scope().scope)
    expect(liveCallOrigin(ctx)(textOf(A), 'call-1')).toBeUndefined()
  })
})
