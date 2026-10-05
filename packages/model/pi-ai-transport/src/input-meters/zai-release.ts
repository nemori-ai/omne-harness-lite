// The binding check shared by the three ZAI meter factories and the reasoning-history
// projection that their mp4-18 releases apply to a meter-only copy of the final wire.
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import {
  zaiHistoryTreatments,
  zaiReleases,
  type ZaiHistoryTreatment,
  type ZaiRelease,
} from '../official-models/zai.ts'
import { projectVisibleReasoningBody } from './shared.ts'

function releasedModelId(value: string): value is keyof typeof zaiReleases {
  return Object.hasOwn(zaiReleases, value)
}

/**
 * The current release of `definition` on `provider`, or undefined for any other coordinate.
 * Unknown, retired or future definition/implementation revisions are not guessed: each
 * factory throws for them at construction, so no half contribution is published.
 */
export function zaiCurrentRelease(
  definition: ModelDefinition,
  provider: string,
): Readonly<{ release: ZaiRelease; history: ZaiHistoryTreatment }> | undefined {
  if (!releasedModelId(definition.modelId)) return undefined
  const release = zaiReleases[definition.modelId]
  if (
    definition.revision !== release.revision ||
    definition.implementation.name !== 'pi-ai:zai' ||
    definition.implementation.revision !== release.implementationRevision ||
    !Object.hasOwn(definition.routes, provider)
  )
    return undefined
  return { release, history: zaiHistoryTreatments[release.implementationRevision] }
}

/**
 * Meter-only copy for a release's history treatment. `visible`: an assistant's one visible
 * `reasoning.text` detail (shared four-key shape, text not `[REDACTED]`) whose parallel
 * `reasoning` is absent or the identical string, before any trim, becomes that plain
 * `reasoning` string exactly once; any other `reasoning_details` is unexplained and yields
 * undefined. `reasoning_content` is not named, so the renderer keeps refusing it. `refuse`:
 * the body is unchanged and the renderer refuses every reasoning member. The original body,
 * its serialized bytes and the sent wire never change.
 */
export function projectZaiHistory(
  body: JsonObject,
  history: ZaiHistoryTreatment,
): JsonObject | undefined {
  return history === 'visible' ? projectVisibleReasoningBody(body, ['reasoning']) : body
}

/**
 * One assistant's template `reasoning_content`, after `projectZaiHistory`. `visible` takes a
 * present `reasoning` string unchanged (the empty string is visible empty text); a
 * non-string, or any leftover `reasoning_details`, is unavailable. `refuse` admits neither.
 */
export function zaiAssistantReasoning(
  message: JsonObject,
  history: ZaiHistoryTreatment,
): { readonly reasoning: string | undefined } | undefined {
  if (message.reasoning_details !== undefined) return undefined
  if (message.reasoning === undefined) return { reasoning: undefined }
  return history === 'visible' && typeof message.reasoning === 'string'
    ? { reasoning: message.reasoning }
    : undefined
}

export const zaiVisibleHistoryEvidence =
  'visible reasoning history (a plain reasoning string or one reasoning.text detail with an absent or identical parallel reasoning) is rendered into the pinned template think slot with clear_thinking=false; OpenRouter conversion and the route history-clearing policy are unknown; no holdout'
