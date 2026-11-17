import { writeJsonText } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { cardIdOf, scheduleConsentRef } from '@omne-harness/schedule-tools'
import {
  CALL,
  DEFINITION,
  ID,
  bound,
  committed,
  first,
  parse,
  rejected,
  scope,
  second,
  selected,
  services,
  view,
} from './world.ts'

const DIGEST = 'a'.repeat(64)
const CARD = cardIdOf(DIGEST)
const askConsent = rejected('consent_required', { consentDigest: DIGEST })
const createActive = () => parse('create', { definition: DEFINITION, state: 'active' })
const pause = () => parse('pause', { schedule: ID, revision: 3 })

/** Runs the first segment against scripted writes; returns the suspension and what was asked. */
async function suspend(args: ReturnType<typeof parse>, writes: Parameters<typeof services>[0]) {
  const service = services(writes)
  const execution = scope(bound(service))
  const segment = await first(args, execution)
  return { service, execution, segment }
}

describe('T2 initial: one write the domain answers', () => {
  it('completes a committed write with the consent it took effect on', async () => {
    const { segment, service } = await suspend(createActive(), [
      committed(
        view('active', {
          consentAdoption: { adoptionKind: 'blanket', generation: 4, grantRef: 'g' },
        }),
      ),
    ])
    expect(segment.kind).toBe('completed')
    expect(String(Reflect.get(segment, 'value'))).toContain('"basis":"blanket generation=4"')
    expect(service.asked[0]?.input.meta.consentRef).toBeNull()
    expect(service.asked[0]?.input.definition.binding).toEqual({ kind: 'followUserEnvironment' })
  })

  it('suspends on consent_required with one inquiry card and keeps the write, the digest and the card', async () => {
    const { segment } = await suspend(createActive(), [askConsent])
    expect(segment.kind).toBe('suspended')
    if (segment.kind !== 'suspended') throw new Error('suspended')
    expect(JSON.stringify(segment.wait.request)).toContain('"options"')
    const kept = JSON.parse(new TextDecoder().decode(segment.state))
    expect(kept).toMatchObject({ digest: DIGEST, cardId: CARD, args: { command: 'create' } })
    expect(segment.closedResult.startsWith('owner_skipped')).toBe(true)
  })

  it.each([
    ['revision_conflict', 'conflict'],
    ['forbidden', 'not_found'],
    ['invalid_transition', 'invalid'],
    ['capacity_exceeded', 'limited'],
    ['provider_failure', 'unavailable'],
  ])('completes %s as %s, one line', async (code, kind) => {
    const { segment } = await suspend(pause(), [rejected(code)])
    expect(segment).toMatchObject({ kind: 'completed' })
    expect(String(Reflect.get(segment, 'value'))).toMatch(new RegExp(`^${kind} reason=`))
  })

  it('completes an unknown write with its operation, to recover rather than resend', async () => {
    const { segment } = await suspend(pause(), [
      { kind: 'unknown', operationRef: 'op-9' as never, retryAfterMs: 0 },
    ])
    expect(String(Reflect.get(segment, 'value'))).toMatch(/^unknown reason=.* operation=op-9$/)
  })

  it('answers unavailable without a write when the services are not attached', async () => {
    const service = services([])
    const segment = await first(pause(), scope())
    expect(String(Reflect.get(segment, 'value'))).toMatch(/^unavailable reason=/)
    expect(service.asked).toEqual([])
  })

  it('refuses a context of another tenant before any write', async () => {
    const service = services([])
    const other = bound(service, {
      context: async () => ({ owner: { kind: 'tenant', tenantId: 'tenant/o/b' } }) as never,
    })
    const segment = await first(pause(), scope(other))
    expect(String(Reflect.get(segment, 'value'))).toMatch(/^not_found reason=/)
    expect(service.asked).toEqual([])
  })
})

