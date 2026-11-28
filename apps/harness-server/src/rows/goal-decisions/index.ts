import { createGoalDecisions } from '@omne-harness/goal-decisions'
import type { ModelRuntime } from '@omne-harness/model-contract'
import type { ModelDecisionPreparation } from '@omne-harness/model-contract/provider'
import {
  modelDecisionPreparationKey,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { checkedPrincipal } from '../goal/check-subject.ts'
import { goalHolder } from '../goal/holder.ts'

const count = z.number().int().positive()
export const goalDecisionsConfig = z.strictObject({ pollMs: count, deadlineMs: count })

/** The side of goals that knows Model: the decision calls of a judging, made as the work of the session that is judged. */
export const goalDecisionsRow = defineRow({
  row: 'goal-decisions',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [modelRuntimeKey, modelDecisionPreparationKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: goalDecisionsConfig,
  async body(ctx, raw) {
    const policy = goalDecisionsConfig.parse(raw)
    const holder = goalHolder(ctx)
    const decisions = createGoalDecisions<unknown>({
      model: () => ctx.get(modelRuntimeKey) as ModelRuntime<unknown> | undefined,
      preparation: () =>
        ctx.get(modelDecisionPreparationKey) as ModelDecisionPreparation<unknown> | undefined,
      principalOf: checkedPrincipal,
      policy,
      now: () => monotonicClock.now(),
      wait: ms => monotonicClock.after(ms).promise,
    })
    holder.decisions = decisions
    return {
      async stop() {
        if (holder.decisions === decisions) holder.decisions = null
        return { kind: 'settled' }
      },
    }
  },
})
