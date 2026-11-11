import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  finalizationPlanSchema,
  finalizationRequestSchema,
  finalizationTerminalSchema,
  sourceFinalizationResultSchema,
} from './finalization-schema.ts'
import { settleSettingsIntent } from './intent-settlement.ts'
import { readySettingsIntent } from './intent-ready.ts'
import { applySettingsCheckpoint } from './prepared-checkpoint.ts'
import { applySettingsBusinessPlan } from './prepared-business.ts'
import { readSettingsIntent } from './intent-records.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { PARTICIPANT, PROTOCOL, RESULT_FACT } from './schema.ts'
import { equal, json } from './encoding.ts'

function applyPlan(
  port: ParticipantPort,
  plan: ReturnType<typeof finalizationPlanSchema.parse>,
  source: ReturnType<typeof sourceFinalizationResultSchema.parse>,
) {
  if (plan.effect === 'checkpoint') return applySettingsCheckpoint(port, plan.request)
  if (source.result.kind === 'pending') throw new Error('Unexpected pending source result')
  if (plan.effect === 'business') return applySettingsBusinessPlan(port, plan, source.result)
  if (plan.effect === 'prepare') {
    if (!equal(plan.preparation.binding, plan.request.binding))
      throw new Error('Settings preparation plan binding mismatch')
    return { request: plan.request, result: readySettingsIntent(port, plan.preparation) }
  }
  const result =
    plan.effect === 'recognize'
      ? readSettingsIntent(port, plan.request.binding.identity)
      : settleSettingsIntent(port, {
          event:
            plan.request.kind === 'seal'
              ? { kind: 'seal', binding: plan.request.binding }
              : { kind: 'cancel', identity: plan.request.binding.identity },
          source: source.result.kind === 'checked-open' ? { kind: 'none' } : source.result,
        })
  if (result.kind !== 'found')
    throw new Error('Settings finalization did not settle the selected root')
  return result
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const request = finalizationRequestSchema.parse(facts['request'])
    const plan = finalizationPlanSchema.parse(port.requireFact(FINALIZATION_PLAN))
    const terminal = finalizationTerminalSchema.parse(port.requireFact(FINALIZATION_TERMINAL))
    const source = sourceFinalizationResultSchema.parse(port.requireFact(SOURCE_WRITE_FACT))
    if (
      !equal(request, plan.request) ||
      !equal(terminal, { request, terminal: plan.terminal }) ||
      !equal(source.request, request)
    )
      throw new Error('Settings persistence finalization binding mismatch')
    const expected =
      plan.source.kind === 'none'
        ? { kind: 'none' }
        : plan.source.kind === 'check-open'
          ? { kind: 'checked-open', source: plan.source.source }
          : plan.source.kind === 'begin'
            ? { ...plan.source, kind: 'pending' }
            : { ...plan.source, kind: 'finished' }
    if (!equal(source.result, expected))
      throw new Error('Settings persistence source result mismatch')
    const response = json(applyPlan(port, plan, source))
    port.provideFact(RESULT_FACT, response)
    return { kind: 'participated', response }
  },
} satisfies ParticipantModule
