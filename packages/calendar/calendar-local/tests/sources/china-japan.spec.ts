import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import {
  parseCabinetOfficeCsv,
  parseCgZhouCalendar,
  parseLanceliaoCalendar,
} from '@omne-harness/calendar'
import { acquiredAt, server, source, sendJson, yearDocument } from './fixtures.ts'

it('discovers a new CN year and detects historical content revisions independently of endYear', async () => {
  let endYear = 2026
  let oldName = 'New Year'
  const paths: string[] = []
  const origin = await server((request, response) => {
    const path = request.url ?? ''
    paths.push(path)
    if (path.endsWith('index.json'))
      sendJson(response, { regions: [{ name: 'CN', startYear: 2025, endYear }] })
    else {
      const year = Number(path.match(/(\d{4})\.json/)?.[1])
      sendJson(
        response,
        yearDocument(year, year === 2025 ? oldName : 'New Year'),
        year === 2025 ? 'Tue, 01 Sep 2026 00:00:00 GMT' : undefined,
      )
    }
  })
  const options = { testEndpoints: { origins: { 'https://raw.githubusercontent.com': origin } } }
  const oracle = source('cg-zhou-holiday-calendar', options)
  const horizon = source('cg-zhou-index-endyear', options)
  const first = await oracle.probe({ previous: null, observedAt: acquiredAt })
  const oldHorizon = await horizon.probe({ previous: null, observedAt: acquiredAt })
  expect(first.kind).toBe('changed')
  expect((await oracle.probe({ previous: first, observedAt: acquiredAt })).kind).toBe('unchanged')
  oldName = 'Corrected old holiday'
  expect((await oracle.probe({ previous: first, observedAt: acquiredAt })).kind).toBe('changed')
  expect((await horizon.probe({ previous: oldHorizon, observedAt: acquiredAt })).kind).toBe(
    'unchanged',
  )
  endYear = 2027
  expect(
    (await horizon.probe({ previous: oldHorizon, observedAt: acquiredAt })).authorityCoverageEnd,
  ).toBe('2027-12-31')
  const result = await oracle.acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') return
  expect(paths).toContain('/cg-zhou/holiday-calendar/main/data/CN/2027.json')
  expect(result.material.knowledgeAsOf).toBe('2026-09-01T00:00:00.000Z')
  const bundle = JSON.parse(Buffer.from(result.material.content).toString())
  expect(bundle.responses).toHaveLength(4)
  expect(Buffer.from(bundle.responses[1].contentBase64, 'base64').toString()).toBe(
    bundle.years['data/CN/2025.json'],
  )
  expect(parseCgZhouCalendar({ ...result.material, reference: 'test:cg-bundle' }).kind).toBe(
    'success',
  )
})
it('rejects excessive CN ranges and stops subsequent requests after cancellation', async () => {
  let requests = 0
  const abort = new AbortController()
  const origin = await server((_request, response) => {
    requests++
    sendJson(response, { regions: [{ name: 'CN', startYear: 1900, endYear: 2026 }] })
  })
  const adapter = source('cg-zhou-holiday-calendar', {
    testEndpoints: { origins: { 'https://raw.githubusercontent.com': origin } },
  })
  expect((await adapter.acquire({ acquiredAt })).kind).toBe('unavailable')
  expect(requests).toBe(1)
  abort.abort()
  expect((await adapter.acquire({ acquiredAt }, { signal: abort.signal })).kind).toBe('unavailable')
  expect(requests).toBe(1)
})
it('retains original CP932 bytes and uses HEAD validators only for discovery', async () => {
  const csv = await readFile(new URL('./fixtures/cabinet-office-cp932.csv', import.meta.url))
  const methods: string[] = []
  const origin = await server((request, response) => {
    methods.push(request.method ?? '')
    expect(request.headers['if-none-match']).toBeUndefined()
    response.writeHead(200, {
      'content-type': 'text/csv',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
      etag: '"stable"',
      'content-length': String(csv.byteLength),
    })
    response.end(request.method === 'HEAD' ? undefined : csv)
  })
  const adapter = source('cao-syukujitsu-csv', {
    testEndpoints: { origins: { 'https://www8.cao.go.jp': origin } },
  })
  const first = await adapter.probe({ previous: null, observedAt: acquiredAt })
  expect(first.kind).toBe('changed')
  expect((await adapter.probe({ previous: first, observedAt: acquiredAt })).kind).toBe('unchanged')
  const result = await adapter.acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') return
  expect(Buffer.from(result.material.content)).toEqual(csv)
  expect(parseCabinetOfficeCsv({ ...result.material, reference: 'test:cp932' }).kind).toBe(
    'success',
  )
  expect(methods).toEqual(['HEAD', 'HEAD', 'GET'])
})
it('never uses lanceliao Generated as a knowledge timestamp', async () => {
  const origin = await server((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ Generated: '2026-10-01T00:00:00Z', Years: {} }))
  })
  const adapter = source('lanceliao-china-holiday-calender', {
    testEndpoints: { origins: { 'https://raw.githubusercontent.com': origin } },
  })
  expect((await adapter.acquire({ acquiredAt })).kind).toBe('unavailable')
})

