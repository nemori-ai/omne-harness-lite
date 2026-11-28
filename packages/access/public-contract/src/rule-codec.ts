import {
  judgeJsonValue,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type { Instant } from '@omne-harness/utc-instant'
import type { AccountId, LoginStateId, OrganizationId, TenantId } from './identity-text.ts'
import { convert, isRefused, type Direction, type Refused } from './leaf-codec.ts'
import { checkRule } from './revision.ts'
import type { LeafKind, Rule } from './rule.ts'

/** Why a value was refused: the path to it from the root, what was given there, and what the rule allows. */
export type Rejection = {
  readonly at: readonly (string | number)[]
  readonly given: string
  readonly allows: string
}

export type CodecResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly rejection: Rejection }

const GIVEN_LIMIT = 120

export function pathText(at: readonly (string | number)[]): string {
  if (at.length === 0) return 'the value'
  return at
    .map((step, index) =>
      typeof step === 'number' ? `[${String(step)}]` : index === 0 ? step : `.${step}`,
    )
    .join('')
}

const WITHHELD = 'withheld: this operation carries a credential'

/** The rejection of an operation that carries a credential: where and what is allowed, never what was given. */
export function withheld(rejection: Rejection): Rejection {
  return { ...rejection, given: WITHHELD }
}

export function rejectionText(rejection: Rejection): string {
  return `${pathText(rejection.at)} is ${rejection.given}; allows ${rejection.allows}`
}

function shownJson(value: unknown, direction: Direction): string {
  if (value === undefined) return 'missing'
  if (value instanceof Uint8Array) return `${String(value.byteLength)} bytes`
  try {
    if (direction === 'decode') return writeJsonText(value as JsonValue)
    return JSON.stringify(value) ?? String(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

function givenText(value: unknown, direction: Direction): string {
  const shown = shownJson(value, direction)
  return shown.length <= GIVEN_LIMIT
    ? shown
    : `${shown.slice(0, GIVEN_LIMIT)}… (${String(shown.length)} characters)`
}

function refusedResult(refused: Refused, direction: Direction): CodecResult<never> {
  return {
    ok: false,
    rejection: {
      at: refused.at,
      given: givenText(refused.given, direction),
      allows: refused.allows,
    },
  }
}

/** With a revision, a codec reads and writes the rule as it was at that revision. */
export type Codec<T> = {
  readonly read: (value: JsonValue, limits: JsonLimits, revision?: number) => CodecResult<T>
  readonly write: (value: T, limits: JsonLimits, revision?: number) => CodecResult<JsonValue>
  readonly rule?: Rule
}

type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

type LeafValues = {
  readonly text: string
  readonly string: string
  readonly session: string
  readonly 'page-bytes': string
  readonly bytes: Uint8Array
  readonly revision: string
  readonly boolean: boolean
  readonly null: null
  readonly account: AccountId
  readonly organization: OrganizationId
  readonly login: LoginStateId
  readonly tenant: TenantId
  readonly instant: Instant
  readonly 'plain-date': string
  readonly 'positive-integer': number
  readonly count: number
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

export function ruleCodec<const R extends Rule>(rule: R): Codec<RuleValue<R>> {
  return engineCodec(rule) as Codec<RuleValue<R>>
}

function engineCodec(rule: Rule): Codec<unknown> {
  checkRule(rule)
  return {
    rule,
    read(value, limits, revision) {
      const judged = judgeJsonValue(value, { maxVisits: limits.maxItems })
      if (!('ok' in judged))
        return {
          ok: false,
          rejection: {
            at: [],
            given: `a JSON tree that is not readable (${judged.rejected})`,
            allows:
              judged.rejected === 'budget'
                ? `a JSON value of at most ${String(limits.maxItems)} items`
                : 'a well-formed JSON value: plain objects and lists, no repeated key, no cycle',
          },
        }
      const converted = convert(rule, judged.ok, 'decode', limits, revision)
      return isRefused(converted)
        ? refusedResult(converted, 'decode')
        : { ok: true, value: converted.local }
    },
    write(value, limits, revision) {
      const converted = convert(rule, value, 'encode', limits, revision)
      return isRefused(converted)
        ? refusedResult(converted, 'encode')
        : { ok: true, value: converted.wire }
    },
  }
}

/** A rejection as data, for any protocol that carries one. */
export const REJECTION_RULE = {
  kind: 'object',
  fields: {
    at: {
      rule: {
        kind: 'array',
        item: { kind: 'one-of', rules: [{ kind: 'string' }, { kind: 'count' }] },
      },
    },
    given: { rule: { kind: 'string' } },
    allows: { rule: { kind: 'string' } },
  },
} as const

/** The body of protocol-rejected for every protocol; a peer that does not say why answers an empty body. */
export const REJECTION_BODY = ruleCodec({
  kind: 'object',
  fields: { rejection: { rule: REJECTION_RULE, optional: true } },
})
