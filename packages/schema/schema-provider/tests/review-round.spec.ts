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
      load: async () => zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: shape }),
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
    for (let attempt = 0; attempt < 4; attempt += 1)
      cooled.push(await validate(provider, schema, text))
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
  expect(await lease(provider, other)).toMatchObject({
    kind: 'leased',
    lease: { revision: 'other' },
  })
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
  const accepted = await validate(
    provider,
    allowed,
    readJsonText('{"__proto__":{"ok":true}}', limits),
  )
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
    const verdict = await validate(
      provider,
      schema,
      readJsonText(JSON.stringify({ [key]: 2 }), limits),
    )
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

it('defect: regex, enum, and format changes share one digest', async () => {
  const cases = [
    { name: 'regex', first: z.string().regex(/^a$/), second: z.string().regex(/^b$/) },
    { name: 'flags', first: z.string().regex(/a/), second: z.string().regex(/a/i) },
    { name: 'enum', first: z.enum(['a', 'b']), second: z.enum(['a', 'c']) },
    { name: 'format', first: z.email(), second: z.url() },
  ]
  for (const candidate of cases) {
    const provider = createSchemaProvider(budget)
    let shape: z.ZodType = candidate.first
    const schema = defineSchema({
      id: candidate.name,
      load: async () => zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: shape }),
    })
    const prior = await lease(provider, schema)
    expect(prior.kind).toBe('leased')
    if (prior.kind !== 'leased') continue
    shape = candidate.second
    refresh(provider, schema.id)
    expect(await lease(provider, schema)).toEqual({ kind: 'refused', reason: 'revision-conflict' })
    expect(prior.lease.superseded).toBe(false)
  }
})

it('defect: a check error or when callback still runs', async () => {
  let errorCalls = 0
  let whenCalls = 0
  const provider = createSchemaProvider(budget)
  const errorSchema = defineSchema({
    id: 'check-error',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.string().min(3, {
          error: () => {
            errorCalls += 1
            return 'custom'
          },
        }),
      }),
  })
  // Zod stores `when` at runtime. The published parameter type does not list it.
  const whenSchema = defineSchema({
    id: 'check-when',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.string().min(3, {
          when(): boolean {
            whenCalls += 1
            return true
          },
        } as { message?: string }),
      }),
  })
  expect(await validate(provider, errorSchema, text)).toEqual({
    kind: 'refused',
    reason: 'unsupported-construct',
  })
  expect(await validate(provider, whenSchema, text)).toEqual({
    kind: 'refused',
    reason: 'unsupported-construct',
  })
  expect(errorCalls).toBe(0)
  expect(whenCalls).toBe(0)
})

it('defect: a tuple or dependencies cycle compiles', async () => {
  const documents = [
    { id: 'tuple-cycle', document: { type: 'array', items: [{ $ref: '#' }] } },
    { id: 'dependencies-cycle', document: { type: 'object', dependencies: { x: { $ref: '#' } } } },
  ] as const
  for (const candidate of documents) {
    const provider = createSchemaProvider(budget)
    const schema = defineSchema({
      id: candidate.id,
      load: async () =>
        jsonSchemaDefinition({ document: candidate.document, numbers: 'exact-or-reject' }),
    })
    expect(await validate(provider, schema, readJsonText('[]', limits))).toEqual({
      kind: 'refused',
      reason: 'runtime-path-closed',
    })
  }
})

it('defect: an in-flight replacement does not count the leased snapshot', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>(settle => {
    release = settle
  })
  let loads = 0
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 2 })
  const schema = defineSchema({
    id: 'parallel-refresh',
    load: async () => {
      loads += 1
      if (loads === 2) await gate
      return zodDefinition({
        revision: String(loads),
        numbers: 'exact-or-reject',
        schema: z.string(),
      })
    },
  })
  const old = await lease(provider, schema)
  expect(old.kind).toBe('leased')
  if (old.kind !== 'leased') return
  refresh(provider, schema.id)
  const newerPromise = lease(provider, schema)
  const other = defineSchema({
    id: 'other',
    load: async () =>
      zodDefinition({ revision: 'other', numbers: 'exact-or-reject', schema: z.string() }),
  })
  expect(await lease(provider, other)).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  release()
  const newer = await newerPromise
  expect(newer.kind).toBe('leased')
  if (newer.kind !== 'leased') return
  expect(old.lease.check(text)).toMatchObject({ kind: 'valid', revision: '1' })
  expect(newer.lease.check(text)).toMatchObject({ kind: 'valid', revision: '2' })
  expect(old.lease.superseded).toBe(true)
})

