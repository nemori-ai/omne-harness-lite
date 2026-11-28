import type {
  DecisionAnswer,
  DecisionAnswers,
  DecisionAsk,
  DecisionJson,
  DecisionQuestion,
  DecisionState,
  DecisionsModelRequest,
} from '@omne-harness/model-contract'
import type { ModelDecisionPreparation } from '@omne-harness/model-contract/provider'
import { expectTypeOf, it } from 'vitest'

it('a decision ask is one material and named questions of three types', () => {
  expectTypeOf<DecisionAsk['state']>().toEqualTypeOf<DecisionState>()
  expectTypeOf<DecisionAsk['questions'][string]>().toEqualTypeOf<DecisionQuestion>()
  expectTypeOf<DecisionQuestion['type']>().toEqualTypeOf<'noul' | 'choice' | 'score'>()
  expectTypeOf<DecisionState>().toExtend<DecisionJson>()
  expectTypeOf<number>().not.toExtend<DecisionState>()
})

it('the answers are by the name of their question, and an answer may be a refusal', () => {
  expectTypeOf<DecisionAnswers[string]>().toEqualTypeOf<DecisionAnswer>()
  expectTypeOf<DecisionAnswer['type']>().toEqualTypeOf<'refusal' | 'noul' | 'choice' | 'score'>()
})

it('the preparation forms a decisions request from a model, an ask and its source', () => {
  type Prepare = ModelDecisionPreparation<string>['prepare']
  expectTypeOf<Parameters<Prepare>[0]['ask']>().toEqualTypeOf<DecisionAsk>()
  expectTypeOf<Awaited<ReturnType<Prepare>>>().toExtend<
    { ok: DecisionsModelRequest } | { failure: unknown }
  >()
})
