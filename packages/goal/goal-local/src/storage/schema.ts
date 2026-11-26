export const PARTICIPANT = 'goal.persistence'
export const PROTOCOL = 'goal-persistence/1'
export const HANDLER = 'goal.registry'
export const MIGRATION = { owner: PARTICIPANT, id: 'goal-1' }
export const EXAMINER_MIGRATION = { owner: PARTICIPANT, id: 'goal-2-examiner' }
export const TABLES = ['gl_goals']
export const ROW_LIMIT = 20_000
