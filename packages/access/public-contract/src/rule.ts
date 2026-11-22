export type LeafKind =
  | 'text'
  | 'string'
  | 'boolean'
  | 'null'
  | 'account'
  | 'organization'
  | 'login'
  | 'tenant'
  | 'instant'
  | 'plain-date'
  | 'session'
  | 'page-bytes'
  | 'bytes'
  | 'revision'
  | 'positive-integer'
  | 'count'
  | 'page-limit'
  | 'parameters'
  | 'json'
  | 'user-message'
export type Rule =
  | { readonly kind: LeafKind }
  | { readonly kind: 'literal'; readonly values: readonly (string | boolean)[] }
  | {
      readonly kind: 'object'
      readonly fields: Readonly<Record<string, FieldRule>>
    }
  | {
      readonly kind: 'array'
      readonly item: Rule
      readonly nonempty?: true
      readonly max?: number
    }
  | { readonly kind: 'one-of'; readonly rules: readonly Rule[] }
/** A field with `since` came at that revision of its protocol; such a field is optional. */
export type FieldRule =
  | { readonly rule: Rule; readonly optional?: true; readonly since?: 1 }
  | { readonly rule: Rule; readonly optional: true; readonly since: number }
export type RequestRule = { readonly body: Rule; readonly proof: boolean; readonly tenant: boolean }
export type Family<V extends string, P extends string, S extends string> = {
  readonly version: V
  readonly error: string
  readonly stages: readonly S[]
  readonly declarable: boolean
  readonly isProvided: (value: unknown) => value is P
  readonly requestRule: (operation: P) => RequestRule
  readonly responseRule: (operation: P, outcome: string) => Rule | undefined
}
export const empty: Rule = { kind: 'object', fields: {} }
