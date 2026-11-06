import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  FINALIZATION_PLAN,
  FINALIZATION_TERMINAL,
  recoveryPlanSchema,
  recoveryRequestSchema,
  finalizationTerminalSchema,
  sourceFinalizationResultSchema,
} from './finalization-schema.ts'
import { settleSettingsIntent } from './intent-settlement.ts'
import { readSettingsIntent } from './intent-records.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { PARTICIPANT, PROTOCOL, RESULT_FACT } from './schema.ts'
import { equal, json } from './encoding.ts'
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const request = recoveryRequestSchema.parse(facts['request'])
    const plan = recoveryPlanSchema.parse(port.requireFact(FINALIZATION_PLAN))
    const terminal = finalizationTerminalSchema.parse(port.requireFact(FINALIZATION_TERMINAL))
    const source = sourceFinalizationResultSchema.parse(port.requireFact(SOURCE_WRITE_FACT))
    if (
      !equal(request, plan.request) ||
      !equal(terminal, { request, terminal: plan.terminal }) ||
      !equal(source.request, request)
    )
      throw new Error('Settings persistence finalization binding mismatch')
    const expected =
      plan.source.kind === 'none' ? { kind: 'none' } : { ...plan.source, kind: 'finished' }
    if (!equal(source.result, expected))
      throw new Error('Settings persistence source result mismatch')
    const result =
      plan.effect === 'recognize'
        ? readSettingsIntent(port, request.binding.identity)
        : settleSettingsIntent(port, {
            event:
              request.kind === 'seal'
                ? { kind: 'seal', binding: request.binding }
                : { kind: 'cancel', identity: request.binding.identity },
            source: source.result,
          })
    if (result.kind !== 'found')
      throw new Error('Settings finalization did not settle the selected root')
    port.provideFact(RESULT_FACT, json(result))
    return { kind: 'participated', response: json(result) }
  },
} satisfies ParticipantModule
