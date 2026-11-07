import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  CHECKPOINT_COMMAND,
  checkpointRequestSchema,
  type CheckpointRequest,
} from './checkpoint-schema.ts'
import {
  FINALIZATION_PLAN,
  TERMINAL_OBSERVATION,
  terminalObservationSchema,
  checkpointPlanSchema,
} from './finalization-schema.ts'
import { intentCommandDigest, readSettingsAttempt, readSettingsIntent } from './intent-records.ts'
import { sourceKey } from './source-retention-records.ts'
import { equal, json, withinBudget } from './encoding.ts'

function recognizeAllocation(port: ReadPort, request: CheckpointRequest) {
  if (request.command.kind !== 'allocate') throw new Error('Expected allocation checkpoint')
  const input = request.command.input
  const found = readSettingsIntent(port, input.identity)
  if (found.kind !== 'found') return false
  if (
    intentCommandDigest(found.intent) !== request.binding.commandDigest ||
    found.intent.kind !== request.binding.commandKind ||
    !equal(found.purpose, input.purpose)
  )
    throw new Error('Settings allocation conflicts with original root')
  return found.status.state !== 'open' || found.attempt !== null
}
function allocationSource(
  port: ReadPort,
  request: CheckpointRequest,
  observation: ReturnType<typeof terminalObservationSchema.parse>['observation'],
) {
  if (request.command.kind !== 'allocate') throw new Error('Expected allocation checkpoint')
  const input = request.command.input
  if (
    request.binding.commandKind !== input.intent.kind ||
    request.binding.commandDigest !== intentCommandDigest(input.intent)
  )
    throw new Error('Settings allocation command mismatch')
  if (recognizeAllocation(port, request)) return { kind: 'none' as const }
  if (observation.kind !== 'absent')
    throw new Error('Settings allocation cannot reuse a terminal attempt')
  if (input.purpose.kind === 'target-change') return { kind: 'none' as const }
  const source = { domain: input.identity.domain, target: input.identity.operation.target }
  if (input.purpose.sourceKey !== sourceKey(source))
    throw new Error('Settings allocation source mismatch')
  return {
    kind: 'begin' as const,
    update: { source, identity: input.identity, commandDigest: request.binding.commandDigest },
  }
}
function checkCustody(
  port: ReadPort,
  request: CheckpointRequest,
  observation: ReturnType<typeof terminalObservationSchema.parse>['observation'],
) {
  const found = readSettingsAttempt(port, request.binding.identity, request.binding.attemptId)
  if (
    found.kind !== 'found' ||
    found.intent.kind !== request.binding.commandKind ||
    intentCommandDigest(found.intent) !== request.binding.commandDigest
  )
    throw new Error('Settings custody command mismatch')
  const command = request.command
  const outcome =
    command.kind === 'standing-settled'
      ? command.input.outcome
      : command.kind === 'source-record' && command.input.receipt.kind === 'settled'
        ? command.input.receipt.outcome
        : null
  if (
    outcome !== null &&
    (observation.kind !== 'terminal' || observation.terminal.state !== outcome)
  )
    throw new Error('Settings custody settlement requires its matching terminal')
}
export default {
  participant: 'settings.checkpoint-plan',
  protocol: FINALIZATION_PLAN.protocol,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_checkpoint_limit' }
    const request = checkpointRequestSchema.parse(facts['request'])
    const admitted = checkpointRequestSchema.parse(port.requireFact(CHECKPOINT_COMMAND))
    const observed = terminalObservationSchema.parse(port.requireFact(TERMINAL_OBSERVATION))
    if (!equal(request, admitted) || !equal(request, observed.request))
      throw new Error('Settings checkpoint admission mismatch')
    if (request.command.kind !== 'allocate') checkCustody(port, request, observed.observation)
    const source =
      request.command.kind === 'allocate'
        ? allocationSource(port, request, observed.observation)
        : { kind: 'none' as const }
    const plan = checkpointPlanSchema.parse({
      request,
      effect: 'checkpoint',
      terminal: null,
      source,
    })
    port.provideFact(FINALIZATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
