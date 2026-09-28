// Unbound diagnostic candidate; no route calibration or production certification.
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { projectZaiCommercialBody } from './zai-commercial.ts'
import { glm5Tokenizer } from './zai-glm52.ts'
import { renderGlm53HistoryCandidatePrompt } from './zai-glm53.ts'

/** Public GLM template with all plaintext historical thinking retained.
 * The hosted Prime/FlashX template and gateway reasoning conversion are unknown.
 * Encrypted, signed, summarized and other opaque reasoning remain unavailable.
 */
export function renderZaiHistoryCandidatePrompt(body: JsonObject): string | undefined {
  if (body.model !== 'z-ai/glm-5.3-prime' && body.model !== 'z-ai/glm-5.3-flashx') return undefined
  const projected = projectZaiCommercialBody(body, body.model)
  return projected ? renderGlm53HistoryCandidatePrompt(projected) : undefined
}

/** Not registered by official models; intended for frozen fit/holdout probes only. */
export function createZaiHistoryCandidateMeter(definition: ModelDefinition): InputMeter {
  const modelId = definition.modelId
  const provider = modelId === 'z-ai/glm-5.3-prime' ? 'alibaba' : 'z-ai/fp8'
  if (
    (modelId !== 'z-ai/glm-5.3-prime' && modelId !== 'z-ai/glm-5.3-flashx') ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:zai' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, provider)
  )
    throw new TypeError('unsupported ZAI history candidate binding')
  const encoder = glm5Tokenizer()
  return Object.freeze({
    modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision: 'zai-plain-history-public-template-candidate-1',
    evidence:
      'zai-org/GLM-5.3 aca966e4 template clear_thinking=false + pinned tokenizer 19e77364; ' +
      'plaintext reasoning_content projection candidate; hosted mapping unknown, no route offset',
    measure({
      body,
      serialized,
    }: Readonly<{ body: JsonObject; serialized: string }>): TokenMeasurement {
      if (body.model !== modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderZaiHistoryCandidatePrompt(body)
      if (prompt === undefined) return { kind: 'unavailable' }
      try {
        return {
          kind: 'estimated',
          tokens: encoder.encode(prompt, { add_special_tokens: false }).ids.length,
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
}
