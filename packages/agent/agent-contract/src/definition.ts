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
 * A definition carries no version. Every new execution adopts the legal winner of its identity at
 * that moment (SPEC "声明判断"; definition topic "版本采用与实际变化").
 */
export type AgentDefinition = {
  readonly category: 'AgentDefinition'
  readonly name: string
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
}

/** The attribute item of a text, or `undefined` when the text names no attribute item. */
export function attributeItem(text: string | undefined): AttributeItem | undefined {
  return ATTRIBUTE_ITEMS.find(allowed => allowed === text)
}
