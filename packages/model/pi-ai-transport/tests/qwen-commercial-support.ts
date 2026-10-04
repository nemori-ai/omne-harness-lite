// Fixtures for the adopted Qwen commercial six-leaf public-template estimate (candidate
// revision 1, QC-V0 passed) at definition 4 / mp4-20. Local streams reuse the frame shape
// QC-V0 read in all 18 batch8 raw streams (every reasoning frame: `reasoning` plus one
// identical four-key `reasoning.text` detail); their texts are the replayed reasoning in the
// rebuilt batch8 request bodies, split into fragments and merged by the real reader. Every
// response is a controlled local TLS stand-in, never an OpenRouter or Alibaba observation.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readJsonStrict, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import type { InputMeter } from '../src/input-meter.ts'
import { createQwenInputMeter, type QwenTemplateSettings } from '../src/input-meters/qwen.ts'
import { object } from '../src/json.ts'
import { qwenDefinitions } from '../src/official-models/qwen.ts'
import { lookupTool } from './moonshot-support.ts'
import type { ArchivedStream } from './moonshot-visible-support.ts'
import { input, message } from './support.ts'

export type QwenCommercialEffort = 'high' | 'max' | undefined

export const qwenCommercialModels = [
  { modelId: 'qwen/qwen3.8-max-0902', family: '3.8', efforts: [undefined, 'high', 'max'] },
  { modelId: 'qwen/qwen3.8-max-prime', family: '3.8', efforts: [undefined] },
  { modelId: 'qwen/qwen3.8-flash', family: '3.8', efforts: [undefined] },
  { modelId: 'qwen/qwen3.7-max', family: '3.7', efforts: [undefined] },
  { modelId: 'qwen/qwen3.7-plus', family: '3.7', efforts: [undefined] },
  { modelId: 'qwen/qwen3.7-flash', family: '3.7', efforts: [undefined] },
] as const satisfies readonly {
  readonly modelId: string
  readonly family: '3.8' | '3.7'
  readonly efforts: readonly QwenCommercialEffort[]
}[]
export type QwenCommercialModel = (typeof qwenCommercialModels)[number]

/** The adopted per-family template settings (candidate page, per-leaf table + QC-V0 note). */
export const qwenFamilySettings: Readonly<Record<'3.8' | '3.7', QwenTemplateSettings>> = {
  '3.8': { preserveThinking: true, effortInstruction: 'xhigh', toolJson: 'wire-order' },
  '3.7': { preserveThinking: false, effortInstruction: 'none', toolJson: 'wire-order' },
}

export const QWEN_COMMERCIAL_SERVING_PROVIDER = 'Alibaba'

export function qwenCommercialDefinition(model: { readonly modelId: string }): ModelDefinition {
  const definition = qwenDefinitions.find(value => value.modelId === model.modelId)
  if (!definition) throw new Error(`missing ${model.modelId}`)
  return definition
}

export function explicitCache(definition: ModelDefinition): boolean {
  return definition.routes.alibaba?.cache.mode === 'explicit'
}

// Each factory call loads and verifies the pinned tokenizer; meters are pure, so share one.
const meters = new Map<string, InputMeter>()
export function qwenCommercialMeter(model: { readonly modelId: string }): InputMeter {
  const cached = meters.get(model.modelId)
  if (cached) return cached
  const meter = createQwenInputMeter(qwenCommercialDefinition(model))
  meters.set(model.modelId, meter)
  return meter
}

