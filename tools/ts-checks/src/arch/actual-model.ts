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
  /** Semantic identity excludes source position. */
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
  readonly symbol: string
  readonly local?: string
  readonly type: boolean
  readonly form: 'import' | 'export' | 'dynamic'
}
export interface PackageImport extends Site {
  readonly id: string
  readonly member: string
  readonly specifier: string
  readonly symbol: string
  readonly local?: string
  readonly type: boolean
  readonly form: ImportFact['form']
  readonly target:
    | { readonly kind: 'workspace'; readonly member: string }
    | { readonly kind: 'external' }
    | { readonly kind: 'unresolved-local' }
}
export interface ImportUnknown extends Site {
  readonly id: string
  readonly kind: 'import'
  readonly member: string
  readonly expression: string
  readonly reason: string
}
/** Complete observations from the shared static extractor. */
export interface ActualExtraction {
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
  readonly factOccurrences: readonly Fact[]
  readonly packageImports: readonly PackageImport[]
  readonly importUnknown: readonly ImportUnknown[]
  readonly configurationFiles: readonly string[]
}
export interface Snapshot {
  readonly texts: ReadonlyMap<string, string>
  readonly members: readonly Member[]
  /** Resolution can use development members; relationship discovery uses only these members. */
  readonly analysisMembers?: readonly Member[]
}

/** Delimiters in names are data. Positions never participate in semantic identity. */
export function actualFactIdentity(fact: Fact): string {
  return JSON.stringify([
    fact.member,
    fact.plugin ?? '',
    fact.scope,
    fact.kind,
    fact.key,
    fact.mode ?? '',
    fact.target ?? '',
    fact.symbol ?? '',
  ])
}
