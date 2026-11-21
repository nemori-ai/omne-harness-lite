import { describe, expect, it } from 'vitest'
import {
  DISPATCH_MODES,
  DISPATCH_STATES,
  TEXT_CEILING,
  deliverySchema,
  dispatchIdSchema,
  dispatchRequestSchema,
  dispatchSchema,
  failureSchema,
  instantSchema,
  isOpen,
  messageRequestSchema,
  reportSchema,
  reportTextSchema,
  sessionRefSchema,
  stopSchema,
  tenantIdSchema,
} from '@omne-harness/dispatch-contract'

type Schema = { safeParse(value: unknown): { success: boolean } }
const takes = (schema: Schema, value: unknown) => schema.safeParse(value).success
const ID = `dsp_${'0123456789abcdef'.repeat(4)}`
const AT = '2026-11-20T01:02:03.456Z'
const RECORD = {
  id: ID,
  tenant: 'tenant-1',
  dispatcher: 'session-parent',
  call: 'call-1',
  mode: 'delegate',
  agent: 'helper',
  instruction: 'look into it',
  expectation: null,
  context: null,
  session: 'session-child',
  state: 'accepted',
  report: null,
  failure: null,
  stop: null,
  delivery: null,
  acceptedAt: AT,
  changedAt: AT,
}

describe('the texts and identities of a dispatch', () => {
  it.each([
    ['a tenant', tenantIdSchema, 400],
    ['a session', sessionRefSchema, 200],
    ['a report text', reportTextSchema, TEXT_CEILING],
  ] as const)('%s is a text of one character up to its ceiling', (_name, schema, ceiling) => {
    expect(takes(schema, 'ab')).toBe(true)
    expect(takes(schema, 'x'.repeat(ceiling))).toBe(true)
    expect(takes(schema, '')).toBe(false)
    expect(takes(schema, 'x'.repeat(ceiling + 1))).toBe(false)
  })

  it('takes the identity of a dispatch whole, and nothing around or short of it', () => {
    expect(takes(dispatchIdSchema, ID)).toBe(true)
    expect(takes(dispatchIdSchema, `x${ID}`)).toBe(false)
    expect(takes(dispatchIdSchema, `${ID}0`)).toBe(false)
    expect(takes(dispatchIdSchema, ID.slice(0, -1))).toBe(false)
    expect(takes(dispatchIdSchema, ID.replace('f', 'g'))).toBe(false)
  })

  it('takes an instant in UTC with milliseconds, and nothing around or short of it', () => {
    expect(takes(instantSchema, AT)).toBe(true)
    expect(takes(instantSchema, `x${AT}`)).toBe(false)
    expect(takes(instantSchema, `${AT}x`)).toBe(false)
    expect(takes(instantSchema, '2026-11-20T01:02:03Z')).toBe(false)
    expect(takes(instantSchema, AT.replace('2026', 'year'))).toBe(false)
  })
})