/** Official profile snapshot with each route's own cache declaration. */
export function qwenCommercialRequest(
  model: QwenCommercialModel,
  options: {
    readonly tools?: boolean
    readonly effort?: ModelRequestParameters['reasoningEffort'] | undefined
  } = {},
): PlanInput {
  const definition = qwenCommercialDefinition(model)
  const profile = createOfficialProfileContent(definition, {
    providers: ['alibaba'],
    allowFallback: false,
    configuration: {
      revision: 'qwen-commercial-1',
      values: {
        cache: explicitCache(definition)
          ? { mode: 'explicit', ttl: '5m', breakpoints: ['system'] }
          : { mode: 'automatic' },
      },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: 'alibaba',
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    parameters: {
      maxOutputTokens: 512,
      ...(options.effort === undefined ? {} : { reasoningEffort: options.effort }),
    },
    tools: options.tools ? [lookupTool] : [],
    messages: [message('system', 'Answer briefly.'), message('system_reminder', 'Stay exact.')],
    snapshot: {
      ...base.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
}

export interface Batch8Row {
  readonly leaf: string
  readonly round: number
  readonly plannedWireSha256: string
  readonly upstreamPromptTokens: number
  readonly predictedWireOrder: number
  readonly predictedSortedKeys: number
  readonly promptSha256WireOrder: string
  readonly wire: string
  readonly body: JsonObject
}

function batch8Rows(): readonly Batch8Row[] {
  const parsed = readJsonStrict(
    readFileSync(new URL('./fixtures/qwen/commercial-batch8-bodies.json', import.meta.url), 'utf8'),
  )
  if (!('ok' in parsed) || !object(parsed.ok) || !Array.isArray(parsed.ok.rows))
    throw new Error('invalid batch8 fixture')
  return parsed.ok.rows.map(row => {
    if (
      !object(row) ||
      typeof row.leaf !== 'string' ||
      typeof row.round !== 'number' ||
      typeof row.plannedWireSha256 !== 'string' ||
      typeof row.upstreamPromptTokens !== 'number' ||
      typeof row.predictedWireOrder !== 'number' ||
      typeof row.predictedSortedKeys !== 'number' ||
      typeof row.promptSha256WireOrder !== 'string' ||
      typeof row.wire !== 'string'
    )
      throw new Error('invalid batch8 row')
    // The wire string is the exact planned bytes; its hash is the run's plannedWireSha256.
    if (createHash('sha256').update(row.wire).digest('hex') !== row.plannedWireSha256)
      throw new Error(`batch8 ${row.leaf} round ${row.round}: wire differs from the run hash`)
    const body = readJsonStrict(row.wire)
    if (!('ok' in body) || !object(body.ok)) throw new Error('invalid batch8 wire')
    return {
      leaf: row.leaf,
      round: row.round,
      plannedWireSha256: row.plannedWireSha256,
      upstreamPromptTokens: row.upstreamPromptTokens,
      predictedWireOrder: row.predictedWireOrder,
      predictedSortedKeys: row.predictedSortedKeys,
      promptSha256WireOrder: row.promptSha256WireOrder,
      wire: row.wire,
      body: body.ok,
    }
  })
}

export const qwenBatch8 = batch8Rows()

function replayedTexts(row: Batch8Row): string[] {
  const messages = Array.isArray(row.body.messages) ? row.body.messages : []
  return messages.flatMap(item => {
    if (!object(item) || !Array.isArray(item.reasoning_details)) return []
    const detail = item.reasoning_details[0]
    return object(detail) && typeof detail.text === 'string' ? [detail.text] : []
  })
}

/** Split into whitespace-delimited fragments of a few words, as reasoning streams arrive. */
function fragments(text: string): string[] {
  const words = text.match(/\S*\s*/gu)?.filter(word => word !== '') ?? []
  const result: string[] = []
  for (let index = 0; index < words.length; index += 3)
    result.push(words.slice(index, index + 3).join(''))
  return result
}

/**
 * Two streams per leaf: the reasoning texts the batch8 round-3 body replays (rounds 1 and 2),
 * in the QC-V0 frame shape. Only the text and model come from batch8.
 */
export const qwenCommercialStreams: readonly ArchivedStream[] = qwenBatch8
  .filter(row => row.round === 3)
  .flatMap(row =>
    replayedTexts(row).map((text, index) => ({
      member: `batch8-f8e55130/qwenc-${row.leaf}/round-${index + 1} replayed reasoning`,
      sha256: row.plannedWireSha256,
      model: `qwen/${row.leaf}`,
      provider: 'alibaba',
      effort: null,
      fragments: fragments(text),
    })),
  )

export function qwenCommercialStreamsFor(model: {
  readonly modelId: string
}): readonly ArchivedStream[] {
  const streams = qwenCommercialStreams.filter(stream => stream.model === model.modelId)
  if (streams.length !== 2) throw new Error(`two batch8 streams required for ${model.modelId}`)
  return streams
}
