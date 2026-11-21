export const PARTICIPANT = 'dispatch.persistence'
export const PROTOCOL = 'dispatch-persistence/1'
export const HANDLER = 'dispatch.registry'
export const MIGRATION = { owner: PARTICIPANT, id: 'dispatch-1' }
export const TABLES = ['dp_dispatches']

/** A statement returns at most this many rows. A read that would return more fails instead of being cut. */
export const ROW_LIMIT = 20_000

export const SCRIPTS = ['accept', 'apply', 'recordDelivery', 'confirmStop'] as const
export type ScriptName = (typeof SCRIPTS)[number]