describe('T2 resume: the owner answered the card', () => {
  async function answered(
    args: ReturnType<typeof parse>,
    decision: Parameters<typeof second>[1],
    after: Parameters<typeof services>[0],
  ) {
    const service = services([askConsent, ...after])
    const execution = scope(bound(service))
    const segment = await first(args, execution)
    if (segment.kind !== 'suspended') throw new Error('suspended')
    const result = await second(segment.state, decision, execution)
    return { result, asked: service.asked }
  }
  const text = (result: Awaited<ReturnType<typeof second>>) => String(Reflect.get(result, 'value'))

  it('resubmits a create with the answer as consent, under its own operation key', async () => {
    const { result, asked } = await answered(createActive(), selected(CARD, 'activate'), [
      committed(
        view('active', {
          consentAdoption: { adoptionKind: 'granular', grantRef: 'r', generation: 0 },
        }),
      ),
    ])
    expect(text(result)).toContain('"basis":"granular decision=r"')
    expect(asked[1]?.input.meta.consentRef).toBe(scheduleConsentRef(CALL, CARD))
    expect(asked[1]?.input.meta.operationKey).not.toBe(asked[0]?.input.meta.operationKey)
    expect(asked[1]?.input.initial).toEqual({ kind: 'active' })
  })

  it('creates a draft without consent when the owner keeps it as a draft', async () => {
    const { result, asked } = await answered(createActive(), selected(CARD, 'draft'), [
      committed(view('draft')),
    ])
    expect(text(result)).toMatch(/^done Schedules create/)
    expect(asked[1]?.input.meta.consentRef).toBeNull()
    expect(asked[1]?.input.initial).toMatchObject({ kind: 'draft' })
  })

  it('resubmits a change with the answer at the original revision', async () => {
    const { asked } = await answered(pause(), selected(CARD, 'approve'), [
      committed(view('paused')),
    ])
    expect(asked[1]?.input).toMatchObject({
      action: 'pause',
      meta: { expectedRevision: 3, consentRef: scheduleConsentRef(CALL, CARD) },
    })
  })

  it.each([
    ['declines a create', createActive, selected(CARD, 'none'), /^owner_declined/],
    ['declines a change', pause, selected(CARD, 'reject'), /^owner_declined/],
    [
      'picks a draft for a change, which is not on its card',
      pause,
      selected(CARD, 'draft'),
      /^owner_declined/,
    ],
    [
      'answers in words',
      pause,
      { kind: 'answer', value: { answers: [{ cardId: CARD, kind: 'text', text: '下周再说' }] } },
      /^owner_replied .*下周再说/,
    ],
    ['skips', pause, { kind: 'no-answer' }, /^owner_skipped/],
    ['declines to reply', pause, { kind: 'declined' }, /^owner_skipped/],
    [
      'answers another card',
      pause,
      selected('schedule-consent-other', 'approve'),
      /^owner_skipped/,
    ],
  ] as const)('writes nothing when the owner %s', async (_, args, decision, line) => {
    const { result, asked } = await answered(args(), decision as never, [])
    expect(text(result)).toMatch(line)
    expect(asked).toHaveLength(1)
  })

  it.each([
    ['the schedule moved on', rejected('revision_conflict'), /^card_stale/],
    [
      'the content changed',
      rejected('consent_required', { consentDigest: 'b'.repeat(64) }),
      /^card_stale/,
    ],
    ['the write is refused', rejected('forbidden'), /^not_found/],
    ['the services fail', rejected('provider_failure'), /^unavailable/],
  ])('does not raise a second card when %s after the answer', async (_, after, line) => {
    const { result, asked } = await answered(pause(), selected(CARD, 'approve'), [after])
    expect(result.kind).toBe('completed')
    expect(text(result)).toMatch(line)
    expect(asked).toHaveLength(2)
  })

  it('keeps the original result when the owner had already done it directly', async () => {
    const { result } = await answered(pause(), selected(CARD, 'approve'), [
      { ...committed(view('paused')), replayed: true } as never,
    ])
    expect(text(result)).toMatch(/^done Schedules pause/)
  })

  it('refuses a checkpoint it did not write', async () => {
    const execution = scope(bound(services([])))
    const answer = await (
      await import('@omne-harness/schedule-tools')
    ).schedulesExecutor.resume(
      {
        checkpoint: new TextEncoder().encode('{"args":{},"digest":"x","cardId":"y"}'),
        response: { kind: 'no-answer' },
      },
      null,
      { emit: () => undefined, signal: execution.context.signal } as never,
    )
    expect(answer).toMatchObject({ failure: { kind: 'invalid' } })
  })
})

