export type JsonLimits = {
  readonly maxBytes: number
  readonly maxDepth: number
  readonly maxItems: number
  readonly maxMembers: number
  readonly maxStringLength: number
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
export type JsonPathSegment = string | number

export type JsonTreePath = readonly (string | number)[]

export type JsonValueJudgment =
  | { readonly ok: JsonValue }
  | {
      readonly rejected:
        | 'missing'
        | 'type'
        | 'value'
        | 'unknown-field'
        | 'duplicate'
        | 'cycle'
        | 'budget'
        | 'accessor'
        | 'unreadable'
      readonly path: JsonTreePath
    }
