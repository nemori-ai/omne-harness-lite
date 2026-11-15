import { describe, expect, it } from 'vitest'
import {
  calendarRefreshInputSchema,
  calendarPublicationQuerySchema,
  calendarSeedPackSchema,
  calendarTransportEvidenceSchema,
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
    expect(
      calendarRefreshInputSchema.safeParse({ ...input, operationKey: '界'.repeat(43) }).success,
    ).toBe(false)
    expect(calendarRefreshInputSchema.safeParse({ ...input, operationKey: '\ud800' }).success).toBe(
      false,
    )
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
  it('preserves structured transport evidence without encoding it in authority references', () => {
    const observation = {
      url: 'https://example.test/calendar.csv',
      method: 'GET',
      status: 200,
      etag: 'abc',
      lastModified: 'Mon, 02 Nov 2026 00:00:00 GMT',
      contentLength: 123,
      bodyHash: 'a'.repeat(64),
      knowledgeBasis: 'HTTP Last-Modified',
    }
    expect(calendarTransportEvidenceSchema.parse(JSON.parse(JSON.stringify(observation)))).toEqual(
      observation,
    )
    expect(
      calendarTransportEvidenceSchema.safeParse({ ...observation, bodyHash: 'wrong' }).success,
    ).toBe(false)
  })
})
