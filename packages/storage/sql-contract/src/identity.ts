import type { SqlStorage } from './types.ts'

/**
 * The symbol under which a Cordis service proxy answers the object it wraps (`symbols.original` of
 * `@deepseek-ai/cordis`, a registered symbol). A plain object answers undefined.
 */
const CORDIS_ORIGINAL = Symbol.for('cordis.original')
/** The property under which a storage wrapper names the storage it forwards to. */
const WRAPPED = Symbol.for('omne.sql-contract.wrapped-storage')
/** How many proxy and wrapper layers `databaseOf` looks through. */
const PROXY_DEPTH = 8

/**
 * Declares that `wrapper` forwards to `inner`: both are the same database to `databaseOf`. A
 * wrapper that has its own `read` function (to observe or to change a read) and does not declare
 * this is taken for another database: what a member keeps for the database is then not shared
 * with it, and it sees the commits made through `inner` only within the staleness bound of that
 * member. Returns `wrapper`.
 */
export function wrapsStorage<S extends SqlStorage>(wrapper: S, inner: SqlStorage): S {
  Object.defineProperty(wrapper, WRAPPED, { value: inner })
  // An assembly may copy the methods of the wrapper into a service object: the `read` function
  // carries the declaration with it.
  Object.defineProperty(wrapper.read, WRAPPED, { value: inner })
  return wrapper
}

/**
 * The identity of the database behind `storage`: the key under which the members that keep
 * something for each database of a process (a cache, a snapshot, a count) find it. Cordis hands
 * each plugin context its own proxy of one service object, so the proxies are unwrapped to that
 * object first; a wrapper that declared its inner storage (`wrapsStorage`) is unwrapped the same
 * way. Then the object's own `read` function is the identity: a provider makes one `read`
 * closure over its own database, and a wrapper that copies the methods of a storage (an assembly
 * that registers a port as a service) copies that closure, so it reads the same database. A `read`
 * that is not an own function (a class method, shared by every instance) is no identity, and the
 * object itself is used. Two storages over different databases therefore never share an identity;
 * two objects over one database share it only when they share the provider's `read`.
 */
export function databaseOf(storage: SqlStorage): object {
  type Links = { readonly [key: symbol]: unknown }
  const ownRead = (target: object): unknown =>
    Object.getOwnPropertyDescriptor(target, 'read')?.value
  let target: object = storage
  for (let depth = 0; depth < PROXY_DEPTH; depth += 1) {
    const read = ownRead(target)
    const inner: unknown =
      (target as Links)[CORDIS_ORIGINAL] ??
      (target as Links)[WRAPPED] ??
      (typeof read === 'function' ? (read as unknown as Links)[WRAPPED] : undefined)
    if (typeof inner !== 'object' || inner === null || inner === target) break
    target = inner
  }
  const own = ownRead(target)
  return typeof own === 'function' ? own : target
}
