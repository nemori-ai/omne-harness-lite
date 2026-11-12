// What a port hands over after the bound (invariant 5) is nobody's result: it is closed or
// released on arrival. These are the `settle` functions of `within` (port.ts), so they run in the
// table's scope. The port was asked through `ask`, so a breach after the bound arrives as a
// failure answer, which hands over nothing.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  HttpCredentialHandle,
  McpTransport,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { ask } from './port.ts'

/** A transport opened after the bound is closed on arrival. */
export async function closeArrived(opened: Outcome<McpTransport, TransportFailure>): Promise<void> {
  if ('ok' in opened) await ask(() => opened.ok.close(), undefined)
}

/** A credential handle that arrives after the bound belongs to no connection: released on arrival. */
export async function releaseArrived(
  acquired: Outcome<HttpCredentialHandle, CredentialFailure>,
): Promise<void> {
  if ('ok' in acquired) await ask(() => acquired.ok.release(), undefined)
}
