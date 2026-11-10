import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import {
  SESSION_EXECUTION_CURRENT_FACT,
  executionCurrentGuardFacts,
} from '@omne-harness/session-storage-sql/participants'
import {
  governancePermissionCurrentFact,
  type PermissionProjectionRequest,
} from '@omne-harness/governance-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  PERMISSION_CURRENT_PARTICIPANT,
  permissionCurrentCommands,
  permissionCurrentConfigurationSchema,
} from './permission-current.ts'
import { targetSnapshotFact } from './target-snapshot.ts'
import { agentPermissionObservationSchema } from './agent-permission-observation.ts'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  sessionPermissionGuardFacts,
} from '@omne-harness/session-storage-sql/participants'

export const AGENT_PERMISSION_CURRENT = 'harness.agent-permission-current'

export function agentPermissionCurrentCommands(
  input: PermissionProjectionRequest,
): readonly FactCommandV2[] {
  const { observation } = agentPermissionObservationSchema.parse(input.command.qualification)
  return [
    executionCurrentGuardFacts(observation.current),
    sessionPermissionGuardFacts(observation.session),
    ...permissionCurrentCommands(input, observation.definition, observation.configuration).map(
      command =>
        command.participant === PERMISSION_CURRENT_PARTICIPANT
          ? { ...command, participant: AGENT_PERMISSION_CURRENT }
          : command,
    ),
  ]
}

export function agentPermissionCurrentParticipant(
  configuration: z.infer<typeof permissionCurrentConfigurationSchema>,
): SqlMaterialCatalog['participants'][number] {
  const parsed = permissionCurrentConfigurationSchema.parse(configuration)
  if (new Set(parsed.requiredConstraintIds).size !== parsed.requiredConstraintIds.length)
    throw new TypeError('Duplicate required constraint')
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./agent-permission-current-participant.${extension}`, import.meta.url)
  const url = new URL(file)
  url.searchParams.set('configuration', JSON.stringify(parsed))
  return {
    participant: AGENT_PERMISSION_CURRENT,
    protocol: `harness-agent-permission-current/2/${canonicalDigest(parsed).slice(7)}`,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      targetSnapshotFact,
      SESSION_EXECUTION_CURRENT_FACT,
      SESSION_PERMISSION_CURRENT_FACT,
    ],
    providesFacts: [governancePermissionCurrentFact],
  }
}
