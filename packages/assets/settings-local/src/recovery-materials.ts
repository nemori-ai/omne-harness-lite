import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog, ParticipantDescriptor } from '@omne-harness/sql-contract'
import { settingsSqlMaterials } from './materials.ts'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  TERMINAL_OBSERVATION,
} from './finalization-schema.ts'
import { TERMINAL_PARTICIPANT, TERMINAL_TABLE } from './terminal-schema.ts'
import { PARTICIPANT } from './schema.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { SOURCE_SNAPSHOT_FACT } from './source-retention-schema.ts'
import { SETTINGS_INTENT_TABLES } from './intent-migration.ts'
function file(name: string) {
  const url = new URL(`./${name}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export const SETTINGS_RECOVERY_PARTICIPANTS = [
  TERMINAL_OBSERVATION.key,
  'settings.recovery-plan',
  TERMINAL_PARTICIPANT,
  'settings.source-finalization',
  'settings.source-retention',
  PARTICIPANT,
]
/** Private replacement catalog for the prepared provider; never mixed with the old writers. */
export function settingsRecoveryMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const base = settingsSqlMaterials()
  const readers: ParticipantDescriptor[] = [
    {
      participant: TERMINAL_OBSERVATION.key,
      protocol: TERMINAL_OBSERVATION.protocol,
      ...file('terminal-observation'),
      ownedTables: [],
      readTables: [TERMINAL_TABLE],
      requiresFacts: [],
      providesFacts: [TERMINAL_OBSERVATION],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    {
      participant: 'settings.recovery-plan',
      protocol: FINALIZATION_PLAN.protocol,
      ...file('recovery-plan'),
      ownedTables: [],
      readTables: SETTINGS_INTENT_TABLES,
      requiresFacts: [TERMINAL_OBSERVATION],
      providesFacts: [FINALIZATION_PLAN],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    {
      participant: 'settings.source-finalization',
      protocol: FINALIZATION_PLAN.protocol,
      ...file('source-finalization'),
      ownedTables: [],
      readTables: [],
      requiresFacts: [FINALIZATION_PLAN, FINALIZATION_TERMINAL],
      providesFacts: [SOURCE_SNAPSHOT_FACT],
      allowedFunctions: [],
      grouping: 'groupable',
    },
  ]
  return {
    ...base,
    participants: [
      ...base.participants.map(p => {
        if (p.participant === TERMINAL_PARTICIPANT)
          return {
            ...p,
            ...file('prepared-terminal-participant'),
            requiresFacts: [FINALIZATION_PLAN],
            providesFacts: [FINALIZATION_TERMINAL],
          }
        if (p.participant === PARTICIPANT)
          return {
            ...p,
            ...file('prepared-persistence'),
            requiresFacts: [FINALIZATION_PLAN, FINALIZATION_TERMINAL, SOURCE_WRITE_FACT],
          }
        return p
      }),
      ...readers,
    ],
  }
}
