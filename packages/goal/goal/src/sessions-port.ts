import type { Attendance, Wake } from '@omne-harness/goal-contract'
import type { PortRead } from './ports.ts'

/** The input that opened the round in progress: its words, and where the history stood at it. */
export type Driven = Readonly<{ since: string; text: string }>
/** `drive`: set while the session drives itself and a round is open; null for any other session. */
export type SessionFacts = Readonly<{
  attendance: Attendance
  moment: string
  drive: Driven | null
  /** Where the work of the session is, when it has such a place. */
  where?: string | null
}>
/** What the person last said in the session in their own words, and where in its history that stands. */
export type Asked = Readonly<{ at: string; text: string }>
/** `implied`: the reminder is of the goal the session implies, which no person set and no tool reads. */
export type WakeToSend = Wake &
  Readonly<{ session: string; rendered: string; open: string; implied: boolean }>
/** `refused`: the session takes no input any more. `unknown`: sent or not, nobody can tell. */
export type SendAnswer = 'sent' | 'refused' | 'unknown'

export interface GoalSessions {
  facts(tenant: string, session: string): Promise<PortRead<SessionFacts | null>>
  asked(tenant: string, session: string): Promise<PortRead<Asked | null>>
  /** Sends the reminder a change owes its session. The same request is taken by the session once. */
  wake(tenant: string, wake: WakeToSend): Promise<SendAnswer>
  /** Whether a round of the session is going now. */
  running(tenant: string, session: string): Promise<PortRead<boolean>>
}
