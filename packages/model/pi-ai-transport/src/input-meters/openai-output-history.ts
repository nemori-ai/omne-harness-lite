import type {
  FullMeterInput,
  NewMeterInput,
  InputMeter,
  TokenMeasurement,
  MeterContribution,
} from '../input-meter.ts'
import { fullOutputHistory, newOutputHistory, type OutputBodyCounter } from './output-history.ts'
import { OPENAI_56_OUTPUT_POLICY } from './openai-replay.ts'
export function fullOpenAi56History(
  input: FullMeterInput,
  meter: InputMeter,
  countBody: OutputBodyCounter,
): TokenMeasurement {
  return fullOutputHistory(input, meter, countBody, OPENAI_56_OUTPUT_POLICY)
}
export function newOpenAi56History(
  input: NewMeterInput,
  meter: InputMeter,
  countBody: OutputBodyCounter,
): MeterContribution {
  return newOutputHistory(input, meter, countBody, OPENAI_56_OUTPUT_POLICY)
}
