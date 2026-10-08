// Fixtures for the Google revision 4 E-only reasoning history mechanism (GS-V1..V6).
//
// Streams follow the frame order and members of the 2026-09-30 raw SSE originals
// observed with the selected routes:
// frame 0 carries exactly one `reasoning.encrypted` detail (E) whose id equals the tool-call id of
// the same stream, then the tool-call fragments, a `tool_calls`/`STOP` frame, and a usage frame
// repeating the finish reason. Text and signature fragments follow the 2026-09-28 fragment
// sequence (text fragments, then an id-less signature-only fragment). Every byte is SYNTHETIC
// except the literal identity `provider: "Google AI Studio"` / `model: <route id>` and the
// per-leaf ids and counts copied from those originals; ciphertexts are same-length synthetic
// base64. These are local TLS stand-ins, never OpenRouter or Gemini observations.
import { createHash } from 'node:crypto'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import type { InputMeter } from '@omne-harness-lite/model-request-runtime'
import { createGoogleHistoryInputMeter } from '../../../src/input-meters/google.ts'
import type { GoogleHistoryRelease } from '../../../src/input-meters/google-history-policy.ts'
import { googleDefinitions } from '../../../src/official-models/google.ts'
import { sse } from '../../support.ts'

/**
 * Test-only V4 coordinates. The real definition/implementation revisions are pinned by the
 * main line after the GS-V9 A reading (K7); replace this value when they are published.
 */
export const googleHistoryRelease: GoogleHistoryRelease = Object.freeze({
  definitionRevision: '4',
  implementationRevision: 'mp4-google-history-unpinned',
})
export const GOOGLE_FORMAT = 'google-gemini-v1'
export const GOOGLE_SERVING_PROVIDER = 'Google AI Studio'

