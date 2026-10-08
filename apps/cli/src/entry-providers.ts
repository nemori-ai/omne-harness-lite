import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { versionText } from './version.ts'
import { executeEntry } from './entry-execution.ts'
import type { EntryRuntime } from './entry-application.ts'

/** Initial local limits. Callers of the assembly may supply another bounded policy. */
export const entryCatalogPolicy = Object.freeze({
  maxCenters: 256,
  maxCreations: 100_000,
  maxRecordBytes: 1024 * 1024,
})
export function entryProviders(signal: AbortSignal): Pick<EntryRuntime, 'version' | 'execute'> {
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
        // The interactive preparation surface must install its actual confirmation.
        confirmCenter: async () => false,
      }),
  }
}
