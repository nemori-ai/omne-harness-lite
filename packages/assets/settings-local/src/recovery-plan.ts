import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { intentCommandDigest, readSettingsAttempt, readSettingsIntent } from './intent-records.ts'
import { sourceKey } from './source-retention-records.ts'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import {
  FINALIZATION_PLAN,
  TERMINAL_OBSERVATION,
  recoveryRequestSchema,
  terminalObservationSchema,
  recoveryPlanSchema,
  type RecoveryRequest,
  type RecoveryPlan,
} from './finalization-schema.ts'
import { equal, json, withinBudget } from './encoding.ts'
function original(port: ReadPort, request: RecoveryRequest) {
  const root = readSettingsIntent(port, request.binding.identity)
  if (root.kind !== 'found') throw new Error('Settings recovery root not found')
  if (
    root.intent.kind !== request.binding.commandKind ||
    intentCommandDigest(root.intent) !== request.binding.commandDigest
  )
    throw new Error('Settings recovery command binding mismatch')
  return root
}
function selectAttempt(
  port: ReadPort,
  request: RecoveryRequest,
  root: ReturnType<typeof original>,
  attemptId: string,
) {
  const exact = readSettingsAttempt(port, request.binding.identity, attemptId)
  if (exact.kind !== 'found') throw new Error('Settings recovery attempt not found')
  const state = exact.attempt.status.state
  const completed = state === 'aborted' || state === 'committed'
  const mustBeCurrent = !completed || (request.kind === 'cancel' && root.status.state === 'open')
  if (mustBeCurrent && root.attempt?.attemptId !== attemptId)
    throw new Error('Settings recovery selected a stale attempt')
  if (state === 'committed' && root.status.state !== 'committed')
    throw new Error('Settings committed attempt lacks root result')
  return { state, completed }
}
function plannedTerminal(
  port: ReadPort,
  request: RecoveryRequest,
  root: ReturnType<typeof original>,
) {
  const { binding } = request
  if (binding.attemptId === null) {
    if (root.attempt !== null) throw new Error('Settings cancellation selected a stale attempt')
    return { terminal: null, completed: root.status.state !== 'open' }
  }
  const selected = selectAttempt(port, request, root, binding.attemptId)
  return {
    terminal: {
      kind: 'attempt' as const,
      binding: settingsAttemptBindingSchema.parse(binding),
      state: selected.state === 'committed' ? ('committed' as const) : ('aborted' as const),
    },
    completed: selected.completed,
  }
}
function sourceAction(
  root: ReturnType<typeof original>,
  effect: RecoveryPlan['effect'],
): RecoveryPlan['source'] {
  if (effect === 'recognize' || root.purpose.kind !== 'source-update') return { kind: 'none' }
  const source = { domain: root.identity.domain, target: root.identity.operation.target }
  if (sourceKey(source) !== root.purpose.sourceKey) throw new Error('Settings source root mismatch')
  return {
    kind: 'finish',
    update: { source, identity: root.identity, commandDigest: intentCommandDigest(root.intent) },
    outcome: 'aborted',
  }
}
export default {
  participant: 'settings.recovery-plan',
  protocol: FINALIZATION_PLAN.protocol,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_recovery_plan_limit' }
    const request = recoveryRequestSchema.parse(facts['request'])
    const observed = terminalObservationSchema.parse(port.requireFact(TERMINAL_OBSERVATION))
    if (!equal(observed.request, request))
      throw new Error('Settings terminal observation binding mismatch')
    const root = original(port, request)
    const selected = plannedTerminal(port, request, root)
    const terminal = selected.terminal
    const alreadyTerminal = observed.observation.kind === 'terminal'
    if (observed.observation.kind === 'terminal' && !equal(observed.observation.terminal, terminal))
      throw new Error('Settings terminal state mismatch')
    if (terminal !== null && alreadyTerminal !== selected.completed)
      throw new Error('Settings attempt and terminal disagree')
    const effect = selected.completed ? 'recognize' : 'settle'
    if ((terminal === null) !== (observed.observation.kind === 'no-attempt'))
      throw new Error('Settings terminal observation kind mismatch')
    const plan = recoveryPlanSchema.parse({
      request,
      terminal,
      effect,
      source: sourceAction(root, effect),
    })
    port.provideFact(FINALIZATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