export const googleHistoryTool: ModelToolEntry = {
  name: 'lookup_code',
  description: 'Look up a code by query.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}

/** Per-leaf facts copied from the 2026-09-30 originals (first round, tool path, effort high). */
export interface GoogleLeaf {
  readonly modelId: string
  readonly callId: string
  readonly ciphertextBytes: number
  readonly prompt: number
  readonly output: number
  readonly reasoning: number
}
export const googleLeaves: readonly GoogleLeaf[] = [
  {
    modelId: 'google/gemini-3.8-flash',
    callId: 'call_476730',
    ciphertextBytes: 561,
    prompt: 949,
    output: 110,
    reasoning: 93,
  },
  {
    modelId: 'google/gemini-3.7-flash',
    callId: 'call_449710',
    ciphertextBytes: 419,
    prompt: 951,
    output: 81,
    reasoning: 64,
  },
]

export function googleV3Definition(modelId: string): ModelDefinition {
  const definition = googleDefinitions.find(item => item.modelId === modelId)
  if (!definition) throw new Error(`missing Google definition ${modelId}`)
  return definition
}

/** The published declaration at the V4 coordinates of `release`. */
export function googleHistoryDefinition(
  modelId: string,
  release: GoogleHistoryRelease = googleHistoryRelease,
): ModelDefinition {
  const definition = googleV3Definition(modelId)
  return {
    ...definition,
    revision: release.definitionRevision,
    implementation: { name: 'pi-ai:google', revision: release.implementationRevision },
  }
}

// Each factory call verifies the pinned tokenizer; meters are pure, so share one per leaf.
const meters = new Map<string, InputMeter>()
export function googleHistoryMeter(modelId: string): InputMeter {
  const cached = meters.get(modelId)
  if (cached) return cached
  const meter = createGoogleHistoryInputMeter(
    googleHistoryDefinition(modelId),
    googleHistoryRelease,
  )
  if (!meter) throw new Error(`missing Google history meter ${modelId}`)
  meters.set(modelId, meter)
  return meter
}

/** Same-length synthetic base64: decoded bytes start with 0x12 like the originals. */
export function syntheticCiphertext(bytes: number, seed: string): string {
  const out = Buffer.alloc(bytes)
  let block = createHash('sha256').update(seed).digest()
  for (let offset = 0; offset < bytes; offset += block.length) {
    block.copy(out, offset)
    block = createHash('sha256').update(block).digest()
  }
  out[0] = 0x12
  return out.toString('base64')
}

/** An E detail in the members and order of the originals. */
export function encryptedDetail(data: string, id: string, index = 0): JsonObject {
  return { type: 'reasoning.encrypted', data, format: GOOGLE_FORMAT, id, index }
}
export function textDetail(text: string): JsonObject {
  return { type: 'reasoning.text', text, format: GOOGLE_FORMAT, index: 0 }
}
export function signatureDetail(signature: string): JsonObject {
  return { type: 'reasoning.text', signature, format: GOOGLE_FORMAT, index: 0 }
}

/** Frame 0 of the originals: empty content, null reasoning, the details. */
export function detailsDelta(details: readonly JsonValue[]): JsonObject {
  return { content: '', role: 'assistant', reasoning: null, reasoning_details: [...details] }
}
/** 2026-09-28 fragment frame: visible reasoning text plus its detail. */
export function textFragmentDelta(fragment: string): JsonObject {
  return {
    content: '',
    role: 'assistant',
    reasoning: fragment,
    reasoning_details: [textDetail(fragment)],
  }
}
export function signatureDelta(signature: string): JsonObject {
  return { content: '', role: 'assistant', reasoning_details: [signatureDetail(signature)] }
}

export interface GoogleReplyOptions {
  readonly modelId: string
  readonly generation: string
  /** Absent means the frames carry no provider member at all. */
  readonly servingProvider?: string | undefined
  /** One delta per reasoning frame, before any answer frame. */
  readonly reasoning: readonly JsonObject[]
  /** Tool calls (id and arguments); when empty the reply is a text answer. */
  readonly calls?: readonly { readonly id: string; readonly arguments: string }[]
  readonly answer?: string
  /** `length` reproduces a MAX_TOKENS truncation. */
  readonly finish?: 'tool_calls' | 'stop' | 'length'
  readonly usage: { readonly prompt: number; readonly output: number; readonly reasoning: number }
}

/** One complete SSE response in the frame order of the 2026-09-30 originals. */
export function googleReply(options: GoogleReplyOptions): string {
  const head = {
    id: options.generation,
    ...(options.servingProvider === undefined ? {} : { provider: options.servingProvider }),
    model: options.modelId,
    object: 'chat.completion.chunk',
    created: 1790765022,
  }
  const calls = options.calls ?? []
  const finish = options.finish ?? (calls.length ? 'tool_calls' : 'stop')
  const native = finish === 'length' ? 'MAX_TOKENS' : 'STOP'
  const frame = (delta: JsonObject, reason: string | null, extra: JsonObject = {}) =>
    sse({
      ...head,
      choices: [{ index: 0, delta, finish_reason: reason, native_finish_reason: reason && native }],
      ...extra,
    })
  const answer = calls.length
    ? calls.flatMap((call, index) => [
        frame(
          {
            content: null,
            role: 'assistant',
            tool_calls: [
              {
                index,
                id: call.id,
                type: 'function',
                function: { name: googleHistoryTool.name, arguments: '' },
              },
            ],
          },
          null,
        ),
        frame(
          {
            content: null,
            role: 'assistant',
            tool_calls: [{ index, function: { arguments: call.arguments } }],
          },
          null,
        ),
      ])
    : [frame({ content: options.answer ?? 'CEDAR-7', role: 'assistant' }, null)]
  const { prompt, output, reasoning } = options.usage
  return [
    ...options.reasoning.map(delta => frame(delta, null)),
    ...answer,
    frame({ content: '', role: 'assistant', reasoning: null }, finish),
    frame({ content: '', role: 'assistant' }, finish, {
      service_tier: 'default',
      usage: {
        prompt_tokens: prompt,
        completion_tokens: output,
        total_tokens: prompt + output,
        cost: 0.00112425,
        is_byok: false,
        prompt_tokens_details: {
          cached_tokens: 0,
          cache_write_tokens: 0,
          audio_tokens: 0,
          video_tokens: 0,
        },
        completion_tokens_details: { reasoning_tokens: reasoning },
      },
    }),
    sse('[DONE]'),
  ].join('')
}

/** The first-round tool reply of one leaf exactly as the 2026-09-30 frame sequence. */
export function originalToolReply(
  leaf: GoogleLeaf,
  servingProvider: string | undefined = GOOGLE_SERVING_PROVIDER,
): { readonly sse: string; readonly detail: JsonObject } {
  const detail = encryptedDetail(
    syntheticCiphertext(leaf.ciphertextBytes, `${leaf.modelId}-round-1`),
    leaf.callId,
  )
  return {
    detail,
    sse: googleReply({
      modelId: leaf.modelId,
      generation: `gen-local-google-${leaf.callId}`,
      servingProvider,
      reasoning: [detailsDelta([detail])],
      calls: [{ id: leaf.callId, arguments: '{"query":"CEDAR"}' }],
      usage: { prompt: leaf.prompt, output: leaf.output, reasoning: leaf.reasoning },
    }),
  }
}
