import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { PARTICIPANT, PROTOCOL } from './schema.ts'

/** The participant that owns the tables. No write runs a script yet, so every script fails the commit. */
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute: () => ({ kind: 'failed', diagnostic: 'unknown_canvas_script' }),
} satisfies ParticipantModule
