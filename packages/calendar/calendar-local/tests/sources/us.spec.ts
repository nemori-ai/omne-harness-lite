import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { computeUsFederalCalendar, parseFederalRegisterClosures } from '@omne-harness/calendar'
import { acquiredAt, knowledgeAsOf, server, source, sendJson, usWindow } from './fixtures.ts'

const hit = {
  document_number: '2025-001',
  title: 'Half-Day Closing of Executive Departments',
  executive_order_number: '14001',
  publication_date: '2025-12-20',
  signing_date: '2025-12-19',
  raw_text_url: 'https://www.federalregister.gov/body/2025-001',
}
const other = {
  document_number: '2025-002',
  title: 'Other executive order',
  publication_date: '2025-12-21',
  signing_date: '2025-12-20',
}
it('requests explicit FR fields and scan floor, fetches only hits, and preserves half-day text', async () => {
  const requested: string[] = []
  const queries: URLSearchParams[] = []
  const body = 'Executive departments are closed for the last half of December 24, 2025.'
  const origin = await server((request, response) => {
    const url = new URL(request.url ?? '/', 'https://www.federalregister.gov')
    requested.push(url.pathname)
    if (url.pathname.startsWith('/body/')) {
      response.writeHead(200, {
        'content-type': 'text/plain',
        'last-modified': 'Mon, 01 Jun 2026 00:00:00 GMT',
      })
      response.end(body)
      return
    }
    queries.push(url.searchParams)
    if (url.searchParams.get('page') === '2')
      sendJson(response, { results: [other], next_page_url: null })
    else {
      url.searchParams.set('page', '2')
      sendJson(response, { results: [hit], next_page_url: url.href })
    }
  })
  const adapter = source('federal-register-eo-feed', {
    usWindow,
    testEndpoints: { origins: { 'https://www.federalregister.gov': origin } },
  })
  const result = await adapter.acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') return
  expect(requested.filter(path => path.startsWith('/body/'))).toEqual(['/body/2025-001'])
  for (const query of queries) {
    expect(query.getAll('fields[]')).toEqual([
      'document_number',
      'title',
      'publication_date',
      'signing_date',
      'raw_text_url',
      'executive_order_number',
    ])
    expect(query.get('conditions[publication_date][gte]')).toBe('2024-01-01')
    expect(query.get('conditions[presidential_document_type][]')).toBe('executive_order')
  }
  expect(result.material.knowledgeAsOf).toBe('2026-06-01T00:00:00.000Z')
  const bundle = JSON.parse(Buffer.from(result.material.content).toString())
  expect(bundle.responses).toHaveLength(3)
  expect(bundle.bodies['2025-001']).toBe(body)
  const parsed = parseFederalRegisterClosures({ ...result.material, reference: 'test:fr-bundle' })
  expect(parsed.kind).toBe('success')
  if (parsed.kind === 'success') expect(parsed.contribution.days[0]?.category).toBe('workingDay')
})
it.each([
  'page limit',
  'body limit',
  'bundle limit',
  'foreign body',
  'foreign next',
  'missing body',
  'empty list',
])('rejects FR %s without claiming complete acquisition', async failure => {
  let bodies = 0
  const origin = await server((request, response) => {
    const url = new URL(request.url ?? '/', 'https://www.federalregister.gov')
    if (url.pathname.startsWith('/body/')) {
      bodies++
      sendJson(response, { body: 'x'.repeat(500) })
      return
    }
    if (failure === 'page limit') {
      url.searchParams.set('page', '2')
      sendJson(response, { results: [other], next_page_url: url.href })
      return
    }
    if (failure === 'foreign next') {
      sendJson(response, {
        results: [other],
        next_page_url: 'https://evil.example/api/v1/documents.json',
      })
      return
    }
    if (failure === 'empty list') {
      sendJson(response, { results: [], next_page_url: null })
      return
    }
    const documents =
      failure === 'body limit'
        ? [hit, { ...hit, document_number: '2025-003' }]
        : [
            {
              ...hit,
              raw_text_url:
                failure === 'foreign body'
                  ? 'http://127.0.0.1:1/secrets'
                  : failure === 'missing body'
                    ? undefined
                    : hit.raw_text_url,
            },
          ]
    sendJson(response, { results: documents, next_page_url: null })
  })
  const adapter = source('federal-register-eo-feed', {
    usWindow,
    testEndpoints: { origins: { 'https://www.federalregister.gov': origin } },
    limits: {
      maxPages: 1,
      maxBodies: 1,
      ...(failure === 'bundle limit' ? { maxBundleBytes: 400 } : {}),
    },
  })
  const result = await adapter.acquire({ acquiredAt })
  expect(result.kind).toBe('unavailable')
  if (failure === 'foreign body') expect(bodies).toBe(0)
})
it('computes only the explicitly configured federal window with real rules knowledge', async () => {
  expect((await source('usc-6103-computed-rules').acquire({ acquiredAt })).kind).toBe('unavailable')
  const result = await source('usc-6103-computed-rules', { usWindow }).acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') return
  expect(JSON.parse(Buffer.from(result.material.content).toString())).toEqual({
    start: usWindow.start,
    end: usWindow.end,
  })
  expect(result.material.knowledgeAsOf).toBe(knowledgeAsOf)
  const parsed = computeUsFederalCalendar({
    ...usWindow,
    acquiredAt,
    knowledgeAsOf,
    reference: usWindow.authorityRef,
  })
  expect(parsed.kind).toBe('success')
  if (parsed.kind === 'success')
    expect(parsed.contribution.days.some(day => day.date === '2025-03-31')).toBe(false)
})
it.each(['valid', 'unsupported', 'empty', 'hash', 'version', 'window'])(
  'consumes a fixed Vacanza artifact: %s',
  async shape => {
    const document = {
      country: 'JP',
      library_version: '0.99-fixture',
      window_start_year: 2026,
      window_end_year: 2027,
      supported_start_year: 1955,
      supported_end_year: shape === 'unsupported' ? 2026 : 2027,
      years: {
        '2026': { '2026-01-01': '元日' },
        '2027': shape === 'empty' ? {} : { '2027-01-01': '元日' },
      },
    }
    const content = Buffer.from(JSON.stringify(document))
    const adapter = source('vacanza-holidays-library', {
      vacanzaArtifact: {
        read: async () => content,
        sha256:
          shape === 'hash' ? '0'.repeat(64) : createHash('sha256').update(content).digest('hex'),
        libraryVersion: shape === 'version' ? 'wrong-version' : document.library_version,
        knowledgeAsOf,
        reference: 'fixture:vacanza/0.99-fixture',
        startYear: 2026,
        endYear: shape === 'window' ? 2028 : 2027,
      },
    })
    expect((await adapter.acquire({ acquiredAt })).kind).toBe(
      shape === 'valid' ? 'acquired' : 'unavailable',
    )
  },
)
it('refuses an absent Vacanza artifact', async () => {
  expect((await source('vacanza-holidays-library').acquire({ acquiredAt })).kind).toBe(
    'unavailable',
  )
})
