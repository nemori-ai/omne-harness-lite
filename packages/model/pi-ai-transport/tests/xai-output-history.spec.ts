import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type { PlanInput, PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { projectAssistant } from '../src/assistant-projection.ts'
import { createXaiInputMeter } from '../src/input-meters/xai.ts'
import { classifyXaiUnit } from '../src/input-meters/xai-family-policy.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import { outputBlockDigestAtRevision, projectOutput, projectionDigest } from '../src/projection.ts'
import { judgedMessage, message } from './support.ts'
import { xaiCloseoutInput } from './fixtures/xai/closeout-scenarios.ts'

const at = '2026-09-29T00:00:00Z'
const visible = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: true }
const tool = {
  name: 'lookup__xai',
  description: 'Look up a key',
  parameters: { type: 'object', properties: { key: { type: 'string' } } },
}
const details = [
  { type: 'reasoning.summary', summary: 'Find alpha', format: 'xai-responses-v1', index: 0 },
  {
    type: 'reasoning.encrypted',
    data: 'SENTINEL_CIPHERTEXT_NOT_TOKENS',
    format: 'xai-responses-v1',
    id: 'reason-1',
    index: 1,
  },
]

function response(model: string, id: string): Message {
  return judgedMessage({
    id,
    type: 'assistant',
    response: `${id}-response`,
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: `${id}-thinking`,
        kind: 'thinking',
        text: '',
        opaque: toOpaqueJson({ routeName: model, reasoning_details: details }),
        visibility: hidden,
      },
      { id: `${id}-text`, kind: 'text', text: 'Alpha is 42', visibility: visible },
      {
        id: `${id}-call`,
        kind: 'tool_call',
        callId: `call_${id}`,
        tool: tool.name,
        complete: true,
        arguments: { key: 'alpha' },
        visibility: visible,
      },
    ],
  })
}

function toolResult(id: string): Message {
  return judgedMessage({
    id: `${id}-result`,
    type: 'tool',
    callId: `call_${id}`,
    createdAt: at,
    blocks: [
      {
        id: `${id}-result-block`,
        kind: 'tool_result',
        callId: `call_${id}`,
        outcome: 'completed',
        visibility: visible,
        blocks: [{ id: `${id}-value`, kind: 'text', text: 'alpha=42', visibility: visible }],
      },
    ],
  })
}

function group(
  plan: PlannedRequest,
  reply: Message,
  index: number,
  output = 23,
): PlanOutputHistoryGroup {
  const projected = projectOutput({
    blocks: reply.blocks,
    source: 'reply',
    completeness: 'complete',
  })
  if (!('projected' in projected)) throw Error('invalid output fixture')
  return {
    inputCalibration: {
      requestInput: plan.requestInput,
      observedInput: {
        kind: 'from_usage',
        provenance: {
          adapterRevision: 'openrouter-usage-reader/2',
          fieldPaths: ['usage.prompt_tokens'],
        },
      },
      outputGroup: projected.projected,
    },
    usage: {
      input_tokens: 100,
      output_tokens: output,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: Math.min(output, 19),
      source: 'upstream',
    },
    outputBlocks: reply.blocks,
    replaySelection: reply.blocks.map((_, blockIndex) => ({
      sourceBlockIndex: blockIndex,
      messageIndex: index,
      blockIndex,
    })),
    origin: {
      adaptation: plan.input.snapshot.adaptation,
      provider: 'xai',
      parameters: plan.parameters,
    },
  }
}

function observed(group: PlanOutputHistoryGroup): PlanInput['calibration'] {
  return {
    kind: 'observation',
    inputCalibration: group.inputCalibration,
    usage: group.usage,
    outputBlocks: group.outputBlocks,
    replaySelection: group.replaySelection,
  }
}

