import type { Site, PackageImport } from './actual-model.ts'
import type { SourceCoordinates } from './source.ts'

export const RULE_IDS = [
  'LAYER-ENTRY',
  'LAYER-DIP',
  'IC-1',
  'IC-2',
  'IC-3',
  'IC-4',
  'IC-5',
] as const
export type RuleId = (typeof RULE_IDS)[number]
export type Layer =
  | 'interaction'
  | 'policy'
  | 'contract'
  | 'storage-port'
  | 'storage-adapter'
  | 'assembly'
  | 'unknown'
export interface ArchitectureRole {
  readonly id: string
  readonly paths: readonly string[]
  readonly layer: Layer
  readonly domains: readonly string[]
  readonly status: 'adopted' | 'candidate' | 'unknown'
  readonly source: string
}
export interface ArchitectureConstraints {
  readonly schemaVersion: 1
  readonly domains: readonly {
    readonly id: string
    readonly label: string
    readonly source: string
  }[]
  readonly roles: readonly ArchitectureRole[]
  readonly rules: readonly { readonly id: RuleId; readonly source: string }[]
}
export interface ConstraintInput {
  readonly path: string
  readonly source: SourceCoordinates
  readonly value: ArchitectureConstraints | null
}
export interface ConstraintChange {
  readonly id: string
  readonly path: string
  readonly before: string | null
  readonly after: string | null
}
export interface ConformanceRow {
  readonly id: string
  readonly rule: RuleId | 'ROLE'
  readonly state: 'converged' | 'deviation' | 'unknown'
  readonly age: 'new' | 'stock' | 'unjudged'
  readonly member: string
  readonly targetMember?: string
  readonly key: string
  readonly reason: string
  readonly expected: string
  readonly sites: readonly Site[]
  readonly relation?: PackageImport
}
export interface Conformance {
  readonly projection?: { readonly member: string; readonly matched: boolean }
  readonly schemaVersion: 1
  readonly kind: 'architecture-conformance'
  readonly current: ConstraintInput
  readonly baseline?: ConstraintInput
  readonly comparedWith: 'baseline' | 'current'
  readonly rows: readonly ConformanceRow[]
  readonly changes: readonly ConstraintChange[]
  readonly changeState: 'compared' | 'no-baseline'
  readonly coverage: readonly {
    readonly id: string
    readonly evidence: 'static-subset' | 'human' | 'behavior' | 'not-implemented' | 'undecided'
    readonly scope: string
  }[]
  readonly limitations: readonly string[]
}
