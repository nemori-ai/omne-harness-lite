import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  computeUsFederalCalendar,
  parseCabinetOfficeCsv,
  parseCgZhouCalendar,
  parseCgZhouHorizon,
  parseFederalRegisterClosures,
  parseLanceliaoCalendar,
  parseOpmCalendar,
  parseVacanzaCalendar,
} from '../../src/supply/index.ts'
import type { SourceParseResult } from '../../src/supply/index.ts'

const material = {
  acquiredAt: '2026-08-21T00:00:00Z',
  knowledgeAsOf: '2026-08-20T00:00:00Z',
  reference:
    'fixed a7dbd98f fixtures; provenance.json distinguishes captured and reconstructed samples',
}
const bytes = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
const text = (name: string) => bytes(name).toString('utf8')
const content = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const success = (result: SourceParseResult) => {
  expect(result.kind).toBe('success')
  if (result.kind !== 'success') throw new Error(JSON.stringify(result))
  return result.contribution
}
const fromText = (value: string) => ({ ...material, content: new TextEncoder().encode(value) })

// Mutations of captured inputs are fault injection, never authoritative data.
describe('CN real source formats', () => {
  it('replays the captured lanceliao artifact with 142 sourced overrides', () => {
    const contribution = success(
      parseLanceliaoCalendar({ ...material, content: bytes('holiday_api_capture_20260821.json') }),
    )
    expect(contribution.days).toHaveLength(142)
    expect(contribution.coverageIntervals).toEqual([{ start: '2022-12-31', end: '2026-12-31' }])
    expect(contribution.material.knowledgeAsOf).toBe(material.knowledgeAsOf)
    expect(
      contribution.checks.find(check => check.code === 'cn.in_lieu_subset_of_holidays')?.status,
    ).toBe('unknown')
    expect(
      contribution.days.every(day =>
        day.provenance.every(record => record.rawSha256 === contribution.material.rawSha256),
      ),
    ).toBe(true)
  })
  it.each([
    [
      'Duration mismatch',
      text('holiday_api_sample.json').replace('"Duration": 3', '"Duration": 4'),
    ],
    ['impossible date', text('holiday_api_sample.json').replace('2022-12-31', '2022-02-30')],
    ['missing authority', text('holiday_api_sample.json').replace(/"URL": "[^"]+"/, '"URL": ""')],
    [
      'untrusted host',
      text('holiday_api_sample.json').replaceAll('www.gov.cn', 'gov.cn.evil.example'),
    ],
    ['HTML', '<html>upstream unavailable</html>'],
    ['empty years', '{"Years":{}}'],
  ])('rejects %s with retained raw hash/reference', (_name, value) => {
    const result = parseLanceliaoCalendar(fromText(value))
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'success') {
      expect(result.material.rawSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.findings[0]?.references).toContain(material.reference)
    }
  })
  const bundle = (yearText: string) => ({
    ...material,
    content: content({
      format: 'cg_zhou_year_bundle/v1',
      index: JSON.stringify({ regions: [{ name: 'CN', startYear: 2026, endYear: 2026 }] }),
      years: { 'data/CN/2026.json': yearText },
    }),
  })
  it('reads the actual cg-zhou year envelope and all transfer_workday entries', () => {
    const contribution = success(parseCgZhouCalendar(bundle(text('cn_2026.json'))))
    expect(contribution.days).toHaveLength(39)
    expect(contribution.days.filter(day => day.category === 'workingDay')).toHaveLength(6)
    expect(contribution.coverageIntervals).toEqual([{ start: '2026-01-01', end: '2026-12-31' }])
  })
  it.each([
    ['bare list', '[]'],
    ['empty holidays', '{"year":2026,"region":"CN","dates":[]}'],
    ['foreign region', text('cn_2026.json').replace('"CN"', '"JP"')],
    ['unknown type', text('cn_2026.json').replace('public_holiday', 'other')],
    ['far spillover', text('cn_2026.json').replace('2026-01-01', '2030-01-01')],
  ])('rejects cg-zhou %s', (_name, value) => {
    expect(parseCgZhouCalendar(bundle(value)).kind).toBe('rejected')
  })
  it('carries the horizon as a probe role rather than truth', () => {
    expect(success(parseCgZhouHorizon({ ...material, content: bytes('index.json') })).role).toBe(
      'horizonProbe',
    )
  })
})

