// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
// Google revision 4 GS-V3 (single contribution), GS-V4 (completeness and authenticity) and
// GS-V5 (basis and identity invalidation). Every history group comes from the production
// reader over local TLS (2026-09-30 frame order); only metadata is altered afterwards.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  readOpaqueJson,
  toOpaqueJson,
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type {
  PlanInput,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import { projectAssistant } from '../src/assistant-projection.ts'
import type { FullMeterInput, InputMeter } from '../src/input-meter.ts'
import { createGoogleInputMeter } from '../src/input-meters/google.ts'
import { classifyGoogleUnit } from '../src/input-meters/google-history-policy.ts'
import { object } from '../src/json.ts'
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import { outputBlockDigestAtRevision, projectOutput, projectionDigest } from '../src/projection.ts'
import { directFull } from './direct-full-input.ts'
import { googleCalibrationRequest } from './fixtures/google/calibration.ts'
import {
  detailsDelta,
  encryptedDetail,
  googleHistoryDefinition,
  googleLeaves,
  googleReply,
  GOOGLE_SERVING_PROVIDER,
  googleV3Definition,
  originalToolReply,
  syntheticCiphertext,
  textFragmentDelta,
  type GoogleLeaf,
} from './fixtures/google/history.ts'
import {
  completed,
  followUp,
  googleHistoryRequest,
  openGoogleHost,
  refused,
  type GoogleHost,
} from './google-history-support.ts'
import { certificate, judgedMessage } from './support.ts'

// The first test in a worker pays the verified tokenizer load and TLS setup.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

const signal = () => ({ signal: new AbortController().signal })
const malformed = { rejected: 'invalidInput', reason: 'malformed' } as const
// Second-round reply facts (synthetic, distinct from the first-round O).
const second = { callId: 'call_local_round_2', output: 57, reasoning: 40, prompt: 1180 }

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function tokens(value: JsonNumber): number {
  const count = Number(writeJsonLossless(value))
  if (!Number.isSafeInteger(count)) throw new Error('token count outside the fixture range')
  return count
}

/** The final wire without every assistant unit that carries reasoning details. */
function remaining(body: JsonObject): JsonObject {
  if (!Array.isArray(body.messages)) throw new Error('messages required')
  return {
    ...body,
    messages: body.messages.filter(
      unit => !(object(unit) && Object.hasOwn(unit, 'reasoning_details')),
    ),
  }
}

/** The same wire with only the `reasoning_details` members removed (tool calls kept). */
function withoutDetails(body: JsonObject): JsonObject {
  if (!Array.isArray(body.messages)) throw new Error('messages required')
  return {
    ...body,
    messages: body.messages.map(unit => {
      if (!object(unit)) return unit
      const { reasoning_details: _details, ...rest } = unit
      return rest
    }),
  }
}

describe.each(googleLeaves)('Google E-only output history: $modelId', leaf => {
  let host: GoogleHost
  // The current published counter, used as the oracle for the unclaimed remainder.
  const published = createGoogleInputMeter(googleV3Definition(leaf.modelId))
  if (!published) throw new Error('missing V3 meter')
  const v3: InputMeter = published
  const definition = googleHistoryDefinition(leaf.modelId)
  beforeAll(async () => {
    host = await openGoogleHost(cert.tls, leaf.modelId)
  })
  afterAll(async () => {
    await host.close()
  })

  function counter(body: JsonObject): number {
    const measured = directFull(v3, { body, serialized: writeJsonLossless(body) })
    if (measured.kind !== 'estimated') throw new Error(`counter: ${JSON.stringify(measured)}`)
    return tokens(measured.tokens)
  }
  async function plan(input: PlanInput, meter: InputMeter = host.meter) {
    return planRequest(input, [definition], meter, signal())
  }
  async function planned(input: PlanInput): Promise<PlannedRequest> {
    const result = await plan(input)
    if (!('planned' in result)) throw new Error(JSON.stringify(result))
    return result.planned
  }

  /** Round 1 (09-30 E tool reply) through the reader; returns the round-2 request. */
  async function roundTwo() {
    const first = googleHistoryRequest(leaf.modelId)
    const firstPlan = await planned(first)
    const original = originalToolReply(leaf)
    host.serve(original.sse)
    const reply = completed(await host.invoke(first))
    return { first, firstPlan, reply, detail: original.detail, input: followUp(first, reply, 2) }
  }

  /** Round 2 answers with a second E tool reply; returns the round-3 request. */
  async function roundThree() {
    const two = await roundTwo()
    const detail = encryptedDetail(
      syntheticCiphertext(leaf.ciphertextBytes, `${leaf.modelId}-round-2`),
      second.callId,
    )
    host.serve(
      googleReply({
        modelId: leaf.modelId,
        generation: 'gen-local-google-round-2',
        servingProvider: GOOGLE_SERVING_PROVIDER,
        reasoning: [detailsDelta([detail])],
        calls: [{ id: second.callId, arguments: '{"query":"PINE"}' }],
        usage: { prompt: second.prompt, output: second.output, reasoning: second.reasoning },
      }),
    )
    const reply = completed(await host.invoke(two.input))
    return { ...two, detail2: detail, input: followUp(two.input, reply, 3) }
  }

  const noObservation = (input: PlanInput): PlanInput => ({
    ...input,
    calibration: { kind: 'none', reason: 'no_observation' },
  })
  function withGroup(
    input: PlanInput,
    change: (group: PlanOutputHistoryGroup) => PlanOutputHistoryGroup,
    index = 0,
  ): PlanInput {
    return noObservation({
      ...input,
      outputHistory: input.outputHistory.map((group, at) => (at === index ? change(group) : group)),
    })
  }

  describe('GS-V3 unique contribution', () => {
    it('round 2: full is G4(remaining) plus the original O once, margin applied once', async () => {
      const { input } = await roundTwo()
      const result = await planned(input)
      const expected = counter(remaining(result.body)) + leaf.output
      expect(result.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(tokens(result.measurement.predictedInput)).toBe(expected)
      // O already contains reasoning; neither reasoning_tokens nor the group's visible units add.
      expect(tokens(result.measurement.predictedInput)).not.toBe(expected + leaf.reasoning)
      expect(tokens(result.measurement.predictedInput)).toBeLessThan(
        counter(withoutDetails(result.body)) + leaf.output,
      )
      // The visible counter itself never accepts a details unit.
      expect(directFull(v3, { body: result.body, serialized: result.serialized })).toEqual({
        kind: 'unavailable',
      })
      const evidence = result.inputLimitEvidence
      if (evidence.inputTokens.kind !== 'estimated' || evidence.admissionTokens === undefined)
        throw new Error('estimated input and admission required')
      expect(tokens(evidence.inputTokens.tokens)).toBe(expected)
      // tokenMargin {1.2, 32} is applied once, at the final gate only.
      expect(tokens(evidence.admissionTokens)).toBe(Math.ceil(expected * 1.2) + 32)
    })

    it('round 3: two complete E groups are each counted once', async () => {
      const { input } = await roundThree()
      expect(input.outputHistory).toHaveLength(2)
      const result = await planned(input)
      const body = remaining(result.body)
      expect(Array.isArray(result.body.messages) && result.body.messages.length).toBe(
        Array.isArray(body.messages) ? body.messages.length + 2 : -1,
      )
      expect(tokens(result.measurement.predictedInput)).toBe(
        counter(body) + leaf.output + second.output,
      )
    })

    it('never passes ciphertext, E ids or detail members to the tokenizer', async () => {
      const { input, detail, detail2 } = await roundThree()
      const encode = vi.spyOn(Tokenizer.prototype, 'encode')
      try {
        const result = await planned(input)
        expect(result.measurement.mode).toBe('full')
        const seen = encode.mock.calls.map((call: readonly unknown[]) => String(call[0]))
        expect(seen.length).toBeGreaterThan(0)
        for (const secret of [detail.data, detail.id, detail2.data, detail2.id])
          expect(seen.some((text: string) => text.includes(String(secret)))).toBe(false)
        for (const member of ['reasoning_details', 'reasoning.encrypted', 'google-gemini-v1'])
          expect(seen).not.toContain(member)
        // The wire still carries both ciphertexts verbatim.
        expect(result.serialized).toContain(String(detail.data))
        expect(result.serialized).toContain(String(detail2.data))
      } finally {
        encode.mockRestore()
      }
    })

    it('without a complete group the V4 meter equals the V3 counter value for value', async () => {
      const frozen = { F1: 16, F2: 90, H1: 34, H2: 154 } as const
      for (const [id, value] of Object.entries(frozen)) {
        const base = googleCalibrationRequest(leaf.modelId, id as keyof typeof frozen)
        const result = await planned({
          ...base,
          snapshot: {
            ...base.snapshot,
            adaptation: {
              ...base.snapshot.adaptation,
              definition: { modelId: leaf.modelId, revision: definition.revision },
              implementation: definition.implementation,
            },
          },
        })
        expect(result.inputLimitEvidence.inputTokens, id).toEqual({
          kind: 'estimated',
          tokens: value,
        })
      }
      // A visible-only history (plain reasoning string, no details) is counted whole.
      const first = googleHistoryRequest(leaf.modelId)
      host.serve(
        googleReply({
          modelId: leaf.modelId,
          generation: 'gen-local-google-visible',
          servingProvider: GOOGLE_SERVING_PROVIDER,
          reasoning: [{ content: '', role: 'assistant', reasoning: 'Visible plan.' }],
          answer: 'CEDAR-7',
          usage: { prompt: 900, output: 20, reasoning: 5 },
        }),
      )
      const reply = completed(await host.invoke(first))
      const result = await planned(followUp(first, reply, 2))
      expect(writeJsonLossless(result.body)).not.toContain('reasoning_details')
      expect(tokens(result.measurement.predictedInput)).toBe(counter(result.body))
    })
  })

  describe('GS-V4 completeness and authenticity', () => {
    it('refuses partial, reordered, cross-message, missing, duplicated and unclaimed groups', async () => {
      const { input } = await roundTwo()
      const assistantAt = input.messages.findIndex(item => item.type === 'assistant')
      const assistant = input.messages[assistantAt]
      if (!assistant || assistant.type !== 'assistant') throw new Error('assistant required')
      const withoutThinking = judgedMessage({
        ...assistant,
        blocks: assistant.blocks.filter(block => block.kind !== 'thinking'),
      })
      const cases: [string, PlanInput, object][] = [
        [
          'partial selection (tool call only)',
          withGroup(input, group => ({
            ...group,
            replaySelection: group.replaySelection.filter(
              item => group.outputBlocks[item.sourceBlockIndex]?.kind !== 'thinking',
            ),
          })),
          // Not a contradiction the gate can judge, just not the complete group: unavailable.
          refused,
        ],
        [
          'reordered selection',
          withGroup(input, group => ({
            ...group,
            replaySelection: group.replaySelection.map((item, index, all) => ({
              ...item,
              blockIndex: all[all.length - 1 - index]?.blockIndex ?? item.blockIndex,
            })),
          })),
          malformed,
        ],
        [
          'cross-message selection',
          withGroup(input, group => ({
            ...group,
            replaySelection: group.replaySelection.map((item, index) =>
              index === 0 ? { ...item, messageIndex: item.messageIndex + 1 } : item,
            ),
          })),
          malformed,
        ],
        [
          'missing thinking block in the message',
          noObservation({
            ...input,
            messages: input.messages.map((item, index) =>
              index === assistantAt ? withoutThinking : item,
            ),
          }),
          malformed,
        ],
        [
          'duplicate claim of one message',
          noObservation({
            ...input,
            outputHistory: [...input.outputHistory, ...input.outputHistory],
          }),
          malformed,
        ],
        ['unclaimed details unit', noObservation({ ...input, outputHistory: [] }), refused],
      ]
      const before = host.requests.length
      const actual: Record<string, unknown> = {}
      for (const [name, value] of cases) actual[name] = await plan(value)
      expect(actual).toEqual(
        Object.fromEntries(cases.map(([name, , expected]) => [name, expected])),
      )
      expect(host.requests).toHaveLength(before)
    })

    it('a tampered digest is malformed; a self-consistent forgery is never malformed', async () => {
      const { input } = await roundTwo()
      const forge = (data: string) => (blocks: PlanOutputHistoryGroup['outputBlocks']) =>
        blocks.map(block => {
          if (block.kind !== 'thinking' || block.opaque === undefined) return block
          const opaque = readOpaqueJson(block.opaque)
          if (!object(opaque) || !Array.isArray(opaque.reasoning_details)) return block
          return {
            ...block,
            opaque: toOpaqueJson({
              ...opaque,
              reasoning_details: opaque.reasoning_details.map(detail =>
                object(detail) ? { ...detail, data } : detail,
              ),
            }),
          }
        })
      const coherent = (data: string): PlanInput => {
        const rewrite = forge(data)
        return noObservation({
          ...input,
          messages: input.messages.map(item =>
            item.type === 'assistant'
              ? judgedMessage({ ...item, blocks: rewrite(item.blocks) })
              : item,
          ),
          outputHistory: input.outputHistory.map(group => {
            const outputBlocks = rewrite(group.outputBlocks)
            const projected = projectOutput({
              blocks: outputBlocks,
              source: 'reply',
              completeness: 'complete',
            })
            if (!('projected' in projected)) throw new Error('forged output fixture invalid')
            return {
              ...group,
              outputBlocks,
              inputCalibration: { ...group.inputCalibration, outputGroup: projected.projected },
            }
          }),
        })
      }
      const other = syntheticCiphertext(leaf.ciphertextBytes, 'forged')
      // Group blocks altered without their digests: judgeable, so the planner says malformed.
      expect(
        await plan(
          withGroup(input, group => ({ ...group, outputBlocks: forge(other)(group.outputBlocks) })),
        ),
      ).toEqual(malformed)
      // Coherent forgery with a well-formed E: the meter does not vouch for ciphertext
      // authenticity (upstream verifies it) and still counts O once.
      const genuine = await planned(noObservation(input))
      const forged = await planned(coherent(other))
      expect(forged.serialized).toContain(other)
      expect(tokens(forged.measurement.predictedInput)).toBe(
        tokens(genuine.measurement.predictedInput),
      )
      // Coherent forgery into an out-of-domain E: only the unavailable branch.
      expect(await plan(coherent('[REDACTED]'))).toEqual(refused)
    })

    it('a length-truncated reply keeps no details and is never a whole group', async () => {
      const first = googleHistoryRequest(leaf.modelId)
      host.serve(
        googleReply({
          modelId: leaf.modelId,
          generation: 'gen-local-google-truncated',
          servingProvider: GOOGLE_SERVING_PROVIDER,
          reasoning: [
            detailsDelta([
              encryptedDetail(syntheticCiphertext(leaf.ciphertextBytes, 'cut'), leaf.callId),
            ]),
            textFragmentDelta('Considering the code.'),
          ],
          answer: 'CED',
          finish: 'length',
          usage: { prompt: 949, output: 32, reasoning: 29 },
        }),
      )
      const outcome = await host.invoke(first)
      if (!('outcome' in outcome)) throw new Error(JSON.stringify(outcome))
      expect(
        outcome.blocks.every(block => block.kind !== 'thinking' || block.opaque === undefined),
      ).toBe(true)
      const projected = projectAssistant(outcome.blocks, leaf.modelId, false)
      if ('rejected' in projected) throw new Error(projected.rejected)
      expect(projected.message).not.toHaveProperty('reasoning_details')
      expect(classifyGoogleUnit(projected.message)).toBe('visible')
    })

    it('the factory method itself refuses invalid full input without a measurement', async () => {
      const { input } = await roundTwo()
      let captured: FullMeterInput | undefined
      const spying: InputMeter = {
        ...host.meter,
        measureFull(value) {
          captured = value
          return host.meter.measureFull(value)
        },
      }
      const planned = await plan(noObservation(input), spying)
      if (!('planned' in planned) || !captured) throw new Error('full input not captured')
      const valid = captured
      expect(host.meter.measureFull(valid)).toEqual({
        kind: 'estimated',
        tokens:
          planned.planned.inputLimitEvidence.inputTokens.kind === 'estimated'
            ? planned.planned.inputLimitEvidence.inputTokens.tokens
            : -1,
      })
      const group = valid.outputHistory[0]
      if (!group) throw new Error('group required')
      const unavailable = { kind: 'unavailable' }
      const bad: [string, unknown][] = [
        ['missing spans', { ...valid, historySpans: [] }],
        ['partial spans', { ...valid, historySpans: valid.historySpans.slice(1) }],
        [
          'span beyond units',
          { ...valid, historySpans: valid.historySpans.map(s => ({ ...s, end: 99 })) },
        ],
        ['no history', { ...valid, outputHistory: [], historySpans: [] }],
        [
          'reordered blocks',
          {
            ...valid,
            outputHistory: [{ ...group, outputBlocks: [...group.outputBlocks].reverse() }],
          },
        ],
        [
          'source contradiction',
          {
            ...valid,
            outputHistory: [{ ...group, origin: { ...group.origin, provider: 'google-vertex' } }],
          },
        ],
        ['serialized mismatch', { ...valid, serialized: `${valid.serialized} ` }],
        ['empty messages', { ...valid, body: { ...valid.body, messages: [] } }],
        ['body not an object', { ...valid, body: null }],
        ['not an object', null],
      ]
      for (const [name, value] of bad)
        // @ts-expect-error -- untyped standalone callers
        expect(host.meter.measureFull(value), name).toEqual(unavailable)
    })
  })

  describe('GS-V5 invalidation', () => {
    function rebind(
      group: PlanOutputHistoryGroup,
      revision: string,
      implementation: string,
      meterRevision: string,
    ): PlanOutputHistoryGroup {
      const request = group.inputCalibration.requestInput
      if (request.kind !== 'known') throw new Error('known source required')
      const binding = {
        ...group.origin.adaptation,
        definition: { modelId: leaf.modelId, revision },
        implementation: { name: 'pi-ai:google', revision: implementation },
      }
      return {
        ...group,
        origin: { ...group.origin, adaptation: binding },
        inputCalibration: {
          ...group.inputCalibration,
          requestInput: {
            ...request,
            countingBasis: { ...request.countingBasis, binding, meterRevision },
          },
        },
      }
    }

    it('explains a saved V3 group by O and refuses coordinates outside the table', async () => {
      const { input, firstPlan } = await roundTwo()
      const current = await planned(noObservation(input))
      const v3Group = withGroup(input, group =>
        rebind(group, '3', 'mp4-17', 'gemma4-visible-text-tools-effort-offset6-2'),
      )
      const changed = await planned(v3Group)
      expect(changed.measurement.mode).toBe('full')
      expect(tokens(changed.measurement.predictedInput)).toBe(
        tokens(current.measurement.predictedInput),
      )
      const outside: [string, PlanInput][] = [
        [
          'definition 2 / mp4-3',
          withGroup(input, g =>
            rebind(g, '2', 'mp4-3', 'gemma4-visible-text-tools-effort-offset6-2'),
          ),
        ],
        [
          'V3 with the V4 algorithm',
          withGroup(input, g =>
            rebind(g, '3', 'mp4-17', 'gemma4-visible-offset6-complete-output-group-estimated/1'),
          ),
        ],
        [
          'unknown algorithm',
          withGroup(input, g =>
            rebind(g, definition.revision, definition.implementation.revision, 'gemma4-unknown/1'),
          ),
        ],
        [
          'unknown implementation',
          withGroup(input, g =>
            rebind(
              g,
              definition.revision,
              'mp4-99',
              'gemma4-visible-offset6-complete-output-group-estimated/1',
            ),
          ),
        ],
      ]
      // V3 facts under openrouter-input-projection/2 are not in the table either.
      const old = 'openrouter-input-projection/2'
      const { messages, ...envelope } = firstPlan.body
      if (!Array.isArray(messages)) throw new Error('messages required')
      outside.push([
        'V3 under openrouter-input-projection/2',
        withGroup(input, g => {
          const rebound = rebind(g, '3', 'mp4-17', 'gemma4-visible-text-tools-effort-offset6-2')
          const request = rebound.inputCalibration.requestInput
          const output = rebound.inputCalibration.outputGroup
          if (request.kind !== 'known' || output.kind !== 'known') throw new Error('known source')
          return {
            ...rebound,
            inputCalibration: {
              ...rebound.inputCalibration,
              requestInput: {
                ...request,
                projectionRevision: old,
                prefixDigest: projectionDigest('input-prefix', messages, old),
                inputEnvelopeDigest: projectionDigest('input-envelope', envelope, old),
                countingBasis: { ...request.countingBasis, projectionRevision: old },
              },
              outputGroup: {
                ...output,
                projectionRevision: old,
                blockDigests: rebound.outputBlocks.map(block =>
                  outputBlockDigestAtRevision(block, old),
                ),
              },
            },
          }
        }),
      ])
      for (const [name, value] of outside) expect(await plan(value), name).toEqual(refused)
    })

    it('keeps O across current effort and max_tokens changes, but not across route or parameters', async () => {
      const { input } = await roundTwo()
      const base = await planned(noObservation(input))
      for (const parameters of [
        { reasoningEffort: 'low', maxOutputTokens: 64 },
        { reasoningEffort: 'medium', maxOutputTokens: 4096 },
        { maxOutputTokens: 1024 },
      ] as const) {
        const result = await planned(noObservation({ ...input, parameters }))
        expect(result.measurement.mode).toBe('full')
        expect(tokens(result.measurement.predictedInput), JSON.stringify(parameters)).toBe(
          tokens(base.measurement.predictedInput),
        )
      }
      const refusedSources: [string, PlanInput][] = [
        [
          'origin and basis on google-vertex',
          withGroup(input, g => {
            const request = g.inputCalibration.requestInput
            if (request.kind !== 'known') throw new Error('known source required')
            return {
              ...g,
              origin: { ...g.origin, provider: 'google-vertex' },
              inputCalibration: {
                ...g.inputCalibration,
                requestInput: {
                  ...request,
                  countingBasis: { ...request.countingBasis, provider: 'google-vertex' },
                },
              },
            }
          }),
        ],
        [
          'origin effort outside the set',
          withGroup(input, g => ({
            ...g,
            origin: {
              ...g.origin,
              parameters: { ...g.origin.parameters, reasoningEffort: 'max' },
            },
          })),
        ],
        [
          'origin extra parameters',
          withGroup(input, g => ({
            ...g,
            origin: {
              ...g.origin,
              parameters: { ...g.origin.parameters, extra: { thinking_budget: 1 } },
            },
          })),
        ],
      ]
      const actual: Record<string, unknown> = {}
      for (const [name, value] of refusedSources) actual[name] = await plan(value)
      expect(actual).toEqual(Object.fromEntries(refusedSources.map(([name]) => [name, refused])))
      // An origin provider that contradicts its own saved basis is judgeable by the shared gate.
      expect(
        await plan(
          withGroup(input, g => ({ ...g, origin: { ...g.origin, provider: 'google-vertex' } })),
        ),
      ).toEqual(malformed)
      // The published V3 meter has no E mechanism: a current basis that is not V4 refuses.
      const v3Input = noObservation({
        ...input,
        snapshot: {
          ...input.snapshot,
          adaptation: {
            ...input.snapshot.adaptation,
            definition: { modelId: leaf.modelId, revision: '3' },
            implementation: { name: 'pi-ai:google', revision: 'mp4-17' },
          },
        },
      })
      expect(await planRequest(v3Input, [googleV3Definition(leaf.modelId)], v3, signal())).toEqual(
        refused,
      )
    })

    it('refuses a cross-model group at the projection before metering (R-K)', async () => {
      const { input } = await roundTwo()
      const other = googleLeaves.find(item => item.modelId !== leaf.modelId)
      if (!other) throw new Error('two leaves required')
      const reroute = (blocks: Message['blocks']) =>
        blocks.map(block => {
          if (block.kind !== 'thinking' || block.opaque === undefined) return block
          const opaque = readOpaqueJson(block.opaque)
          if (!object(opaque)) return block
          return { ...block, opaque: toOpaqueJson({ ...opaque, routeName: other.modelId }) }
        })
      const foreign = noObservation({
        ...input,
        messages: input.messages.map(item =>
          item.type === 'assistant'
            ? judgedMessage({ ...item, blocks: reroute(item.blocks) })
            : item,
        ),
        outputHistory: [],
      })
      expect(await plan(foreign)).toEqual({ rejected: 'unavailable' })
    })

    type Identity = { readonly servingProvider?: string; readonly upstreamModel?: string }
    function identified(
      group: PlanOutputHistoryGroup,
      origin: Identity,
      reported: Identity = origin,
    ): PlanOutputHistoryGroup {
      const observed = group.inputCalibration.observedInput
      if (observed.kind === 'unavailable') throw new Error('observed provenance required')
      const {
        servingProvider: _originProvider,
        upstreamModel: _originModel,
        ...bareOrigin
      } = group.origin
      const {
        servingProvider: _reportedProvider,
        upstreamModel: _reportedModel,
        ...bareProvenance
      } = observed.provenance
      return {
        ...group,
        origin: { ...bareOrigin, ...origin },
        inputCalibration: {
          ...group.inputCalibration,
          observedInput: { ...observed, provenance: { ...bareProvenance, ...reported } },
        },
      }
    }

    it('admits the exact identity pair or both absent; refuses anything else (K4)', async () => {
      const { input } = await roundTwo()
      const real = { servingProvider: GOOGLE_SERVING_PROVIDER, upstreamModel: leaf.modelId }
      const group = input.outputHistory[0]
      if (!group) throw new Error('group required')
      expect(group.origin).toMatchObject(real)
      const admitted = await planned(noObservation(input))
      for (const identity of [real, {}]) {
        const result = await planned(withGroup(input, g => identified(g, identity)))
        expect(tokens(result.measurement.predictedInput), JSON.stringify(identity)).toBe(
          tokens(admitted.measurement.predictedInput),
        )
      }
      const suspects: [Identity, Identity][] = [
        ...[
          'google-ai-studio',
          'Google',
          'google ai studio',
          'GOOGLE AI STUDIO',
          'Google AI Studio ',
          ' Google AI Studio',
          'Google AI Studio | 2026-09-30',
          'Google Vertex',
        ].map(
          servingProvider =>
            [
              { servingProvider, upstreamModel: leaf.modelId },
              { servingProvider, upstreamModel: leaf.modelId },
            ] as [Identity, Identity],
        ),
        ...[
          leaf.modelId.toUpperCase(),
          `${leaf.modelId} `,
          leaf.modelId.replace('google/', ''),
          `${leaf.modelId}-20260930`,
          googleLeaves.find(item => item.modelId !== leaf.modelId)?.modelId ?? '',
        ].map(
          upstreamModel =>
            [
              { servingProvider: GOOGLE_SERVING_PROVIDER, upstreamModel },
              { servingProvider: GOOGLE_SERVING_PROVIDER, upstreamModel },
            ] as [Identity, Identity],
        ),
        // A lone field is not the pair.
        [
          { servingProvider: GOOGLE_SERVING_PROVIDER },
          { servingProvider: GOOGLE_SERVING_PROVIDER },
        ],
        [{ upstreamModel: leaf.modelId }, { upstreamModel: leaf.modelId }],
        // Origin and provenance must report the same pair, absence included.
        [real, {}],
        [{}, real],
      ]
      for (const [origin, reported] of suspects)
        expect(
          await plan(withGroup(input, g => identified(g, origin, reported))),
          JSON.stringify({ origin, reported }),
        ).toEqual(refused)
      // Same-name values that contradict each other are judgeable: malformed.
      expect(
        await plan(
          withGroup(input, g =>
            identified(g, real, {
              servingProvider: 'google-ai-studio',
              upstreamModel: leaf.modelId,
            }),
          ),
        ),
      ).toEqual(malformed)
    })
  })
})
