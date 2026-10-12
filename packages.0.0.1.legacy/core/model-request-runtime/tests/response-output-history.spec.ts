import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import {
  constructAnchoredInterruption,
  constructAssistantReply,
  constructModelResponse,
  constructPendingModelResponse,
  copyPlanOutputHistory,
  type InvocationObservedFacts,
  type ModelInvocationResult,
  type PlanCalibration,
  type PlanOutputHistoryGroup,
  type ResponseConstructionInput,
} from '../src/index.ts'
import { capture, dispatched, response } from './log-codec-fixture.ts'

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

function validatedMessage(value: unknown): Message {
  const checked = judgeMessage(value)
  if (!('ok' in checked)) throw new Error('message fixture expected')
  return checked.ok
}

const fixture: unknown = response
if (!isResponse(fixture) || fixture.reply === undefined || fixture.timing.sentAt === null)
  throw new Error('complete response fixture expected')
const original = capture('record', dispatched).record
if (original?.kind !== 'model_call_dispatched') throw new Error('dispatched fixture expected')
const message = fixture.reply
const result: ModelInvocationResult = {
  outcome: 'complete',
  ending: 'complete',
  blocks: message.blocks,
  timing: { ...fixture.timing, sentAt: fixture.timing.sentAt },
  inputCalibration: fixture.inputCalibration,
  usage: fixture.usage,
  cost: fixture.cost,
  routeName: 'teaching/model',
  provider: original.provider,
  adaptation: original.adaptation,
  parameters: fixture.route.parameters,
  ...(fixture.route.parameterAdjustments === undefined
    ? {}
    : { parameterAdjustments: fixture.route.parameterAdjustments }),
  ...(fixture.route.droppedParameters === undefined
    ? {}
    : { droppedParameters: fixture.route.droppedParameters }),
}
const input: ResponseConstructionInput = {
  dispatched: original,
  result,
  messageId: message.id,
  firstTokenAt: '2026-09-27T00:00:01Z',
}

function made(value: ReturnType<typeof constructModelResponse>): ModelResponse {
  if (!('response' in value)) throw new Error('response expected')
  return value.response
}

