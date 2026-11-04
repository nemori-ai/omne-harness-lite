// What a port hands over after the bound (invariant 5): nobody's result, so closed, stopped or
// released on arrival, the rejection of the port included. A rejection on the way is dropped
// (`afterwards`): this member has no log.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  McpTransport,
  ProcessHandle,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { afterwards } from './abort.ts'
import type { CredentialHandle, Entry, Landing } from './entry.ts'
import { releaseLanding, stopRecorded } from './teardown.ts'

type LandingFailure = 'landing-invalid' | 'facility-missing' | 'unknown'

/** A transport opened after the bound is closed on arrival. */
export function closeLate(late: Promise<Outcome<McpTransport, TransportFailure>>): Promise<void> {
  return afterwards(late, async opened => {
    if (opened.kind === 'answered' && 'ok' in opened.value) await opened.value.ok.close()
  })
}

/** A credential handle that arrives after the bound belongs to no connection: released on arrival. */
export function releaseLate(
  late: Promise<Outcome<CredentialHandle, CredentialFailure>>,
): Promise<void> {
  return afterwards(late, async acquired => {
    if (acquired.kind === 'answered' && 'ok' in acquired.value) await acquired.value.ok.release()
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
    try {
      if (started.kind === 'answered' && 'ok' in started.value)
        await stopRecorded(entry, started.value.ok, { scope: 'no-process' })
    } finally {
      try {
        await releaseLanding(landing)
      } finally {
        entry.landings = entry.landings.filter(pending => pending !== landing)
      }
    }
  })
}
