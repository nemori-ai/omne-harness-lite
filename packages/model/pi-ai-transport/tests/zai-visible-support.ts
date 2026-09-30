// Fixtures for the adopted ZAI visible reasoning estimate (revision 1, GG-12). Released:
// GLM-5.2 (definition 3), Prime (4) and FlashX (3) at `pi-ai:zai@mp4-18`; GLM-5.3 and Flash
// keep their refusing 2 / mp4-17 release until ZV0. Archived text comes from both evidence
// batches: the thirteen 2026-09-27 raw streams (fixtures/zai/visible-reasoning-fragments.json)
// and the five 2026-09-28 complete streams (fixtures/zai/history-complete-streams.json), whose
// fragments are read here from the original SSE frames. Frames are rebuilt in that exact delta
// shape and merged by the real reader; every response is a controlled local TLS stand-in.
import { createHash } from 'node:crypto'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import type { InputMeter } from '../src/input-meter.ts'
import { createZaiCommercialInputMeter } from '../src/input-meters/zai-commercial.ts'
import { createGlm52InputMeter } from '../src/input-meters/zai-glm52.ts'
import { createGlm53InputMeter } from '../src/input-meters/zai-glm53.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { histories } from './fixtures/zai/history-cases.ts'
import { lookupTool, visible } from './moonshot-support.ts'
import {
  archivedFor,
  loadArchivedStreams,
  type ArchivedStream,
} from './moonshot-visible-support.ts'
import { at, input, judgedMessage, message } from './support.ts'

export type ZaiEffort = ModelRequestParameters['reasoningEffort'] | undefined
export interface ZaiLeaf {
  readonly modelId: string
  readonly provider: 'alibaba' | 'z-ai/fp8'
  /** The display name OpenRouter reported for the route in the archived streams. */
  readonly servingProvider: 'Alibaba' | 'Z.AI'
  /** The leaf's current effort send domain (omitted is the template default). */
  readonly efforts: readonly ZaiEffort[]
  /** Test-side expectation of the current release, checked against the exported definitions. */
  readonly released: boolean
}

export const zaiLeaves: readonly ZaiLeaf[] = [
  {
    modelId: 'z-ai/glm-5.2',
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined, 'high'],
    released: true,
  },
  {
    modelId: 'z-ai/glm-5.3-prime',
    provider: 'alibaba',
    servingProvider: 'Alibaba',
    efforts: [undefined, 'low', 'high', 'max'],
    released: true,
  },
  {
    modelId: 'z-ai/glm-5.3-flashx',
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined],
    released: true,
  },
  {
    modelId: 'z-ai/glm-5.3',
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined, 'low', 'high', 'max'],
    released: false,
  },
  {
    modelId: 'z-ai/glm-5.3-flash',
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined],
    released: false,
  },
]
export const releasedLeaves = zaiLeaves.filter(leaf => leaf.released)
export const unreleasedLeaves = zaiLeaves.filter(leaf => !leaf.released)

export function zaiLeaf(modelId: string): ZaiLeaf {
  const leaf = zaiLeaves.find(value => value.modelId === modelId)
  if (!leaf) throw new Error(`unknown ZAI leaf ${modelId}`)
  return leaf
}

export function zaiDefinition(leaf: ZaiLeaf): ModelDefinition {
  const definition = zaiDefinitions.find(value => value.modelId === leaf.modelId)
  if (!definition) throw new Error(`missing ${leaf.modelId}`)
  return definition
}

/** The factory the official contribution uses for the leaf. */
export function zaiFactory(leaf: ZaiLeaf): (definition: ModelDefinition) => InputMeter {
  if (leaf.modelId === 'z-ai/glm-5.2') return createGlm52InputMeter
  if (leaf.modelId === 'z-ai/glm-5.3' || leaf.modelId === 'z-ai/glm-5.3-flash')
    return createGlm53InputMeter
  return createZaiCommercialInputMeter
}

