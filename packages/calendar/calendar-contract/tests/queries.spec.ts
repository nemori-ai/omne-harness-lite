import { describe, expect, it } from 'vitest'
import { calendarCallContextSchema, calendarResolveSchema } from '../src/index.ts'

describe('query wire', () => {
  it('round trips opaque references and rejects untrusted shape extensions', () => {
    const context = {
      owner: { kind: 'tenant', tenantId: 'tenant-a', ownerId: 'owner-a' },
      principalRef: 'principal-a',
      actor: { kind: 'agent', actorRef: 'agent-a' },
      authContextRef: 'auth-a',
      requestId: 'request-a',
      originatingSessionRef: null,
    }
    expect(calendarCallContextSchema.parse(JSON.parse(JSON.stringify(context)))).toEqual(context)
    expect(calendarCallContextSchema.safeParse({ ...context, permission: true }).success).toBe(
      false,
    )
    expect(
      calendarCallContextSchema.safeParse({
        ...context,
        owner: { kind: 'system', tenantId: 'fake' },
      }).success,
    ).toBe(false)
    expect(calendarCallContextSchema.safeParse({ ...context, principalRef: '' }).success).toBe(
      false,
    )
  })
  it('requires explicit selection, version, bounded next count and valid dates', () => {
    const request = {
      selection: { kind: 'explicit', calendarId: 'cn' },
      version: { kind: 'latest' },
      query: { kind: 'next', after: '2026-01-01', count: 5 },
    }
    expect(calendarResolveSchema.parse(JSON.parse(JSON.stringify(request)))).toEqual(request)
    for (const query of [
      { kind: 'count', from: '2026-01-01', to: '2026-01-01' },
      { kind: 'nth', periodStart: '2026-01-01', periodEnd: '2026-01-01', ordinal: 'last' },
    ])
      expect(calendarResolveSchema.safeParse({ ...request, query }).success).toBe(true)
    for (const query of [
      { kind: 'count', from: '2026-01-02', to: '2026-01-01' },
      { kind: 'nth', periodStart: '2026-01-02', periodEnd: '2026-01-01', ordinal: 1 },
    ])
      expect(calendarResolveSchema.safeParse({ ...request, query }).success).toBe(false)
    for (const invalid of [
      { ...request, version: { kind: 'pinned' } },
      { ...request, selection: {} },
      { ...request, signal: {} },
      { ...request, query: { kind: 'next', after: '2026-01-01' } },
      { ...request, query: { kind: 'next', after: '2026-02-30', count: 1 } },
      { ...request, query: { kind: 'next', after: '2026-01-01', count: 367 } },
    ])
      expect(calendarResolveSchema.safeParse(invalid).success).toBe(false)
  })
})
