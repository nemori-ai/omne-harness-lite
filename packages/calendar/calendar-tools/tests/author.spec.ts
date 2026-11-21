import { describe, expect, it, vi } from 'vitest'
import type {
  CalendarAnswer,
  CalendarCalculator,
  CalendarCallContext,
  CalendarQuestion,
} from '@omne-harness/calendar-contract'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readJsonText } from '@omne-harness/json-text'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { writeJsonText } from '@omne-harness/json-text'
import {
  attachCalendar,
  bindCalendar,
  calendarContract,
  calendarOf,
  calendarToolModule,
  createCalendarAuthor,
  type BoundCalendar,
} from '@omne-harness/calendar-tools'

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}
const basis = {
  calendarId: 'cn-legal-holidays',
  versionId: 'v-2026-11-06',
  coverageStart: '2025-01-01',
  coverageEnd: '2027-12-31',
}
const workday = {
  kind: 'ok',
  value: {
    ...basis,
    result: {
      kind: 'day',
      value: { kind: 'ok', value: { classification: 'workingDay', working: true } },
    },
  },
} as unknown as CalendarAnswer
const refused = (code: string, details = {}): CalendarAnswer =>
  ({
    kind: 'error',
    error: { code, message: code, retryable: false, requestId: 'r', details },
  }) as CalendarAnswer

function fixture(maximum = 65536) {
  const created = createCalendarAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const registration = readToolRegistration(created.ok)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operations = registration.operations
  const definition = deriveDefinition(
    {
      asset: { name: 'Calendar', adoption: calendarToolModule.executor },
      requiredCapabilities: [],
    },
    created.ok.facts,
  )
  function decode(command: string, params: unknown) {
    const operation = operations.find(([name]) => name === command)?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    return {
      operation: operation.author,
      parsed: 'failure' in cut ? cut : operation.author.parameters.parse(cut.ok),
    }
  }
  async function run(command: string, params: unknown, calendar?: BoundCalendar) {
    const { operation, parsed } = decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = calendar === undefined ? scope() : attachCalendar(scope(), calendar)
    const result = await executeTool(parsed.ok, operation.executor, null, execution)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    const checked = operation.output.check({ arguments: parsed.ok, value: result.ok })
    if ('failure' in checked) throw new Error(JSON.stringify(checked.failure))
    return String(checked.ok)
  }
  return { definition, decode, run }
}
const answering = (answer: CalendarAnswer) => {
  const asked = vi.fn(async () => answer)
  return { calendar: { answer: asked } satisfies BoundCalendar, asked }
}

describe('the Calendar declaration', () => {
  it('is one wrapped declaration with help and five date questions, without a calendar or version field', async () => {
    const test = fixture()
    expect(judgeToolDefinition(test.definition)).toHaveProperty('ok')
    if (test.definition.kind !== 'commands') throw new Error('commands')
    expect(test.definition.encoding).toBe('wrapped')
    expect(test.definition.commands.map(item => item.name)).toEqual([
      'help',
      'day',
      'count',
      'shift',
      'next',
      'nth',
    ])
    const declared = JSON.stringify(test.definition)
    for (const field of ['calendarId', 'calendar_id', 'version', 'selection', 'tenant'])
      expect(declared).not.toContain(`"${field}"`)
    expect(await test.run('help', {})).toBe(`done Calendar help\n${commandGuide(test.definition)}`)
    expect(await test.run('help', { name: 'nth' })).toContain(
      'Usage: Calendar {"command": "nth", "params": {period_start, period_end, ordinal}}',
    )
  })

  it.each([
    ['day', { date: '2026-10-10', calendar: 'jp-legal-holidays' }],
    ['day', { date: '2026/10/10' }],
    ['day', {}],
    ['count', { from: '2026-10-09', to: '2026-09-28' }],
    ['shift', { date: '2026-10-10', offset: 1.5 }],
    ['next', { after: '2026-10-10', count: 367 }],
    ['nth', { period_start: '2026-10-01', period_end: '2026-10-31', ordinal: 0 }],
    ['help', { name: 'resolve' }],
  ])('refuses %s %j before any calendar is asked', (command, params) => {
    expect(fixture().decode(command, params).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: expect.any(String) },
    })
  })

  it('publishes each command contract the parser enforces', () => {
    const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    expect(JSON.parse(writeJsonText(calendarContract('day').schema))).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { date },
      required: ['date'],
    })
    expect(JSON.parse(writeJsonText(calendarContract('next').schema))).toMatchObject({
      properties: { after: date, count: { type: 'integer', minimum: 1, maximum: 366 } },
      required: ['after', 'count'],
    })
    expect(JSON.parse(writeJsonText(calendarContract('nth').schema))).toMatchObject({
      properties: {
        period_start: date,
        period_end: date,
        ordinal: { oneOf: [{ type: 'integer', minimum: 1 }, { const: 'last' }] },
      },
      required: ['period_start', 'period_end', 'ordinal'],
    })
    expect(JSON.parse(writeJsonText(calendarContract('shift').schema))).toMatchObject({
      properties: { date, offset: { type: 'integer' } },
      required: ['date', 'offset'],
    })
    expect(JSON.parse(writeJsonText(calendarContract('count').schema))).toMatchObject({
      required: ['from', 'to'],
    })
    for (const name of ['day', 'count', 'shift', 'next', 'nth'] as const)
      expect(calendarContract(name).descriptions.length).toBeGreaterThan(0)
  })

  it('refuses a construction other than a result bound', () => {
    for (const construction of [{}, { resultMaxBytes: 4 }, { resultMaxBytes: 1024, extra: 1 }])
      expect(createCalendarAuthor(json(construction))).toHaveProperty('failure')
  })
})

