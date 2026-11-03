import { describe, expect, it } from 'vitest'
import {
  ScheduleOperationIntentInputSchema,
  ScheduleOperationLocatorSchema,
  ScheduleOperationAddressSchema,
  ScheduleJsonValueSchema,
  canonicalizeScheduleOperation,
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
} from '@omne-harness/schedule-contract'
const request = {
  kind: 'execute',
  owner: { kind: 'tenant', tenantId: 'tenant', ownerId: 'owner' },
  input: {
    scheduleId: '00000000-0000-4000-8000-000000000001',
    action: 'update',
    patch: { kind: 'label', label: '中文😀/ é' },
    meta: { expectedRevision: 3, consentRef: 'consent:批准', operationKey: '原操作' },
  },
}
const parse = (value: unknown) => ScheduleOperationIntentInputSchema.parse(value)
const golden =
  '{"aggregateRef":"00000000-0000-4000-8000-000000000001","consentRef":"consent:批准","expectedRevision":3,"operation":"schedule.update","owner":{"kind":"tenant","ownerId":"owner","tenantId":"tenant"},"payload":{"action":"update","patch":{"kind":"label","label":"中文😀/ é"}},"protocol":"omne.calendar-schedule/1"}'

describe('original operation identity', () => {
  it('matches independently encoded Python UTF-8 and SHA-256 golden', () => {
    const value = parse(request)
    expect(canonicalizeScheduleOperation(value)).toBe(golden)
    expect(Buffer.byteLength(golden, 'utf8')).toBe(319)
    expect(fingerprintScheduleOperation(value)).toBe(
      '03a34cb988f16acb22e4fc053645e9c50d38c3a5d5a6677b18c4c91e0e3ea550',
    )
    expect(createScheduleOperationIntent(value).address).toEqual({
      protocol: 'omne.calendar-schedule/1',
      operation: 'schedule.update',
      aggregate: { kind: 'entity', id: request.input.scheduleId },
      operationKey: '原操作',
    })
  })
  it('excludes operationKey and rejects observational requestId from the fixed intent', () => {
    expect(
      fingerprintScheduleOperation(
        parse({
          ...request,
          input: { ...request.input, meta: { ...request.input.meta, operationKey: 'different' } },
        }),
      ),
    ).toBe(fingerprintScheduleOperation(parse(request)))
    expect(
      ScheduleOperationIntentInputSchema.safeParse({ ...request, requestId: 'observation' })
        .success,
    ).toBe(false)
  })
  it.each([
    { ...request, owner: { ...request.owner, ownerId: 'other' } },
    { ...request, input: { ...request.input, meta: { ...request.input.meta, consentRef: null } } },
    {
      ...request,
      input: { ...request.input, meta: { ...request.input.meta, expectedRevision: 4 } },
    },
    { ...request, input: { ...request.input, patch: { kind: 'label', label: 'other' } } },
    { ...request, input: { ...request.input, scheduleId: '00000000-0000-4000-8000-000000000002' } },
  ])('fingerprints every business identity or intent change', value => {
    expect(fingerprintScheduleOperation(parse(value))).not.toBe(
      fingerprintScheduleOperation(parse(request)),
    )
  })
  it('binds action names to create or entity namespaces', () => {
    const address = createScheduleOperationIntent(parse(request)).address
    expect(
      ScheduleOperationAddressSchema.safeParse({ ...address, operation: 'schedule.create' })
        .success,
    ).toBe(false)
    expect(
      ScheduleOperationAddressSchema.safeParse({ ...address, aggregate: { kind: 'create' } })
        .success,
    ).toBe(false)
    expect(
      ScheduleOperationLocatorSchema.safeParse({
        kind: 'identity',
        identity: address,
        expectedFingerprint: 'ABC',
      }).success,
    ).toBe(false)
    expect(
      ScheduleOperationLocatorSchema.safeParse({ kind: 'ref', operationRef: 'opaque-other-domain' })
        .success,
    ).toBe(false)
  })
})
describe('plain JSON input', () => {
  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    new Date(),
    new Map(),
    new Set(),
    () => 1,
    1n,
    { x: undefined },
    [undefined],
    Array(1),
  ])('rejects non-JSON or unsafe values', value => {
    expect(ScheduleJsonValueSchema.safeParse(value).success).toBe(false)
  })
  it('rejects cycles, accessor properties and symbol keys without invoking accessors', () => {
    const cycle: { next?: object } = {}
    cycle.next = cycle
    let invoked = false
    const getter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        invoked = true
        return 1
      },
    })
    expect(ScheduleJsonValueSchema.safeParse(cycle).success).toBe(false)
    expect(ScheduleJsonValueSchema.safeParse(getter).success).toBe(false)
    expect(invoked).toBe(false)
    expect(ScheduleJsonValueSchema.safeParse({ [Symbol('hidden')]: true }).success).toBe(false)
  })
  it('preserves Unicode, negative numbers, exponents, nulls and empty arrays', () => {
    const value = { z: [], '😀': '中文/', n: -2.5, tiny: 1e-7, nullable: null }
    expect(ScheduleJsonValueSchema.parse(value)).toEqual(value)
  })
})

