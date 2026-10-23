// The measurement rules both family meters share around the calibrated arithmetic: the method
// name of a measurement, the input digest and its calibration condition, the per-unit extra
// tokens and the calibration of a plain `measure`.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  MeterCalibration,
  ModelInputMeter,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  ANCHORED_METHOD,
  NO_CALIBRATION,
  calibratedDigest,
  calibratedMethod,
  unitExtras,
  type CalibratedAmount,
} from '../src/chat-completions/index.ts'
import {
  REPRESENTATION,
  adoption,
  assembledOf,
  fixedRequest,
  message,
  profileOf,
  testRecord,
  textBlock,
} from './support/chat-record.ts'

const METER = adoption('meter')
const OUTPUT_GROUP = 'family-output-group-estimated/1'

function amountOf(partial: Partial<CalibratedAmount>): CalibratedAmount {
  return { amount: 10n, margin: 1n, anchor: null, substituted: false, ...partial }
}

describe('calibratedMethod', () => {
  it('keeps the meter adoption when no unit was replaced and no anchor applied', () => {
    expect(
      calibratedMethod({ meter: METER, outputGroup: OUTPUT_GROUP, amount: amountOf({}) }),
    ).toBe(METER)
  })

  it('appends the output-group method of the family when a unit was replaced', () => {
    const method = calibratedMethod({
      meter: METER,
      outputGroup: OUTPUT_GROUP,
      amount: amountOf({ substituted: true }),
    })
    expect(method).toEqual({ ...METER, name: `${METER.name}+${OUTPUT_GROUP}` })
  })

  it('appends the anchored suffix on a hit, and nothing on a continuation-shrank miss', () => {
    expect(
      calibratedMethod({
        meter: METER,
        outputGroup: OUTPUT_GROUP,
        amount: amountOf({ anchor: { kind: 'hit' } }),
      }),
    ).toEqual({ ...METER, name: `${METER.name}+continuation-anchored/1` })
    expect(
      calibratedMethod({
        meter: METER,
        outputGroup: OUTPUT_GROUP,
        amount: amountOf({ anchor: { kind: 'miss', reason: 'continuation-shrank' } }),
      }),
    ).toBe(METER)
  })

  it('writes the output-group method before the anchored suffix, and keeps owner, revision and digest', () => {
    const method = calibratedMethod({
      meter: METER,
      outputGroup: OUTPUT_GROUP,
      amount: amountOf({ substituted: true, anchor: { kind: 'hit' } }),
    })
    expect(method).toEqual({
      owner: METER.owner,
      name: `${METER.name}+${OUTPUT_GROUP}+${ANCHORED_METHOD}`,
      revision: METER.revision,
      digest: METER.digest,
    })
    expect(Object.isFrozen(method)).toBe(true)
  })
})

type MeasureInput = Parameters<ModelInputMeter['measure']>[0]

const record = testRecord()
const request = fixedRequest(record, {
  messages: [message('u1', 'user', [textBlock('b1', 'one')])],
})
const [U1] = request.messages.map(item => item.id)
if (U1 === undefined) throw new Error('fixture id')
const profile = profileOf(record)
const [supplier] = profile.definition.suppliers
const tokenInput: JsonValue = { kind: 'string', value: 'counted' }

const measure: MeasureInput = {
  profile: profile.adoption,
  supplier,
  context: profile.definition.context,
  limits: [],
  assembled: assembledOf(request),
  parameters: [],
  representation: {
    kind: 'materialized',
    adoption: REPRESENTATION,
    tokenInput,
    media: [],
    units: [U1],
    requestBytes: '7',
  },
}

/** The digest of the fixed fields without a calibration member. */
function plainDigest(input: MeasureInput): string {
  const fixed = {
    profile: input.profile,
    supplier: input.supplier,
    context: input.context,
    limits: input.limits,
    parameters: input.parameters,
    representation: {
      adoption: input.representation.adoption,
      tokenInput: writeJsonText(input.representation.tokenInput),
      media: input.representation.media,
    },
  }
  return createHash('sha256').update(JSON.stringify(fixed)).digest('hex')
}

const anchored = (inputTotal: string): MeterCalibration => ({
  anchor: { covered: [U1], inputTotal },
  outputs: [],
})

describe('calibratedDigest', () => {
  it('leaves an empty calibration out, so a plain measurement keeps the digest it had without calibration', () => {
    expect(calibratedDigest({ measure, calibration: NO_CALIBRATION })).toBe(plainDigest(measure))
    expect(calibratedDigest({ measure, calibration: { anchor: null, outputs: [] } })).toBe(
      plainDigest(measure),
    )
  })

  it('takes in an anchor or an output count: another anchor or output is another input', () => {
    const plain = calibratedDigest({ measure, calibration: NO_CALIBRATION })
    const anchor100 = calibratedDigest({ measure, calibration: anchored('100') })
    const anchor101 = calibratedDigest({ measure, calibration: anchored('101') })
    const output = calibratedDigest({
      measure,
      calibration: { anchor: null, outputs: [{ message: U1, kind: 'known', outputTokens: '5' }] },
    })
    const withheld = calibratedDigest({
      measure,
      calibration: {
        anchor: null,
        outputs: [{ message: U1, kind: 'withheld', reason: 'source-missing' }],
      },
    })
    expect(new Set([plain, anchor100, anchor101, output, withheld]).size).toBe(5)
  })

  it('does not take in the units side table', () => {
    const { units: _units, ...withoutUnits } = measure.representation
    expect(
      calibratedDigest({
        measure: { ...measure, representation: withoutUnits },
        calibration: NO_CALIBRATION,
      }),
    ).toBe(calibratedDigest({ measure, calibration: NO_CALIBRATION }))
  })
})

describe('unitExtras', () => {
  it('sums the extra tokens of the named units, a unit without an entry adding zero', () => {
    const extra = unitExtras(() => ({ ok: [3n, 5n, 7n] }))
    expect(extra([0, 2])).toEqual({ ok: 10n })
    expect(extra([])).toEqual({ ok: 0n })
    expect(extra([1, 9])).toEqual({ ok: 5n })
  })

  it('asks for the per-unit extras on each call and passes their failure on', () => {
    const failure: Outcome<never, TransportFailure> = {
      failure: {
        kind: 'unavailable',
        dependency: 'family',
        diagnostic: 'image-measurement-missing',
      },
    }
    let calls = 0
    const extra = unitExtras(() => {
      calls += 1
      return failure
    })
    expect(extra([0])).toBe(failure)
    expect(extra([0])).toBe(failure)
    expect(calls).toBe(2)
  })
})

describe('NO_CALIBRATION', () => {
  it('is the frozen empty calibration', () => {
    expect(NO_CALIBRATION).toEqual({ anchor: null, outputs: [] })
    expect(Object.isFrozen(NO_CALIBRATION)).toBe(true)
  })
})
