import { expectTypeOf, test } from 'vitest'
import {
  ruleCodec,
  type AccountId,
  type Codec,
  type RuleValue,
} from '@omne-harness/public-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { Instant } from '@omne-harness/utc-instant'

const note = ruleCodec({
  kind: 'object',
  fields: {
    title: { rule: { kind: 'text' } },
    owner: { rule: { kind: 'account' }, optional: true },
    tags: { rule: { kind: 'array', item: { kind: 'literal', values: ['draft', 'shared'] } } },
    size: { rule: { kind: 'one-of', rules: [{ kind: 'null' }, { kind: 'positive-integer' }] } },
    at: { rule: { kind: 'instant' } },
    payload: { rule: { kind: 'json' } },
  },
})

test('the value type comes from the rule', () => {
  expectTypeOf(note).toEqualTypeOf<
    Codec<{
      readonly title: string
      readonly owner?: AccountId
      readonly tags: readonly ('draft' | 'shared')[]
      readonly size: null | number
      readonly at: Instant
      readonly payload: JsonValue
    }>
  >()
  expectTypeOf<
    RuleValue<{ readonly kind: 'literal'; readonly values: readonly [true] }>
  >().toEqualTypeOf<true>()
})

test('a rule and a type that disagree do not compile', () => {
  // @ts-expect-error The rule reads `title` as text, not as a number.
  const wrong: Codec<{ readonly title: number }> = ruleCodec({
    kind: 'object',
    fields: { title: { rule: { kind: 'text' } } },
  })
  // @ts-expect-error The rule has no `owner` field.
  const missing: Codec<{ readonly title: string; readonly owner: AccountId }> = ruleCodec({
    kind: 'object',
    fields: { title: { rule: { kind: 'text' } } },
  })
  const limits = {
    maxBytes: 1,
    maxDepth: 1,
    maxItems: 1,
    maxMembers: 1,
    maxStringLength: 1,
    maxNumberLength: 1,
  }
  const unlisted = {
    title: 'a',
    // @ts-expect-error `archived` is not one of the literal values.
    tags: ['archived'],
    size: null,
    at: {} as Instant,
    payload: { kind: 'null' },
  } as const satisfies Parameters<typeof note.write>[0]
  void [unlisted, limits]
  void [wrong, missing]
})
