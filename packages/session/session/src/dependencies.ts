import type {
  AgentDrivePort,
  DurableEvidence,
  GuardCommand,
  RoutedInput,
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
  WorkSnapshot,
} from '@omne-harness/session-contract'

export type Current<T> = Readonly<{ current(): T | null }>

export type BeforeAdmitSlot = Readonly<{
  name: string
  run(
    input: Readonly<{
      submission: RoutedInput
      source: DurableEvidence
      snapshot: WorkSnapshot
    }>,
  ): Promise<
    | Readonly<{ kind: 'pass'; submission: RoutedInput; material: GuardCommand }>
    | Readonly<{ kind: 'block'; reason: string; material: GuardCommand }>
  >
}>

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
  admission: Current<readonly BeforeAdmitSlot[]>
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
