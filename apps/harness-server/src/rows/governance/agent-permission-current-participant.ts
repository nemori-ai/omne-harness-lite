import { matchesCapturedInquiry } from './permission-inquiry.ts'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import { SESSION_EXECUTION_CURRENT_FACT } from '@omne-harness/session-storage-sql/participants'
import { SESSION_PERMISSION_CURRENT_FACT } from '@omne-harness/session-storage-sql/participants'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  permissionCurrentConfigurationSchema,
  permissionCurrentRequestSchema,
} from './permission-current.ts'
import { agentPermissionObservationSchema } from './agent-permission-observation.ts'
import { AGENT_PERMISSION_CURRENT } from './agent-permission-current.ts'
import { executePermissionCurrent } from './permission-current-execution.ts'

const configuration = permissionCurrentConfigurationSchema.parse(
  JSON.parse(new URL(import.meta.url).searchParams.get('configuration') ?? 'null'),
)
export default {
  participant: AGENT_PERMISSION_CURRENT,
  protocol: `harness-agent-permission-current/2/${canonicalDigest(configuration).slice(7)}`,
  execute(facts, port) {
    const request = permissionCurrentRequestSchema.parse(facts['request'])
    const { observation } = agentPermissionObservationSchema.parse(request.qualification)
    if (
      !matchesCapturedInquiry(observation.inquiry, observation.session) ||
      canonicalText(port.requireFact(SESSION_EXECUTION_CURRENT_FACT)) !==
        canonicalText(observation.current) ||
      canonicalText(port.requireFact(SESSION_PERMISSION_CURRENT_FACT)) !==
        canonicalText(observation.session) ||
      observation.current.tenant !== request.permission.scope.tenantId ||
      observation.current.session !== request.permission.scope.sessionId ||
      observation.constraint.id !== 'agent-definition' ||
      observation.principalRef !== request.binding.ref.principalRef ||
      canonicalText(observation.permission) !== canonicalText(request.permission) ||
      canonicalText(observation.definition) !== canonicalText(request.snapshot.definition)
    )
      return { kind: 'unsupported', basis: { reason: 'agent-permission-observation-binding' } }
    return executePermissionCurrent(
      facts,
      port,
      [...new Set([...configuration.requiredConstraintIds, 'agent-definition'])],
      { session: observation.session, constraints: [observation.constraint] },
    )
  },
} satisfies ParticipantModule
