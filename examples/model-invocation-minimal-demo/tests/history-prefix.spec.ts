import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  readSettlementPrefix,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import {
  createOfficialProfileContent,
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
  defineInputMeter,
  planRequest,
  createImagePreparer,
  createSharpImageCodec,
  modelImageBalancedV1,
} from '@omne-harness-lite/pi-ai-transport'
import { type ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import {
  historyProjection,
  messagePrefix,
  messagePrefixWithSources,
  nativeCompatibility,
  readDemoCalibrationHistory,
} from '../src/model-request-text.ts'

const session = unwrap(parseOpaqueIdentifier('history-session', 'SessionRef'))
const callId = unwrap(parseOpaqueIdentifier('history-call', 'ModelCallId'))
const tenant = unwrap(parseTenantId({ organization: 'history-org', account: 'history-account' }))
const at = '2026-09-28T00:00:00Z'
const visibility = { toHuman: true, toModel: true }
// Valid native PNG: D109 prepares actual image bytes rather than opaque placeholders.
const imageBase64 = (
  await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00ff00' } })
    .png({ compressionLevel: 9 })
    .toBuffer()
).toString('base64')
const image = {
  id: 'image',
  kind: 'image',
  mediaType: 'image/png',
  data: { inline: imageBase64 },
  visibility,
}
function user(blocks: readonly unknown[]) {
  return { id: 'user', type: 'user', createdAt: at, blocks }
}
async function prefix(values: readonly unknown[]) {
  const entries = values.map((value, index) => {
    const captured = captureModelLogValue({ category: 'message', input: { kind: 'value', value } })
    if ('invalidValue' in captured) throw new Error(`capture: ${captured.reason}`)
    const entry = prepareModelLogEntry({
      session,
      shell: { tenant },
      captured: captured.ok,
      purpose: { kind: 'message' },
      messagePrefix: [],
    })
    if ('invalidValue' in entry) throw new Error(`prepare: ${entry.reason}`)
    return { ...entry.ok, session, position: index + 1 }
  })
  const generation = {}
  const registration: SettlementRegistration = {
    start(_kind, operation) {
      const controller = new AbortController()
      const completion = operation(controller.signal)
      return {
        completion,
        stopped: completion.then(() => undefined),
        requestStop: () => controller.abort(),
      }
    },
    release() {},
  }
  const result = await readSettlementPrefix({
    registration,
    binding: {
      session,
      tenant,
      generation,
      currentGeneration: () => generation,
      log: {
        readSince: async () => ({ entries, tail: entries.length }),
        readByKey: async () => {
          throw new Error('full history must not use key-filtered reads')
        },
        append: async () => {
          throw new Error('read-only test')
        },
      },
    },
  })
  if ('unavailable' in result) throw new Error(result.reason)
  return result.prefix
}
function profile(definition: ModelDefinition) {
  const result = createOfficialProfileContent(definition, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in result) throw new Error(result.rejected)
  return { ...result.ok, registration: 'listed' as const, updatedAt: at }
}

describe('complete demo history without a text-only whitelist', () => {
  it('preserves an image and a reminder through decoding and into the public transport plan', async () => {
    const originals = [
      user([image]),
      {
        id: 'reminder',
        type: 'system_reminder',
        createdAt: at,
        nature: 'event',
        source: { kind: 'extension', extension: 'fixture' },
        blocks: [{ id: 'notice', kind: 'text', text: 'keep the image', visibility }],
      },
    ]
    const log = await prefix(originals)
    const history = messagePrefix(log)
    expect(history).toEqual({ messages: originals })
    if ('unavailable' in history) throw new Error('history rejected')
    const sourced = messagePrefixWithSources(log)
    if ('unavailable' in sourced) throw new Error('history sources rejected')
    expect(sourced.messages).toEqual(originals)
    expect(sourced.selectedMessageSources).toEqual(
      log.entries.map((entry, messageIndex) => ({ messageIndex, entry })),
    )
    expect(readDemoCalibrationHistory(log, history.messages, { callId, dispatch: 1 })).toEqual({
      noObservation: true,
    })
    expect(readDemoCalibrationHistory(log, history.messages, { callId, dispatch: 2 })).toEqual({
      sourceUnavailable: true,
    })
    expect(
      readDemoCalibrationHistory(log, [...history.messages].reverse(), { callId, dispatch: 1 }),
    ).toEqual({
      sourceUnavailable: true,
    })
    expect(await historyProjection(log)).toEqual({ known: ['image', 'text'] })
    // Explicit synthetic image-capable model; never publish or send it upstream.
    const definition: ModelDefinition = {
      ...deepseekV4Pro0813Definition,
      modelId: 'fixture/image-history',
      capabilities: {
        ...deepseekV4Pro0813Definition.capabilities,
        inputModalities: ['text', 'image'],
        inputConstraints: { maxImageBytes: 1048576 },
        upstreamInputLimits: {
          ...deepseekV4Pro0813Definition.capabilities.upstreamInputLimits,
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
      },
    }
    const imageProfile = profile(definition)
    expect(nativeCompatibility(imageProfile, ['image', 'text'])).toEqual({ ok: true })
    expect(nativeCompatibility(profile(deepseekV4Pro0813Definition), ['image', 'text'])).toEqual({
      blocked: ['image'],
    })
    const preparer = createImagePreparer(modelImageBalancedV1, createSharpImageCodec(sharp))
    if (!('ready' in preparer)) throw new Error('native image preparation unavailable')
    const planned = await planRequest(
      {
        calibration: { kind: 'none', reason: 'no_observation' },
        outputHistory: [],
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
        target: {
          kind: 'model_call',
          callId: unwrap(parseOpaqueIdentifier('history-call', 'ModelCallId')),
          dispatch: 1,
        },
        routeName: definition.modelId,
        provider: 'deepinfra/fp8',
        snapshot: {
          inputModalities: definition.capabilities.inputModalities,
          outputModalities: definition.capabilities.outputModalities,
          maxInputTokens: definition.capabilities.maxInputTokens,
          inputConstraints: imageProfile.inputConstraints,
          upstreamInputLimits: imageProfile.upstreamInputLimits,
          maxOutputTokens: definition.capabilities.maxOutputTokens,
          adaptation: imageProfile.adaptation,
          providers: imageProfile.providers,
          allowFallback: imageProfile.allowFallback,
          updatedAt: at,
        },
        parameters: {},
        tools: [],
        messages: history.messages,
      },
      [definition],
      defineInputMeter({
        modelId: definition.modelId,
        definitionRevision: definition.revision,
        implementation: definition.implementation,
        provider: 'deepinfra/fp8',
        algorithmRevision: 'synthetic-history-1',
        evidence: 'Controlled projection only; no upstream measurement claim',
        measureFull: () => ({ kind: 'exact', tokens: 1 }),
      }),
      { signal: new AbortController().signal },
      preparer.ready,
    ).finally(() => preparer.ready.close())
    if ('rejected' in planned) throw new Error(planned.rejected)
    expect(planned.planned.body.messages).toMatchObject([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      },
      { role: 'user', content: [{ type: 'text' }, { type: 'text', text: 'keep the image' }] },
    ])
    expect(planned.planned.input.messages).toEqual(originals)
  })
  it('keeps hidden originals and derived renderings intact without inventing modality requirements', async () => {
    const originals = [
      user([
        { ...image, id: 'hidden', visibility: { toHuman: true, toModel: false } },
        {
          ...image,
          transcript: 'image description',
          renderings: [
            {
              producedBy: 'system',
              blocks: [{ id: 'derived', kind: 'text', text: 'image description', visibility }],
            },
          ],
        },
        {
          id: 'file',
          kind: 'file',
          attachment: { storage: 'fixture', key: 'pdf', mediaType: 'application/pdf' },
          visibility,
        },
      ]),
    ]
    const log = await prefix(originals)
    expect(messagePrefix(log)).toEqual({ messages: originals })
    expect(await historyProjection(log)).toEqual({ known: [] })
  })
  it('counts original media by declared modality, including nested tool-result blocks', async () => {
    const log = await prefix([
      {
        id: 'reminder',
        type: 'system_reminder',
        createdAt: at,
        nature: 'event',
        source: { kind: 'background_execution_finished', callId: 'old-tool', outcome: 'completed' },
        blocks: [
          {
            id: 'result',
            kind: 'tool_result',
            callId: 'old-tool',
            outcome: 'completed',
            visibility,
            blocks: [
              image,
              {
                id: 'voice',
                kind: 'voice',
                mediaType: 'audio/wav',
                data: { inline: 'YXVkaW8=' },
                visibility,
              },
              {
                id: 'video',
                kind: 'file',
                attachment: { storage: 'fixture', key: 'video', mediaType: 'video/mp4' },
                visibility,
              },
            ],
          },
        ],
      },
    ])
    expect(messagePrefix(log)).toHaveProperty('messages')
    expect(await historyProjection(log)).toEqual({ known: ['image', 'audio', 'video'] })
  })
})
