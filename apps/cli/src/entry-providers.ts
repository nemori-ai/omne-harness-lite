import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { versionText } from './version.ts'
import { executeEntry } from './entry-execution.ts'
import type { EntryRuntime } from './entry-application.ts'
import { openTerminal } from './tui/terminal.ts'

/** Initial local limits. Callers of the assembly may supply another bounded policy. */
export const entryCatalogPolicy = Object.freeze({
  maxCenters: 256,
  maxCreations: 100_000,
  maxRecordBytes: 1024 * 1024,
})
export function entryProviders(signal: AbortSignal): Pick<EntryRuntime, 'version' | 'execute'> {
  const terminalProfile = process.env.OMNE_TERMINAL_PROFILE ?? ''
  const home = {
    osHome: homedir(),
    ...(process.env.OMNE_HOME === undefined ? {} : { environmentHome: process.env.OMNE_HOME }),
  }
  return {
    version: versionText,
    execute: command =>
      executeEntry(command, {
        home,
        signal,
        catalogPolicy: entryCatalogPolicy,
        originalId: randomUUID,
        sessionPolicy: {
          maxResponseBytes: 4 * 1024 * 1024,
          timeoutMs: 10_000,
          maxWaitMs: 120_000,
          pollIntervalMs: 250,
        },
        maxMessageBytes: 1024 * 1024,
        confirmCenter: async () => false,
        interactive: {
          terminal: () => openTerminal(terminalProfile),
          choicePolicy: { maxChoices: 256 },
        },
      }),
  }
}
