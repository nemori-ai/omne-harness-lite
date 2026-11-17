import { describe, expect, it } from 'vitest'
import type { ManagementRequest, ScheduleRecord } from '@omne-harness/schedule'
import type { ScheduleCallContext, ScheduleInstant } from '@omne-harness/schedule-contract'
import {
  BLANKET_GRANT,
  actorOf,
  commandOf,
  consentDigest,
  createScheduleAuthorizers,
  subjectOf,
  type ConsentAnswer,
} from '../../../src/rows/schedule/authorizer.ts'
import type { ConsentMode } from '../../../src/rows/schedule/consent.ts'

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
const create = (initial: 'active' | 'draft', consentRef: string | null = null) =>
  ({
    kind: 'create',
    input: {
      definition: { label: 'monthly report' },
      initial: initial === 'active' ? { kind: 'active' } : { kind: 'draft', reason: 'later' },
      meta: { operationKey: 'k', expectedRevision: null, consentRef },
    },
  }) as unknown as ManagementRequest

function authorizers(mode: ConsentMode, answer?: ConsentAnswer | null) {
  return createScheduleAuthorizers({
    mode: async () => mode,
    answer: async () => answer,
    now: () => now,
  })
}
const authorize = (
  mode: ConsentMode,
  request: ManagementRequest,
  actor: 'human' | 'agent' = 'agent',
  answer?: ConsentAnswer | null,
) =>
  authorizers(mode, answer).management.authorize({
    context: context(actor),
    request,
    current: null,
    fingerprint: 'f'.repeat(64) as never,
  })

