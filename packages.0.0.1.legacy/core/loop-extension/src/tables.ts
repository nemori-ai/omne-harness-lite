import type { OutputKind, Position, Power } from './types.ts'

export const POSITIONS = Object.freeze([
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
] as const)
export const POWERS = Object.freeze(['observe', 'rewrite', 'veto'] as const)
export const POWER_CONCLUSIONS: Readonly<Record<Power, readonly OutputKind[]>> = Object.freeze({
  observe: Object.freeze(['observed'] as const),
  rewrite: Object.freeze(['observed', 'inject', 'rewrite', 'select_model', 'retry'] as const),
  veto: Object.freeze([
    'observed',
    'inject',
    'rewrite',
    'select_model',
    'veto',
    'stop',
    'retry',
    'ask',
  ] as const),
})
export const POSITION_CONCLUSIONS = Object.freeze({
  attempt_started: Object.freeze(['observed', 'inject', 'stop', 'ask'] as const),
  before_persist_message: Object.freeze(['observed', 'inject', 'rewrite', 'veto'] as const),
  after_persist_message: Object.freeze(['observed', 'inject', 'stop', 'ask'] as const),
  before_compaction: Object.freeze(['observed', 'inject', 'veto', 'stop', 'ask'] as const),
  after_compaction: Object.freeze(['observed', 'inject', 'stop', 'ask'] as const),
  before_model_call: Object.freeze([
    'observed',
    'inject',
    'rewrite',
    'select_model',
    'veto',
    'stop',
    'ask',
  ] as const),
  after_model_call: Object.freeze({
    complete_reply: Object.freeze(['observed', 'inject', 'stop', 'ask'] as const),
    failure: Object.freeze(['observed', 'inject', 'stop', 'retry', 'ask'] as const),
  }),
  before_action: Object.freeze(['observed', 'inject', 'rewrite', 'veto', 'stop', 'ask'] as const),
  after_action: Object.freeze({
    each: Object.freeze(['observed', 'inject', 'rewrite', 'stop', 'ask'] as const),
    batch: Object.freeze(['observed', 'inject', 'stop', 'ask'] as const),
  }),
  before_terminal: Object.freeze(['observed', 'inject', 'veto', 'stop', 'ask'] as const),
  after_terminal: Object.freeze(['observed'] as const),
})
export function isPosition(value: unknown): value is Position {
  return POSITIONS.some(position => position === value)
}
export function isPower(value: unknown): value is Power {
  return POWERS.some(power => power === value)
}