it('defect: refresh during a failed load is discarded', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>(settle => {
    release = settle
  })
  let revision = '1'
  let loads = 0
  const provider = createSchemaProvider({ ...budget, maxAttempts: 1 })
  const schema = defineSchema({
    id: 'failure-refresh',
    load: async () => {
      loads += 1
      const captured = revision
      await gate
      if (captured === '1') throw new Error('old revision failure')
      return zodDefinition({ revision: captured, numbers: 'exact-or-reject', schema: z.string() })
    },
  })
  const first = validate(provider, schema, text)
  revision = '2'
  refresh(provider, schema.id)
  release()
  expect(await first).toEqual({ kind: 'refused', reason: 'attempts-exhausted' })
  expect(await validate(provider, schema, text)).toMatchObject({ kind: 'valid', revision: '2' })
  expect(loads).toBe(2)
})

it('defect: a lease taken during refresh stays current after the next revision', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>(settle => {
    release = settle
  })
  let revision = '1'
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 2 })
  const schema = defineSchema({
    id: 'leased-refresh',
    load: async () => {
      const captured = revision
      await gate
      return zodDefinition({ revision: captured, numbers: 'exact-or-reject', schema: z.string() })
    },
  })
  const first = lease(provider, schema)
  revision = '2'
  refresh(provider, schema.id)
  release()
  const old = await first
  expect(old.kind).toBe('leased')
  if (old.kind !== 'leased') return
  const newer = await lease(provider, schema)
  expect(newer.kind).toBe('leased')
  if (newer.kind !== 'leased') return
  expect(old.lease.revision).toBe('1')
  expect(newer.lease.revision).toBe('2')
  expect(old.lease.superseded).toBe(true)
  expect(old.lease.check(text)).toMatchObject({ kind: 'valid', revision: '1' })
  old.lease.release()
  const third = defineSchema({
    id: 'after-release',
    load: async () =>
      zodDefinition({ revision: 'third', numbers: 'exact-or-reject', schema: z.string() }),
  })
  expect(await lease(provider, third)).toMatchObject({ kind: 'leased' })
})

it('defect: bigint and undefined literals share a digest with string and null', async () => {
  const cases = [
    {
      name: 'bigint-string',
      first: z.literal(1n),
      second: z.literal('1'),
      sample: readJsonText('"1"', limits),
    },
    {
      name: 'undefined-null',
      first: z.literal(undefined),
      second: z.literal(null),
      sample: readJsonText('null', limits),
    },
  ]
  for (const candidate of cases) {
    const provider = createSchemaProvider(budget)
    let shape: z.ZodType = candidate.first
    const schema = defineSchema({
      id: candidate.name,
      load: async () => zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: shape }),
    })
    const prior = await lease(provider, schema)
    expect(prior.kind).toBe('leased')
    if (prior.kind !== 'leased') continue
    shape = candidate.second
    refresh(provider, schema.id)
    expect(await lease(provider, schema)).toEqual({ kind: 'refused', reason: 'revision-conflict' })
    expect(prior.lease.superseded).toBe(false)
    expect(prior.lease.check(candidate.sample).kind).toBe('invalid')
  }
})

it('defect: refresh during load skips a same-revision conflict', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>(settle => {
    release = settle
  })
  let shape: z.ZodType = z.string().min(1)
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'same-revision',
    load: async () => {
      const captured = shape
      await gate
      return zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: captured })
    },
  })
  const pending = lease(provider, schema)
  shape = z.string().min(5)
  refresh(provider, schema.id)
  release()
  const prior = await pending
  expect(prior.kind).toBe('leased')
  if (prior.kind !== 'leased') return
  expect(await lease(provider, schema)).toEqual({ kind: 'refused', reason: 'revision-conflict' })
  expect(prior.lease.superseded).toBe(false)
  expect(prior.lease.check(readJsonText('"abc"', limits))).toMatchObject({
    kind: 'valid',
    revision: '1',
  })
})

it('defect: a caller when named like an engine guard still runs', async () => {
  let calls = 0
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'caller-when',
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema: z.string().min(3, {
          when: function _whenFromCaller() {
            calls += 1
            return true
          },
        } as { message?: string }),
      }),
  })
  expect(await validate(provider, schema, text)).toEqual({
    kind: 'refused',
    reason: 'unsupported-construct',
  })
  expect(calls).toBe(0)

  const stock = defineSchema({
    id: 'stock-min',
    load: async () =>
      zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: z.string().min(3) }),
  })
  expect(await validate(provider, stock, readJsonText('"abc"', limits))).toMatchObject({
    kind: 'valid',
    path: 'compiled',
  })
  expect(await validate(provider, stock, readJsonText('"a"', limits))).toMatchObject({
    kind: 'invalid',
    path: 'compiled',
  })
})

