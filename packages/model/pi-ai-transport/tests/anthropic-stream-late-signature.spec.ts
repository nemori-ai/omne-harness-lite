import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readOpaqueJson } from '@omne-harness-lite/content-blocks'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type PlanInput} from '@omne-harness-lite/model-request-runtime'
import { type PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { readStream } from '@omne-harness-lite/pi-ai-transport'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { imagePreparation } from './image-transport-support.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  planned,
  policy,
  sse,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

const base = {
  type: 'reasoning.text',
  id: 'one-thinking-block',
  index: 0,
  format: 'anthropic-claude-v1',
  extension: { source: 'controlled' },
}

async function retainedDetails(fragments: readonly Record<string, unknown>[]) {
  const body =
    fragments
      .map(detail => sse({ choices: [{ delta: { reasoning_details: [detail] } }] }))
      .join('') + finish()
  const host = await fixture(cert.tls, response => response.end(body))
  try {
    const plan = await planned(host.transport)
    const sent = await host.transport.send(plan, 'synthetic-only', new AbortController().signal)
    if (!('response' in sent)) throw Error('controlled response unavailable')
    let opaque: ReturnType<typeof readOpaqueJson> | undefined
    for await (const event of readStream(sent.response, plan, new AbortController().signal, {
      maxSseEventBytes: 16384,
      diagnostic: () => {},
    })) {
      if (event.t === 'close' && 'block' in event && event.block?.kind === 'thinking') {
        if (!event.block.opaque) throw Error('reasoning detail was not retained')
        opaque = readOpaqueJson(event.block.opaque)
      }
    }
    expect(host.requests).toHaveLength(1)
    if (!opaque || typeof opaque !== 'object' || !('reasoning_details' in opaque))
      throw Error('missing retained reasoning details')
    return opaque.reasoning_details
  } finally {
    await host.close()
  }
}

describe('OpenRouter reasoning detail stream identity', () => {
  it('joins same-id text followed by its late signature without losing extension metadata', async () => {
    const first = { ...base, text: 'first ', signature: null }
    const final = { ...base, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, final])).toEqual([
      { ...base, text: 'first second', signature: 'signed-one' },
    ])
  })

  it('joins same-id text fragments that carry the same nonempty signature', async () => {
    const first = { ...base, text: 'first ', signature: 'signed-one' }
    const final = { ...base, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, final])).toEqual([
      { ...base, text: 'first second', signature: 'signed-one' },
    ])
  })

  it.each([
    ['different id', { id: 'another-thinking-block' }],
    ['different index', { index: 1 }],
    ['different format', { format: 'other-format' }],
    ['different unknown metadata', { extension: { source: 'other' } }],
    ['conflicting nonempty signatures', { signature: 'signed-two' }],
    ['different subtype', { type: 'reasoning.encrypted', data: 'ciphertext' }],
  ])('keeps %s as a distinct original detail', async (_case, change) => {
    const first = { ...base, text: 'first', signature: 'signed-one' }
    const next = { ...base, text: 'second', signature: 'signed-one', ...change }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })

  it('joins id-less same-index fragments that repeat one signature (R-L)', async () => {
    const { id: _id, ...unidentified } = base
    const first = { ...unidentified, text: 'first ', signature: 'signed-one' }
    const next = { ...unidentified, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, next])).toEqual([
      { ...unidentified, text: 'first second', signature: 'signed-one' },
    ])
  })

  it('does not infer signed id-less identity without an index on both fragments', async () => {
    const { id: _id, index: _index, ...unindexed } = base
    const first = { ...unindexed, text: 'first', signature: null }
    const next = { ...unindexed, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })

  // Normalized shape of the paid anthropic/claude-sonnet-5 round 1
  // (ledger entry cecc12c9-300e-43db-8389-7bb4ac859d4f, gen-1790750429-iSYvIqIsDRNfqp6eeU7P):
  // two id-less index-0 `reasoning.text` details, text without a signature member followed by a
  // signature without a text member. No raw SSE bytes were retained; the fragments below are
  // built from that normalized receipt, with synthetic text and signature values.
  const observedText = {
    type: 'reasoning.text',
    text: 'Thinking about CEDAR. ',
    format: 'anthropic-claude-v1',
    index: 0,
  }
  const observedSignature = {
    type: 'reasoning.text',
    signature: 'SIGNATURE_OBSERVED',
    format: 'anthropic-claude-v1',
    index: 0,
  }

  it('rebuilds the observed id-less text then signature-only fragments into one signed detail', async () => {
    expect(await retainedDetails([observedText, observedSignature])).toEqual([
      { ...observedText, signature: 'SIGNATURE_OBSERVED' },
    ])
    expect(
      await retainedDetails([
        observedText,
        { ...observedText, text: 'Second delta.' },
        observedSignature,
      ]),
    ).toEqual([
      {
        ...observedText,
        text: 'Thinking about CEDAR. Second delta.',
        signature: 'SIGNATURE_OBSERVED',
      },
    ])
  })

  it('starts a new id-less entry for an unsigned fragment after the late signature', async () => {
    const after = { ...observedText, text: 'next block' }
    expect(await retainedDetails([observedText, observedSignature, after])).toEqual([
      { ...observedText, signature: 'SIGNATURE_OBSERVED' },
      after,
    ])
  })

  it('keeps a late signature on a different index distinct', async () => {
    const elsewhere = { ...observedSignature, index: 1 }
    expect(await retainedDetails([observedText, elsewhere])).toEqual([observedText, elsewhere])
  })

  it('keeps a text-less fragment without a nonempty signature distinct', async () => {
    const { signature: _none, ...textless } = observedSignature
    expect(await retainedDetails([observedText, textless])).toEqual([observedText, textless])
    const empty = { ...observedSignature, signature: '' }
    expect(await retainedDetails([observedText, empty])).toEqual([observedText, empty])
  })

  it('keeps a different second signature distinct after the first one arrived', async () => {
    const other = { ...observedSignature, signature: 'SIGNATURE_OTHER' }
    expect(await retainedDetails([observedText, observedSignature, other])).toEqual([
      { ...observedText, signature: 'SIGNATURE_OBSERVED' },
      other,
    ])
  })

  it('joins adjacent id-less unsigned fragments whose heads are equal', async () => {
    const { id: _id, ...unidentified } = base
    const { signature: _none, ...absent } = { ...unidentified, text: 'b ', signature: null }
    expect(
      await retainedDetails([
        { ...unidentified, text: 'a ', signature: null },
        absent,
        { ...unidentified, text: 'c', signature: null },
      ]),
    ).toEqual([{ ...unidentified, text: 'a b c', signature: null }])
    const first = { ...unidentified, text: 'a', signature: null }
    const other = { ...unidentified, text: 'b', signature: null, index: 1 }
    expect(await retainedDetails([first, other])).toEqual([first, other])
  })

  it('fills a null id-less signature from a later same-index signature (R-L)', async () => {
    const { id: _id, ...unidentified } = base
    const first = { ...unidentified, text: 'first ', signature: null }
    const next = { ...unidentified, text: 'second', signature: 'signed-one' }
    expect(await retainedDetails([first, next])).toEqual([
      { ...unidentified, text: 'first second', signature: 'signed-one' },
    ])
  })

  it.each([
    ['an earlier nonempty signature then none', 'signed-one', null],
    ['an invalid signature type', null, 7],
    ['an empty signature', null, ''],
  ])('keeps id-less fragments distinct when they carry %s', async (_case, early, late) => {
    const { id: _id, ...unidentified } = base
    const first = { ...unidentified, text: 'first', signature: early }
    const next = { ...unidentified, text: 'second', signature: late }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })

  it('continues absent and null signature fragments of one id until the signature arrives', async () => {
    const { signature: _none, ...absent } = { ...base, text: 'b ', signature: null }
    expect(
      await retainedDetails([
        { ...base, text: 'a ', signature: null },
        absent,
        { ...base, text: 'c', signature: null },
        { ...base, text: '', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...base, text: 'a b c', signature: 'signed-one' }])
    const { signature: _absent, ...unsigned } = { ...base, text: 'x', signature: null }
    expect(await retainedDetails([unsigned, { ...base, text: 'y', signature: null }])).toEqual([
      { ...base, text: 'xy', signature: null },
    ])
  })

  it('keeps an unsigned fragment after a signed fragment of the same id distinct', async () => {
    const signed = { ...base, text: 'first', signature: 'signed-one' }
    const unsigned = { ...base, text: 'second', signature: null }
    expect(await retainedDetails([signed, unsigned])).toEqual([signed, unsigned])
  })

  it.each([
    ['numeric', 7],
    ['empty string', ''],
    ['object', { value: 'signed-one' }],
  ])('does not let a %s signature authorize a merge', async (_case, signature) => {
    const unsigned = { ...base, text: 'first', signature: null }
    const invalid = { ...base, text: 'first', signature }
    const next = { ...base, text: 'second', signature }
    expect(await retainedDetails([unsigned, next])).toEqual([unsigned, next])
    expect(await retainedDetails([invalid, next])).toEqual([invalid, next])
  })

  it.each([
    ['empty id', { id: '' }],
    ['non-string id', { id: 1 }],
    ['non-string text', { text: 1 }],
  ])('keeps fragments with %s distinct', async (_case, change) => {
    const first = { ...base, text: 'first', signature: null, ...change }
    const next = { ...base, text: 'second', signature: 'signed-one', ...change }
    expect(await retainedDetails([first, next])).toEqual([first, next])
  })

  it('keeps same-id encrypted details discrete and leaves summary joining unchanged', async () => {
    const encrypted = { ...base, type: 'reasoning.encrypted', data: 'cipher' }
    expect(await retainedDetails([encrypted, encrypted])).toEqual([encrypted, encrypted])
    const summary = { type: 'reasoning.summary', format: 'other-format', index: 0 }
    expect(
      await retainedDetails([
        { ...summary, summary: 'first ' },
        { ...summary, summary: 'second' },
      ]),
    ).toEqual([{ ...summary, summary: 'first second' }])
  })
})

