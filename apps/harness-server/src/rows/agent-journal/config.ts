import { z } from 'zod'
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'

export const COMBINATION_VERSION = 'session-composite/20'

// What a row that commits under the session storage combination is configured with: the version
// alone. The manifest digest has one source, the storage catalog of the running code.
export const combinationConfig = z.strictObject({ combinationVersion: z.string().min(1) })
export type CombinationConfig = z.output<typeof combinationConfig>

export type AgentJournalCombination = Readonly<{
  combinationVersion: string
  manifestDigest: string
}>

export function agentJournalCombination(
  combinationVersion: string = COMBINATION_VERSION,
): AgentJournalCombination {
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`session storage composite is not registrable: ${manifest.diagnostic}`)
  return { combinationVersion, manifestDigest: manifest.digest }
}