describe('the Calendar answers', () => {
  it.each([
    ['day', { date: '2026-10-10' }, { kind: 'day', date: '2026-10-10' }],
    [
      'count',
      { from: '2026-09-28', to: '2026-10-09' },
      { kind: 'count', from: '2026-09-28', to: '2026-10-09' },
    ],
    [
      'shift',
      { date: '2026-09-30', offset: -2 },
      { kind: 'shift', date: '2026-09-30', offset: -2 },
    ],
    ['next', { after: '2026-09-30', count: 3 }, { kind: 'next', after: '2026-09-30', count: 3 }],
    [
      'nth',
      { period_start: '2026-10-01', period_end: '2026-10-31', ordinal: 'last' },
      { kind: 'nth', periodStart: '2026-10-01', periodEnd: '2026-10-31', ordinal: 'last' },
    ],
  ])(
    'asks %s as the domain question and names the calendar, version and coverage',
    async (command, params, question) => {
      const { calendar, asked } = answering(workday)
      const text = await fixture().run(command, params, calendar)
      expect(asked).toHaveBeenCalledWith(question)
      expect(text.split('\n')[0]).toBe(
        `done Calendar ${command} calendar=cn-legal-holidays version=v-2026-11-06 coverage=2025-01-01..2027-12-31`,
      )
      expect(JSON.parse(text.split('\n')[1]!)).toEqual({
        kind: 'ok',
        value: { classification: 'workingDay', working: true },
      })
    },
  )

  it.each([
    ['coverage_insufficient', 'coverage_insufficient'],
    ['unknown_calendar_version', 'coverage_insufficient'],
    ['missing_environment', 'not_configured'],
    ['forbidden', 'forbidden'],
    ['invalid_timezone', 'invalid'],
    ['provider_failure', 'unavailable'],
    ['capacity_exceeded', 'unavailable'],
  ])('says %s as %s, one line, never as an answer', async (code, kind) => {
    const { calendar } = answering(
      refused(code, code === 'coverage_insufficient' ? { date: '2028-01-03' } : {}),
    )
    const text = await fixture().run('day', { date: '2028-01-03' }, calendar)
    expect(text.startsWith(`${kind} reason=`)).toBe(true)
    expect(text).toContain(`code=${code}`)
    expect(text).not.toContain('\n')
  })

  it('answers unavailable when no calendar is attached to the call', async () => {
    expect(await fixture().run('day', { date: '2026-10-10' })).toBe(
      'unavailable reason=the calendar is not attached to this call',
    )
  })

  it('fails a result past its bound instead of cutting it', async () => {
    const { calendar } = answering(workday)
    const text = await fixture(120).run('day', { date: '2026-10-10' }, calendar)
    expect(text.startsWith('too-large reason=')).toBe(true)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(120)
    expect(await fixture(16).run('day', { date: '2026-10-10' }, calendar)).toBe('too-large')
  })
})

describe('binding one call', () => {
  const context = (tenantId: string): CalendarCallContext =>
    ({
      principalRef: 'p',
      owner: { kind: 'tenant', tenantId, ownerId: 'acc' },
      actor: { kind: 'agent', actorRef: 'agent' },
      authContextRef: 'tool',
      requestId: 'r',
      originatingSessionRef: 'session-1',
    }) as unknown as CalendarCallContext
  const calculator = (answer: CalendarAnswer | Error) => {
    const asked = vi.fn(async (): Promise<CalendarAnswer> => {
      if (answer instanceof Error) throw answer
      return answer
    })
    return { calculator: { answer: asked } satisfies CalendarCalculator, asked }
  }
  const question = { kind: 'day', date: '2026-10-10' } as unknown as CalendarQuestion

  it('detaches the calendar when the call scope finishes, once', async () => {
    const execution = scope()
    const attached = attachCalendar(execution, answering(workday).calendar)
    expect(calendarOf(attached.context)).toBeDefined()
    const first = attached.finish('returned')
    expect(attached.finish('returned')).toBe(first)
    await first
    expect(calendarOf(attached.context)).toBeUndefined()
  })

  it('asks the calculator with the context the host derived for the call tenant', async () => {
    const c = calculator(workday)
    const bound = bindCalendar({
      tenant: 'tenant-a',
      requestId: 'r',
      calculator: () => c.calculator,
      context: async () => context('tenant-a'),
    })
    expect(await bound.answer(question)).toBe(workday)
    expect(c.asked).toHaveBeenCalledWith(context('tenant-a'), question)
  })

  type Case = readonly [
    string,
    () => CalendarCalculator | undefined,
    () => Promise<CalendarCallContext | undefined>,
    string,
  ]
  it.each<Case>([
    [
      'a context of another tenant',
      () => calculator(workday).calculator,
      async () => context('tenant-b'),
      'forbidden',
    ],
    ['no calculator', () => undefined, async () => context('tenant-a'), 'provider_failure'],
    ['no context', () => calculator(workday).calculator, async () => undefined, 'provider_failure'],
    [
      'a context that throws',
      () => calculator(workday).calculator,
      async () => {
        throw new Error('down')
      },
      'provider_failure',
    ],
    [
      'a calculator that throws',
      () => calculator(new Error('down')).calculator,
      async () => context('tenant-a'),
      'provider_failure',
    ],
  ])('refuses %s', async (_, calc, ctx, code) => {
    const answer = await bindCalendar({
      tenant: 'tenant-a',
      requestId: 'r',
      calculator: calc,
      context: ctx,
    }).answer(question)
    expect(answer).toMatchObject({
      kind: 'error',
      error: { code, retryable: code === 'provider_failure', message: expect.stringMatching(/\S/) },
    })
  })
})