it('fingerprints the complete create payload with the same cross-language JCS rules', () => {
  const input = parse({
    kind: 'create',
    owner: { kind: 'system', systemScopeRef: 'system:1' },
    input: {
      definition: {
        label: '计划😀/',
        recurrence: { kind: 'once', localAt: '2026-11-04T10:00:00' },
        limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
        binding: { kind: 'explicit', timezone: 'Asia/Tokyo', calendar: null },
        calendarOverlay: null,
        purpose: {
          kind: 'execution',
          work: {
            kind: 'program',
            programRef: 'program:1',
            input: { tiny: 1e-7, negative: -2, empty: [], nullValue: null },
          },
          scope: { kind: 'fleet' },
          catchUp: { kind: 'none' },
          overlap: 'skip',
          misfire: { kind: 'lapse' },
          notifications: [],
        },
      },
      initial: { kind: 'draft', reason: '确认' },
      meta: { operationKey: 'first', expectedRevision: null, consentRef: null },
    },
  })
  const encoded = canonicalizeScheduleOperation(input)
  expect(encoded).toBe(
    '{"aggregateRef":null,"consentRef":null,"expectedRevision":null,"operation":"schedule.create","owner":{"kind":"system","systemScopeRef":"system:1"},"payload":{"definition":{"binding":{"calendar":null,"kind":"explicit","timezone":"Asia/Tokyo"},"calendarOverlay":null,"label":"计划😀/","limits":{"eligibleLimit":null,"excludeDates":[],"jobLimit":null},"purpose":{"catchUp":{"kind":"none"},"kind":"execution","misfire":{"kind":"lapse"},"notifications":[],"overlap":"skip","scope":{"kind":"fleet"},"work":{"input":{"empty":[],"negative":-2,"nullValue":null,"tiny":1e-7},"kind":"program","programRef":"program:1"}},"recurrence":{"kind":"once","localAt":"2026-11-04T10:00:00"}},"initial":{"kind":"draft","reason":"确认"}},"protocol":"omne.calendar-schedule/1"}',
  )
  expect(Buffer.byteLength(encoded, 'utf8')).toBe(759)
  expect(fingerprintScheduleOperation(input)).toBe(
    'ed4cfe1527393e844e829b2c2722866627eb56249c61a731f420fb1da38b8808',
  )
  expect(encoded).toContain('"tiny":1e-7')
  expect(encoded).toContain('"negative":-2')
  expect(encoded).toContain('"empty":[]')
  expect(encoded).toContain('"nullValue":null')
  expect(createScheduleOperationIntent(input).address.aggregate).toEqual({ kind: 'create' })
  expect(encoded).toContain('"expectedRevision":null')
  expect(encoded).toContain('"initial":{"kind":"draft","reason":"确认"}')
  expect(encoded).not.toContain('operationKey')
  expect(encoded).not.toContain('requestId')
})

it('retains every JSON payload property including the literal __proto__ key', () => {
  const value: unknown = JSON.parse('{"__proto__":{"value":1},"constructor":"literal"}')
  expect(JSON.stringify(ScheduleJsonValueSchema.parse(value))).toBe(
    '{"__proto__":{"value":1},"constructor":"literal"}',
  )
})

it('rejects decorated sparse arrays and array subclasses that cannot round trip as JSON', () => {
  const sparse: unknown[] = Array(1)
  Object.defineProperty(sparse, 'extra', { enumerable: true, value: 'hidden on stringify' })
  class RuntimeArray extends Array<unknown> {}
  expect(ScheduleJsonValueSchema.safeParse(sparse).success).toBe(false)
  expect(ScheduleJsonValueSchema.safeParse(new RuntimeArray(1, 2)).success).toBe(false)
})
