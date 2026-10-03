import type { Member, MemberEdge } from '../metrics/graph.ts'

export interface Site {
  readonly path: string
  readonly line: number
}
export type FactKind =
  | 'plugin'
  | 'defines'
  | 'provides'
  | 'injects'
  | 'optional'
  | 'event-declaration'
  | 'emits'
  | 'listens'
  | 'contributes'
  | 'composition'
export interface Fact extends Site {
  /** Identity excludes source position, so moving a declaration does not create a new fact. */
  readonly id: string
  readonly member: string
  readonly plugin?: string
  readonly kind: FactKind
  readonly key: string
  readonly scope: string
  readonly mode?: string
  readonly contract?: string
  readonly owner?: string
  readonly definitionForm?: 'context-augmentation' | 'service-class'
  readonly provideForm?: 'ctx.provide' | 'service-instance' | 'class-plugin'
  readonly expression?: string
  readonly expressionShape?: string
  readonly injectExpression?: string
  readonly injectShape?: string
  readonly declaration?: Site & { readonly member?: string }
  readonly target?: string
  readonly symbol?: string
  readonly layer?: string
}
export interface Unknown extends Site {
  readonly member: string
  readonly plugin?: string
  readonly scope: string
  readonly kind: FactKind
  readonly expression: string
  readonly reason: string
  readonly serviceIdentifier: boolean
}
export interface ImportFact extends Site {
  readonly id: string
  readonly member: string
  readonly target: string
  readonly specifier: string
  /** Name exported by the target; the local alias is separate. */
  readonly symbol: string
  readonly local?: string
  readonly type: boolean
  readonly form: 'import' | 'export' | 'dynamic'
}
export interface Extraction {
  readonly facts: readonly Fact[]
  readonly unknown: readonly Unknown[]
  readonly imports: readonly ImportFact[]
  readonly edges: readonly MemberEdge[]
  readonly members: readonly Member[]
  readonly serviceIdentifiers: {
    readonly attempted: number
    readonly unresolved: number
    readonly rate: number
  }
}
export interface Snapshot {
  readonly texts: ReadonlyMap<string, string>
  readonly members: readonly Member[]
}
export interface IntentPlugin {
  readonly name: string
  readonly source: string
  readonly provides: readonly string[]
  readonly injects: readonly string[]
  readonly optional: readonly string[]
  readonly emits: readonly { readonly event: string; readonly mode: string }[]
  readonly listens: readonly string[]
  readonly contributes: readonly string[]
}
export interface IntentNode {
  readonly member: string
  readonly path: string
  readonly readme?: string
  readonly assembly?: {
    readonly plugins: readonly IntentPlugin[]
    readonly defines: readonly {
      readonly key: string
      readonly source: string
      readonly contract?: string
      readonly owner?: string
    }[]
    readonly importExceptions: readonly {
      readonly target: string
      readonly symbols: readonly string[]
      readonly sharedStorage: string
      readonly source: string
    }[]
  }
  readonly composition?: {
    readonly plugins: readonly {
      readonly id: string
      readonly node: string
      readonly plugin: string
      readonly layer: string
      readonly source: string
    }[]
  }
}
export type ComparisonState = 'converged' | 'deviation' | 'missing' | 'unknown'
export interface Comparison {
  readonly id: string
  readonly state: ComparisonState
  readonly member: string
  readonly kind: string
  readonly plugin?: string
  readonly key: string
  readonly implementation?: Site
  readonly declaration?: { readonly path: string; readonly source: string }
  readonly reason?: string
}
export interface ImportExceptionUse {
  readonly import: ImportFact
  readonly declaration: {
    readonly path: string
    readonly source: string
    readonly sharedStorage: string
  }
}
export interface ComparisonResult {
  readonly comparisons: readonly Comparison[]
  readonly lifecycle: readonly {
    readonly member: string
    readonly kind: 'undeclared' | 'no-design' | 'not-built' | 'source-location-mismatch'
    readonly path?: string
  }[]
  readonly exceptions: readonly ImportExceptionUse[]
}
