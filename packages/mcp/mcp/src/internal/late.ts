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

export async function closeArrived(opened: Outcome<McpTransport, TransportFailure>): Promise<void> {
  if ('ok' in opened) await ask(() => opened.ok.close(), undefined)
}

export async function releaseArrived(
  acquired: Outcome<CredentialHandle, CredentialFailure>,
): Promise<void> {
  if ('ok' in acquired) await ask(() => acquired.ok.release(), undefined)
}

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
