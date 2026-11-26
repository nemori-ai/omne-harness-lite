import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENT_RESULT_POLICY } from '@omne-harness/schedule-contract'
import {
  CALL,
  DEFINITION,
  FOR_NEW,
  ID,
  bound,
  committed,
  parse,
  rejected,
  run,
  scope,
  services,
  view,
} from './world.ts'

const pause = () => parse('pause', { schedule: ID, revision: 3 })

/** Runs one call against scripted writes; returns its text and what the services were asked. */
async function once(args: ReturnType<typeof parse>, writes: Parameters<typeof services>[0]) {
  const service = services(writes)
  const text = await run(args, scope(bound(service)))
  return { service, text }
}

describe('one call is one write the domain answers', () => {
  it('creates a schedule that takes effect, and names the session and the call that created it', async () => {
    const { text, service } = await once(parse('create', { definition: DEFINITION }), [
      committed(view('active')),
    ])
    expect(text).toMatch(/^done Schedules create\n/)
    expect(text).toContain(`"author":"agent session=session-1 call=${CALL}"`)
    expect(text).not.toContain('"basis"')
    expect(service.asked).toHaveLength(1)
    expect(service.asked[0]?.input.initial).toEqual({ kind: 'active' })
    expect(service.asked[0]?.input.meta).toEqual({
      operationKey: expect.stringMatching(/^tool:/),
      expectedRevision: null,
    })
    expect(service.asked[0]?.input.definition.binding).toEqual({ kind: 'followUserEnvironment' })
  })

  const agentWork = (session: unknown) => ({
    ...DEFINITION,
    purpose: {
      kind: 'execution',
      work: { kind: 'agent', instruction: { purpose: '写周报' }, session },
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'skip',
      misfire: null,
      notifications: [],
    },
  })
  const savedWork = (service: ReturnType<typeof services>, at = 0) => {
    const { input } = service.asked[at] ?? { input: {} }
    return (input.definition ?? input.successor).purpose.work
  }

  it('saves the session of the call where the definition says current, and what a new session leaves out as that session has it', async () => {
    const here = await once(
      parse('create', { definition: agentWork({ mode: 'existing', sessionRef: 'current' }) }),
      [committed(view('active'))],
    )
    expect(here.text).toMatch(/^done Schedules create\n/)
    expect(savedWork(here.service)).toEqual({
      kind: 'agent',
      instruction: { purpose: '写周报' },
      session: { mode: 'existing', sessionRef: 'session-1' },
      materials: [],
      returnTo: null,
      resultPolicy: DEFAULT_AGENT_RESULT_POLICY,
    })
    const fresh = await once(
      parse('draft', { definition: agentWork({ mode: 'new' }), reason: '先放着' }),
      [committed(view('draft'))],
    )
    expect(savedWork(fresh.service).session).toEqual({ mode: 'new', ...FOR_NEW })
  })

  it('completes the definition of a replacement and of a revised draft the same way', async () => {
    const definition = agentWork({ mode: 'existing', sessionRef: 'current' })
    for (const command of ['replace', 'revise'] as const) {
      const { service } = await once(
        parse(command, { schedule: ID, revision: 3, definition, reason: '换' }),
        [committed(view('active'))],
      )
      expect(savedWork(service).session).toEqual({ mode: 'existing', sessionRef: 'session-1' })
    }
  })

  it('writes nothing when the session of the call cannot be read and the definition leaves something of a new session out', async () => {
    const service = services([committed(view('active'))])
    const blind = bound(service, { newSessionDefaults: async () => undefined })
    const text = await run(
      parse('create', { definition: agentWork({ mode: 'new' }) }),
      scope(blind),
    )
    expect(text).toMatch(/^unavailable reason=the session of this call cannot be read now/)
    expect(service.asked).toEqual([])
    const read = { calls: 0 }
    const counting = bound(service, {
      newSessionDefaults: async () => {
        read.calls += 1
        return FOR_NEW
      },
    })
    await run(pause(), scope(counting))
    expect(read.calls).toBe(0)
  })

  it('saves a draft with its reason, which does not take effect', async () => {
    const { text, service } = await once(
      parse('draft', { definition: DEFINITION, reason: '等你看过再说' }),
      [committed(view('draft'))],
    )
    expect(text).toMatch(/^done Schedules draft\n/)
    expect(service.asked[0]?.input.initial).toEqual({ kind: 'draft', reason: '等你看过再说' })
  })

  it.each([
    ['revision_conflict', 'conflict'],
    ['forbidden', 'not_found'],
    ['invalid_transition', 'invalid'],
    ['capacity_exceeded', 'limited'],
    ['provider_failure', 'unavailable'],
  ])('answers %s as %s, one line, without asking anyone', async (code, kind) => {
    const { text, service } = await once(pause(), [rejected(code)])
    expect(text).toMatch(new RegExp(`^${kind} reason=`))
    expect(service.asked).toHaveLength(1)
  })

  it('completes an unknown write with its operation, to recover rather than resend', async () => {
    const { text } = await once(pause(), [
      { kind: 'unknown', operationRef: 'op-9' as never, retryAfterMs: 0 },
    ])
    expect(text).toMatch(/^unknown reason=.* operation=op-9$/)
  })

  it('answers unavailable without a write when the services are not attached', async () => {
    expect(await run(pause(), scope())).toMatch(/^unavailable reason=/)
  })

  it('refuses a context of another tenant before any write', async () => {
    const service = services([])
    const other = bound(service, {
      context: async () => ({ owner: { kind: 'tenant', tenantId: 'tenant/o/b' } }) as never,
    })
    expect(await run(pause(), scope(other))).toMatch(/^not_found reason=/)
    expect(service.asked).toEqual([])
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
    ['create', { definition: { ...DEFINITION, binding: { kind: 'explicit' } } }],
    ['create', { definition: DEFINITION, state: 'active' }],
    ['draft', { definition: DEFINITION }],
    ['pause', { schedule: 'not-an-id', revision: 1 }],
    ['update', { schedule: ID, revision: 1 }],
    ['update', { schedule: ID, revision: 1, label: 'a', instruction: { purpose: 'b' } }],
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

  it('reads without writing: preview names the calendar of each time; show and list name the author', async () => {
    const service = services([])
    const execution = scope(bound(service))
    expect(await run(parse('preview', { definition: DEFINITION, count: 3 }), execution)).toContain(
      '"calendar":"cn-legal-holidays"',
    )
    expect(await run(parse('show', { schedule: ID }), execution)).toMatch(
      /^done Schedules show\n.*"author":"agent session=session-1 call=/s,
    )
    expect(await run(parse('list', {}), execution)).toMatch(/^done Schedules list/)
    expect(
      await run(parse('recover', { operation: '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b' }), execution),
    ).toMatch(/^done Schedules recover/)
    expect(service.asked).toEqual([])
  })

  it('answers help with the menu, and refuses preview without exactly one source', async () => {
    const execution = scope(bound(services([])))
    expect(await run(parse('help', {}), execution)).toMatch(/^done Schedules help\n/)
    expect(await run(parse('preview', {}), execution)).toMatch(
      /^invalid reason=preview takes exactly one/,
    )
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

  it('keys each step of a call apart', () => {
    const one = bound(services([]))
    const other = bound(services([]), { call: 'call-2' })
    expect(one.operationKey('initial')).toMatch(/^tool:[0-9a-f]{48}$/)
    expect(one.operationKey('initial')).toBe(one.operationKey('initial'))
    expect(one.operationKey('again')).not.toBe(one.operationKey('initial'))
    expect(other.operationKey('initial')).not.toBe(one.operationKey('initial'))
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
      { schedule: ID, revision: 2, instruction: { purpose: '写周报' } },
      {
        action: 'update',
        patch: { kind: 'executionText', instruction: { purpose: '写周报' }, label: null },
      },
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
    const { service } = await once(parse(command, params), [committed(view())])
    expect(service.asked[0]?.input).toMatchObject({
      ...expected,
      scheduleId: ID,
      meta: { expectedRevision: 2 },
    })
    expect(service.asked[0]?.input.meta).not.toHaveProperty('consentRef')
  })

  it('refuses a definition the schedule refuses, before any write', async () => {
    const onceOnly = {
      ...DEFINITION,
      recurrence: { kind: 'once', localAt: '2026-12-01T09:00:00' },
      limits: { ...DEFINITION.limits, eligibleLimit: 3 },
    }
    const bad = await once(
      parse('revise', { schedule: ID, revision: 2, definition: onceOnly, reason: 'r' }),
      [],
    )
    expect(bad.text).toMatch(/^invalid reason=the definition does not form a schedule/)
    expect(bad.service.asked).toEqual([])
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
    expect(await run(parse('recover', { operation: OP }), scope(bound(service)))).toMatch(line)
    expect(service.asked).toEqual([])
  })
})
