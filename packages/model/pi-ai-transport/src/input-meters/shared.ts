// Family-neutral pieces shared by several family input meters. Family policy (which
// parallel reasoning keys may accompany a detail, and the target template slot) stays with
// each family; the families pass it in.
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { measureFull, measureNew, measureReplay } from '../input-meter.ts'
import { type InputMeter } from '@omne-harness-lite/model-request-runtime'
import { object } from '../json.ts'

const visibleDetailKeys = ['type', 'text', 'format', 'index']

/**
 * The captured visible `reasoning_details` shape on one wire message: role `assistant`,
 * exactly one detail whose own keys are exactly type/text/format/index, with
 * `reasoning.text`, a string text, the literal format `unknown` and an index whose exact
 * decimal value is 0. Returns that text; any other shape (including the absence of
 * `reasoning_details`) is undefined. It never decides whether the text may be counted.
 */
export function visibleReasoningDetailText(message: JsonObject): string | undefined {
  const details = message.reasoning_details
  if (message.role !== 'assistant' || !Array.isArray(details) || details.length !== 1)
    return undefined
  const detail = details[0]
  if (
    !object(detail) ||
    Object.keys(detail).length !== visibleDetailKeys.length ||
    !visibleDetailKeys.every(name => Object.hasOwn(detail, name)) ||
    detail.type !== 'reasoning.text' ||
    typeof detail.text !== 'string' ||
    detail.format !== 'unknown' ||
    !isJsonNumber(detail.index) ||
    ExactDecimal.from(detail.index).compare(ExactDecimal.from(0)) !== 0
  )
    return undefined
  return detail.text
}

// Encrypted reasoning streamed as the literal placeholder; never visible text.
const redactedReasoning = '[REDACTED]'

/**
 * Meter-only copy of the actual body for families whose renderer reads an assistant's
 * plain OpenRouter `reasoning` string. An assistant's one visible detail
 * (`visibleReasoningDetailText`) whose text is not `[REDACTED]`, and whose parallel keys
 * named by the family (`sameText`) are each absent or the identical string, is counted
 * exactly once: the details are removed and a missing `reasoning` becomes that text.
 * Parallel keys the family does not name are left for its renderer to judge. Any other
 * `reasoning_details` is unexplained: undefined, never a JSON-length proxy. The original
 * body, serialized bytes and wire are not changed.
 */
export function projectVisibleReasoningBody(
  body: JsonObject,
  sameText: readonly string[],
): JsonObject | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const projected: JsonValue[] = []
  for (const message of body.messages) {
    if (!object(message) || !Object.hasOwn(message, 'reasoning_details')) {
      projected.push(message)
      continue
    }
    const text = visibleReasoningDetailText(message)
    if (text === undefined || text === redactedReasoning) return undefined
    for (const parallel of sameText)
      if (Object.hasOwn(message, parallel) && message[parallel] !== text) return undefined
    const rest = Object.fromEntries(
      Object.entries(message).filter(([name]) => name !== 'reasoning_details'),
    )
    projected.push(Object.hasOwn(rest, 'reasoning') ? rest : { ...rest, reasoning: text })
  }
  return { ...body, messages: projected }
}

/**
 * Public factory methods run the shared source/basis guards around the private raw
 * meter; `defineInputMeter` only freezes. The guards call `raw`, so no recursion.
 */
export function guardInputMeter(raw: InputMeter): InputMeter {
  return Object.freeze({
    ...raw,
    measureFull: (input: Parameters<InputMeter['measureFull']>[0]) => measureFull(raw, input),
    measureReplay: (input: Parameters<InputMeter['measureReplay']>[0]) => measureReplay(raw, input),
    measureNew: (input: Parameters<InputMeter['measureNew']>[0]) => measureNew(raw, input),
  })
}