describe('Japan source decoding and oracle seals', () => {
  it('decodes CP932, non-padded dates and explicit substitute holidays', () => {
    const contribution = success(
      parseCabinetOfficeCsv({ ...material, content: bytes('current_shape_excerpt.csv') }),
    )
    expect(contribution.days.find(day => day.date === '2026-05-06')?.category).toBe('holiday')
    expect(contribution.coverageIntervals.at(-1)?.end).toBe('2027-12-31')
  })
  it('rejects a wrong UTF8 encoding and incomplete CP932 byte', () => {
    expect(
      parseCabinetOfficeCsv({ ...material, content: bytes('current_shape_excerpt_utf8.csv') }).kind,
    ).toBe('rejected')
    expect(parseCabinetOfficeCsv({ ...material, content: Uint8Array.of(0x81) }).kind).toBe(
      'rejected',
    )
  })
  it('uses acquiredAt rather than wall clock to reject stale CSV', () => {
    expect(
      parseCabinetOfficeCsv({
        ...material,
        acquiredAt: '2030-01-01T00:00:00Z',
        content: bytes('current_shape_excerpt.csv'),
      }).kind,
    ).toBe('rejected')
  })
  // Explicit rendered oracle mappings exercise seals without installing/running Python holidays.
  const oracle = {
    country: 'JP',
    library_version: '0.80',
    window_start_year: 2026,
    window_end_year: 2026,
    supported_start_year: 1949,
    supported_end_year: 2100,
    years: { '2026': { '2026-01-01': '元日' } },
  }
  it('accepts rendered Vacanza dates with package version provenance', () => {
    expect(
      success(parseVacanzaCalendar({ ...material, content: content(oracle) })).days[0]
        ?.provenance[0]?.authorityRef,
    ).toBe('pypi:holidays==0.80')
  })
  it.each([
    { ...oracle, years: { '2026': {} } },
    { ...oracle, window_end_year: 2028 },
    { ...oracle, supported_start_year: 2027 },
    { ...oracle, country: 'US' },
    { ...oracle, years: { '2026': { '2025-01-01': 'wrong year' } } },
  ])('rejects empty, unsupported, unpromulgated or wrong-country oracle material', value => {
    expect(parseVacanzaCalendar({ ...material, content: content(value) }).kind).toBe('rejected')
  })
})

