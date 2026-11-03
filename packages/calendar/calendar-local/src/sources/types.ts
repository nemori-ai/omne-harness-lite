import type { CnValidationEvidence } from '@omne-harness/calendar'
import type { Instant } from '@omne-harness/calendar-contract'

export const defaultCalendarSourceLimits = Object.freeze({
  maxBodyBytes: 8 * 1024 * 1024,
  maxBundleBytes: 32 * 1024 * 1024,
  maxYears: 64,
  maxPages: 5,
  maxBodies: 100,
  maxRedirects: 3,
  timeoutMs: 30_000,
})
export type CalendarSourceLimits = {
  readonly [Key in keyof typeof defaultCalendarSourceLimits]: number
}
export type CalendarHttpClient = (url: string, init: RequestInit) => Promise<Response>
export interface CalendarSourceResponseEvidence {
  readonly url: string
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly content: Uint8Array
}
export interface CalendarSourceKnowledge {
  readonly knowledgeAsOf: Instant
  readonly reference: string
}
export interface CalendarVacanzaArtifact {
  readonly read: (signal: AbortSignal) => Promise<Uint8Array>
  readonly sha256: string
  readonly libraryVersion: string
  readonly knowledgeAsOf: Instant
  readonly reference: string
  readonly startYear: number
  readonly endYear: number
}
export interface CalendarSourceAdapterOptions {
  readonly cnValidationEvidence?: CnValidationEvidence
  readonly httpClient?: CalendarHttpClient
  readonly limits?: Partial<CalendarSourceLimits>
  readonly testEndpoints?: Readonly<{ origins: Readonly<Record<string, string>> }>
  readonly sourceKnowledgeResolver?: (
    input: Readonly<{
      sourceId: string
      response: CalendarSourceResponseEvidence
      acquiredAt: Instant
      signal: AbortSignal
    }>,
  ) => Promise<CalendarSourceKnowledge | null>
  readonly vacanzaArtifact?: CalendarVacanzaArtifact
  readonly usWindow?: Readonly<{
    start: string
    end: string
    knowledgeAsOf: Instant
    authorityRef: string
    federalRegisterScanFloor: string
  }>
}
