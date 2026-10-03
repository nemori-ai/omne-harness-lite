import type { ImportFact, Site } from './actual-model.ts'

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
