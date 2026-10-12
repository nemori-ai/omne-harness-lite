import { describe, expect, it } from 'vitest'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { LosslessNumber, type ContentBlock } from '@omne-harness-lite/content-blocks'
import type { AssistantMessage } from '@omne-harness-lite/messages'
import type { Usage } from '@omne-harness-lite/call-accounts'
import type { CountingBasis, InputCalibration } from '@omne-harness-lite/model-response'
import {
  openRouterCredentialRedactionConfig,
  type PlanCalibration,
  type PlanInput,
  type PlannedSemantics,
  type InvocationPolicy,
  type TransportAdapter,
  type ReadFacts,
  type DiagnosticEvent,
} from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'

const credential = 'controlled-secret-123456789'
function fixture() {
  const at = '2026-09-28T00:00:00Z'
  const call = parseOpaqueIdentifier('calibration-call', 'ModelCallId')
  const priorBlockId = parseOpaqueIdentifier('calibration-prior-text', 'BlockId')
  const priorMessageId = parseOpaqueIdentifier('calibration-prior-message', 'MessageId')
  const resultBlockId = parseOpaqueIdentifier('calibration-result-text', 'BlockId')
  if (
    !('ok' in call) ||
    !('ok' in priorBlockId) ||
    !('ok' in priorMessageId) ||
    !('ok' in resultBlockId)
  )
    throw new Error('fixture identity')

  const binding: PlanInput['snapshot']['adaptation'] = {
    implementation: { name: 'teaching', revision: 'one' },
    definition: { modelId: 'teaching/model', revision: 'one' },
    configuration: { revision: 'one', values: { teaching: 'private-configuration' } },
  }
  const basis: CountingBasis = {
    binding,
    model: 'teaching/model',
    provider: 'openai',
    tokenizerRevision: 'fixture-v1',
    meterRevision: 'fixture-v1',
    projectionRevision: 'fixture-v1',
    replayRevision: 'fixture-v1',
    transformRevision: 'fixture-v1',
  }
  const priorBlock = {
    id: priorBlockId.ok,
    kind: 'text',
    text: 'previous reply',
    visibility: { toHuman: true, toModel: true },
  } satisfies ContentBlock

  const previous: AssistantMessage = {
    id: priorMessageId.ok,
    type: 'assistant',
    response: 'calibration-prior-response',
    createdAt: at,
    ending: 'complete',
    blocks: [priorBlock],
  }
  const priorUsage: Usage = {
    input_tokens: 9,
    output_tokens: 1,
    cache_read_tokens: 2,
    cache_write_tokens: 'unknown',
    source: 'upstream',
  }
  const original: InputCalibration = {
    requestInput: {
      kind: 'known',
      projectionRevision: 'fixture-v1',
      prefixBoundary: 1,
      prefixDigest: 'a'.repeat(64),
      inputEnvelopeDigest: 'b'.repeat(64),
      countingBasis: basis,
    },
    observedInput: {
      kind: 'upstream_total',
      tokens: 11,
      provenance: { adapterRevision: 'fixture-v1', fieldPaths: ['usage.prompt_tokens'] },
    },
    outputGroup: {
      kind: 'known',
      projectionRevision: 'fixture-v1',
      source: 'reply',
      blockDigests: ['c'.repeat(64)],
      completeness: 'complete',
      usageRef: 'usage',
    },
  }
  const observation: Extract<PlanCalibration, { kind: 'observation' }> = {
    kind: 'observation',
    inputCalibration: original,
    usage: priorUsage,
    outputBlocks: [priorBlock],
    replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
  }
  const request: PlanInput = {
    calibration: observation,
    outputHistory: [
      {
        inputCalibration: original,
        usage: priorUsage,
        outputBlocks: [priorBlock],
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
        origin: { adaptation: binding, provider: 'openai', parameters: {} },
      },
    ],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: { kind: 'model_call', callId: call.ok, dispatch: 1 },
    routeName: 'teaching/model',
    provider: 'openai',
    parameters: {},
    messages: [previous],
    tools: [],
    snapshot: {
      adaptation: binding,
      providers: ['openai'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 10,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: at,
    },
  }
  const resultBlock: ContentBlock = {
    id: resultBlockId.ok,
    kind: 'text',
    text: 'visible',
    visibility: { toHuman: true, toModel: true },
  }
  const readFacts: ReadFacts = {
    usage: {
      input_tokens: 13,
      output_tokens: 1,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    },
    cost: { cost_usd: 0.125, source: 'upstream_usage' },
    observedInput: {
      kind: 'from_usage',
      provenance: { adapterRevision: 'fixture-v1', fieldPaths: ['usage.prompt_tokens'] },
    },
  }
  const arrivals: readonly ArrivalEvent[] = [
    {
      t: 'open',
      index: 0,
      id: resultBlockId.ok,
      kind: 'text',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
    },
    { t: 'fill', index: 0, payload: 'visible' },
    { t: 'close', index: 0, block: resultBlock },
    { t: 'account', usage: readFacts.usage, cost: readFacts.cost },
  ]

  return { request, observation, original, priorUsage, priorBlock, basis, arrivals, readFacts }
}

const completeOutcome = {
  inputCalibration: {
    requestInput: {
      kind: 'unavailable',
      reason: 'not_retained',
    },
    observedInput: {
      kind: 'from_usage',
      provenance: {
        adapterRevision: 'fixture-v1',
        fieldPaths: ['usage.prompt_tokens'],
      },
    },
    outputGroup: {
      kind: 'known',
      projectionRevision: 'fixture-v1',
      source: 'reply',
      blockDigests: ['dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'],
      completeness: 'complete',
      usageRef: 'usage',
    },
  },
  outcome: 'complete',
  blocks: [
    {
      id: 'calibration-result-text',
      kind: 'text',
      text: 'visible',
      visibility: {
        toHuman: true,
        toModel: true,
      },
    },
  ],
  ending: 'complete',
  timing: {
    sentAt: '2026-09-28T00:00:00Z',
    firstTokenAt: '2026-09-28T00:00:00Z',
    endedAt: '2026-09-28T00:00:00Z',
  },
  usage: {
    input_tokens: 13,
    output_tokens: 1,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: {
    cost_usd: 0.125,
    source: 'upstream_usage',
  },
  routeName: 'teaching/model',
  provider: 'openai',
  adaptation: {
    implementation: {
      name: 'teaching',
      revision: 'one',
    },
    definition: {
      modelId: 'teaching/model',
      revision: 'one',
    },
    configuration: {
      revision: 'one',
      values: {
        teaching: 'private-configuration',
      },
    },
  },
  parameters: {},
}

const planningAccepted = {
  source: 'invocation',
  stage: 'planning',
  outcome: 'accepted',
  binding: {
    implementation: 'teaching',
    implementationRevision: 'one',
    modelId: 'teaching/model',
    definitionRevision: 'one',
    configurationRevision: 'one',
  },
  facts: {
    mode: 'marginal',
    precision: 'exact',
    predictedInput: 12,
    admissionTokens: 12,
    basis: {
      model: 'teaching/model',
      provider: 'openai',
      tokenizerRevision: 'fixture-v1',
      meterRevision: 'fixture-v1',
      projectionRevision: 'fixture-v1',
      replayRevision: 'fixture-v1',
      transformRevision: 'fixture-v1',
    },
    replayContribution: {
      tokens: -2,
      precision: 'exact',
    },
    newContribution: {
      tokens: 3,
      precision: 'exact',
    },
    kind: 'measurement',
    calibrationSource: {
      kind: 'observation',
      observedInputKind: 'upstream_total',
      requestInput: {
        projectionRevision: 'fixture-v1',
        prefixBoundary: 1,
        prefixDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        inputEnvelopeDigest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    },
  },
}

const bindingAccepted = {
  source: 'invocation',
  stage: 'binding',
  outcome: 'accepted',
  binding: {
    implementation: 'teaching',
    implementationRevision: 'one',
    modelId: 'teaching/model',
    definitionRevision: 'one',
    configurationRevision: 'one',
  },
  facts: {
    kind: 'decision',
  },
}

const inputRejection = {
  outcome: {
    rejected: 'invalidInput',
    reason: 'malformed',
  },
  snapshot: {
    blocks: [],
    position: 0,
  },
  observedFacts: {
    unavailable: true,
  },
  counts: {
    plans: 0,
    sends: 0,
    reads: 0,
    stopped: 0,
    factories: 0,
    emitterCloses: 0,
  },
  events: [],
  reports: [],
}

type Fixture = ReturnType<typeof fixture>
type Fault = (value: Fixture, getter: () => unknown) => void

function run(request: PlanInput, returnedFault?: Fault) {
  const data = fixture()
  const counts = { plans: 0, sends: 0, reads: 0, stopped: 0, factories: 0, emitterCloses: 0 }
  const events: DiagnosticEvent[] = []
  const reports: string[] = []
  let captured: PlanInput | undefined
  let rawCaptured: PlanInput | undefined
  let getterCalls = 0
  const transport: TransportAdapter<PlannedSemantics, object> = {
    async plan(input) {
      counts.plans++
      rawCaptured = input
      captured = {
        calibration: input.calibration,
        outputHistory: input.outputHistory,
        tokenMargin: input.tokenMargin,
        target: input.target,
        routeName: input.routeName,
        provider: input.provider,
        snapshot: input.snapshot,
        parameters: input.parameters,
        messages: input.messages,
        tools: input.tools,
      }
      const returned = fixture()
      returnedFault?.(returned, () => {
        getterCalls++
        return null
      })
      const planned: PlannedSemantics = {
        input: returnedFault ? { ...input, calibration: returned.request.calibration } : input,
        parameters: input.parameters,
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
        measurement:
          input.calibration.kind === 'none'
            ? {
                mode: 'full',
                precision: 'estimated',
                predictedInput: 12,
                admissionTokens: 12,
                basis: { ...data.basis, binding: input.snapshot.adaptation },
                fullContribution: { tokens: 12, precision: 'estimated' },
                fallbackReason: input.calibration.reason,
              }
            : {
                mode: 'marginal',
                precision: 'exact',
                predictedInput: 12,
                admissionTokens: 12,
                basis: { ...data.basis, binding: input.snapshot.adaptation },
                replayContribution: { tokens: -2, precision: 'exact' },
                newContribution: { tokens: 3, precision: 'exact' },
              },
      }
      return { planned }
    },
    projectOutput(_planned, input) {
      return {
        projected: {
          kind: 'known',
          projectionRevision: 'fixture-v1',
          source: input.source,
          blockDigests: ['d'.repeat(64)],
          completeness: input.completeness,
          usageRef: 'usage',
        },
      }
    },
    async send() {
      counts.sends++
      return { response: {} }
    },
    async *read() {
      counts.reads++
      try {
        for (const event of data.arrivals) yield event
        return { ended: 'end', readFacts: data.readFacts }
      } finally {
        counts.stopped++
      }
    },
  }
  const policy: InvocationPolicy = {
    now: async () => '2026-09-28T00:00:00Z',
    schedule: () => () => {},
    firstContentTimeoutMs: 10000,
    idleContentTimeoutMs: 10000,
    statusCauseTable: { '503': 'upstream_unavailable' },
    credentialRedaction: openRouterCredentialRedactionConfig,
    diagnostic: event => {
      reports.push(event.kind)
    },
  }
  const handle = invokeModel({
    ...request,
    transport,
    credential,
    signal: new AbortController().signal,
    policy,
    diagnosticEmitterFactory() {
      counts.factories++
      return {
        record(event) {
          events.push(event)
          return {
            recorded: { collectorId: 'calibration-fixture', sequence: String(events.length) },
          }
        },
        close() {
          counts.emitterCloses++
        },
      }
    },
  })
  return {
    handle,
    counts,
    events,
    reports,
    captured: () => captured,
    rawCaptured: () => rawCaptured,
    getterCalls: () => getterCalls,
  }
}

async function expectComplete(actual: ReturnType<typeof run>) {
  expect(await actual.handle.outcome).toStrictEqual(completeOutcome)
  expect(actual.handle.observedFacts()).toStrictEqual({
    facts: {
      inputCalibration: completeOutcome.inputCalibration,
      sentAt: '2026-09-28T00:00:00Z',
      usage: completeOutcome.usage,
      cost: completeOutcome.cost,
    },
  })
  expect(actual.counts).toStrictEqual({
    plans: 1,
    sends: 1,
    reads: 1,
    stopped: 1,
    factories: 1,
    emitterCloses: 1,
  })
  expect(actual.getterCalls()).toBe(0)
  const diagnostics = JSON.stringify([actual.events, actual.reports])
  expect(diagnostics).not.toContain(credential)
  expect(diagnostics).not.toContain('private-configuration')
}

const positiveCases = [
  { id: 'C4B-01', name: 'owns known upstream observation after caller mutation', kind: 'upstream' },
  { id: 'C4B-02', name: 'projects known request with from_usage', kind: 'from_usage' },
  { id: 'C4B-03', name: 'preserves unavailable request and observation', kind: 'unavailable' },
  {
    id: 'C4B-04',
    name: 'omits unavailable request with upstream observation',
    kind: 'request_unavailable',
  },
  { id: 'C4B-05', name: 'preserves no_observation', kind: 'no_observation' },
  { id: 'C4B-06', name: 'preserves source_unavailable', kind: 'source_unavailable' },
] as const

describe('public calibration ownership and diagnostic projection', () => {
  it.each(positiveCases)('$id $name', async ({ kind }) => {
    const data = fixture()
    let request = data.request
    let source: object = planningAccepted.facts.calibrationSource
    let expectedPlanning: object = planningAccepted
    if (kind === 'from_usage') {
      Object.assign(data.original, {
        observedInput: {
          kind: 'from_usage',
          provenance: {
            adapterRevision: 'fixture-v1',
            fieldPaths: ['usage.prompt_tokens'],
          },
        },
      })
      Object.assign(data.priorUsage, { cache_write_tokens: 0 })
      source = { ...planningAccepted.facts.calibrationSource, observedInputKind: 'from_usage' }
    }
    if (kind === 'unavailable' || kind === 'request_unavailable') {
      Object.assign(data.original, {
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
      })
      source = { kind: 'observation', observedInputKind: 'upstream_total' }
      if (kind === 'unavailable') {
        Object.assign(data.original, {
          observedInput: { kind: 'unavailable', reason: 'missing_usage' },
        })
        Object.assign(data.priorUsage, {
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
          source: 'none',
        })
        source = { kind: 'observation', observedInputKind: 'unavailable' }
      }
    }
    expectedPlanning = {
      ...planningAccepted,
      facts: { ...planningAccepted.facts, calibrationSource: source },
    }
    if (kind === 'no_observation' || kind === 'source_unavailable') {
      request = {
        ...request,
        calibration: { kind: 'none', reason: kind },
        messages: [],
        outputHistory: [],
      }
      expectedPlanning = {
        ...planningAccepted,
        facts: {
          kind: 'measurement',
          mode: 'full',
          precision: 'estimated',
          predictedInput: 12,
          admissionTokens: 12,
          basis: planningAccepted.facts.basis,
          fullContribution: { tokens: 12, precision: 'estimated' },
          fallbackReason: kind,
          calibrationSource: { kind: 'none', reason: kind },
        },
      }
    }
    const expectedInput = structuredClone(request)
    const actual = run(request)
    if (kind === 'upstream') {
      Object.assign(data.original.requestInput, { prefixDigest: 'e'.repeat(64) })
      Object.assign(data.original.observedInput, { tokens: 99 })
      Object.assign(data.priorUsage, { input_tokens: 99 })
      Object.assign(data.priorBlock, { text: 'changed by caller' })
      Object.assign(data.observation.replaySelection[0] ?? {}, { blockIndex: 9 })
    }
    await expectComplete(actual)
    expect(actual.reports).toStrictEqual(['model_invocation.stopped'])
    expect(actual.events.filter(event => event.stage === 'binding')).toStrictEqual([
      bindingAccepted,
    ])
    expect(
      actual.events.filter(event => event.stage === 'planning' && event.outcome === 'accepted'),
    ).toStrictEqual([expectedPlanning])
    const projected = JSON.stringify(
      actual.events.filter(event => event.stage === 'binding' || event.stage === 'planning'),
    )
    for (const excluded of [
      'previous reply',
      'countingBasis',
      'provenance',
      'input_tokens',
      'outputBlocks',
      'replaySelection',
      'usage.prompt_tokens',
    ]) {
      expect(projected).not.toContain(excluded)
    }
    const owned = actual.captured()
    expect(owned).toStrictEqual(expectedInput)
    expect(actual.rawCaptured()).not.toBe(request)
    if (kind === 'upstream') {
      if (owned?.calibration.kind !== 'observation') throw new Error('expected owned observation')
      const observation = owned.calibration
      for (const value of [
        observation,
        observation.inputCalibration,
        observation.usage,
        observation.outputBlocks,
        observation.outputBlocks[0],
        observation.replaySelection,
      ]) {
        expect(Object.isFrozen(value)).toBe(true)
      }
      expect(observation.inputCalibration).not.toBe(data.original)
      expect(observation.usage).not.toBe(data.priorUsage)
      expect(observation.outputBlocks[0]).not.toBe(data.priorBlock)
      expect(observation.replaySelection[0]).not.toBe(data.observation.replaySelection[0])
      const history = owned.outputHistory[0]
      expect(history).toBeDefined()
      expect(Object.isFrozen(history?.replaySelection)).toBe(true)
      expect(Object.isFrozen(history?.replaySelection[0])).toBe(true)
    }
  })

  const inputFaults: readonly { id: string; name: string; mutate: Fault }[] = [
    {
      id: 'C4B-07',
      name: 'append duplicate mapping of source0 message0 block0',
      mutate: (d, getter) => {
        Object.assign(d.observation, {
          replaySelection: [
            { sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 },
            { sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 },
          ],
        })
      },
    },
    {
      id: 'C4B-08',
      name: 'sourceBlockIndex equals outputBlocks length1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { sourceBlockIndex: 1 })
      },
    },
    {
      id: 'C4B-09',
      name: 'sourceBlockIndex -1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { sourceBlockIndex: -1 })
      },
    },
    {
      id: 'C4B-10',
      name: 'sourceBlockIndex 0.5',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { sourceBlockIndex: 0.5 })
      },
    },
    {
      id: 'C4B-11',
      name: 'sourceBlockIndex Number.MAX_SAFE_INTEGER+1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, {
          sourceBlockIndex: Number.MAX_SAFE_INTEGER + 1,
        })
      },
    },
    {
      id: 'C4B-12',
      name: 'messageIndex -1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { messageIndex: -1 })
      },
    },
    {
      id: 'C4B-13',
      name: 'messageIndex 0.5',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { messageIndex: 0.5 })
      },
    },
    {
      id: 'C4B-14',
      name: 'messageIndex Number.MAX_SAFE_INTEGER+1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, {
          messageIndex: Number.MAX_SAFE_INTEGER + 1,
        })
      },
    },
    {
      id: 'C4B-15',
      name: 'blockIndex -1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { blockIndex: -1 })
      },
    },
    {
      id: 'C4B-16',
      name: 'blockIndex 0.5',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { blockIndex: 0.5 })
      },
    },
    {
      id: 'C4B-17',
      name: 'blockIndex Number.MAX_SAFE_INTEGER+1',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, {
          blockIndex: Number.MAX_SAFE_INTEGER + 1,
        })
      },
    },
    {
      id: 'C4B-18',
      name: 'replay item null',
      mutate: (d, getter) => {
        Object.assign(d.observation, { replaySelection: [null] })
      },
    },
    {
      id: 'C4B-19',
      name: 'replay item extra property unexpected true',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, { unexpected: true })
      },
    },
    {
      id: 'C4B-20',
      name: 'replay item missing blockIndex',
      mutate: (d, getter) => {
        Object.assign(d.observation, {
          replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0 }],
        })
      },
    },
    {
      id: 'C4B-21',
      name: 'sourceBlockIndex genuine public LosslessNumber zero',
      mutate: (d, getter) => {
        Object.assign(d.observation.replaySelection[0] ?? {}, {
          sourceBlockIndex: new LosslessNumber('0'),
        })
      },
    },
    {
      id: 'C4B-22',
      name: 'replaySelection object instead of array',
      mutate: (d, getter) => {
        Object.assign(d.observation, { replaySelection: {} })
      },
    },
    {
      id: 'C4B-23',
      name: 'observation missing inputCalibration',
      mutate: (d, getter) => {
        Reflect.deleteProperty(d.observation, 'inputCalibration')
      },
    },
    {
      id: 'C4B-24',
      name: 'observation extra field unexpected true',
      mutate: (d, getter) => {
        Object.assign(d.observation, { unexpected: true })
      },
    },
    {
      id: 'C4B-25',
      name: 'outputBlocks object instead of array',
      mutate: (d, getter) => {
        Object.assign(d.observation, { outputBlocks: {} })
      },
    },
    {
      id: 'C4B-26',
      name: 'calibration kind other',
      mutate: (d, getter) => {
        Object.assign(d.observation, { kind: 'other' })
      },
    },
    {
      id: 'C4B-27',
      name: 'prior prefixDigest not lowercase hex64',
      mutate: (d, getter) => {
        Object.assign(d.original.requestInput, { prefixDigest: 'invalid-digest' })
      },
    },
    {
      id: 'C4B-28',
      name: 'prior request projectionRevision differs from countingBasis projectionRevision',
      mutate: (d, getter) => {
        Object.assign(d.original.requestInput, { projectionRevision: 'different' })
      },
    },
    {
      id: 'C4B-29',
      name: 'prior output text block missing text',
      mutate: (d, getter) => {
        Object.assign(d.observation, {
          outputBlocks: [
            { id: d.priorBlock.id, kind: 'text', visibility: d.priorBlock.visibility },
          ],
        })
      },
    },
    {
      id: 'C4B-30',
      name: 'prior usage input_tokens -1',
      mutate: (d, getter) => {
        Object.assign(d.priorUsage, { input_tokens: -1 })
      },
    },
    {
      id: 'C4B-31',
      name: 'prior usage source none with known amounts',
      mutate: (d, getter) => {
        Object.assign(d.priorUsage, { source: 'none' })
      },
    },
    {
      id: 'C4B-32',
      name: 'getter for caller calibration inputCalibration; getter counter0',
      mutate: (d, getter) => {
        Object.defineProperty(d.observation, 'inputCalibration', { get: getter })
      },
    },
    {
      id: 'C4B-33',
      name: 'calibration null',
      mutate: (d, getter) => {
        Object.assign(d.request, { calibration: null })
      },
    },
    {
      id: 'C4B-34',
      name: 'calibration number0',
      mutate: (d, getter) => {
        Object.assign(d.request, { calibration: 0 })
      },
    },
  ]
  it.each(inputFaults)('$id rejects caller $name before ports', async ({ mutate }) => {
    const data = fixture()
    let getterCalls = 0
    mutate(data, () => {
      getterCalls++
      return null
    })
    const untrusted: unknown = data.request
    const actual = run(untrusted as PlanInput)
    expect(await actual.handle.outcome).toStrictEqual(inputRejection.outcome)
    expect(actual.handle.snapshot()).toStrictEqual(inputRejection.snapshot)
    expect(actual.handle.observedFacts()).toStrictEqual(inputRejection.observedFacts)
    expect(actual.counts).toStrictEqual(inputRejection.counts)
    expect(actual.events).toStrictEqual(inputRejection.events)
    expect(actual.reports).toStrictEqual(inputRejection.reports)
    expect(actual.captured()).toBeUndefined()
    expect(getterCalls).toBe(0)
  })

  const returnedFaults: readonly { id: string; name: string; mutate: Fault }[] = [
    {
      id: 'C4B-35',
      name: 'returned plan input.calibration null',
      mutate: (d, getter) => {
        Object.assign(d.request, { calibration: null })
      },
    },
    {
      id: 'C4B-36',
      name: 'returned calibration kind other',
      mutate: (d, getter) => {
        Object.assign(d.observation, { kind: 'other' })
      },
    },
    {
      id: 'C4B-37',
      name: 'returned inputCalibration.observedInput null',
      mutate: (d, getter) => {
        Object.assign(d.original, { observedInput: null })
      },
    },
    {
      id: 'C4B-38',
      name: 'returned inputCalibration.requestInput null',
      mutate: (d, getter) => {
        Object.assign(d.original, { requestInput: null })
      },
    },
    {
      id: 'C4B-39',
      name: 'returned known prior projectionRevision credential exact; align prior countingBasis and outputGroup revisions; safe current basis remains fixture-v1',
      mutate: (d, getter) => {
        Object.assign(d.original.requestInput, { projectionRevision: credential })
        Object.assign(d.basis, { projectionRevision: credential })
        Object.assign(d.original.outputGroup, { projectionRevision: credential })
      },
    },
    {
      id: 'C4B-40',
      name: 'getter returned inputCalibration.observedInput; getter counter0',
      mutate: (d, getter) => {
        Object.defineProperty(d.original, 'observedInput', { get: getter })
      },
    },
    {
      id: 'C4B-41',
      name: 'getter returned inputCalibration.requestInput; getter counter0',
      mutate: (d, getter) => {
        Object.defineProperty(d.original, 'requestInput', { get: getter })
      },
    },
    {
      id: 'C4B-42',
      name: 'getter returned calibration kind; getter counter0',
      mutate: (d, getter) => {
        Object.defineProperty(d.observation, 'kind', { get: getter })
      },
    },
    {
      id: 'C4B-43',
      name: 'returned calibration extra field unexpected true',
      mutate: (d, getter) => {
        Object.assign(d.observation, { unexpected: true })
      },
    },
    {
      id: 'C4B-44',
      name: 'returned calibration symbol-key field',
      mutate: (d, getter) => {
        Object.defineProperty(d.observation, Symbol('unexpected'), { value: true })
      },
    },
  ]
  it.each(returnedFaults)('$id isolates public collaborator fault $name', async ({ mutate }) => {
    const data = fixture()
    const originalInput = structuredClone(data.request)
    const actual = run(data.request, mutate)
    await expectComplete(actual)
    expect(actual.captured()).toStrictEqual(originalInput)
    expect(data.request).toStrictEqual(originalInput)
    expect(actual.reports).toStrictEqual([
      'model_invocation.diagnostic_projection_failed',
      'model_invocation.stopped',
    ])
    expect(actual.events.filter(event => event.stage === 'binding')).toStrictEqual([])
    expect(actual.events.filter(event => event.facts.kind === 'measurement')).toStrictEqual([])
    expect(
      actual.events.filter(event => event.stage === 'planning' && event.outcome === 'accepted'),
    ).toStrictEqual([
      {
        source: 'invocation',
        stage: 'planning',
        outcome: 'accepted',
        facts: { kind: 'decision' },
      },
    ])
  })
})
