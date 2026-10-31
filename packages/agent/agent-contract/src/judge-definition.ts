import { z } from 'zod'
import { checkJson, copyPlain } from './check.ts'
import {
  ATTRIBUTE_ITEMS,
  attributeItem,
  type AgentDefinition,
  type AssetReference,
  type AttributeItem,
} from './definition.ts'
import { refused, type Judgment, type RefusalReason } from './judgment.ts'

const reference = z.strictObject({
  capability: z.strictObject({
    category: z.string().min(1),
    name: z.string().min(1),
  }),
  resident: z.boolean().optional(),
})

const attribute = z.strictObject({
  item: z.enum(ATTRIBUTE_ITEMS),
})

// The declaration table. A member it does not list, `version` among them, is `malformed`.
const definition = z.strictObject({
  category: z.literal('AgentDefinition'),
  name: z.string().min(1),
  references: z.array(reference),
  attributes: z.array(attribute),
})

type Parsed = z.output<typeof definition>

/** A frozen copy of one reference. An absent `resident` stays absent. */
function copyReference(reference: Parsed['references'][number]): AssetReference {
  const capability = Object.freeze({
    category: reference.capability.category,
    name: reference.capability.name,
  })
  if (reference.resident === undefined) return Object.freeze({ capability })
  return Object.freeze({ capability, resident: reference.resident })
}

function readData(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined
    const description = Object.getOwnPropertyDescriptor(current, segment)
    if (
      description === undefined ||
      typeof description.get === 'function' ||
      typeof description.set === 'function'
    ) {
      return undefined
    }
    current = description.value
  }
  return current
}

function issueReason(path: readonly (string | number)[], value: unknown): RefusalReason {
  const attributesAt = path.indexOf('attributes')
  if (attributesAt < 0) return 'malformed'
  const itemIndex = path.indexOf('item', attributesAt + 1)
  if (itemIndex < 0) return 'malformed'
  const item = readData(value, path.slice(0, itemIndex + 1))
  if (typeof item === 'string' && attributeItem(item) === undefined) return 'unknown-attribute'
  return 'malformed'
}

function acceptDefinition(parsed: Parsed): Judgment<AgentDefinition> {
  const seen = new Set<string>()
  for (const referenceValue of parsed.references) {
    const key = JSON.stringify([referenceValue.capability.category, referenceValue.capability.name])
    if (seen.has(key)) return refused('duplicate-capability')
    seen.add(key)
  }
  const items = new Set<AttributeItem>()
  for (const declaration of parsed.attributes) {
    if (items.has(declaration.item)) return refused('malformed')
    items.add(declaration.item)
  }
  // The accepted value is frozen at every level and shares no object with the input.
  return {
    kind: 'accepted',
    value: Object.freeze({
      category: 'AgentDefinition',
      name: parsed.name,
      references: Object.freeze(parsed.references.map(copyReference)),
      attributes: Object.freeze(
        parsed.attributes.map(declaration => Object.freeze({ item: declaration.item })),
      ),
    }),
  }
}

export async function judgeAgentDefinition(value: unknown): Promise<Judgment<AgentDefinition>> {
  const copied = copyPlain(value)
  if (!copied.ok) return refused(copied.reason)
  const checked = await checkJson<Parsed>('agent.definition', definition, copied.value)
  switch (checked.kind) {
    case 'local-refusal':
      return refused(checked.reason)
    case 'invalid':
      return refused(issueReason(checked.issues[0].path, copied.value))
    case 'valid':
      return acceptDefinition(checked.value)
    default: {
      const unreachable: never = checked
      return unreachable
    }
  }
}
