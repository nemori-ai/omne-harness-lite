/**
 * Shared projection type tables, re-exported through the public baseline entry.
 * Consumers declare-merge through that entry; re-export preserves symbol identity.
 * This internal file is not a separately exported package subpath.
 *
 * @module @omne-harness-lite/session-projection/baseline
 */

/**
 * The merge-extensible client projection table shared by wire blocks, client
 * cells, and React hooks. Domain packages merge their client-visible key here;
 * values are wire-JSON whole values. How a value is rendered is the slot
 * system's business, never this layer's.
 */
export interface SessionProjectionMap {}

/**
 * The merge-extensible host fold-state table. Each client-visible key also
 * appears in {@link SessionProjectionMap}; host-only keys appear only here.
 * Values must be plain JSON so the projection cache can persist them.
 */
export interface SessionProjectionStateMap {}
