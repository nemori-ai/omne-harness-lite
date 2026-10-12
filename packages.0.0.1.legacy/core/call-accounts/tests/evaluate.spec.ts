import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import {
  AccountGroup,
  ExactDecimal,
  effectiveCost,
  judgeAccountValue,
  prepareAccountGroup,
  summarize,
  summarizeUsage,
  type AccountGroupInput,
  type Cost,
  type Usage,
  type ToolCallAccount,
  type CostCorrection,
  type SummaryResult,
  type CorrectionInput,
  type ModelCostTarget,
} from '../src/index.ts'
import { example } from './fixtures.ts'

function cost(label: string): Cost {
  const value = example(label)
  if (isCost(value)) return value
  throw new Error(label)
}
function isCost(value: unknown): value is Cost {
  return 'ok' in judgeAccountValue('Cost', value)
}
function usage(label: string): Usage {
  const value = example(label)
  if (isUsage(value)) return value
  throw new Error(label)
}
function isUsage(value: unknown): value is Usage {
  return 'ok' in judgeAccountValue('Usage', value)
}
function tool(label: string): ToolCallAccount {
  const value = example(label)
  if (isTool(value)) return value
  throw new Error(label)
}
function isTool(value: unknown): value is ToolCallAccount {
  return 'ok' in judgeAccountValue('ToolCallAccount', value)
}
function correction(label: string): CorrectionInput {
  const value = example(label)
  if (isCorrection(value)) return { sessionLog: 's1', correction: value }
  throw new Error(label)
}
function isCorrection(value: unknown): value is CostCorrection {
  return 'ok' in judgeAccountValue('CostCorrection', value)
}
const models = [
  { responseId: 'rsp_1a2b', cost: cost('C-1'), usage: usage('U-1') },
  { responseId: 'rsp_2b7f', cost: cost('C-2'), usage: usage('U-2') },
  { responseId: 'rsp_3c4d', cost: cost('C-3'), usage: usage('U-3') },
  { responseId: 'rsp_9c1e', cost: cost('C-4'), usage: usage('U-4') },
]
const tools = [
  { sessionLog: 's1', account: tool('T-1') },
  { sessionLog: 's1', account: tool('T-2') },
]
const k1 = correction('K-1'),
  k2 = correction('K-2')
