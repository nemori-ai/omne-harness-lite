import { describe, expect, it } from 'vitest'
import type { ManagementRequest, ScheduleRecord } from '@omne-harness/schedule'
import type { ScheduleCallContext, ScheduleInstant } from '@omne-harness/schedule-contract'
import {
  actorOf,
  createScheduleAuthorizers,
  ownedByAgent,
} from '../../../src/rows/schedule/authorizer.ts'
import type { CallOrigin } from '../../../src/rows/tool-bindings/live-calls.ts'

const now = '2026-11-17T00:00:00.000Z' as ScheduleInstant
const owner = { kind: 'tenant', tenantId: 'tenant-a', ownerId: 'acc-a' } as const
const context = (actor: 'human' | 'agent', session: string | null = 'session-1') =>
  ({
    principalRef: 'principal',
    owner,
    actor: { kind: actor, actorRef: actor === 'human' ? 'acc-a' : 'agent-1' },
    authContextRef: 'auth',
    requestId: 'request-1',
    originatingSessionRef: actor === 'human' ? null : session,
  }) as unknown as ScheduleCallContext
const create = (initial: 'active' | 'draft') =>
  ({
    kind: 'create',
    input: {
      definition: { label: 'monthly report' },
      initial: initial === 'active' ? { kind: 'active' } : { kind: 'draft', reason: 'later' },
      meta: { operationKey: 'k', expectedRevision: null },
    },
  }) as unknown as ManagementRequest
const LIVE: CallOrigin = { actorRef: 'agent-1', session: 'session-1', call: 'request-1' }

function reading(origin: CallOrigin | null = LIVE) {
  const asked: [string, string][] = []
  const live = createScheduleAuthorizers({
    origin: (tenant, call) => {
      asked.push([tenant, call])
      return origin ?? undefined
    },
    now: () => now,
  })
  return { live, asked }
}
const call = (
  live: ReturnType<typeof createScheduleAuthorizers>,
  given: ScheduleCallContext,
  request: ManagementRequest,
  current: ScheduleRecord | null = null,
) =>
  live.management.authorize({
    context: given,
    request,
    current,
    fingerprint: 'f'.repeat(64) as never,
  })

describe('the schedule management authorizer', () => {
  it('names the agent with the session and the call its live call runs in, found by the tenant and the call', async () => {
    const { live, asked } = reading()
    expect(await call(live, context('agent'), create('active'))).toMatchObject({
      kind: 'ok',
      value: {
        authority: {
          role: 'author',
          authorOnCreate: {
            kind: 'agent',
            actorRef: 'agent-1',
            originatingSessionRef: 'session-1',
            originatingCallRef: 'request-1',
          },
        },
      },
    })
    expect(asked).toEqual([['tenant-a', 'request-1']])
  })

  it('answers unavailable, to be retried, when the call of an agent is not live', async () => {
    const { live } = reading(null)
    for (const request of [create('active'), create('draft')])
      expect(await call(live, context('agent'), request)).toMatchObject({
        kind: 'unavailable',
        error: { code: 'authority_unavailable', retryable: true },
      })
  })

  it('lets the owner act as a human and reads no live call for it', async () => {
    const { live, asked } = reading()
    expect(await call(live, context('human'), create('active'))).toMatchObject({
      kind: 'ok',
      value: {
        authority: { role: 'owner', authorOnCreate: { kind: 'human', actorRef: 'acc-a' } },
      },
    })
    expect(asked).toEqual([])
  })

  it('lets an agent create a draft or a schedule in effect alike, with nothing about a release', async () => {
    const { live } = reading()
    for (const request of [create('draft'), create('active')]) {
      const answer = await call(live, context('agent'), request)
      expect(answer).toMatchObject({ kind: 'ok', value: { authority: { role: 'author' } } })
      expect(Object.keys(answer.kind === 'ok' ? answer.value : {})).toEqual([
        'authority',
        'currentStanding',
      ])
    }
  })

  it('refuses a context that is neither the owner nor an agent of a session', async () => {
    const { live } = reading()
    const read = await live.read.observe({ context: context('agent', null), action: 'list' })
    expect(read).toMatchObject({ kind: 'unavailable', error: { code: 'forbidden' } })
  })
})