describe('the Schedules declaration and reads', () => {
  it('fails a result past its bound instead of cutting it', async () => {
    const { createSchedulesAuthor } = await import('@omne-harness/schedule-tools')
    const { readJsonText } = await import('@omne-harness/json-text')
    const tree = (value: unknown) => {
      const read = readJsonText(JSON.stringify(value), {
        maxBytes: 1024,
        maxDepth: 4,
        maxItems: 8,
        maxMembers: 8,
        maxStringLength: 64,
        maxNumberLength: 16,
      })
      if (read.kind !== 'ok') throw new Error('tree')
      return read.value
    }
    expect(createSchedulesAuthor(tree({ resultMaxBytes: 8 }))).toHaveProperty('failure')
    expect(createSchedulesAuthor(tree({}))).toHaveProperty('failure')
    expect(createSchedulesAuthor(tree({ resultMaxBytes: 4096 }))).toHaveProperty('ok')
  })

  it.each([
    ['create', { definition: { ...DEFINITION, binding: { kind: 'explicit' } }, state: 'active' }],
    ['create', { definition: DEFINITION, state: 'later' }],
    ['pause', { schedule: 'not-an-id', revision: 1 }],
    ['update', { schedule: ID, revision: 1 }],
    ['update', { schedule: ID, revision: 1, label: 'a', instruction: 'b' }],
    ['list', { limit: 500 }],
  ])('refuses %s %j before any service is asked', async (command, params) => {
    const { schedulesParameterCodec } = await import('@omne-harness/schedule-tools')
    const text = JSON.stringify(params)
    expect(
      schedulesParameterCodec(command as never).parse({
        original: text,
        effective: text,
        complete: true,
      }),
    ).toHaveProperty('failure')
  })

  it('reads without writing: preview names the calendar of each time; show and list name the consent', async () => {
    const service = services([])
    const execution = scope(bound(service))
    const preview = await first(parse('preview', { definition: DEFINITION, count: 3 }), execution)
    expect(String(Reflect.get(preview, 'value'))).toContain('"calendar":"cn-legal-holidays"')
    const shown = await first(parse('show', { schedule: ID }), execution)
    expect(String(Reflect.get(shown, 'value'))).toMatch(
      /^done Schedules show\n.*"basis":"none"|"basis":"owner"/s,
    )
    const listed = await first(parse('list', {}), execution)
    expect(String(Reflect.get(listed, 'value'))).toMatch(/^done Schedules list/)
    const recovered = await first(
      parse('recover', { operation: '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b' }),
      execution,
    )
    expect(String(Reflect.get(recovered, 'value'))).toMatch(/^done Schedules recover/)
    expect(service.asked).toEqual([])
  })

  it('answers help with the menu, and refuses preview without exactly one source', async () => {
    const execution = scope(bound(services([])))
    expect(String(Reflect.get(await first(parse('help', {}), execution), 'value'))).toMatch(
      /^done Schedules help\n/,
    )
    expect(String(Reflect.get(await first(parse('preview', {}), execution), 'value'))).toMatch(
      /^invalid reason=preview takes exactly one/,
    )
  })
})

