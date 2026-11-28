import type { JsonLimits } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { projectRule, ruleCodec, type Rule } from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 256,
  maxNumberLength: 16,
}

type Random = () => number
type Made = Readonly<{ rule: Rule; value: unknown }>
type Loose = Readonly<{
  read: (value: never, limits: JsonLimits, revision?: number) => unknown
  write: (value: unknown, limits: JsonLimits, revision?: number) => unknown
}>
const codecOf = ruleCodec as unknown as (rule: Rule) => Loose

function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
const below = (random: Random, limit: number): number => Math.floor(random() * limit)

/** A rule with fields that came at revisions 1 to 4, and a value that fits the whole of it. */
function made(random: Random, depth: number): Made {
  const kind = depth === 0 ? below(random, 2) : below(random, 5)
  if (kind === 0) return { rule: { kind: 'text' }, value: `t${below(random, 9)}` }
  if (kind === 1) return { rule: { kind: 'boolean' }, value: below(random, 2) === 0 }
  if (kind === 2) {
    const item = made(random, depth - 1)
    return { rule: { kind: 'array', item: item.rule }, value: [item.value, item.value] }
  }
  if (kind === 3) {
    const inner = made(random, depth - 1)
    return { rule: { kind: 'one-of', rules: [{ kind: 'null' }, inner.rule] }, value: inner.value }
  }
  const fields: Record<string, unknown> = {}
  const value: Record<string, unknown> = {}
  for (let index = 0; index < 1 + below(random, 4); index += 1) {
    const inner = made(random, depth - 1)
    const since = 1 + below(random, 4)
    const optional = since > 1 || below(random, 2) === 0
    fields[`f${index}`] = { rule: inner.rule, ...(optional && { optional: true }), since }
    if (!optional || below(random, 4) > 0) value[`f${index}`] = inner.value
  }
  return { rule: { kind: 'object', fields } as Rule, value }
}

/** The value as a writer of that revision would hold it: without the fields that came later. */
function stripped(rule: Rule, value: unknown, revision: number): unknown {
  if (rule.kind === 'array')
    return (value as unknown[]).map(item => stripped(rule.item, item, revision))
  if (rule.kind === 'one-of') return stripped(rule.rules[1] as Rule, value, revision)
  if (rule.kind !== 'object') return value
  const held = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(rule.fields)
      .filter(([name, field]) => (field.since ?? 1) <= revision && Object.hasOwn(held, name))
      .map(([name, field]) => [name, stripped(field.rule, held[name], revision)]),
  )
}

describe('at every revision, on random rules and values (V1, V2, V4)', () => {
  it.each([1, 2, 3, 4, 5, 6])('seed %i', seed => {
    const random = randomOf(seed)
    for (let round = 0; round < 60; round += 1) {
      const { rule, value } = made(random, 3)
      const codec = codecOf(rule)
      for (const revision of [1, 2, 3, 4]) {
        const older = codecOf(projectRule(rule, revision))
        const expected = stripped(rule, value, revision)
        const written = codec.write(value, limits, revision) as { ok: true; value: never }
        expect(written.ok).toBe(true)
        expect(written).toEqual(older.write(expected, limits))
        expect(codec.read(written.value, limits, revision)).toEqual({ ok: true, value: expected })
        expect(older.read(written.value, limits)).toEqual({ ok: true, value: expected })
      }
      const whole = codec.write(value, limits) as { ok: true; value: never }
      const latest = stripped(rule, value, 4)
      for (const revision of [1, 2, 3])
        if (JSON.stringify(stripped(rule, value, revision)) !== JSON.stringify(latest))
          expect(codec.read(whole.value, limits, revision)).toMatchObject({ ok: false })
    }
  })
})