describe('what a dispatch carries', () => {
  it('takes a report from either origin, and no other member', () => {
    expect(takes(reportSchema, { text: 'ab', origin: 'report' })).toBe(true)
    expect(takes(reportSchema, { text: 'ab', origin: 'final-reply' })).toBe(true)
    expect(takes(reportSchema, { text: 'ab', origin: 'guess' })).toBe(false)
    expect(takes(reportSchema, { text: 'ab', origin: 'report', more: 1 })).toBe(false)
  })

  it.each(['session-not-created', 'run-failed', 'run-cancelled'])(
    'takes the failure cause %s with a detail up to its ceiling',
    cause => {
      expect(takes(failureSchema, { cause, detail: '' })).toBe(true)
      expect(takes(failureSchema, { cause, detail: 'x'.repeat(2000) })).toBe(true)
      expect(takes(failureSchema, { cause, detail: 'x'.repeat(2001) })).toBe(false)
      expect(takes(failureSchema, { cause: 'other', detail: '' })).toBe(false)
    },
  )

  it('takes each place an outcome can be at, with nothing more', () => {
    for (const kind of ['pending', 'undeliverable', 'wait-closed']) {
      expect(takes(deliverySchema, { kind })).toBe(true)
      expect(takes(deliverySchema, { kind, to: 'result' })).toBe(false)
    }
    expect(takes(deliverySchema, { kind: 'delivered', to: 'result' })).toBe(true)
    expect(takes(deliverySchema, { kind: 'delivered', to: 'input' })).toBe(true)
    expect(takes(deliverySchema, { kind: 'delivered', to: 'nowhere' })).toBe(false)
    expect(takes(deliverySchema, { kind: 'lost' })).toBe(false)
  })

  it('takes the three stops', () => {
    for (const stop of ['not-needed', 'requested', 'confirmed'])
      expect(takes(stopSchema, stop)).toBe(true)
    expect(takes(stopSchema, 'stopped')).toBe(false)
  })

  it('takes a record in every state and mode, with what the state carries', () => {
    for (const state of DISPATCH_STATES)
      expect(takes(dispatchSchema, { ...RECORD, state })).toBe(true)
    for (const mode of DISPATCH_MODES) expect(takes(dispatchSchema, { ...RECORD, mode })).toBe(true)
    const full = {
      ...RECORD,
      expectation: 'x'.repeat(4000),
      context: 'x'.repeat(400),
      call: 'x'.repeat(400),
      agent: 'x'.repeat(200),
      state: 'reported',
      report: { text: 'ab', origin: 'report' },
      failure: { cause: 'run-failed', detail: '' },
      stop: 'requested',
      delivery: { kind: 'pending' },
    }
    expect(takes(dispatchSchema, full)).toBe(true)
    expect(takes(dispatchSchema, { ...RECORD, more: 1 })).toBe(false)
    const over = { expectation: 4001, context: 401, call: 401, agent: 201 }
    for (const [member, length] of Object.entries(over))
      expect(takes(dispatchSchema, { ...full, [member]: 'x'.repeat(length) })).toBe(false)
    for (const member of ['context', 'call', 'agent', 'instruction'])
      expect(takes(dispatchSchema, { ...full, [member]: '' })).toBe(false)
  })

  it('counts a dispatch as open while it is accepted or started', () => {
    expect(DISPATCH_STATES.filter(state => isOpen({ state }))).toEqual(['accepted', 'started'])
  })
})

describe('what is asked of the registry', () => {
  const ask = { mode: 'spawn', agent: 'ab', instruction: 'ab', call: 'ab' }

  it('takes a request with or without the hoped shape, within the ceilings', () => {
    expect(takes(dispatchRequestSchema, ask)).toBe(true)
    expect(takes(dispatchRequestSchema, { ...ask, expectation: null })).toBe(true)
    const widest = {
      ...ask,
      agent: 'x'.repeat(200),
      call: 'x'.repeat(400),
      expectation: 'x'.repeat(4000),
    }
    expect(takes(dispatchRequestSchema, widest)).toBe(true)
    expect(takes(dispatchRequestSchema, { ...ask, more: 1 })).toBe(false)
    const over = { agent: 201, call: 401, expectation: 4001, instruction: TEXT_CEILING + 1 }
    for (const [member, length] of Object.entries(over))
      expect(takes(dispatchRequestSchema, { ...ask, [member]: 'x'.repeat(length) })).toBe(false)
    for (const member of ['agent', 'call', 'instruction'])
      expect(takes(dispatchRequestSchema, { ...ask, [member]: '' })).toBe(false)
  })

  it('takes a message with its receiver, text and identity, within the ceilings', () => {
    const message = { to: 'session-other', text: 'ab', id: 'ab' }
    expect(takes(messageRequestSchema, message)).toBe(true)
    expect(takes(messageRequestSchema, { ...message, id: 'x'.repeat(200) })).toBe(true)
    expect(takes(messageRequestSchema, { ...message, more: 1 })).toBe(false)
    expect(takes(messageRequestSchema, { ...message, id: 'x'.repeat(201) })).toBe(false)
    for (const member of ['to', 'text', 'id'])
      expect(takes(messageRequestSchema, { ...message, [member]: '' })).toBe(false)
  })
})
