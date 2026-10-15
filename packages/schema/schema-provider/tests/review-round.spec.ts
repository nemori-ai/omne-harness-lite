import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  jsonSchemaDefinition,
  lease,
  refresh,
  validate,
  zodDefinition,
  type SchemaBudget,
} from '@omne-harness/schema-provider'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 8,
  maxItems: 50,
  maxMembers: 50,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const budget: SchemaBudget = {
  maxSnapshots: 4,
  maxConstructDepth: 30,
  maxConstructNodes: 300,
  failureBackoffMs: 1_000,
  maxAttempts: 3,
}

const text = readJsonText('"text"', limits)

it('defect: the same revision with a different check replaces the leased snapshot', async () => {
  const cases = [
    {
      name: 'min',
      first: z.string().min(1),
      second: z.string().min(5),
      sample: readJsonText('"abcd"', limits),
    },
    {
      name: 'literal',
      first: z.literal('a'),
      second: z.literal('b'),
      sample: readJsonText('"a"', limits),
    },
    {
      name: 'array',
      first: z.array(z.string()),
      second: z.array(z.number()),
      sample: readJsonText('["a"]', limits),
    },
  ] as const
  for (const candidate of cases) {
    const provider = createSchemaProvider(budget)
    let shape: z.ZodType = candidate.first
    const schema = defineSchema({
      id: candidate.name,
      load: async () =>
        zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: shape }),
    })
    const prior = await lease(provider, schema)
    expect(prior.kind).toBe('leased')
    if (prior.kind !== 'leased') continue
    shape = candidate.second
    refresh(provider, schema.id)
    expect(await lease(provider, schema)).toEqual({ kind: 'refused', reason: 'revision-conflict' })
    expect(prior.lease.superseded).toBe(false)
    expect(prior.lease.check(candidate.sample)).toMatchObject({ kind: 'valid', revision: '1' })
  }
})

it('defect: a caller error callback runs inside the compiled checker', async () => {
  let callbacks = 0
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'error-callback',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.string({
          error: () => {
            callbacks += 1
            return 'custom'
          },
        }),
      }),
  })
  expect(await validate(provider, schema, readJsonText('true', limits))).toEqual({
    kind: 'refused',
    reason: 'unsupported-construct',
  })
  expect(callbacks).toBe(0)
})

it('defect: prefault accepts a missing field and drops the default from the value', async () => {
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'prefault',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.object({ x: z.string().prefault('default') }),
      }),
  })
  expect(await validate(provider, schema, readJsonText('{}', limits))).toEqual({
    kind: 'refused',
    reason: 'unsupported-construct',
  })
})

it('defect: a const $ref is treated as a schema cycle', async () => {
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'literal-ref',
    load: async () =>
      jsonSchemaDefinition({ document: { const: { $ref: '#' } }, numbers: 'exact-or-reject' }),
  })
  const matched = await validate(provider, schema, readJsonText('{"$ref":"#"}', limits))
  expect(matched).toMatchObject({ kind: 'valid', path: 'compiled' })
  const missed = await validate(provider, schema, readJsonText('{}', limits))
  expect(missed).toMatchObject({ kind: 'invalid', path: 'compiled' })
})

it('defect: an anchor cycle compiles as a finished snapshot', async () => {
  let loads = 0
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'anchor-cycle',
    load: async () => {
      loads += 1
      return jsonSchemaDefinition({
        numbers: 'exact-or-reject',
        document: {
          $defs: {
            node: {
              $id: '#node',
              type: 'object',
              properties: { child: { $ref: '#node' } },
            },
          },
          $ref: '#node',
        },
      })
    },
  })
  expect(await validate(provider, schema, readJsonText('{}', limits))).toEqual({
    kind: 'refused',
    reason: 'runtime-path-closed',
  })
  expect(await validate(provider, schema, readJsonText('{}', limits))).toEqual({
    kind: 'refused',
    reason: 'runtime-path-closed',
  })
  expect(loads).toBe(1)
})

it('defect: a held lease drops the failure cooldown of the next load', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  try {
    let loads = 0
    let fail = false
    const provider = createSchemaProvider({
      ...budget,
      maxSnapshots: 2,
      failureBackoffMs: 60_000,
      maxAttempts: 2,
    })
    const schema = defineSchema({
      id: 'retry-held',
      load: async () => {
        loads += 1
        if (fail) throw new Error('load failure')
        return zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: z.string() })
      },
    })
    const held = await lease(provider, schema)
    expect(held.kind).toBe('leased')
    if (held.kind !== 'leased') return
    fail = true
    refresh(provider, schema.id)
    const cooled = []
    for (let attempt = 0; attempt < 4; attempt += 1) cooled.push(await validate(provider, schema, text))
    expect(loads).toBe(2)
    expect(cooled).toEqual([
      { kind: 'unavailable', reason: 'load-failed', retryNotBeforeMillis: 61_000 },
      { kind: 'unavailable', reason: 'load-failed', retryNotBeforeMillis: 61_000 },
      { kind: 'unavailable', reason: 'load-failed', retryNotBeforeMillis: 61_000 },
      { kind: 'unavailable', reason: 'load-failed', retryNotBeforeMillis: 61_000 },
    ])
    expect(held.lease.check(text)).toMatchObject({ kind: 'valid', revision: '1' })
    vi.setSystemTime(61_000)
    expect(await validate(provider, schema, text)).toEqual({
      kind: 'refused',
      reason: 'attempts-exhausted',
    })
    expect(await validate(provider, schema, text)).toEqual({
      kind: 'refused',
      reason: 'attempts-exhausted',
    })
    expect(loads).toBe(3)
    expect(held.lease.check(text)).toMatchObject({ kind: 'valid', revision: '1' })
  } finally {
    vi.useRealTimers()
  }
})

