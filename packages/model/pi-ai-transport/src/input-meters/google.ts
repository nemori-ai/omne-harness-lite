import { defineInputMeter } from '../input-meter.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import { jsonEqual, ruleAccepts } from '../definitions.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { FullMeterInput, InputMeter, TokenMeasurement } from '../input-meter.ts'
import { googleDefinitions } from '../official-models/google.ts'
import { estimateGoogleCandidate, googleCandidateFeatures } from './google-candidate.ts'
import {
  GOOGLE_HISTORY_ALGORITHM,
  GOOGLE_HISTORY_EVIDENCE,
  GOOGLE_TOKENIZER_REVISION,
  GOOGLE_VISIBLE_ALGORITHM,
  googleHistoryReleaseValid,
  googleHistoryRow,
  googleOutputHistoryPolicy,
  type GoogleHistoryRelease,
} from './google-history-policy.ts'
import { fullOutputHistory, type OutputBodyCounter } from './output-history.ts'

const tokenizerHash = 'cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f'
const configHash = '9f4fec4b1dc6ecddf8f4a92e9caea5971c0e67d81309f3f9066a2bee8c362633'
const modelIds = new Set(['google/gemini-3.7-flash', 'google/gemini-3.8-flash'])
const visibleEvidence =
  'google-gemma4-pilot-2026-09-28:fit-F1-F2/holdout-H1-H2; messages/tools Gemma4 surrogate plus frozen offset6, not Gemini tokenizer; declared request effort is a generation control outside this input projection, private hosted framing unverified; low/medium/high scope is an estimated implementation extension without actual effort holdout or error bound'

function verifiedFile(name: string, hash: string): Buffer {
  const content = readFileSync(new URL(`../../tokenizers/google-gemma4/${name}`, import.meta.url))
  if (createHash('sha256').update(content).digest('hex') !== hash)
    throw new TypeError(`Google comparator ${name} digest mismatch`)
  return content
}

let sharedTokenizer: Tokenizer | undefined
function encoder(): Tokenizer {
  sharedTokenizer ??= new Tokenizer(
    JSON.parse(verifiedFile('tokenizer.json', tokenizerHash).toString('utf8')),
    JSON.parse(verifiedFile('tokenizer_config.json', configHash).toString('utf8')),
  )
  return sharedTokenizer
}

function supported(body: JsonObject, definition: ModelDefinition): boolean {
  const modelId = definition.modelId
  const effortRule = definition.routes['google-ai-studio']?.parameters.reasoningEffort
  if (!effortRule) return false
  const supportedEffort = effortRule
  const unsupportedField = (key: string): boolean =>
    key !== 'model' &&
    key !== 'provider' &&
    key !== 'stream' &&
    key !== 'store' &&
    key !== 'messages' &&
    key !== 'tools' &&
    key !== 'reasoning' &&
    key !== 'max_tokens'
  function providerSupported(): boolean {
    return !(
      !object(body.provider) ||
      Object.keys(body.provider).some(
        key => key !== 'order' && key !== 'allow_fallbacks' && key !== 'require_parameters',
      ) ||
      !Array.isArray(body.provider.order) ||
      body.provider.order.length !== 1 ||
      body.provider.order[0] !== 'google-ai-studio' ||
      body.provider.allow_fallbacks !== false ||
      body.provider.require_parameters !== true
    )
  }
  function controlsSupported(): boolean {
    return !(
      body.stream !== true ||
      body.store !== false ||
      (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
      (body.reasoning !== undefined &&
        (!object(body.reasoning) ||
          Object.keys(body.reasoning).some(key => key !== 'effort') ||
          typeof body.reasoning.effort !== 'string' ||
          !ruleAccepts(supportedEffort, body.reasoning.effort)))
    )
  }
  if (
    body.model !== modelId ||
    !modelIds.has(modelId) ||
    Object.keys(body).some(unsupportedField) ||
    !providerSupported() ||
    !controlsSupported()
  )
    return false
  return supportedInputs(body)
}

function supportedInputs(body: JsonObject): boolean {
  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    (body.tools !== undefined && !Array.isArray(body.tools))
  )
    return false
  for (const message of body.messages) {
    if (!supportedMessage(message)) return false
  }
  if (body.tools !== undefined)
    for (const tool of body.tools) if (unsupportedTool(tool)) return false
  return true
}

function supportedMessage(message: JsonValue): boolean {
  if (!object(message)) return false
  if (!supportedMessageFields(message)) return false
  if (!supportedContent(message)) return false
  return supportedToolCalls(message)
}