function admitted(input: unknown): AccountGroup {
  const result = prepareAccountGroup(input)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function assertSum(result: SummaryResult, expected: string, unknownCount: number) {
  expect(result).not.toHaveProperty('failed')
  if ('failed' in result) throw new Error(result.failed)
  expect(result.knownSum.compare(ExactDecimal.from(new LosslessNumber(expected)))).toBe(0)
  expect(result.unknownCount).toBe(unknownCount)
}
describe('V5/V6 S22-S24 normative manual arithmetic', () => {
  it('empty group means no accounts, not missing accounts treated as zero', () =>
    assertSum(summarize(admitted({ models: [], tools: [], corrections: [] })), '0', 0))
  it.each([
    { models: models.slice(0, 2), tools: [], corrections: [], expected: '0.004187', unknown: 1 },
    { models: models.slice(2), tools, corrections: [], expected: '0.00722', unknown: 1 },
    { models, tools, corrections: [], expected: '0.011407', unknown: 2 },
    { models: models.slice(0, 2), tools: [], corrections: [k1], expected: '0.008087', unknown: 0 },
    { models: models.slice(2), tools, corrections: [k2], expected: '0.01372', unknown: 0 },
    { models, tools, corrections: [k1, k2], expected: '0.021807', unknown: 0 },
    { models, tools, corrections: [k1, k2, correction('K-3')], expected: '0.021907', unknown: 0 },
  ])(
    'knownSum $expected unknownCount $unknown',
    ({ models, tools, corrections, expected, unknown }) =>
      assertSum(summarize(admitted({ models, tools, corrections })), expected, unknown),
  )
  it('returns four per-token sums using only model Usage', () => {
    const result = summarizeUsage(models.map(({ responseId, usage }) => ({ responseId, usage })))
    if ('failed' in result) throw new Error(result.failed)
    if ('rejected' in result) throw new Error(result.rejected)
    assertSum(result.input_tokens, '3840', 1)
    assertSum(result.output_tokens, '863', 1)
    assertSum(result.cache_read_tokens, '24576', 1)
    assertSum(result.cache_write_tokens, '0', 2)
  })
  it('corrects effective model cost, preserves original cost and alternate upstream charge', () => {
    const original: Cost = {
      cost_usd: new LosslessNumber('0.00512'),
      upstream_inference_cost_usd: new LosslessNumber('0.004900'),
      source: 'upstream_usage',
    }
    const bytes = writeJsonLossless(original)
    const row: CorrectionInput = {
      sessionLog: 'irrelevant-for-deployment-wide-response-id',
      correction: { ...k1.correction, cost_usd: new LosslessNumber('0.003900') },
    }
    const result = effectiveCost(
      { kind: 'model_response', responseId: 'rsp_2b7f', cost: original },
      [row],
    )
    expect(result).toHaveProperty('ok')
    if (!('ok' in result)) throw new Error('failed effective cost')
    expect(result.ok.source).toBe('later_correction')
    expect(writeJsonLossless(result.ok)).toBe(
      '{"cost_usd":0.003900,"source":"later_correction","upstream_inference_cost_usd":0.004900}',
    )
    expect(writeJsonLossless(original)).toBe(bytes)
    expect(Object.isFrozen(result.ok)).toBe(true)
  })
  it('uses only own costs of a tool and never total_usd or mirror', () => {
    const before = writeJsonLossless(tools)
    const result = effectiveCost(
      { kind: 'tool_execution', sessionLog: 's1', account: tool('T-1') },
      [k2],
    )
    expect(result).toHaveProperty('ok')
    if (!('ok' in result) || result.ok === 'unknown') throw new Error('missing corrected amount')
    expect(
      ExactDecimal.from(result.ok).compare(ExactDecimal.from(new LosslessNumber('0.0065'))),
    ).toBe(0)
    expect(writeJsonLossless(tools)).toBe(before)
  })
  it('keeps an unknown own target unknown even if a mirror has known money', () =>
    expect(
      effectiveCost({ kind: 'tool_execution', sessionLog: 's1', account: tool('T-1') }, []),
    ).toEqual({ ok: 'unknown' }))
  it('keeps late accounts and late corrections in the supplied group', () => {
    const account = tool('T-4')
    assertSum(
      summarize(admitted({ models: [], tools: [{ sessionLog: 's1', account }], corrections: [] })),
      '0.002',
      0,
    )
    assertSum(
      summarize(admitted({ models: [models[1]], tools: [], corrections: [correction('K-5')] })),
      '0.0042',
      0,
    )
  })
})
describe('S23 explicit failures and target identity', () => {
  it('fails instead of deduplicating a repeated response', () =>
    expect(
      summarize(admitted({ models: [models[0], models[0]], tools: [], corrections: [] })),
    ).toEqual({ failed: 'duplicate_account' }))
  it('fails on repeated callId inside the same session log', () =>
    expect(
      summarize(admitted({ models: [], tools: [tools[1], tools[1]], corrections: [] })),
    ).toEqual({ failed: 'duplicate_account' }))
  it('same callId in two logs is two distinct executions', () => {
    const first = { sessionLog: 's1', account: tool('T-3') },
      second = { sessionLog: 's2', account: tool('T-3') }
    assertSum(
      summarize(admitted({ models: [], tools: [first, second], corrections: [] })),
      '0.0104',
      0,
    )
    const row: CorrectionInput = {
      sessionLog: 's1',
      correction: {
        ...k2.correction,
        target: { kind: 'tool_execution', callId: first.account.callId },
        cost_usd: new LosslessNumber('0.01'),
      },
    }
    assertSum(
      summarize(admitted({ models: [], tools: [first, second], corrections: [row] })),
      '0.0152',
      0,
    )
  })
  it('uses collision-free tuples even when log/call keys contain delimiters', () => {
    const a = { sessionLog: 'x:y', account: { ...tool('T-2'), callId: 'z' } }
    const b = { sessionLog: 'x', account: { ...tool('T-2'), callId: 'y:z' } }
    assertSum(summarize(admitted({ models: [], tools: [a, b], corrections: [] })), '0', 0)
  })
  it('orphan correction cannot disappear from a normal result', () =>
    expect(
      summarize(admitted({ models: models.slice(0, 2), tools: [], corrections: [k1, k2] })),
    ).toEqual({ failed: 'orphan_correction' }))
  it('a tool correction in another session cannot attach by callId alone', () =>
    expect(
      summarize(admitted({ models: [], tools, corrections: [{ ...k2, sessionLog: 's2' }] })),
    ).toEqual({ failed: 'orphan_correction' }))
  it('different amounts at equal instant fail, including equivalent offsets', () => {
    const sameInstant: CorrectionInput = {
      sessionLog: 's2',
      correction: {
        ...k1.correction,
        at: '2026-09-23T18:05:00+08:00',
        cost_usd: new LosslessNumber('0.004'),
      },
    }
    expect(
      summarize(admitted({ models: [models[1]], tools: [], corrections: [k1, sameInstant] })),
    ).toEqual({ failed: 'correction_tie' })
  })
  it('same decimal value at equal instant is unambiguous despite different spelling', () => {
    const same: CorrectionInput = {
      ...k1,
      correction: { ...k1.correction, cost_usd: new LosslessNumber('39e-4') },
    }
    assertSum(
      summarize(admitted({ models: [models[1]], tools: [], corrections: [k1, same] })),
      '0.0039',
      0,
    )
  })
  it('retains sub-millisecond ordering instead of inventing a tie', () => {
    const a: CorrectionInput = {
      ...k1,
      correction: {
        ...k1.correction,
        at: '2026-09-23T10:05:00.000000001Z',
        cost_usd: new LosslessNumber('0.1'),
      },
    }
    const b: CorrectionInput = {
      ...k1,
      correction: {
        ...k1.correction,
        at: '2026-09-23T10:05:00.000000002Z',
        cost_usd: new LosslessNumber('0.2'),
      },
    }
    assertSum(
      summarize(admitted({ models: [models[1]], tools: [], corrections: [b, a] })),
      '0.2',
      0,
    )
  })
  it('a conflicting older pair remains an S23 failure even with a later correction', () =>
    expect(
      summarize(
        admitted({
          models: [models[1]],
          tools: [],
          corrections: [k1, correction('K-3'), correction('K-4')],
        }),
      ),
    ).toEqual({ failed: 'correction_tie' }))
  it('normal result is invariant under model/tool/correction order', () => {
    for (let shift = 0; shift < models.length; shift++) {
      const rotated = [...models.slice(shift), ...models.slice(0, shift)]
      for (const ms of [rotated, [...rotated].reverse()])
        for (const ts of [tools, [...tools].reverse()])
          for (const cs of [
            [k1, k2],
            [k2, k1],
          ])
            assertSum(
              summarize(admitted({ models: ms, tools: ts, corrections: cs })),
              '0.021807',
              0,
            )
    }
  })
})
describe('S27/S28 full admission before projection', () => {
  it('rejects an invalid mirror before excluding it from sums', () => {
    const bad: ToolCallAccount = {
      ...tool('T-1'),
      cost: {
        ...tool('T-1').cost,
        items: [{ service: 'model_call', cost_usd: -1, reference: 'r1', source: 'model_response' }],
      },
    }
    expect(
      prepareAccountGroup({
        models: [],
        tools: [{ sessionLog: 's1', account: bad }],
        corrections: [],
      }),
    ).toEqual({ rejected: 'negative_amount' })
  })
  it('checks malformed fields that would disappear from the projection', () => {
    const bad = {
      ...tool('T-2'),
      frames: { emitted: 0, trims: { cut: -1 } },
    }
    expect(
      prepareAccountGroup({
        models: [],
        tools: [{ sessionLog: 's1', account: bad }],
        corrections: [],
      }),
    ).toEqual({ rejected: 'malformed' })
  })
  it('does not silently skip an invalid Usage because only money was requested', () =>
    expect(
      prepareAccountGroup({
        models: [
          { responseId: 'r1', cost: cost('C-1'), usage: { ...usage('U-4'), output_tokens: -1 } },
        ],
        tools: [],
        corrections: [],
      }),
    ).toEqual({ rejected: 'negative_amount' }))
  it('must be admitted at runtime as well as through TypeScript', () =>
    expect(() => Reflect.construct(AccountGroup, [Symbol('fake'), [], []])).toThrow(
      'requires admission',
    ))
  it('retains an immutable snapshot after the caller mutates its input', () => {
    const input = {
      models: [
        {
          responseId: 'r1',
          cost: { cost_usd: new LosslessNumber('0.1'), source: 'upstream_usage' },
          usage: usage('U-4'),
        },
      ],
      tools: [],
      corrections: [],
    }
    const group = admitted(input)
    const first = input.models[0]
    if (first === undefined) throw new Error('missing test model')
    first.cost.cost_usd = new LosslessNumber('999')
    assertSum(summarize(group), '0.1', 0)
  })
  it('never invokes a getter or toJSON to repair non-JSON input', () => {
    let calls = 0
    const value = {
      get models() {
        calls++
        return []
      },
      tools: [],
      corrections: [],
    }
    expect(prepareAccountGroup(value)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })
  it('effectiveCost rejects a target getter before reading its discriminant', () => {
    let calls = 0
    const target: ModelCostTarget = {
      get kind(): 'model_response' {
        calls++
        return 'model_response'
      },
      responseId: 'rsp_1a2b',
      cost: cost('C-1'),
    }
    expect(effectiveCost(target, [])).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })
  it('effectiveCost rejects a nested original Cost getter without evaluating it', () => {
    let calls = 0
    const original: Cost = {
      cost_usd: 1,
      get source(): 'upstream_usage' {
        calls++
        return 'upstream_usage'
      },
    }
    expect(effectiveCost({ kind: 'model_response', responseId: 'r1', cost: original }, [])).toEqual(
      { rejected: 'malformed' },
    )
    expect(calls).toBe(0)
  })
  it('effectiveCost snapshots corrections before reading their values', () => {
    let calls = 0
    const row: CorrectionInput = {
      sessionLog: 's1',
      get correction() {
        calls++
        return k1.correction
      },
    }
    expect(
      effectiveCost({ kind: 'model_response', responseId: 'rsp_2b7f', cost: cost('C-2') }, [row]),
    ).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })
  it('same account inputs produce stable rejection across permutations', () => {
    const invalid = {
      responseId: 'r',
      cost: { cost_usd: -1, source: 'upstream_usage' },
      usage: usage('U-4'),
    }
    expect(
      prepareAccountGroup({ models: [models[0], invalid], tools: [], corrections: [] }),
    ).toEqual(prepareAccountGroup({ models: [invalid, models[0]], tools: [], corrections: [] }))
  })
  it('uses the actual asset-model canonical service string for MCP records', () => {
    const service = capabilityCanonicalString({ category: 'mcp', name: 'github' })
    expect(
      judgeAccountValue('CostItem', { service, cost_usd: 1, source: 'service_reported' }),
    ).toEqual({ ok: true })
  })
})
