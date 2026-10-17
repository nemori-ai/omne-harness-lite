/** Caller budgets. Each field is an integer from 1 through `Number.MAX_SAFE_INTEGER`. */
export type JsonLimits = {
  /** UTF-8 byte length of the whole input. */
  readonly maxBytes: number
  /** Container nesting depth. The root container is depth 1. */
  readonly maxDepth: number
  /** JSON values in the whole document, containers included. Keys are not items. */
  readonly maxItems: number
  /** Members of one object. */
  readonly maxMembers: number
  /** Decoded JavaScript string length of a key or a string value. */
  readonly maxStringLength: number
  /** Source lexeme length of a number. */
  readonly maxNumberLength: number
}

export type JsonValue =
  | { readonly kind: 'null' }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly lexeme: string }
  | { readonly kind: 'array'; readonly items: readonly JsonValue[] }
  | { readonly kind: 'object'; readonly entries: readonly JsonEntry[] }

export type JsonEntry = { readonly key: string; readonly value: JsonValue }

export type JsonRead = { readonly kind: 'ok'; readonly value: JsonValue } | JsonFailure

export type JsonFailure =
  | { readonly kind: 'utf8' }
  | { readonly kind: 'bom' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'syntax'; readonly reason: JsonSyntaxReason }
  | {
      readonly kind: 'duplicate-key'
      readonly path: readonly JsonPathSegment[]
      readonly key: string
    }
  | { readonly kind: 'budget'; readonly name: JsonBudgetName }

export type JsonSyntaxReason =
  | 'comment'
  | 'trailing-comma'
  | 'token'
  | 'truncated'
  | 'trailing-content'
export type JsonBudgetName = 'bytes' | 'depth' | 'items' | 'members' | 'string' | 'number'
/** An object key or an array index on the way from the root to a parent object. */
export type JsonPathSegment = string | number
