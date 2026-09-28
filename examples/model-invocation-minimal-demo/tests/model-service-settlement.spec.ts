import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type UserMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const SESSION = 'settlement-vetoed-session'

function user(): UserMessage {
  const judged = judgeMessage({
    type: 'user',
    id: 'settlement-vetoed-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'settlement-vetoed-text',
        kind: 'text',
        text: 'Reply in one sentence.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('user fixture invalid')
  return judged.ok
}

describe('S-49 settlement through the actual demo model service', () => {
  it('recognizes a committed veto twice and reports a competing consumed disposition as alreadyEnded', async () => {
    const config = await callDeployment('service-settlement-vetoed')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    try {
      await app.ready
      const who = await actor(app)
      const prepared = await app.prepareSession(who, SESSION)
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      const bound = await app.bindModelRuntime(who, prepared.session)
      if (!('service' in bound)) throw new Error('runtime binding failed')
      expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
      expect(
        await bound.service.selectModel({ session: prepared.session, routeName: MODEL }),
      ).toEqual({
        selected: MODEL,
      })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('settlement-vetoed-key'),
          body: Buffer.from('controlled-settlement-key'),
        })),
      ).toEqual({ stored: true })

      const sent = await app.startServiceCall(who, prepared.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error(`real request did not hand off a reply: ${JSON.stringify(sent)}`)
      expect(tls.requests).toHaveLength(1)
      const key = { session: prepared.session, callId: sent.callId }
      const vetoed = {
        ...key,
        disposition: { vetoed: { by: 'input-gate', reason: 'not publishable' } },
      }
      const consumed = { ...key, disposition: { consumed: { by: 'side_query' as const } } }
      expect(await bound.service.settleReply(vetoed)).toEqual({
        callId: sent.callId,
        state: 'complete',
      })
      const first = await app.readSessionLog(who, prepared.session)
      if (!('entries' in first)) throw new Error('durable session read unavailable')
      const responseEntries = first.entries.filter(entry =>
        entry.readKeys.some(rawKey => {
          const decoded = decodeModelLogKey(rawKey)
          return 'ok' in decoded && decoded.ok.kind === 'response'
        }),
      )
      expect(responseEntries).toHaveLength(1)
      const response = writeJsonLossless(responseEntries[0]?.payload)
      expect(response).toContain('"outcome":"complete"')
      expect(response).toContain(
        '"replyDisposition":{"vetoed":{"by":"input-gate","reason":"not publishable"}}',
      )
      expect(response).toContain('"input_tokens":5')
      expect(response).toContain('"output_tokens":3')
      expect(response).toContain('"cache_read_tokens":4')
      expect(response).toContain('"cache_write_tokens":0')
      expect(response).toContain('"cost_usd":0.0000117')
      expect(response).toContain('"source":"upstream_usage"')
      expect(
        first.entries.filter(entry =>
          entry.readKeys.some(rawKey => {
            const decoded = decodeModelLogKey(rawKey)
            return 'ok' in decoded && decoded.ok.kind === 'message'
          }),
        ),
      ).toHaveLength(1)
      expect(await bound.service.settleReply(vetoed)).toEqual({
        callId: sent.callId,
        state: 'complete',
      })
      expect(await bound.service.settleReply(consumed)).toEqual({ alreadyEnded: true })
      expect(await app.readSessionLog(who, prepared.session)).toEqual(first)
      expect(tls.requests).toHaveLength(1)
      expect(await host.stop()).toEqual({ released: true })
    } finally {
      await host.stop()
      await app.close()
      await tls.close()
    }
  })
})
