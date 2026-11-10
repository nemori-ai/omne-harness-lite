import { matchesCapturedInquiry } from './permission-inquiry.ts'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import { TOOL_RECORDS_CURRENT_FACT } from '@omne-harness/tool-storage-sql'
import {
  SESSION_PERMISSION_CURRENT_FACT,
  SESSION_EXECUTION_CURRENT_FACT,
} from '@omne-harness/session-storage-sql/participants'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { permissionCurrentRequestSchema } from './permission-current.ts'
import { toolPermissionObservationSchema } from './tool-permission-observation.ts'
import {
  toolPermissionConfigurationSchema,
  toolPermissionParticipantId,
} from './tool-permission-current.ts'
import { executePermissionCurrent } from './permission-current-execution.ts'

const configuration = toolPermissionConfigurationSchema.parse(
  JSON.parse(new URL(import.meta.url).searchParams.get('configuration') ?? 'null'),
)
type Observation = z.infer<typeof toolPermissionObservationSchema>['observation']
type Request = z.infer<typeof permissionCurrentRequestSchema>
type Port = Parameters<ParticipantModule['execute']>[1]
function agentMatches(agent: Observation['agent'], request: Request, port: Port): boolean {
  if (agent.kind === 'none') return configuration.origin === 'tool'
  return (
    configuration.origin === 'agent' &&
    canonicalText(port.requireFact(SESSION_EXECUTION_CURRENT_FACT)) ===
      canonicalText(agent.current) &&
    agent.current.tenant === request.permission.scope.tenantId &&
    agent.current.session === request.permission.scope.sessionId &&
    agent.constraint.id === 'agent-definition'
  )
}
export default {
  participant: toolPermissionParticipantId(configuration.origin),
  protocol: `harness-tool-permission-current/4/${canonicalDigest(configuration).slice(7)}`,
  execute(facts, port) {
    const request = permissionCurrentRequestSchema.parse(facts['request'])
    const { observation } = toolPermissionObservationSchema.parse(request.qualification)
    if (
      !matchesCapturedInquiry(observation.inquiry, observation.session) ||
      canonicalText(port.requireFact(TOOL_RECORDS_CURRENT_FACT)) !==
        canonicalText(observation.current) ||
      canonicalText(port.requireFact(SESSION_PERMISSION_CURRENT_FACT)) !==
        canonicalText(observation.session) ||
      observation.current.tenant !== request.permission.scope.tenantId ||
      observation.principalRef !== request.binding.ref.principalRef ||
      canonicalText(observation.permission) !== canonicalText(request.permission) ||
      canonicalText(observation.definition) !== canonicalText(request.snapshot.definition) ||
      !agentMatches(observation.agent, request, port)
    )
      return { kind: 'unsupported', basis: { reason: 'tool-permission-observation-binding' } }
    const constraints = observation.agent.kind === 'agent' ? [observation.agent.constraint] : []
    const required = [
      ...new Set([...configuration.requiredConstraintIds, ...constraints.map(value => value.id)]),
    ]
    return executePermissionCurrent(facts, port, required, {
      session: observation.session,
      constraints,
    })
  },
} satisfies ParticipantModule
