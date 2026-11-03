export type SupplyCategory = 'workingDay' | 'nonWorkingDay' | 'holiday'
export type SupplyRole = 'truth' | 'oracle' | 'exceptionFeed' | 'horizonProbe'
export type SupplySeverity = 'blocker' | 'warning'
export type SupplyCheckStatus = 'passed' | 'failed' | 'unknown'
export interface SupplyInterval {
  readonly start: string
  readonly end: string
}
export interface SupplyMaterial {
  readonly rawSha256: string
  readonly acquiredAt: string
  readonly knowledgeAsOf: string
  readonly reference: string
}
export interface SupplyProvenance {
  readonly sourceId: string
  readonly authorityRef: string
  readonly note: string
  readonly rawSha256: string
}
export interface SupplyDay {
  readonly date: string
  readonly category: SupplyCategory
  readonly provenance: readonly SupplyProvenance[]
}
export interface SupplyFinding {
  readonly code: string
  readonly status: SupplyCheckStatus
  readonly severity: SupplySeverity
  readonly detail: string
  readonly dates: readonly string[]
  readonly references: readonly string[]
}
export interface SourceContribution {
  readonly sourceId: string
  readonly role: SupplyRole
  readonly lineageRef: string
  readonly coverageIntervals: readonly SupplyInterval[]
  readonly weeklyDefault: readonly SupplyCategory[]
  readonly days: readonly SupplyDay[]
  readonly material: SupplyMaterial
  readonly checks: readonly SupplyFinding[]
}
export type SourceParseResult =
  | { readonly kind: 'success'; readonly contribution: SourceContribution }
  | {
      readonly kind: 'rejected' | 'unknown'
      readonly findings: readonly SupplyFinding[]
      readonly material: SupplyMaterial
    }
export interface SourceParseInput {
  readonly content: Uint8Array
  readonly acquiredAt: string
  readonly knowledgeAsOf: string
  readonly reference: string
  readonly mediaType?: string
}
export type PolicyValue =
  | null
  | string
  | number
  | boolean
  | readonly PolicyValue[]
  | { readonly [key: string]: PolicyValue }
export interface SupplySourcePolicy {
  readonly sourceId: string
  readonly role: SupplyRole
  readonly adapterKind: string
  readonly provenanceClass: 'firstPartyAuthority' | 'thirdPartyTranscription'
  readonly lineage: string
  readonly transport: Readonly<Record<string, PolicyValue>>
  readonly decoding: Readonly<Record<string, PolicyValue>>
  readonly parsing: Readonly<Record<string, PolicyValue>>
  readonly probeCadence: {
    readonly defaultInterval: Readonly<Record<string, number>>
    readonly segments: readonly {
      readonly window: {
        readonly startMonthDay: string
        readonly endMonthDay: string
        readonly note: string | null
      }
      readonly interval: Readonly<Record<string, number>>
    }[]
  }
  readonly licenseNote: string | null
}
export interface CalendarSupplyPolicy {
  readonly calendarId: string
  readonly timezone: string
  readonly weeklyDefault: readonly SupplyCategory[]
  readonly sources: readonly SupplySourcePolicy[]
  readonly validation: {
    readonly invariants: readonly {
      readonly invariantId: string
      readonly severity: SupplySeverity
      readonly description: string
      readonly params: Readonly<Record<string, number>>
    }[]
    readonly anchors: readonly {
      readonly anchorId: string
      readonly monthDay: string
      readonly expectedCategory: SupplyCategory
      readonly toleranceDays: number
      readonly note: string | null
    }[]
    readonly unsourcedOverlapDisposition: 'withheld'
    readonly coverageShrinkDisposition: 'rejected'
    readonly oracleDivergenceDisposition: 'withheld'
  }
  readonly horizon: {
    readonly warningFloorDays: number
    readonly criticalFloorDays: number
    readonly criticalComparison: 'inclusive' | 'exclusive'
    readonly expectedExtensionWindow: {
      readonly startMonthDay: string
      readonly endMonthDay: string
      readonly note: string | null
    } | null
    readonly note: string
  }
  readonly semanticBoundary: string
}
export interface CalendarSupplyCandidate {
  readonly calendarId: string
  readonly timezone: string
  readonly weeklyDefault: readonly SupplyCategory[]
  readonly coverageIntervals: readonly SupplyInterval[]
  readonly days: readonly SupplyDay[]
  readonly contributions: readonly SourceContribution[]
}
export interface SupplyOverlapChange {
  readonly date: string
  readonly previousCategory: SupplyCategory
  readonly candidateCategory: SupplyCategory
  readonly newAuthorityRefs: readonly string[]
}
export interface SupplyIndependenceRegistration {
  readonly truthSourceId: string
  readonly oracleSourceId: string
  readonly independent: boolean
  readonly evidenceRef: string
}
export interface SupplyValidationResult {
  readonly kind: 'success' | 'rejected' | 'withheld' | 'unknown'
  readonly findings: readonly SupplyFinding[]
  readonly overlapChanges: readonly SupplyOverlapChange[]
  readonly materials: readonly SupplyMaterial[]
}
export type SupplySynthesisResult =
  | { readonly kind: 'success'; readonly candidate: CalendarSupplyCandidate }
  | {
      readonly kind: 'rejected'
      readonly findings: readonly SupplyFinding[]
      readonly materials: readonly SupplyMaterial[]
    }

export interface SupplyValidationInput {
  readonly policy: CalendarSupplyPolicy
  readonly candidate: CalendarSupplyCandidate
  readonly oracles: readonly SourceContribution[]
  readonly independenceRegistry: readonly SupplyIndependenceRegistration[]
  readonly current?: CalendarSupplyCandidate
}
