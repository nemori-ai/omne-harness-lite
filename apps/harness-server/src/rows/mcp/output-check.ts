import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'
import { writeJsonText } from '@omne-harness/json-text'
import type { OutputValidator } from '@omne-harness/mcp-contract'

const COMPILED_MAX = 256
const REASON_MAX = 300

/** Checks the structured content of an answer against the output schema the action declared. */
export function createOutputCheck(): OutputValidator {
  const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: false })
  const compiled = new Map<string, ValidateFunction>()

  function validatorOf(schemaText: string): ValidateFunction {
    const known = compiled.get(schemaText)
    if (known !== undefined) return known
    const made = ajv.compile(JSON.parse(schemaText) as object)
    if (compiled.size >= COMPILED_MAX) {
      const oldest = compiled.keys().next().value
      if (oldest !== undefined) {
        compiled.delete(oldest)
        ajv.removeSchema(JSON.parse(oldest) as object)
      }
    }
    compiled.set(schemaText, made)
    return made
  }

  return (structured, outputSchema) => {
    const validate = validatorOf(writeJsonText(outputSchema))
    if (validate(JSON.parse(writeJsonText(structured)))) return { kind: 'conforms' }
    const [first] = validate.errors ?? []
    const reason = `${first?.instancePath ?? ''} ${first?.message ?? 'does not match'}`.trim()
    return { kind: 'violates', reason: reason.slice(0, REASON_MAX) }
  }
}
