import type { SessionPermissionWriteQualification } from './permission-values.ts'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence, ResidentKey, SessionAccess, SessionId } from './identity.ts'
import type { MutationName, SessionCommand, SessionTransactionPort } from './ports.ts'

import type { IntakeSubject } from './input-sources.ts'
export type SessionReadAccessOperation =
  | 'listTodos'
  | 'readWork'
  | 'readCurrentScope'
  | 'readWaiting'
  | 'readBackgroundCalls'
  | 'resolveBackgroundCall'
  | 'readInput'
  | 'readPending'
  | 'readWaitingCalls'
  | 'readInputFate'
  | 'queryOperation'
  | 'readModelSelection'
  | 'queryControlOperation'
  | 'loadRecovery'
  | 'inspectIdle'
  | 'history.begin'
  | 'history.next'
  | 'history.since'
  | 'history.readModelView'
  | 'history.readCompactionContext'
  | 'history.readAdoptedRequest'

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
      access: Access<P>
      operation: 'directory.list'
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
  | Readonly<{
      kind: 'allowed'
      evidence: DurableEvidence
      writeQualification?: SessionPermissionWriteQualification
      /** Which kind of subject the verified principal is. An intake needs it; nothing else reads it. */
      subject?: IntakeSubject
    }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface SessionAccessCheck<P> {
  check(input: SessionAccessRequest<P>): Promise<SessionAccessDecision>
}

export type SessionCheckedAccess<P> = Readonly<{
  request: SessionAccessRequest<P>
  evidence: DurableEvidence
  writeQualification?: SessionPermissionWriteQualification
  subject?: IntakeSubject
}>

export interface SessionDelegatedTransactions<P> {
  bind(checked: SessionCheckedAccess<P>): SessionTransactionPort<P>
}

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
