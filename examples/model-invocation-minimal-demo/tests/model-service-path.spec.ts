import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const AT = '2026-09-28T00:00:00Z'

describe('demo unified service path', () => {
  it('selects, dispatches once and commits one real reply/response batch', async () => {
    const config = await callDeployment('demo-service-path')
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
      const prepared = await app.prepareSession(who, 'demo-service-session')
      if (!('session' in prepared)) throw new Error('session preparation failed')
      expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
      const bound = await app.bindModelRuntime(who, prepared.session)
      if (!('service' in bound)) throw new Error('runtime binding failed')
      expect(
        await bound.service.selectModel({ session: prepared.session, routeName: MODEL }),
      ).toEqual({ selected: MODEL })
      const credential = await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref('service-path-key'),
        body: Buffer.from('controlled-service-path-key'),
      }))
      expect(credential).toEqual({ stored: true })
      const user = judgeMessage({
        type: 'user',
        id: 'user-service-path',
        createdAt: AT,
        blocks: [
          {
            id: 'text-service-path',
            kind: 'text',
            text: 'hello service',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in user) || user.ok.type !== 'user') throw new Error('user fixture invalid')
      const deliveries: string[] = []
      let visibleChecked = false
      let openedBeforeVisible = false
      const openedObserver = await app.openModelObserver(
        who,
        prepared.session,
        undefined,
        async serialized => {
          deliveries.push(serialized)
          if (serialized.includes('"t":"fill"')) {
            const history = await app.readSessionLog(who, prepared.session)
            openedBeforeVisible =
              'entries' in history &&
              history.entries.some(entry =>
                entry.readKeys.some(key => {
                  const decoded = decodeModelLogKey(key)
                  return 'ok' in decoded && decoded.ok.kind === 'opened'
                }),
              )
            visibleChecked = true
          }
        },
      )
      if (!('endpoint' in openedObserver)) throw new Error('observer grant unavailable')
      const sent = await app.startServiceTextCall(who, prepared.session, {
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
        observer: {
          session: prepared.session,
          endpoint: openedObserver.endpoint,
          observer_max_buffered_events: 64,
          observer_max_buffered_bytes: 65_536,
        },
        user: user.ok,
      })
      if (!('result' in sent) || !('callId' in sent))
        throw new Error(`service dispatch rejected: ${JSON.stringify(sent)}`)
      if (!('replyPending' in sent.result))
        throw new Error(`service dispatch did not hand off reply: ${JSON.stringify(sent.result)}`)
      expect(tls.requests).toHaveLength(1)
      await expect.poll(() => deliveries.length, { timeout: 1000 }).toBeGreaterThan(0)
      expect(deliveries[0]).toContain('"kind":"snapshot"')
      await expect.poll(() => visibleChecked, { timeout: 1000 }).toBe(true)
      expect(openedBeforeVisible).toBe(true)
      const settled = await app.persistModelReply(who, prepared.session, sent.result.replyPending)
      if (!('settled' in settled))
        throw new Error(`reply commit unavailable: ${JSON.stringify(settled)}`)
      expect(settled.settled.response.response?.replyDisposition).toBe('persisted')
      const read = await app.readSessionLog(who, prepared.session)
      if (!('entries' in read)) throw new Error('session history unavailable')
      const durable = JSON.stringify(read.entries)
      expect(durable.match(/"replyDisposition":"persisted"/gu)).toHaveLength(1)
      expect(
        read.entries.filter(entry =>
          entry.readKeys.some(key => {
            const decoded = decodeModelLogKey(key)
            return 'ok' in decoded && decoded.ok.kind === 'message'
          }),
        ),
      ).toHaveLength(2)
      expect(
        await bound.service.readAttempts({ session: prepared.session, callId: sent.callId }),
      ).toHaveProperty('state', 'complete')
      expect(
        await bound.service.releaseCall({ session: prepared.session, callId: sent.callId }),
      ).toEqual({ alreadyEnded: true })
      expect(await host.stop()).toEqual({ released: true })
      expect(await openedObserver.revoke()).toEqual({ released: true })
    } finally {
      await host.stop()
      await app.close()
      await tls.close()
    }
  })
})