describe('whose schedule an agent is acting on', () => {
  const written = (actorRef: string, session: string | null) =>
    ({
      view: {
        author:
          session === null
            ? { kind: 'human', actorRef }
            : {
                kind: 'agent',
                actorRef,
                originatingSessionRef: session,
                originatingCallRef: 'call-0',
              },
      },
    }) as unknown as ScheduleRecord
  it.each([
    ['a new schedule', null, true],
    ['its own schedule from the same session', written('agent-1', 'session-1'), true],
    ['its schedule from another session', written('agent-1', 'session-2'), false],
    ["another agent's schedule", written('agent-2', 'session-1'), false],
    ["the owner's schedule", written('acc-a', null), false],
  ])('%s is its own: %s', (_, current, expected) => {
    expect(ownedByAgent(context('agent'), current)).toBe(expected)
  })

  it.each([
    ['the owner', context('human'), 'owner'],
    ['an agent of a session', context('agent'), 'agent'],
    ['an agent outside any session', context('agent', null), 'other'],
    [
      'a human who is not the owner',
      { ...context('human'), actor: { kind: 'human', actorRef: 'acc-b' } } as ScheduleCallContext,
      'other',
    ],
    [
      'any caller on a non-tenant schedule',
      { ...context('human'), owner: { kind: 'system' } } as unknown as ScheduleCallContext,
      'other',
    ],
  ])('names %s as %s', (_, given, expected) => {
    expect(actorOf(given)).toBe(expected)
  })
})

describe('what the authorizer records and refuses', () => {
  const pause = {
    kind: 'execute',
    input: { action: 'pause', meta: {} },
  } as unknown as ManagementRequest
  const writtenBy = (actorRef: string) =>
    ({
      view: {
        control: 'active',
        author: {
          kind: 'agent',
          actorRef,
          originatingSessionRef: 'session-1',
          originatingCallRef: 'call-0',
        },
      },
    }) as unknown as ScheduleRecord

  it('records exactly who acts and its standing', async () => {
    const { live } = reading()
    expect(await call(live, context('agent'), create('active'))).toEqual({
      kind: 'ok',
      value: {
        authority: {
          scope: {
            owner,
            principalRef: 'principal',
            actor: { kind: 'agent', actorRef: 'agent-1' },
            originatingSessionRef: 'session-1',
          },
          authorOnCreate: {
            kind: 'agent',
            actorRef: 'agent-1',
            originatingSessionRef: 'session-1',
            originatingCallRef: 'request-1',
          },
          role: 'author',
          authorityVersion: 'harness-server.schedule/1',
          guardRef: 'harness-server.schedule/authority',
        },
        currentStanding: {
          kind: 'ready',
          generation: 1,
          reasons: [],
          authorityEvidence: [],
          since: now,
          observedAt: now,
        },
      },
    })
  })

  it('reads the live call only for an agent acting on what is its own', async () => {
    for (const [given, request, current, reads] of [
      [context('human'), create('active'), null, 0],
      [context('agent'), create('draft'), null, 1],
      [context('agent'), pause, writtenBy('agent-2'), 0],
      [context('agent'), pause, writtenBy('agent-1'), 1],
    ] as const) {
      const { live, asked } = reading()
      await call(live, given, request, current)
      expect(asked).toHaveLength(reads)
    }
  })

  it.each([
    [
      'a caller who is not the owner',
      { ...context('human'), actor: { kind: 'human', actorRef: 'acc-b' } },
      null,
    ],
    ['a system schedule', { ...context('human'), owner: { kind: 'system' } }, null],
    ["an agent changing another agent's schedule", context('agent'), writtenBy('agent-2')],
  ] as const)('refuses %s as forbidden, not to be retried', async (_, given, current) => {
    const { live } = reading()
    expect(await call(live, given as unknown as ScheduleCallContext, pause, current)).toMatchObject(
      {
        kind: 'unavailable',
        error: { code: 'forbidden', retryable: false, message: 'schedule authority: forbidden' },
      },
    )
  })

  it('recovers and reads only for the owner and the agents of its sessions', async () => {
    const { live } = reading()
    const stranger = {
      ...context('human'),
      actor: { kind: 'human', actorRef: 'acc-b' },
    } as ScheduleCallContext
    expect(await live.management.authorizeRecovery({ context: context('agent') } as never)).toEqual(
      {
        kind: 'ok',
        value: {
          owner,
          principalRef: 'principal',
          actor: { kind: 'agent', actorRef: 'agent-1' },
          originatingSessionRef: 'session-1',
        },
      },
    )
    expect(await live.management.authorizeRecovery({ context: stranger } as never)).toMatchObject({
      error: { code: 'forbidden' },
    })
    for (const read of [live.read.observe, live.read.confirm]) {
      expect(await read({ context: context('human') } as never)).toMatchObject({
        kind: 'ok',
        value: { owner, visibility: { kind: 'ownerAll' } },
      })
      expect(await read({ context: stranger } as never)).toMatchObject({
        error: { code: 'forbidden' },
      })
    }
  })
})
