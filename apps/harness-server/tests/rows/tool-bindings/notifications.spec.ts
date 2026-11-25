import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { notificationsOf } from '@omne-harness/notification-tools'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import { bindReleaseNotifications } from '../../../src/rows/tool-bindings/notifications.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'
import { StubService } from '../../../src/s0/stub-plugin.ts'
import { holdRunTime, hostTime } from '../../../src/entry/time.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const textOf = (tenant: TenantId) => (tenantCodec.encode(tenant) as { value: string }).value
const work = (tenant: TenantId, session = 'session-1') => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner: SESSION_WORK_OWNER, work: session },
})
const SERVICES = [
  'notificationSending',
  'notificationInbox',
  'notificationSubscriptions',
  'notificationCatalog',
] as const

/** A tree where the given services stand and the verifier answers as told. */
async function world(services: readonly string[] = SERVICES) {
  const root = new Context()
  holdRunTime(root, hostTime())
  for (const name of services)
    await root.plugin({
      name,
      apply: (ctx: Context) => void new StubService(ctx, name as never, 'notification', {}),
    })
  const state = { verified: work(A) as unknown }
  toolRuntimeHolder(root).verifier = () =>
    ({
      async verify() {
        return state.verified === null
          ? { kind: 'rejected' }
          : { kind: 'verified', principal: state.verified }
      },
    }) as unknown as PrincipalVerifier
  const finished: unknown[] = []
  const scope = {
    context: { signal: new AbortController().signal },
    limits: {},
    finish: async (exit: unknown) => void finished.push(exit),
  } as unknown as ToolExecutionScope
  const bind = (tenant: TenantId = A) =>
    bindReleaseNotifications(
      root,
      { principal: work(tenant), tenant, call: 'call-1', request: {} } as never,
      scope,
    )
  return { root, state, scope, bind, finished }
}

describe('the Notifications binding of the release', () => {
  it('reaches the services as the agent of the verified session, posting as agent.posts at depth 0', async () => {
    const w = await world()
    const bound = notificationsOf(w.bind().context)
    expect(bound?.posts).toEqual({ source: 'agent.posts', type: 'post' })
    expect(bound?.causalDepth()).toBe(0)
    expect(bound?.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    const reached = await bound?.reach()
    expect(Object.keys((reached as { faces: object }).faces).sort()).toEqual([
      'catalog',
      'inbox',
      'sending',
      'subscriptions',
    ])
    expect(reached).toMatchObject({
      context: {
        tenant: textOf(A),
        actor: { kind: 'agent', recipient: { kind: 'agent', ref: 'session-1' } },
      },
      self: { kind: 'agent', ref: 'session-1' },
    })
  })

  it('takes the agent from the verified principal of each call, never a kept one', async () => {
    const w = await world()
    const bound = notificationsOf(w.bind().context)
    w.state.verified = work(A, 'session-2')
    expect(await bound?.reach()).toMatchObject({ self: { ref: 'session-2' } })
    w.state.verified = null
    expect(await bound?.reach()).toEqual({ unreachable: 'unavailable' })
  })

  it.each(SERVICES)('is unavailable while %s is not there', async missing => {
    const w = await world(SERVICES.filter(name => name !== missing))
    expect(await notificationsOf(w.bind().context)?.reach()).toEqual({
      unreachable: 'unavailable',
    })
  })

  it('is unavailable for a principal that works for another tenant than the call', async () => {
    const w = await world()
    w.state.verified = work(B)
    expect(await notificationsOf(w.bind(A).context)?.reach()).toEqual({
      unreachable: 'unavailable',
    })
  })

  it('withdraws what it attached when the call finishes, and finishes the scope it wrapped once', async () => {
    const w = await world()
    const attached = w.bind()
    await attached.finish({ kind: 'done' } as never)
    await attached.finish({ kind: 'done' } as never)
    expect(notificationsOf(attached.context)).toBeUndefined()
    expect(w.finished).toHaveLength(1)
  })
})
