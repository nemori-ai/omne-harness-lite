import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { SupplyIndependenceRegistration } from '@omne-harness/calendar'
import { instantSchema, localDateSchema } from '@omne-harness/calendar-contract'
import { z } from 'zod'
import type { CalendarSourceAdapterOptions } from '../sources/types.ts'

const SEEDS = new URL('../../data/seeds/', import.meta.url)

const material = z.object({
  sourceId: z.string().min(1),
  file: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  knowledgeAsOf: instantSchema,
  authorityRef: z.string().min(1),
})
const inputsSchema = z.object({
  materials: z.array(material),
  independenceRegistry: z.array(
    z.object({
      truthSourceId: z.string().min(1),
      oracleSourceId: z.string().min(1),
      independent: z.boolean(),
      evidenceRef: z.string().min(1),
    }),
  ),
})
const vacanzaWindow = z.object({
  library_version: z.string().min(1),
  window_start_year: z.number().int(),
  window_end_year: z.number().int(),
})
const usRules = z.object({ start: localDateSchema, end: localDateSchema })

export type CalendarShippedSupplyInputs = Readonly<{
  /** Options for the offline sources; the release adds its own HTTP client. */
  sourceOptions: Omit<CalendarSourceAdapterOptions, 'httpClient' | 'testEndpoints'>
  independenceRegistry: readonly SupplyIndependenceRegistration[]
}>

/**
 * The offline sources answer from the materials the release shipped with, so they agree with the
 * seed; the network sources follow the authorities. Bytes are checked against the shipped digests
 * by the adapters when read.
 */
export function shippedCalendarSupplyInputs(): CalendarShippedSupplyInputs {
  const inputs = inputsSchema.parse(
    JSON.parse(readFileSync(new URL('inputs-2026-11-06.json', SEEDS), 'utf8')),
  )
  const find = (sourceId: string) => {
    const found = inputs.materials.find(item => item.sourceId === sourceId)
    if (!found) throw new Error(`The shipped calendar inputs carry no material for ${sourceId}`)
    return found
  }
  const reader = (file: string) => async (signal: AbortSignal) =>
    new Uint8Array(await readFile(new URL(file, SEEDS), { signal }))
  const vacanza = find('vacanza-holidays-library')
  const window = vacanzaWindow.parse(JSON.parse(readFileSync(new URL(vacanza.file, SEEDS), 'utf8')))
  const notice = find('gov-cn-annual-notice')
  const us = find('usc-6103-computed-rules')
  const rules = usRules.parse(JSON.parse(readFileSync(new URL(us.file, SEEDS), 'utf8')))
  return Object.freeze({
    sourceOptions: Object.freeze({
      vacanzaArtifact: Object.freeze({
        read: reader(vacanza.file),
        sha256: vacanza.sha256,
        libraryVersion: window.library_version,
        knowledgeAsOf: vacanza.knowledgeAsOf,
        reference: vacanza.authorityRef,
        startYear: window.window_start_year,
        endYear: window.window_end_year,
      }),
      cnOfficialNoticeArtifact: Object.freeze({
        read: reader(notice.file),
        sha256: notice.sha256,
        knowledgeAsOf: notice.knowledgeAsOf,
        reference: notice.authorityRef,
      }),
      usWindow: Object.freeze({
        start: rules.start,
        end: rules.end,
        knowledgeAsOf: us.knowledgeAsOf,
        authorityRef: us.authorityRef,
        federalRegisterScanFloor: rules.start,
      }),
    }),
    independenceRegistry: Object.freeze(
      inputs.independenceRegistry.map(item => Object.freeze(item)),
    ),
  })
}
