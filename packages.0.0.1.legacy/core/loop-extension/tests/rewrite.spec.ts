import { expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { rewriteChangesImmutable } from '../src/rewrite.ts'
import { call, result, user, assistant, visibility } from './helpers.ts'

it('LE-REWRITE-USER: producer immutable, entire user message can change', () => {
  const original = { message: user, producer: 'user' }
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...original,
      message: {
        ...user,
        blocks: [{ id: 'redacted', kind: 'text', text: '[redacted]', visibility }],
      },
    }),
  ).toBe(false)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...original,
      producer: 'system',
    }),
  ).toBe(true)
})
it('LE-REWRITE-MODEL: only add renderings/transcript to previously underived media', () => {
  const media = {
    id: 'voice_1',
    kind: 'voice',
    mediaType: 'audio/wav',
    data: { inline: 'AA==' },
    visibility,
  }
  const renderings = [
    {
      producedBy: 'system',
      blocks: [{ id: 'derived_1', kind: 'text', text: 'spoken words', visibility }],
    },
  ]
  const original = { producer: 'model', message: { ...assistant, blocks: [media] } }
  const convertedMedia = { ...media, renderings, transcript: 'spoken words' }
  const converted = { producer: 'model', message: { ...assistant, blocks: [convertedMedia] } }
  expect(rewriteChangesImmutable('before_persist_message', original, converted)).toBe(false)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...converted,
      message: { ...converted.message, id: 'other' },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...converted,
      message: { ...converted.message, createdAt: '2026-09-24T00:00:00Z' },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...converted,
      message: { ...converted.message, blocks: [convertedMedia, media] },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...converted,
      message: { ...converted.message, blocks: [{ ...convertedMedia, id: 'other' }] },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_persist_message', converted, {
      ...converted,
      message: { ...converted.message, blocks: [{ ...convertedMedia, transcript: 'changed' }] },
    }),
  ).toBe(true)
  const text = { id: 'text_1', kind: 'text', text: 'original words', visibility }
  expect(
    rewriteChangesImmutable(
      'before_persist_message',
      { producer: 'model', message: { ...assistant, blocks: [text] } },
      {
        producer: 'model',
        message: { ...assistant, blocks: [{ ...text, text: 'different words' }] },
      },
    ),
  ).toBe(true)
})
it('LE-REWRITE-MODEL-EXACT: old attachment size never compares through a rounded JS projection', () => {
  const attachment = {
    storage: 's',
    key: 'k',
    mediaType: 'text/plain',
    bytes: new LosslessNumber('9007199254740993'),
  }
  const file = { id: 'file_1', kind: 'file', attachment, visibility }
  const original = { producer: 'model', message: { ...assistant, blocks: [file] } }
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...original,
      message: {
        ...original.message,
        blocks: [
          { ...file, attachment: { ...attachment, bytes: new LosslessNumber('9007199254740992') } },
        ],
      },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_persist_message', original, {
      ...original,
      message: {
        ...original.message,
        blocks: [
          {
            ...file,
            attachment: { ...attachment, bytes: new LosslessNumber('9007199254740993.0') },
          },
        ],
      },
    }),
  ).toBe(false)
})
it('LE-REWRITE-REQUEST: only parameters/messages mutable', () => {
  const request = {
    target: 'a',
    parameters: { temperature: 0.2 },
    messages: [user],
    tools: ['shell'],
  }
  expect(
    rewriteChangesImmutable(
      'before_model_call',
      { request },
      { request: { ...request, parameters: { temperature: 0.1 }, messages: [] } },
    ),
  ).toBe(false)
  expect(
    rewriteChangesImmutable(
      'before_model_call',
      { request },
      { request: { ...request, target: 'b' } },
    ),
  ).toBe(true)
  expect(
    rewriteChangesImmutable(
      'before_model_call',
      { request },
      { request: { ...request, tools: [] } },
    ),
  ).toBe(true)
})
it('LE-REWRITE-CALL: arguments only, unparseable parameters never repaired', () => {
  const original = { call, definition: { name: 'shell' }, batch: ['call_01'] }
  expect(
    rewriteChangesImmutable('before_action', original, {
      ...original,
      call: { ...call, arguments: { command: 'safe' } },
    }),
  ).toBe(false)
  for (const key of ['id', 'callId', 'tool'])
    expect(
      rewriteChangesImmutable('before_action', original, {
        ...original,
        call: { ...call, [key]: 'other' },
      }),
    ).toBe(true)
  expect(
    rewriteChangesImmutable('before_action', original, {
      ...original,
      definition: { name: 'other' },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('before_action', original, { ...original, batch: ['call_99'] }),
  ).toBe(true)
  const { arguments: parsed, ...base } = call
  expect(parsed).toBeDefined()
  const unparseable = { ...original, call: { ...base, rawArguments: '{broken', unparseable: true } }
  expect(
    rewriteChangesImmutable('before_action', unparseable, {
      ...original,
      call: { ...call, arguments: {} },
    }),
  ).toBe(true)
})
it('LE-REWRITE-RESULT: outer and inner call identity/outcome immutable', () => {
  const original = { callId: 'call_01', outcome: 'completed', result }
  expect(
    rewriteChangesImmutable('after_action', original, {
      ...original,
      result: { ...result, blocks: [{ id: 'text_1', kind: 'text', text: 'summary', visibility }] },
    }),
  ).toBe(false)
  expect(
    rewriteChangesImmutable('after_action', original, { ...original, callId: 'call_99' }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('after_action', original, {
      ...original,
      result: { ...result, callId: 'call_99' },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('after_action', original, {
      ...original,
      result: { ...result, outcome: 'no_answer' },
    }),
  ).toBe(true)
  expect(
    rewriteChangesImmutable('after_action', { callId: 'call_01', outcome: 'completed' }, original),
  ).toBe(false)
  expect(
    rewriteChangesImmutable(
      'after_action',
      { callId: 'call_01', outcome: 'completed' },
      { ...original, result: { ...result, callId: 'call_99' } },
    ),
  ).toBe(true)
})
