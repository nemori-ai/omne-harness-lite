import type { JsonValue } from '@omne-harness/json-text'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import {
  createCalibratedMeter,
  type CalibratedMeterRules,
  type MeteredUnit,
  type MeterMargin,
} from '../chat-completions/measurement.ts'
import type { FamilyMeter, MeterUnits, ProjectedRequest } from '../chat-completions/vocabulary.ts'
import { recordAdoption } from '../family-table.ts'
import { componentAdoption, countingBasis } from './adoptions.ts'
import type { GatewayRecord } from './record.ts'

export function str(value: string): JsonValue {
  return { kind: 'string', value }
}

export function obj(members: Readonly<Record<string, JsonValue | undefined>>): JsonValue {
  const entries = Object.entries(members).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value }],
  )
  return { kind: 'object', entries }
}

export function arr(items: readonly JsonValue[]): JsonValue {
  return { kind: 'array', items }
}

export function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

export type GatewayMeterSpec<U extends MeteredUnit> = Readonly<{
  owner: string
  record: GatewayRecord
  tokenizer: ModelTextTokenizer
  margin: MeterMargin
  outputGroup: string
  uncountable: string
  form: 'as-written' | 'nfkc'
  contentOf: CalibratedMeterRules<U>['contentOf']
  imageTokens: CalibratedMeterRules<U>['imageTokens']
  represent(view: ProjectedRequest): Readonly<{ tokenInput: JsonValue; units: MeterUnits }>
}>

/** A calibrated meter whose adoptions are components of the record it meters. */
export function createGatewayMeter<U extends MeteredUnit>(spec: GatewayMeterSpec<U>): FamilyMeter {
  const { owner, record } = spec
  const representation = componentAdoption(owner, record, 'representation')
  const instance = createCalibratedMeter<U>({
    owner,
    supplier: recordAdoption(owner, record),
    adoptions: {
      meter: componentAdoption(owner, record, 'meter'),
      representation,
      media: componentAdoption(owner, record, 'media'),
    },
    basis: countingBasis(owner, record),
    margin: spec.margin,
    outputGroup: spec.outputGroup,
    ...(record.meter.coldRequestTokens === undefined
      ? {}
      : { coldRequestTokens: record.meter.coldRequestTokens }),
    uncountable: spec.uncountable,
    tokens: { tokenizer: spec.tokenizer, form: spec.form },
    contentOf: spec.contentOf,
    imageTokens: spec.imageTokens,
  })
  return Object.freeze({
    instance,
    represent: (view: ProjectedRequest) => ({ adoption: representation, ...spec.represent(view) }),
  })
}
