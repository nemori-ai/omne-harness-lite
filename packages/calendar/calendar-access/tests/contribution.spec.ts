import { describe, expect, it } from 'vitest'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { CalendarCallContext } from '@omne-harness/calendar-contract'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
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
const login = {} as LoginIdentity
const principal = {} as Principal
const context = { requestId: 'r-1' } as unknown as CalendarCallContext
const call = { principal: login } as never
const basis = {
  calendarId: 'cn-legal-holidays',
  versionId: 'v-1',
  coverageStart: '2020-01-01',
  coverageEnd: '2026-12-31',
}
const error = (code: string) => ({
  kind: 'error',
  error: { code, message: '', retryable: false, requestId: 'r-1', details: {} },
})

function world(
  options: {
    refused?: 'denied' | 'basis-unavailable' | 'throws'
    faces?: Partial<{ list: unknown; effective: unknown; answer: unknown }> | null
  } = {},
) {
  const asked: unknown[] = []
  const reply =
    (value: unknown) =>
    async (...args: unknown[]) => {
      asked.push(args)
      if (value instanceof Error) throw value
      return value
    }
  const faces =
    options.faces === null
      ? undefined
      : ({
          queries: { list: reply(options.faces?.list), effective: reply(options.faces?.effective) },
          calculator: { answer: reply(options.faces?.answer) },
        } as unknown as CalendarFaces)
  const contribution = createCalendarContribution({
    principals: {
      async actingFor() {
        if (options.refused === 'throws') throw new Error('identity down')
        return options.refused === undefined ? { ok: principal } : { refused: options.refused }
      },
      contextOf: () => context,
    },
    faces: () => faces,
    requestId: () => 'r-1',
  })
  return { ops: contribution.operations, asked }
}

describe('the first three steps', () => {
  it.each([
    ['a refused login', { refused: 'denied' as const }, 'denied'],
    ['an unavailable identity', { refused: 'basis-unavailable' as const }, 'basis-unavailable'],
    ['an identity that throws', { refused: 'throws' as const }, 'basis-unavailable'],
    ['no calendar row', { faces: null }, 'basis-unavailable'],
  ])('%s stops every operation before the domain', async (_label, options, outcome) => {
    const { ops, asked } = world(options)
    expect(await ops['list-calendars'](call, { tenant: tenantId })).toEqual({ outcome })
    expect(await ops['read-environment'](call, { tenant: tenantId })).toEqual({ outcome })
    expect(
      await ops.answer(call, { tenant: tenantId, question: { kind: 'day', date: '2026-10-11' } }),
    ).toEqual({ outcome })
    expect(asked).toEqual([])
  })
})

