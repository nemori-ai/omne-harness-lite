import { PermissionUpperBoundsSchema, definePermissionUpperBounds } from '@omne-harness/permissions'
import { z } from 'zod'
import { checkJson, copyPlain } from './check.ts'
import {
  ATTRIBUTE_ITEMS,
  INSTRUCTION_LIMITS,
  attributeItem,
  type AgentDefinition,
  type AssetReference,
  type AttributeItem,
  type InstructionSection,
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

// One prompt section: exactly `id` and `text`, both non-empty. The id shape, the byte limit of the
// text, the variable marker and the uniqueness of ids are composition rules, checked after the
// schema so that the refusal can name the section.
const instruction = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
})

// The declaration table. A member it does not list, `version` among them, is `malformed`.
// `instructions` is optional; present, it is a non-empty list of at most `maxSections` sections.
// "No prompt" has one spelling, absence, so that equal content has one canonical text.
const definition = z.strictObject({
  category: z.literal('AgentDefinition'),
  name: z.string().min(1),
  references: z.array(reference),
  attributes: z.array(attribute),
  instructions: z.array(instruction).min(1).max(INSTRUCTION_LIMITS.maxSections).optional(),
  permissionBounds: PermissionUpperBoundsSchema.optional(),
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

const utf8 = new TextEncoder()

/** The number of UTF-8 bytes of a text. The declaration limit counts UTF-16 units; this one does not. */
export function utf8Length(text: string): number {
  return utf8.encode(text).byteLength
}

/**
 * The first rule that the sections break, as a diagnostic, or `undefined` when they all hold
 * (SPEC "声明判断", the `instructions` rules). Checked in order of the sections, and within one
 * section id shape, id uniqueness, text bytes, then the variable marker.
 */
export function instructionsProblem(
  sections: readonly Readonly<{ id: string; text: string }>[],
): string | undefined {
  const ids = new Set<string>()
  for (const [index, section] of sections.entries()) {
    const at = `instructions[${index}]`
    if (!INSTRUCTION_LIMITS.idPattern.test(section.id))
      return `${at}.id: "${section.id}" does not match ${INSTRUCTION_LIMITS.idPattern.source}`
    if (ids.has(section.id)) return `${at}.id: "${section.id}" repeats an earlier section id`
    ids.add(section.id)
    const bytes = utf8Length(section.text)
    if (bytes > INSTRUCTION_LIMITS.maxSectionBytes)
      return `${at}.text: ${bytes} UTF-8 bytes exceed ${INSTRUCTION_LIMITS.maxSectionBytes}`
    if (section.text.includes('{{'))
      return `${at}.text: contains "{{", which the prompt renderer reads as a variable reference`
  }
  return undefined
}

function copyInstructions(
  sections: Parsed['instructions'],
): Readonly<{ instructions?: readonly InstructionSection[] }> {
  if (sections === undefined) return {}
  return {
    instructions: Object.freeze(
      sections.map(section => Object.freeze({ id: section.id, text: section.text })),
    ),
  }
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
  if (parsed.instructions !== undefined) {
    const problem = instructionsProblem(parsed.instructions)
    if (problem !== undefined) return refused('malformed', problem)
  }
  const bounds =
    parsed.permissionBounds === undefined
      ? undefined
      : definePermissionUpperBounds(parsed.permissionBounds)
  if (bounds?.kind === 'invalid-input')
    return refused('malformed', 'Invalid permission upper bounds')
  // The accepted value is frozen at every level and shares no object with the input. An absent
  // `instructions` stays absent.
  return {
    kind: 'accepted',
    value: Object.freeze({
      category: 'AgentDefinition',
      name: parsed.name,
      references: Object.freeze(parsed.references.map(copyReference)),
      attributes: Object.freeze(
        parsed.attributes.map(declaration => Object.freeze({ item: declaration.item })),
      ),
      ...copyInstructions(parsed.instructions),
      ...(bounds === undefined ? {} : { permissionBounds: bounds.bounds }),
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
    case 'invalid': {
      const [issue] = checked.issues
      // A structure problem inside `instructions` names its member, so that the author of a prompt
      // can find it; the reason stays `malformed`.
      const detail =
        issue.path[0] === 'instructions'
          ? `${issue.path
              .map(segment => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`))
              .join('')
              .slice(1)}: ${issue.code}`
          : undefined
      return refused(issueReason(issue.path, copied.value), detail)
    }
    case 'valid':
      return acceptDefinition(checked.value)
    default: {
      const unreachable: never = checked
      return unreachable
    }
  }
}
