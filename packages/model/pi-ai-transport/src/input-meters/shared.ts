// Family-neutral pieces shared by several family input meters. Family policy (parallel
// reasoning keys, redaction markers, target template slot) stays with each family.
import { isJsonNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { measureFull, measureNew, measureReplay, type InputMeter } from '../input-meter.ts'
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
