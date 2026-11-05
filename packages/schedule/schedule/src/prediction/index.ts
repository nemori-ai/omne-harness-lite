import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
} from '@omne-harness/schedule-contract'
import { z } from 'zod'
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

const predictionInputSchema = z.strictObject({
  definition: ScheduleDefinitionSchema,
  definitionRevision: z.int().nonnegative(),
  eligibleConsumed: z.int().nonnegative(),
  acceptedJobCount: z.int().nonnegative(),
  after: ScheduleInstantSchema,
  activationExclusive: ScheduleInstantSchema.nullable(),
  count: z.int().min(1).max(100),
})
const definitionEnvelopeSchema = z.object({ context: ScheduleCallContextSchema })
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
    const parsedContext = ScheduleCallContextSchema.safeParse(context)
    const parsedInput = predictionInputSchema.safeParse(input)
    const requestId = parsedContext.success
      ? parsedContext.data.requestId
      : 'schedule.prediction.invalid-context'
    if (!parsedContext.success || !parsedInput.success)
      return {
        kind: 'error',
        error: domainError(
          new PredictionFailure('invalid_input', 'Invalid prediction input'),
          requestId,
        ),
      }
    try {
      const { basis, calendar } = await captureBasis(
        parsedContext.data,
        parsedInput.data,
        dependencies,
        budget,
      )
      return {
        kind: 'ok',
        value: await new PredictionPipeline(parsedInput.data, basis, calendar, budget).run(),
      }
    } catch (error) {
      return { kind: 'error', error: domainError(error, requestId) }
    }
  }
  return {
    preview(context, input) {
      return calculate(context, input, new PredictionBudget(dependencies))
    },
    definitions: {
      async resolve(input) {
        const envelope = definitionEnvelopeSchema.safeParse(input)
        if (!envelope.success)
          return {
            kind: 'unavailable',
            error: domainError(
              new PredictionFailure('invalid_input', 'Invalid definition resolution context'),
              'schedule.prediction.invalid-context',
            ),
          }
        const budget = new PredictionBudget(dependencies)
        const { context, referenceExclusive, ...prediction } = input
        const result = await calculate(
          context,
          { ...prediction, after: referenceExclusive, count: 1 },
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