describe('answer', () => {
  it('answers on the calendar it was told and names it', async () => {
    const { ops, asked } = world({
      faces: {
        answer: {
          kind: 'ok',
          value: {
            ...basis,
            result: {
              kind: 'day',
              value: {
                kind: 'ok',
                date: '2026-10-11',
                classification: 'workingDay',
                working: true,
                holiday: false,
                override: true,
                provenanceRefs: [],
                basis: {},
              },
            },
          },
        },
      },
    })
    expect(
      await ops.answer(call, { tenant: tenantId, question: { kind: 'day', date: '2026-10-11' } }),
    ).toEqual({
      outcome: 'succeeded',
      body: {
        calendar: 'cn-legal-holidays',
        version: 'v-1',
        coverageStart: '2020-01-01',
        coverageEnd: '2026-12-31',
        result: {
          kind: 'day',
          date: '2026-10-11',
          classification: 'workingDay',
          working: true,
          adjusted: true,
        },
      },
    })
    expect(asked).toEqual([[context, { kind: 'day', date: '2026-10-11' }]])
  })

  it('turns a backward shift into a negative offset', async () => {
    const { ops, asked } = world({
      faces: {
        answer: {
          kind: 'ok',
          value: {
            ...basis,
            result: { kind: 'shift', value: { kind: 'ok', date: '2026-09-25', basis: {} } },
          },
        },
      },
    })
    const answered = await ops.answer(call, {
      tenant: tenantId,
      question: { kind: 'shift', date: '2026-10-08', direction: 'backward', days: 3 },
    })
    expect(answered).toMatchObject({
      outcome: 'succeeded',
      body: { result: { kind: 'shift', date: '2026-09-25' } },
    })
    expect(asked).toEqual([[context, { kind: 'shift', date: '2026-10-08', offset: -3 }]])
  })

  it('refuses an unordered range before the domain', async () => {
    const { ops, asked } = world()
    expect(
      await ops.answer(call, {
        tenant: tenantId,
        question: { kind: 'count', from: '2026-10-09', to: '2026-10-01' },
      }),
    ).toEqual({ outcome: 'invalid', body: { reason: 'input' } })
    expect(asked).toEqual([])
  })

  it.each([
    ['coverage_insufficient', { outcome: 'unsupported', body: { reason: 'coverage' } }],
    ['search_limit', { outcome: 'unsupported', body: { reason: 'search-limit' } }],
    ['missing_environment', { outcome: 'unsupported', body: { reason: 'environment' } }],
    ['invalid_timezone', { outcome: 'invalid', body: { reason: 'timezone' } }],
    ['forbidden', { outcome: 'denied' }],
    ['provider_failure', { outcome: 'basis-unavailable' }],
  ])('answers the domain refusal %s by its kind', async (code, outcome) => {
    const { ops } = world({ faces: { answer: error(code) } })
    expect(
      await ops.answer(call, { tenant: tenantId, question: { kind: 'day', date: '2026-10-11' } }),
    ).toEqual(outcome)
  })

  it('answers an unavailable basis when the calculator throws', async () => {
    const { ops } = world({ faces: { answer: new Error('down') } })
    expect(
      await ops.answer(call, { tenant: tenantId, question: { kind: 'day', date: '2026-10-11' } }),
    ).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('list-calendars and read-environment', () => {
  const info = (calendarId: string, published: string | null) => ({
    calendarId,
    timezone: 'Asia/Shanghai',
    semanticBoundary: 'x',
    publishedVersionId: published,
    publicationGeneration: 1,
    versions: {
      items: [{ versionId: 'v-1', coverageStart: '2020-01-01', coverageEnd: '2026-12-31' }],
      nextCursor: null,
    },
    supplyStanding: null,
  })

  it('lists each calendar with the coverage of its published version', async () => {
    const { ops } = world({
      faces: {
        list: {
          kind: 'ok',
          value: {
            items: [info('cn-legal-holidays', 'v-1'), info('jp-legal-holidays', null)],
            nextCursor: null,
            observedAt: 'x',
          },
        },
      },
    })
    expect(await ops['list-calendars'](call, { tenant: tenantId })).toEqual({
      outcome: 'succeeded',
      body: {
        calendars: [
          {
            calendar: 'cn-legal-holidays',
            timezone: 'Asia/Shanghai',
            version: 'v-1',
            coverageStart: '2020-01-01',
            coverageEnd: '2026-12-31',
          },
          {
            calendar: 'jp-legal-holidays',
            timezone: 'Asia/Shanghai',
            version: null,
            coverageStart: null,
            coverageEnd: null,
          },
        ],
      },
    })
  })

  it('reads the environment and its revision', async () => {
    const { ops } = world({
      faces: {
        effective: {
          kind: 'ok',
          value: {
            owner: {},
            environmentRevision: '3',
            activeTimezone: 'Asia/Shanghai',
            calendar: info('cn-legal-holidays', 'v-1'),
          },
        },
      },
    })
    expect(await ops['read-environment'](call, { tenant: tenantId })).toEqual({
      outcome: 'succeeded',
      body: {
        calendar: 'cn-legal-holidays',
        timezone: 'Asia/Shanghai',
        revision: '3',
        version: 'v-1',
      },
    })
  })

  it.each([
    ['missing_environment', { outcome: 'unsupported', body: { reason: 'environment' } }],
    ['invalid_input', { outcome: 'basis-unavailable' }],
    ['not_found', { outcome: 'denied' }],
  ])('answers the environment refusal %s', async (code, outcome) => {
    const { ops } = world({ faces: { effective: error(code) } })
    expect(await ops['read-environment'](call, { tenant: tenantId })).toEqual(outcome)
  })

  it('answers a list refusal by denied or an unavailable basis only', async () => {
    expect(
      await world({ faces: { list: error('forbidden') } }).ops['list-calendars'](call, {
        tenant: tenantId,
      }),
    ).toEqual({ outcome: 'denied' })
    expect(
      await world({ faces: { list: error('coverage_insufficient') } }).ops['list-calendars'](call, {
        tenant: tenantId,
      }),
    ).toEqual({ outcome: 'basis-unavailable' })
    expect(
      await world({ faces: { list: new Error('x') } }).ops['list-calendars'](call, {
        tenant: tenantId,
      }),
    ).toEqual({ outcome: 'basis-unavailable' })
  })
})