describe('US statutory identities and external material', () => {
  it('honors the MLK and Juneteenth effective years', () => {
    const beforeMlk = success(
      computeUsFederalCalendar({ ...material, start: '1985-01-01', end: '1985-12-31' }),
    )
    expect(beforeMlk.days.some(day => day.provenance.some(record => record.note === 'mlk'))).toBe(
      false,
    )
    const beforeJuneteenth = success(
      computeUsFederalCalendar({ ...material, start: '2020-01-01', end: '2020-12-31' }),
    )
    expect(beforeJuneteenth.days.some(day => day.date === '2020-06-19')).toBe(false)
    expect(
      success(
        computeUsFederalCalendar({ ...material, start: '2021-01-01', end: '2021-12-31' }),
      ).days.some(day => day.date === '2021-06-18'),
    ).toBe(true)
  })
  it('keeps inauguration regional and preserves a coinciding MLK note', () => {
    expect(
      success(
        computeUsFederalCalendar({ ...material, start: '2021-01-01', end: '2021-12-31' }),
      ).days.some(day => day.date === '2021-01-20'),
    ).toBe(false)
    expect(
      success(
        computeUsFederalCalendar({ ...material, start: '2025-01-01', end: '2025-12-31' }),
      ).days.find(day => day.date === '2025-01-20')?.provenance,
    ).toHaveLength(2)
  })
  it('replays captured OPM 112 events while excluding standalone inauguration', () => {
    const contribution = success(
      parseOpmCalendar({
        ...material,
        mediaType: 'text/calendar',
        content: bytes('holidays_capture_20260821.ics'),
      }),
    )
    expect(contribution.days).toHaveLength(110)
    expect(contribution.days.some(day => day.date === '2021-12-31')).toBe(true)
    expect(contribution.days.some(day => day.date === '2021-01-20')).toBe(false)
  })
  it.each([
    ['HTML with calendar content-type', '<html>error</html>', 'text/calendar'],
    ['wrong content-type', text('holidays_dossier_shapes.ics'), 'text/html'],
    [
      'truncated event',
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nEND:VCALENDAR',
      'text/calendar',
    ],
    [
      'datetime DTSTART',
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260101T120000Z\nEND:VEVENT\nEND:VCALENDAR',
      'text/calendar',
    ],
  ])('rejects OPM %s', (_name, value, mediaType) => {
    expect(parseOpmCalendar({ ...fromText(value), mediaType }).kind).toBe('rejected')
  })
  it('merges same-date OPM records and retains both provenances', () => {
    const ics =
      'BEGIN:VCALENDAR\nVERSION:2.0\n' +
      ['one', 'two']
        .map(name => `BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nSUMMARY:${name}\nEND:VEVENT\n`)
        .join('') +
      'END:VCALENDAR'
    const day = success(parseOpmCalendar({ ...fromText(ics), mediaType: 'text/calendar' })).days[0]
    expect(day?.provenance.map(record => record.note)).toEqual(['one', 'two'])
  })
  it('replays captured Federal Register bodies, keeping citation dates out', () => {
    const result = parseFederalRegisterClosures({
      ...material,
      content: content({
        kind: 'federal_register_eo_bundle',
        schema_version: 1,
        pages: [JSON.parse(text('documents_bounded_capture_20260821.json'))],
        bodies: {
          '2025-23847': text('body_capture_2025-23847_20260821.txt'),
          '2024-31766': text('body_capture_2024-31766_20260821.txt'),
        },
      }),
    })
    const contribution = success(result)
    expect(contribution.days.map(day => day.date)).toEqual([
      '2025-01-09',
      '2025-12-24',
      '2025-12-26',
    ])
  })
  const frBundle = (
    body: string,
    title = 'Half-Day Closing of Executive Departments',
    documentNumber = 'test-document',
  ) => ({
    kind: 'federal_register_eo_bundle',
    schema_version: 1,
    pages: [
      {
        results: [
          {
            title,
            document_number: documentNumber,
            executive_order_number: 99999,
            publication_date: '2026-01-02',
          },
        ],
      },
    ],
    bodies: { [documentNumber]: body },
  })
  it('keeps half-day closing as a working-day note', () => {
    const contribution = success(
      parseFederalRegisterClosures({
        ...material,
        content: content(
          frBundle(
            'Executive Departments shall be closed for the last half of Thursday, January 1, 2026.',
          ),
        ),
      }),
    )
    expect(contribution.days[0]?.category).toBe('workingDay')
    expect(contribution.days[0]?.provenance[0]?.note).toContain('half-day')
  })
  it.each([
    { kind: 'federal_register_eo_bundle', schema_version: 1, pages: [{ results: [] }], bodies: {} },
    { ...frBundle('No operative date.'), bodies: {} },
    frBundle('No operative date.'),
    {
      ...frBundle('closed on January 1, 2026.'),
      pages: [{ results: [], next_page_url: 'still-more' }],
    },
  ])('rejects missing bodies, dates and incomplete scans', value => {
    expect(parseFederalRegisterClosures({ ...material, content: content(value) }).kind).toBe(
      'rejected',
    )
  })
})

it('rejects a repeated oracle date key instead of silently keeping the last value', () => {
  const raw =
    '{"country":"JP","library_version":"test","window_start_year":2026,"window_end_year":2026,"supported_start_year":1949,"supported_end_year":2100,"years":{"2026":{"2026-01-01":"first","2026-01-01":"second"}}}'
  expect(parseVacanzaCalendar(fromText(raw)).kind).toBe('rejected')
})

it('does not fill unannounced Chinese years between separated Years keys', () => {
  const contribution = success(
    parseLanceliaoCalendar({ ...material, content: bytes('holiday_api_sample.json') }),
  )
  expect(contribution.coverageIntervals).toHaveLength(2)
  expect(
    contribution.coverageIntervals.some(
      interval => interval.start <= '2025-01-01' && interval.end >= '2025-01-01',
    ),
  ).toBe(false)
})

it('preserves a UTF8 BOM for the strict JSON reader to reject', () => {
  const raw = bytes('holiday_api_sample.json')
  const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...raw])
  expect(parseLanceliaoCalendar({ ...material, content: withBom }).kind).toBe('rejected')
})