describe('what the owner reads on the card', () => {
  it.each([
    ['create', createActive, '新建', ['activate', 'draft', 'none']],
    ['pause', pause, '暂停', ['approve', 'reject']],
  ] as const)(
    'names the %s, the schedule, the next times and the session',
    async (_, args, verb, options) => {
      const { segment } = await suspend(args(), [askConsent])
      if (segment.kind !== 'suspended') throw new Error('suspended')
      const [card] = (JSON.parse(writeJsonText(segment.wait.request)) as { questions: any[] })
        .questions
      expect(card).toMatchObject({
        cardId: CARD,
        kind: 'question',
        title: `agent 想${verb}日程「${args === createActive ? '交月报' : '交月报'}」`,
        declineConsequence: '不做这次改动，日程保持原样。',
      })
      expect(card.description.split('\n')).toEqual([
        `agent 想${verb}日程「交月报」，需要你确认。`,
        '接下来几次：2026-11-30T17:00:00（cn-legal-holidays v1）',
        '来自会话 session-1。',
      ])
      expect(card.options.map((option: { id: string }) => option.id)).toEqual(options)
      expect(
        card.options.every(
          (option: { label: string; description: string }) => option.label && option.description,
        ),
      ).toBe(true)
    },
  )
})

describe('the checkpoint the call keeps', () => {
  const resumeWith = async (bytes: Uint8Array) => {
    const { schedulesExecutor } = await import('@omne-harness/schedule-tools')
    const execution = scope(bound(services([])))
    return schedulesExecutor.resume({ checkpoint: bytes, response: { kind: 'no-answer' } }, null, {
      emit: () => undefined,
      signal: execution.context.signal,
    } as never)
  }
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
  const good = {
    args: { command: 'pause', params: { schedule: ID, revision: 3 } },
    digest: DIGEST,
    cardId: CARD,
  }

  it('reads back the state it wrote', async () => {
    expect(await resumeWith(encode(good))).toMatchObject({ ok: { kind: 'completed' } })
  })

  it.each([
    ['bytes that are not UTF-8', new Uint8Array([0xff, 0xfe])],
    ['JSON that is not an object', encode(7)],
    ['null', encode(null)],
    ['no digest', encode({ ...good, digest: undefined })],
    ['no card', encode({ ...good, cardId: undefined })],
    ['a card of another digest', encode({ ...good, cardId: cardIdOf('b'.repeat(64)) })],
    [
      'a command the tool does not have',
      encode({ ...good, args: { command: 'delete', params: {} } }),
    ],
    ['no arguments', encode({ ...good, args: null })],
  ])('refuses %s', async (_, bytes) => {
    expect(await resumeWith(bytes)).toMatchObject({
      failure: { kind: 'invalid', reason: 'consent-state-unreadable' },
    })
  })
})

describe('binding one call', () => {
  it.each([
    ['no commands', { commands: () => undefined }, 'unavailable'],
    ['no queries', { queries: () => undefined }, 'unavailable'],
    ['no context', { context: async (): Promise<undefined> => undefined }, 'unavailable'],
    [
      'a context that throws',
      {
        context: async () => {
          throw new Error('down')
        },
      },
      'unavailable',
    ],
    [
      'a context of another tenant',
      { context: async () => ({ owner: { kind: 'tenant', tenantId: 'tenant/o/b' } }) },
      'forbidden',
    ],
    [
      'a context that is not a tenant',
      { context: async () => ({ owner: { kind: 'system' } }) },
      'forbidden',
    ],
  ] as const)('does not reach the services for %s', async (_, override, reason) => {
    expect(await bound(services([]), override as never).faces()).toEqual({
      kind: 'unreachable',
      reason,
    })
  })

  it('keys each step of a call apart and binds the consent reference to the call', () => {
    const one = bound(services([]))
    const other = bound(services([]), { call: 'call-2' })
    expect(one.operationKey('initial')).toMatch(/^tool:[0-9a-f]{48}$/)
    expect(one.operationKey('initial')).toBe(one.operationKey('initial'))
    expect(one.operationKey('confirmed')).not.toBe(one.operationKey('initial'))
    expect(other.operationKey('initial')).not.toBe(one.operationKey('initial'))
    expect(one.consentRef(CARD)).toMatch(new RegExp(`^tool-call/[0-9a-f]{48}/${CARD}$`))
    expect(other.consentRef(CARD)).not.toBe(one.consentRef(CARD))
    expect(one.now()).toBe('2026-11-17T00:00:00.000Z')
  })
})

