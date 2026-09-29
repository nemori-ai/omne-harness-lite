import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { readFileSync } from 'node:fs'
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
async function planned(value: PlanInput, chosenMeter = meter) {
  const result = await planRequest(
    value,
    [definition],
    chosenMeter,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
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
  original = await planned(request)
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
  it('preserves stable P with actual tokenizer instrumentation, counts only retained G and fresh N, and retains cache on wire', async () => {
    const spy = vi.spyOn(Tiktoken.prototype, 'encode')
    try {
      const next = await planned(replayed)
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
    it(`${change} invalidates the real stable prefix even without a compaction flag`, async () => {
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
      expect((await planned({ ...replayed, messages })).measurement).toMatchObject({
        mode: 'full',
        fallbackReason: 'prefix_changed',
      })
    })
  for (const revision of ['tokenizerRevision', 'algorithmRevision', 'replayRevision'] as const)
    it(`changed ${revision} cannot reuse the old observation`, async () => {
      expect(
        (await planned(replayed, { ...meter, [revision]: 'independent-other-revision' }))
          .measurement,
      ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
    })
  for (const field of ['upstreamModel', 'servingProvider'] as const)
    it(`known wrong ${field} is not a matching route`, async () => {
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
      expect((await planned({ ...replayed, calibration })).measurement).toMatchObject({
        mode: 'full',
        fallbackReason: 'basis_changed',
      })
    })
  it('configuration revision changes basis even when configuration values are equal', async () => {
    const adaptation = replayed.snapshot.adaptation
    expect(
      (
        await planned({
          ...replayed,
          snapshot: {
            ...replayed.snapshot,
            adaptation: {
              ...adaptation,
              configuration: { ...adaptation.configuration, revision: 'different-configuration' },
            },
          },
        })
      ).measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
  })
  it('changed tool declarations invalidate input envelope and cannot be skipped in marginal checks', async () => {
    const tools = [
      {
        name: 'lookup',
        description: 'read fresh facts',
        parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
      },
    ]
    expect((await planned({ ...replayed, tools })).measurement).toMatchObject({
      mode: 'full',
      fallbackReason: 'prefix_changed',
    })
  })
  it('bad source blocks and duplicate replay targets reject before another HTTP request', async () => {
    const source = observation()
    expect(
      await planRequest(
        {
          ...replayed,
          calibration: { ...source, outputBlocks: [message('user', 'forged').blocks[0]!] },
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
    expect(
      await planRequest(
        {
          ...replayed,
          calibration: {
            ...source,
            replaySelection: [...source.replaySelection, ...source.replaySelection],
          },
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({ rejected: 'invalidInput', reason: 'malformed' })
    expect(host.requests).toHaveLength(1)
  })
  it('a legal but mismapped replay target falls back to full instead of silently omitting the reply', async () => {
    const source = observation()
    const result = await planned({
      ...replayed,
      calibration: {
        ...source,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 3, blockIndex: 0 }],
      },
    })
    expect(result.measurement.mode).toBe('full')
    expect(result.measurement.fallbackReason).toBeUndefined()
  })
  it('no source and explicit unavailable source remain distinct; original full evidence stays immutable', async () => {
    expect(
      (await planned({ ...replayed, calibration: { kind: 'none', reason: 'no_observation' } }))
        .measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'no_observation' })
    expect(
      (await planned({ ...replayed, calibration: { kind: 'none', reason: 'source_unavailable' } }))
        .measurement,
    ).toMatchObject({ mode: 'full', fallbackReason: 'source_unavailable' })
    expect(original.measurement).toMatchObject({ mode: 'full', fallbackReason: 'no_observation' })
    expect(host.requests).toHaveLength(1)
  })
  it('marginal image contribution still enforces actual decoded bytes and cannot silently omit media', async () => {
    const bytes = readFileSync(new URL('./fixtures/anthropic/reference-1x1.png', import.meta.url))
    const visual = judgedMessage({
      type: 'user',
      id: 'visual-new',
      createdAt: at,
      blocks: [
        {
          id: 'visual',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: bytes.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'visual-text',
          kind: 'text',
          text: 'what is visible',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const imageRequest = { ...replayed, messages: [...replayed.messages, visual] }
    const measured = await planned(imageRequest)
    expect(measured.measurement).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
    expect(measured.inputLimitEvidence.images).toBe(1)
    expect(measured.inputLimitEvidence.imageBytes).toEqual([bytes.length])
    expect(
      await planRequest(
        {
          ...imageRequest,
          snapshot: {
            ...imageRequest.snapshot,
            inputConstraints: {
              ...imageRequest.snapshot.inputConstraints,
              maxImageBytes: 1,
            },
          },
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxImageBytes'],
    })
    expect(host.requests).toHaveLength(1)
  })
  it('opaque retained reasoning outside this official meter domain refuses instead of tokenizing ciphertext', async () => {
    const opaque = judgedMessage({
      type: 'assistant',
      id: 'opaque-response',
      response: 'opaque-original',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'opaque',
          kind: 'thinking',
          text: '',
          opaque: {
            routeName: definition.modelId,
            reasoning_details: [
              { type: 'reasoning.encrypted', data: 'opaque-ciphertext-sentinel' },
            ],
          },
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: 'visible-answer',
          kind: 'text',
          text: 'answer retained',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const spy = vi.spyOn(Tiktoken.prototype, 'encode')
    try {
      expect(
        await planRequest(
          {
            ...replayed,
            messages: [
              ...replayed.messages,
              opaque,
              message('user', 'after opaque', 'opaque-user'),
            ],
          },
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
      expect(spy.mock.calls.some(call => call[0].includes('opaque-ciphertext-sentinel'))).toBe(
        false,
      )
      expect(host.requests).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })
  it('new tool call and result units remain in delta and retain their actual wire identities', async () => {
    const call = judgedMessage({
      type: 'assistant',
      id: 'tool-calling',
      response: 'tool-original',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'tool-call',
          kind: 'tool_call',
          callId: 'lookup-1',
          tool: 'lookup',
          complete: true,
          unparseable: true,
          rawArguments: '{"key":"sentinel"}',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const result = judgedMessage({
      type: 'tool',
      id: 'tool-result',
      callId: 'lookup-1',
      createdAt: at,
      blocks: [
        {
          id: 'result-wrapper',
          kind: 'tool_result',
          callId: 'lookup-1',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'result-text',
              kind: 'text',
              text: 'tool-result-sentinel',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const spy = vi.spyOn(Tiktoken.prototype, 'encode')
    try {
      const measured = await planned({
        ...replayed,
        messages: [...replayed.messages, call, result],
      })
      expect(measured.measurement).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
      expect(spy.mock.calls.some(item => item[0].includes('tool-result-sentinel'))).toBe(true)
      expect(spy.mock.calls.some(item => item[0].includes('lookup-1'))).toBe(true)
      expect(spy.mock.calls.some(item => item[0].includes('stable-prefix-sentinel'))).toBe(false)
      expect(JSON.stringify(measured.body)).toContain('"tool_call_id":"lookup-1"')
    } finally {
      spy.mockRestore()
    }
  })
  for (const row of [
    {
      name: 'exact',
      phi: 'exact',
      delta: 'exact',
      predicted: 4001,
      admitted: 4001,
      precision: 'exact',
    },
    {
      name: 'bounded',
      phi: 'upperBound',
      delta: 'exact',
      predicted: 4001,
      admitted: 4001,
      precision: 'upperBound',
    },
    {
      name: 'estimated',
      phi: 'estimated',
      delta: 'exact',
      predicted: 4001,
      admitted: 4409,
      precision: 'estimated',
    },
  ] as const)
    it(`controlled contribution arithmetic ${row.name}: signed sum and precision/margin compose once`, async () => {
      // Fault/return-value control at the meter port tests the composition algebra only;
      // it does not certify exact or upper-bound counting by the official Anthropic meter.
      const controlled = {
        ...meter,
        measureReplay: () => ({ kind: row.phi, tokens: 3 }),
        measureNew: () => ({ kind: row.delta, tokens: -2 }),
      }
      const result = await planned(
        { ...replayed, tokenMargin: { multiplier: 1.1, reserveTokens: 7 } },
        controlled,
      )
      expect(result.measurement).toMatchObject({ mode: 'marginal', precision: row.precision })
      expect(
        ExactDecimal.from(result.measurement.predictedInput).compare(
          ExactDecimal.from(row.predicted),
        ),
      ).toBe(0)
      expect(
        ExactDecimal.from(result.measurement.admissionTokens).compare(
          ExactDecimal.from(row.admitted),
        ),
      ).toBe(0)
    })
  for (const defect of ['unavailable', 'negative-total', 'fractional'] as const)
    it(`controlled contribution ${defect} goes through full measurement and never substitutes zero`, async () => {
      const full = vi.fn(meter.measureFull)
      const controlled = {
        ...meter,
        measureFull: full,
        measureReplay: () => ({ kind: 'exact' as const, tokens: 0 }),
        measureNew: () =>
          defect === 'unavailable'
            ? { kind: 'unavailable' as const }
            : { kind: 'estimated' as const, tokens: defect === 'negative-total' ? -4001 : 0.5 },
      }
      const result = await planned(replayed, controlled)
      expect(result.measurement.mode).toBe('full')
      expect(full).toHaveBeenCalledTimes(1)
      expect(result.measurement.fallbackReason).toBeUndefined()
      expect(
        ExactDecimal.from(result.measurement.predictedInput).compare(ExactDecimal.from(0)),
      ).toBeGreaterThan(0)
      expect(
        await planRequest(
          replayed,
          [definition],
          {
            ...controlled,
            measureFull: () => ({ kind: 'unavailable' }),
          },
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
      expect(host.requests).toHaveLength(1)
    })
})
