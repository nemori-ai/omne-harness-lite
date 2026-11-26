import type { z } from 'zod'
import type { ScheduleAgentModesSchema, ScheduleWorkspaceInputSchema } from './work.ts'

/** The carrier of what agent work delivers when nothing else is chosen: the session of the Job, read through the Job. */
export const SESSION_PUBLICATION = 'session'
export const DEFAULT_AGENT_RESULT_POLICY = Object.freeze({
  audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
  publication: { kind: 'provider', providerRef: SESSION_PUBLICATION },
  resultSeriesId: null,
  attention: 'silent',
  archive: { kind: 'none' },
} as const)

/** What a caller's place fills in: the session it is in, and what a new session takes when the work leaves it out. Null: there is none, or it could not be read. */
export type ScheduleSessionDefaults = Readonly<{
  current: string | null
  forNew: Readonly<{
    agentDefinitionRef: string
    modes: z.infer<typeof ScheduleAgentModesSchema>
    workspace: z.infer<typeof ScheduleWorkspaceInputSchema> | null
  }> | null
}>

type Json = Readonly<Record<string, unknown>>
type Stop = Readonly<{ kind: 'refused'; reason: string }> | Readonly<{ kind: 'basis-unavailable' }>
export type CompletedWork = Readonly<{ kind: 'completed'; work: unknown }> | Stop
export type CompletedDefinition = Readonly<{ kind: 'completed'; definition: unknown }> | Stop

const CURRENT = 'current'
const NEW_SESSION = ['agentDefinitionRef', 'modes', 'workspace'] as const
const record = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null ? (value as Json) : null

function sessionOf(session: Json, defaults: ScheduleSessionDefaults): Json | Stop {
  if (session['mode'] === 'existing') {
    if (session['sessionRef'] !== CURRENT) return session
    return defaults.current === null
      ? {
          kind: 'refused',
          reason: `session.sessionRef: ${CURRENT} names the session of the caller, and this caller is in none`,
        }
      : { ...session, sessionRef: defaults.current }
  }
  if (NEW_SESSION.every(name => name in session)) return session
  return defaults.forNew === null
    ? { kind: 'basis-unavailable' }
    : { ...defaults.forNew, ...session }
}

/** Agent work as its caller wrote it, with what the caller's place fills in. It reads raw data before the schema does: what it does not know it leaves as it is. */
export function completeAgentWork(work: unknown, defaults: ScheduleSessionDefaults): CompletedWork {
  const written = record(work)
  const session = written?.['kind'] === 'agent' ? record(written['session']) : null
  const known = session?.['mode'] === 'existing' || session?.['mode'] === 'new'
  if (written === null || session === null || !known) return { kind: 'completed', work }
  const placed = sessionOf(session, defaults)
  if ('kind' in placed && (placed['kind'] === 'refused' || placed['kind'] === 'basis-unavailable'))
    return placed as Stop
  const rest = { materials: [], returnTo: null, resultPolicy: DEFAULT_AGENT_RESULT_POLICY }
  return { kind: 'completed', work: { ...rest, ...written, session: placed } }
}

/** A definition with the work its execution carries completed; any other definition as it is. */
export function completeDefinition(
  definition: unknown,
  defaults: ScheduleSessionDefaults,
): CompletedDefinition {
  const written = record(definition)
  const purpose = written === null ? null : record(written['purpose'])
  if (written === null || purpose?.['kind'] !== 'execution')
    return { kind: 'completed', definition }
  const work = completeAgentWork(purpose['work'], defaults)
  if (work.kind !== 'completed') return work
  return { kind: 'completed', definition: { ...written, purpose: { ...purpose, work: work.work } } }
}