it('defect: a held lease drops the failure cooldown of the next compile', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  try {
    let loads = 0
    let fail = false
    const provider = createSchemaProvider({
      ...budget,
      maxSnapshots: 2,
      failureBackoffMs: 60_000,
      maxAttempts: 2,
    })
    const schema = defineSchema({
      id: 'compile-held',
      load: async () => {
        loads += 1
        return zodDefinition({
          revision: fail ? '2' : '1',
          numbers: 'exact-or-reject',
          schema: fail ? z.xor([z.string(), z.number()]) : z.string(),
        })
      },
    })
    const held = await lease(provider, schema)
    expect(held.kind).toBe('leased')
    if (held.kind !== 'leased') return
    fail = true
    refresh(provider, schema.id)
    expect(await validate(provider, schema, text)).toMatchObject({
      kind: 'unavailable',
      reason: 'compile-failed',
    })
    expect(await validate(provider, schema, text)).toMatchObject({
      kind: 'unavailable',
      reason: 'compile-failed',
    })
    expect(loads).toBe(2)
    expect(held.lease.check(text)).toMatchObject({ kind: 'valid', revision: '1' })
  } finally {
    vi.useRealTimers()
  }
})

it('defect: leased old revisions fall out of the snapshot budget', async () => {
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
  let revision = 0
  const schema = defineSchema({
    id: 'same-id',
    load: async () =>
      zodDefinition({
        revision: String(++revision),
        numbers: 'exact-or-reject',
        schema: z.string(),
      }),
  })
  const first = await lease(provider, schema)
  expect(first.kind).toBe('leased')
  if (first.kind !== 'leased') return
  refresh(provider, schema.id)
  expect(await lease(provider, schema)).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  const other = defineSchema({
    id: 'other-id',
    load: async () =>
      zodDefinition({ revision: 'other', numbers: 'exact-or-reject', schema: z.string() }),
  })
  expect(await lease(provider, other)).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  first.lease.release()
  expect(await lease(provider, other)).toMatchObject({ kind: 'leased', lease: { revision: 'other' } })
})

it('defect: refresh during a load is forgotten', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>(settle => {
    release = settle
  })
  let revision = '1'
  let loads = 0
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 2 })
  const schema = defineSchema({
    id: 'refresh-during-load',
    load: async () => {
      loads += 1
      const captured = revision
      await gate
      return zodDefinition({ revision: captured, numbers: 'exact-or-reject', schema: z.string() })
    },
  })
  const pending = validate(provider, schema, text)
  revision = '2'
  refresh(provider, schema.id)
  release()
  expect(await pending).toMatchObject({ kind: 'valid', revision: '1' })
  expect(await validate(provider, schema, text)).toMatchObject({ kind: 'valid', revision: '2' })
  expect(loads).toBe(2)
})

it('defect: an admission throw leaves the flight unsettled', async () => {
  let loads = 0
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'bad-pointer',
    load: async () => {
      loads += 1
      return jsonSchemaDefinition({ document: { $ref: '#/%ZZ' }, numbers: 'exact-or-reject' })
    },
  })
  const first = await Promise.race([
    validate(provider, schema, text),
    new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 30)),
  ])
  const second = await Promise.race([
    validate(provider, schema, text),
    new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 30)),
  ])
  expect(first).toEqual({ kind: 'refused', reason: 'unsupported-construct' })
  expect(second).toEqual({ kind: 'refused', reason: 'unsupported-construct' })
  expect(loads).toBe(1)
})

it('defect: projection drops an own __proto__ key before the checker sees it', async () => {
  const provider = createSchemaProvider(budget)
  const strict = defineSchema({
    id: 'strict-proto',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.strictObject({}),
      }),
  })
  const rejected = await validate(provider, strict, readJsonText('{"__proto__":{}}', limits))
  expect(rejected).toMatchObject({
    kind: 'invalid',
    path: 'compiled',
    issues: [{ path: ['__proto__'], code: 'unrecognized-key' }],
  })

  const allowed = defineSchema({
    id: 'kept-proto',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.record(z.string(), z.strictObject({ ok: z.literal(true) })),
      }),
  })
  const accepted = await validate(provider, allowed, readJsonText('{"__proto__":{"ok":true}}', limits))
  expect(accepted.kind).toBe('valid')
  if (accepted.kind !== 'valid') return
  expect(Object.keys(accepted.value)).toEqual(['__proto__'])
  expect(accepted.value['__proto__']).toEqual({ ok: true })
})

it('defect: JSON Schema issue paths rewrite object keys', async () => {
  const keys = ['rate%', 'a%2Fb', '', '01', '0', 'a/b'] as const
  for (const key of keys) {
    const provider = createSchemaProvider(budget)
    const schema = defineSchema({
      id: `path-${key}`,
      load: async () =>
        jsonSchemaDefinition({
          numbers: 'exact-or-reject',
          document: { type: 'object', properties: { [key]: { type: 'string' } } },
        }),
    })
    const verdict = await validate(provider, schema, readJsonText(JSON.stringify({ [key]: 2 }), limits))
    expect(verdict).toMatchObject({
      kind: 'invalid',
      issues: [{ path: [key], code: 'type' }],
    })
  }

  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'array-index',
    load: async () =>
      jsonSchemaDefinition({
        numbers: 'exact-or-reject',
        document: { type: 'array', items: { type: 'string' } },
      }),
  })
  expect(await validate(provider, schema, readJsonText('[2]', limits))).toMatchObject({
    kind: 'invalid',
    issues: [{ path: [0], code: 'type' }],
  })
})
