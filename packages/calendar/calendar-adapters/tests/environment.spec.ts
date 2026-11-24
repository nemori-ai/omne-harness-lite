import { describe, expect, it, vi } from 'vitest'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import {
  calendarEnvironmentBlock,
  calendarEnvironmentDescriptor,
  createCalendarEnvironmentReader,
} from '../src/index.ts'

const context = calendarCallContextSchema.parse({
  principalRef: 'p',
  owner: { kind: 'tenant', tenantId: 't-1', ownerId: 'o-1' },
  actor: { kind: 'human', actorRef: 'o-1' },
  authContextRef: 'a',
  requestId: 'r',
  originatingSessionRef: null,
})
const tenant = { organization: 'org', account: 'acc' } as never

function reader(entry: unknown, failure = false) {
  const read = vi.fn(async () =>
    failure
      ? { failure: { kind: 'denied' } }
      : { ok: { entries: entry === undefined ? [] : [entry] } },
  )
  const environment = createCalendarEnvironmentReader<string>({
    scope: () => ({ read }) as never,
    reader: async tenantId => (tenantId === 't-1' ? { principal: 'reader', tenant } : null),
  })
  return { environment, read }
}

const found = {
  kind: 'found',
  revision: 'rev-7',
  timezone: 'Asia/Tokyo',
  calendarId: 'jp-legal-holidays',
}

describe('the calendar environment read through the tenant-level scope', () => {
  it('answers the value of the block, owned by the caller', async () => {
    const { environment, read } = reader({
      key: 'calendar.environment',
      kind: 'value',
      value: found,
    })
    expect(await environment.read(context)).toEqual({
      kind: 'found',
      value: {
        owner: context.owner,
        revision: 'rev-7',
        timezone: 'Asia/Tokyo',
        calendarId: 'jp-legal-holidays',
      },
    })
    expect(read).toHaveBeenCalledWith(
      'reader',
      tenant,
      expect.objectContaining({ consumer: 'coordinator' }),
    )
  })
  it('answers missing when the tenant has not set it, not an empty calendar', async () => {
    const { environment } = reader({
      key: 'calendar.environment',
      kind: 'value',
      value: { kind: 'missing' },
    })
    expect(await environment.read(context)).toEqual({ kind: 'missing' })
  })
  it('answers unavailable for a missing, unknown or refused block, a bad value, or no reader', async () => {
    for (const entry of [
      { key: 'calendar.environment', kind: 'missing' },
      { key: 'calendar.environment', kind: 'unknown' },
      {
        key: 'calendar.environment',
        kind: 'value',
        value: { kind: 'found', revision: 'r', timezone: 'Nowhere/Here', calendarId: null },
      },
      undefined,
    ])
      expect(await reader(entry).environment.read(context)).toEqual({ kind: 'unavailable' })
    expect(await reader(found, true).environment.read(context)).toEqual({ kind: 'unavailable' })
    const other = calendarCallContextSchema.parse({
      ...context,
      owner: { kind: 'tenant', tenantId: 't-2', ownerId: 'o' },
    })
    expect(await reader(found).environment.read(other)).toEqual({ kind: 'unavailable' })
  })
})

describe('the calendar environment beside other blocks', () => {
  it('takes its own block out of a read that holds others first', async () => {
    const read = vi.fn(async () => ({
      ok: {
        entries: [
          { key: 'session.intake-budget', kind: 'value', value: { kind: 'missing' } },
          { key: 'calendar.environment', kind: 'value', value: found },
        ],
      },
    }))
    const environment = createCalendarEnvironmentReader<string>({
      scope: () => ({ read }) as never,
      reader: async () => ({ principal: 'reader', tenant }),
    })
    expect(await environment.read(context)).toMatchObject({
      kind: 'found',
      value: { revision: 'rev-7' },
    })
  })
  it('declares a schema that takes a found or missing environment and refuses anything else', () => {
    const validate = calendarEnvironmentDescriptor.schema['~standard'].validate
    expect(validate(found)).toEqual({ value: found })
    expect(validate({ kind: 'missing' })).toEqual({ value: { kind: 'missing' } })
    for (const bad of [
      null,
      { kind: 'found', revision: 'r', timezone: 'Nowhere/Here', calendarId: null },
    ])
      expect(validate(bad)).toMatchObject({ issues: [{ message: expect.any(String) }] })
  })
})

describe('the calendar environment block', () => {
  it('reads unavailable when the assembly cannot read the settings now', async () => {
    expect(await calendarEnvironmentBlock(async () => null).supply({ tenant } as never)).toEqual({
      kind: 'unavailable',
    })
  })
  it('reads the value the assembly gives', async () => {
    const value = { kind: 'missing' } as const
    expect(await calendarEnvironmentBlock(async () => value).supply({ tenant } as never)).toEqual({
      kind: 'value',
      value,
    })
  })
})
