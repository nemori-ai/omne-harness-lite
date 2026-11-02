// The factory dependencies (docs/public-api.md「依赖」). Three classes: start conditions that must be
// present at construction, ports that each command needs, and ports resolved at each call.
import type {
  AgentDrivePort,
  DurableEvidence,
  GuardCommand,
  RoutedInput,
  ScopeReleasePort,
  SessionAccessCheck,
  SessionClock,
  SessionContextInput,
  SessionDelegatedTransactions,
  SessionEvidenceBridge,
  SessionIdentityBridge,
  SessionIdleInput,
  SessionInternalPrincipals,
  SessionNotifier,
  SessionTransactionPort,
  SessionWorkPrincipals,
  WorkSnapshot,
} from '@omne-harness/session-contract'

/** Resolves a port at the call site. Null means that the port is absent now. */
export type Current<T> = Readonly<{ current(): T | null }>

/** One before-admit slot (SPEC EX-1). The slot owner defines its meaning. */
export type BeforeAdmitSlot = Readonly<{
  name: string
  run(
    input: Readonly<{
      submission: RoutedInput
      source: DurableEvidence
      /** The slot reads the current modes, purpose and workspace selection from this snapshot. */
      snapshot: WorkSnapshot
    }>,
  ): Promise<
    | Readonly<{ kind: 'pass'; submission: RoutedInput; material: GuardCommand }>
    | Readonly<{ kind: 'block'; reason: string; material: GuardCommand }>
  >
}>

export type SessionDependencies<P> = Readonly<{
  /** Required dependencies. The face checks once and then works through a delegated view. */
  accessCheck: SessionAccessCheck<P>
  transactions: SessionDelegatedTransactions<P>
  /** The per-session principal of a coordinator or maintainer (SPEC CP-01). */
  workPrincipals: SessionWorkPrincipals<P>
  /** The public port, only for pending, references and releasedScopes. Its methods check once. */
  directory: Current<SessionTransactionPort<P>>
  identity: SessionIdentityBridge<P>
  evidence: SessionEvidenceBridge
  clock: SessionClock
  idle: SessionIdleInput<P>
  context: SessionContextInput<P>
  /** Resolved after each durable commit. */
  notifier: Current<SessionNotifier>
  agentDrive: Current<AgentDrivePort>
  scopeRelease: Current<ScopeReleasePort>
  /** Principals for system maintenance only. The identity bridge verifies them. */
  principals: SessionInternalPrincipals<P>
  /** Ordered before-admit slots. null means admission is unavailable, so accept returns unavailable. An empty list, given only when the assembly declares no command domain and no hooks, makes accept run without slots. */
  admission: Current<readonly BeforeAdmitSlot[]>
}>

/** A start condition that is absent: the factory constructs nothing. */
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

/**
 * Checks the start conditions before anything is built or called (SPEC「资源与替换」): the access
 * check, the delegated entry, the work principals and the internal principals. The other ports
 * answer `unavailable` per operation when they are absent, so they do not stop construction.
 */
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
