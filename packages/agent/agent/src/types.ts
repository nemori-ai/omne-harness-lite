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

export type VersionChoice =
  | { readonly kind: 'pinned'; readonly version: string }
  | { readonly kind: 'then-legal-winner' }

export type AgentDefinition = {
  readonly category: 'AgentDefinition'
  readonly name: string
  readonly version: VersionChoice
  readonly references: readonly AssetReference[]
  readonly attributes: readonly AttributeDeclaration[]
}

export const POSITIONS = [
  'attempt_started',
  'before_persist_message',
  'after_persist_message',
  'before_compaction',
  'after_compaction',
  'before_model_call',
  'after_model_call',
  'before_action',
  'after_action',
  'before_terminal',
  'after_terminal',
] as const

export type Position = (typeof POSITIONS)[number]

export const POWERS = ['observe', 'rewrite', 'veto'] as const

export type Power = (typeof POWERS)[number]

type ObserveRewrite = 'observe' | 'rewrite'

export type LoopExtensionDeclaration =
  | {
      readonly name: string
      readonly position: 'after_model_call'
      readonly power: ObserveRewrite
      readonly dimension: { readonly ending: 'complete_reply' | 'failure' }
    }
  | {
      readonly name: string
      readonly position: 'after_action'
      readonly power: ObserveRewrite
      readonly dimension: { readonly scope: 'each' | 'batch' }
    }
  | {
      readonly name: string
      readonly position: 'after_terminal'
      readonly power: 'observe'
    }
  | {
      readonly name: string
      readonly position: 'attempt_started' | 'after_persist_message' | 'after_compaction'
      readonly power: ObserveRewrite
    }
  | {
      readonly name: string
      readonly position:
        | 'before_persist_message'
        | 'before_compaction'
        | 'before_model_call'
        | 'before_action'
        | 'before_terminal'
      readonly power: 'observe' | 'rewrite' | 'veto'
    }

export type RefusalReason =
  | 'malformed'
  | 'duplicate-capability'
  | 'unknown-attribute'
  | 'unknown-position'
  | 'unknown-power'
  | 'dimension-missing'
  | 'dimension-not-allowed'
  | 'power-above-ceiling'
  | 'executable'
  | 'checker-failed'

export type Judgment<T> =
  | { readonly kind: 'accepted'; readonly value: T }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }

export type BatchJudgment<T> =
  | { readonly kind: 'accepted'; readonly value: readonly T[] }
  | { readonly kind: 'refused'; readonly reason: RefusalReason; readonly index: number }

export function refused<T>(reason: RefusalReason): Judgment<T> {
  return { kind: 'refused', reason }
}
