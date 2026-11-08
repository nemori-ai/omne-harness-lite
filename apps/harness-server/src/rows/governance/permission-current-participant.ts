import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalDigest } from '@omne-harness/tool'
import {
  PERMISSION_CURRENT_PARTICIPANT,
  permissionCurrentConfigurationSchema,
} from './permission-current.ts'
import { executePermissionCurrent } from './permission-current-execution.ts'

const configuration = permissionCurrentConfigurationSchema.parse(
  JSON.parse(new URL(import.meta.url).searchParams.get('configuration') ?? 'null'),
)
export default {
  participant: PERMISSION_CURRENT_PARTICIPANT,
  protocol: `harness-governance-permission-current/2/${canonicalDigest(configuration).slice(7)}`,
  execute: (facts, port) =>
    executePermissionCurrent(facts, port, configuration.requiredConstraintIds),
} satisfies ParticipantModule
