import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import retainedSchema from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import schema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import {
  prepareAccountGroup,
  summarize,
  summarizeUsage,
  validate,
  schemaId,
  type ModelAccountInput,
  type CorrectionInput,
} from '@omne-harness-lite/call-accounts'

function strict(source: string) {
  const parsed = readJsonStrict(source)
  if ('failed' in parsed) throw new Error(parsed.failed)
  return parsed.ok
}
const usage = {
  input_tokens: new LosslessNumber('9007199254740993'),
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  source: 'upstream',
} as const
const ready: ModelAccountInput = {
  responseId: 'response_original',
  cost: { cost_usd: new LosslessNumber('0.123456789012345678901'), source: 'upstream_usage' },
  usage,
}
const final: ModelAccountInput = { ...ready }
const corrections: readonly CorrectionInput[] = [
  {
    sessionLog: 'session_original',
    correction: {
      target: { kind: 'model_response', responseId: ready.responseId },
      cost_usd: new LosslessNumber('0.2'),
      obtainedVia: 'manual',
      at: '2026-09-29T10:00:00Z',
      late: true,
    },
  },
  {
    sessionLog: 'session_original',
    correction: {
      target: { kind: 'model_response', responseId: ready.responseId },
      cost_usd: new LosslessNumber('0.3'),
      obtainedVia: 'manual',
      at: '2026-09-29T11:00:00Z',
    },
  },
]
const mirror = {
  callId: 'tool_original',
  initiator: { organization: 'org_original', account: 'acc_original' },
  externalEffect: 'confirmed',
  cost: {
    total_usd: ready.cost.cost_usd,
    items: [
      {
        service: 'model_call',
        reference: ready.responseId,
        cost_usd: ready.cost.cost_usd,
        source: 'model_response',
      },
    ],
  },
  usage,
  frames: 'unknown',
  wallClock: { startedAt: '2026-09-29T09:00:00Z' },
}
function evaluate(models: readonly ModelAccountInput[], withCorrection = false) {
  const admitted = prepareAccountGroup({
    models,
    tools: withCorrection ? [{ sessionLog: 'session_original', account: mirror }] : [],
    corrections: withCorrection ? corrections : [],
  })
  if ('rejected' in admitted) throw new Error(admitted.rejected)
  return summarize(admitted.ok)
}

