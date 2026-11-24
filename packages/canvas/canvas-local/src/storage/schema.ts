export const PARTICIPANT = 'canvas.persistence'
export const PROTOCOL = 'canvas-persistence/1'
export const HANDLER = 'canvas.arrangement'
export const MIGRATION = { owner: PARTICIPANT, id: 'canvas-1' }
export const TABLES = ['canvas_head', 'canvas_item', 'canvas_pile']

/** A statement returns at most this many rows. A read that would return more fails instead of being cut. */
export const ROW_LIMIT = 20_000

/** The scripts of the participant: one per write of the canvas. */
export const SCRIPTS = ['place', 'arrange', 'take', 'pile', 'scatter', 'lock'] as const
export type ScriptName = (typeof SCRIPTS)[number]
