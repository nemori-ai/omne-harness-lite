import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage, type UserMessage } from '@omne-harness-lite/messages'
import { deepseekV41FlashDefinition } from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'

const FLASH = deepseekV41FlashDefinition.modelId
const AT = '2026-09-28T00:00:00Z'
const VISIBLE = { toHuman: true, toModel: true }

function imageMessage(id: string, image: Buffer): UserMessage {
  const judged = judgeMessage({
    type: 'user',
    id,
    createdAt: AT,
    blocks: [
      { id: `${id}-text`, kind: 'text', text: `Inspect ${id}`, visibility: VISIBLE },
      {
        id: `${id}-image`,
        kind: 'image',
        mediaType: 'image/png',
        data: { inline: image.toString('base64') },
        visibility: VISIBLE,
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('media fixture invalid')
  return judged.ok
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function wireMessages(body: unknown): unknown[] {
  if (body === null || typeof body !== 'object' || !('messages' in body))
    throw new Error('wire body has no messages')
  if (!Array.isArray(body.messages)) throw new Error('wire messages are malformed')
  return body.messages
}

describe('service full UserMessage input', () => {
  it('retains two Flash images and the intervening answer across real TLS and durable turns', async () => {
    const config = await callDeployment('service-flash-media', 'flash')
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      FLASH,
    )
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    const fixture = new URL(
      '../../../packages/model/pi-ai-transport/tests/fixtures/deepseek-v41-flash/',
      import.meta.url,
    )
    const red = await readFile(new URL('public-red-544.png', fixture))
    const blue = await readFile(new URL('public-blue-1024.png', fixture))
    const users = [imageMessage('flash-red', red), imageMessage('flash-blue', blue)]
    try {
      await app.ready
      const who = await actor(app)
      const prepared = await app.prepareSession(who, 'service-flash-media-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(await app.selectModel(who, prepared.session, FLASH)).toEqual({ selected: FLASH })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('flash-media-key'),
          body: Buffer.from('controlled-flash-media-key'),
        })),
      ).toEqual({ stored: true })

      for (const user of users) {
        const sent = await app.startServiceCall(who, prepared.session, {
          user,
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error(`Flash call rejected: ${JSON.stringify(sent)}`)
        const settled = await app.persistModelReply(who, prepared.session, sent.result.replyPending)
        if (!('settled' in settled))
          throw new Error(`Flash reply not durable: ${JSON.stringify(settled)}`)
      }

      expect(tls.requests).toHaveLength(2)
      const expectedRed = {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect flash-red' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${red.toString('base64')}` },
          },
        ],
      }
      const expectedBlue = {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect flash-blue' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${blue.toString('base64')}` },
          },
        ],
      }
      expect(wireMessages(tls.requests[0]?.body).at(-1)).toEqual(expectedRed)
      expect(wireMessages(tls.requests[1]?.body).slice(-3)).toEqual([
        expectedRed,
        { role: 'assistant', content: 'first second' },
        expectedBlue,
      ])

      const read = await app.readSessionLog(who, prepared.session)
      if (!('entries' in read)) throw new Error('durable history unavailable')
      const messages = read.entries.flatMap(entry => {
        const payload = entry.payload
        if (payload === null || typeof payload !== 'object' || !('value' in payload)) return []
        const value = payload.value
        return value !== null &&
          typeof value === 'object' &&
          'type' in value &&
          (value.type === 'user' || value.type === 'assistant')
          ? [value]
          : []
      })
      expect(messages).toHaveLength(4)
      expect(digest(messages[0])).toBe(digest(users[0]))
      expect(digest(messages[2])).toBe(digest(users[1]))
      expect(JSON.stringify(messages[1])).toContain('first second')
      expect(JSON.stringify(messages[3])).toContain('first second')
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      await app.close()
      await tls.close()
    }
  })
})
