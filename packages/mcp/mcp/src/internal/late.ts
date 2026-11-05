// What a port hands over after the bound (invariant 5) is nobody's result: it is closed, stopped
// or released on arrival. These are the `settle` functions of `within` (port.ts), so they run in
// the table's scope. The port was asked through `ask`, so a breach after the bound arrives as a
// failure answer, which hands over nothing.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  McpTransport,
  ProcessHandle,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { landingAnswered, type CredentialHandle, type Entry, type Landing } from './entry.ts'
import { ask } from './port.ts'
import { releaseLanding, stopOne } from './teardown.ts'

export type LandingFailure = 'landing-invalid' | 'facility-missing' | 'unknown'

/** A transport opened after the bound is closed on arrival. */
export async function closeArrived(opened: Outcome<McpTransport, TransportFailure>): Promise<void> {
  if ('ok' in opened) await ask(() => opened.ok.close(), undefined)
}

/** A credential handle that arrives after the bound belongs to no connection: released on arrival. */
export async function releaseArrived(
  acquired: Outcome<CredentialHandle, CredentialFailure>,
): Promise<void> {
  if ('ok' in acquired) await ask(() => acquired.ok.release(), undefined)
}

/**
 * Settles a landing still pending after the bound on its answer. The process it hands over is
 * stopped once and kept when the stop confirmed less than the tree; the handle it carried is
 * released after that stop (S9), unless the shutdown released it first (decision 6). A landing
 * that fails brought no process: the handle is released on the answer. The landing leaves the
 * entry either way.
 */
export function landArrived(
  entry: Entry,
  landing: Landing,
): (started: Outcome<ProcessHandle, LandingFailure>) => Promise<void> {
  return async started => {
    if ('ok' in started) {
      landing.landed = true
      await stopOne(entry, started.ok)
    }
    await releaseLanding(landing)
    landingAnswered(entry, landing)
  }
}
