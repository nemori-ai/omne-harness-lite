import {
  copyJsonValue,
  capabilityIdEquals,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { bodyValid } from './schema.ts'
import type { AttributeDeclaration, CapabilityId } from '@omne-harness-lite/asset-model'

export type AssetReference = {
  readonly capability: CapabilityId
  readonly resident?: boolean
}
/** The other JSON members remain owned by the caller; these two slots are the only projection. */
export type AgentDefinitionBody = JsonObject & {
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
}
export type AgentDefinitionJudgment = { readonly ok: true } | { readonly rejected: 'malformed' }
export type AgentDefinitionInputs = {
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
}
export type AgentDefinitionExtraction =
  { readonly ok: AgentDefinitionInputs } | { readonly rejected: 'malformed' }

const malformed = Object.freeze({ rejected: 'malformed' } as const)
const accepted = Object.freeze({ ok: true } as const)
function readBody(body: JsonValue): AgentDefinitionBody | undefined {
  const copied = copyJsonValue(body)
  if ('failed' in copied || !bodyValid(copied.ok)) return undefined
  // The fixed AD1 resource proves the represented fields. Cross-item conditions follow below.
  const value = copied.ok as AgentDefinitionBody
  for (let index = 0; index < value.references.length; index++) {
    const reference = value.references[index]
    if (
      reference !== undefined &&
      value.references
        .slice(0, index)
        .some(previous => capabilityIdEquals(previous.capability, reference.capability))
    )
      return undefined
  }
  const items = new Set<string>()
  for (const declaration of value.attributes) {
    if (items.has(declaration.item)) return undefined
    items.add(declaration.item)
  }
  return value
}

export function judgeAgentDefinitionBody(body: JsonValue): AgentDefinitionJudgment {
  return readBody(body) === undefined ? malformed : accepted
}

export function extractAgentDefinitionInputs(body: JsonValue): AgentDefinitionExtraction {
  const value = readBody(body)
  return value === undefined
    ? malformed
    : Object.freeze({
        ok: Object.freeze({ references: value.references, attributes: value.attributes }),
      })
}
