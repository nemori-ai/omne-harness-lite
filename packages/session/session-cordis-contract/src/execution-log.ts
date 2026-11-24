import type { TenantId } from '@omne-harness/legal-identity'

export type SessionExecutionLogOpened =
  | Readonly<{ kind: 'opened' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface SessionExecutionLog {
  openTenant(tenant: TenantId): Promise<SessionExecutionLogOpened>
}
