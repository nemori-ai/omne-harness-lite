import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import type { AcceptanceEvent } from '../src/types.ts'
import { callDeployment, publication, ROOT } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'

function user(label: string) {
  const parsed = judgeMessage({
    type: 'user',
    id: `diagnostic-user-${label}`,
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: `diagnostic-text-${label}`,
        kind: 'text',
        text: `private diagnostic prompt ${label}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in parsed) || parsed.ok.type !== 'user') throw new Error('invalid user fixture')
  return parsed.ok
}

describe('demo diagnostic correlation', () => {
  it('keeps two real sessions separate and projects observer rejection position/counts', async () => {
    const base = await callDeployment('diagnostic-two-sessions')
    const tls = await createLocalTls(join(dirname(base.databaseFile), 'tls'))
    let revision = 0
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          async prepare(who: Parameters<typeof publication>[0]) {
            const expectedRevision = revision === 0 ? null : String(revision)
            revision += 1
            return {
              publication: publication(who, expectedRevision),
              recipe: { rootDefinition: ROOT },
            }
          },
        },
      },
    }
    const recorded: AcceptanceEvent[] = []
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record: event => recorded.push(event) },
    })
    const firstHost = createDemoCallHost()
    const secondHost = createDemoCallHost()
    let revoke: (() => Promise<unknown>) | undefined
    try {
      await app.ready
      const who = await actor(app)
      const first = await app.prepareSession(who, 'diagnostic-session-first')
      const second = await app.prepareSession(who, 'diagnostic-session-second')
      if (!('session' in first) || !('session' in second))
        throw new Error('two session preparations failed')
      expect(await app.prepareModelInputs(who, first.session)).toEqual({ prepared: true })
      expect(await app.prepareModelInputs(who, second.session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, first.session, 'deepseek/deepseek-v4-pro-0813')).toEqual({
        selected: 'deepseek/deepseek-v4-pro-0813',
      })
      expect(await app.selectModel(who, second.session, 'deepseek/deepseek-v4-pro-0813')).toEqual({
        selected: 'deepseek/deepseek-v4-pro-0813',
      })
      expect(await app.attachModelCallHost(who, first.session, firstHost)).toEqual({
        attached: true,
      })
      expect(await app.attachModelCallHost(who, second.session, secondHost)).toEqual({
        attached: true,
      })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('diagnostic-two-sessions-key'),
          body: Buffer.from('diagnostic-private-credential'),
        })),
      ).toEqual({ stored: true })
      const observer = await app.openModelObserver(who, first.session, undefined, async () => {
        throw new Error('controlled observer rejection')
      })
      if (!('endpoint' in observer)) throw new Error('observer grant unavailable')
      revoke = observer.revoke
      const [firstSent, secondSent] = await Promise.all([
        app.startServiceCall(who, first.session, {
          user: user('first'),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: firstHost.host,
          observer: {
            session: first.session,
            endpoint: observer.endpoint,
            observer_max_buffered_events: 1,
            observer_max_buffered_bytes: 65_536,
          },
        }),
        app.startServiceCall(who, second.session, {
          user: user('second'),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: secondHost.host,
        }),
      ])
      if (
        !('callId' in firstSent) ||
        !('result' in firstSent) ||
        !('replyPending' in firstSent.result) ||
        !('callId' in secondSent) ||
        !('result' in secondSent) ||
        !('replyPending' in secondSent.result)
      )
        throw new Error('concurrent real service calls did not complete')
      expect(
        await app.persistModelReply(who, first.session, firstSent.result.replyPending),
      ).toHaveProperty('settled')
      expect(
        await app.persistModelReply(who, second.session, secondSent.result.replyPending),
      ).toHaveProperty('settled')
      const settlements = recorded.flatMap(event =>
        event.settlement === undefined ? [] : [event.settlement],
      )
      expect(settlements.length).toBeGreaterThan(0)
      for (const [session, call] of [
        [first.session, firstSent.callId],
        [second.session, secondSent.callId],
      ] as const) {
        const related = settlements.filter(event => event.session === session)
        expect(related.length).toBeGreaterThan(0)
        expect(related.every(event => event.call === call)).toBe(true)
        expect(related.every(event => event.tenant.account === who.account)).toBe(true)
        expect(related.every(event => event.response.length > 0)).toBe(true)
        expect(related.every(event => event.owner.endsWith(`:${session}`))).toBe(true)
        expect(related.every(event => event.policy === 'explicit-acceptance-contention')).toBe(true)
        expect(related.every(event => event.submissions !== undefined)).toBe(true)
        expect(related.every(event => event.tailConflicts !== undefined)).toBe(true)
      }
      const rejection = recorded
        .flatMap(event => (event.observer === undefined ? [] : [event.observer]))
        .find(event => event.reason === 'consumer_failed')
      expect(rejection).toMatchObject({
        session: first.session,
        tenant: first.tenant,
        callId: firstSent.callId,
        stage: 'delivery',
        reason: 'consumer_failed',
      })
      expect(isNonNegativeJsonInteger(rejection?.dispatch)).toBe(true)
      expect(isNonNegativeJsonInteger(rejection?.position)).toBe(true)
      expect(isNonNegativeJsonInteger(rejection?.bufferedEvents)).toBe(true)
      expect(isNonNegativeJsonInteger(rejection?.bufferedBytes)).toBe(true)
      const output = JSON.stringify(recorded)
      expect(output).not.toContain('diagnostic-private-credential')
      expect(output).not.toContain('private diagnostic prompt')
      expect(output).not.toContain('maxConnections')
      expect(output).not.toContain('controlled observer rejection')
      expect(tls.requests).toHaveLength(2)
      expect(app.status().diagnosticFailures).toBe(0)
    } finally {
      await firstHost.stop()
      await secondHost.stop()
      await revoke?.()
      expect((await app.close()).complete).toBe(true)
      await tls.close()
    }
  })
})
