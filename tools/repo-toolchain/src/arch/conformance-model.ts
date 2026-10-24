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
export interface ArchitectureImportException {
  readonly id: string
  readonly member: string
  readonly target: string
  readonly symbols: readonly string[]
  readonly sharedStorage: string
  readonly source: string
}
/** schema 3 的方向行：`from` 角色的源码不得依赖 `to` 角色所在的成员。角色按 id 绑定，与 status 无关。 */
export interface ArchitectureDirection {
  readonly id: string
  readonly from: readonly [string, ...string[]]
  readonly to: readonly [string, ...string[]]
  readonly source: string
}
export interface ArchitectureConstraints {
  readonly schemaVersion: 1 | 2 | 3
  readonly importExceptions?: readonly ArchitectureImportException[]
  /** 只有 schema 3 可以声明；schema 1、2 的文档没有这个字段。 */
  readonly directions?: readonly ArchitectureDirection[]
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
  readonly sources: readonly { readonly path: string; readonly digest: string }[]
  /** Retired only after matching the actual source snapshot at source.commit. */
  readonly retiredRoleIds?: readonly string[]
}
export function activeRoles(input: ConstraintInput): readonly ArchitectureRole[] {
  const retired = new Set(input.retiredRoleIds ?? [])
  return input.value?.roles.filter(role => !retired.has(role.id)) ?? []
}
export interface ConstraintChange {
  readonly id: string
  readonly path: string
  readonly before: string | null
  readonly after: string | null
}
export interface ConformanceRow {
  readonly id: string
  /** `DIRECTION` 是方向行（schema 3 的 `directions`）按成员对展开的一行；`key` 带方向行 id。 */
  readonly rule: RuleId | 'ROLE' | 'INPUT' | 'DIRECTION'
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
  readonly sourceChanges: readonly ConstraintChange[]
  readonly changeState: 'compared' | 'no-baseline'
  readonly coverage: readonly {
    readonly id: string
    readonly evidence: 'static-subset' | 'human' | 'behavior' | 'not-implemented' | 'undecided'
    readonly scope: string
  }[]
  readonly limitations: readonly string[]
}
