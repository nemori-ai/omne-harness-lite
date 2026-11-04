// The close order of the group page on the resources of one entry, once: close the transport,
// stop the processes (the entry's own, then the lingering ones), release the credential handle
// (S9: a process handle after `stop()` returned, an HTTP handle with the close). Every step runs:
// each step is wrapped in `try`/`finally`, and the next step sits in the `finally` of the one
// before, so a port that rejects skips nothing. Such a port is in breach of its contract; the
// breach is recorded in the step's `finally` as SPEC decision 4 says — a `close()` that rejected
// is closed, a `stop()` that rejected confirmed nothing (`unconfirmed`; the process stays, to be
// stopped again), a `release()` that rejected is released and not retried — and absorbed at the
// end, where the confirmed range comes from the record. The caller assembles nothing. A teardown
// asked while one is in flight joins it. What this module awaits is a port; the bookkeeping
// between the awaits does not throw.
import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { kept, type Entry, type Landing, type Scope } from './entry.ts'

const STOP_ORDER: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']

/** The less confirmed of two ranges; `no-process` yields to any process. */
export function narrowest(left: Scope, right: Scope): Scope {
  if (left === 'no-process') return right
  if (right === 'no-process') return left
  return STOP_ORDER.indexOf(left) <= STOP_ORDER.indexOf(right) ? left : right
}

/** The range the stops of one teardown confirmed so far. */
export type Stopped = { scope: Scope }

/** The one entry point of the close order; answers what it confirmed. */
export function teardown(entry: Entry): Promise<Scope> {
  if (entry.tearing !== undefined) return entry.tearing
  const stopped: Stopped = { scope: 'no-process' }
  const confirmed = () => confirmedOf(entry, stopped.scope)
  const tearing = closeOrder(entry, stopped).then(confirmed, confirmed)
  entry.tearing = tearing
  return tearing.finally(() => {
    if (entry.tearing === tearing) entry.tearing = undefined
  })
}

/**
 * What the teardown confirmed: its stops, narrowed by every process still lingering and, when a
 * landing is still in flight, to `unconfirmed`: a process may still come (decision 5).
 */
function confirmedOf(entry: Entry, scope: Scope): Scope {
  const stops = entry.lingering.reduce<Scope>(
    (narrowed, { confirmed }) => narrowest(narrowed, confirmed),
    scope,
  )
  return entry.landings.length > 0 ? narrowest(stops, 'unconfirmed') : stops
}

async function closeOrder(entry: Entry, stopped: Stopped): Promise<void> {
  try {
    await closeTransport(entry)
  } finally {
    try {
      await stopProcesses(entry, stopped)
    } finally {
      await releaseHeld(entry)
    }
  }
}

/** Step 1. The transport is dropped whether `close()` answered or rejected: closed either way. */
async function closeTransport(entry: Entry): Promise<void> {
  const { transport } = entry
  if (transport === undefined) return
  try {
    await transport.close()
  } finally {
    entry.transport = undefined
  }
}

/**
 * Step 2. The entry's own process, then every lingering one. A stop that rejects ends the step
 * after its record; the processes not asked this time stay lingering for the next close.
 */
async function stopProcesses(entry: Entry, stopped: Stopped): Promise<void> {
  const own = entry.process
  const handles = [
    ...(own === undefined ? [] : [own]),
    ...entry.lingering.map(({ handle }) => handle),
  ]
  for (const handle of handles) await stopRecorded(entry, handle, stopped)
}

/**
 * Stops one process and records on the entry what it confirmed: a range short of the whole
 * tree keeps the process lingering. A `stop()` that rejected confirmed nothing: `unconfirmed`.
 * Shared with the process that lands after the bound.
 */
export async function stopRecorded(
  entry: Entry,
  handle: ProcessHandle,
  stopped: Stopped,
): Promise<void> {
  let confirmed: StopScope = 'unconfirmed'
  try {
    confirmed = await handle.stop()
  } finally {
    if (entry.process === handle) entry.process = undefined
    entry.lingering = kept(entry.lingering, handle, confirmed)
    stopped.scope = narrowest(stopped.scope, confirmed)
  }
}

/** Step 3. The handle is dropped whether `release()` answered or rejected: released, not retried. */
async function releaseHeld(entry: Entry): Promise<void> {
  const { credential } = entry
  if (credential === undefined) return
  try {
    await credential.release()
  } finally {
    entry.credential = undefined
  }
}

/**
 * Releases the handle a landing carries, once: the first of the arrival and the shutdown takes
 * it, the other finds nothing. A release that rejected is released (decision 4).
 */
export async function releaseLanding(landing: Landing): Promise<void> {
  const { credential } = landing
  landing.credential = undefined
  if (credential !== undefined) await credential.release()
}

/**
 * The exception of S9 at the shutdown (decision 6): the handle of every landing still in flight
 * is released now, so the host does not wait on a landing that may never answer. The process
 * that lands later is stopped once; its handle is not released again.
 */
export async function abandonLandings(entry: Entry): Promise<void> {
  for (const landing of entry.landings) await releaseLanding(landing).catch(() => undefined)
}
