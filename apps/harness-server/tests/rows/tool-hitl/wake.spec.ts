import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
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
  options: Readonly<{
    reply?: unknown
    origin?: Record<string, unknown>
    readFails?: boolean
  }> = {},
) {
  const reads: unknown[] = []
  const app = {
    submitReply: async () => options.reply ?? { kind: 'decided' },
    getRequest: async (_access: unknown, query: unknown) => {
      reads.push(query)
      if (options.readFails) throw new Error('the request source is down')
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

  it('says which step did not get done when the request source cannot be read, and the reply stays', async () => {
    const { app } = application({ readFails: true })
    const { host, scheduled } = instanceHost()
    const warn = vi.fn()
    expect(await withDecided(app, wakeOnDecision(host, warn)).submitReply(access, command)).toEqual(
      {
        kind: 'decided',
      },
    )
    await settle()
    expect(scheduled).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('reading the request')
    expect(warn.mock.calls[0]?.[0]).toContain('the request source is down')
  })

  it('says so when the call could not be scheduled, whether the host throws or is not there', async () => {
    const { app } = application()
    const throwing = vi.fn()
    await withDecided(app, wakeOnDecision(instanceHost(true).host, throwing)).submitReply(
      access,
      command,
    )
    const absent = vi.fn()
    await withDecided(
      app,
      wakeOnDecision(() => undefined, absent),
    ).submitReply(access, command)
    await settle()
    expect(throwing).toHaveBeenCalledTimes(1)
    expect(throwing.mock.calls[0]?.[0]).toContain('scheduling the call')
    expect(throwing.mock.calls[0]?.[0]).toContain('the host is gone')
    expect(absent).toHaveBeenCalledTimes(1)
    expect(absent.mock.calls[0]?.[0]).toContain('no Tool instance host')
  })

  it('a wake-up hook that throws does not change the answer of the reply', async () => {
    const { app } = application()
    const wrapped = withDecided(app, () => {
      throw new Error('the hook exploded')
    })
    expect(await wrapped.submitReply(access, command)).toEqual({ kind: 'decided' })
  })
})
