import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type {
  FixedModelRequest,
  MediaMeasurementFact,
  ModelProfile,
  MeterRepresentation,
} from '@omne-harness/model-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { composeFamilies, type PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import { officialKimiProfiles, KIMI_RECORDS } from '../src/index.ts'
import { FAMILY } from './support/kimi.ts'
const root = fileURLToPath(new URL('./fixtures/records/', import.meta.url))
function fixture(record: (typeof KIMI_RECORDS)[number]) {
  return JSON.parse(
    readFileSync(
      join(root, encodeURIComponent(record.name), record.revision, 'request.json'),
      'utf8',
    ),
  ) as { request: object }
}
function checked(value: object): FixedModelRequest {
  const result = judgeFixedModelRequest(value)
  if (!('ok' in result)) throw Error(JSON.stringify(result.failure))
  return result.ok
}
async function withBinding(
  record: (typeof KIMI_RECORDS)[number],
  fn: (binding: PiFamilyBinding, request: FixedModelRequest) => Promise<void>,
) {
  const request = checked(fixture(record).request),
    acquired = await composeFamilies([FAMILY]).acquire(
      request.suppliers[0],
      new AbortController().signal,
    )
  if (!('ok' in acquired)) throw Error(JSON.stringify(acquired.failure))
  try {
    await fn(acquired.ok, request)
  } finally {
    await acquired.ok.release()
  }
}
function profile(request: FixedModelRequest): ModelProfile {
  const revision = decodeRevision('1')
  if (!('ok' in revision)) throw Error('revision')
  const definition = officialKimiProfiles({
    retryPolicy: request.retryPolicy,
    compactionTriggerPercent: '80',
  }).find(x => x.suppliers[0].model === request.suppliers[0].model)
  if (!definition) throw Error('profile')
  return {
    identity: { scope: { kind: 'factory' }, route: request.suppliers[0].model },
    adoption: request.profile,
    revision: revision.ok,
    updatedAt: '2026-11-23T00:00:00Z',
    availability: 'active',
    definition,
  }
}
async function planned(binding: PiFamilyBinding, request: FixedModelRequest) {
  const p = profile(request),
    out = binding.rules.plan({ profile: p, supplier: request.suppliers[0], assembled: request })
  if (!('ok' in out)) throw Error(JSON.stringify(out.failure))
  return { p, ...out.ok }
}
async function measured(
  binding: PiFamilyBinding,
  request: FixedModelRequest,
  media: readonly MediaMeasurementFact[] = [],
) {
  const plan = await planned(binding, request)
  const representation: MeterRepresentation = { ...plan.representation, media }
  return binding.meter.measure({
    profile: plan.p.adoption,
    supplier: plan.p.definition.suppliers[0],
    context: plan.p.definition.context,
    limits: plan.p.definition.limits,
    assembled: request,
    parameters: plan.parameters,
    representation,
  })
}
function amount(result: Awaited<ReturnType<typeof measured>>) {
  if (!('ok' in result)) throw Error(JSON.stringify(result.failure))
  const input = result.ok.checks.find(x => x.metric === 'input-tokens')
  if (!input) throw Error('input')
  return BigInt(input.measurement.amount)
}
const reference = {
  storage: 'test',
  key: 'image-1',
  mediaType: 'image/png',
  bytes: '249',
  digest: 'synthetic-png',
}
const fact: MediaMeasurementFact = {
  reference,
  bytes: '249',
  mediaType: 'image/png',
  kind: 'image',
  widthPixels: '112',
  heightPixels: '112',
}
function imageRequest(request: FixedModelRequest, count = 1) {
  const message = request.messages[0]
  if (!message) throw Error('fixture message')
  return checked({
    ...request,
    messages: [
      {
        ...message,
        blocks: [
          ...message.blocks,
          ...Array.from({ length: count }, (_, i) => ({
            kind: 'image',
            id: 'image' + i,
            visibility: { toModel: true, toHuman: true },
            mediaType: 'image/png',
            // Exact synthetic PNG sent in the real K3 vision probe.
            inline:
              'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAv0lEQVR4nO3QsQnAABDEsN9/6aRPBvAVAvcG3XM3Vf3/Vf8BAQIEaKn6DwgQIEBT1X9AgAABWqr+AwIECNBU9R8QIECAlqr/gAABAjRV/QcECBCgpeo/IECAAE1V/wEBAgRoqfoPCBAgQFPVf0CAAAFaqv4DAgQI0FT1HxAgQICWqv+AAAECNFX9BwQIEKCl6j8gQIAATVX/AQECBGip+g8IECBAU9V/QIAAAVqq/gMCBAjQVPUfECBAgJaq/99ejf3eDpgwXjQAAAAASUVORK5CYII=',
          })),
        ],
      },
    ],
  })
}
it.each(KIMI_RECORDS)(
  'measures every PNG tile and refuses missing or invalid dimensions for $name',
  record =>
    withBinding(record, async (binding, request) => {
      const image = imageRequest(request)
      expect(await measured(binding, image)).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'image-measurement-missing' },
      })
      for (const widthPixels of ['0', '-1'])
        expect(await measured(binding, image, [{ ...fact, widthPixels }])).toMatchObject({
          failure: { kind: 'unavailable', diagnostic: 'invalid-image-dimensions' },
        })
      for (const heightPixels of ['0', '-1'])
        expect(await measured(binding, image, [{ ...fact, heightPixels }])).toMatchObject({
          failure: { kind: 'unavailable', diagnostic: 'invalid-image-dimensions' },
        })
      const complete = await measured(binding, image, [fact])
      if (!('ok' in complete)) throw Error(JSON.stringify(complete.failure))
      expect(complete.ok.checks.find(check => check.metric === 'image-bytes')).toMatchObject({
        subject: 'image-1',
        measurement: { kind: 'exact', amount: '249' },
        limit: '4194304',
      })
      const overLimit = await measured(binding, image, [{ ...fact, bytes: '4194305' }])
      if (!('ok' in overLimit)) throw Error(JSON.stringify(overLimit.failure))
      expect(overLimit.ok.checks.find(check => check.metric === 'image-bytes')).toMatchObject({
        measurement: { kind: 'exact', amount: '4194305' },
        limit: '4194304',
      })
      const base = amount(complete)
      for (const [width, height, increment] of [
        [28, 28, -15],
        [29, 28, -14],
        [28, 29, -14],
        [29, 29, -12],
        [192, 192, 33],
        [1024, 1024, 1353],
      ] as const) {
        const actual = amount(
          await measured(binding, image, [
            { ...fact, widthPixels: String(width), heightPixels: String(height) },
          ]),
        )
        expect(actual - base).toBe(BigInt(increment))
      }
      expect(await measured(binding, image, [fact, fact])).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'image-measurement-missing' },
      })
      const two = imageRequest(request, 2),
        first = amount(
          await measured(binding, two, [
            fact,
            { ...fact, reference: { ...reference, key: 'image-2' } },
          ]),
        )
      const doubled = amount(
        await measured(binding, two, [
          { ...fact, widthPixels: '224' },
          { ...fact, widthPixels: '224', reference: { ...reference, key: 'image-2' } },
        ]),
      )
      expect(doubled - first).toBe(32n)
    }),
)
it.each(KIMI_RECORDS)(
  'plans the real fixture content, schema and instruction into its counting representation for $name',
  record =>
    withBinding(record, async (binding, request) => {
      const tool = request.tools[0],
        message = request.messages[0],
        block = message?.blocks[0]
      if (!tool || !message || !block) throw Error('fixture structure')
      const plan = await planned(binding, request)
      const json = JSON.parse(writeJsonText(plan.representation.tokenInput))
      expect(json.messages[0]).toEqual({
        role: 'system',
        content: [{ type: 'text', text: 'Answer briefly. Call tools one at a time.' }],
      })
      expect(json.messages[1].content[0].text).toContain('positive integers below 100')
      expect(json.tools[0]).toEqual({
        name: tool.name,
        description: tool.description,
        parameters: JSON.parse(writeJsonText(tool.argumentsSchema)),
      })
      expect(json.tool_choice).toBe('auto')
      expect(JSON.parse(json.parameters)).toEqual(request.parameters)
      expect(plan.representation.units).toEqual([null, message.id])
      const noInstruction = await planned(binding, checked({ ...request, system: [] }))
      expect(
        JSON.parse(writeJsonText(noInstruction.representation.tokenInput)).messages,
      ).toHaveLength(1)
      const encoded = binding.encode({
        request,
        declaration: request.declarations[0],
        media: [],
        resent: [],
      })
      if (!('ok' in encoded)) throw Error(JSON.stringify(encoded.failure))
      expect(JSON.parse(writeJsonText(encoded.ok.body)).messages[1].content).toBe(
        block.kind === 'text' ? block.text : undefined,
      )
    }),
)
it.each(KIMI_RECORDS)(
  'returns the real sealed reasoning only to its accepted model scope for $name',
  record =>
    withBinding(record, async (binding, request) => {
      const first = binding.encode({
        request,
        declaration: request.declarations[0],
        media: [],
        resent: [],
      })
      if (!('ok' in first)) throw Error(JSON.stringify(first.failure))
      const facts = JSON.parse(
        readFileSync(
          join(root, encodeURIComponent(record.name), record.revision, 'facts.json'),
          'utf8',
        ),
      ) as { kind: string; block?: { kind: string; payload?: string; callId?: string } }[]
      const blocks = facts.filter(x => x.kind === 'block-seal').map(x => x.block)
      const state = blocks.find(x => x?.kind === 'reasoning_state')
      const call = blocks.find(x => x?.kind === 'tool_call')
      if (!state?.payload || !call?.callId) throw Error('fixture has no sealed reasoning/tool call')
      const next = checked({
        ...request,
        messages: [
          ...request.messages,
          {
            id: 'msg_' + 'a'.repeat(22),
            role: 'assistant',
            blocks,
            replay: {
              scope: 'openrouter/' + record.name,
              format: binding.replayFormat,
              at: [blocks.findIndex(x => x?.kind === 'reasoning_state')],
              prefix: first.ok.replayPrefix,
            },
          },
          {
            id: 'msg_' + 'b'.repeat(22),
            role: 'tool',
            blocks: [
              {
                kind: 'tool_result',
                id: 'result',
                visibility: { toModel: true, toHuman: true },
                callId: call.callId,
              },
              {
                kind: 'text',
                id: 'weather',
                visibility: { toModel: true, toHuman: true },
                text: 'Oslo: 7 degrees.',
              },
            ],
          },
        ],
      })
      const countPlan = await planned(binding, next)
      const countJson = JSON.parse(writeJsonText(countPlan.representation.tokenInput))
      const countedAssistant = countJson.messages.find(
        (message: { role: string }) => message.role === 'assistant',
      )
      expect(countedAssistant.reasoning_details).toEqual({ opaque: 1 })
      expect(
        countedAssistant.content.find((part: { type: string }) => part.type === 'tool_call'),
      ).toMatchObject({ id: call.callId, type: 'tool_call', name: 'get_weather' })
      expect(writeJsonText(countPlan.representation.tokenInput)).not.toContain(state.payload)
      expect(await measured(binding, next)).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'reasoning-not-countable' },
      })
      const encoded = binding.encode({
        request: next,
        declaration: next.declarations[0],
        media: [],
        resent: [],
      })
      if (!('ok' in encoded)) throw Error(JSON.stringify(encoded.failure))
      const body = JSON.parse(writeJsonText(encoded.ok.body))
      const assistant = body.messages.find((m: { role: string }) => m.role === 'assistant')
      expect(assistant.reasoning_details).toEqual([JSON.parse(state.payload)])
      expect(assistant.tool_calls[0].id).toBe(call.callId)
      expect(body.messages.find((m: { role: string }) => m.role === 'tool').tool_call_id).toBe(
        call.callId,
      )
      const changed = checked({
        ...next,
        system: [
          {
            kind: 'text',
            id: 'changed',
            visibility: { toModel: true, toHuman: true },
            text: 'A different prefix.',
          },
        ],
      })
      const after = binding.encode({
        request: changed,
        declaration: changed.declarations[0],
        media: [],
        resent: [],
      })
      if (!('ok' in after)) throw Error(JSON.stringify(after.failure))
      expect(
        JSON.parse(writeJsonText(after.ok.body)).messages.find(
          (m: { role: string }) => m.role === 'assistant',
        ).reasoning_details,
      ).toEqual([JSON.parse(state.payload)])
      const foreign = checked({
        ...next,
        messages: next.messages.map(m =>
          m.role === 'assistant'
            ? { ...m, replay: { ...m.replay, scope: 'openrouter/another-model' } }
            : m,
        ),
      })
      const omitted = binding.encode({
        request: foreign,
        declaration: foreign.declarations[0],
        media: [],
        resent: [],
      })
      if (!('ok' in omitted)) throw Error(JSON.stringify(omitted.failure))
      expect(
        JSON.parse(writeJsonText(omitted.ok.body)).messages.find(
          (m: { role: string }) => m.role === 'assistant',
        ).reasoning_details,
      ).toBeUndefined()
    }),
)
