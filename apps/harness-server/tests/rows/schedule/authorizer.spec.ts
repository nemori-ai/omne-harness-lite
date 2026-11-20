import { describe, expect, it } from 'vitest'
import type { ManagementRequest, ScheduleRecord } from '@omne-harness/schedule'
import type { ScheduleCallContext, ScheduleInstant } from '@omne-harness/schedule-contract'
import {
  actorOf,
  commandOf,
  createScheduleAuthorizers,
  subjectOf,
} from '../../../src/rows/schedule/authorizer.ts'
import type { CallConsent } from '../../../src/rows/tool-bindings/call-consent.ts'

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
const STANDING: CallConsent = {
  kind: 'consented',
  basis: { kind: 'blanket', scope: 'standing', grant: '{"via":"verdict"}' },
}

function reading(answer: CallConsent | Error = STANDING) {
  const asked: [string, string][] = []
  const live = createScheduleAuthorizers({
    consent: async (tenant, call) => {
      asked.push([tenant, call])
      if (answer instanceof Error) throw answer
      return answer
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
  it('asks what the call was released on, by the tenant and the call', async () => {
    const { live, asked } = reading()
    await call(live, context('agent'), create('active'))
    expect(asked).toEqual([['tenant-a', 'request-1']])
  })

  it.each([
    ['a blanket consent of the tenant', 'blanket', 'standing'],
    ['a blanket consent of the session', 'blanket', 'session'],
    ['one release by the owner', 'granular', 'session'],
  ] as const)('adopts %s, with the grant as its reference', async (_, kind, scope) => {
    const grant = `{"via":"${kind}-${scope}"}`
    const { live } = reading({ kind: 'consented', basis: { kind, scope, grant } })
    expect(await call(live, context('agent'), create('active'))).toMatchObject({
      kind: 'ok',
      value: {
        consent: {
          kind: 'adopt',
          adoption: { grantRef: grant, adoptionKind: kind, scope, adoptedAt: now },
        },
      },
    })
  })

  it('refuses a change in effect that the call was not released for', async () => {
    const { live } = reading({ kind: 'none' })
    expect(await call(live, context('agent'), create('active'))).toMatchObject({
      kind: 'unavailable',
      error: { code: 'consent_required', retryable: false },
    })
  })

  it.each([
    ['the release cannot be read', { kind: 'unavailable' } as const],
    ['the port throws', new Error('down')],
  ])('answers unavailable when %s', async (_, answer) => {
    const { live } = reading(answer)
    expect(await call(live, context('agent'), create('active'))).toMatchObject({
      kind: 'unavailable',
      error: { code: 'authority_unavailable', retryable: true },
    })
  })

  it('lets the owner act and an agent keep drafts without consent, and reads no release for them', async () => {
    const { live, asked } = reading({ kind: 'none' })
    expect(await call(live, context('human'), create('active'))).toMatchObject({
      kind: 'ok',
      value: { authority: { role: 'owner' }, consent: { kind: 'notRequired' } },
    })
    expect(await call(live, context('agent'), create('draft'))).toMatchObject({
      kind: 'ok',
      value: { consent: { kind: 'notRequired' } },
    })
    expect(asked).toEqual([])
  })

  it('refuses a context that is neither the owner nor an agent of a session', async () => {
    const { live } = reading()
    const read = await live.read.observe({ context: context('agent', null), action: 'list' })
    expect(read).toMatchObject({ kind: 'unavailable', error: { code: 'forbidden' } })
  })
})

describe('what needs consent', () => {
  const current = (control: string) => ({ view: { control } }) as unknown as ScheduleRecord
  const execute = (action: string) =>
    ({ kind: 'execute', input: { action, meta: {} } }) as unknown as ManagementRequest
  it.each([
    ['reviseDraft', 'draft', 'draftLocal'],
    ['discard', 'draft', 'draftLocal'],
    ['update', 'draft', 'draftLocal'],
    ['update', 'active', 'consent'],
    ['promote', 'draft', 'consent'],
    ['pause', 'active', 'consent'],
    ['resume', 'paused', 'consent'],
    ['stop', 'active', 'consent'],
    ['replace', 'active', 'consent'],
  ])('%s on a %s schedule is %s', (action, control, expected) => {
    expect(commandOf(execute(action), current(control))).toBe(expected)
  })

  it('keeps discarding a draft local, and needs consent to update a schedule it cannot see', () => {
    expect(commandOf(execute('discard'), current('active'))).toBe('draftLocal')
    expect(commandOf(execute('update'), null)).toBe('consent')
  })
})

describe('whose schedule an agent is acting on', () => {
  const written = (actorRef: string, session: string | null) =>
    ({
      view: {
        author:
          session === null
            ? { kind: 'human', actorRef }
            : { kind: 'agent', actorRef, originatingSessionRef: session },
      },
    }) as unknown as ScheduleRecord
  it.each([
    ['a new schedule', null, 'new'],
    ['its own schedule from the same session', written('agent-1', 'session-1'), 'agentOwn'],
    ['its schedule from another session', written('agent-1', 'session-2'), 'others'],
    ["another agent's schedule", written('agent-2', 'session-1'), 'others'],
    ["the owner's schedule", written('acc-a', null), 'others'],
  ])('%s is %s', (_, current, expected) => {
    expect(subjectOf(context('agent'), current)).toBe(expected)
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
        author: { kind: 'agent', actorRef, originatingSessionRef: 'session-1' },
      },
    }) as unknown as ScheduleRecord

  it('records exactly what a consent adopts', async () => {
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
          },
          role: 'author',
          authorityVersion: 'harness-server.schedule/1',
          guardRef: 'harness-server.schedule/authority',
        },
        consent: {
          kind: 'adopt',
          guardRef: 'harness-server.schedule/consent',
          adoption: {
            grantRef: '{"via":"verdict"}',
            adoptionKind: 'blanket',
            scope: 'standing',
            adoptedAt: now,
          },
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
    expect(await call(live, context('human'), create('active'))).toMatchObject({
      value: { authority: { authorOnCreate: { kind: 'human', actorRef: 'acc-a' } } },
    })
  })

  it('reads the release only for an agent bringing its own schedule into effect', async () => {
    for (const [given, request, current, reads] of [
      [context('human'), create('active'), null, 0],
      [context('agent'), create('draft'), null, 0],
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
        error: { code: 'forbidden', retryable: false, message: 'schedule consent: forbidden' },
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
