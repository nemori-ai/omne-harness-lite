// The Session storage over the SQL storage contract. The root exports the port factories, the
// session binding source and the static materials. It imports the SQL contract only through its
// public entries, and it builds no Cordis service: the session storage composite belongs to the
// application.
import type {
  SessionDelegatedTransactions,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import { contextOf, type SessionStorageOptions } from './context.ts'
import { delegatedOf } from './delegated.ts'
import { portOf } from './port.ts'

export type { SessionStorageOptions } from './context.ts'
export { createSessionPrincipalBindings, type SessionPrincipalBindingsOptions } from './bindings.ts'
export { sessionStorageMaterials, type SessionStorageMaterials } from './materials.ts'
export { SESSION_PARTICIPANT } from './participants.ts'

/** The public port. Every method asks the access check once. */
export function createSessionStorage<P>(
  options: SessionStorageOptions<P>,
): SessionTransactionPort<P> {
  return portOf(contextOf(options))
}

export type SessionStoragePair<P> = Readonly<{
  transactions: SessionTransactionPort<P>
  delegated: SessionDelegatedTransactions<P>
}>

/**
 * The public port and the delegated entry over one context. `transactions` behaves as
 * `createSessionStorage`; a view from `delegated.bind` serves one checked face operation on the
 * same storage and does not ask the access check.
 */
export function createSessionStoragePair<P>(
  options: SessionStorageOptions<P>,
): SessionStoragePair<P> {
  const context = contextOf(options)
  return { transactions: portOf(context), delegated: delegatedOf(context) }
}