describe('the schedule management authorizer', () => {
  it('adopts the standing consent with the setting revision as its generation', async () => {
    expect(await authorize({ kind: 'auto', generation: 4 }, create('active'))).toMatchObject({
      kind: 'ok',
      value: {
        authority: {
          role: 'author',
          authorOnCreate: { kind: 'agent', originatingSessionRef: 'session-1' },
        },
        consent: {
          kind: 'adopt',
          adoption: {
            grantRef: BLANKET_GRANT,
            generation: 4,
            adoptionKind: 'blanket',
            scope: 'standing',
          },
        },
      },
    })
  })

  it('asks for the owner with the content digest while the owner asks for drafts', async () => {
    const request = create('active')
    expect(await authorize({ kind: 'draft' }, request)).toMatchObject({
      kind: 'unavailable',
      error: { code: 'consent_required', details: { consentDigest: consentDigest(request) } },
    })
  })

  it('adopts the owner answer that confirms the same content', async () => {
    const request = create('active', 'decision-r')
    const answer = { fromOwner: true, approved: true, digest: consentDigest(request) }
    expect(await authorize({ kind: 'draft' }, request, 'agent', answer)).toMatchObject({
      kind: 'ok',
      value: {
        consent: { kind: 'adopt', adoption: { grantRef: 'decision-r', adoptionKind: 'granular' } },
      },
    })
  })

  it.each([
    ['a forged decision', null],
    ['an answer from the session that raised the card', { fromOwner: false, approved: true }],
    ['an answer that declined', { fromOwner: true, approved: false }],
    ['an answer for other content', { fromOwner: true, approved: true, digest: 'other' }],
  ])('asks again for %s', async (_label, given) => {
    const request = create('active', 'decision-r')
    const answer = given === null ? null : { digest: consentDigest(request), ...given }
    expect(await authorize({ kind: 'draft' }, request, 'agent', answer)).toMatchObject({
      kind: 'unavailable',
      error: { code: 'consent_required' },
    })
  })

  it('answers unavailable when the setting or the answer cannot be read', async () => {
    expect(await authorize({ kind: 'unreadable' }, create('active'))).toMatchObject({
      error: { code: 'authority_unavailable', retryable: true },
    })
    expect(
      await authorize({ kind: 'draft' }, create('active', 'decision-r'), 'agent', undefined),
    ).toMatchObject({
      error: { code: 'authority_unavailable' },
    })
  })

  it('lets the owner act and an agent keep drafts without consent', async () => {
    expect(await authorize({ kind: 'draft' }, create('active'), 'human')).toMatchObject({
      kind: 'ok',
      value: { authority: { role: 'owner' }, consent: { kind: 'notRequired' } },
    })
    expect(await authorize({ kind: 'draft' }, create('draft'))).toMatchObject({
      kind: 'ok',
      value: { consent: { kind: 'notRequired' } },
    })
  })

  it('reads the setting at the decision only: a later change does not reach the adopted consent', async () => {
    let mode: ConsentMode = { kind: 'auto', generation: 1 }
    const live = createScheduleAuthorizers({
      mode: async () => mode,
      answer: async () => undefined,
      now: () => now,
    })
    const first = await live.management.authorize({
      context: context('agent'),
      request: create('active'),
      current: null,
      fingerprint: 'f'.repeat(64) as never,
    })
    mode = { kind: 'draft' }
    expect(first).toMatchObject({ kind: 'ok', value: { consent: { adoption: { generation: 1 } } } })
  })

  it('refuses a context that is neither the owner nor an agent of a session', async () => {
    const stranger = { ...context('agent', null) }
    const read = await authorizers({ kind: 'draft' }).read.observe({
      context: stranger,
      action: 'list',
    })
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
  const reading = (mode: ConsentMode = { kind: 'auto', generation: 2 }) => {
    const asked = { mode: 0 }
    const live = createScheduleAuthorizers({
      mode: async () => {
        asked.mode += 1
        return mode
      },
      answer: async () => undefined,
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
  const pause = {
    kind: 'execute',
    input: { action: 'pause', meta: { consentRef: null } },
  } as unknown as ManagementRequest
  const writtenBy = (actorRef: string) =>
    ({
      view: {
        control: 'active',
        author: { kind: 'agent', actorRef, originatingSessionRef: 'session-1' },
      },
    }) as unknown as ScheduleRecord

  it('records exactly what a standing consent and an owner answer adopt', async () => {
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
            grantRef: BLANKET_GRANT,
            generation: 2,
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
    const request = create('active', 'decision-r')
    const answered = await authorize({ kind: 'draft' }, request, 'agent', {
      fromOwner: true,
      approved: true,
      digest: consentDigest(request),
    })
    expect(answered).toMatchObject({
      value: {
        consent: {
          adoption: {
            grantRef: 'decision-r',
            generation: 0,
            adoptionKind: 'granular',
            scope: 'session',
            adoptedAt: now,
          },
        },
      },
    })
    expect(await call(live, context('human'), create('active'))).toMatchObject({
      value: { authority: { authorOnCreate: { kind: 'human', actorRef: 'acc-a' } } },
    })
  })

  it('reads the setting only for an agent bringing its own schedule into effect', async () => {
    for (const [given, request, current, reads] of [
      [context('human'), create('active'), null, 0],
      [context('agent'), create('draft'), null, 0],
      [context('agent'), pause, writtenBy('agent-2'), 0],
      [context('agent'), pause, writtenBy('agent-1'), 1],
    ] as const) {
      const { live, asked } = reading()
      await call(live, given, request, current)
      expect(asked.mode).toBe(reads)
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

  it('digests the content the owner confirms, without the operation key and the answer it names', () => {
    const plain = consentDigest(create('active'))
    expect(plain).toMatch(/^[0-9a-f]{64}$/)
    expect(consentDigest(create('active', 'decision-r'))).toBe(plain)
    expect(consentDigest(create('draft'))).not.toBe(plain)
  })
})

describe('what needs consent, beyond the table', () => {
  const execute = (action: string) =>
    ({ kind: 'execute', input: { action, meta: {} } }) as unknown as ManagementRequest
  it('keeps discarding a draft local, and needs consent to update a schedule it cannot see', () => {
    expect(
      commandOf(execute('discard'), { view: { control: 'active' } } as unknown as ScheduleRecord),
    ).toBe('draftLocal')
    expect(commandOf(execute('update'), null)).toBe('consent')
  })
})
