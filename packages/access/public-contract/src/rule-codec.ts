import { judgeJsonValue, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import type { Instant } from '@omne-harness/utc-instant'
import { convert } from './codec.ts'
import type { AccountId, LoginStateId, OrganizationId, TenantId } from './identity-text.ts'
import type { LeafKind, Rule } from './operation-rules.ts'

export type CodecResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

export type Codec<T> = {
  readonly read: (value: JsonValue, limits: JsonLimits) => CodecResult<T>
  readonly write: (value: T, limits: JsonLimits) => CodecResult<JsonValue>
}

type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

type LeafValues = {
  readonly text: string
  readonly string: string
  readonly session: string
  readonly 'page-bytes': string
  readonly revision: string
  readonly boolean: boolean
  readonly null: null
  readonly account: AccountId
  readonly organization: OrganizationId
  readonly login: LoginStateId
  readonly tenant: TenantId
  readonly instant: Instant
  readonly 'positive-integer': number
  readonly 'page-limit': number
  readonly parameters: JsonObject
  readonly json: JsonValue
  readonly 'user-message': JsonObject
}

type Fields = Extract<Rule, { readonly kind: 'object' }>['fields']
type RequiredKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends { readonly optional: true } ? never : K
}[keyof F]
type Flatten<T> = { [K in keyof T]: T[K] } & {}
type ObjectValue<F extends Fields> = Flatten<
  { readonly [K in RequiredKeys<F>]: RuleValue<F[K]['rule']> } & {
    readonly [K in Exclude<keyof F, RequiredKeys<F>>]?: RuleValue<F[K]['rule']>
  }
>

export type RuleValue<R extends Rule> = R extends { readonly kind: infer K extends LeafKind }
  ? LeafValues[K]
  : R extends { readonly kind: 'literal'; readonly values: readonly (infer V)[] }
    ? V
    : R extends { readonly kind: 'object'; readonly fields: infer F extends Fields }
      ? ObjectValue<F>
      : R extends { readonly kind: 'array'; readonly item: infer I extends Rule }
        ? readonly RuleValue<I>[]
        : R extends { readonly kind: 'one-of'; readonly rules: readonly (infer O extends Rule)[] }
          ? RuleValue<O>
          : never

const rejected: CodecResult<never> = Object.freeze({ ok: false })

export function ruleCodec<const R extends Rule>(rule: R): Codec<RuleValue<R>> {
  return engineCodec(rule) as Codec<RuleValue<R>>
}

function engineCodec(rule: Rule): Codec<unknown> {
  return {
    read(value, limits) {
      const judged = judgeJsonValue(value, { maxVisits: limits.maxItems })
      if (!('ok' in judged)) return rejected
      const converted = convert(rule, judged.ok, 'decode', limits)
      return converted === undefined ? rejected : { ok: true, value: converted.local }
    },
    write(value, limits) {
      const converted = convert(rule, value, 'encode', limits)
      return converted === undefined ? rejected : { ok: true, value: converted.wire }
    },
  }
}
