import { describe, expect, it, vi } from 'vitest'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import { calendarEnvironmentBlock, createCalendarEnvironmentReader } from '../src/index.ts'

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

describe('the calendar environment block', () => {
  it('reads unavailable when the assembly cannot read the settings now', async () => {
    expect(await calendarEnvironmentBlock(async () => null).supply({ tenant })).toEqual({
      kind: 'unavailable',
    })
  })
  it('reads the value the assembly gives', async () => {
    const value = { kind: 'missing' } as const
    expect(await calendarEnvironmentBlock(async () => value).supply({ tenant })).toEqual({
      kind: 'value',
      value,
    })
  })
})
