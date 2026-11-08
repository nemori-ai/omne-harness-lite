import type { PermissionUpperBound } from '@omne-harness/permissions'

export const ATTRIBUTE_ITEMS = [
  'first_token_wait_limit',
  'post_first_token_stall_limit',
  'model',
] as const

export type AttributeItem = (typeof ATTRIBUTE_ITEMS)[number]

export type CapabilityRef = {
  readonly category: string
  readonly name: string
}

export type AssetReference = {
  readonly capability: CapabilityRef
  readonly resident?: boolean
}

export type AttributeDeclaration = {
  readonly item: AttributeItem
}

/**
 * One ordered section of the system prompt that a definition carries (R2-D124: the definition is the
 * single source of its prompt). `id` names the section inside its definition; `text` is the section
 * as written. The limits are `INSTRUCTION_LIMITS`; the rules are in SPEC "声明判断".
 */
export type InstructionSection = {
  readonly id: string
  readonly text: string
}

/**
 * The limits of `instructions`. `maxSectionBytes` counts the UTF-8 bytes of one `text`, not its
 * UTF-16 units: the declaration limit on strings counts units, so a text of multi-byte characters
 * can pass that limit and still exceed this one. `idPattern` is the shape of one `id`.
 */
export const INSTRUCTION_LIMITS = Object.freeze({
  maxSections: 32,
  maxSectionBytes: 10_000,
  idPattern: /^[a-z][a-z0-9-]{0,63}$/u,
})

/**
 * A definition carries no version. Every new execution adopts the legal winner of its identity at
 * that moment (SPEC "声明判断"; definition topic "版本采用与实际变化").
 */
export type AgentDefinition = {
  readonly category: 'AgentDefinition'
  readonly name: string
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
  /** The system prompt sections, in order. Absent when the definition carries no prompt. */
  readonly instructions?: readonly InstructionSection[]
  readonly permissionBounds?: readonly PermissionUpperBound[]
}

/** The attribute item of a text, or `undefined` when the text names no attribute item. */
export function attributeItem(text: string | undefined): AttributeItem | undefined {
  return ATTRIBUTE_ITEMS.find(allowed => allowed === text)
}