it('cancels a CN bundle before admitting subsequent year fetches', async () => {
  let requests = 0
  const abort = new AbortController()
  const origin = await server((_request, response) => {
    requests++
    sendJson(response, { regions: [{ name: 'CN', startYear: 2025, endYear: 2026 }] })
  })
  const adapter = source('cg-zhou-holiday-calendar', {
    testEndpoints: { origins: { 'https://raw.githubusercontent.com': origin } },
    sourceKnowledgeResolver: async () => {
      abort.abort()
      return null
    },
  })
  expect((await adapter.acquire({ acquiredAt }, { signal: abort.signal })).kind).toBe('unavailable')
  expect(requests).toBe(1)
})
it('keeps primary and supplemental CN text intact and leaves validation to the pure parser', async () => {
  const primary = JSON.stringify(
    {
      Years: {
        '2026': [
          {
            StartDate: '2026-01-01',
            EndDate: '2026-01-01',
            Duration: 1,
            CompDays: [],
            URL: 'https://www.gov.cn/2026-notice',
            Memo: 'fixture holiday',
          },
        ],
      },
    },
    null,
    2,
  )
  const content = JSON.stringify({
    holidays: { '2026-01-01': 'fixture holiday' },
    workdays: {},
    inLieuDays: {},
  })
  const supplement = {
    sourceId: 'chinese-days' as const,
    version: 'fixture-v1',
    coverageStart: '2026-01-01',
    coverageEnd: '2026-12-31',
    reference: 'fixture:cn-evidence',
    sha256: createHash('sha256').update(content).digest('hex'),
    content,
  }
  const origin = await server((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.end(primary)
  })
  const options = { testEndpoints: { origins: { 'https://raw.githubusercontent.com': origin } } }
  const raw = await source('lanceliao-china-holiday-calender', options).acquire({ acquiredAt })
  if (raw.kind !== 'acquired') throw new Error(raw.reason)
  expect(Buffer.from(raw.material.content).toString()).toBe(primary)
  const rawParsed = parseLanceliaoCalendar({ ...raw.material, reference: 'test:raw' })
  if (rawParsed.kind !== 'success') throw new Error('raw fixture did not parse')
  expect(
    rawParsed.contribution.checks.find(check => check.code === 'cn.in_lieu_subset_of_holidays')
      ?.status,
  ).toBe('unknown')
  const enriched = await source('lanceliao-china-holiday-calender', {
    ...options,
    cnValidationEvidence: supplement,
  }).acquire({ acquiredAt })
  if (enriched.kind !== 'acquired') throw new Error(enriched.reason)
  expect(JSON.parse(Buffer.from(enriched.material.content).toString())).toEqual({
    format: 'lanceliao_evidence_bundle/v1',
    primary,
    supplement,
  })
  expect(enriched.material.transportEvidence?.[0]?.bodyHash).toBe(
    createHash('sha256').update(primary).digest('hex'),
  )
  const parsed = parseLanceliaoCalendar({ ...enriched.material, reference: 'test:enriched' })
  if (parsed.kind !== 'success') throw new Error('bundle fixture did not parse')
  expect(
    parsed.contribution.checks.find(check => check.code === 'cn.in_lieu_subset_of_holidays')
      ?.status,
  ).toBe('passed')
})
