// Passage, card and subject types of the Agent contract. This file holds the two names that the
// extension author protocol uses; the full chapter (README, "扩展、人工卡片与材料") extends it
// without renaming.
import type { JsonValue } from '@omne-harness/json-text'
import type { Evidence } from './identity.ts'

export type CardAnswer =
  | Readonly<{ kind: 'chosen'; option: string; value: JsonValue | null; evidence: Evidence }>
  | Readonly<{ kind: 'declined'; evidence: Evidence }>

/**
 * What an extension author sees at a position. The per-position shapes (README "Subject") arrive
 * with the evaluation chapter; until then a subject is plain data that this package only compares
 * and forwards.
 */
export type Subject = Readonly<Record<string, unknown>>
