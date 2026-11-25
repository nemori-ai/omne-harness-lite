import type { GoalBody } from './body.ts'
import { NO_READINGS } from './gap.ts'
import { NO_PROGRESS } from './progress.ts'
import type { GoalRecord } from './record.ts'

const PREFIX = 'implied/'

/** Where the goal a session implies is kept: a key no session has, so nothing that reads the goal of a session finds it. */
export const impliedKey = (session: string): string => `${PREFIX}${session}`

/** The session a record of goals belongs to, whichever key it is kept under. */
export const sessionOfKey = (key: string): string =>
  key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key

export const isImpliedKey = (key: string): boolean => key.startsWith(PREFIX)

export type ImpliedStart = Readonly<{ session: string; body: GoalBody; since: string; at: string }>

/** The implied goal of a round as it begins: the next revision of the one goal under its key, in progress, with nobody to hand it to.
 * It stays one goal, so the round before it is written over and nothing of it is kept. */
export function impliedRecord(before: GoalRecord | null, start: ImpliedStart): GoalRecord {
  const { session, body, since, at } = start
  const revision = (before?.state.revision ?? 0) + 1
  return {
    session: impliedKey(session),
    version: (before?.version ?? 0) + 1,
    state: {
      status: 'active',
      attendance: 'unattended',
      generation: 1,
      revision,
      rounds: 0,
      stalled: 0,
      gap: null,
    },
    body,
    history: [
      {
        revision,
        via: 'direct',
        words: null,
        draftedBy: 'creator',
        confirmedBy: 'system',
        operation: `implied/${since}`,
        at,
      },
    ],
    readings: NO_READINGS,
    progress: NO_PROGRESS,
    since,
    wake: null,
    observed: null,
  }
}
