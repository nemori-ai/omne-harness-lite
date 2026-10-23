// The measurement rules both family meters share around the calibrated arithmetic: the method
// name of a measurement, the input digest and its calibration condition, the per-unit extra
// tokens, the calibration of a plain `measure`, and the shared meter that uses them. The family
// packages cover the shared meter with their real tokenizers and image rules.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  MeterCalibration,
  ModelCountingBasis,
  ModelInputMeter,
  ModelTextTokenizer,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  ANCHORED_METHOD,
  NO_CALIBRATION,
  calibratedDigest,
  calibratedMethod,
  createCalibratedMeter,
  unitExtras,
  type CalibratedAmount,
  type CalibratedMeterRules,
  type MeteredUnit,
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

describe('createCalibratedMeter', () => {
  /** One unit whose text has a different length in its NFKC form: U+FB01 is `fi`. */
  const units: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'messages', value: { kind: 'array', items: [{ kind: 'string', value: '\uFB01' }] } },
    ],
  }
  const metered: MeasureInput = {
    ...measure,
    representation: { ...measure.representation, tokenInput: units },
  }
  const basis: ModelCountingBasis = {
    supplier,
    meter: METER,
    tokenization: { kind: 'not-used', method: METER },
    prompt: { kind: 'provider-private', estimation: METER },
    projection: METER,
    mediaTransform: METER,
    replay: METER,
    evidence: METER,
  }
  /** Counts one token per UTF-16 code unit of the text it is given. */
  const tokenizer: ModelTextTokenizer = {
    definition: {
      adoption: adoption('tokenizer'),
      implementation: adoption('tokenizer-implementation'),
      vocabulary: adoption('tokenizer-vocabulary'),
      configuration: adoption('tokenizer-configuration'),
    },
    count: segments => ({
      ok: {
        tokens: String(
          segments.reduce(
            (sum, segment) => sum + (segment.kind === 'text' ? segment.text.length : 0),
            0,
          ),
        ),
      },
    }),
  }
  const rules = (
    overrides: Partial<CalibratedMeterRules<MeteredUnit>> = {},
  ): CalibratedMeterRules<MeteredUnit> => ({
    owner: 'family',
    supplier: supplier.adoption,
    adoptions: { meter: METER, representation: REPRESENTATION, media: adoption('media') },
    basis,
    margin: { percent: '0', source: adoption('margin') },
    outputGroup: OUTPUT_GROUP,
    uncountable: 'reasoning-not-countable',
    tokens: { tokenizer, form: 'as-written' },
    contentOf: value => (value.kind === 'object' ? [{ reasoning: false }] : null),
    imageTokens: ({ units: read }) => ({ ok: read.map(() => 0n) }),
    ...overrides,
  })
  const inputAmount = (result: ReturnType<ModelInputMeter['measure']>) =>
    'ok' in result ? result.ok.checks[0]?.measurement.amount : result.failure

  it('refuses another supplier, another representation, pending media and another schema', () => {
    const meter = createCalibratedMeter(rules())
    expect(
      meter.measure({ ...metered, supplier: { ...supplier, adoption: adoption('other') } }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' },
    })
    expect(
      meter.measure({
        ...metered,
        representation: { ...metered.representation, adoption: adoption('other') },
      }),
    ).toEqual({ failure: { kind: 'unsupported', field: 'representation', adapter: METER } })
    const reference = {
      storage: 'tests',
      key: 'image-1',
      mediaType: 'image/png',
      bytes: '1',
      digest: '0'.repeat(64),
    }
    expect(
      meter.measure({
        ...metered,
        representation: {
          kind: 'pending-media',
          adoption: REPRESENTATION,
          tokenInput: units,
          media: [],
          references: [reference],
        },
      }),
    ).toEqual({ failure: { kind: 'unsupported', field: 'representation.kind', adapter: METER } })
    expect(createCalibratedMeter(rules({ contentOf: () => null })).measure(metered)).toEqual({
      failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' },
    })
  })

  it('counts the text as written, or its NFKC form when the family asks for it', () => {
    const written = writeJsonText(units)
    expect(written.normalize('NFKC').length).toBe(written.length + 1)
    expect(inputAmount(createCalibratedMeter(rules()).measure(metered))).toBe(
      String(written.length),
    )
    expect(
      inputAmount(
        createCalibratedMeter(rules({ tokens: { tokenizer, form: 'nfkc' } })).measure(metered),
      ),
    ).toBe(String(written.length + 1))
  })

  it('reports the anchor verdict only for a calibration with an anchor, and names the anchored method', () => {
    const meter = createCalibratedMeter(rules())
    const plain = meter.measure(metered)
    expect('ok' in plain && plain.ok.calibration).toBe(undefined)
    expect('ok' in plain && plain.ok.counting).toEqual([basis])
    const hit = meter.measureCalibrated(metered, anchored('100'))
    if (!('ok' in hit)) throw new Error('the anchored measurement failed')
    expect(hit.ok.calibration).toEqual({ anchor: { kind: 'hit' } })
    expect(hit.ok.checks[0]?.measurement).toEqual({
      kind: 'estimate',
      amount: '100',
      margin: '0',
      method: { ...METER, name: `${METER.name}+${ANCHORED_METHOD}` },
      marginSource: adoption('margin'),
    })
  })

  it('refuses a supplier whose adoption differs from the record in any one field', () => {
    const meter = createCalibratedMeter(rules())
    for (const field of ['owner', 'name', 'revision', 'digest'] as const)
      expect(
        meter.measure({
          ...metered,
          supplier: {
            ...supplier,
            adoption: { ...supplier.adoption, [field]: `${supplier.adoption[field]}-other` },
          },
        }),
      ).toEqual({ failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-meter' } })
  })

  const other = adoption('other-supplier')
  const evidence = adoption('evidence')
  const withContext = (context: MeasureInput['context']): MeasureInput => ({ ...metered, context })

  it('bounds the request input by the window less the output limit, with the upstream limit of this supplier', () => {
    const measured = createCalibratedMeter(rules()).measure(
      withContext({
        window: {
          provided: '1000',
          upstream: [
            { supplier: other, limit: { kind: 'finite', amount: '5', source: evidence } },
            {
              supplier: supplier.adoption,
              limit: { kind: 'finite', amount: '900', source: evidence },
            },
          ],
        },
        input: null,
        output: { provided: '100', upstream: [] },
        compactionTriggerPercent: '80',
      }),
    )
    const amount = String(writeJsonText(units).length)
    expect(measured).toMatchObject({ ok: { kind: 'complete' } })
    expect('ok' in measured && measured.ok.checks).toEqual([
      {
        supplier: supplier.adoption,
        metric: 'input-tokens',
        subject: 'request',
        measurement: {
          kind: 'estimate',
          amount,
          margin: '0',
          method: METER,
          marginSource: adoption('margin'),
        },
        limit: '900',
        constraint: {
          profile: measure.profile,
          upstream: { kind: 'finite', amount: '900', source: evidence },
        },
      },
    ])
  })

  it('takes a separate input limit as the bound, and an unknown upstream when none names this supplier', () => {
    const measured = createCalibratedMeter(rules()).measure(
      withContext({
        window: { provided: '1000', upstream: [] },
        input: {
          provided: '500',
          upstream: [{ supplier: other, limit: { kind: 'unlimited', source: evidence } }],
        },
        output: { provided: '100', upstream: [] },
        compactionTriggerPercent: '80',
      }),
    )
    expect('ok' in measured && measured.ok.checks[0]).toMatchObject({
      limit: '500',
      constraint: { profile: measure.profile, upstream: { kind: 'unknown' } },
    })
  })

  it('adds one exact check per image for image-bytes, one for image-count and one for request-bytes, and none for voice', () => {
    const reference = (key: string) => ({
      storage: 'tests',
      key,
      mediaType: 'image/png',
      bytes: '1',
      digest: '0'.repeat(64),
    })
    const image = (key: string, bytes: string) =>
      ({
        reference: reference(key),
        bytes,
        mediaType: 'image/png',
        kind: 'image',
        widthPixels: '1',
        heightPixels: '1',
      }) as const
    const voice = {
      reference: reference('voice-1'),
      bytes: '30',
      mediaType: 'audio/wav',
      kind: 'voice',
      durationMs: '10',
      sampleRate: '8000',
      channels: '1',
    } as const
    const limit = (metric: MeasureInput['limits'][number]['metric'], provided: string) => ({
      metric,
      provided,
      upstream: [
        {
          supplier: supplier.adoption,
          limit: { kind: 'finite', amount: provided, source: evidence },
        } as const,
      ],
    })
    const measured = createCalibratedMeter(rules()).measure({
      ...metered,
      limits: [
        limit('image-bytes', '100'),
        limit('image-count', '4'),
        limit('request-bytes', '64'),
        limit('voice-bytes', '1000'),
        limit('voice-duration-ms', '1000'),
      ],
      representation: {
        ...metered.representation,
        media: [image('image-1', '11'), voice, image('image-2', '12')],
      },
    })
    const exact = (metric: string, subject: string, amount: string, provided: string) => ({
      supplier: supplier.adoption,
      metric,
      subject,
      measurement: { kind: 'exact', amount, method: adoption('media') },
      limit: provided,
      constraint: {
        profile: measure.profile,
        upstream: { kind: 'finite', amount: provided, source: evidence },
      },
    })
    expect('ok' in measured && measured.ok.checks.slice(1)).toEqual([
      exact('image-bytes', 'image-1', '11', '100'),
      exact('image-bytes', 'image-2', '12', '100'),
      exact('image-count', 'request', '2', '4'),
      exact('request-bytes', 'request', '7', '64'),
    ])
  })

  it('reports a failed count as unavailable, with the tokenizer as the dependency', () => {
    const failing: ModelTextTokenizer = {
      ...tokenizer,
      count: () => ({ failure: { kind: 'unsupported-token', name: '<|x|>' } }),
    }
    expect(
      createCalibratedMeter(rules({ tokens: { tokenizer: failing, form: 'as-written' } })).measure(
        metered,
      ),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: 'tokenizer', diagnostic: 'unsupported-token' },
    })
  })

  it('hands the reasoning flags of the family units to the arithmetic: an uncounted reasoning unit is unavailable', () => {
    const meter = createCalibratedMeter(rules({ contentOf: () => [{ reasoning: true }] }))
    expect(meter.measure(metered)).toEqual({
      failure: { kind: 'unavailable', dependency: 'family', diagnostic: 'reasoning-not-countable' },
    })
  })
})
