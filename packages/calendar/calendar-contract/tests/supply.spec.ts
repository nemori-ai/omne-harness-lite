import { describe, expect, it } from 'vitest'
import {
  calendarRefreshInputSchema,
  calendarPublicationQuerySchema,
  calendarSeedPackSchema,
} from '../src/supply.ts'

describe('supply wire', () => {
  it('rejects runtime handles and requires stable caller intent', () => {
    const input = {
      calendarId: 'jp-legal-holidays',
      policyVersion: 'policy',
      operationKey: 'refresh-1',
    }
    expect(calendarRefreshInputSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input)
    expect(calendarRefreshInputSchema.safeParse({ ...input, signal: {} }).success).toBe(false)
    expect(calendarRefreshInputSchema.safeParse({ calendarId: input.calendarId }).success).toBe(
      false,
    )
  })
  it('requires the original address and fingerprint for publication observation', () => {
    expect(calendarPublicationQuerySchema.safeParse({ operationRef: 'guessed' }).success).toBe(
      false,
    )
  })
  it('rejects seed packs lacking release coverage and source knowledge', () => {
    expect(calendarSeedPackSchema.safeParse({ releaseRef: 'r1', calendars: [] }).success).toBe(
      false,
    )
  })
})
