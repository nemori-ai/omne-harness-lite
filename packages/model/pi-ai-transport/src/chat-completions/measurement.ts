// What both family meters share around the calibrated arithmetic: the calibration of a plain
// `measure`, the method name of a measurement, the input digest and the per-unit extra tokens.
// Pure. A family gives only its own values: the meter adoption, the name of its output-group
// method and the extra tokens of each unit after its image rules.
import { createHash } from 'node:crypto'
import { writeJsonText } from '@omne-harness/json-text'
import type {
  Adoption,
  MeterCalibration,
  ModelInputMeter,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { CalibratedAmount, CalibrationArithmeticInput } from './calibration.ts'

/** The method name suffix of a measurement that the anchor applied to. */
export const ANCHORED_METHOD = 'continuation-anchored/1'

/** The calibration of a plain `measure`: no anchor, no outputs. */
export const NO_CALIBRATION: MeterCalibration = Object.freeze({ anchor: null, outputs: [] })

/**
 * The method of a measurement: the meter adoption, with the output-group method of the family
 * appended when a unit was counted as the output of its source, then `ANCHORED_METHOD` when the
 * anchor applied. Each suffix follows a `+`. Owner, revision and digest stay the meter's.
 */
export function calibratedMethod(
  input: Readonly<{ meter: Adoption; outputGroup: string; amount: CalibratedAmount }>,
): Adoption {
  const { meter, outputGroup, amount } = input
  const suffixes = [
    ...(amount.substituted ? [outputGroup] : []),
    ...(amount.anchor?.kind === 'hit' ? [ANCHORED_METHOD] : []),
  ]
  return suffixes.length === 0
    ? meter
    : Object.freeze({ ...meter, name: `${meter.name}+${suffixes.join('+')}` })
}

/**
 * The `inputDigest` of a measurement: the SHA-256 hex of what the estimate depends on. A
 * calibration enters it only when it carries an anchor or an output, so a plain measurement keeps
 * the digest it had without calibration. A different anchor or output count is a different input.
 */
export function calibratedDigest(
  input: Readonly<{
    measure: Parameters<ModelInputMeter['measure']>[0]
    calibration: MeterCalibration
  }>,
): string {
  const { measure, calibration } = input
  const fixed = {
    profile: measure.profile,
    supplier: measure.supplier,
    context: measure.context,
    limits: measure.limits,
    parameters: measure.parameters,
    representation: {
      adoption: measure.representation.adoption,
      tokenInput: writeJsonText(measure.representation.tokenInput),
      media: measure.representation.media,
    },
    calibration:
      calibration.anchor === null && calibration.outputs.length === 0 ? undefined : calibration,
  }
  return createHash('sha256').update(JSON.stringify(fixed)).digest('hex')
}

/**
 * The `extra` of the calibrated arithmetic from the extra tokens of every unit. The arithmetic
 * calls it with the units it counts. Each call asks `perUnit` again and sums the units it names.
 * A unit without an entry adds zero. A failure of `perUnit` is the failure of the call.
 */
export function unitExtras(
  perUnit: () => Outcome<readonly bigint[], TransportFailure>,
): CalibrationArithmeticInput['extra'] {
  return indices => {
    const extras = perUnit()
    if (!('ok' in extras)) return extras
    return { ok: indices.reduce((sum, index) => sum + (extras.ok[index] ?? 0n), 0n) }
  }
}
