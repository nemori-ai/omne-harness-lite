import { z } from 'zod'
import { checkJson } from './check.ts'
import {
  ATTRIBUTE_ITEMS,
  refused,
  type AgentDefinition,
  type Judgment,
  type AssetReference,
  type AttributeItem,
  type RefusalReason,
} from './types.ts'

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

const definition = z.strictObject({
  category: z.literal('AgentDefinition'),
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  references: z.array(reference),
  attributes: z.array(attribute),
})

type Parsed = z.output<typeof definition>

function stripResident(reference: Parsed['references'][number]): AssetReference {
  if (reference.resident === undefined) return { capability: reference.capability }
  return { capability: reference.capability, resident: reference.resident }
}

function issueReason(path: readonly (string | number)[]): RefusalReason {
  if (path.includes('item')) return 'unknown-attribute'
  return 'malformed'
}

export async function judgeAgentDefinition(value: unknown): Promise<Judgment<AgentDefinition>> {
  const checked = await checkJson<Parsed>('agent.definition', definition, value)
  if (checked.kind === 'local-refusal') return refused(checked.reason)
  if (checked.kind !== 'valid') {
    if (checked.kind === 'invalid') return refused(issueReason(checked.issues[0].path))
    return refused('malformed')
  }
  const seen = new Set<string>()
  for (const referenceValue of checked.value.references) {
    const key = JSON.stringify([referenceValue.capability.category, referenceValue.capability.name])
    if (seen.has(key)) return refused('duplicate-capability')
    seen.add(key)
  }
  const items = new Set<AttributeItem>()
  for (const declaration of checked.value.attributes) {
    if (items.has(declaration.item)) return refused('malformed')
    items.add(declaration.item)
  }
  const version =
    checked.value.version === undefined
      ? ({ kind: 'then-legal-winner' } as const)
      : ({ kind: 'pinned', version: checked.value.version } as const)
  return {
    kind: 'accepted',
    value: {
      category: 'AgentDefinition',
      name: checked.value.name,
      version,
      references: checked.value.references.map(stripResident),
      attributes: checked.value.attributes.map((declaration) => ({ item: declaration.item })),
    },
  }
}
