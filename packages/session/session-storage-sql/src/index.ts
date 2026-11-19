import type {
  SessionDelegatedTransactions,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import { contextOf, type SessionStorageOptions } from './context.ts'
import { delegatedOf } from './delegated.ts'
import { portOf } from './port.ts'

export type { SessionStorageOptions } from './context.ts'
export type {
  SessionProtectedBasis,
  SessionProtectedBasisSource,
  SessionProtectedCommit,
} from './protected-basis.ts'
export {
  createSessionPrincipalBindings,
  type SessionPrincipalBindings,
  type SessionPrincipalBindingsOptions,
} from './bindings.ts'
export {
  createSessionScopeOwners,
  type SessionScopeOwners,
  type SessionScopeOwnersOptions,
} from './scope-owners.ts'
export {
  sessionStorageMaterials,
  type SessionStorageMaterials,
  type SessionStorageMaterialsOptions,
} from './materials.ts'
export { SESSION_PARTICIPANT } from './participants.ts'
export { registerSessionNotifier } from './committed.ts'
export {
  createSearchCursorSeal,
  createSessionSearchLog,
  type SessionSearchCursorOptions,
  type SessionSearchLogOptions,
} from './search-log.ts'

export function createSessionStorage<P>(
  options: SessionStorageOptions<P>,
): SessionTransactionPort<P> {
  return portOf(contextOf(options))
}

export type SessionStoragePair<P> = Readonly<{
  transactions: SessionTransactionPort<P>
  delegated: SessionDelegatedTransactions<P>
}>

export function createSessionStoragePair<P>(
  options: SessionStorageOptions<P>,
): SessionStoragePair<P> {
  const context = contextOf(options)
  return { transactions: portOf(context), delegated: delegatedOf(context) }
}
