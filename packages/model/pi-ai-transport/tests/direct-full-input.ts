import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type {
  FullMeterInput,
  InputMeter,
  MarginalMeterInput,
  NewMeterInput,
  TokenMeasurement,
  MeterContribution,
} from '@omne-harness-lite/model-request-runtime'
import { countingBasis, projectInput } from '../src/projection.ts'
import { measureFinalInput } from '../src/input-limits.ts'
import { input } from './support.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { testDefinitions } from './definitions.ts'

/** Raw-body unit fixtures have no original response observation or selected history. */
export function fullInputWithoutSource(
  meter: InputMeter,
  raw: Pick<FullMeterInput, 'body' | 'serialized'>,
): FullMeterInput {
  const base = input()
  const binding = {
    ...base.snapshot.adaptation,
    implementation: meter.implementation,
    definition: { modelId: meter.modelId, revision: meter.definitionRevision },
  }
  const request = {
    ...base,
    routeName: meter.modelId,
    provider: meter.provider,
    snapshot: { ...base.snapshot, adaptation: binding },
  }
  return {
    ...raw,
    projection: projectInput(raw.body, request, meter),
    outputHistory: [],
    historySpans: [],
  }
}

export function basisFor(meter: InputMeter) {
  const base = input()
  return countingBasis(
    {
      ...base,
      routeName: meter.modelId,
      provider: meter.provider,
      snapshot: {
        ...base.snapshot,
        adaptation: {
          ...base.snapshot.adaptation,
          implementation: meter.implementation,
          definition: { modelId: meter.modelId, revision: meter.definitionRevision },
        },
      },
    },
    meter,
  )
}

export function directFull(
  meter: InputMeter,
  raw: { readonly body: JsonObject; readonly serialized: string },
): TokenMeasurement {
  return meter.measureFull(fullInputWithoutSource(meter, raw))
}

export function newInputWithoutSource(meter: InputMeter, raw: MarginalMeterInput): NewMeterInput {
  return {
    ...raw,
    unitIndices: raw.units.map((_, index) => raw.precedingUnitCount + index),
    countingBasis: basisFor(meter),
    outputHistory: [],
    historySpans: [],
  }
}

export function directNew(meter: InputMeter, raw: MarginalMeterInput): MeterContribution {
  return meter.measureNew(newInputWithoutSource(meter, raw))
}

export function finalInputWithoutSource(
  args: Omit<
    Parameters<typeof measureFinalInput>[0],
    'projection' | 'outputHistory' | 'historySpans'
  >,
): ReturnType<typeof measureFinalInput> {
  const fixtureDefinition = testDefinitions[0]
  if (!fixtureDefinition) throw new Error('missing fixture definition')
  const fixtureMeter = args.meter ?? syntheticInputMeter(fixtureDefinition, 'openai')
  return measureFinalInput({
    ...args,
    ...fullInputWithoutSource(fixtureMeter, { body: args.body, serialized: args.serialized }),
  })
}
