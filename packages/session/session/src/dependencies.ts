import type {
  AgentDrivePort,
  InputSources,
  IntakeProcessor,
  ScopeReleasePort,
  SessionAccessCheck,
  SessionCallControl,
  SessionCallStates,
  SessionClock,
  SessionContextInput,
  SessionDelegatedTransactions,
  SessionEvidenceBridge,
  SessionIdentityBridge,
  SessionIdleInput,
  SessionInternalPrincipals,
  SessionTransactionPort,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'

export type Current<T> = Readonly<{ current(): T | null }>

export type SessionDependencies<P> = Readonly<{
  accessCheck: SessionAccessCheck<P>
  transactions: SessionDelegatedTransactions<P>
  workPrincipals: SessionWorkPrincipals<P>
  directory: Current<SessionTransactionPort<P>>
  identity: SessionIdentityBridge<P>
  evidence: SessionEvidenceBridge<P>
  clock: SessionClock
  idle: SessionIdleInput<P>
  context: SessionContextInput<P>
  agentDrive: Current<AgentDrivePort>
  scopeRelease: Current<ScopeReleasePort>
  callControl: Current<SessionCallControl>
  callStates: Current<SessionCallStates>
  principals: SessionInternalPrincipals<P>
  /** The processors before intake, read at every intake; null: no list and none declared. */
  admission: Current<readonly IntakeProcessor<P>[]>
  sources: Current<InputSources>
}>

export class SessionDependencyError extends Error {
  readonly dependency: string
  constructor(dependency: string) {
    super(`session dependency ${dependency} is absent; no instance is constructed`)
    this.name = 'SessionDependencyError'
    this.dependency = dependency
  }
}

function hasMethod(value: unknown, method: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Readonly<Record<string, unknown>>)[method] === 'function'
  )
}

export function checkStartConditions<P>(dependencies: SessionDependencies<P>): void {
  const given: unknown = dependencies
  if (typeof given !== 'object' || given === null) throw new SessionDependencyError('dependencies')
  if (!hasMethod(dependencies.accessCheck, 'check')) throw new SessionDependencyError('accessCheck')
  if (!hasMethod(dependencies.transactions, 'bind'))
    throw new SessionDependencyError('transactions')
  if (!hasMethod(dependencies.workPrincipals, 'forSession'))
    throw new SessionDependencyError('workPrincipals')
  const principals: unknown = dependencies.principals
  if (
    typeof principals !== 'object' ||
    principals === null ||
    !('coordinator' in principals) ||
    !('maintainer' in principals)
  )
    throw new SessionDependencyError('principals')
}
