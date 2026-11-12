import { z } from 'zod'
import { expect, it } from 'vitest'
import {
  scheduleJsonSchema,
  ScheduleCreateRequestSchema,
  ScheduleOperationIntentInputSchema,
  fingerprintScheduleOperation,
} from '@omne-harness/schedule-contract'
it('derives closed tool shapes while permitting the complete JSON value vocabulary', () => {
  const schema = scheduleJsonSchema(ScheduleCreateRequestSchema)
  expect(schema.type).toBe('object')
  expect(schema.additionalProperties).toBe(false)
  expect(JSON.stringify(schema)).toContain(
    '"type":["null","boolean","number","string","array","object"]',
  )
  expect(() => scheduleJsonSchema(z.custom<Date>())).toThrow()
})
it('retains literal prototype keys throughout command parsing and fingerprinting', () => {
  const request = {
    kind: 'create',
    owner: { kind: 'system', systemScopeRef: 'system:1' },
    input: {
      definition: {
        label: '程序',
        recurrence: { kind: 'once', localAt: '2026-11-04T10:00:00' },
        limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
        binding: { kind: 'explicit', timezone: 'Asia/Tokyo', calendar: null },
        calendarOverlay: null,
        purpose: {
          kind: 'execution',
          work: {
            kind: 'program',
            programRef: 'program:1',
            input: JSON.parse('{"__proto__":{"value":1}}'),
          },
          scope: { kind: 'fleet' },
          catchUp: { kind: 'none' },
          overlap: 'skip',
          misfire: { kind: 'lapse' },
          notifications: [],
        },
      },
      initial: { kind: 'active' },
      meta: { operationKey: 'first', expectedRevision: null, consentRef: null },
    },
  }
  const first = ScheduleOperationIntentInputSchema.parse(request)
  const second = ScheduleOperationIntentInputSchema.parse({
    ...request,
    input: {
      ...request.input,
      definition: {
        ...request.input.definition,
        purpose: {
          ...request.input.definition.purpose,
          work: { ...request.input.definition.purpose.work, input: {} },
        },
      },
    },
  })
  expect(fingerprintScheduleOperation(first)).not.toBe(fingerprintScheduleOperation(second))
  expect(Object.prototype.hasOwnProperty.call({}, 'value')).toBe(false)
})
