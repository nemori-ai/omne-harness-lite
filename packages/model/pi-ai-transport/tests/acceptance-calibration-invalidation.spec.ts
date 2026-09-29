import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Tiktoken } from 'js-tiktoken/lite'
import {
  invokeModel,
  type PlanInput,
  type PlanCalibration,
} from '@omne-harness-lite/model-request-runtime'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createPiAiTransport,
  createOfficialProfileContent,
  planRequest,
  type PlannedRequest,
} from '../src/index.ts'
import {
  certificate,
  fixture,
  input,
  message,
  judgedMessage,
  policy,
  content,
  sse,
  finish,
  at,
} from './support.ts'
const definition = anthropicDefinitions[0]!
let cert: ReturnType<typeof certificate>, host: Awaited<ReturnType<typeof fixture>>
let request: PlanInput, replayed: PlanInput, original: PlannedRequest
const meter = createAnthropicInputMeter(definition)
function planned(value: PlanInput, chosenMeter = meter) {
  const result = planRequest(value, [definition], chosenMeter)
  if (!('planned' in result)) throw Error(JSON.stringify(result))
  return result.planned
}
function observation(): Extract<PlanCalibration, { kind: 'observation' }> {
  if (replayed.calibration.kind !== 'observation') throw Error('source absent')
  return replayed.calibration
}
beforeAll(async () => {
  cert = certificate()
  const profile = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision: 'independent-boundary',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  host = await fixture(
    cert.tls,
    response =>
      response.end(
        content('retained answer') +
          sse({
            choices: [],
            model: definition.modelId,
            provider: 'Anthropic',
            usage: {
              prompt_tokens: 4000,
              completion_tokens: 50,
              prompt_tokens_details: { cached_tokens: 500, cache_write_tokens: 100 },
            },
          }) +
          finish(),
      ),
    {},
    undefined,
    [definition],
  )
  const transport = createPiAiTransport({
    ...host.options,
    definitions: [definition],
    inputMeters: [meter],
  })
  request = {
    ...input(),
    routeName: definition.modelId,
    provider: 'anthropic',
    parameters: { maxOutputTokens: 128 },
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: ['anthropic'],
    },
    messages: [
      message('system', 'stable-system-sentinel'),
      message('user', 'stable-prefix-sentinel', 'original'),
    ],
  }
  original = planned(request)
  const outcome = await invokeModel({
    ...request,
    transport,
    credential: 'controlled-independent-key',
    signal: new AbortController().signal,
    policy: policy(),
    onAccepted() {},
  }).outcome
  if (!('outcome' in outcome) || outcome.outcome !== 'complete')
    throw Error(JSON.stringify(outcome))
  expect(outcome.inputCalibration.observedInput.kind).toBe('from_usage')
  const assistant = judgedMessage({
    type: 'assistant',
    id: 'original-reply',
    response: 'original-response',
    ending: 'complete',
    createdAt: at,
    blocks: outcome.blocks,
  })
  replayed = {
    ...request,
    messages: [...request.messages, assistant, message('user', 'fresh-sentinel', 'next')],
    calibration: {
      kind: 'observation',
      inputCalibration: outcome.inputCalibration,
      usage: outcome.usage,
      outputBlocks: outcome.blocks,
      replaySelection: outcome.blocks.map((_b, i) => ({
        sourceBlockIndex: i,
        messageIndex: 2,
        blockIndex: i,
      })),
    },
  }
  await transport.close()
})
afterAll(async () => {
  await host?.close()
  cert?.dispose()
})