describe('CA4 A4-V1..2: pure explicit inputs, without source selection', () => {
  it('compiles the actual 13-definition four-resource closure, and misses each required URI', () => {
    const resources = [contentSchema, identitySchema, expirySchema, schema]
    expect(Object.keys(schema.$defs)).toHaveLength(13)
    const compile = (selected: typeof resources) => {
      const runtime = createSchemaRuntime(selected)
      for (const name of Object.keys(schema.$defs))
        runtime.compile({ $ref: `${schema.$id}#/$defs/${name}` })
    }
    expect(() => compile(resources)).not.toThrow()
    for (let index = 0; index < resources.length; index++)
      expect(() => compile(resources.filter((_, item) => item !== index))).toThrow()
  })

  it('checks both normative ACK examples with original cost shape', () => {
    const rows: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/call-accounts/v4/ack-examples.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    if (!Array.isArray(rows)) throw new Error('missing ACK examples')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      if (
        row === null ||
        typeof row !== 'object' ||
        !('definition' in row) ||
        !('value' in row) ||
        !('schemaValid' in row)
      )
        throw new Error('invalid ACK example')
      if (row.definition !== 'Cost' || typeof row.schemaValid !== 'boolean')
        throw new Error('invalid ACK example')
      expect(validate(row.definition, row.value).valid).toBe(row.schemaValid)
    }
  })
  it('publishes distinct exact CA4 and CA2 resources with equal definitions', () => {
    expect(schemaId).toBe(schema.$id)
    expect(schemaId).toContain('/call-accounts/v4/')
    expect(retainedSchema.$id).toContain('/call-accounts/v2/')
    expect(schema.$defs).toEqual(retainedSchema.$defs)
    for (const [path, version, hash] of [
      [
        '../schema/call-accounts.schema.json',
        'v4',
        '710a589f5692edfd4d5d474ff9fd5df6320dd98ffba7f4c711b50c8fb1dab368',
      ],
      [
        '../schema/v2/call-accounts.schema.json',
        'v2',
        'c79cbf51ada9314d83f8bd5fcb5a10b2ebbf855a59bddbe68bb3fdfeffc19511',
      ],
    ] as const) {
      const bytes = readFileSync(new URL(path, import.meta.url))
      const original = readFileSync(
        new URL(
          `../../../../.meta_harness/design/spec/data/call-accounts/${version}/call-accounts.schema.json`,
          import.meta.url,
        ),
      )
      expect(bytes).toEqual(original)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash)
    }
  })

  it('checks the normative ready examples through concrete definitions with lossless input', () => {
    const values = strict(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/call-accounts/v4/ready-examples.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    if (!Array.isArray(values)) throw new Error('expected normative rows')
    expect(values).toHaveLength(3)
    for (const row of values) {
      if (
        row === null ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        LosslessNumber.is(row) ||
        (row.definition !== 'Cost' && row.definition !== 'Usage')
      )
        throw new Error('invalid normative row')
      expect(validate(row.definition, row.value).valid).toBe(row.schemaValid)
    }
  })

  it('keeps full decimal precision through strict read, explicit evaluation and write', () => {
    const input = strict(writeJsonLossless({ models: [ready], tools: [], corrections: [] }))
    const admitted = prepareAccountGroup(input)
    if ('rejected' in admitted) throw new Error(admitted.rejected)
    const result = summarize(admitted.ok)
    if ('failed' in result) throw new Error(result.failed)
    expect(
      writeJsonLossless({ amount: result.knownSum.toJsonNumber(), unknown: result.unknownCount }),
    ).toBe('{"amount":0.123456789012345678901,"unknown":0}')
    expect(String(Number('0.123456789012345678901'))).not.toBe(result.knownSum.toString())
  })

  it('ready and final projections separately give the same cost; combining both fails', () => {
    expect(evaluate([ready])).toEqual(evaluate([final]))
    expect(evaluate([ready, final])).toEqual({ failed: 'duplicate_account' })
    expect(
      summarizeUsage([ready, final].map(({ responseId, usage }) => ({ responseId, usage }))),
    ).toEqual({ failed: 'duplicate_account' })
  })

  it('counts two actual ResponseIds separately even when the outer CallKey is shared', () => {
    const result = evaluate([ready, { ...ready, responseId: 'response_retry' }])
    if ('failed' in result) throw new Error(result.failed)
    expect(result.knownSum.toString()).toBe('0.246913578024691357802')
    // CallKey is not an evaluator field or a deduplication authority.
    expect(
      prepareAccountGroup({
        models: [{ ...ready, callKey: 'same_call' }],
        tools: [],
        corrections: [],
      }),
    ).toEqual({ rejected: 'malformed' })
  })

  it('applies the latest correction once and excludes the tool mirror for either phase', () => {
    const before = writeJsonLossless({ ready, final, mirror, corrections })
    for (const input of [ready, final]) {
      const result = evaluate([input], true)
      if ('failed' in result) throw new Error(result.failed)
      expect(result.knownSum.toString()).toBe('0.3')
      expect(result.unknownCount).toBe(0)
    }
    expect(writeJsonLossless({ ready, final, mirror, corrections })).toBe(before)
  })

  it('preserves explicit unknown cost and usage counts instead of manufacturing zero', () => {
    const unknown: ModelAccountInput = {
      responseId: 'response_unknown',
      cost: { cost_usd: 'unknown', source: 'none' },
      usage: {
        input_tokens: 'unknown',
        output_tokens: 'unknown',
        cache_read_tokens: 'unknown',
        cache_write_tokens: 'unknown',
        source: 'none',
      },
    }
    const amount = evaluate([ready, unknown])
    if ('failed' in amount) throw new Error(amount.failed)
    expect(amount.knownSum.toString()).toBe('0.123456789012345678901')
    expect(amount.unknownCount).toBe(1)
    const tokens = summarizeUsage(
      [ready, unknown].map(({ responseId, usage }) => ({ responseId, usage })),
    )
    if ('rejected' in tokens || 'failed' in tokens) throw new Error('invalid usage result')
    expect(tokens.input_tokens.knownSum.toString()).toBe('9007199254740993')
    expect(tokens.input_tokens.unknownCount).toBe(1)
  })

  it('rejects bad original values before projection and never accepts a derived cost as original', () => {
    for (const cost of [
      { cost_usd: -1, source: 'upstream_usage' },
      { cost_usd: 0, source: 'later_correction' },
    ]) {
      expect(
        prepareAccountGroup({ models: [{ ...ready, cost }], tools: [], corrections: [] }),
      ).toEqual({ rejected: cost.source === 'later_correction' ? 'malformed' : 'negative_amount' })
    }
  })
})