const history: PlanOutputHistoryGroup = {
  inputCalibration: {
    requestInput: {
      kind: 'known',
      projectionRevision: 'fixture-v1',
      prefixBoundary: 1,
      prefixDigest: 'a'.repeat(64),
      inputEnvelopeDigest: 'b'.repeat(64),
      countingBasis: {
        binding: original.adaptation,
        model: 'teaching/model',
        provider: 'first',
        tokenizerRevision: 'fixture-v1',
        meterRevision: 'fixture-v1',
        projectionRevision: 'fixture-v1',
        replayRevision: 'fixture-v1',
        transformRevision: 'fixture-v1',
      },
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
  },
  usage: result.usage,
  outputBlocks: result.blocks,
  replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
  origin: {
    adaptation: original.adaptation,
    provider: original.provider,
    parameters: result.parameters,
  },
}
const none: PlanCalibration = { kind: 'none', reason: 'no_observation' }

describe('SPEC pure response construction from explicit original facts', () => {
  it('constructs complete reply and pending facts without inventing a disposition or late', () => {
    expect(constructAssistantReply(input)).toEqual(message)
    const pending = constructPendingModelResponse(input)
    if (!('pending' in pending)) throw new Error('pending response expected')
    expect(pending.pending).toMatchObject({ id: 'response', reply: message })
    expect(writeJsonLossless(pending.pending.dispatch)).toBe('1.0')
    expect(pending.pending).not.toHaveProperty('replyDisposition')
    expect(pending.pending).not.toHaveProperty('late')
    expect(made(constructModelResponse(input, 'persisted')).replyDisposition).toBe('persisted')
    expect(constructModelResponse(input, null)).toEqual({ rejected: 'invalidInput' })
    for (const disposition of [
      { vetoed: { by: 'moderation', reason: 'explicit' } },
      { consumed: { by: 'compaction' } },
    ] satisfies NonNullable<Parameters<typeof constructModelResponse>[1]>[])
      expect(made(constructModelResponse(input, disposition)).replyDisposition).toEqual(disposition)
  })

  it('keeps truncated and confirmed user interruption distinct from system abandonment', () => {
    const truncated = made(
      constructModelResponse(
        { ...input, result: { ...result, outcome: 'truncated', ending: 'truncated_at_limit' } },
        'persisted',
      ),
    )
    expect(truncated).toMatchObject({
      outcome: 'truncated',
      reply: { ending: 'truncated_at_limit' },
    })
    const interrupted: ModelInvocationResult = {
      ...result,
      outcome: 'interrupted',
      ending: 'interrupted_by_user',
    }
    const confirmed = {
      ...input,
      result: interrupted,
      interruptInitiator: 'user',
    } satisfies ResponseConstructionInput
    expect(made(constructModelResponse(confirmed, 'persisted'))).toMatchObject({
      outcome: 'interrupted',
      initiator: 'user',
      reply: { ending: 'interrupted_by_user' },
    })
    const abandoned = made(constructModelResponse({ ...input, result: interrupted }, null))
    expect(abandoned).toMatchObject({
      outcome: 'interrupted',
      initiator: 'run_cancelled',
      delivered: result.blocks,
    })
    expect(abandoned).not.toHaveProperty('reply')
    const forced = made(constructModelResponse(input, null, true))
    expect(forced).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
    expect(forced).not.toHaveProperty('reply')
  })

  it('preserves failure and delivered facts, without fabricating an assistant ending', () => {
    const { ending: _ending, ...withoutEnding } = result
    const failed: ModelInvocationResult = {
      ...withoutEnding,
      outcome: 'failed',
      failure: { cause: 'interrupted_mid_reply' },
    }
    expect(constructAssistantReply({ ...input, result: failed })).toBeNull()
    const response = made(constructModelResponse({ ...input, result: failed }, null))
    expect(response).toMatchObject({
      outcome: 'failed',
      failure: { cause: 'interrupted_mid_reply' },
      delivered: result.blocks,
    })
    expect(response).not.toHaveProperty('reply')
    expect(
      constructModelResponse({ ...input, result: { ...withoutEnding, outcome: 'failed' } }, null),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it('rejects unknown or reversed opened timestamps and never manufactures a successful unopened reply', () => {
    for (const firstTokenAt of [
      null,
      'not-an-instant',
      '2026-09-26T00:00:00Z',
      '2026-09-28T00:00:00Z',
    ])
      expect(constructModelResponse({ ...input, firstTokenAt }, 'persisted')).toEqual({
        rejected: 'invalidInput',
      })
    expect(constructPendingModelResponse({ ...input, firstTokenAt: null })).toEqual({
      rejected: 'invalidInput',
    })
    expect(
      constructModelResponse(
        {
          ...input,
          result: { ...result, timing: { ...result.timing, endedAt: '2026-09-26T00:00:00Z' } },
        },
        'persisted',
      ),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it('copies exact accounting, original parameter facts and optional transport metadata', () => {
    const actual: ModelInvocationResult = {
      ...result,
      rawHeaders: { 'x-test': ['one', 'two'] },
      upstreamRequestId: 'upstream-request',
      upstreamModel: 'actual-model',
      servingProvider: 'actual-provider',
      stopReason: 'stop',
      trims: {
        merged: 1,
        cut: 0,
        omittedBytes: 0,
        byReason: { rate_merged: 1, frame_too_long: 0, quota_exhausted: 0, rejected: 0 },
      },
    }
    const response = made(constructModelResponse({ ...input, result: actual }, 'persisted'))
    expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000000000000000000000000310')
    expect(response.usage).toEqual(actual.usage)
    expect(response.route.parameters).toEqual(actual.parameters)
    expect(response.route.parameterAdjustments).toEqual(actual.parameterAdjustments)
    expect(response.route.droppedParameters).toEqual(actual.droppedParameters)
    expect(response.route).toMatchObject({
      upstreamModel: 'actual-model',
      servingProvider: 'actual-provider',
      upstreamRequestId: 'upstream-request',
    })
    expect(response.raw?.headers).toEqual(actual.rawHeaders)
    expect(response.trims).toEqual(actual.trims)
    expect(response.stopReason).toBe('stop')
    expect(response.raw?.headers).not.toBe(actual.rawHeaders)
  })

  it('requires an explicit output projection when a retained group changes source', () => {
    const calibrated = { ...result, inputCalibration: history.inputCalibration }
    const changed = { ...input, result: calibrated }
    expect(constructModelResponse(changed, null, true)).toEqual({ rejected: 'invalidInput' })
    expect(
      constructModelResponse(
        { ...changed, projectOutput: () => ({ invalidInput: { reason: 'malformed' } }) },
        null,
        true,
      ),
    ).toEqual({ rejected: 'invalidInput' })
    const seen: Parameters<NonNullable<ResponseConstructionInput['projectOutput']>>[0][] = []
    const response = made(
      constructModelResponse(
        {
          ...changed,
          projectOutput: value => {
            seen.push(value)
            return {
              projected: {
                kind: 'known',
                projectionRevision: 'fixture-v1',
                source: value.source,
                blockDigests: ['c'.repeat(64)],
                completeness: value.completeness,
                usageRef: 'usage',
              },
            }
          },
        },
        null,
        true,
      ),
    )
    expect(seen).toEqual([{ blocks: result.blocks, source: 'delivered', completeness: 'complete' }])
    expect(response.inputCalibration.outputGroup).toMatchObject({
      kind: 'known',
      source: 'delivered',
    })
    expect(
      made(
        constructModelResponse(
          { ...changed, projectOutput: () => ({ unavailable: true }) },
          null,
          true,
        ),
      ).inputCalibration.outputGroup,
    ).toEqual({ kind: 'unavailable', reason: 'not_retained' })
  })

  it('anchors absent send facts to explicit unknown or not-sent, retaining the original parameter triple', () => {
    for (const sendState of ['not_sent', 'send_unknown'] satisfies (
      'not_sent' | 'send_unknown'
    )[]) {
      const response = made(
        constructAnchoredInterruption({
          dispatched: original,
          planned: {
            parameters: result.parameters,
            parameterAdjustments: original.parameterAdjustments,
            droppedParameters: original.droppedParameters,
          },
          observed: null,
          sendState,
          firstTokenAt: null,
          endedAt: result.timing.endedAt,
          initiator: 'runtime_lost',
        }),
      )
      expect(response.timing.sentAt).toBeNull()
      expect(response.usage).toEqual({
        input_tokens: 'unknown',
        output_tokens: 'unknown',
        cache_read_tokens: 'unknown',
        cache_write_tokens: 'unknown',
        source: 'none',
      })
      expect(response.cost).toEqual({ cost_usd: 'unknown', source: 'none' })
      expect(response.inputCalibration).toEqual({
        requestInput: { kind: 'unavailable', reason: sendState },
        observedInput: { kind: 'unavailable', reason: sendState },
        outputGroup: { kind: 'unavailable', reason: sendState },
      })
      expect(response.route.parameters).toEqual(result.parameters)
      expect(response.route.parameterAdjustments).toEqual(original.parameterAdjustments)
      expect(response.route.droppedParameters).toEqual(original.droppedParameters)
    }
    expect(
      constructAnchoredInterruption({
        dispatched: original,
        planned: { parameters: original.parameters },
        observed: null,
        sendState: 'send_unknown',
        firstTokenAt: null,
        endedAt: result.timing.endedAt,
        initiator: 'runtime_lost',
      }),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it('preserves observed original accounting and metadata, but drops retained output evidence', () => {
    const observed: InvocationObservedFacts = {
      sentAt: result.timing.sentAt,
      inputCalibration: history.inputCalibration,
      usage: result.usage,
      cost: result.cost,
      rawHeaders: { X: 'original' },
      upstreamModel: 'actual-model',
      servingProvider: 'actual-provider',
      upstreamRequestId: 'actual-request',
      stopReason: 'stop',
    }
    const response = made(
      constructAnchoredInterruption({
        dispatched: original,
        observed,
        firstTokenAt: input.firstTokenAt,
        endedAt: result.timing.endedAt,
        initiator: 'runtime_lost',
      }),
    )
    expect(response.usage).toEqual(result.usage)
    expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0000000000000000000000000310')
    expect(response.timing.sentAt).toBe(result.timing.sentAt)
    expect(response.inputCalibration.outputGroup).toEqual({
      kind: 'unavailable',
      reason: 'not_retained',
    })
    expect(response.inputCalibration.requestInput).toEqual(history.inputCalibration.requestInput)
    expect(response.route).toMatchObject({
      upstreamModel: 'actual-model',
      servingProvider: 'actual-provider',
      upstreamRequestId: 'actual-request',
    })
    expect(response.raw?.headers).toEqual(observed.rawHeaders)
    expect(response).not.toHaveProperty('reply')
    expect(
      constructAnchoredInterruption({
        dispatched: original,
        observed,
        firstTokenAt: '2026-09-28T00:00:00Z',
        endedAt: result.timing.endedAt,
        initiator: 'runtime_lost',
      }),
    ).toEqual({ rejected: 'invalidInput' })
  })
})

describe('SPEC owned output history preserves source and selected block relationships', () => {
  it('copies and freezes explicit history without authenticating its source', () => {
    const before = writeJsonLossless(history)
    const copied = copyPlanOutputHistory([history], [message], none)
    expect(copied).toEqual([history])
    expect(copied?.[0]).not.toBe(history)
    expect(Object.isFrozen(copied)).toBe(true)
    expect(Object.isFrozen(copied?.[0]?.replaySelection)).toBe(true)
    expect(Object.isFrozen(copied?.[0]?.origin)).toBe(true)
    expect(writeJsonLossless(history)).toBe(before)
    expect(copyPlanOutputHistory([], [message], none)).toEqual([])
  })

  it('rejects malformed, absent, repeated and out-of-order replay targets', () => {
    const first = message.blocks[0]
    if (first === undefined) throw new Error('source block expected')
    const second = validatedMessage({
      ...message,
      blocks: [first, { ...first, id: 'second-block' }],
    })
    for (const replaySelection of [
      [],
      [null],
      [{ sourceBlockIndex: -1, messageIndex: 0, blockIndex: 0 }],
      [{ sourceBlockIndex: 0, messageIndex: 1, blockIndex: 0 }],
      [{ sourceBlockIndex: 1, messageIndex: 0, blockIndex: 0 }],
      [history.replaySelection[0], history.replaySelection[0]],
      [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0, extra: true }],
    ])
      expect(
        copyPlanOutputHistory([{ ...history, replaySelection }], [second], none),
      ).toBeUndefined()
    const ordered = {
      ...history,
      outputBlocks: second.blocks,
      replaySelection: [
        { sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 },
        { sourceBlockIndex: 1, messageIndex: 0, blockIndex: 1 },
      ],
      inputCalibration: {
        ...history.inputCalibration,
        outputGroup: {
          kind: 'known',
          projectionRevision: 'fixture-v1',
          source: 'reply',
          blockDigests: ['c'.repeat(64), 'd'.repeat(64)],
          completeness: 'complete',
          usageRef: 'usage',
        },
      },
    } satisfies PlanOutputHistoryGroup
    expect(copyPlanOutputHistory([ordered], [second], none)).toEqual([ordered])
    expect(
      copyPlanOutputHistory(
        [{ ...ordered, replaySelection: [...ordered.replaySelection].reverse() }],
        [second],
        none,
      ),
    ).toBeUndefined()
    expect(copyPlanOutputHistory([history, history], [message], none)).toBeUndefined()
    const later = {
      ...history,
      replaySelection: [{ sourceBlockIndex: 0, messageIndex: 1, blockIndex: 0 }],
    }
    expect(copyPlanOutputHistory([history, later], [message, message], none)).toEqual([
      history,
      later,
    ])
    expect(copyPlanOutputHistory([later, history], [message, message], none)).toBeUndefined()
  })

  it('requires selected source and destination blocks to match and remain model-visible', () => {
    const block = result.blocks[0]
    if (block === undefined || block.kind !== 'text') throw new Error('text block expected')
    expect(
      copyPlanOutputHistory(
        [history],
        [validatedMessage({ ...message, blocks: [{ ...block, text: 'changed' }] })],
        none,
      ),
    ).toBeUndefined()
    expect(
      copyPlanOutputHistory(
        [history],
        [
          validatedMessage({
            ...message,
            blocks: [{ ...block, visibility: { ...block.visibility, toModel: false } }],
          }),
        ],
        none,
      ),
    ).toBeUndefined()
    for (const outputBlocks of [[], [block, block]])
      expect(copyPlanOutputHistory([{ ...history, outputBlocks }], [message], none)).toBeUndefined()
  })

  it('rejects incomplete history shapes and non-data inputs without invoking getters', () => {
    let reads = 0
    const hostile = Object.defineProperty({}, 'origin', {
      enumerable: true,
      get() {
        reads++
        return history.origin
      },
    })
    for (const raw of [
      null,
      {},
      hostile,
      { ...history, extra: true },
      { ...history, origin: null },
      { ...history, usage: {} },
      { ...history, inputCalibration: null },
    ])
      expect(copyPlanOutputHistory([raw], [message], none)).toBeUndefined()
    expect(copyPlanOutputHistory(null, [message], none)).toBeUndefined()
    expect(Reflect.apply(copyPlanOutputHistory, undefined, [[history], [{}], none])).toBeUndefined()
    expect(reads).toBe(0)
  })

  it('rejects origin metadata and count-basis contradictions instead of cloning them', () => {
    for (const origin of [
      { ...history.origin, provider: '' },
      { ...history.origin, provider: 'different' },
      { ...history.origin, adaptation: {} },
      { ...history.origin, parameters: null },
      { ...history.origin, extra: true },
      { ...history.origin, servingProvider: '' },
      { ...history.origin, upstreamModel: 1 },
    ])
      expect(copyPlanOutputHistory([{ ...history, origin }], [message], none)).toBeUndefined()
    const requested = history.inputCalibration.requestInput
    if (requested.kind !== 'known') throw new Error('known source expected')
    for (const countingBasis of [
      { ...requested.countingBasis, model: 'different/model' },
      {
        ...requested.countingBasis,
        binding: {
          ...original.adaptation,
          configuration: { ...original.adaptation.configuration, revision: 'different' },
        },
      },
    ])
      expect(
        copyPlanOutputHistory(
          [
            {
              ...history,
              inputCalibration: {
                ...history.inputCalibration,
                requestInput: { ...requested, countingBasis },
              },
            },
          ],
          [message],
          none,
        ),
      ).toBeUndefined()
    expect(
      copyPlanOutputHistory(
        [
          {
            ...history,
            inputCalibration: {
              ...history.inputCalibration,
              outputGroup: {
                kind: 'known',
                projectionRevision: 'different',
                source: 'reply',
                blockDigests: ['c'.repeat(64)],
                completeness: 'complete',
                usageRef: 'usage',
              },
            },
          },
        ],
        [message],
        none,
      ),
    ).toBeUndefined()
  })

  it('keeps partial upstream total and complete usage distinct, preserving origin labels', () => {
    const observed = history.inputCalibration.observedInput
    if (observed.kind !== 'upstream_total') throw new Error('upstream total expected')
    const allKnown = { ...history.usage, cache_read_tokens: 0 }
    expect(
      copyPlanOutputHistory([{ ...history, usage: allKnown }], [message], none),
    ).toBeUndefined()
    expect(
      copyPlanOutputHistory(
        [
          {
            ...history,
            inputCalibration: {
              ...history.inputCalibration,
              observedInput: { ...observed, tokens: 10 },
            },
          },
        ],
        [message],
        none,
      ),
    ).toBeUndefined()
    const fromUsage = {
      ...history,
      usage: allKnown,
      inputCalibration: {
        ...history.inputCalibration,
        observedInput: { kind: 'from_usage', provenance: observed.provenance },
      },
    } satisfies PlanOutputHistoryGroup
    expect(copyPlanOutputHistory([fromUsage], [message], none)).toEqual([fromUsage])
    expect(
      copyPlanOutputHistory([{ ...fromUsage, usage: history.usage }], [message], none),
    ).toBeUndefined()
    const labeled = {
      ...history,
      origin: {
        ...history.origin,
        servingProvider: 'actual-provider',
        upstreamModel: 'actual-model',
      },
      inputCalibration: {
        ...history.inputCalibration,
        observedInput: {
          ...observed,
          provenance: {
            ...observed.provenance,
            servingProvider: 'actual-provider',
            upstreamModel: 'actual-model',
          },
        },
      },
    }
    expect(copyPlanOutputHistory([labeled], [message], none)).toEqual([labeled])
    expect(
      copyPlanOutputHistory(
        [{ ...labeled, origin: { ...labeled.origin, servingProvider: 'different' } }],
        [message],
        none,
      ),
    ).toBeUndefined()
  })

  it('requires an overlapping observation to retain the entire original calibration and usage', () => {
    const calibration: PlanCalibration = {
      kind: 'observation',
      inputCalibration: history.inputCalibration,
      usage: history.usage,
      outputBlocks: history.outputBlocks,
      replaySelection: history.replaySelection,
    }
    expect(copyPlanOutputHistory([history], [message], calibration)).toEqual([history])
    expect(
      copyPlanOutputHistory([history], [message], {
        ...calibration,
        usage: { ...calibration.usage, output_tokens: new LosslessNumber('6') },
      }),
    ).toBeUndefined()
    expect(
      copyPlanOutputHistory([history], [message], {
        ...calibration,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 1, blockIndex: 0 }],
      }),
    ).toEqual([history])
  })
})