describe('independent final projection invalidation from a real TLS observation', () => {
  it('preserves stable P with actual tokenizer instrumentation, counts only retained G and fresh N, and retains cache on wire', () => {
    const spy = vi.spyOn(Tiktoken.prototype, 'encode')
    try {
      const next = planned(replayed)
      expect(next.measurement.mode).toBe('marginal')
      expect(spy.mock.calls.length).toBeGreaterThan(0)
      expect(
        spy.mock.calls.some(
          call =>
            call[0].includes('stable-prefix-sentinel') ||
            call[0].includes('stable-system-sentinel'),
        ),
      ).toBe(false)
      expect(spy.mock.calls.some(call => call[0].includes('retained answer'))).toBe(true)
      expect(spy.mock.calls.some(call => call[0].includes('fresh-sentinel'))).toBe(true)
      expect(JSON.stringify(next.body)).toContain('"cache_control":{"type":"ephemeral","ttl":"1h"}')
      expect(host.requests).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })
  for (const change of [
    'edit',
    'delete',
    'reorder',
    'visibility',
    'compaction-derived',
    'system',
  ] as const)
    it(`${change} invalidates the real stable prefix even without a compaction flag`, () => {
      let messages = [...replayed.messages]
      if (change === 'edit') messages[1] = message('user', 'edited original', 'original')
      if (change === 'delete') messages.splice(1, 1)
      if (change === 'reorder') [messages[0], messages[1]] = [messages[1]!, messages[0]!]
      if (change === 'system') messages[0] = message('system', 'new policy')
      if (change === 'visibility' || change === 'compaction-derived') {
        const old = messages[1]!
        messages[1] = judgedMessage({
          ...old,
          blocks: old.blocks.map(block => ({
            ...block,
            visibility: { ...block.visibility, toModel: false },
          })),
        })
        if (change === 'compaction-derived')
          messages.splice(2, 0, message('user', 'derived shorter summary', 'summary'))
      }
      expect(planned({ ...replayed, messages }).measurement).toMatchObject({
        mode: 'full',
        fallbackReason: 'prefix_changed',
      })
    })
  for (const revision of ['tokenizerRevision', 'algorithmRevision', 'replayRevision'] as const)
    it(`changed ${revision} cannot reuse the old observation`, () => {
      expect(
        planned(replayed, { ...meter, [revision]: 'independent-other-revision' }).measurement,
      ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
    })
  for (const field of ['upstreamModel', 'servingProvider'] as const)
    it(`known wrong ${field} is not a matching route`, () => {
      const source = observation(),
        observed = source.inputCalibration.observedInput
      if (observed.kind === 'unavailable') throw Error('known observation absent')
      const calibration = {
        ...source,
        inputCalibration: {
          ...source.inputCalibration,
          observedInput: {
            ...observed,
            provenance: { ...observed.provenance, [field]: 'other/route' },
          },
        },
      }
      expect(planned({ ...replayed, calibration }).measurement).toMatchObject({
        mode: 'full',
        fallbackReason: 'basis_changed',
      })
    })
  it('configuration revision changes basis even when configuration values are equal', () => {
    const adaptation = replayed.snapshot.adaptation
    expect(
      planned({
        ...replayed,
        snapshot: {
          ...replayed.snapshot,
          adaptation: {
            ...adaptation,
            configuration: { ...adaptation.configuration, revision: 'different-configuration' },
          },
        },
      }).measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
  })
  it('changed tool declarations invalidate input envelope and cannot be skipped in marginal checks', () => {
    const tools = [
      {
        name: 'lookup',
        description: 'read fresh facts',
        parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
      },
    ]
    expect(planned({ ...replayed, tools }).measurement).toMatchObject({
      mode: 'full',
      fallbackReason: 'prefix_changed',
    })
  })
  it('bad source blocks and duplicate replay targets reject before another HTTP request', () => {
    const source = observation()
    expect(
      planRequest(
        {
          ...replayed,
          calibration: { ...source, outputBlocks: [message('user', 'forged').blocks[0]!] },
        },
        [definition],
        meter,
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
    expect(
      planRequest(
        {
          ...replayed,
          calibration: {
            ...source,
            replaySelection: [...source.replaySelection, ...source.replaySelection],
          },
        },
        [definition],
        meter,
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
    expect(host.requests).toHaveLength(1)
  })
  it('a legal but mismapped replay target falls back to full instead of silently omitting the reply', () => {
    const source = observation()
    const result = planned({
      ...replayed,
      calibration: {
        ...source,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 3, blockIndex: 0 }],
      },
    })
    expect(result.measurement.mode).toBe('full')
    expect(result.measurement.fallbackReason).toBeUndefined()
  })
  it('no source and explicit unavailable source remain distinct; original full evidence stays immutable', () => {
    expect(
      planned({ ...replayed, calibration: { kind: 'none', reason: 'no_observation' } }).measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'no_observation' })
    expect(
      planned({ ...replayed, calibration: { kind: 'none', reason: 'source_unavailable' } })
        .measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'source_unavailable' })
    expect(original.measurement).toMatchObject({ mode: 'full', fallbackReason: 'no_observation' })
    expect(host.requests).toHaveLength(1)
  })
})
