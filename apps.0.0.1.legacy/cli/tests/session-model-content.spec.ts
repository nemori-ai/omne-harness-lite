import { expect, test, vi } from 'vitest'
import { contentBlockFromRepresentation } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type {
  SettlementLogBinding,
  ModelCallContentValue,
} from '@omne-harness-lite/model-request-runtime'
import { createSessionModelContentCustody } from '../src/session-model-content.ts'
import { originalPending } from './model-result-fixture.ts'

const tenant = unwrap(parseTenantId({ organization: 'custody-org', account: 'custody-user' }))
const session = unwrap(parseOpaqueIdentifier('custody-session', 'SessionRef'))
const unused = async (): Promise<never> => {
  throw new Error('unexpected log access')
}
const generation = {}
const binding: SettlementLogBinding = {
  tenant,
  session,
  generation,
  currentGeneration: () => generation,
  log: { append: unused, readByKey: unused, readSince: unused },
}
const reference = (key: string) => ({
  storage: 'cli-tool-results',
  key,
  mediaType: key.endsWith('-rendering') ? 'audio/wav' : 'image/png',
  bytes: 3,
})
function image(key: string) {
  const block = contentBlockFromRepresentation({
    id: key,
    kind: 'image',
    data: reference(key),
    mediaType: 'image/png',
    visibility: { toHuman: false, toModel: false },
    transcript: 'Hidden image',
    renderings: [
      {
        producedBy: 'system',
        blocks: [
          {
            id: key + '-rendering',
            kind: 'voice',
            data: reference(key + '-rendering'),
            mediaType: 'audio/wav',
            visibility: { toHuman: false, toModel: false },
          },
        ],
      },
    ],
  })
  if (block.kind !== 'image') throw new Error('image fixture required')
  return block
}
function message(key: string) {
  const parsed = judgeMessage({
    id: key + '-message',
    type: 'user',
    createdAt: '2026-10-10T00:00:00Z',
    blocks: [image(key)],
  })
  if (!('ok' in parsed)) throw new Error(JSON.stringify(parsed))
  return parsed.ok
}
function created(): ModelCallContentValue {
  const pending = originalPending()
  return {
    kind: 'created',
    value: {
      kind: 'created',
      ref: { session, callId: pending.call.callId },
      creationKey: unwrap(parseOpaqueIdentifier('creation', 'CreationKey')),
      origin: { tenant, session },
      input: {
        target: 'controlled/model',
        messages: [message('input')],
        tools: [],
        sourceVersions: {},
        basis: {
          routeName: 'controlled/model',
          profile: pending.route.profile,
          selectedBy: 'session',
          selected: 'controlled/model',
        },
      },
      status: 'accepted',
      adopted: {
        profile: pending.route.profile,
        profileSnapshot: pending.route.profileSnapshot,
        adaptation: pending.route.adaptation,
        parameters: {},
        selectedBy: 'session',
        messages: [message('adopted')],
        tools: [],
        contextSources: {},
      },
    },
  }
}
test('confirms every original and adopted attachment, including hidden renderings', async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]))
  expect(
    await createSessionModelContentCustody(read).confirm({ binding, content: created() }),
  ).toEqual({ retained: true })
  expect(read.mock.calls).toHaveLength(4)
  expect(read).toHaveBeenCalledWith({ tenant, session }, reference('input'))
  expect(read).toHaveBeenCalledWith({ tenant, session }, reference('adopted-rendering'))
})
test('refuses custody when the original owner cannot read an attachment', async () => {
  const read = vi.fn(async () => undefined)
  expect(
    await createSessionModelContentCustody(read).confirm({ binding, content: created() }),
  ).toEqual({ unavailable: true })
  expect(read).toHaveBeenCalledTimes(1)
})
test('confirms reply attachments and the raw response body before claiming custody', async () => {
  const pending = originalPending()
  if (pending.outcome !== 'complete' || pending.reply.ending !== 'complete')
    throw new Error('complete reply required')
  const content: ModelCallContentValue = {
    kind: 'reply_ready',
    value: {
      ...pending,
      reply: { ...pending.reply, blocks: [image('reply')] },
      raw: { body: reference('raw') },
    },
  }
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]))
  expect(await createSessionModelContentCustody(read).confirm({ binding, content })).toEqual({
    retained: true,
  })
  expect(read.mock.calls).toHaveLength(3)
  expect(read).toHaveBeenCalledWith({ tenant, session }, reference('raw'))
})