describe.each(xaiDefinitions)('$modelId complete xAI output groups', definition => {
  const meter = createXaiInputMeter(definition)
  if (!meter) throw Error('missing xAI meter')

  async function planned(input: PlanInput): Promise<PlannedRequest> {
    const result = await planRequest(input, [definition], meter, {
      signal: new AbortController().signal,
    })
    if (!('planned' in result)) throw Error(JSON.stringify(result))
    return result.planned
  }

  async function history() {
    const base = { ...xaiCloseoutInput(definition.modelId, at), tools: [tool] }
    const first = await planned(base)
    const reply = response(definition.modelId, 'a')
    const original = group(first, reply, 1)
    const input: PlanInput = {
      ...base,
      target: { kind: 'model_call', callId: 'xai-group-2', dispatch: 1 },
      messages: [
        ...base.messages,
        reply,
        toolResult('a'),
        message('user', 'Continue using alpha', 'xai-group-next'),
      ],
      outputHistory: [original],
    }
    return { base, first, reply, original, input }
  }

  it('publishes the exact successor coordinates and retains the visible tokenizer basis', () => {
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    expect(definition.revision).toBe('5')
    expect(definition.implementation).toEqual({ name: 'pi-ai:xai', revision: 'mp4-19' })
    expect({
      algorithm: meter.algorithmRevision,
      tokenizer: meter.tokenizerRevision,
      replay: meter.replayRevision,
      transform: meter.transformRevision,
    }).toEqual({
      algorithm: 'xai-visible-json-complete-output-group-estimated/1',
      tokenizer: `tokenizer-basis/grok-build-visible-text-tools-effort-offset${offset}-2`,
      replay: 'xai-complete-output-group-workload-estimated/1',
      transform: 'openrouter-wire/2',
    })
    expect(createXaiInputMeter({ ...definition, revision: '4' })).toBeUndefined()
    expect(
      createXaiInputMeter({
        ...definition,
        implementation: { name: 'pi-ai:xai', revision: 'mp4-18' },
      }),
    ).toBeUndefined()
  })

  it('retains the entire original wire and replaces summary, encrypted, text and tool once by O', async () => {
    const { input, original } = await history()
    const full = await planned(input)
    const assistant = projectAssistant(original.outputBlocks, definition.modelId, false)
    if ('rejected' in assistant) throw Error('missing assistant')
    expect(writeJsonLossless(full.body)).toContain('SENTINEL_CIPHERTEXT_NOT_TOKENS')
    if (!Array.isArray(full.body.messages)) throw Error('missing final messages')
    expect(full.body.messages[1]).toEqual(assistant.message)
    const body = {
      ...full.body,
      messages: (full.body.messages as readonly unknown[]).filter((_, index) => index !== 1),
    }
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    const expected =
      Math.floor(Buffer.byteLength(writeJsonLossless(body), 'utf8') / 4) + offset + 23
    expect(full.measurement.mode).toBe('full')
    expect(
      ExactDecimal.from(full.measurement.predictedInput).compare(ExactDecimal.from(expected)),
    ).toBe(0)
    expect(
      ExactDecimal.from(full.measurement.admissionTokens).compare(
        ExactDecimal.from(Math.floor((expected * 11 + 9) / 10) + 256),
      ),
    ).toBe(0)
    const marginal = await planned({ ...input, calibration: observed(original) })
    expect(marginal.measurement.mode).toBe('marginal')
    if (marginal.measurement.mode !== 'marginal') throw Error('missing marginal')
    expect(marginal.measurement.replayContribution).toEqual({ precision: 'estimated', tokens: 23 })
    expect(
      ExactDecimal.from(marginal.measurement.predictedInput).compare(
        ExactDecimal.from(123).add(ExactDecimal.from(marginal.measurement.newContribution.tokens)),
      ),
    ).toBe(0)
  })

  it('invalidates I on current effort change while independently retaining original O in full', async () => {
    const { input, original } = await history()
    const changed = await planned({
      ...input,
      parameters: { ...input.parameters, reasoningEffort: 'high', maxOutputTokens: 64 },
      calibration: observed(original),
    })
    expect(changed.measurement.mode).toBe('full')
    expect(writeJsonLossless(changed.body)).toContain('SENTINEL_CIPHERTEXT_NOT_TOKENS')
    const stripped = {
      ...changed.body,
      messages: (changed.body.messages as readonly unknown[]).filter((_, index) => index !== 1),
    }
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    expect(
      ExactDecimal.from(changed.measurement.predictedInput).compare(
        ExactDecimal.from(
          Math.floor(Buffer.byteLength(writeJsonLossless(stripped), 'utf8') / 4) + offset + 23,
        ),
      ),
    ).toBe(0)
  })

  it('uses saved V3/V4 source rows without exposing old execution factories', async () => {
    const { first, input, original } = await history()
    const request = original.inputCalibration.requestInput
    const output = original.inputCalibration.outputGroup
    if (request.kind !== 'known' || output.kind !== 'known') throw Error('known source required')
    const { messages, ...envelope } = first.body
    if (!Array.isArray(messages)) throw Error('missing original messages')
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    for (const [revision, implementation, projection] of [
      ['3', 'mp4-17', 'openrouter-input-projection/2'],
      ['4', 'mp4-18', request.projectionRevision],
    ] as const) {
      const binding = {
        ...original.origin.adaptation,
        definition: { modelId: definition.modelId, revision },
        implementation: { name: 'pi-ai:xai', revision: implementation },
      }
      const historical: PlanOutputHistoryGroup = {
        ...original,
        origin: { ...original.origin, adaptation: binding },
        inputCalibration: {
          ...original.inputCalibration,
          requestInput: {
            ...request,
            projectionRevision: projection,
            prefixDigest: projectionDigest('input-prefix', messages, projection),
            inputEnvelopeDigest: projectionDigest('input-envelope', envelope, projection),
            countingBasis: {
              ...request.countingBasis,
              binding,
              meterRevision: `grok-build-visible-text-tools-effort-offset${offset}-2/response-calibration-1`,
              replayRevision: 'visible-final-units-json-net-estimated/1',
              projectionRevision: projection,
            },
          },
          outputGroup: {
            ...output,
            projectionRevision: projection,
            blockDigests: original.outputBlocks.map(block =>
              outputBlockDigestAtRevision(block, projection),
            ),
          },
        },
      }
      const result = await planned({ ...input, outputHistory: [historical] })
      expect(result.measurement.mode).toBe('full')
      expect(writeJsonLossless(result.body)).toContain('SENTINEL_CIPHERTEXT_NOT_TOKENS')
      const historicalRequest = historical.inputCalibration.requestInput
      if (historicalRequest.kind !== 'known') throw Error('known historical source required')
      const incorrect: PlanOutputHistoryGroup = {
        ...historical,
        inputCalibration: {
          ...historical.inputCalibration,
          requestInput: {
            ...historicalRequest,
            countingBasis: {
              ...historicalRequest.countingBasis,
              meterRevision: 'unknown-algorithm',
            },
          },
        },
      }
      expect(
        await planRequest({ ...input, outputHistory: [incorrect] }, [definition], meter, {
          signal: new AbortController().signal,
        }),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    }
  })

  it('counts two disjoint complete groups once each, including O=0', async () => {
    const { input, original } = await history()
    const second = await planned(input)
    const reply = response(definition.modelId, 'b')
    const zero = group(second, reply, 4, 0)
    const final = await planned({
      ...input,
      target: { kind: 'model_call', callId: 'xai-group-3', dispatch: 1 },
      messages: [
        ...input.messages,
        reply,
        toolResult('b'),
        message('user', 'Last question', 'xai-group-last'),
      ],
      outputHistory: [original, zero],
    })
    expect(writeJsonLossless(final.body)).toContain('SENTINEL_CIPHERTEXT_NOT_TOKENS')
    if (!Array.isArray(final.body.messages)) throw Error('missing final messages')
    const stripped = {
      ...final.body,
      messages: final.body.messages.filter((_, index) => index !== 1 && index !== 4),
    }
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    expect(
      ExactDecimal.from(final.measurement.predictedInput).compare(
        ExactDecimal.from(
          Math.floor(Buffer.byteLength(writeJsonLossless(stripped), 'utf8') / 4) + offset + 23,
        ),
      ),
    ).toBe(0)
  })

  it('keeps partial groups and unknown upstream identities unavailable', async () => {
    const { input, original } = await history()
    const changed = [
      { ...original, origin: { ...original.origin, servingProvider: 'xAI' } },
      { ...original, origin: { ...original.origin, upstreamModel: definition.modelId } },
      {
        ...original,
        inputCalibration: {
          ...original.inputCalibration,
          outputGroup: {
            ...original.inputCalibration.outputGroup,
            completeness: 'partial' as const,
          },
        },
      },
      { ...original, usage: { ...original.usage, output_tokens: 'unknown' as const } },
    ]
    for (const suspect of changed) {
      const result = await planRequest(
        { ...input, outputHistory: [suspect] },
        [definition],
        meter,
        { signal: new AbortController().signal },
      )
      expect(result).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
    }
    expect(classifyXaiUnit({ role: 'assistant', content: '', reasoning_details: details })).toBe(
      'wholeGroup',
    )
    for (const invalid of [
      { ...details[1], format: 'unknown' },
      { ...details[1], data: '' },
      { ...details[1], extra: true },
    ])
      expect(
        classifyXaiUnit({ role: 'assistant', content: '', reasoning_details: [invalid] }),
      ).toBe('uninterpretable')
  })

  it('uses a complete original O when request-input evidence was not retained', async () => {
    const { input, original } = await history()
    const withoutAnchor: PlanOutputHistoryGroup = {
      ...original,
      inputCalibration: {
        ...original.inputCalibration,
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
      },
    }
    const result = await planned({ ...input, outputHistory: [withoutAnchor] })
    expect(result.measurement.mode).toBe('full')
    expect(writeJsonLossless(result.body)).toContain('SENTINEL_CIPHERTEXT_NOT_TOKENS')
    const stripped = {
      ...result.body,
      messages: (result.body.messages as readonly unknown[]).filter((_, index) => index !== 1),
    }
    const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
    expect(
      ExactDecimal.from(result.measurement.predictedInput).compare(
        ExactDecimal.from(
          Math.floor(Buffer.byteLength(writeJsonLossless(stripped), 'utf8') / 4) + offset + 23,
        ),
      ),
    ).toBe(0)
  })

  it('rejects altered output facts and replay selection before a full fallback', async () => {
    const { input, original } = await history()
    const first = original.replaySelection[0]
    if (!first) throw Error('missing original selection')
    const forged = [
      {
        ...original,
        outputBlocks: original.outputBlocks.map(block =>
          block.kind === 'text' ? { ...block, text: 'forged source' } : block,
        ),
      },
      {
        ...original,
        replaySelection: [first, first, ...original.replaySelection.slice(2)],
      },
      {
        ...original,
        replaySelection: original.replaySelection.map((item, index) =>
          index === 1 ? { ...item, messageIndex: item.messageIndex + 1 } : item,
        ),
      },
    ]
    for (const group of forged)
      expect(
        await planRequest({ ...input, outputHistory: [group] }, [definition], meter, {
          signal: new AbortController().signal,
        }),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
  })

  it('rejects an altered selected block before a full fallback can use O', async () => {
    const { input, reply } = await history()
    const altered = judgedMessage({
      ...reply,
      blocks: reply.blocks.map(block =>
        block.kind === 'text' ? { ...block, text: 'forged answer' } : block,
      ),
    })
    expect(
      await planRequest(
        { ...input, messages: [input.messages[0]!, altered, ...input.messages.slice(2)] },
        [definition],
        meter,
        { signal: new AbortController().signal },
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
  })
})
