import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog, ParticipantDescriptor } from '@omne-harness/sql-contract'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  TERMINAL_OBSERVATION,
  PREPARATION_CURRENT,
} from './finalization-schema.ts'
import { TERMINAL_PARTICIPANT, TERMINAL_TABLE, TERMINAL_MIGRATION } from './terminal-schema.ts'
import { PARTICIPANT } from './schema.ts'
import { SOURCE_SNAPSHOT_FACT } from './source-retention-schema.ts'
import { SETTINGS_INTENT_TABLES } from './intent-migration.ts'
import { SETTINGS_STANDING_CUSTODY_TABLE } from './standing-custody-migration.ts'
import { SETTINGS_SOURCE_CUSTODY_TABLES } from './source-custody-migration.ts'
import { sourceReadinessMaterials } from './source-readiness-materials.ts'
import { SOURCE_READINESS_FACT, SOURCE_READINESS_PARTICIPANT } from './source-readiness.ts'
import { PREPARATION_READ } from './preparation-read-schema.ts'
import { SETTINGS_PREPARING_MIGRATION } from './preparing-migration.ts'
import { SETTINGS_STANDING_CUSTODY_MIGRATION } from './standing-custody-migration.ts'
import { SETTINGS_SOURCE_CUSTODY_MIGRATION } from './source-custody-migration.ts'
import { CHECKPOINT_COMMAND } from './checkpoint-schema.ts'
import { COMMIT_CURRENT } from './commit-current.ts'
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
export const SETTINGS_READY_PARTICIPANTS = SETTINGS_RECOVERY_PARTICIPANTS.map(participant =>
  participant === 'settings.recovery-plan' ? 'settings.ready-plan' : participant,
)
export const SETTINGS_CHECKPOINT_PARTICIPANTS = [
  'settings.checkpoint-input',
  ...SETTINGS_RECOVERY_PARTICIPANTS.map(participant =>
    participant === 'settings.recovery-plan' ? 'settings.checkpoint-plan' : participant,
  ),
]
export const SETTINGS_COMMIT_PARTICIPANTS = [
  ...SETTINGS_RECOVERY_PARTICIPANTS.map(participant =>
    participant === 'settings.recovery-plan' ? 'settings.commit-plan' : participant,
  ),
  SOURCE_READINESS_PARTICIPANT,
]
/** The participants that plan, observe and finish the phases of a prepared operation. */
export function settingsPhaseParticipants(): ParticipantDescriptor[] {
  return [
    {
      participant: 'settings.checkpoint-input',
      protocol: CHECKPOINT_COMMAND.protocol,
      ...file('checkpoint-input'),
      ownedTables: [],
      readTables: [],
      requiresFacts: [],
      providesFacts: [CHECKPOINT_COMMAND],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    {
      participant: 'settings.checkpoint-plan',
      protocol: FINALIZATION_PLAN.protocol,
      ...file('checkpoint-plan'),
      ownedTables: [],
      readTables: SETTINGS_INTENT_TABLES,
      requiresFacts: [TERMINAL_OBSERVATION, CHECKPOINT_COMMAND],
      providesFacts: [FINALIZATION_PLAN],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    ...sourceReadinessMaterials().participants,
    {
      participant: 'settings.commit-plan',
      protocol: FINALIZATION_PLAN.protocol,
      ...file('commit-plan'),
      ownedTables: [],
      readTables: [
        'st_states',
        ...SETTINGS_INTENT_TABLES,
        SETTINGS_STANDING_CUSTODY_TABLE,
        ...SETTINGS_SOURCE_CUSTODY_TABLES,
      ],
      requiresFacts: [TERMINAL_OBSERVATION, COMMIT_CURRENT, SOURCE_READINESS_FACT],
      providesFacts: [FINALIZATION_PLAN],
      allowedFunctions: [],
      grouping: 'groupable',
    },
    {
      participant: 'settings.ready-plan',
      protocol: FINALIZATION_PLAN.protocol,
      ...file('ready-plan'),
      ownedTables: [],
      readTables: [],
      requiresFacts: [TERMINAL_OBSERVATION, PREPARATION_CURRENT],
      providesFacts: [FINALIZATION_PLAN],
      allowedFunctions: [],
      grouping: 'groupable',
    },
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
}
/** The reader of a prepared operation and its attempts. */
export function preparationReadHandler(): SqlMaterialCatalog['readHandlers'][number] {
  return {
    ...PREPARATION_READ,
    ...file('preparation-read'),
    ordering: 'snapshot',
    readTables: [
      TERMINAL_TABLE,
      ...SETTINGS_INTENT_TABLES,
      SETTINGS_STANDING_CUSTODY_TABLE,
      ...SETTINGS_SOURCE_CUSTODY_TABLES,
    ],
    requiresMigrations: [
      TERMINAL_MIGRATION,
      SETTINGS_PREPARING_MIGRATION,
      SETTINGS_STANDING_CUSTODY_MIGRATION,
      SETTINGS_SOURCE_CUSTODY_MIGRATION,
    ],
    maxRowsRead: 67,
    maxOutputBytes: 2 * 1024 * 1024,
  }
}
