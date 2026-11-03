import { describe, expect, it } from 'vitest'
import {
  ScheduleDefinitionSchema,
  ScheduleRecurrenceSchema,
  ScheduleWorkSchema,
  ScheduleLabelSchema,
  ScheduleInstructionSchema,
  ScheduleCivilSchema,
  ScheduleInstantSchema,
  ScheduleLocalDateSchema,
  ScheduleTimezoneSchema,
  ScheduleCallContextSchema,
  ScheduleCommandSchema,
  ScheduleCreateRequestSchema,
} from '@omne-harness/schedule-contract'

const recurrence = { kind: 'once', localAt: '2026-11-04T10:00:00' }
const program = {
  kind: 'program',
  programRef: 'registered-program:v1',
  input: { text: '中文😀', values: [null, -2, 1e-7] },
}
const purpose = {
  kind: 'execution',
  work: program,
  scope: { kind: 'fleet' },
  catchUp: { kind: 'none' },
  overlap: 'skip',
  misfire: { kind: 'lapse' },
  notifications: [],
}
const definition = {
  label: '测试',
  recurrence,
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'explicit', timezone: 'Asia/Tokyo', calendar: null },
  calendarOverlay: null,
  purpose,
}
const agent = {
  kind: 'agent',
  instruction: '继续处理',
  session: { mode: 'existing', sessionRef: 'session:opaque' },
  materials: [],
  returnTo: null,
  resultPolicy: {
    audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
    publication: { kind: 'provider', providerRef: 'provider:report' },
    resultSeriesId: null,
    attention: 'inbox',
    archive: { kind: 'none' },
  },
}