it('defect: a refreshed lease frees its budget before the lease is delivered', async () => {
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
  const one = defineSchema({
    id: 'one',
    load: async () =>
      zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: z.string() }),
  })
  const two = defineSchema({
    id: 'two',
    load: async () =>
      zodDefinition({ revision: '2', numbers: 'exact-or-reject', schema: z.string() }),
  })
  const pending = lease(provider, one)
  refresh(provider, one.id)
  const concurrent = new Promise<Awaited<ReturnType<typeof lease>>>(resolve => {
    queueMicrotask(() => resolve(lease(provider, two)))
  })
  const [first, second] = await Promise.all([pending, concurrent])
  expect(first.kind).toBe('leased')
  expect(second).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  if (first.kind !== 'leased') return
  expect(first.lease.check(text)).toMatchObject({ kind: 'valid' })
  first.lease.release()
  first.lease.release()
  expect(await lease(provider, two)).toMatchObject({ kind: 'leased', lease: { revision: '2' } })
})

it('defect: a second refresh before delivery frees the only snapshot', async () => {
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
  const one = defineSchema({
    id: 'repeat-refresh',
    load: async () =>
      zodDefinition({ revision: '1', numbers: 'exact-or-reject', schema: z.string() }),
  })
  const other = defineSchema({
    id: 'other',
    load: async () =>
      zodDefinition({ revision: 'other', numbers: 'exact-or-reject', schema: z.string() }),
  })
  const pending = lease(provider, one)
  refresh(provider, one.id)
  const concurrent = new Promise<Awaited<ReturnType<typeof lease>>>(resolve => {
    queueMicrotask(() => {
      refresh(provider, one.id)
      resolve(lease(provider, other))
    })
  })
  const [first, second] = await Promise.all([pending, concurrent])
  expect(first.kind).toBe('leased')
  expect(second).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  if (first.kind !== 'leased') return
  expect(first.lease.check(text)).toMatchObject({ kind: 'valid' })
  first.lease.release()
  first.lease.release()
  expect(await lease(provider, other)).toMatchObject({
    kind: 'leased',
    lease: { revision: 'other' },
  })
})

it('defect: cancelling the starter leaves the refreshed snapshot in the only slot', async () => {
  for (const starter of ['validate', 'lease'] as const) {
    let release: () => void = () => {}
    const gate = new Promise<void>(settle => {
      release = settle
    })
    let revision = '1'
    let loads = 0
    const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
    const schema = defineSchema({
      id: `cancelled-first-${starter}`,
      load: async () => {
        loads += 1
        const captured = revision
        await gate
        return zodDefinition({ revision: captured, numbers: 'exact-or-reject', schema: z.string() })
      },
    })
    const aborter = new AbortController()
    const first =
      starter === 'validate'
        ? validate(provider, schema, text, aborter.signal)
        : lease(provider, schema, aborter.signal)
    const joined = validate(provider, schema, text)
    revision = '2'
    refresh(provider, schema.id)
    aborter.abort()
    release()
    const [starterResult, joiner] = await Promise.all([first, joined])
    expect(starterResult.kind).toBe('cancelled')
    expect(joiner).toMatchObject({ kind: 'valid', revision: '1' })
    expect(await validate(provider, schema, text)).toMatchObject({ kind: 'valid', revision: '2' })
    expect(loads).toBe(2)
    const another = defineSchema({
      id: `another-${starter}`,
      load: async () =>
        zodDefinition({ revision: 'other', numbers: 'exact-or-reject', schema: z.string() }),
    })
    expect(await lease(provider, another)).toMatchObject({ kind: 'leased' })
  }
})

it('defect: cancelling after ready leaves the refreshed snapshot unevictable', async () => {
  for (const starter of ['validate', 'lease'] as const) {
    let revision = '1'
    let loads = 0
    const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
    const schema = defineSchema({
      id: `cancel-after-ready-${starter}`,
      load: async () => {
        loads += 1
        return zodDefinition({ revision, numbers: 'exact-or-reject', schema: z.string() })
      },
    })
    const aborter = new AbortController()
    const first =
      starter === 'validate'
        ? validate(provider, schema, text, aborter.signal)
        : lease(provider, schema, aborter.signal)
    revision = '2'
    refresh(provider, schema.id)
    queueMicrotask(() => aborter.abort())
    expect((await first).kind).toBe('cancelled')
    expect(await validate(provider, schema, text)).toMatchObject({ kind: 'valid', revision: '2' })
    expect(loads).toBe(2)
    const another = defineSchema({
      id: `after-cancel-${starter}`,
      load: async () =>
        zodDefinition({ revision: 'other', numbers: 'exact-or-reject', schema: z.string() }),
    })
    expect(await lease(provider, another)).toMatchObject({ kind: 'leased' })
  }
})