function supportedMessageFields(message: JsonObject): boolean {
  const unsupportedField = (key: string): boolean =>
    key !== 'role' &&
    key !== 'content' &&
    key !== 'tool_calls' &&
    key !== 'tool_call_id' &&
    key !== 'reasoning'
  if (
    Object.keys(message).some(unsupportedField) ||
    (message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'tool') ||
    (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
    (message.tool_call_id !== undefined && typeof message.tool_call_id !== 'string')
  )
    return false
  return true
}

function supportedContent(message: JsonObject): boolean {
  if (typeof message.content !== 'string') {
    if (!Array.isArray(message.content)) return false
    for (const part of message.content)
      if (
        !object(part) ||
        Object.keys(part).some(key => key !== 'type' && key !== 'text') ||
        part.type !== 'text' ||
        typeof part.text !== 'string'
      )
        return false
  }
  return true
}

function supportedToolCalls(message: JsonObject): boolean {
  if (message.tool_calls !== undefined) {
    if (!Array.isArray(message.tool_calls)) return false
    for (const call of message.tool_calls) if (unsupportedToolCall(call)) return false
  }
  return true
}

function unsupportedToolCall(call: JsonValue): boolean {
  return (
    !object(call) ||
    Object.keys(call).some(key => key !== 'id' && key !== 'type' && key !== 'function') ||
    typeof call.id !== 'string' ||
    call.type !== 'function' ||
    !object(call.function) ||
    Object.keys(call.function).some(key => key !== 'name' && key !== 'arguments') ||
    typeof call.function.name !== 'string' ||
    typeof call.function.arguments !== 'string'
  )
}

function unsupportedTool(tool: JsonValue): boolean {
  return (
    !object(tool) ||
    Object.keys(tool).some(key => key !== 'type' && key !== 'function') ||
    tool.type !== 'function' ||
    !object(tool.function) ||
    Object.keys(tool.function).some(
      key => key !== 'name' && key !== 'description' && key !== 'parameters',
    ) ||
    typeof tool.function.name !== 'string' ||
    typeof tool.function.description !== 'string' ||
    !object(tool.function.parameters)
  )
}

/**
 * The visible Gemma 4 surrogate over one final body: field guards, features and the frozen
 * offset 6 once per request. Shared unchanged by V3 (whole body) and V4 (remaining units).
 * Empty messages are refused, never padded.
 */
function visibleBodyCounter(definition: ModelDefinition): OutputBodyCounter {
  const tokenizer = encoder()
  return ({ body, serialized }) => {
    if (writeJsonLossless(body) !== serialized || !supported(body, definition))
      return { kind: 'unavailable' }
    const features = googleCandidateFeatures(
      body,
      text => tokenizer.encode(text, { add_special_tokens: false }).ids.length,
    )
    if (!features) return { kind: 'unavailable' }
    return {
      kind: 'estimated',
      tokens: estimateGoogleCandidate(
        {
          revision: 'google-gemma4-experimental-1',
          modelId: definition.modelId,
          offset: 6,
          fitCaseIds: ['F1', 'F2'],
        },
        features,
      ),
    }
  }
}

/** Exact canonical declaration with the given binding coordinates, or no factory. */
function canonicalAt(definition: ModelDefinition, revision: string, implementation: string) {
  const canonical = googleDefinitions.find(item => item.modelId === definition.modelId)
  const left = copyJsonValue(definition)
  const right = copyJsonValue(
    canonical && {
      ...canonical,
      revision,
      implementation: { name: 'pi-ai:google', revision: implementation },
    },
  )
  return (
    canonical !== undefined &&
    'ok' in left &&
    'ok' in right &&
    jsonEqual(left.ok, right.ok) &&
    Object.hasOwn(definition.routes, 'google-ai-studio')
  )
}

/** Rough text/tool estimate for the two measured AI Studio routes only (published V3). */
export function createGoogleInputMeter(definition: ModelDefinition): InputMeter | undefined {
  if (!canonicalAt(definition, '3', 'mp4-17')) return undefined
  const countBody = visibleBodyCounter(definition)
  return defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'google-ai-studio',
    algorithmRevision: GOOGLE_VISIBLE_ALGORITHM,
    evidence: visibleEvidence,
    measureFull: ({ body, serialized }: Readonly<{ body: JsonObject; serialized: string }>) =>
      countBody({ body, serialized }),
  })
}

/**
 * Google revision 4 V4 meter: the V3 visible surrogate over units not claimed by a complete
 * E-only output group, plus each claimed group's original upstream O once (shared core).
 * Full-only: φ/δ keep the unavailable defaults and replay stays `unsupported-marginal/1`.
 *
 * The definition/implementation revisions are not pinned yet (K7: after the GS-V9 A reading);
 * the caller supplies them and the official catalog still binds the V3 factory above. When the
 * main line pins them, this becomes the only official factory and the V3 factory is deleted.
 */
export function createGoogleHistoryInputMeter(
  definition: ModelDefinition,
  release: GoogleHistoryRelease,
): InputMeter | undefined {
  if (
    !googleHistoryReleaseValid(release) ||
    !googleHistoryRow(definition.modelId) ||
    !canonicalAt(definition, release.definitionRevision, release.implementationRevision)
  )
    return undefined
  const countBody = visibleBodyCounter(definition)
  const policy = googleOutputHistoryPolicy(release)
  const meter: InputMeter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'google-ai-studio',
    algorithmRevision: GOOGLE_HISTORY_ALGORITHM,
    tokenizerRevision: GOOGLE_TOKENIZER_REVISION,
    evidence: `${GOOGLE_HISTORY_EVIDENCE} Visible part: ${visibleEvidence}`,
    measureFull: (input: FullMeterInput): TokenMeasurement =>
      object(input) &&
      object(input.body) &&
      Array.isArray(input.body.messages) &&
      input.body.messages.length > 0
        ? fullOutputHistory(input, meter, countBody, policy)
        : { kind: 'unavailable' },
  })
  return meter
}
