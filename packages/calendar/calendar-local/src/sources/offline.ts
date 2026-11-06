import { parseVacanzaCalendar, parseGovCnCalendar } from '@omne-harness/calendar'
import { instantSchema, localDateSchema, type Instant } from '@omne-harness/calendar-contract'
import { z } from 'zod'
import { decodeJson, digest, encode } from './http.ts'
import type {
  CalendarSourceAdapterOptions,
  CalendarSourceLimits,
  CalendarVacanzaArtifact,
} from './types.ts'

export function computedMaterial(
  options: CalendarSourceAdapterOptions,
  acquiredAt: Instant,
  limits: CalendarSourceLimits,
) {
  const window = options.usWindow
  if (!window) throw new Error('US publication window is not configured')
  const start = localDateSchema.parse(window.start)
  const end = localDateSchema.parse(window.end)
  if (start > end || Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 1 > limits.maxYears)
    throw new Error('US publication window is invalid or exceeds year limit')
  const knowledgeAsOf = instantSchema.parse(window.knowledgeAsOf)
  if (knowledgeAsOf > acquiredAt || !window.authorityRef.trim())
    throw new Error('Invalid US rules knowledge evidence')
  return { content: encode({ start, end }), knowledgeAsOf, authorityRef: window.authorityRef }
}
const artifactSchema = z.object({
  library_version: z.string().min(1),
  window_start_year: z.number().int(),
  window_end_year: z.number().int(),
})
function verifyVacanzaArtifact(
  content: Uint8Array,
  artifact: CalendarVacanzaArtifact,
  limits: CalendarSourceLimits,
): void {
  if (!content.byteLength || content.byteLength > limits.maxBodyBytes)
    throw new Error('Vacanza artifact byte limit exceeded or empty')
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || digest(content) !== artifact.sha256)
    throw new Error('Vacanza artifact hash mismatch')
  const document = artifactSchema.parse(decodeJson(content))
  if (
    document.library_version !== artifact.libraryVersion ||
    document.window_start_year !== artifact.startYear ||
    document.window_end_year !== artifact.endYear ||
    artifact.endYear - artifact.startYear + 1 > limits.maxYears
  )
    throw new Error('Vacanza artifact version or requested range mismatch')
}
export async function vacanzaMaterial(
  options: CalendarSourceAdapterOptions,
  acquiredAt: Instant,
  limits: CalendarSourceLimits,
  signal: AbortSignal,
) {
  const artifact = options.vacanzaArtifact
  if (!artifact) throw new Error('Fixed Vacanza artifact is not configured')
  const content = await artifact.read(signal)
  signal.throwIfAborted()
  verifyVacanzaArtifact(content, artifact, limits)
  const knowledgeAsOf = instantSchema.parse(artifact.knowledgeAsOf)
  if (knowledgeAsOf > acquiredAt || !artifact.reference.trim())
    throw new Error('Invalid Vacanza knowledge evidence')
  const parsed = parseVacanzaCalendar({
    content,
    acquiredAt,
    knowledgeAsOf,
    reference: artifact.reference,
  })
  if (parsed.kind !== 'success')
    throw new Error('Vacanza artifact has unsupported or empty year coverage')
  return { content, knowledgeAsOf, authorityRef: artifact.reference }
}

export async function officialNoticeMaterial(
  options: CalendarSourceAdapterOptions,
  acquiredAt: Instant,
  limits: CalendarSourceLimits,
  signal: AbortSignal,
) {
  const artifact = options.cnOfficialNoticeArtifact
  if (!artifact) throw new Error('Adopted official CN notice is not configured')
  const content = await artifact.read(signal)
  signal.throwIfAborted()
  if (
    !content.byteLength ||
    content.byteLength > limits.maxBodyBytes ||
    digest(content) !== artifact.sha256
  )
    throw new Error('Official CN notice artifact size or hash mismatch')
  const knowledgeAsOf = instantSchema.parse(artifact.knowledgeAsOf)
  if (knowledgeAsOf > acquiredAt || !artifact.reference.trim())
    throw new Error('Invalid official CN notice knowledge evidence')
  const parsed = parseGovCnCalendar({
    content,
    acquiredAt,
    knowledgeAsOf,
    reference: artifact.reference,
  })
  if (parsed.kind !== 'success') throw new Error('Official CN notice cannot be parsed')
  return { content, knowledgeAsOf, authorityRef: artifact.reference }
}
