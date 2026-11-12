import { lanceliaoEvidenceBundleSchema } from '@omne-harness/calendar'
import { localDateSchema } from '@omne-harness/calendar-contract'
import { z } from 'zod'
import {
  bundleResponses,
  decodeJson,
  digest,
  encode,
  responseMarker,
  utf8,
  type SourceHttp,
} from './http.ts'
import type { CalendarSourceAdapterOptions } from './types.ts'

export const calendarSourceUrls = Object.freeze({
  lanceliao:
    'https://raw.githubusercontent.com/lanceliao/china-holiday-calender/master/holidayAPI.json',
  cgIndex: 'https://raw.githubusercontent.com/cg-zhou/holiday-calendar/main/data/index.json',
  cgYearRoot: 'https://raw.githubusercontent.com/cg-zhou/holiday-calendar/main/data/CN/',
  cabinetOffice: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
  opm: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics',
  federalRegister: 'https://www.federalregister.gov/api/v1/documents.json',
})
export interface SourcePayload {
  readonly content: Uint8Array
  readonly mediaType: string
  readonly authorityRef: string
  readonly marker: string
  readonly authorityCoverageEnd: ReturnType<typeof localDateSchema.parse> | null
}
export const cgIndexSchema = z.object({
  regions: z.array(
    z.object({
      name: z.string(),
      startYear: z.number().int().min(1).max(9998),
      endYear: z.number().int().min(1).max(9998),
    }),
  ),
})
export function cgRange(content: Uint8Array) {
  const regions = cgIndexSchema
    .parse(decodeJson(content))
    .regions.filter(region => region.name === 'CN')
  const range = regions.at(0)
  if (regions.length !== 1 || !range || range.startYear > range.endYear)
    throw new Error('Index must declare one valid CN range')
  return range
}
export async function acquireCg(http: SourceHttp, horizonOnly: boolean): Promise<SourcePayload> {
  const index = await http.read(calendarSourceUrls.cgIndex)
  const range = cgRange(index.content)
  const authorityCoverageEnd = localDateSchema.parse(`${range.endYear}-12-31`)
  if (horizonOnly)
    return {
      content: index.content,
      mediaType: 'application/json',
      authorityRef: calendarSourceUrls.cgIndex,
      marker: `endYear:${range.endYear}`,
      authorityCoverageEnd,
    }
  if (range.endYear - range.startYear + 1 > http.limits.maxYears)
    throw new Error('CN index year limit exceeded')
  const years: Record<string, string> = {}
  for (let year = range.startYear; year <= range.endYear; year++) {
    const response = await http.read(`${calendarSourceUrls.cgYearRoot}${year}.json`)
    const text = utf8(response.content)
    z.object({
      year: z.literal(year),
      region: z.literal('CN'),
      dates: z.array(z.unknown()).nonempty(),
    }).parse(decodeJson(response.content))
    years[`data/CN/${year}.json`] = text
  }
  return {
    content: encode({
      format: 'cg_zhou_year_bundle/v1',
      index: utf8(index.content),
      years,
      responses: bundleResponses(http.responses),
    }),
    mediaType: 'application/json',
    authorityRef: 'https://github.com/cg-zhou/holiday-calendar',
    marker: responseMarker(http.responses),
    authorityCoverageEnd,
  }
}
const frDocument = z.object({
  document_number: z.string().min(1),
  title: z.string().min(1),
  publication_date: localDateSchema,
  signing_date: localDateSchema.nullish(),
  executive_order_number: z.union([z.string(), z.number()]).nullish(),
  raw_text_url: z.url().nullish(),
})
const frPage = z.object({
  results: z.array(frDocument),
  count: z.int().nonnegative().optional(),
  total_pages: z.int().positive().optional(),
  next_page_url: z.url().nullable().optional(),
})
const frFields = [
  'document_number',
  'title',
  'publication_date',
  'signing_date',
  'raw_text_url',
  'executive_order_number',
]
export function federalRegisterListUrl(options: CalendarSourceAdapterOptions): string {
  if (!options.usWindow) throw new Error('US publication window is not configured')
  const floor = localDateSchema.parse(options.usWindow.federalRegisterScanFloor)
  const start = localDateSchema.parse(options.usWindow.start)
  if (floor > start) throw new Error('Federal Register scan floor excludes the publication window')
  const url = new URL(calendarSourceUrls.federalRegister)
  url.searchParams.set('conditions[presidential_document_type][]', 'executive_order')
  url.searchParams.set('order', 'newest')
  url.searchParams.set('per_page', '1000')
  for (const field of frFields) url.searchParams.append('fields[]', field)
  url.searchParams.set('conditions[publication_date][gte]', floor)
  if (options.usWindow.federalRegisterScanThrough !== undefined) {
    const through = localDateSchema.parse(options.usWindow.federalRegisterScanThrough)
    if (through < floor) throw new Error('Federal Register cutoff precedes its scan floor')
    url.searchParams.set('conditions[publication_date][lte]', through)
  }
  return url.href
}
function checkFrPageUrl(value: string, initial: string): string {
  const url = new URL(value)
  const first = new URL(initial)
  if (url.origin !== first.origin || url.pathname !== first.pathname)
    throw new Error('Federal Register pagination left its list endpoint')
  for (const [key, expected] of first.searchParams) {
    if (!url.searchParams.getAll(key).includes(expected))
      throw new Error('Federal Register pagination changed its scan or fields')
  }
  return url.href
}
function verifyFrCompleteness(pages: readonly unknown[], required: boolean): void {
  const parsed = pages.map(page => frPage.parse(page))
  const count = parsed.reduce((sum, page) => sum + page.results.length, 0)
  for (const page of parsed) {
    if (required && (page.count === undefined || page.total_pages === undefined))
      throw new Error('Bounded Federal Register scan lacks completeness metadata')
    if (page.count !== undefined && page.count !== count)
      throw new Error('Federal Register result count is incomplete or changed during pagination')
    if (page.total_pages !== undefined && page.total_pages !== pages.length)
      throw new Error('Federal Register page count is incomplete or changed during pagination')
  }
}
async function collectFrBodies(
  http: SourceHttp,
  documents: readonly z.infer<typeof frDocument>[],
  collected: { seen: Set<string>; bodies: Record<string, string>; hits: number },
): Promise<void> {
  for (const document of documents) {
    if (collected.seen.has(document.document_number))
      throw new Error('Duplicate Federal Register document')
    collected.seen.add(document.document_number)
    if (!/Clos(ing|ure) of Executive Departments/i.test(document.title)) continue
    if (++collected.hits > http.limits.maxBodies)
      throw new Error('Federal Register body count limit exceeded')
    if (!document.raw_text_url || !document.executive_order_number)
      throw new Error('Federal Register closing lacks body URL or executive order number')
    const body = await http.read(document.raw_text_url)
    const text = utf8(body.content)
    if (!text.trim() || /^\s*</.test(text))
      throw new Error('Federal Register raw text is empty or HTML')
    collected.bodies[document.document_number] = text
  }
}
export async function acquireFederalRegister(
  http: SourceHttp,
  options: CalendarSourceAdapterOptions,
): Promise<SourcePayload> {
  const initial = federalRegisterListUrl(options)
  let next: string | null = initial
  const pages: unknown[] = []
  const bodies: Record<string, string> = {}
  const seen = new Set<string>()
  const collected = { seen, bodies, hits: 0 }
  while (next) {
    if (pages.length >= http.limits.maxPages)
      throw new Error('Federal Register page limit exceeded')
    const response = await http.read(checkFrPageUrl(next, initial))
    const raw = decodeJson(response.content)
    const page = frPage.parse(raw)
    const floor = options.usWindow?.federalRegisterScanFloor
    const through = options.usWindow?.federalRegisterScanThrough
    if (
      page.results.some(
        document =>
          (floor !== undefined && document.publication_date < floor) ||
          (through !== undefined && document.publication_date > through),
      )
    )
      throw new Error('Federal Register result is outside its declared publication scan')
    pages.push(raw)
    await collectFrBodies(http, page.results, collected)
    next = page.next_page_url ?? null
  }
  if (!seen.size) throw new Error('Federal Register aggregate list is empty')
  verifyFrCompleteness(pages, options.usWindow?.federalRegisterScanThrough !== undefined)
  return {
    content: encode({
      kind: 'federal_register_eo_bundle',
      schema_version: 1,
      pages,
      bodies,
      window: options.usWindow,
      responses: bundleResponses(http.responses),
    }),
    mediaType: 'application/json',
    authorityRef: initial,
    marker: responseMarker(http.responses),
    authorityCoverageEnd: null,
  }
}
function validateSingleResponse(
  response: Awaited<ReturnType<SourceHttp['read']>>,
  kind: 'json' | 'csv' | 'ics',
  mediaType: string,
): void {
  if (kind === 'ics') {
    const text = utf8(response.content).trim()
    if (
      mediaType !== 'text/calendar' ||
      !text.startsWith('BEGIN:VCALENDAR') ||
      !text.endsWith('END:VCALENDAR') ||
      !text.includes('BEGIN:VEVENT')
    )
      throw new Error('OPM response is not a complete text/calendar document')
  } else if (kind === 'json') {
    z.record(z.string(), z.unknown()).parse(decodeJson(response.content))
  } else if (mediaType !== 'text/csv' || response.content[0] === 60) {
    throw new Error('Cabinet Office response is not CSV')
  }
}
export async function acquireSingle(
  http: SourceHttp,
  input: { url: string; kind: 'json' | 'csv' | 'ics'; userAgent?: string },
): Promise<SourcePayload> {
  const response = await http.read(
    input.url,
    'GET',
    input.userAgent ? { 'user-agent': input.userAgent } : {},
  )
  const mediaType = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? ''
  validateSingleResponse(response, input.kind, mediaType)
  return {
    content: response.content,
    mediaType: input.kind === 'json' ? 'application/json' : mediaType,
    authorityRef: input.url,
    marker: responseMarker(http.responses),
    authorityCoverageEnd: null,
  }
}

export async function acquireLanceliao(
  http: SourceHttp,
  options: CalendarSourceAdapterOptions,
): Promise<SourcePayload> {
  const primary = await acquireSingle(http, { url: calendarSourceUrls.lanceliao, kind: 'json' })
  if (!options.cnValidationEvidence) return primary
  const bundle = lanceliaoEvidenceBundleSchema.parse({
    format: 'lanceliao_evidence_bundle/v1',
    primary: utf8(primary.content),
    supplement: options.cnValidationEvidence,
  })
  const content = encode(bundle)
  return { ...primary, content, marker: digest(content) }
}
