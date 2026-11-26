import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { Goals } from '@omne-harness/goal-contract'
import type { TenantId } from '@omne-harness/legal-identity'

/** The person at the panel as the goal domain is to see them: the subject its authority checks, and who the history names. */
export type GoalEntry =
  | Readonly<{ kind: 'admitted'; subject: unknown; by: string }>
  | Readonly<{ kind: 'denied' | 'basis-unavailable' }>

export interface GoalEntrance {
  admit(login: LoginIdentity, tenant: TenantId): Promise<GoalEntry>
}

export type GoalFace = Pick<Goals, 'read' | 'write' | 'command' | 'judgeOf' | 'chooseJudge'>

export type GoalChangeListener = Readonly<{ changed(): void; closed(): void }>

export interface GoalChangeFeed {
  subscribe(tenant: string, session: string, listener: GoalChangeListener): () => void
}
