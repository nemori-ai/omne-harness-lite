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

export type InstructionSection = {
  readonly id: string
  readonly text: string
}

export const INSTRUCTION_LIMITS = Object.freeze({
  maxSections: 32,
  maxSectionBytes: 10_000,
  idPattern: /^[a-z][a-z0-9-]{0,63}$/u,
})

export type AgentDefinition = {
  readonly category: 'AgentDefinition'
  readonly name: string
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
  readonly instructions?: readonly InstructionSection[]
  readonly permissionBounds?: readonly PermissionUpperBound[]
}

export function attributeItem(text: string | undefined): AttributeItem | undefined {
  return ATTRIBUTE_ITEMS.find(allowed => allowed === text)
}
