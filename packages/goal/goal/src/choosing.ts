import { JUDGE_MODELS, type Goals } from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import { done, refused, UNAVAILABLE, UNKNOWN, type createWriting } from './writing.ts'

type Writing = Pick<ReturnType<typeof createWriting>, 'permitted' | 'factsOf'>
const NOT_A_MODEL = {
  entry: null,
  field: 'model',
  problem: `choose one of ${JUDGE_MODELS.join(', ')}, or null for what the tenant has set`,
} as const

/** The decision model a session chooses for the judging of its own goals, over what the tenant has set. Only a person chooses; it holds from the next judging on. */
export function createChoosing(
  deps: GoalsDependencies,
  { permitted, factsOf }: Writing,
): Pick<Goals, 'judgeOf' | 'chooseJudge'> {
  const { store } = deps
  return {
    async judgeOf(caller, { session }) {
      const stop = await permitted(caller, session, 'read')
      if (stop !== null) return stop
      const read = await store.chosen(caller.tenant, session)
      return read.kind === 'unavailable' ? UNAVAILABLE : done(read.value)
    },

    async chooseJudge(caller, { session, model }) {
      const stop = await permitted(caller, session, 'choose-judge')
      if (stop !== null) return stop
      const chosen = model === null ? null : JUDGE_MODELS.find(known => known === model)
      if (chosen === undefined) return refused({ kind: 'invalid', issues: [NOT_A_MODEL] })
      const facts = await factsOf(caller.tenant, session)
      if ('kind' in facts) return facts
      const answer = await store.choose(caller.tenant, session, chosen)
      if (answer.kind === 'unknown') return UNKNOWN
      return answer.kind === 'committed' ? done(chosen) : UNAVAILABLE
    },
  }
}
