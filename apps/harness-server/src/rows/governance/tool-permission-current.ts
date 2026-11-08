import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalDigest } from '@omne-harness/tool'
import { TOOL_RECORDS_CURRENT_FACT, toolRecordCurrentFacts } from '@omne-harness/tool-storage-sql'
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
import { toolPermissionObservationSchema } from './tool-permission-observation.ts'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  SESSION_EXECUTION_CURRENT_FACT,
  executionCurrentGuardFacts,
  sessionPermissionGuardFacts,
} from '@omne-harness/session-storage-sql/participants'

export const TOOL_PERMISSION_CURRENT = 'harness.tool-permission-current'
export const AGENT_TOOL_PERMISSION_CURRENT = 'harness.agent-tool-permission-current'
export const toolPermissionConfigurationSchema = permissionCurrentConfigurationSchema.extend({
  origin: z.enum(['tool', 'agent']),
})
export function toolPermissionParticipantId(origin: 'tool' | 'agent') {
  return origin === 'agent' ? AGENT_TOOL_PERMISSION_CURRENT : TOOL_PERMISSION_CURRENT
}

export function toolPermissionCurrentCommands(
  input: PermissionProjectionRequest,
): readonly FactCommandV2[] {
  const { observation } = toolPermissionObservationSchema.parse(input.command.qualification)
  const origin = observation.agent.kind === 'agent' ? 'agent' : 'tool'
  return [
    ...(observation.agent.kind === 'agent'
      ? [executionCurrentGuardFacts(observation.agent.current)]
      : []),
    toolRecordCurrentFacts(observation.current),
    sessionPermissionGuardFacts(observation.session),
    ...permissionCurrentCommands(input, observation.definition, observation.configuration).map(
      command =>
        command.participant === PERMISSION_CURRENT_PARTICIPANT
          ? { ...command, participant: toolPermissionParticipantId(origin) }
          : command,
    ),
  ]
}

export function toolPermissionCurrentParticipant(
  configuration: z.infer<typeof permissionCurrentConfigurationSchema>,
  origin: 'tool' | 'agent' = 'tool',
): SqlMaterialCatalog['participants'][number] {
  const parsed = toolPermissionConfigurationSchema.parse({ ...configuration, origin })
  if (new Set(parsed.requiredConstraintIds).size !== parsed.requiredConstraintIds.length)
    throw new TypeError('Duplicate required constraint')
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./tool-permission-current-participant.${extension}`, import.meta.url)
  const url = new URL(file)
  url.searchParams.set('configuration', JSON.stringify(parsed))
  return {
    participant: toolPermissionParticipantId(parsed.origin),
    protocol: `harness-tool-permission-current/4/${canonicalDigest(parsed).slice(7)}`,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      targetSnapshotFact,
      TOOL_RECORDS_CURRENT_FACT,
      SESSION_PERMISSION_CURRENT_FACT,
      ...(parsed.origin === 'agent' ? [SESSION_EXECUTION_CURRENT_FACT] : []),
    ],
    providesFacts: [governancePermissionCurrentFact],
  }
}
