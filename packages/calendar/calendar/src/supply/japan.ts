import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { date, decode, decodeJson, isoDate, sourceDay, sourceParser } from './common.ts'
import type { SourceParseInput, SourceParseResult, SupplyDay } from './types.ts'

const header = ['国民の祝日・休日月日', '国民の祝日・休日名称']
const csvRows = z.array(z.tuple([z.string(), z.string().min(1)])).min(2)
export function parseCabinetOfficeCsv(input: SourceParseInput): SourceParseResult {
  const sourceId = 'cao-syukujitsu-csv'
  return sourceParser(sourceId, input, material => {
    const rows = csvRows.parse(parse(decode(input, 'shift_jis'), { skip_empty_lines: true }))
    const first = rows.shift()
    if (!first || first.some((value, index) => value !== header[index]))
      throw new Error('Cabinet Office CSV header changed or encoding is incorrect')
    const days = rows
      .map(([rawDate, name]) => {
        const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(rawDate)
        if (!match) throw new Error(`invalid source date syntax ${rawDate}`)
        const [, year, month, day] = match
        if (!year || !month || !day) throw new Error('date fields missing')
        return sourceDay(
          sourceId,
          material,
          `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
          'holiday',
          'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
          name,
        )
      })
      .sort((a, b) => a.date.localeCompare(b.date))
    const start = days.at(0)?.date
    const last = days.at(-1)?.date
    if (!start || !last || date(last).year < Number(input.acquiredAt.slice(0, 4)))
      throw new Error('CSV is empty or stale for acquiredAt')
    return { days, coverageIntervals: [{ start, end: `${last.slice(0, 4)}-12-31` }] }
  })
}
const vacanzaMaterial = z.object({
  country: z.literal('JP'),
  library_version: z.string().min(1),
  window_start_year: z.number().int().min(1),
  window_end_year: z.number().int().max(9998),
  supported_start_year: z.number().int(),
  supported_end_year: z.number().int(),
  years: z.record(z.string(), z.record(isoDate, z.string().min(1))),
})
export function parseVacanzaCalendar(input: SourceParseInput): SourceParseResult {
  const sourceId = 'vacanza-holidays-library'
  return sourceParser(sourceId, input, material => {
    const document = vacanzaMaterial.parse(decodeJson(input))
    const start = document.window_start_year
    const end = document.window_end_year
    if (
      start > end ||
      start < document.supported_start_year ||
      end > document.supported_end_year ||
      end > Number(input.acquiredAt.slice(0, 4)) + 1
    )
      throw new Error('Vacanza requested range is unsupported or beyond promulgation horizon')
    if (Object.keys(document.years).length !== end - start + 1)
      throw new Error('Vacanza years do not match the declared window')
    const days: SupplyDay[] = []
    for (let year = start; year <= end; year++) {
      const entries = document.years[String(year)]
      if (!entries || !Object.keys(entries).length) throw new Error(`Vacanza year ${year} is empty`)
      for (const [day, name] of Object.entries(entries)) {
        if (date(day).year !== year) throw new Error(`date filed under wrong year ${day}`)
        days.push(
          sourceDay(
            sourceId,
            material,
            day,
            'holiday',
            `pypi:holidays==${document.library_version}`,
            name,
          ),
        )
      }
    }
    return { days, coverageIntervals: [{ start: `${start}-01-01`, end: `${end}-12-31` }] }
  })
}
