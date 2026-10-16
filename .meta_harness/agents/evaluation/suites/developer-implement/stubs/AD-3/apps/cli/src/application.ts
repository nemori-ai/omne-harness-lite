import { homedir } from 'node:os'
import { openClientLocalState } from '@omne-harness-lite/client-local-state'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations'
import { buildIntent, readSecrets } from './input.ts'
import { versionText } from './version.ts'

/** Internal test seam; the executable fixes these providers and exposes no fault switches. */
export interface CliRuntime {
  readonly version: typeof versionText
  readonly stdoutIsTTY: boolean
  readonly home: string
  readonly signal: AbortSignal
  readonly stdout: (text: string) => Promise<void>
  readonly stderr: (text: string) => Promise<void>
  readonly openState: typeof openClientLocalState
  readonly createClient: typeof createGovernanceClient
  readonly intent: typeof buildIntent
  readonly secrets: typeof readSecrets
}
export function providers(): Pick<
  CliRuntime,
  'home' | 'openState' | 'createClient' | 'intent' | 'secrets' | 'version'
> {
  return {
    home: homedir(),
    version: versionText,
    openState: openClientLocalState,
    createClient: createGovernanceClient,
    intent: buildIntent,
    secrets: readSecrets,
  }
}

/**
 * Runs one CLI invocation and resolves to the process exit status.
 * Diagnostics are written as `omne: <code>\n` to stderr.
 */
export async function runCli(_args: readonly string[], _runtime: CliRuntime): Promise<number> {
  throw new Error('not-implemented')
}
