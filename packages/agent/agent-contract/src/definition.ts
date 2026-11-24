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

export const AGENT_TYPES = ['master', 'non-master'] as const
export type AgentType = (typeof AGENT_TYPES)[number]

export const SUMMARY_LIMITS = Object.freeze({ maxBytes: 1000 })

export type AgentDefinition = {
  readonly category: 'AgentDefinition'
  readonly name: string
  readonly type: AgentType
  /** What this agent is fit for, written for the model that chooses whom to hand work to. */
  readonly summary: string
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
  readonly instructions?: readonly InstructionSection[]
  readonly permissionBounds?: readonly PermissionUpperBound[]
}

export type AgentDefinitionListing = Readonly<{ name: string; type: AgentType; summary: string }>

/** What the catalog of definitions says about one definition: its name, its type, its summary. */
export function definitionListing(definition: AgentDefinition): AgentDefinitionListing {
  return Object.freeze({
    name: definition.name,
    type: definition.type,
    summary: definition.summary,
  })
}

export function attributeItem(text: string | undefined): AttributeItem | undefined {
  return ATTRIBUTE_ITEMS.find(allowed => allowed === text)
}