// Each factory call loads and verifies the pinned tokenizer; meters are pure, so share one.
const meters = new Map<string, InputMeter>()
export function zaiMeter(leaf: ZaiLeaf): InputMeter {
  const cached = meters.get(leaf.modelId)
  if (cached) return cached
  const meter = zaiFactory(leaf)(zaiDefinition(leaf))
  meters.set(leaf.modelId, meter)
  return meter
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Ordered reasoning fragments of one original SSE, read frame by frame, never merged here. */
function recordedFragments(sse: string): string[] {
  const fragments: string[] = []
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data: {')) continue
    const frame: unknown = JSON.parse(line.slice('data: '.length))
    if (typeof frame !== 'object' || frame === null || !('choices' in frame)) continue
    if (!Array.isArray(frame.choices)) continue
    for (const choice of frame.choices) {
      const delta: unknown = choice?.delta
      if (typeof delta !== 'object' || delta === null || !('reasoning_details' in delta)) continue
      const details = delta.reasoning_details
      const detail: unknown = Array.isArray(details) ? details[0] : undefined
      if (
        typeof detail !== 'object' ||
        detail === null ||
        !('text' in detail) ||
        typeof detail.text !== 'string'
      )
        throw new Error('recorded detail without text')
      fragments.push(detail.text)
    }
  }
  return fragments
}

/** Both evidence batches in the shared archived-stream shape. */
export const zaiArchivedStreams: readonly ArchivedStream[] = [
  ...loadArchivedStreams(
    new URL('./fixtures/zai/visible-reasoning-fragments.json', import.meta.url),
  ),
  ...histories.map(row => {
    if (sha256(row.sse) !== row.sseSha256) throw new Error(`${row.id}: SSE hash`)
    const fragments = recordedFragments(row.sse)
    if (fragments.join('') !== row.thought) throw new Error(`${row.id}: fragments`)
    return {
      member: row.source,
      sha256: row.sourceSha256,
      model: row.model,
      provider: row.provider,
      effort: null,
      fragments,
    }
  }),
]

export function zaiArchivedFor(leaf: ZaiLeaf): readonly ArchivedStream[] {
  return archivedFor(leaf, zaiArchivedStreams)
}

/** Official profile snapshot: Prime's route requires an explicit 5m `last_message` breakpoint. */
export function zaiRequest(
  leaf: ZaiLeaf,
  options: { readonly tools?: boolean; readonly effort?: ZaiEffort } = {},
): PlanInput {
  const definition = zaiDefinition(leaf)
  const profile = createOfficialProfileContent(definition, {
    providers: [leaf.provider],
    allowFallback: false,
    configuration: {
      revision: 'zai-visible-reasoning-1',
      values: {
        cache:
          leaf.provider === 'alibaba'
            ? { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] }
            : { mode: 'automatic' },
      },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: leaf.provider,
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

export function zaiUserTurn(round: number): Message {
  return judgedMessage({
    type: 'user',
    id: `zai-user-${round}`,
    createdAt: at,
    blocks: [
      { id: `zai-user-${round}-text`, kind: 'text', text: `Turn ${round}.`, visibility: visible },
    ],
  })
}

export function zaiToolResult(callId: string): Message {
  return judgedMessage({
    type: 'tool',
    id: `zai-result-${callId}`,
    callId,
    createdAt: at,
    blocks: [
      {
        id: `zai-result-${callId}-block`,
        kind: 'tool_result',
        callId,
        outcome: 'completed',
        visibility: visible,
        blocks: [
          { id: `zai-result-${callId}-text`, kind: 'text', text: 'value=42', visibility: visible },
        ],
      },
    ],
  })
}

export const zaiWireTool: JsonObject = {
  type: 'function',
  function: {
    name: lookupTool.name,
    description: lookupTool.description,
    parameters: lookupTool.parameters,
  },
}

/**
 * A body-only final wire without reasoning, in the planner's shape: text, an assistant tool
 * call and its result, then a user turn (Prime carries its one 5m marker on the last user).
 */
export function zaiPlainWire(leaf: ZaiLeaf, effort: ZaiEffort, history: JsonObject[] = []) {
  const prime = leaf.provider === 'alibaba'
  return {
    model: leaf.modelId,
    provider: { order: [leaf.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    messages: [
      { role: 'system', content: 'Answer briefly.' },
      { role: 'user', content: [{ type: 'text', text: 'Turn 1.' }] },
      {
        role: 'assistant',
        content: 'Answer 1.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup__exact', arguments: '{"query":"value"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'value=42' },
      ...history,
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Turn 2.',
            ...(prime ? { cache_control: { type: 'ephemeral', ttl: '5m' } } : {}),
          },
        ],
      },
    ],
    tools: [zaiWireTool],
    max_tokens: 512,
    ...(effort ? { reasoning: { effort } } : {}),
  } satisfies JsonObject
}
