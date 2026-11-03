import { createHash } from 'node:crypto'
import { z } from 'zod'
import { instantSchema, localDateSchema } from '@omne-harness/calendar-contract'
import {
  parseLanceliaoCalendar,
  parseCgZhouCalendar,
  parseCgZhouHorizon,
  parseCabinetOfficeCsv,
  parseVacanzaCalendar,
  parseOpmCalendar,
  parseFederalRegisterClosures,
  computeUsFederalCalendar,
} from '../supply/index.ts'
import type {
  CalendarSourceMaterialStore,
  CalendarStoredMaterial,
  CalendarSourceMaterial,
} from './ports.ts'
import type {
  SourceParseResult,
  CalendarSupplyPolicy,
  SourceContribution,
  SupplyFinding,
} from '../supply/types.ts'
import { finding } from '../supply/common.ts'

const computedSchema = z.strictObject({ start: localDateSchema, end: localDateSchema })
function parseComputedMaterial(stored: CalendarStoredMaterial): SourceParseResult {
  const { material } = stored
  const input = { ...material, reference: material.authorityRef }
  const range = computedSchema.parse(JSON.parse(new TextDecoder().decode(material.content)))
  const parsed = computeUsFederalCalendar({ ...range, ...input })
  if (parsed.kind !== 'success') return parsed
  return {
    ...parsed,
    contribution: {
      ...parsed.contribution,
      material: { ...parsed.contribution.material, rawSha256: stored.rawHash },
      days: parsed.contribution.days.map(day => ({
        ...day,
        provenance: day.provenance.map(item => ({ ...item, rawSha256: stored.rawHash })),
      })),
    },
  }
}
export function parseStoredMaterial(stored: CalendarStoredMaterial): SourceParseResult {
  const { material } = stored
  const input = { ...material, reference: material.authorityRef }
  switch (material.sourceId) {
    case 'lanceliao-china-holiday-calender':
      return parseLanceliaoCalendar(input)
    case 'cg-zhou-holiday-calendar':
      return parseCgZhouCalendar(input)
    case 'cg-zhou-index-endyear':
      return parseCgZhouHorizon(input)
    case 'cao-syukujitsu-csv':
      return parseCabinetOfficeCsv(input)
    case 'vacanza-holidays-library':
      return parseVacanzaCalendar(input)
    case 'opm-federal-holidays-ics':
      return parseOpmCalendar(input)
    case 'federal-register-eo-feed':
      return parseFederalRegisterClosures(input)
    case 'usc-6103-computed-rules':
      return parseComputedMaterial(stored)
    default:
      throw new Error(`Unsupported source ${material.sourceId}`)
  }
}
export function materialHash(material: CalendarSourceMaterial): string {
  return createHash('sha256').update(material.content).digest('hex')
}
function validateSourceMaterial(
  policy: CalendarSupplyPolicy,
  material: CalendarSourceMaterial,
): void {
  const spec = policy.sources.find(source => source.sourceId === material.sourceId)
  if (!spec || spec.lineage !== material.lineageRef || !material.authorityRef.trim())
    throw new Error('Source lineage or authority does not match the fixed source')
  instantSchema.parse(material.knowledgeAsOf)
  instantSchema.parse(material.acquiredAt)
  if (material.knowledgeAsOf > material.acquiredAt)
    throw new Error('Source knowledge is later than acquisition')
}
export async function preserveSource(
  store: CalendarSourceMaterialStore,
  policy: CalendarSupplyPolicy,
  material: CalendarSourceMaterial,
): Promise<CalendarStoredMaterial> {
  validateSourceMaterial(policy, material)
  const saved = await store.preserve(material)
  if (saved.kind !== 'ok') throw new Error(`Material preservation: ${saved.kind}`)
  if (saved.value.rawHash !== materialHash(material))
    throw new Error('Material store returned a different digest')
  const read = await store.read({ reference: saved.value.reference })
  if (
    read.kind !== 'ok' ||
    !read.value ||
    read.value.rawHash !== saved.value.rawHash ||
    materialHash(read.value.material) !== saved.value.rawHash
  )
    throw new Error('Preserved source cannot be read back')
  return saved.value
}
export function parseMaterials(materials: readonly CalendarStoredMaterial[]): {
  contributions: SourceContribution[]
  findings: SupplyFinding[]
} {
  const contributions: SourceContribution[] = []
  const findings: SupplyFinding[] = []
  for (const material of materials) {
    try {
      const parsed = parseStoredMaterial(material)
      if (parsed.kind === 'success')
        contributions.push({ ...parsed.contribution, lineageRef: material.material.lineageRef })
      else findings.push(...parsed.findings)
    } catch (error) {
      findings.push(finding('source.invalid', 'failed', String(error), [], [material.reference]))
    }
  }
  return { contributions, findings }
}