describe.each(['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5.5'])(
  '%s two-turn actual local TLS replay of streamed reasoning details',
  modelId => {
    const found = anthropicDefinitions.find(d => d.modelId === modelId)
    if (!found) throw Error('missing official Anthropic definition')
    const definition = found
    const meter = createAnthropicInputMeter(definition)
    const configured = createOfficialProfileContent(definition, {
      providers: ['anthropic'],
      allowFallback: false,
      configuration: {
        revision: '1',
        values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      },
    })
    if ('rejected' in configured) throw Error(configured.rejected)
    const profile = configured.ok
    const anthropic = { format: 'anthropic-claude-v1', extension: { source: 'controlled' } }
    const cases = [
      {
        name: 'one reconstructed late-signed group',
        fragments: [
          { type: 'reasoning.text', id: 'thinking-a', index: 0, ...anthropic, text: 'first ' },
          {
            type: 'reasoning.text',
            id: 'thinking-a',
            index: 0,
            ...anthropic,
            text: 'middle ',
            signature: null,
          },
          {
            type: 'reasoning.text',
            id: 'thinking-a',
            index: 0,
            ...anthropic,
            text: 'last',
            signature: 'SIGNATURE_A',
          },
        ],
        replayed: [
          {
            type: 'reasoning.text',
            id: 'thinking-a',
            index: 0,
            ...anthropic,
            text: 'first middle last',
            signature: 'SIGNATURE_A',
          },
        ],
      },
      {
        // Paid Sonnet 5 receipt cecc12c9-300e-43db-8389-7bb4ac859d4f (normalized shape only).
        name: 'the observed id-less text then signature-only fragments',
        fragments: [
          {
            type: 'reasoning.text',
            text: 'observed thinking ',
            format: 'anthropic-claude-v1',
            index: 0,
          },
          {
            type: 'reasoning.text',
            signature: 'SIGNATURE_OBSERVED',
            format: 'anthropic-claude-v1',
            index: 0,
          },
        ],
        replayed: [
          {
            type: 'reasoning.text',
            text: 'observed thinking ',
            format: 'anthropic-claude-v1',
            index: 0,
            signature: 'SIGNATURE_OBSERVED',
          },
        ],
      },
      {
        name: 'two truly distinct signed details',
        fragments: [
          {
            type: 'reasoning.text',
            id: 'thinking-a',
            index: 0,
            ...anthropic,
            text: 'first',
            signature: 'SIGNATURE_A',
          },
          {
            type: 'reasoning.text',
            id: 'thinking-b',
            index: 1,
            ...anthropic,
            text: 'second',
            signature: 'SIGNATURE_B',
          },
        ],
        replayed: [
          {
            type: 'reasoning.text',
            id: 'thinking-a',
            index: 0,
            ...anthropic,
            text: 'first',
            signature: 'SIGNATURE_A',
          },
          {
            type: 'reasoning.text',
            id: 'thinking-b',
            index: 1,
            ...anthropic,
            text: 'second',
            signature: 'SIGNATURE_B',
          },
        ],
      },
    ]
    it.each(cases)('replays $name exactly once in the next assistant wire', async testCase => {
      let calls = 0
      const host = await fixture(
        cert.tls,
        res => {
          calls++
          res.end(
            (calls === 1
              ? testCase.fragments
                  .map(detail => sse({ choices: [{ delta: { reasoning_details: [detail] } }] }))
                  .join('')
              : '') +
              content(`answer ${calls}`) +
              sse({
                choices: [],
                model: definition.modelId,
                provider: 'Anthropic',
                usage: {
                  prompt_tokens: 100 * calls,
                  completion_tokens: 31,
                  completion_tokens_details: { reasoning_tokens: 7 },
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          )
        },
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        imagePreparation,
        definitions: [definition],
        inputMeters: [meter],
      })
      try {
        const base = input()
        const first: PlanInput = {
          ...base,
          routeName: definition.modelId,
          provider: 'anthropic',
          parameters: { reasoningEffort: 'high', maxOutputTokens: 128 },
          messages: [message('user', 'start', 'u0')],
          snapshot: {
            ...base.snapshot,
            ...definition.capabilities,
            adaptation: profile.adaptation,
            providers: profile.providers,
            allowFallback: false,
          },
        }
        const invoke = async (request: PlanInput) => {
          const actual = await invokeModel({
            ...request,
            transport,
            credential: 'synthetic-local-only',
            signal: new AbortController().signal,
            policy: policy(),
            onAccepted() {},
          }).outcome
          if (!('outcome' in actual) || actual.outcome !== 'complete')
            throw Error(JSON.stringify(actual))
          return actual
        }
        const firstPlan = await transport.plan(first, { signal: new AbortController().signal })
        if (!('planned' in firstPlan)) throw Error(JSON.stringify(firstPlan))
        const answered = await invoke(first)
        expect(answered.usage.output_tokens).toBe(31)
        const thinking = answered.blocks.find(block => block.kind === 'thinking')
        if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
          throw Error('streamed reasoning details were not retained')
        expect(readOpaqueJson(thinking.opaque)).toEqual({
          routeName: definition.modelId,
          reasoning_details: testCase.replayed,
        })
        const selection = answered.blocks.map((_, index) => ({
          sourceBlockIndex: index,
          messageIndex: first.messages.length,
          blockIndex: index,
        }))
        const history: PlanOutputHistoryGroup = {
          inputCalibration: answered.inputCalibration,
          usage: answered.usage,
          outputBlocks: answered.blocks,
          replaySelection: selection,
          origin: {
            adaptation: first.snapshot.adaptation,
            provider: 'anthropic',
            parameters: firstPlan.planned.parameters,
            servingProvider: 'Anthropic',
            upstreamModel: definition.modelId,
          },
        }
        const second: PlanInput = {
          ...first,
          outputHistory: [history],
          calibration: {
            kind: 'observation',
            inputCalibration: answered.inputCalibration,
            usage: answered.usage,
            outputBlocks: answered.blocks,
            replaySelection: selection,
          },
          messages: [
            ...first.messages,
            judgedMessage({
              type: 'assistant',
              id: 'a0',
              response: 'r0',
              ending: 'complete',
              createdAt: at,
              blocks: answered.blocks,
            }),
            message('user', 'next', 'u1'),
          ],
        }
        const secondPlan = await transport.plan(second, { signal: new AbortController().signal })
        if (!('planned' in secondPlan)) throw Error(JSON.stringify(secondPlan))
        expect(secondPlan.planned.measurement.mode).toBe('marginal')
        if (secondPlan.planned.measurement.mode !== 'marginal') throw Error('marginal required')
        // The whole signed group is one contribution equal to the original output usage.
        expect(secondPlan.planned.measurement.replayContribution).toEqual({
          precision: 'estimated',
          tokens: 31,
        })
        await invoke(second)
        expect(host.requests).toHaveLength(2)
        const sent = host.requests[1]?.body ?? ''
        const wire: unknown = JSON.parse(sent)
        if (!wire || typeof wire !== 'object' || !('messages' in wire))
          throw Error('missing wire messages')
        const messages: unknown[] = Array.isArray(wire.messages) ? wire.messages : []
        const assistants = messages.filter(
          item => !!item && typeof item === 'object' && 'role' in item && item.role === 'assistant',
        )
        expect(assistants).toHaveLength(1)
        expect(assistants[0]).toMatchObject({ reasoning_details: testCase.replayed })
        for (const detail of testCase.replayed) {
          expect(sent.split(detail.signature)).toHaveLength(2)
          expect(sent.split(JSON.stringify(detail.text))).toHaveLength(2)
        }
      } finally {
        await transport.close()
        await host.close()
      }
    })
  },
)
