import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  TERMINAL_OBSERVATION,
  commitRequestSchema,
  terminalObservationSchema,
  businessPlanSchema,
  type BusinessPlan,
} from './finalization-schema.ts'
import { COMMIT_CURRENT, commitCurrentSchema } from './commit-current.ts'
import { SOURCE_READINESS_FACT, sourceReadinessFactSchema } from './source-readiness.ts'
import { readSettingsIntent, intentCommandDigest } from './intent-records.ts'
import { settingsIntentReadiness } from './intent-ready.ts'
import { readStateRecord } from './records.ts'
import { decidePreparedSettingsMutation } from './commit-decision.ts'
import { sourceKey } from './source-retention-records.ts'
import { equal, json, withinBudget } from './encoding.ts'

function preparedRoot(port: ReadPort, request: BusinessPlan['request']) {
  const { binding } = request
  const root = readSettingsIntent(port, binding.identity)
  if (root.kind !== 'found' || root.status.state !== 'open')
    throw new Error('Settings commit requires an open original intent')
  const attempt = root.attempt
  if (
    root.intent.kind !== binding.commandKind ||
    intentCommandDigest(root.intent) !== binding.commandDigest ||
    attempt?.attemptId !== binding.attemptId ||
    (attempt.status.state !== 'prepared' && attempt.status.state !== 'submitted')
  )
    throw new Error('Settings commit preparation binding mismatch')
  return { root, attempt }
}

function sourceAction(
  root: ReturnType<typeof preparedRoot>['root'],
  outcome: BusinessPlan['outcome'],
): BusinessPlan['source'] {
  const source = { domain: root.identity.domain, target: root.identity.operation.target }
  if (root.purpose.kind !== 'source-update')
    return outcome.kind === 'apply' ? { kind: 'check-open', source } : { kind: 'none' }
  if (sourceKey(source) !== root.purpose.sourceKey) throw new Error('Settings source root mismatch')
  return {
    kind: 'finish',
    update: { source, identity: root.identity, commandDigest: intentCommandDigest(root.intent) },
    outcome: outcome.kind === 'apply' ? 'committed' : 'aborted',
  }
}

function decide(
  port: ReadPort,
  request: BusinessPlan['request'],
  current: ReturnType<typeof commitCurrentSchema.parse>,
) {
  const { root } = preparedRoot(port, request)
  if (current.observation.kind === 'unavailable') return { kind: 'unavailable' as const }
  if (current.observation.kind === 'refused')
    return {
      kind: 'planned' as const,
      root,
      outcome: { kind: 'abort-root' as const, reason: current.observation.reason },
    }
  const material = current.observation.material
  const record = readStateRecord(port, root.identity.domain.scope, root.identity.operation.target)
  const outcome = decidePreparedSettingsMutation(root, record, material)
  if (outcome.kind === 'rejected') return { kind: 'unavailable' as const }
  if (outcome.kind !== 'apply') return { kind: 'planned' as const, root, outcome }
  const readiness = settingsIntentReadiness(port, {
    binding: request.binding,
    basis: material.basis,
    standing: material.standing,
    sources: material.sources,
    terminal: { kind: 'open', binding: request.binding },
  })
  if (readiness.kind === 'rejected' && readiness.reason === 'basis_changed')
    return { kind: 'planned' as const, root, outcome: { kind: 'abort-attempt' as const } }
  if (readiness.kind !== 'candidate') return { kind: 'unavailable' as const }
  return { kind: 'planned' as const, root, outcome }
}

function observations(
  port: Parameters<ParticipantModule['execute']>[1],
  request: BusinessPlan['request'],
) {
  const raw = port.requireFact(COMMIT_CURRENT)
  if (!withinBudget(raw)) throw new Error('Settings commit current material exceeds its budget')
  const current = commitCurrentSchema.parse(raw)
  const terminal = terminalObservationSchema.parse(port.requireFact(TERMINAL_OBSERVATION))
  const readiness = sourceReadinessFactSchema.parse(port.requireFact(SOURCE_READINESS_FACT))
  if (
    !equal(current.binding, request.binding) ||
    !equal(terminal.request, request) ||
    !equal(readiness.binding, request.binding)
  )
    throw new Error('Settings commit observation binding mismatch')
  return { current, terminal: terminal.observation, readiness }
}

export default {
  participant: 'settings.commit-plan',
  protocol: FINALIZATION_PLAN.protocol,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_commit_plan_limit' }
    const request = commitRequestSchema.parse(facts['request'])
    const { current, terminal, readiness } = observations(port, request)
    if (terminal.kind !== 'absent')
      return { kind: 'conflict', basis: { reason: 'settings_attempt_terminal' } }
    const decision = decide(port, request, current)
    if (decision.kind === 'unavailable')
      return { kind: 'unsupported', basis: { reason: 'settings_commit_current' } }
    const action = sourceAction(decision.root, decision.outcome)
    if (decision.outcome.kind === 'apply' && readiness.gate.held !== 0)
      return { kind: 'unsupported', basis: { reason: 'settings_source_held' } }
    const plan = businessPlanSchema.parse({
      request,
      effect: 'business',
      source: action,
      outcome: decision.outcome,
      terminal: {
        kind: 'attempt',
        binding: request.binding,
        state: decision.outcome.kind === 'apply' ? 'committed' : 'aborted',
      },
    })
    port.provideFact(FINALIZATION_PLAN, json(plan))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
