import { describe, expect, it } from 'vitest'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { CalendarCallContext } from '@omne-harness/calendar-contract'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { encodeInstant } from '@omne-harness/utc-instant'
import { createCalendarContribution, type CalendarFaces } from '@omne-harness/calendar-access'

const tenantId = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return tenant(parsed.value.organization, parsed.value.account)
})()
const context = { requestId: 'r-1' } as unknown as CalendarCallContext
const call = { principal: {} as LoginIdentity } as never
const error = (code: string) => ({
  kind: 'error',
  error: { code, message: '', retryable: false, requestId: 'r-1', details: {} },
})
const health = {
  calendarId: 'jp-legal-holidays',
  observedAt: '2026-11-19T00:00:00.000Z',
  queryAvailability: 'available',
  supply: 'failed',
  horizon: 'critical',
  coverageStart: '1955-01-01',
  coverageEnd: '2026-11-01',
  knowledgeAsOf: '2026-02-02T00:30:17.000Z',
  remainingCoverageDays: -18,
  consecutiveFailures: 2,
  lastSuccess: null,
  pendingRuns: 0,
  sources: [
    {
      sourceId: 'cao-syukujitsu-csv',
      observation: {
        sourceId: 'cao-syukujitsu-csv',
        observedAt: '2026-11-19T00:00:00.000Z',
        kind: 'failed',
        marker: null,
        authorityCoverageEnd: null,
        reason: 'fetch failed',
      },
      nextDue: '2026-11-20T00:00:00.000Z',
      consecutiveFailures: 2,
      lastSuccess: null,
    },
  ],
  reasons: ['Some source observations are unknown'],
}
const resolution = {
  calendarId: 'jp-legal-holidays',
  versionId: 'v-0',
  coverageStart: '1955-01-01',
  coverageEnd: '2026-12-31',
  result: {
    kind: 'day',
    value: { date: '2026-11-03', classification: 'holiday', working: false, override: true },
  },
}

function world(faces: Partial<{ health: unknown; resolve: unknown; answer: unknown }> | null) {
  const asked: [string, unknown[]][] = []
  const reply =
    (name: string, value: unknown) =>
    async (...args: unknown[]) => {
      asked.push([name, args])
      if (value instanceof Error) throw value
      return value
    }
  const built =
    faces === null
      ? undefined
      : ({
          queries: {
            health: reply('health', faces.health),
            resolve: reply('resolve', faces.resolve),
          },
          calculator: { answer: reply('answer', faces.answer) },
        } as unknown as CalendarFaces)
  const contribution = createCalendarContribution({
    principals: {
      async actingFor() {
        return { ok: {} as Principal }
      },
      contextOf: () => context,
    },
    faces: () => built,
    requestId: () => 'r-1',
  })
  return { ops: contribution.operations, asked }
}

