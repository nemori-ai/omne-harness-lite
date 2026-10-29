// Current-operation access requests. Qualification policy belongs to the authorization adapter;
// the Session execution boundary binds each decision to this operation and its fixed input.
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence, ResidentKey, SessionAccess, SessionId } from './identity.ts'
import type { MutationName, SessionCommand } from './ports.ts'

export type SessionReadAccessOperation =
  | 'readWork'
  | 'readInput'
  | 'queryOperation'
  | 'loadRecovery'
  | 'inspectIdle'
  | 'history.begin'
  | 'history.next'
  | 'history.since'
  | 'history.readModelView'

type SessionMutationAccess<P> = {
  readonly [K in MutationName]: Readonly<{
    access: Access<P>
    operation: K
    target: Readonly<{
      kind: 'session'
      session: SessionId
      command: Extract<SessionCommand, { kind: K }>
    }>
  }>
}[MutationName]

export type SessionAccessRequest<P> =
  | SessionMutationAccess<P>
  | Readonly<{
      access: Access<P>
      operation: SessionReadAccessOperation
      target: Readonly<{ kind: 'session'; session: SessionId }>
    }>
  | Readonly<{
      access: Access<P>
      operation: 'pending'
      target: Readonly<{ kind: 'tenant'; tenant: TenantId }>
    }>
  | Readonly<{
      access: Readonly<{ principal: P; scope: 'system' }>
      operation: 'references'
      target: Readonly<{ kind: 'resident-references'; key: ResidentKey }>
    }>
  | Readonly<{
      access: Readonly<{ principal: P; scope: 'system' }>
      operation: 'releasedScopes'
      target: Readonly<{ kind: 'released-scopes' }>
    }>

export type SessionAccessOperation = SessionAccessRequest<unknown>['operation']
export type SessionAccessTarget = SessionAccessRequest<unknown>['target']
export type SessionAccessDecision =
  | Readonly<{ kind: 'allowed'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** One current decision. An allowed answer cannot authorize a later operation. */
export interface SessionAccessCheck<P> {
  check(input: SessionAccessRequest<P>): Promise<SessionAccessDecision>
}

/** The request of one public read on the session that `access` names. */
export function readAccessRequest<P>(
  access: SessionAccess<P>,
  operation: SessionReadAccessOperation,
): SessionAccessRequest<P> {
  return {
    access: { principal: access.principal, tenant: access.tenant },
    operation,
    target: { kind: 'session', session: access.session },
  }
}

/**
 * The request of one commit: the operation is the command kind and the target carries the original
 * command, so the authorization adapter judges the actual control, setting or mode change. The
 * caller has already matched `access` to the tenant and session of the command.
 */
export function mutationAccessRequest<P>(
  access: SessionAccess<P>,
  command: SessionCommand,
): SessionAccessRequest<P> {
  return {
    access: { principal: access.principal, tenant: access.tenant },
    operation: command.kind,
    target: { kind: 'session', session: command.input.session, command },
  } as SessionMutationAccess<P>
}
