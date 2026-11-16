import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  HttpCredentialHandle,
  McpTransport,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { ask } from './port.ts'

export async function closeArrived(opened: Outcome<McpTransport, TransportFailure>): Promise<void> {
  if ('ok' in opened) await ask(() => opened.ok.close(), undefined)
}

export async function releaseArrived(
  acquired: Outcome<HttpCredentialHandle, CredentialFailure>,
): Promise<void> {
  if ('ok' in acquired) await ask(() => acquired.ok.release(), undefined)
}