describe('read-supply-health', () => {
  it('projects the domain health with each source and why it failed; days past the end of coverage read as none left', async () => {
    const { ops } = world({ health: { kind: 'ok', value: [health] } })
    const answer: any = await ops['read-supply-health'](call, { tenant: tenantId })
    expect(answer.outcome).toBe('succeeded')
    const [item] = answer.body.calendars
    expect({ ...item, knowledgeAsOf: encodeInstant(item.knowledgeAsOf) }).toEqual({
      calendar: 'jp-legal-holidays',
      queryAvailability: 'available',
      supply: 'failed',
      horizon: 'critical',
      coverageStart: '1955-01-01',
      coverageEnd: '2026-11-01',
      knowledgeAsOf: '2026-02-02T00:30:17.000Z',
      remainingCoverageDays: 0,
      consecutiveFailures: 2,
      lastSuccess: null,
      pendingRuns: 0,
      sources: [
        {
          source: 'cao-syukujitsu-csv',
          observation: 'failed',
          reason: 'fetch failed',
          consecutiveFailures: 2,
        },
      ],
      reasons: ['Some source observations are unknown'],
    })
  })
  it('carries what the domain does not know as null, and a last success as an instant', async () => {
    const unknown = {
      ...health,
      knowledgeAsOf: null,
      remainingCoverageDays: null,
      lastSuccess: '2026-11-18T00:00:00.000Z',
    }
    const answer: any = await world({ health: { kind: 'ok', value: [unknown] } }).ops[
      'read-supply-health'
    ](call, {
      tenant: tenantId,
    })
    const [item] = answer.body.calendars
    expect([
      item.knowledgeAsOf,
      item.remainingCoverageDays,
      encodeInstant(item.lastSuccess),
    ]).toEqual([null, null, '2026-11-18T00:00:00.000Z'])
  })
  it('answers denied before the domain when the login cannot act for the tenant', async () => {
    const asked: string[] = []
    const contribution = createCalendarContribution({
      principals: {
        async actingFor() {
          return { refused: 'denied' } as const
        },
        contextOf: () => context,
      },
      faces: () => {
        asked.push('faces')
        return undefined
      },
      requestId: () => 'r-1',
    })
    expect(await contribution.operations['read-supply-health'](call, { tenant: tenantId })).toEqual(
      {
        outcome: 'denied',
      },
    )
    expect(asked).toEqual([])
  })
  it('answers denied or an unavailable basis for a refusal, never an empty list', async () => {
    for (const [code, outcome] of [
      ['forbidden', 'denied'],
      ['provider_failure', 'basis-unavailable'],
      ['authority_unavailable', 'basis-unavailable'],
    ] as const)
      expect(
        await world({ health: error(code) }).ops['read-supply-health'](call, { tenant: tenantId }),
      ).toEqual({ outcome })
  })
  it('answers an unavailable basis when the domain throws or keeps an invalid instant', async () => {
    expect(
      await world({ health: new Error('down') }).ops['read-supply-health'](call, {
        tenant: tenantId,
      }),
    ).toEqual({ outcome: 'basis-unavailable' })
    const bad = { kind: 'ok', value: [{ ...health, knowledgeAsOf: 'yesterday' }] }
    expect(
      await world({ health: bad }).ops['read-supply-health'](call, { tenant: tenantId }),
    ).toEqual({ outcome: 'basis-unavailable' })
  })
  it('stops before the domain when the calendar row is not there', async () => {
    const { ops, asked } = world(null)
    expect(await ops['read-supply-health'](call, { tenant: tenantId })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(asked).toEqual([])
  })
})

describe('answer on a named calendar and version', () => {
  const question = { kind: 'day', date: '2026-11-03' } as const
  it('refuses a version without its calendar, or an empty calendar or version, before the domain', async () => {
    const { ops, asked } = world({})
    for (const named of [
      { version: 'v-0' },
      { calendar: '' },
      { calendar: 'jp-legal-holidays', version: '' },
    ])
      expect(
        await ops.answer(call, { tenant: tenantId, question, ...named }),
        JSON.stringify(named),
      ).toEqual({
        outcome: 'invalid',
        body: { reason: 'input' },
      })
    expect(asked).toEqual([])
  })
  it('resolves on the named calendar at its latest version, or the named version', async () => {
    const { ops, asked } = world({ resolve: { kind: 'ok', value: resolution } })
    const latest: any = await ops.answer(call, {
      tenant: tenantId,
      question,
      calendar: 'jp-legal-holidays',
    })
    expect(latest).toMatchObject({
      outcome: 'succeeded',
      body: { calendar: 'jp-legal-holidays', version: 'v-0' },
    })
    await ops.answer(call, {
      tenant: tenantId,
      question,
      calendar: 'jp-legal-holidays',
      version: 'v-0',
    })
    expect(
      asked.map(([name, args]) => [name, (args[1] as any).selection, (args[1] as any).version]),
    ).toEqual([
      ['resolve', { kind: 'explicit', calendarId: 'jp-legal-holidays' }, { kind: 'latest' }],
      [
        'resolve',
        { kind: 'explicit', calendarId: 'jp-legal-holidays' },
        { kind: 'pinned', versionId: 'v-0' },
      ],
    ])
  })
  it('answers an unknown version as unsupported, an unknown calendar as denied', async () => {
    expect(
      await world({ resolve: error('unknown_calendar_version') }).ops.answer(call, {
        tenant: tenantId,
        question,
        calendar: 'jp-legal-holidays',
        version: 'nope',
      }),
    ).toEqual({ outcome: 'unsupported', body: { reason: 'coverage' } })
    expect(
      await world({ resolve: error('not_found') }).ops.answer(call, {
        tenant: tenantId,
        question,
        calendar: 'xx-nowhere',
      }),
    ).toEqual({ outcome: 'denied' })
  })
  it('keeps the effective calendar when nothing is named', async () => {
    const { ops, asked } = world({ answer: { kind: 'ok', value: resolution } })
    await ops.answer(call, { tenant: tenantId, question })
    expect(asked.map(([name]) => name)).toEqual(['answer'])
  })
})
