import { z } from 'zod'
import { cnEvidenceChecks, lanceliaoEvidenceBundleSchema } from './cn-evidence.ts'
import {
  addDays,
  date,
  dates,
  decodeJson,
  finding,
  isoDate,
  normalizeCoverageIntervals,
  parseSupplyJson,
  sourceDay,
  sourceParser,
} from './common.ts'
import type {
  SourceParseInput,
  SourceParseResult,
  SupplyDay,
  SupplyInterval,
  SupplyMaterial,
} from './types.ts'

const lanceliaoEntry = z.object({
  StartDate: isoDate,
  EndDate: isoDate,
  Duration: z.number().int().positive(),
  CompDays: z.array(isoDate),
  URL: z.url().refine(value => {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))
    )
  }),
  Memo: z.string(),
})
const lanceliaoDocument = z.object({
  Years: z.record(z.string().regex(/^\d{4}$/), z.array(lanceliaoEntry).nonempty()),
})
function lanceliaoYear(
  entries: z.infer<typeof lanceliaoDocument>['Years'][string],
  years: z.infer<typeof lanceliaoDocument>['Years'],
  material: SupplyMaterial,
): { days: SupplyDay[]; interval: SupplyInterval } {
  const days: SupplyDay[] = []
  const yearDays: string[] = []
  for (const entry of entries) {
    if (
      entry.StartDate > entry.EndDate ||
      date(entry.StartDate).until(date(entry.EndDate)).days + 1 !== entry.Duration
    )
      throw new Error('Duration must equal the inclusive holiday interval')
    for (const day of dates({ start: entry.StartDate, end: entry.EndDate }))
      days.push(
        sourceDay(
          'lanceliao-china-holiday-calender',
          material,
          day,
          'holiday',
          entry.URL,
          entry.Memo,
        ),
      )
    for (const day of entry.CompDays)
      days.push(
        sourceDay(
          'lanceliao-china-holiday-calender',
          material,
          day,
          'workingDay',
          entry.URL,
          entry.Memo,
        ),
      )
    yearDays.push(entry.StartDate, entry.EndDate, ...entry.CompDays)
  }
  yearDays.sort()
  const start = yearDays.at(0)
  const last = yearDays.at(-1)
  if (!start || !last) throw new Error('announced year has no entries')
  return {
    days,
    interval: {
      start,
      end: years[last.slice(0, 4)] ? `${last.slice(0, 4)}-12-31` : last,
    },
  }
}
export function parseLanceliaoCalendar(input: SourceParseInput): SourceParseResult {
  const sourceId = 'lanceliao-china-holiday-calender'
  return sourceParser(sourceId, input, material => {
    const decoded = decodeJson(input)
    const bundle = lanceliaoEvidenceBundleSchema.safeParse(decoded)
    const document = lanceliaoDocument.parse(
      bundle.success ? parseSupplyJson(bundle.data.primary) : decoded,
    )
    const days: SupplyDay[] = []
    const intervals: SupplyInterval[] = []
    for (const entries of Object.values(document.Years)) {
      const year = lanceliaoYear(entries, document.Years, material)
      days.push(...year.days)
      intervals.push(year.interval)
    }
    return {
      days,
      coverageIntervals: normalizeCoverageIntervals(intervals),
      checks: [
        finding(
          'cn.entry_self_consistency',
          'passed',
          'Duration checked against every inclusive interval',
        ),
        ...cnEvidenceChecks({
          evidence: bundle.success ? bundle.data.supplement : undefined,
          days,
          coverage: normalizeCoverageIntervals(intervals),
          primaryReference: material.reference,
        }),
      ],
    }
  })
}
const cgIndex = z.object({
  regions: z.array(
    z.object({
      name: z.string(),
      startYear: z.number().int().min(1).max(9998),
      endYear: z.number().int().min(1).max(9998),
    }),
  ),
})
const cgRow = z.object({
  date: isoDate,
  name: z.string(),
  name_cn: z.string(),
  name_en: z.string(),
  type: z.enum(['public_holiday', 'transfer_workday']),
})
const cgYear = z.object({
  year: z.number().int(),
  region: z.literal('CN'),
  dates: z.array(cgRow).nonempty(),
})
const cgBundle = z.object({
  format: z.literal('cg_zhou_year_bundle/v1'),
  index: z.string(),
  years: z.record(z.string(), z.string()),
})
function parseCgYear(input: {
  year: number
  content: string
  material: SupplyMaterial
}): SupplyDay[] {
  const document = cgYear.parse(parseSupplyJson(input.content))
  if (document.year !== input.year || !document.dates.some(row => row.type === 'public_holiday'))
    throw new Error(`incoherent or empty holiday year ${input.year}`)
  return document.dates.map(row => {
    if (row.date < `${input.year - 1}-01-01` || row.date > `${input.year + 1}-12-31`)
      throw new Error('row outside adjacent boundary years')
    return sourceDay(
      'cg-zhou-holiday-calendar',
      input.material,
      row.date,
      row.type === 'public_holiday' ? 'holiday' : 'workingDay',
      `https://github.com/cg-zhou/holiday-calendar/blob/main/data/CN/${input.year}.json#${row.date}`,
      `${row.name_cn} (${row.name_en})`,
    )
  })
}

export function parseCgZhouCalendar(input: SourceParseInput): SourceParseResult {
  const sourceId = 'cg-zhou-holiday-calendar'
  return sourceParser(sourceId, input, material => {
    const bundle = cgBundle.parse(decodeJson(input))
    const index = cgIndex.parse(parseSupplyJson(bundle.index))
    const regions = index.regions.filter(region => region.name === 'CN')
    const region = regions.at(0)
    if (regions.length !== 1 || !region || region.startYear > region.endYear)
      throw new Error('index must declare exactly one usable CN range')
    if (Object.keys(bundle.years).length !== region.endYear - region.startYear + 1)
      throw new Error('year files do not match index range')
    const days: SupplyDay[] = []
    for (let year = region.startYear; year <= region.endYear; year++) {
      const path = `data/CN/${year}.json`
      const content = bundle.years[path]
      if (!content) throw new Error(`missing ${path}`)
      days.push(...parseCgYear({ year, content, material }))
    }
    const ordered = [
      ...days.map(day => day.date),
      `${region.startYear}-01-01`,
      `${region.endYear}-12-31`,
    ].sort()
    const start = ordered.at(0)
    const end = ordered.at(-1)
    if (!start || !end) throw new Error('empty CN range')
    return { days, coverageIntervals: [{ start, end }] }
  })
}
export function parseCgZhouHorizon(input: SourceParseInput): SourceParseResult {
  return sourceParser('cg-zhou-index-endyear', input, () => {
    const regions = cgIndex.parse(decodeJson(input)).regions.filter(region => region.name === 'CN')
    const region = regions.at(0)
    if (regions.length !== 1 || !region || region.startYear > region.endYear)
      throw new Error('invalid CN horizon')
    return {
      days: [],
      coverageIntervals: [
        { start: `${region.startYear}-01-01`, end: addDays(`${region.endYear + 1}-01-01`, -1) },
      ],
    }
  })
}
