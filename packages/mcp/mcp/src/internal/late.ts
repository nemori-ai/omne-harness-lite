// What a port hands over after the bound (invariant 5): nobody's result, so closed, stopped or
// released on arrival. A port that rejects after the bound hands over nothing; a port called on
// arrival absorbs its own breach as SPEC decision 4 says (`answerOf`).
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  McpTransport,
  ProcessHandle,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { afterwards, answerOf } from './abort.ts'
import type { CredentialHandle, Entry, Landing } from './entry.ts'
import { releaseLanding, stopOne } from './teardown.ts'

type LandingFailure = 'landing-invalid' | 'facility-missing' | 'unknown'

/** A transport opened after the bound is closed on arrival. */
export function closeLate(late: Promise<Outcome<McpTransport, TransportFailure>>): Promise<void> {
  return afterwards(late, async opened => {
    if (opened !== undefined && 'ok' in opened) await answerOf(opened.ok.close(), undefined)
  })
}

/** A credential handle that arrives after the bound belongs to no connection: released on arrival. */
export function releaseLate(
  late: Promise<Outcome<CredentialHandle, CredentialFailure>>,
): Promise<void> {
  return afterwards(late, async acquired => {
    if (acquired !== undefined && 'ok' in acquired) await answerOf(acquired.ok.release(), undefined)
  })
}

/**
 * A landing still pending after the bound, settled on its answer. The process it hands over is
 * stopped once and kept when the stop confirmed less than the tree; the handle it carried is
 * released after that stop (S9), unless the shutdown released it first (decision 6). A landing
 * that fails or rejects brought no process: the handle is released on the answer. The landing
 * leaves the entry either way; the table looks at the entry again afterwards.
 */
export function landLate(
  entry: Entry,
  landing: Landing,
  late: Promise<Outcome<ProcessHandle, LandingFailure>>,
): Promise<void> {
  return afterwards(late, async started => {
    if (started !== undefined && 'ok' in started) await stopOne(entry, started.ok)
    await releaseLanding(landing)
    entry.landings = entry.landings.filter(pending => pending !== landing)
  })
}
