// The close order of the group page on the resources of one entry, once: close the transport,
// stop the processes (the entry's own, then the lingering ones), release the credential handle
// (S9: a process handle after `stop()` returned, an HTTP handle with the close). A port that
// rejects instead of answering breaches its contract; the breach is absorbed where the port is
// called, as SPEC decision 4 says: a `close()` that rejected is closed, a `stop()` that rejected
// confirmed nothing (`unconfirmed`, the process stays lingering), a `release()` that rejected is
// released and not retried. So no step rejects on a port, every process is asked and every step
// runs. A resource leaves the entry only after its port answered: while a step waits, the entry
// still holds what the step works on. An error of this package is not absorbed: it rejects the
// teardown. A teardown asked while one is in flight joins it.
import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { answerOf } from './abort.ts'
import { kept, type Entry, type Landing, type Scope } from './entry.ts'

const STOP_ORDER: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']

/** The less confirmed of two ranges; `no-process` yields to any process. */
export function narrowest(left: Scope, right: Scope): Scope {
  if (left === 'no-process') return right
  if (right === 'no-process') return left
  return STOP_ORDER.indexOf(left) <= STOP_ORDER.indexOf(right) ? left : right
}

/** The one entry point of the close order; answers the range it confirmed. */
export function teardown(entry: Entry): Promise<Scope> {
  if (entry.tearing !== undefined) return entry.tearing
  const tearing = closeOrder(entry)
  entry.tearing = tearing
  return tearing.finally(() => {
    if (entry.tearing === tearing) entry.tearing = undefined
  })
}

/**
 * What the teardown confirmed: its stops, narrowed by every process still lingering and, when a
 * landing is still in flight, to `unconfirmed`: a process may still come (decision 5).
 */
function confirmedOf(entry: Entry, stopped: Scope): Scope {
  const stops = entry.lingering.reduce<Scope>(
    (narrowed, { confirmed }) => narrowest(narrowed, confirmed),
    stopped,
  )
  return entry.landings.length > 0 ? narrowest(stops, 'unconfirmed') : stops
}

async function closeOrder(entry: Entry): Promise<Scope> {
  await closeTransport(entry)
  const stopped = await stopProcesses(entry)
  await releaseHeld(entry)
  return confirmedOf(entry, stopped)
}

/** Step 1. A `close()` that rejected is closed: the transport leaves the entry either way. */
async function closeTransport(entry: Entry): Promise<void> {
  const { transport } = entry
  if (transport === undefined) return
  await answerOf(transport.close(), undefined)
  entry.transport = undefined
}

/** Step 2. The entry's own process, then every lingering one; each is asked, whatever the others answer. */
async function stopProcesses(entry: Entry): Promise<Scope> {
  const own = entry.process
  const handles = [
    ...(own === undefined ? [] : [own]),
    ...entry.lingering.map(({ handle }) => handle),
  ]
  let stopped: Scope = 'no-process'
  for (const handle of handles) stopped = narrowest(stopped, await stopOne(entry, handle))
  return stopped
}

/**
 * Asks one process to stop and records on the entry what it confirmed: a range short of the
 * whole tree keeps the process lingering. A `stop()` that rejected confirmed nothing:
 * `unconfirmed`. Shared with the process that lands after the bound.
 */
export async function stopOne(entry: Entry, handle: ProcessHandle): Promise<StopScope> {
  const confirmed = await answerOf(handle.stop(), 'unconfirmed')
  if (entry.process === handle) entry.process = undefined
  entry.lingering = kept(entry.lingering, handle, confirmed)
  return confirmed
}

/** Step 3. A `release()` that rejected is released and not retried: the handle leaves the entry. */
async function releaseHeld(entry: Entry): Promise<void> {
  const { credential } = entry
  if (credential === undefined) return
  await answerOf(credential.release(), undefined)
  entry.credential = undefined
}

/**
 * Releases the handle a landing carries, once: the first of the arrival and the shutdown takes
 * it, the other finds nothing. A release that rejected is released (decision 4).
 */
export async function releaseLanding(landing: Landing): Promise<void> {
  const { credential } = landing
  landing.credential = undefined
  if (credential !== undefined) await answerOf(credential.release(), undefined)
}

/**
 * The exception of S9 at the shutdown (decision 6): the handle of every landing still in flight
 * is released now, all of them started at once, so the host does not wait on a landing that may
 * never answer. The process that lands later is stopped once; its handle is not released again.
 */
export async function abandonLandings(entry: Entry): Promise<void> {
  await Promise.all(entry.landings.map(releaseLanding))
}
