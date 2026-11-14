import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'

export const COMBINATION_VERSION = 'session-composite/12'

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
