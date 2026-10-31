// An author of a provider: the transport, the tokenizer and the meter are written against the
// contract alone, and the conformance suite of `./conformance` decides whether an assembler may adopt
// the transport. The rest of the provider is the scripted one, which stands in for what this author
// did not write. The transport measures nothing; the meter is for the request assembler, which
// calls it before it asks for a preparation.
import type { ModelInputMeter } from '@omne-harness/model-contract'
import {
  checkModelProviderConformance,
  type ConformanceObligation,
  type ConformanceReport,
} from '@omne-harness/model-contract/conformance'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import { createProfileMaintenance } from './author-profile.ts'
import { createAuthorTransport, type TransportDefects } from './author-transport.ts'
import type { SupplierRefusal } from './author-response.ts'
import { createTokenizerOnlyMeter, createWordMeter, type MeterInput } from './author-meter.ts'
import { createWordTokenizer } from './author-tokenizer.ts'
import {
  adoption,
  basis,
  definition,
  expect,
  identity,
  operationOf,
  request,
  supplier,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

const TRANSPORT_OBLIGATIONS: readonly ConformanceObligation[] = [
  'transport-sends-only-at-start',
  'repeated-transport-step-sends-nothing',
  'materialization-receipt-matches-request',
  'fact-stream-ends-once',
  'interruption-is-confirmed',
  'transport-close-is-idempotent',
]

/** Runs the suite with the author's transport in the place of the scripted one. */
function check(
  defects: TransportDefects = {},
  refusal: SupplierRefusal | null = null,
): Promise<ConformanceReport> {
  return checkModelProviderConformance({
    subject: () => {
      const author = createAuthorTransport(defects, refusal)
      return {
        ...createScriptedConformanceSubject(),
        transport: { transport: author.transport, sends: author.sends, request, supplier },
      }
    },
    waitMs: 500,
  })
}

/** The assembler's rule: adopt only a provider that passed every transport obligation. */
function adopts(report: ConformanceReport): boolean {
  return (
    report.ok &&
    TRANSPORT_OBLIGATIONS.every(
      name => report.results.find(result => result.obligation === name)?.status === 'pass',
    )
  )
}

function failingDetail(report: ConformanceReport, name: ConformanceObligation): string {
  const result = report.results.find(item => item.obligation === name)
  expect(result?.status === 'fail', `${name} is ${result?.status ?? 'missing'}`)
  return result.detail
}

async function transportPassesEveryObligation(): Promise<void> {
  const report = await check()
  expect(report.ok, `the suite failed ${report.results.filter(r => r.status === 'fail').length}`)
  for (const name of TRANSPORT_OBLIGATIONS) {
    const status = report.results.find(result => result.obligation === name)?.status
    expect(status === 'pass', `${name} is ${status ?? 'missing'}`)
  }
  expect(adopts(report), 'the assembler did not adopt a transport that passed')
}

async function tokenizerCountsAndNamesWhatItDoesNotKnow(): Promise<void> {
  const tokenizer = createWordTokenizer()
  const counted = tokenizer.count([
    { kind: 'text', text: 'one two  three' },
    { kind: 'special-token', name: '<eos>' },
  ])
  expect('ok' in counted && counted.ok.tokens === '4', 'the tokenizer counted another number')
  const refused = tokenizer.count([{ kind: 'special-token', name: '<mystery>' }])
  expect('failure' in refused, 'an unknown special token was counted')
  expect(
    refused.failure.kind === 'unsupported-token' && refused.failure.name === '<mystery>',
    'the failure does not name the token',
  )
}

/** The input of one measurement: the text to count and whether the media is still a reference. */
function measurement(text: string, media: 'none' | 'pending'): MeterInput {
  const base = {
    adoption: adoption('representation'),
    tokenInput: { kind: 'string', value: text },
    media: [],
  } as const
  return {
    profile: adoption('profile'),
    supplier: { adoption: supplier.adoption, recipient: supplier.recipient, model: supplier.model },
    context: {
      window: { provided: '10', upstream: [] },
      input: null,
      output: { provided: '7', upstream: [] },
      compactionTriggerPercent: '80',
    },
    limits: [],
    assembled: {
      system: [],
      messages: [],
      tools: [],
      toolChoice: 'none',
      parameters: [],
      representation: adoption('representation'),
      source: adoption('source'),
    },
    parameters: [],
    representation:
      media === 'none'
        ? { ...base, kind: 'materialized', requestBytes: '0' }
        : {
            ...base,
            kind: 'pending-media',
            references: [
              { storage: 'store', key: 'image-1', mediaType: 'image/png', bytes: '9', digest: 'd' },
            ],
          },
  }
}

async function meterCountsDefersAndReportsOverLimit(): Promise<void> {
  const meter = createWordMeter(basis)
  const counted = meter.measure(measurement('two words', 'none'))
  expect('ok' in counted, 'the meter refused an input within the limit')
  expect(counted.ok.kind === 'complete' && counted.ok.inputDigest === '2', 'wrong complete budget')
  const check = counted.ok.checks.find(item => item.metric === 'input-tokens')
  expect(check?.measurement.amount === '2' && check.limit === '3', 'the check holds another count')
  const pending = meter.measure(measurement('two words', 'pending'))
  expect('ok' in pending, 'the meter refused an input with pending media')
  expect(pending.ok.kind === 'deferred-media', `the budget is ${pending.ok.kind}`)
  expect(pending.ok.references[0].key === 'image-1', 'the pending reference was lost')
  // An input over the limit is reported, not refused: the check shows the count against the
  // limit, and the assembler judges from it.
  const over = meter.measure(measurement('four words are too many', 'none'))
  expect('ok' in over, `the meter refused an input over the limit: ${JSON.stringify(over)}`)
  const overCheck = over.ok.checks.find(item => item.metric === 'input-tokens')
  expect(
    overCheck?.measurement.amount === '5' && overCheck.limit === '3',
    'the check does not show the count against the limit',
  )
  expect(judge(over, 3n) === 'compress', 'the assembler did not judge the input as over the limit')
}

/**
 * The assembler's rule, applied before it asks for a preparation: it judges the size of the input
 * from a measurement that names the count of input tokens, and from nothing else.
 */
function judge(
  outcome: ReturnType<ModelInputMeter['measure']>,
  trigger: bigint,
): 'keep' | 'compress' | 'unmeasured' {
  if (!('ok' in outcome)) return 'unmeasured'
  const check = outcome.ok.checks.find(item => item.metric === 'input-tokens')
  if (check === undefined) return 'unmeasured'
  return BigInt(check.measurement.amount) > trigger ? 'compress' : 'keep'
}

async function tokenizerCountIsNotAMeasurementOfTheRequest(): Promise<void> {
  const tokenizer = createWordTokenizer()
  const tokenizerOnly = createTokenizerOnlyMeter(tokenizer, basis).measure(
    measurement('two words', 'none'),
  )
  expect('failure' in tokenizerOnly, 'a meter that only has a tokenizer gave a budget')
  expect(
    tokenizerOnly.failure.kind === 'unsupported' || tokenizerOnly.failure.kind === 'unavailable',
    `the meter answered ${tokenizerOnly.failure.kind} and not unsupported or unavailable`,
  )
  // Two words are under a trigger of one word's worth only if the assembler trusted the text count;
  // it does not, so it neither compresses nor takes the input as fitting.
  expect(judge(tokenizerOnly, 1n) === 'unmeasured', 'the assembler judged from a tokenizer count')
  // The rule is not a refusal of everything: a meter with the whole counting basis is judged.
  const whole = createWordMeter(basis)
  expect(judge(whole.measure(measurement('two words', 'none')), 2n) === 'keep', 'not kept at 2')
  expect(
    judge(whole.measure(measurement('two words', 'none')), 1n) === 'compress',
    'not compressed',
  )
}

function refusalOf(
  code: string,
  status: number,
  figures: { limit?: number; actual?: number } = {},
) {
  return { status, body: { code, message: `the supplier refused: ${code}`, ...figures } }
}

/** Runs the author's transport to its end and returns the facts of the stream and the send count. */
async function runToEnd(refusal: SupplierRefusal) {
  const author = createAuthorTransport({}, refusal)
  const signal = new AbortController().signal
  const prepared = await author.transport.prepare(request, supplier, { resent: [] })
  expect('ok' in prepared, 'prepare failed')
  const materialized = await prepared.ok.materialize(signal)
  expect('ok' in materialized, 'materialize failed')
  const facts = []
  for await (const fact of materialized.ok.start(signal)) facts.push(fact)
  await materialized.ok.close()
  await prepared.ok.close()
  const ended = facts.filter(fact => fact.kind === 'ended')
  expect(ended.length === 1, `the stream has ${ended.length} ended facts`)
  return { ended: ended[0], sends: author.sends() }
}

async function supplierOverLimitRefusalEndsAsInputOverLimit(): Promise<void> {
  const given = await runToEnd(refusalOf('context_length_exceeded', 400, { limit: 50, actual: 61 }))
  const termination = given.ended?.termination
  expect(termination?.kind === 'failed', 'the stream did not end failed')
  const { fault } = termination
  expect(fault.cause === 'input-over-limit', `the cause is ${fault.cause}`)
  expect(fault.upstreamStatus === '400', 'the status was not kept as evidence')
  expect(fault.reported.metric === 'context-tokens', 'the metric is not the one named')
  expect(fault.reported.limit === '50' && fault.reported.actual === '61', 'figures differ')
  expect(given.sends === 1, `the transport sent ${given.sends} times`)
  // A supplier that names no figures leaves them null; nothing is counted locally to fill them.
  const silent = await runToEnd(refusalOf('context_length_exceeded', 400))
  const quiet = silent.ended?.termination
  expect(quiet?.kind === 'failed' && quiet.fault.cause === 'input-over-limit', 'not over-limit')
  expect(
    quiet.fault.cause === 'input-over-limit' &&
      quiet.fault.reported.metric === null &&
      quiet.fault.reported.limit === null &&
      quiet.fault.reported.actual === null,
    'a figure that the supplier did not give was filled in',
  )
  // The conformance suite still accepts a transport that ends its stream with this fault.
  const report = await check(
    {},
    refusalOf('context_length_exceeded', 400, { limit: 50, actual: 61 }),
  )
  expect(adopts(report), 'the assembler did not adopt a transport that reports over-limit')
}

async function statusCodeAloneDoesNotMakeAnOverLimitRefusal(): Promise<void> {
  for (const status of [400, 413, 422]) {
    const given = await runToEnd(refusalOf('invalid_request', status))
    const termination = given.ended?.termination
    expect(termination?.kind === 'failed', 'the stream did not end failed')
    expect(
      termination.fault.cause === 'input-rejected',
      `a ${status} with another code is ${termination.fault.cause}`,
    )
    expect(termination.fault.upstreamStatus === String(status), 'the status was changed')
  }
}

/** A maintenance whose clock reads the given instants one after the other, and the caller's access. */
function maintenanceWith(readings: readonly string[]) {
  let next = 0
  const maintenance = createProfileMaintenance(() => {
    const reading = readings[next]
    next += 1
    if (reading === undefined) throw new Error('the clock has no more readings')
    return reading
  })
  const { principal, tenant } = createScriptedConformanceSubject()
  const access = { principal, tenant }
  const change = (name: string, kind: Parameters<typeof maintenance.change>[0]['change']) =>
    maintenance.change({ ...access, operation: operationOf(name), change: kind })
  return { maintenance, change, access }
}

async function maintenanceStampsAProfileFromItsOwnClock(): Promise<void> {
  const { maintenance, change } = maintenanceWith([
    '2026-10-19T08:00:00Z',
    '2026-10-19T09:00:00Z',
    '2026-10-19T09:00:00Z',
  ])
  const created = await change('create', { kind: 'create', identity, definition })
  expect('ok' in created, 'a valid definition was refused')
  expect(created.ok.updatedAt === '2026-10-19T08:00:00Z', 'the time is not the clock reading')
  const revised = await change('revise', {
    kind: 'revise',
    identity,
    expected: created.ok.revision,
    definition,
  })
  expect('ok' in revised, 'a revision with a later time was refused')
  expect(revised.ok.updatedAt === '2026-10-19T09:00:00Z', 'the revision has another time')
  // The same instant is not earlier, so the next change at that instant is kept.
  const withdrawn = await change('withdraw', {
    kind: 'withdraw',
    identity,
    expected: revised.ok.revision,
  })
  expect('ok' in withdrawn, 'a change at the same instant was refused')
  expect(maintenance.current(identity)?.availability === 'withdrawn', 'the withdrawal was lost')
}

type Break = Readonly<{ name: string; field: string; definition: typeof definition }>

const upstreamOf = (amount: string) =>
  [
    { supplier: supplier.adoption, limit: { kind: 'finite', amount, source: adoption('doc') } },
  ] as const

const breaks: readonly Break[] = [
  {
    name: 'a window smaller than the output limit',
    field: 'context.output.provided',
    definition: {
      ...definition,
      context: { ...definition.context, window: { provided: '100', upstream: [] } },
    },
  },
  {
    name: 'a separate input limit larger than the window',
    field: 'context.input.provided',
    definition: {
      ...definition,
      context: { ...definition.context, input: { provided: '2000', upstream: [] } },
    },
  },
  {
    name: 'a window that is not a positive integer',
    field: 'context.window.provided',
    definition: {
      ...definition,
      context: { ...definition.context, window: { provided: '0', upstream: [] } },
    },
  },
  {
    name: 'a provided output above the known upstream value',
    field: 'context.output.upstream',
    definition: {
      ...definition,
      context: {
        ...definition.context,
        output: { provided: '200', upstream: upstreamOf('100') },
      },
    },
  },
  {
    name: 'a trigger of 0 percent',
    field: 'context.compactionTriggerPercent',
    definition: {
      ...definition,
      context: { ...definition.context, compactionTriggerPercent: '0' },
    },
  },
  {
    name: 'a trigger of 101 percent',
    field: 'context.compactionTriggerPercent',
    definition: {
      ...definition,
      context: { ...definition.context, compactionTriggerPercent: '101' },
    },
  },
  {
    name: 'a default output above the output limit',
    field: 'parameters.max-output-tokens',
    definition: { ...definition, parameters: [{ kind: 'max-output-tokens', value: '300' }] },
  },
  {
    name: 'an input without the text modality',
    field: 'input',
    definition: { ...definition, input: ['image'] },
  },
  {
    name: 'an image input without an image byte limit',
    field: 'limits.image-bytes',
    definition: { ...definition, limits: [] },
  },
  {
    name: 'an image byte limit that is not a positive integer',
    field: 'limits.image-bytes.provided',
    definition: { ...definition, limits: [{ metric: 'image-bytes', provided: '0', upstream: [] }] },
  },
  {
    name: 'an image byte limit above the known upstream value',
    field: 'limits.image-bytes.upstream',
    definition: {
      ...definition,
      limits: [{ metric: 'image-bytes', provided: '4096', upstream: upstreamOf('10') }],
    },
  },
  {
    name: 'a metric declared twice',
    field: 'limits.image-bytes',
    definition: { ...definition, limits: [...definition.limits, ...definition.limits] },
  },
]

async function maintenanceRefusesADefinitionThatBreaksARule(): Promise<void> {
  for (const item of breaks) {
    const { maintenance, change } = maintenanceWith([
      '2026-10-19T08:00:00Z',
      '2026-10-19T08:00:00Z',
    ])
    const outcome = await change('create', {
      kind: 'create',
      identity,
      definition: item.definition,
    })
    expect('failure' in outcome, `${item.name} was kept`)
    expect(outcome.failure.kind === 'invalid', `${item.name} gave ${outcome.failure.kind}`)
    expect(
      outcome.failure.field === item.field,
      `${item.name}: fields "${outcome.failure.field}", not "${item.field}"`,
    )
    expect(maintenance.current(identity) === undefined, `${item.name} left a profile behind`)
    // The caller fixes the definition and submits the same change again: it is kept.
    const again = await change('create-again', { kind: 'create', identity, definition })
    expect('ok' in again, `${item.name}: the corrected definition was refused`)
    expect(maintenance.current(identity)?.revision === again.ok.revision, 'the profile is not kept')
  }
  const { change } = maintenanceWith(['2026-10-19T08:00:00Z'])
  const several = await change('create', {
    kind: 'create',
    identity,
    definition: { ...definition, input: ['image'], limits: [] },
  })
  expect('failure' in several && several.failure.kind === 'invalid', 'two breaks were not refused')
  expect(
    several.failure.field === 'input, limits.image-bytes',
    `the fields are "${several.failure.field}", not both broken ones`,
  )
}

async function maintenanceAnswersARepeatedOperationWithItsOriginalResult(): Promise<void> {
  // One reading only: a repeat that read the clock again would run out of readings.
  const { maintenance, change, access } = maintenanceWith(['2026-10-19T08:00:00Z'])
  const first = await change('same', { kind: 'create', identity, definition })
  expect('ok' in first, 'a valid definition was refused')
  // The same change, written with its keys in another order, under the same operation.
  const again = await change('same', { kind: 'create', definition: { ...definition }, identity })
  expect(
    'ok' in again,
    `the repeated operation was refused as ${'failure' in again && again.failure.kind}`,
  )
  expect(again.ok.revision === first.ok.revision, 'the repeat committed a new revision')
  expect(again.ok.updatedAt === first.ok.updatedAt, 'the repeat has another time')
  expect(maintenance.current(identity)?.revision === first.ok.revision, 'the profile moved')
  const inspected = await maintenance.inspect({ ...access, operation: operationOf('same') })
  expect('ok' in inspected && inspected.ok.kind === 'committed', 'the operation is not committed')
  expect(inspected.ok.value.revision === first.ok.revision, 'the inspection shows another result')
  // Another change under the operation that created the profile: a conflict, and nothing changes.
  const other = await change('same', {
    kind: 'revise',
    identity,
    expected: first.ok.revision,
    definition: { ...definition, fallback: true },
  })
  expect('failure' in other, 'another change under a used operation was kept')
  expect(
    other.failure.kind === 'conflict' && other.failure.revision === first.ok.revision,
    `the refusal is ${other.failure.kind}`,
  )
  expect(maintenance.current(identity)?.definition.fallback === false, 'the conflict changed it')
}

async function maintenanceRefusesATimeThatGoesBack(): Promise<void> {
  const { maintenance, change } = maintenanceWith([
    '2026-10-19T09:00:00Z',
    '2026-10-19T08:59:59Z',
    '2026-10-19T08:00:00Z',
    '2026-10-19T09:30:00Z',
  ])
  const created = await change('create', { kind: 'create', identity, definition })
  expect('ok' in created, 'a valid definition was refused')
  const before = JSON.stringify(maintenance.current(identity))
  const revised = await change('revise', {
    kind: 'revise',
    identity,
    expected: created.ok.revision,
    definition: { ...definition, fallback: true },
  })
  expect('failure' in revised, 'a revision with an earlier time was kept')
  expect(
    revised.failure.kind === 'unavailable' && revised.failure.dependency === 'clock',
    `the refusal is ${revised.failure.kind}`,
  )
  expect(JSON.stringify(maintenance.current(identity)) === before, 'the profile changed')
  const withdrawn = await change('withdraw', {
    kind: 'withdraw',
    identity,
    expected: created.ok.revision,
  })
  expect('failure' in withdrawn, 'a withdrawal with an earlier time was kept')
  expect(JSON.stringify(maintenance.current(identity)) === before, 'the withdrawal changed it')
  // The clock is right again: the same revision, tried again, is kept with the new time.
  const retried = await change('revise-again', {
    kind: 'revise',
    identity,
    expected: created.ok.revision,
    definition: { ...definition, fallback: true },
  })
  expect('ok' in retried, 'the revision was refused after the clock was right')
  expect(retried.ok.updatedAt === '2026-10-19T09:30:00Z', 'the retry has another time')
  expect(maintenance.current(identity)?.revision === retried.ok.revision, 'the retry is not kept')
}

async function maintenanceRefusesAClockReadingThatIsNotATime(): Promise<void> {
  const first = maintenanceWith(['not a time'])
  const refusedCreate = await first.change('create', { kind: 'create', identity, definition })
  expect('failure' in refusedCreate, 'a creation at a reading that is not a time was kept')
  expect(
    refusedCreate.failure.kind === 'unavailable' && refusedCreate.failure.dependency === 'clock',
    `the refusal is ${refusedCreate.failure.kind}`,
  )
  expect(first.maintenance.current(identity) === undefined, 'a profile was left behind')

  const { maintenance, change } = maintenanceWith(['2026-10-19T09:00:00Z', '', 'not a time'])
  const created = await change('create', { kind: 'create', identity, definition })
  expect('ok' in created, 'a valid definition was refused')
  const before = JSON.stringify(maintenance.current(identity))
  for (const kind of ['revise', 'withdraw'] as const) {
    const outcome = await change(kind, {
      ...(kind === 'revise' ? { kind, definition: { ...definition, fallback: true } } : { kind }),
      identity,
      expected: created.ok.revision,
    })
    expect('failure' in outcome, `a ${kind} at a reading that is not a time was kept`)
    expect(
      outcome.failure.kind === 'unavailable' && outcome.failure.dependency === 'clock',
      `the ${kind} refusal is ${outcome.failure.kind}`,
    )
    expect(JSON.stringify(maintenance.current(identity)) === before, `the ${kind} changed it`)
  }
}

async function transportThatSendsAtPrepareIsNotAdopted(): Promise<void> {
  const report = await check({ sendsAtPrepare: true })
  expect(!report.ok, 'the suite passed a transport that sends at prepare')
  expect(failingDetail(report, 'transport-sends-only-at-start') !== '', 'the failure has no reason')
  expect(!adopts(report), 'the assembler adopted a transport that sends at prepare')
}

async function transportWhoseStreamNeverEndsIsNotAdopted(): Promise<void> {
  const report = await check({ neverEnds: true })
  expect(!report.ok, 'the suite passed a stream without a termination')
  expect(failingDetail(report, 'fact-stream-ends-once') !== '', 'the failure has no reason')
  expect(!adopts(report), 'the assembler adopted a stream without a termination')
}

export const fixture = {
  role: 'provider-author',
  paths: [
    {
      name: 'a transport written against the contract passes every transport obligation',
      kind: 'normal',
      run: transportPassesEveryObligation,
    },
    {
      name: 'a tokenizer counts text and special tokens and names the token it does not know',
      kind: 'normal',
      run: tokenizerCountsAndNamesWhatItDoesNotKnow,
    },
    {
      name: 'a meter counts words, keeps pending media deferred and reports an input over what the context limits allow for the assembler to judge',
      kind: 'normal',
      run: meterCountsDefersAndReportsOverLimit,
    },
    {
      name: 'a supplier refusal for an over-long input ends the stream as input-over-limit with only the figures the supplier gave',
      kind: 'normal',
      run: supplierOverLimitRefusalEndsAsInputOverLimit,
    },
    {
      name: 'a meter that only has a tokenizer gives no measurement of the request and the assembler does not judge from it',
      kind: 'failure',
      decision:
        'the assembler does not decide compression from a tokenizer count; it takes the input as unmeasured (SPEC.md "分词与完整请求计量": a local token count is not a measurement of the whole request, and an unknown part is not counted as zero)',
      run: tokenizerCountIsNotAMeasurementOfTheRequest,
    },
    {
      name: 'a refusal whose status looks like an over-limit one but whose code is another is not input-over-limit',
      kind: 'failure',
      decision:
        'the transport maps a refusal to input-rejected unless the supplier named the over-limit cause, and keeps the status as evidence (SPEC.md "重试与策略": a status code alone does not decide the cause)',
      run: statusCodeAloneDoesNotMakeAnOverLimitRefusal,
    },
    {
      name: 'a maintenance stamps each successful change with the time of its own clock',
      kind: 'normal',
      run: maintenanceStampsAProfileFromItsOwnClock,
    },
    {
      name: 'a maintenance refuses a definition that breaks a rule of the contract and lists the fields',
      kind: 'failure',
      decision:
        'the maintainer keeps no profile, returns invalid with the fields, and the caller fixes the definition and submits again (SPEC.md "身份、修订及撤回": the definition rules; "档案与请求准备协议": the commit checks the definition)',
      run: maintenanceRefusesADefinitionThatBreaksARule,
    },
    {
      name: 'a maintenance answers a repeated operation with its original result and another change under it with conflict',
      kind: 'failure',
      decision:
        'the caller that lost the answer of a write retries it under the same operation and gets the original result without a new revision; a different change under a used operation is a conflict and changes nothing (SPEC.md "档案与请求准备协议": the same operation, method and normalized input recalls the original result, another input returns conflict)',
      run: maintenanceAnswersARepeatedOperationWithItsOriginalResult,
    },
    {
      name: 'a maintenance refuses a change whose time is earlier than the last change and keeps the profile',
      kind: 'failure',
      decision:
        'the maintainer keeps the profile as it was; the caller cannot give a time, so it tries again after the clock is right (SPEC.md "身份、修订及撤回": updatedAt does not go back, and the refusal is unavailable with dependency clock)',
      run: maintenanceRefusesATimeThatGoesBack,
    },
    {
      name: 'a maintenance refuses a change whose clock reading is not a time and keeps the profile',
      kind: 'failure',
      decision:
        'the maintainer keeps the profile as it was and returns unavailable with dependency clock; the caller cannot repair the reading (SPEC.md "身份、修订及撤回": updatedAt is a time that is compared as a time)',
      run: maintenanceRefusesAClockReadingThatIsNotATime,
    },
    {
      name: 'a transport that sends at prepare fails the suite and is not adopted',
      kind: 'failure',
      decision:
        'the assembler does not adopt the provider until the transport passes (SPEC.md "独立执行与提供者操作": the send starts when start is called, not at prepare; "提供者符合性断言": an adopted provider passes the obligations)',
      run: transportThatSendsAtPrepareIsNotAdopted,
    },
    {
      name: 'a transport whose stream never ends fails the suite and is not adopted',
      kind: 'failure',
      decision:
        'the assembler does not adopt the provider until the transport passes (SPEC.md "独立执行与提供者操作": a stream that ends without a termination is a lost transport, not a completion)',
      run: transportWhoseStreamNeverEndsIsNotAdopted,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
