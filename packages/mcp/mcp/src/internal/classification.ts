import type { JsonValue } from '@omne-harness/json-text'
import type { ClassifyContext, Generation, OutputValidator } from '@omne-harness/mcp-contract'

export function classificationOf(
  issuedAt: Generation,
  outputSchema: JsonValue | undefined,
  checkOutput: OutputValidator,
): ClassifyContext {
  return { issuedAt, checkOutput, ...(outputSchema === undefined ? {} : { outputSchema }) }
}
