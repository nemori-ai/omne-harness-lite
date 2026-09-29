import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ownCalibration } from '../calibration.ts'
import { object } from '../json.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import type { InputMeter, MeterContribution } from '../input-meter.ts'

export const openAi56ReplayModels: ReadonlySet<string> = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
])
export const OPENAI_56_REPLAY_REVISION =
  'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2'

export const OPENAI_56_TOKENIZER_REVISION =
  'tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6'
export const OPENAI_56_HISTORY_ALGORITHM = 'openai-gpt-5.6-o200k-base-complete-output-history-7'

// These are original facts interpretable by the successor, never factory aliases.
const sourceBindings = [
  {
    definition: '6',
    implementation: 'mp4-12',
    algorithm: 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
    replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1',
  },
  {
    definition: '7',
    implementation: 'mp4-16',
    algorithm: `${OPENAI_56_HISTORY_ALGORITHM}/response-calibration-1`,
    replay: OPENAI_56_REPLAY_REVISION,
  },
] as const
const efforts = ['none', 'low', 'medium', 'high', 'max']

/** Shared O+0 estimate; this makes no exact output/input-token equality claim. */
export function estimateOpenAi56Group(input: unknown, meter: InputMeter): MeterContribution {
  const unavailable = { kind: 'unavailable' } as const
  try {
    // The independent function accepts data, not caller trust. Reject accessors
    // and own JSON before inspecting any input member.
    const copied = copyJsonValue(input)
    if ('failed' in copied || !object(copied.ok)) return unavailable
    const value = copied.ok
    const source = ownCalibration(value.observation)
    if (!source || source.kind !== 'observation') return unavailable
    const {
      requestInput: request,
      observedInput: observed,
      outputGroup: group,
    } = source.inputCalibration
    const envelope = value.envelope
    if (
      !openAi56ReplayModels.has(meter.modelId) ||
      meter.definitionRevision !== '7' ||
      meter.implementation.name !== 'pi-ai:openai' ||
      meter.implementation.revision !== 'mp4-16' ||
      meter.provider !== 'openai' ||
      meter.replayRevision !== OPENAI_56_REPLAY_REVISION ||
      meter.algorithmRevision !== `${OPENAI_56_HISTORY_ALGORITHM}/response-calibration-1` ||
      meter.tokenizerRevision !== OPENAI_56_TOKENIZER_REVISION ||
      meter.transformRevision !== 'openrouter-wire/2' ||
      (value.history === undefined &&
        (request.kind !== 'known' || observed.kind === 'unavailable')) ||
      group.kind !== 'known' ||
      group.source !== 'reply' ||
      group.completeness !== 'complete' ||
      group.projectionRevision !== INPUT_PROJECTION_REVISION ||
      (request.kind === 'known' && request.projectionRevision !== INPUT_PROJECTION_REVISION) ||
      source.usage.source !== 'upstream' ||
      source.usage.output_tokens === 'unknown' ||
      !object(envelope) ||
      envelope.model !== meter.modelId ||
      !object(envelope.provider) ||
      canonicalProjection(envelope.provider) !==
        canonicalProjection({
          order: ['openai'],
          allow_fallbacks: false,
          require_parameters: true,
        }) ||
      (envelope.reasoning !== undefined &&
        (!object(envelope.reasoning) ||
          Object.keys(envelope.reasoning).length !== 1 ||
          !['none', 'low', 'medium', 'high', 'max'].includes(String(envelope.reasoning.effort)))) ||
      !Array.isArray(value.units) ||
      value.units.length !== 1 ||
      !Array.isArray(value.unitIndices) ||
      value.unitIndices.length !== 1 ||
      !Number.isSafeInteger(value.unitIndices[0]) ||
      (value.precedingUnitCount !== undefined &&
        (!Number.isSafeInteger(value.precedingUnitCount) ||
          Number(value.unitIndices[0]) < Number(value.precedingUnitCount))) ||
      !Array.isArray(value.selectionSpans)
    )
      return unavailable
    const history = value.history
    const origin = object(history) && object(history.origin) ? history.origin : undefined
    if (
      history !== undefined &&
      (!object(history) ||
        !origin ||
        canonicalProjection({
          kind: 'observation',
          inputCalibration: history.inputCalibration,
          usage: history.usage,
          outputBlocks: history.outputBlocks,
          replaySelection: history.replaySelection,
        }) !== canonicalProjection(value.observation))
    )
      return unavailable
    const basis = request.kind === 'known' ? request.countingBasis : undefined
    const binding = origin?.adaptation ?? basis?.binding
    if (!object(binding) || !object(binding.definition) || !object(binding.implementation))
      return unavailable
    const sourceDefinition = binding.definition,
      sourceImplementation = binding.implementation
    const original = sourceBindings.find(
      row =>
        row.definition === sourceDefinition.revision &&
        row.implementation === sourceImplementation.revision,
    )
    if (
      !original ||
      binding.definition.modelId !== meter.modelId ||
      binding.implementation.name !== meter.implementation.name ||
      (basis &&
        (basis.model !== meter.modelId ||
          basis.provider !== 'openai' ||
          canonicalProjection(basis.binding) !== canonicalProjection(binding) ||
          basis.tokenizerRevision !== OPENAI_56_TOKENIZER_REVISION ||
          basis.meterRevision !== original.algorithm ||
          basis.replayRevision !== original.replay ||
          basis.transformRevision !== 'openrouter-wire/2' ||
          basis.projectionRevision !== INPUT_PROJECTION_REVISION)) ||
      (origin &&
        (origin.provider !== 'openai' ||
          !object(origin.parameters) ||
          (origin.parameters.reasoningEffort !== undefined &&
            !efforts.includes(String(origin.parameters.reasoningEffort))) ||
          (origin.upstreamModel !== undefined && origin.upstreamModel !== meter.modelId) ||
          (origin.servingProvider !== undefined &&
            !['openai', 'OpenAI'].includes(String(origin.servingProvider))))) ||
      (observed.kind !== 'unavailable' &&
        (observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
          (observed.provenance.upstreamModel !== undefined &&
            observed.provenance.upstreamModel !== meter.modelId) ||
          (observed.provenance.servingProvider !== undefined &&
            !['openai', 'OpenAI'].includes(observed.provenance.servingProvider)))) ||
      (source.usage.reasoning_tokens !== undefined &&
        ExactDecimal.from(source.usage.reasoning_tokens).compare(
          ExactDecimal.from(source.usage.output_tokens),
        ) > 0)
    )
      return unavailable
    // A replay without the explicit original origin retains its prior envelope proof.
    // Full/new groups always use the existing origin; no requestInput is synthesized.
    if (
      !origin &&
      (request.kind !== 'known' ||
        value.precedingUnitCount === undefined ||
        request.inputEnvelopeDigest !==
          createHash('sha256')
            .update(
              canonicalProjection([INPUT_PROJECTION_REVISION, 'input-envelope', envelope]),
              'utf8',
            )
            .digest('hex') ||
        ExactDecimal.from(request.prefixBoundary).compare(
          ExactDecimal.from(Number(value.precedingUnitCount)),
        ) !== 0)
    )
      return unavailable
    const selected = source.replaySelection
      .map((item, selectionIndex) => ({ ...item, selectionIndex }))
      .sort((a, b) => a.messageIndex - b.messageIndex || a.blockIndex - b.blockIndex)
    if (
      !selected.length ||
      selected.length !== source.outputBlocks.length ||
      selected.some(
        (item, index) =>
          item.sourceBlockIndex !== index ||
          item.messageIndex !== selected[0]!.messageIndex ||
          (index > 0 && item.blockIndex <= selected[index - 1]!.blockIndex),
      ) ||
      value.selectionSpans.length !== selected.length
    )
      return unavailable
    const seen = new Set<number>()
    for (const span of value.selectionSpans) {
      if (
        !object(span) ||
        !Number.isSafeInteger(span.selectionIndex) ||
        Number(span.selectionIndex) < 0 ||
        Number(span.selectionIndex) >= selected.length ||
        seen.has(Number(span.selectionIndex)) ||
        span.start !== value.unitIndices[0] ||
        span.end !== Number(value.unitIndices[0]) + 1
      )
        return unavailable
      seen.add(Number(span.selectionIndex))
    }
    let encrypted = false
    const text: string[] = [],
      details: JsonValue[] = [],
      tools: JsonValue[] = []
    for (const block of source.outputBlocks) {
      if (!block.visibility.toModel) return unavailable
      if (block.kind === 'text') text.push(block.text)
      else if (block.kind === 'thinking') {
        const opaque = block.opaque === undefined ? undefined : readOpaqueJson(block.opaque)
        if (
          !object(opaque) ||
          opaque.routeName !== meter.modelId ||
          !Array.isArray(opaque.reasoning_details) ||
          !opaque.reasoning_details.length ||
          Object.keys(opaque).some(key => !['routeName', 'reasoning_details'].includes(key))
        )
          return unavailable
        for (const detail of opaque.reasoning_details) {
          if (
            !object(detail) ||
            detail.format !== 'openai-responses-v1' ||
            (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
            (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
          )
            return unavailable
          const key =
            detail.type === 'reasoning.encrypted'
              ? 'data'
              : detail.type === 'reasoning.text'
                ? 'text'
                : detail.type === 'reasoning.summary'
                  ? 'summary'
                  : undefined
          if (
            !key ||
            typeof detail[key] !== 'string' ||
            Object.keys(detail).some(name => !['type', key, 'format', 'id', 'index'].includes(name))
          )
            return unavailable
          encrypted ||= detail.type === 'reasoning.encrypted'
          details.push(detail)
        }
      } else if (block.kind === 'tool_call' && block.complete) {
        const id = /^[A-Za-z0-9_-]{1,64}$/.test(block.callId)
          ? block.callId
          : `call_${createHash('sha256').update(block.callId).digest('base64url').slice(0, 32)}`
        tools.push({
          id,
          type: 'function',
          function: {
            name: block.tool,
            arguments: block.unparseable ? block.rawArguments : writeJsonLossless(block.arguments),
          },
        })
      } else return unavailable
    }
    const expected: JsonObject = {
      role: 'assistant',
      content: text.join(''),
      reasoning_details: details,
      ...(tools.length ? { tool_calls: tools } : {}),
    }
    if (!encrypted || canonicalProjection(value.units[0]) !== canonicalProjection(expected))
      return unavailable
    // O already contains reasoning. Never add reasoning_tokens or tokenize ciphertext.
    return { kind: 'estimated', tokens: source.usage.output_tokens }
  } catch {
    return unavailable
  }
}

/** Latest-response replay consumes the same complete-group mapping as full/new. */
export function estimateOpenAi56Replay(input: unknown, meter: InputMeter): MeterContribution {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !object(copied.ok)) return { kind: 'unavailable' }
  const value = copied.ok
  if (!Array.isArray(value.outputHistory) || value.outputHistory.length > 1)
    return { kind: 'unavailable' }
  const history = value.outputHistory[0]
  return estimateOpenAi56Group(
    {
      observation: value.observation,
      envelope: value.envelope,
      units: value.units,
      unitIndices: value.unitIndices,
      selectionSpans: value.selectionSpans,
      precedingUnitCount: value.precedingUnitCount,
      ...(history === undefined ? {} : { history }),
    },
    meter,
  )
}
