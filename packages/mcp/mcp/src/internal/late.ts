// What a port hands over after the bound (invariant 5): nobody's result, so closed, stopped or
// released on arrival. A rejection on the way is dropped (`afterwards`): this member has no log.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  McpTransport,
  ProcessHandle,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { afterwards } from './abort.ts'
import { keep, type CredentialHandle, type Entry } from './entry.ts'

/** A transport opened after the bound is closed on arrival. */
export function closeLate(late: Promise<Outcome<McpTransport, TransportFailure>>): void {
  afterwards(late, async opened => {
    if ('ok' in opened) await opened.ok.close()
  })
}

/** A credential handle that arrives after the bound belongs to no connection: released on arrival. */
export function releaseLate(late: Promise<Outcome<CredentialHandle, CredentialFailure>>): void {
  afterwards(late, async acquired => {
    if ('ok' in acquired) await acquired.ok.release()
  })
}

/**
 * A process that landed after its bound: stopped, and kept by its entry when the stop confirmed
 * less than the tree, so the status reports it and the next close stops it again.
 */
export async function stopLate(entry: Entry, process: ProcessHandle): Promise<void> {
  keep(entry, process, await process.stop())
}
