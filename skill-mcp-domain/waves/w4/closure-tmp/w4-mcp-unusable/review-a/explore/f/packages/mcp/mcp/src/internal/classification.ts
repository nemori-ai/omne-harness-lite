// What both ports hand `classifyOutcome` (contract O1, SPEC MC-16 step 12, MC-17 step 5): the
// generation the request was sent on, the output schema of the action when it declares one, and
// the host's output validator. One construction, so the two ports classify alike.
import type { JsonValue } from '@omne-harness/json-text'
import type { ClassifyContext, Generation, OutputValidator } from '@omne-harness/mcp-contract'

export function classificationOf(
  issuedAt: Generation,
  outputSchema: JsonValue | undefined,
  checkOutput: OutputValidator,
): ClassifyContext {
  return { issuedAt, checkOutput, ...(outputSchema === undefined ? {} : { outputSchema }) }
}
