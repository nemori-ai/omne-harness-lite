import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
} from '@omne-harness/schedule-contract'
import type {
  ScheduleCallContext,
  ScheduleQueryResult,
  SchedulePreviewView,
} from '@omne-harness/schedule-contract'
import type {
  SchedulePredictionDependencies,
  SchedulePredictionInput,
  SchedulePredictionService,
} from './types.ts'
import { PredictionBudget, PredictionFailure, PredictionLimit, domainError } from './budget.ts'
import { captureBasis } from './basis.ts'
import { PredictionPipeline } from './pipeline.ts'
export type * from './types.ts'

function validateInput(context: ScheduleCallContext, input: SchedulePredictionInput): void {
  if (
    !ScheduleCallContextSchema.safeParse(context).success ||
    !ScheduleDefinitionSchema.safeParse(input.definition).success ||
    !ScheduleInstantSchema.safeParse(input.after).success ||
    !ScheduleInstantSchema.nullable().safeParse(input.activationExclusive).success
  )
    throw new PredictionFailure('invalid_input', 'Invalid prediction input')
  for (const number of [input.definitionRevision, input.eligibleConsumed, input.acceptedJobCount])
    if (!Number.isSafeInteger(number) || number < 0)
      throw new PredictionFailure(
        'invalid_input',
        'Revision and counters must be nonnegative safe integers',
      )
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 100)
    throw new PredictionFailure('invalid_input', 'Prediction count must be between 1 and 100')
}
function validateDependencies(dependencies: SchedulePredictionDependencies): void {
  for (const key of [
    'maxCandidates',
    'maxYears',
    'maxExplanations',
    'maxCalendarCalls',
    'timeoutMs',
  ] as const)
    if (!Number.isSafeInteger(dependencies.limits[key]) || dependencies.limits[key] < 1)
      throw new TypeError(`Prediction ${key} must be a positive safe integer`)
  if (
    dependencies.limits.maxCandidates > 100000 ||
    dependencies.limits.maxYears > 400 ||
    dependencies.limits.timeoutMs > 2147483647
  )
    throw new TypeError('Prediction limits exceed supported bounds')
  if (!dependencies.versions.tzdbVersion || !dependencies.versions.ruleEngineVersion)
    throw new TypeError('Prediction versions must be explicit')
}
export function createSchedulePredictionService(
  dependencies: SchedulePredictionDependencies,
): SchedulePredictionService {
  validateDependencies(dependencies)
  async function calculate(
    context: ScheduleCallContext,
    input: SchedulePredictionInput,
    budget: PredictionBudget,
  ): Promise<ScheduleQueryResult<SchedulePreviewView>> {
    try {
      validateInput(context, input)
      const { basis, calendar } = await captureBasis(context, input, dependencies, budget)
      return {
        kind: 'ok',
        value: await new PredictionPipeline(input, basis, calendar, budget).run(),
      }
    } catch (error) {
      return { kind: 'error', error: domainError(error, context.requestId) }
    }
  }
  return {
    preview(context, input) {
      return calculate(context, input, new PredictionBudget(dependencies))
    },
    definitions: {
      async resolve(input) {
        const budget = new PredictionBudget(dependencies)
        const result = await calculate(
          input.context,
          { ...input, after: input.referenceExclusive, count: 1 },
          budget,
        )
        if (result.kind === 'error') return { kind: 'unavailable', error: result.error }
        if (!result.value.complete)
          return {
            kind: 'unavailable',
            error: domainError(
              new PredictionLimit(result.value.reason ?? 'search_limit'),
              input.context.requestId,
            ),
          }
        try {
          const guard = await budget.read(() =>
            dependencies.basisGuards.prepare({
              context: input.context,
              definition: input.definition,
              basis: result.value.basis,
              referenceExclusive: input.referenceExclusive,
            }),
          )
          if (guard.kind !== 'ok') return guard
          if (typeof guard.value.guardRef !== 'string' || guard.value.guardRef.length === 0)
            throw new PredictionFailure('provider_failure', 'Basis guard returned no reference')
          return {
            kind: 'ok',
            value: {
              kind: 'resolved',
              definition: input.definition,
              basis: result.value.basis,
              next: result.value.candidates[0] ?? null,
              complete: true,
              referenceExclusive: input.referenceExclusive,
              basisGuardRef: guard.value.guardRef,
            },
          }
        } catch (error) {
          return { kind: 'unavailable', error: domainError(error, input.context.requestId) }
        }
      },
    },
  }
}
