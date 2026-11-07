import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import { GovernanceTargetBindingSchema } from '@omne-harness/governance-local'
import {
  SettingsPreparationCurrentSchema,
  settingsPreparationCurrentFact,
  settingsCommitCurrentFact,
} from '@omne-harness/settings-local/preparation'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { targetSnapshotFact } from './target-snapshot.ts'
import {
  settingsCurrentConfigurationSchema,
  type SettingsCurrentConfiguration,
} from './settings-current-material.ts'

export const settingsCurrentPhaseSchema = z.enum(['capture', 'ready', 'commit'])
export type SettingsCurrentPhase = z.infer<typeof settingsCurrentPhaseSchema>
export const settingsCurrentRequestSchema = z.strictObject({
  snapshot: GovernanceTargetBindingSchema,
  attempt: SettingsPreparationCurrentSchema.shape.binding.nullable(),
})
export const settingsCurrentParticipant = (phase: SettingsCurrentPhase) =>
  `harness.settings-${phase}-current`

export function settingsCurrentMaterials(
  configuration: SettingsCurrentConfiguration,
): SqlMaterialCatalog['participants'] {
  const parsed = settingsCurrentConfigurationSchema.parse(configuration)
  const generation = canonicalDigest(parsed).slice(7)
  return settingsCurrentPhaseSchema.options.map(phase => {
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
    const file = new URL(`./settings-current-participant.${extension}`, import.meta.url)
    const url = new URL(file)
    url.searchParams.set('phase', phase)
    url.searchParams.set('configuration', JSON.stringify(parsed))
    return {
      participant: settingsCurrentParticipant(phase),
      protocol: `settings-current/1/${phase}/${generation}`,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
      ownedTables: [],
      readTables: [],
      allowedFunctions: [],
      grouping: 'groupable',
      requiresFacts: [targetSnapshotFact],
      providesFacts:
        phase === 'capture'
          ? []
          : [phase === 'ready' ? settingsPreparationCurrentFact : settingsCommitCurrentFact],
    }
  })
}
