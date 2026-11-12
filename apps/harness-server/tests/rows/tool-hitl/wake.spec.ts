// 答复之后的唤醒（`rows/tool-hitl/wake.ts` 与 `host.ts` 的 `withDecided`）：只有成为有效决定的答复才唤醒，来源是 Tool
// 调用时调度原调用；唤醒失败不改变答复的结果。HITL 应用与 Tool 实例宿主都是替身。真实组合里驱动还按执行器的重试
// 周期读决定，所以发行树的端到端测试看不出唤醒是否发生，由这里核对。
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type { HitlApplication } from '../../../src/rows/tool-hitl/host.ts'
import { withDecided } from '../../../src/rows/tool-hitl/host.ts'
import { wakeOnDecision } from '../../../src/rows/tool-hitl/wake.ts'

const tenant = testingTenant(`org_${'1'.repeat(26)}`, `acc_${'2'.repeat(26)}`)
const access = { kind: 'acting-for-tenant', tenant } as unknown as ActingForTenantPrincipal
const cardRef = { request: { tenantRef: 't', requestId: 'request-1' }, cardId: 'q1' }
const command = { cardRef } as never

function application(
  options: Readonly<{ reply?: unknown; origin?: Record<string, unknown> }> = {},
) {
  const reads: unknown[] = []
  const app = {
    submitReply: async () => options.reply ?? { kind: 'decided' },
    getRequest: async (_access: unknown, query: unknown) => {
      reads.push(query)
      return {
        kind: 'found',
        request: {
          origin: options.origin ?? { kind: 'tool', originRef: 'call-1', toolCallRef: 'call-1' },
        },
      }
    },
  } as unknown as HitlApplication
  return { app, reads }
}

function instanceHost(fail = false) {
  const scheduled: unknown[] = []
  return {
    scheduled,
    host: () =>
      ({
        schedule: async (input: unknown) => {
          scheduled.push(input)
          if (fail) throw new Error('the host is gone')
          return { ok: { queued: true } }
        },
      }) as never,
  }
}

/** Lets the detached wake-up run. */
const settle = () => sleep(10)

describe('the wake-up after a reply', () => {
  it('a decided reply to a card of a Tool call schedules that call in the tenant of the person', async () => {
    const { app, reads } = application()
    const { host, scheduled } = instanceHost()
    const wrapped = withDecided(app, wakeOnDecision(host))
    expect(await wrapped.submitReply(access, command)).toEqual({ kind: 'decided' })
    await settle()
    expect(reads).toEqual([{ protocol: 'hitl/1', requestRef: cardRef.request }])
    expect(scheduled).toEqual([{ tenant, call: 'call-1' }])
  })

  it.each([
    [{ kind: 'already-decided' }],
    [{ kind: 'invalidated', reason: 'cancelled' }],
    [{ kind: 'unknown' }],
    [{ kind: 'denied', reason: 'card' }],
  ])('a reply that answered %o wakes nothing', async reply => {
    const { app, reads } = application({ reply })
    const { host, scheduled } = instanceHost()
    expect(await withDecided(app, wakeOnDecision(host)).submitReply(access, command)).toEqual(reply)
    await settle()
    expect([reads, scheduled]).toEqual([[], []])
  })

  it('a card from another origin wakes no Tool call', async () => {
    const { app } = application({ origin: { kind: 'independent', originRef: 'work-1' } })
    const { host, scheduled } = instanceHost()
    await withDecided(app, wakeOnDecision(host)).submitReply(access, command)
    await settle()
    expect(scheduled).toEqual([])
  })

  it('a host that throws does not change the answer of the reply', async () => {
    const { app } = application()
    const { host, scheduled } = instanceHost(true)
    expect(await withDecided(app, wakeOnDecision(host)).submitReply(access, command)).toEqual({
      kind: 'decided',
    })
    await settle()
    expect(scheduled).toHaveLength(1)
  })

  it('a wake-up hook that throws does not change the answer of the reply', async () => {
    const { app } = application()
    const wrapped = withDecided(app, () => {
      throw new Error('the hook exploded')
    })
    expect(await wrapped.submitReply(access, command)).toEqual({ kind: 'decided' })
  })
})