describe('complete schedule definitions', () => {
  it('preserves full JSON values and explicit nulls', () => {
    const parsed = ScheduleDefinitionSchema.parse(definition)
    expect(ScheduleDefinitionSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(definition)
    expect(ScheduleDefinitionSchema.safeParse({ ...definition, dueSelection: 'all' }).success).toBe(
      false,
    )
    expect(ScheduleDefinitionSchema.safeParse({ ...definition, binding: undefined }).success).toBe(
      false,
    )
  })
  it('separates agent new and existing execution plans', () => {
    expect(ScheduleWorkSchema.parse(agent)).toEqual(agent)
    const newAgent = {
      ...agent,
      session: {
        mode: 'new',
        agentDefinitionRef: 'agent:definition',
        modes: {
          permission: 'never',
          environmentAdoptionRef: 'env:1',
          collaboration: 'auto-drive',
        },
        workspace: null,
      },
    }
    expect(ScheduleWorkSchema.parse(newAgent)).toEqual(newAgent)
    for (const field of ['agentDefinitionRef', 'modes', 'workspace'])
      expect(
        ScheduleWorkSchema.safeParse({
          ...agent,
          session: { ...agent.session, [field]: 'forbidden' },
        }).success,
      ).toBe(false)
    expect(ScheduleWorkSchema.safeParse({ ...program, instruction: 'run' }).success).toBe(false)
  })
  it('requires explicit master returns and valid publication policy', () => {
    const internal = {
      ...agent,
      resultPolicy: {
        ...agent.resultPolicy,
        audience: { kind: 'masterInternal' },
        publication: { kind: 'none' },
        attention: 'silent',
      },
    }
    expect(ScheduleWorkSchema.safeParse(internal).success).toBe(false)
    expect(
      ScheduleWorkSchema.safeParse({
        ...internal,
        returnTo: { kind: 'external', targetRef: 'master:1' },
      }).success,
    ).toBe(true)
    expect(
      ScheduleWorkSchema.safeParse({
        ...agent,
        resultPolicy: { ...agent.resultPolicy, publication: { kind: 'none' } },
      }).success,
    ).toBe(false)
    expect(
      ScheduleWorkSchema.safeParse({
        ...agent,
        resultPolicy: { ...agent.resultPolicy, publication: { kind: 'master' } },
      }).success,
    ).toBe(false)
  })
  it('keeps reminder and execution fields separate', () => {
    const reminder = {
      kind: 'reminder',
      content: { title: null, body: '喝水' },
      admissionPolicy: 'reminder-window-v1',
      overlap: 'parallel',
    }
    expect(ScheduleDefinitionSchema.safeParse({ ...definition, purpose: reminder }).success).toBe(
      true,
    )
    for (const field of ['work', 'scope', 'catchUp', 'notifications'])
      expect(
        ScheduleDefinitionSchema.safeParse({
          ...definition,
          purpose: { ...reminder, [field]: purpose.work },
        }).success,
      ).toBe(false)
  })
  it('requires once misfire, limits and calendar consistency', () => {
    expect(
      ScheduleDefinitionSchema.safeParse({ ...definition, purpose: { ...purpose, misfire: null } })
        .success,
    ).toBe(false)
    expect(
      ScheduleDefinitionSchema.safeParse({
        ...definition,
        limits: { ...definition.limits, eligibleLimit: 2 },
      }).success,
    ).toBe(false)
    expect(
      ScheduleDefinitionSchema.safeParse({
        ...definition,
        calendarOverlay: { predicate: 'holiday', adjust: 'skip' },
      }).success,
    ).toBe(false)
  })
})

describe('recurrence boundaries', () => {
  const bounded = { begin: '2026-01-01T00:00:00', until: null }
  it.each([
    { kind: 'cron', expression: '0 10 * * MON-FRI', ...bounded },
    { kind: 'rrule', rule: 'FREQ=YEARLY;BYYEARDAY=10,20;BYWEEKNO=1;BYEASTER=-2,0', ...bounded },
    {
      kind: 'position',
      period: 'quarter',
      interval: 2,
      ordinal: 'last',
      selector: { kind: 'workingDay' },
      times: ['09:00:00', '16:00:00'],
      ...bounded,
    },
  ])('retains valid source text for the core parser: $kind', value => {
    expect(ScheduleRecurrenceSchema.parse(value)).toEqual(value)
  })
  it.each([
    'FREQ=DAILY;COUNT=1',
    'FREQ=DAILY;UNTIL=20260101',
    'DTSTART=20260101;FREQ=DAILY',
    'FREQ=DAILY;FREQ=WEEKLY',
    'FREQ=DAILY\nINTERVAL=1',
  ])('rejects forbidden or duplicate RRULE structure: %s', rule =>
    expect(ScheduleRecurrenceSchema.safeParse({ kind: 'rrule', rule, ...bounded }).success).toBe(
      false,
    ),
  )
  it('rejects unsafe integers, overlarge exclusion lists and unordered times', () => {
    expect(
      ScheduleDefinitionSchema.safeParse({
        ...definition,
        limits: { ...definition.limits, jobLimit: Number.MAX_SAFE_INTEGER + 1 },
      }).success,
    ).toBe(false)
    expect(
      ScheduleDefinitionSchema.safeParse({
        ...definition,
        limits: { ...definition.limits, excludeDates: Array(367).fill('2026-01-01') },
      }).success,
    ).toBe(false)
    expect(
      ScheduleRecurrenceSchema.safeParse({
        kind: 'position',
        period: 'month',
        interval: 1,
        ordinal: 1,
        selector: { kind: 'weekday', weekday: 1 },
        times: ['16:00:00', '09:00:00'],
        ...bounded,
      }).success,
    ).toBe(false)
  })
})

it('uses code points for labels and UTF-8 bytes for instructions without trimming', () => {
  expect(ScheduleLabelSchema.parse('😀'.repeat(200))).toBe('😀'.repeat(200))
  expect(ScheduleLabelSchema.safeParse('😀'.repeat(201)).success).toBe(false)
  expect(ScheduleInstructionSchema.safeParse('😀'.repeat(16384)).success).toBe(true)
  expect(ScheduleInstructionSchema.safeParse('😀'.repeat(16385)).success).toBe(false)
  expect(ScheduleLabelSchema.parse(' 原文 ')).toBe(' 原文 ')
})
it('checks actual civil dates, fixed precision instants and IANA zones', () => {
  expect(ScheduleCivilSchema.safeParse('2026-02-30T10:00:00').success).toBe(false)
  expect(ScheduleCivilSchema.safeParse('2026-01-01T10:00:00Z').success).toBe(false)
  expect(ScheduleCivilSchema.safeParse('2026-01-01T10:00:00.000').success).toBe(false)
  expect(ScheduleInstantSchema.safeParse('2026-01-01T10:00:00.000Z').success).toBe(true)
  expect(ScheduleInstantSchema.safeParse('2026-01-01T10:00:00Z').success).toBe(false)
  expect(ScheduleLocalDateSchema.safeParse('2025-02-29').success).toBe(false)
  expect(ScheduleTimezoneSchema.safeParse('+09:00').success).toBe(false)
})
it('rejects invented trusted context and invalid command metadata', () => {
  expect(
    ScheduleCallContextSchema.safeParse({
      principalRef: 'p',
      owner: { kind: 'system', systemScopeRef: 's' },
      actor: { kind: 'system', actorRef: 's' },
      authContextRef: 'a',
      requestId: 'r',
      originatingSessionRef: null,
      bypass: true,
    }).success,
  ).toBe(false)
  expect(
    ScheduleCreateRequestSchema.safeParse({
      definition,
      initial: { kind: 'active' },
      meta: { operationKey: 'k', expectedRevision: 1, consentRef: null },
    }).success,
  ).toBe(false)
  expect(
    ScheduleCommandSchema.safeParse({
      scheduleId: '00000000-0000-4000-8000-000000000001',
      action: 'pause',
      reason: null,
      meta: { operationKey: 'k', expectedRevision: null, consentRef: null },
    }).success,
  ).toBe(false)
})

it('accepts each complete management action while rejecting mixed action fields', () => {
  const common = {
    scheduleId: '00000000-0000-4000-8000-000000000001',
    meta: { operationKey: 'original', expectedRevision: 1, consentRef: null },
  }
  const actions = [
    { action: 'update', patch: { kind: 'label', label: 'new' } },
    { action: 'update', patch: { kind: 'executionText', instruction: '继续', label: null } },
    {
      action: 'update',
      patch: { kind: 'reminderContent', content: { title: null, body: '提醒' }, label: null },
    },
    { action: 'reviseDraft', definition, reason: '完整修订' },
    { action: 'reconfirmConsent', newConsentRef: 'grant:2', reason: '重新确认' },
    ...['pause', 'resume', 'stop', 'promote', 'discard'].map(action => ({ action, reason: null })),
    { action: 'replace', successor: definition, reason: '替换定义' },
  ]
  for (const action of actions) {
    expect(ScheduleCommandSchema.parse({ ...common, ...action })).toEqual({ ...common, ...action })
    expect(
      ScheduleCommandSchema.safeParse({ ...common, ...action, unexpected: 'other action' }).success,
    ).toBe(false)
  }
  expect(
    ScheduleCommandSchema.safeParse({ ...common, action: 'remove', reason: null }).success,
  ).toBe(false)
  expect(
    ScheduleCommandSchema.safeParse({
      ...common,
      action: 'update',
      patch: { kind: 'label', label: 'new', instruction: 'extra' },
    }).success,
  ).toBe(false)
  for (const initial of [{ kind: 'active' }, { kind: 'draft', reason: '待同意' }])
    expect(
      ScheduleCreateRequestSchema.safeParse({
        definition,
        initial,
        meta: { ...common.meta, expectedRevision: null },
      }).success,
    ).toBe(true)
})
it('bounds source rule bytes and position list sizes independently of full grammar parsing', () => {
  const bounded = { begin: '2026-01-01T00:00:00', until: null }
  expect(
    ScheduleRecurrenceSchema.safeParse({
      kind: 'cron',
      expression: '1'.repeat(65536) + ' * * * *',
      ...bounded,
    }).success,
  ).toBe(false)
  expect(
    ScheduleRecurrenceSchema.safeParse({
      kind: 'rrule',
      rule: 'FREQ=DAILY;BYDAY=' + 'MO,'.repeat(22000) + 'TU',
      ...bounded,
    }).success,
  ).toBe(false)
  expect(
    ScheduleRecurrenceSchema.safeParse({
      kind: 'position',
      period: 'year',
      interval: 1,
      ordinal: 1,
      selector: { kind: 'weekday', weekday: 1 },
      times: Array.from(
        { length: 101 },
        (_, index) =>
          `00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
      ),
      ...bounded,
    }).success,
  ).toBe(false)
})