describe('each human change as its domain command', () => {
  it.each([
    [
      'update',
      { schedule: ID, revision: 2, label: '新名字' },
      { action: 'update', patch: { kind: 'label', label: '新名字' } },
    ],
    [
      'update',
      { schedule: ID, revision: 2, instruction: '写周报' },
      { action: 'update', patch: { kind: 'executionText', instruction: '写周报', label: null } },
    ],
    [
      'revise',
      { schedule: ID, revision: 2, definition: DEFINITION, reason: '改时间' },
      { action: 'reviseDraft', reason: '改时间', definition: { label: '交月报' } },
    ],
    [
      'replace',
      { schedule: ID, revision: 2, definition: DEFINITION, reason: '换规则' },
      { action: 'replace', reason: '换规则', successor: { label: '交月报' } },
    ],
    [
      'stop',
      { schedule: ID, revision: 2, reason: '不需要了' },
      { action: 'stop', reason: '不需要了' },
    ],
  ] as const)('%s %j', async (command, params, expected) => {
    const { service } = await suspend(parse(command, params), [committed(view())])
    const asked = service.asked
    expect(asked[0]?.input).toMatchObject({
      ...expected,
      scheduleId: ID,
      meta: { expectedRevision: 2, consentRef: null },
    })
  })

  it('refuses a draft without a reason and a definition the schedule refuses, before any write', async () => {
    const draft = await suspend(parse('create', { definition: DEFINITION, state: 'draft' }), [])
    expect(String(Reflect.get(draft.segment, 'value'))).toMatch(
      /^invalid reason=a draft needs a reason/,
    )
    const once = {
      ...DEFINITION,
      recurrence: { kind: 'once', localAt: '2026-12-01T09:00:00' },
      limits: { ...DEFINITION.limits, eligibleLimit: 3 },
    }
    const bad = await suspend(
      parse('revise', { schedule: ID, revision: 2, definition: once, reason: 'r' }),
      [],
    )
    expect(String(Reflect.get(bad.segment, 'value'))).toMatch(
      /^invalid reason=the definition does not form a schedule/,
    )
    expect([...draft.service.asked, ...bad.service.asked]).toEqual([])
  })
})

describe('recover', () => {
  const OP = '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'
  it.each([
    [{ kind: 'ok', value: { kind: 'notCommitted' } }, /^not_committed reason=/],
    [
      {
        kind: 'ok',
        value: {
          kind: 'rejected',
          error: {
            code: 'revision_conflict',
            message: 'm',
            retryable: false,
            requestId: 'r',
            details: {},
          },
        },
      },
      /^conflict reason=/,
    ],
    [{ kind: 'ok', value: { kind: 'pending' } }, /^unknown reason=/],
    [
      {
        kind: 'error',
        error: {
          code: 'provider_failure',
          message: 'm',
          retryable: true,
          requestId: 'r',
          details: {},
        },
      },
      /^unavailable reason=/,
    ],
  ])('answers %j as one line, never sending the write again', async (answer, line) => {
    const service = services([])
    ;(service.commands as any).queryOperation = async () => answer
    const segment = await first(parse('recover', { operation: OP }), scope(bound(service)))
    expect(String(Reflect.get(segment, 'value'))).toMatch(line)
    expect(service.asked).toEqual([])
  })
})
