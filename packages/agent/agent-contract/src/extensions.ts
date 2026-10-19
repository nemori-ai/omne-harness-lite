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
