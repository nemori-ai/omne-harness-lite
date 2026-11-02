// The combination that the `agent-journal` row's configuration names. The journal commits with the
// combination version and manifest digest of the Session log combination (a commit request carries
// them), so they must be the values the `session-storage` row registers: the same version text and
// the digest of the same catalog and participants.
import { compositeManifestDigest } from '../session-storage/composite.ts'
import { storageCatalog } from '../storage/catalog.ts'

/** The initial `combinationVersion` the release gives both rows. */
export const COMBINATION_VERSION = 'session-composite/1'

export type AgentJournalCombination = Readonly<{
  combinationVersion: string
  manifestDigest: string
}>

/** The configuration literal for the row. Throws when the catalog cannot form the combination. */
export function agentJournalCombination(
  combinationVersion: string = COMBINATION_VERSION,
): AgentJournalCombination {
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`session storage composite is not registrable: ${manifest.diagnostic}`)
  return { combinationVersion, manifestDigest: manifest.digest }
}
