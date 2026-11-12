import ICAL from 'ical.js'
import { z } from 'zod'
import { date, decode, decodeJson, isoDate, sourceDay, sourceParser } from './common.ts'
import type { SourceParseInput, SourceParseResult, SupplyDay, SupplyMaterial } from './types.ts'

function opmDay(
  event: InstanceType<typeof ICAL.Component>,
  material: SupplyMaterial,
): SupplyDay | null {
  if (
    event.getAllProperties('dtstart').length !== 1 ||
    event.hasProperty('rrule') ||
    event.hasProperty('rdate')
  )
    throw new Error('OPM event needs exactly one date and no recurrence')
  const rawStart: unknown = event.getFirstProperty('dtstart')?.toJSON()
  const summary: unknown = event.getFirstPropertyValue('summary')
  const [, , , day] = z
    .tuple([z.literal('dtstart'), z.unknown(), z.literal('date'), isoDate])
    .parse(rawStart)
  if (typeof summary === 'string' && /inauguration/i.test(summary)) return null
  return sourceDay(
    'opm-federal-holidays-ics',
    material,
    day,
    'holiday',
    'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics',
    typeof summary === 'string' ? summary : 'OPM observed holiday',
  )
}

function opmDocument(input: SourceParseInput): InstanceType<typeof ICAL.Component> {
  if (input.mediaType?.split(';')[0]?.trim().toLowerCase() !== 'text/calendar')
    throw new Error('OPM response must declare text/calendar')
  const text = decode(input).trim()
  if (!text.startsWith('BEGIN:VCALENDAR') || !text.endsWith('END:VCALENDAR'))
    throw new Error('incomplete or disguised VCALENDAR')
  const calendar = ICAL.Component.fromString(text)
  if (calendar.name !== 'vcalendar') throw new Error('not a VCALENDAR')
  return calendar
}
export function parseOpmCalendar(input: SourceParseInput): SourceParseResult {
  const sourceId = 'opm-federal-holidays-ics'
  return sourceParser(sourceId, input, material => {
    const calendar = opmDocument(input)
    const days: SupplyDay[] = []
    for (const event of calendar.getAllSubcomponents('vevent')) {
      const day = opmDay(event, material)
      if (day) days.push(day)
    }
    days.sort((a, b) => a.date.localeCompare(b.date))
    const start = days.at(0)?.date
    const end = days.at(-1)?.date
    if (!start || !end) throw new Error('OPM calendar has no observed holidays')
    for (let year = date(start).year; year <= date(end).year; year++)
      if (!days.some(day => date(day.date).year === year))
        throw new Error(`OPM internal empty year ${year}`)
    return { days, coverageIntervals: [{ start, end }] }
  })
}
const frDocument = z.object({
  title: z.string().min(1),
  document_number: z.string().min(1),
  executive_order_number: z.union([z.string().min(1), z.number().int().positive()]).optional(),
  publication_date: isoDate.optional(),
  signing_date: isoDate.optional(),
  raw_text_url: z.url().optional(),
})
const frPage = z.object({
  results: z.array(frDocument),
  next_page_url: z.string().nullable().optional(),
})
const frBundle = z.object({
  kind: z.literal('federal_register_eo_bundle'),
  schema_version: z.literal(1),
  pages: z.array(frPage).min(1).max(5),
  bodies: z.record(z.string(), z.string()),
})
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
function operativeDates(body: string): Set<string> {
  const effectDates = new Set<string>()
  for (const sentence of body.split('.')) {
    if (!/closed/i.test(sentence)) continue
    for (const match of sentence.matchAll(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/g,
    )) {
      const [, monthName, day, year] = match
      if (!monthName || !day || !year) throw new Error('missing effect date fields')
      effectDates.add(
        isoDate.parse(
          `${year}-${String(months.indexOf(monthName) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`,
        ),
      )
    }
  }
  return effectDates
}
function closureDays(
  document: z.infer<typeof frDocument>,
  bodies: Readonly<Record<string, string>>,
  material: SupplyMaterial,
): SupplyDay[] {
  if (document.executive_order_number === undefined)
    throw new Error('closing document lacks executive_order_number')
  const body = bodies[document.document_number]
  if (!body?.trim()) throw new Error(`missing body for ${document.document_number}`)
  const effectDates = operativeDates(body)
  if (!effectDates.size)
    throw new Error(`no operative closure date for ${document.document_number}`)
  const halfDay = /half[-\s]day|last half/i.test(document.title + '\n' + body)
  const authorityRef = `Federal Register document_number=${document.document_number}, executive_order_number=${document.executive_order_number}`
  return [...effectDates].map(day =>
    sourceDay(
      'federal-register-eo-feed',
      material,
      day,
      halfDay ? 'workingDay' : 'holiday',
      authorityRef,
      document.title + (halfDay ? '; half-day closing, retained as a note only' : ''),
    ),
  )
}

export function parseFederalRegisterClosures(input: SourceParseInput): SourceParseResult {
  const sourceId = 'federal-register-eo-feed'
  return sourceParser(sourceId, input, material => {
    const bundle = frBundle.parse(decodeJson(input))
    if (bundle.pages.at(-1)?.next_page_url)
      throw new Error('incomplete or unbounded Federal Register pagination')
    const documents = bundle.pages.flatMap(page => page.results)
    if (!documents.length) throw new Error('Federal Register aggregate list is empty')
    const seen = new Set<string>()
    const days: SupplyDay[] = []
    const scanDates: string[] = []
    for (const document of documents) {
      if (seen.has(document.document_number))
        throw new Error(`duplicate Federal Register document ${document.document_number}`)
      seen.add(document.document_number)
      if (document.publication_date) scanDates.push(document.publication_date)
      if (document.signing_date) scanDates.push(document.signing_date)
      if (!/Clos(ing|ure) of Executive Departments/i.test(document.title)) continue
      const closures = closureDays(document, bundle.bodies, material)
      days.push(...closures)
      scanDates.push(...closures.map(day => day.date))
    }
    scanDates.sort()
    const start = scanDates.at(0)
    const end = scanDates.at(-1)
    if (!start || !end) throw new Error('documents carry no scan/effect dates')
    return { days, coverageIntervals: [{ start, end }] }
  })
}