it('defect: a same-id lease between follow and hold admits a second snapshot', async () => {
  let loads = 0
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
  const schema = defineSchema({
    id: 'A',
    load: async () =>
      zodDefinition({
        revision: String(++loads),
        numbers: 'exact-or-reject',
        schema: z.string(),
      }),
  })
  const pending = lease(provider, schema)
  refresh(provider, schema.id)
  const concurrent = new Promise<Awaited<ReturnType<typeof lease>>>(resolve => {
    queueMicrotask(() => queueMicrotask(() => resolve(lease(provider, schema))))
  })
  const [first, second] = await Promise.all([pending, concurrent])
  expect(first.kind).toBe('leased')
  expect(second.kind).toBe('leased')
  if (first.kind !== 'leased' || second.kind !== 'leased') return
  expect(first.lease.revision).toBe('1')
  expect(second.lease.revision).toBe('1')
  expect(loads).toBe(1)
  expect(first.lease.check(text)).toMatchObject({ kind: 'valid' })
  expect(second.lease.check(text)).toMatchObject({ kind: 'valid' })
  const other = defineSchema({
    id: 'B',
    load: async () =>
      zodDefinition({ revision: 'B', numbers: 'exact-or-reject', schema: z.string() }),
  })
  expect(await lease(provider, other)).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  first.lease.release()
  first.lease.release()
  expect(await lease(provider, other)).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
  second.lease.release()
  expect(await lease(provider, other)).toMatchObject({ kind: 'leased', lease: { revision: 'B' } })
})

it('defect: a same-id validate between follow and delivery starts a second load', async () => {
  let loads = 0
  const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
  const schema = defineSchema({
    id: 'A-validate',
    load: async () =>
      zodDefinition({
        revision: String(++loads),
        numbers: 'exact-or-reject',
        schema: z.string(),
      }),
  })
  const pending = validate(provider, schema, text)
  refresh(provider, schema.id)
  const concurrent = new Promise<Awaited<ReturnType<typeof validate>>>(resolve => {
    queueMicrotask(() => queueMicrotask(() => resolve(validate(provider, schema, text))))
  })
  const [first, second] = await Promise.all([pending, concurrent])
  expect(first).toMatchObject({ kind: 'valid', revision: '1' })
  expect(second).toMatchObject({ kind: 'valid', revision: '1' })
  expect(loads).toBe(1)
  expect(await validate(provider, schema, text)).toMatchObject({ kind: 'valid', revision: '2' })
  expect(loads).toBe(2)
})

it('defect: a canceller who left before publish spends the joiner delivery share', async () => {
  for (const starter of ['lease', 'validate'] as const) {
    for (let depth = 1; depth <= 4; depth += 1) {
      const provider = createSchemaProvider({ ...budget, maxSnapshots: 1 })
      const schema = defineSchema({
        id: `A-${starter}-${depth}`,
        load: async () =>
          zodDefinition({ revision: 'A', numbers: 'exact-or-reject', schema: z.string() }),
      })
      const other = defineSchema({
        id: `B-${starter}-${depth}`,
        load: async () =>
          zodDefinition({ revision: 'B', numbers: 'exact-or-reject', schema: z.string() }),
      })
      const aborter = new AbortController()
      const first =
        starter === 'lease'
          ? lease(provider, schema, aborter.signal)
          : validate(provider, schema, text, aborter.signal)
      const joined = lease(provider, schema)
      refresh(provider, schema.id)
      aborter.abort()
      const later = (remaining: number, run: () => void) => {
        if (remaining === 0) run()
        else queueMicrotask(() => later(remaining - 1, run))
      }
      const third = new Promise<Awaited<ReturnType<typeof lease>>>(resolve => {
        later(depth, () => resolve(lease(provider, other)))
      })
      const [starterResult, joiner, incoming] = await Promise.all([first, joined, third])
      expect(starterResult.kind).toBe('cancelled')
      expect(joiner.kind).toBe('leased')
      if (joiner.kind !== 'leased') continue
      expect(joiner.lease.check(text)).toMatchObject({ kind: 'valid', revision: 'A' })
      expect(incoming).toEqual({ kind: 'refused', reason: 'budget-exhausted' })
      joiner.lease.release()
      expect(await lease(provider, other)).toMatchObject({
        kind: 'leased',
        lease: { revision: 'B' },
      })
    }
  }
})
