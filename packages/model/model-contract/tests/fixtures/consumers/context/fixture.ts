// A context assembler: it consumes the profile, preparation, metering and conversion services of
// the Model contract, declares tools as neutral values and hands a fixed request on. It reads the
// window and the compaction trigger from the winning profile, measures before it prepares, and
// compresses when the input passes the trigger; the preparation and the send measure nothing. It
// imports only the public contract and its neighbours' value packages. Its code receives the
// services and no transport, so it cannot read media; that is a property of its types and imports,
// which the dependency checks and the role trace show, not something these paths observe.
import {
  createScriptedModelProfiles,
  createScriptedModelRequestPreparation,
  createScriptedTransport,
} from '@omne-harness/model-contract/testing'
import type { ModelFault, ProfileResolution, Termination } from '@omne-harness/model-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { prepareRequest, submitRequest, type Prepared, type Services } from './context.ts'
import { triggerLine } from './meter-input.ts'
import {
  basis,
  createConversion,
  createMeter,
  createMeterWith,
  createSender,
  type CountingMeter,
} from './services.ts'
import {
  access,
  adoption,
  callId,
  evidence,
  expect,
  imageBlock,
  profile,
  readFileTool,
  required,
  textBlock,
  userMessage,
  voiceBlock,
  type Principal,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

const COMPLETED: Termination = { kind: 'completed', reason: 'stop' }

/** The services, with a scripted transport behind the preparation, and the counters to read. */
function setup(
  endings: readonly Termination[] = [COMPLETED],
  meter: CountingMeter = createMeter(),
) {
  const transport = createScriptedTransport({
    receipt: {
      supplier: adoption('supplier'),
      representation: adoption('representation'),
      payloadDigest: 'none',
    },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  // The profile that the fixture offers is the one official profile of values.ts. Its factory
  // credential is an explicit input of this fixture, not a default of the public double.
  const profiles = createScriptedModelProfiles<Principal>()
  profiles.setAccess(access, 'allow')
  const resolved: ProfileResolution = {
    kind: 'resolved',
    profile,
    source: evidence('profile'),
    selectable: true,
    reasons: [],
    credential: 'available',
    shadowed: [],
  }
  profiles.setResolution({ ...access, route: profile.identity.route, required }, { ok: resolved })
  profiles.setList(
    { ...access, selected: profile.identity.route, required },
    {
      ok: {
        choices: [resolved],
        selected: { route: profile.identity.route, resolution: resolved },
        source: evidence('choices'),
      },
    },
  )
  const preparation = createScriptedModelRequestPreparation<Principal>({
    transport: transport.transport,
  })
  preparation.setAccess(access, 'allow')
  const [supplier] = profile.definition.suppliers
  preparation.setPlan(
    { ...access, profile, required, parameters: [] },
    {
      ok: {
        suppliers: [
          {
            adoption: supplier.adoption,
            recipient: supplier.recipient,
            model: supplier.model,
            credential: { kind: 'factory' },
          },
        ],
        parameterAdoptions: [],
      },
    },
  )
  const sender = createSender(endings)
  const services: Services = {
    profiles: profiles.profiles,
    preparation: preparation.preparation,
    meter,
    conversion: createConversion(),
    sender,
  }
  return { services, profiles, preparation, meter, transport, sender }
}

const overLimit = (reported: Extract<ModelFault, { cause: 'input-over-limit' }>['reported']) =>
  ({
    kind: 'failed',
    fault: {
      cause: 'input-over-limit',
      diagnostic: 'the upstream refused the input as too long',
      upstreamStatus: '400',
      reported,
    },
  }) satisfies Termination

const run = (services: Services, history: Parameters<typeof prepareRequest>[1]['history']) =>
  prepareRequest(services, { history, tools: [], signal: new AbortController().signal })

function prepared(result: Prepared): Extract<Prepared, { kind: 'prepared' }> {
  expect(result.kind === 'prepared', `the preparation ended as ${result.kind}`)
  return result
}

const short = [userMessage('short', [textBlock('t1', 'hello')])]

async function toolsStayNeutralDeclarations(): Promise<void> {
  const { services } = setup()
  const result = prepared(
    await prepareRequest(services, {
      history: short,
      tools: [readFileTool],
      signal: new AbortController().signal,
    }),
  )
  expect(result.request.tools.length === 1, 'the tool was lost')
  expect(JSON.stringify(result.request.tools[0]) === JSON.stringify(readFileTool), 'tool changed')
  expect(
    Object.keys(readFileTool).sort().join() === 'argumentsSchema,description,name',
    'a declaration carries more than its name, description and argument schema',
  )
  expect(
    result.request.toolChoice === 'auto',
    `tool choice is ${String(result.request.toolChoice)}`,
  )
}

const SENT_FIELDS = [
  'declarations',
  'fallback',
  'messages',
  'parameterAdoptions',
  'parameters',
  'profile',
  'representation',
  'retryPolicy',
  'source',
  'suppliers',
  'system',
  'toolChoice',
  'tools',
]

async function profileAndMeterFixTheRequest(): Promise<void> {
  const { services, meter, preparation, transport } = setup()
  const result = prepared(await run(services, short))
  const { request } = result
  expect(request.suppliers[0].model === 'model', 'the request names another model')
  expect(request.suppliers[0].credential.kind === 'factory', 'the credential was invented')
  expect(Object.keys(request).sort().join() === SENT_FIELDS.join(), 'the request fields differ')
  const identity = `${request.suppliers[0].recipient}/${request.suppliers[0].model}`
  expect(
    JSON.stringify(request.declarations) ===
      JSON.stringify([{ produces: identity, accepts: [identity], foreignThinking: 'omit' }]),
    'the request does not fix the expanded replay declaration of its supplier',
  )
  expect(request.toolChoice === 'none', 'a request without tools allows tools')
  expect(result.dropped === 0, `the context dropped ${result.dropped} messages of a short input`)
  // The context measured once, before the preparation. A preparation that measured again would
  // count two.
  expect(meter.measured() === 1, `the input was measured ${meter.measured()} times`)
  expect(preparation.calls().length === 1, 'the preparation was not asked once')
  // The preparation closes what it prepared, and only prepares: nothing is materialized or started.
  const counts = transport.counts()
  expect(counts.prepare === 1, `the transport was prepared ${counts.prepare} times`)
  expect(counts.closePrepared === counts.prepare, 'a prepared transport was not closed')
  expect(counts.materialize === 0 && counts.start === 0, 'the preparation went past prepare')
}

async function contextReadsWindowAndTriggerFromTheWinningProfile(): Promise<void> {
  const { services, profiles } = setup()
  const resolution = await services.profiles.resolve({ ...access, route: 'default', required })
  expect('ok' in resolution, 'the profile service refused the route')
  expect(resolution.ok.kind === 'resolved', 'the route did not resolve')
  const { context } = resolution.ok.profile.definition
  expect(context.window.provided === '50', `the window is ${context.window.provided}`)
  expect(context.compactionTriggerPercent === '60', 'the trigger share differs')
  expect(triggerLine(context) === 30n, `the trigger line is ${triggerLine(context)}`)
  // The double hands out a frozen copy of the profile it was given, so the window is compared by
  // its value: it must be the window of the registered profile, not one read from elsewhere.
  expect(
    JSON.stringify(context.window) === JSON.stringify(profile.definition.context.window),
    'the window is not the window of the registered profile',
  )
  // The context read the profile once: the double recorded one business call.
  const reads = profiles.calls().length
  expect(reads === 1, `the profiles were read ${reads} times`)
}

// The system text of this fixture is 9 characters, so the input below holds 9 + the blocks.
async function inputExactlyAtTheTriggerIsNotCompressed(): Promise<void> {
  const { services, meter } = setup()
  const history = [
    userMessage('older', [textBlock('t1', 'a'.repeat(10))]),
    userMessage('newer', [textBlock('t2', 'b'.repeat(11))]),
  ]
  const result = prepared(await run(services, history))
  expect(result.dropped === 0, `an input of 30 tokens lost ${result.dropped} messages`)
  expect(meter.measured() === 1, 'an input at the trigger was measured again')
}

async function imageReferenceStaysAReferenceInThePreparedRequest(): Promise<void> {
  const { services, transport } = setup()
  const history = [userMessage('image', [textBlock('t1', 'look at this'), imageBlock('img1')])]
  const { request } = prepared(await run(services, history))
  const image = request.messages[0]?.blocks.find(part => part.kind === 'image')
  expect(image !== undefined && 'ref' in image, 'the image no longer is a reference')
  expect(image.ref.key === 'img1', 'the reference was lost')
  const counts = transport.counts()
  expect(counts.prepare === 1, `the request was prepared ${counts.prepare} times`)
  expect(counts.materialize === 0, `${counts.materialize} media reads happened while preparing`)
}

async function voiceBlockIsReplacedByItsDerivedText(): Promise<void> {
  const { services } = setup()
  const history = [userMessage('voice', [voiceBlock('v1')])]
  const { request } = prepared(await run(services, history))
  const kinds = request.messages[0]?.blocks.map(part => part.kind).join()
  expect(kinds === 'text', `the message holds ${kinds}`)
  const block = request.messages[0]?.blocks[0]
  expect(block?.kind === 'text' && block.text === 'hello there', 'the derived text is missing')
}

// The input holds 34 tokens: more than the trigger line of 30 and less than the 40 that the input
// may hold. The context compresses on its own policy before it asks for a preparation.
async function inputOverTheTriggerIsCompressedBeforePreparing(): Promise<void> {
  const { services, meter, preparation } = setup()
  const history = [
    userMessage('older', [textBlock('t1', 'older one')]),
    userMessage('middle', [textBlock('t2', 'middle one')]),
    userMessage('newest', [textBlock('t3', 'newest')]),
  ]
  const result = prepared(await run(services, history))
  expect(result.dropped === 1, `the context dropped ${result.dropped} messages`)
  expect(result.request.messages.length === 2, 'the compressed history has another length')
  const newest = result.request.messages[1]?.blocks[0]
  expect(newest?.kind === 'text' && newest.text === 'newest', 'the newest message was not kept')
  expect(meter.measured() === 2, `the context measured ${meter.measured()} times, not twice`)
  // The compressed input is what reached the preparation, and the request carries it.
  const calls = preparation.calls()
  expect(calls.length === 1, `the preparation was asked ${calls.length} times`)
  expect(
    JSON.stringify(calls[0]?.input.assembled.messages) === JSON.stringify(result.request.messages),
    'the request does not carry the messages that the context assembled',
  )
}

// The input holds 42 tokens, over the 40 that it may hold. The meter reports the count against
// the limit, and the context compresses the same way as it does past the trigger.
async function inputOverTheLimitIsCompressedToo(): Promise<void> {
  const { services, meter } = setup()
  const history = [
    userMessage('older', [textBlock('t1', 'older message')]),
    userMessage('middle', [textBlock('t2', 'middle message')]),
    userMessage('newest', [textBlock('t3', 'newest')]),
  ]
  const result = prepared(await run(services, history))
  expect(result.dropped === 1, `the context dropped ${result.dropped} messages`)
  expect(meter.measured() === 2, `the context measured ${meter.measured()} times, not twice`)
}

// The meter reports what it counted; it is the context that finds one message of 54 tokens over
// the 40 that the profile can hold and stops. The preparation stand-in takes whatever it is
// handed, so an input that reaches it is prepared and counted: the count shows that the context
// stopped on its own.
async function inputThatStaysOverTheLimitIsTooLarge(): Promise<void> {
  const { services, preparation, transport } = setup()
  const history = [
    userMessage('large1', [textBlock('t1', 'x'.repeat(30))]),
    userMessage('large2', [textBlock('t2', 'y'.repeat(45))]),
  ]
  const result = await run(services, history)
  expect(result.kind === 'too-large', `the preparation ended as ${result.kind}`)
  expect(result.dropped === 1, `the context dropped ${result.dropped} messages before giving up`)
  expect(result.amount === '54' && result.limit === '40', 'the report holds other figures')
  const handed = preparation.calls().length
  expect(handed === 0, `the rejected input was handed to the preparation ${handed} times`)
  expect(transport.counts().prepare === 0, 'a transport was prepared for a rejected input')
}

const unavailableMeter = () =>
  createMeterWith(() =>
    fail({
      kind: 'unavailable',
      dependency: 'tokenizer',
      diagnostic: 'the vocabulary is not loaded',
    }),
  )

// A meter that has not measured the input: its answer is a named failure, not a count. The
// context does not take that for an input too large; it drops nothing and hands the failure on.
async function meterFailureIsHandedOnWithoutCompression(): Promise<void> {
  const meter = unavailableMeter()
  const { services, preparation } = setup([COMPLETED], meter)
  const result = await run(services, threeMessages)
  expect(result.kind === 'rejected', `the preparation ended as ${result.kind}`)
  expect(
    result.failure.kind === 'unavailable' && result.failure.dependency === 'tokenizer',
    'the failure was changed on the way',
  )
  expect(result.dropped === 0, `the context dropped ${result.dropped} messages on a failed meter`)
  expect(meter.measured() === 1, `the context asked the meter ${meter.measured()} times`)
  expect(preparation.calls().length === 0, 'an unmeasured input was handed to the preparation')
  // Through the submission too: nothing is sent.
  const { services: again, sender } = setup([COMPLETED], unavailableMeter())
  const submitted = await submitRequest(again, submission(threeMessages))
  expect(submitted.kind === 'not-sent', `the submission ended as ${submitted.kind}`)
  expect(submitted.prepared.kind === 'rejected', 'the submission hides the failure of the meter')
  expect(sender.sent().length === 0, 'an unmeasured input was sent')
}

// A complete budget without a check of the input tokens: the meter did not cover the one check
// that the context needs, so the measurement is not finished, and the context does not take the
// input as fitting.
async function budgetWithoutAnInputCheckIsNotPreparedOn(): Promise<void> {
  const meter = createMeterWith(() =>
    succeed({ kind: 'complete', inputDigest: 'none', checks: [], counting: [basis] }),
  )
  const { services, preparation } = setup([COMPLETED], meter)
  const history = [
    userMessage('m0', [textBlock('b0', 'x'.repeat(40))]),
    userMessage('m1', [textBlock('b1', 'y'.repeat(40))]),
  ]
  const result = await run(services, history)
  expect(result.kind === 'unmeasured', `the preparation ended as ${result.kind}`)
  expect(result.dropped === 0, `the context dropped ${result.dropped} messages without a count`)
  expect(meter.measured() === 1, `the context asked the meter ${meter.measured()} times`)
  expect(preparation.calls().length === 0, 'an unmeasured input was handed to the preparation')
}

const submission = (history: Parameters<typeof prepareRequest>[1]['history']) => {
  let next = 0
  return {
    history,
    tools: [],
    signal: new AbortController().signal,
    newCall: () => callId(`call${(next += 1)}`),
  }
}

const threeMessages = [
  userMessage('one', [textBlock('t1', 'one')]),
  userMessage('two', [textBlock('t2', 'two')]),
  userMessage('three', [textBlock('t3', 'three')]),
]

// The Model sent the input and the upstream refused it as too long. The Model does not send it
// again and does not choose another route; the finished call hands the fault to the context.
async function inputOverTheLimitAfterSendingIsCompressedAndSentAsNewCall(): Promise<void> {
  const reported = { metric: 'context-tokens', limit: '50', actual: '61' } as const
  const { services, sender, preparation, transport } = setup([overLimit(reported), COMPLETED])
  const result = await submitRequest(services, submission(threeMessages))
  expect(result.kind === 'settled', `the submission ended as ${result.kind}`)
  expect(result.termination.kind === 'completed', 'the second call did not complete')
  const [first, second] = result.calls
  expect(result.calls.length === 2, `the context sent ${result.calls.length} calls`)
  expect(first !== second, 'the compressed input was sent under the identity of the refused one')
  const [before, after] = result.requests
  expect(before?.messages.length === 3, 'the first request did not hold the whole history')
  expect(after?.messages.length === 2, `the second request holds ${after?.messages.length}`)
  expect(
    JSON.stringify(before?.messages) !== JSON.stringify(after?.messages),
    'the same input was sent again',
  )
  expect(sender.sent().length === 2, 'the sender saw another number of calls')
  // Each request was formed from the input that the context assembled for it.
  const calls = preparation.calls()
  expect(calls.length === 2, `the preparation was asked ${calls.length} times`)
  expect(
    JSON.stringify(calls[1]?.input.assembled.messages) === JSON.stringify(after?.messages),
    'the compressed request does not carry the messages that the context assembled',
  )
  const counts = transport.counts()
  expect(
    counts.prepare === 2 && counts.closePrepared === 2,
    'each prepared transport is closed once',
  )
  expect(counts.materialize === 0 && counts.start === 0, 'the preparation went past prepare')
}

async function inputThatStaysOverTheLimitAfterSendingIsGivenUp(): Promise<void> {
  const none = { metric: null, limit: null, actual: null } as const
  const { services, sender } = setup([overLimit(none), overLimit(none), overLimit(none)])
  const result = await submitRequest(services, submission(threeMessages.slice(0, 2)))
  expect(result.kind === 'gave-up', `the submission ended as ${result.kind}`)
  expect(result.calls.length === 2, `the context sent ${result.calls.length} calls`)
  expect(sender.sent().length === 2, 'a call was sent for a single message that was refused')
}

async function failureOfAnotherCauseIsHandedOnWithoutCompression(): Promise<void> {
  const unavailable: Termination = {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'down', upstreamStatus: '503' },
  }
  const { services, sender } = setup([unavailable, COMPLETED])
  const result = await submitRequest(services, submission(threeMessages))
  expect(result.kind === 'settled', `the submission ended as ${result.kind}`)
  expect(result.termination === unavailable, 'the failure was changed on the way')
  expect(sender.sent().length === 1, 'the context sent again after a failure of another cause')
  expect(result.requests[0]?.messages.length === 3, 'the history was compressed')
}

export const fixture = {
  role: 'context',
  paths: [
    {
      name: 'tools are declared as neutral values and reach the request unchanged',
      kind: 'normal',
      run: toolsStayNeutralDeclarations,
    },
    {
      name: 'the profile and the meter fix a request that carries no budget, and only the context measures',
      kind: 'normal',
      run: profileAndMeterFixTheRequest,
    },
    {
      name: 'the context reads the window and the compaction trigger from the winning profile',
      kind: 'normal',
      run: contextReadsWindowAndTriggerFromTheWinningProfile,
    },
    {
      name: 'an input exactly at the compaction trigger is not compressed',
      kind: 'normal',
      run: inputExactlyAtTheTriggerIsNotCompressed,
    },
    {
      name: 'an image reference stays a reference and nothing is materialized while preparing',
      kind: 'normal',
      run: imageReferenceStaysAReferenceInThePreparedRequest,
    },
    {
      name: 'a voice block is replaced by the text that its converter derived',
      kind: 'normal',
      run: voiceBlockIsReplacedByItsDerivedText,
    },
    {
      name: 'an input over the compaction trigger is compressed by the context before preparing',
      kind: 'failure',
      decision:
        'the context compresses with its own policy and re-prepares; the model does not (SPEC.md "档案与请求准备协议": the request assembler judges the input size and compresses before the request)',
      run: inputOverTheTriggerIsCompressedBeforePreparing,
    },
    {
      name: 'an input over the most the profile allows is compressed and measured again',
      kind: 'failure',
      decision:
        'the context compresses with its own policy and re-prepares; the model does not (SPEC.md "档案与请求准备协议": the request assembler judges the input size and compresses before the request)',
      run: inputOverTheLimitIsCompressedToo,
    },
    {
      name: 'an input that stays over the limit is too large and nothing is prepared for it',
      kind: 'failure',
      decision:
        'the context judges the reported count against the limit of the check, reports to its consumer that the input is too large and prepares nothing for it; the meter refuses nothing (SPEC.md "上游限制与提供上限": these judgments belong to the compressor; "档案与请求准备协议": what cannot be satisfied is handled by the original consuming path)',
      run: inputThatStaysOverTheLimitIsTooLarge,
    },
    {
      name: 'a meter that answers a named failure stops the preparation, drops nothing and hands the failure on',
      kind: 'failure',
      decision:
        'the context does not take a failure of the meter for an input too large: it compresses nothing, prepares nothing and hands the failure to its consumer (SPEC.md "上游限制与提供上限": a named failure of the meter must not be taken as satisfied; "可选校准及不可解释的历史": a named unavailable answer does not delete history)',
      run: meterFailureIsHandedOnWithoutCompression,
    },
    {
      name: 'a budget without a check of the input tokens is an unfinished measurement and nothing is prepared on it',
      kind: 'failure',
      decision:
        'the context takes a budget that lacks the input-tokens check as not measured: it neither compresses nor prepares (SPEC.md "档案与请求准备协议": the request assembler verifies the checks that the meter covers, and empty checks do not stand for completion; "上游限制与提供上限": a missing applicable check is not satisfied)',
      run: budgetWithoutAnInputCheckIsNotPreparedOn,
    },
    {
      name: 'an input-over-limit ending after the send is compressed and sent as a new call',
      kind: 'failure',
      decision:
        'the context compresses its history and sends a new call under a new identity; the model neither retries the input nor changes route (SPEC.md "重试与策略": the input-over-limit row)',
      run: inputOverTheLimitAfterSendingIsCompressedAndSentAsNewCall,
    },
    {
      name: 'an input that the upstream still refuses after compression is given up',
      kind: 'failure',
      decision:
        'the context stops sending and reports the failure to its consumer (SPEC.md "故障交接": a failed call goes to the original consuming place; "重试与策略": input-over-limit is not sent again)',
      run: inputThatStaysOverTheLimitAfterSendingIsGivenUp,
    },
    {
      name: 'a failure of another cause is handed on without compression or a new call',
      kind: 'failure',
      decision:
        'the context compresses only on input-over-limit and hands any other failure on (SPEC.md "故障交接": the failure goes to the original consumer by its cause; "重试与策略": a status code alone does not decide the cause)',
      run: failureOfAnotherCauseIsHandedOnWithoutCompression,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
