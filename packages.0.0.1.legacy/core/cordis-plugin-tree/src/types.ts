import type { AssemblyCloseReport } from '@omne-harness-lite/assembly-lifecycle'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | {
      readonly [key: string]: JsonValue
    }
export interface PluginReference {
  readonly package: string
  readonly export: string
}
export interface PluginRow {
  readonly id: string
  readonly plugin: PluginReference
  readonly config: JsonValue
}
export type OperatorEdit =
  | {
      readonly op: 'replace'
      readonly id: string
      readonly plugin?: PluginReference
      readonly config: JsonValue
    }
  | { readonly op: 'disable'; readonly id: string }
  | {
      readonly op: 'insert'
      readonly row: PluginRow
      readonly position: { readonly before: string } | { readonly after: string }
    }
export interface ComposedRow extends PluginRow {
  readonly enabled: boolean
  readonly source: 'distribution' | 'operator'
  readonly editIndex?: number
}
export interface PluginTreeDescription extends Omit<ComposedRow, 'config'> {
  readonly position: number
  readonly config: '[redacted]'
}
export interface AssemblyClaim {
  readonly name: string
  readonly version: number
  readonly config: JsonValue
}
export interface AssemblyDeclaration {
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  readonly optional: readonly string[]
  readonly dynamicProvides: readonly string[]
  readonly dynamicRequires: readonly string[]
  readonly claims: readonly AssemblyClaim[]
}
export interface PreparationOptions {
  readonly externalServices: readonly string[]
  readonly resolveModule: (reference: PluginReference) => Promise<unknown>
}
export interface PreparedPluginTree {
  readonly ids: readonly string[]
  readonly rows: readonly PluginTreeDescription[]
  readonly declarations: readonly {
    readonly id: string
    readonly declaration: AssemblyDeclaration
  }[]
}
export interface PluginTreeHandle {
  readonly rows: readonly PluginTreeDescription[]
  readonly ready: Promise<void>
  readonly closed: Promise<AssemblyCloseReport>
  dispose(): Promise<AssemblyCloseReport>
}
