import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import type { AcceptanceEvent } from '../src/types.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { actor, ref } from './support.ts'

type SinkMode = 'healthy' | 'throw' | 'reject' | 'pending'
type UpstreamMode = 'complete' | 'http503' | 'hold'

function userMessage(label: string) {
  const parsed = judgeMessage({
    type: 'user',
    id: `observability-user-${label}`,
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: `observability-text-${label}`,
        kind: 'text',
        text: 'controlled observability request',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in parsed) || parsed.ok.type !== 'user') throw new Error('invalid user fixture')
  return parsed.ok
}

async function runServicePath(upstream: UpstreamMode, sink: SinkMode) {
  const label = `observability-${upstream}-${sink}`
  const config = await callDeployment(label)
  const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
  tls.setMode(upstream)
  const recorded: AcceptanceEvent[] = []
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: {
      record(event) {
        recorded.push(event)
        if (sink === 'throw') throw new Error('controlled diagnostic sink failure')
        if (sink === 'reject') return Promise.reject(new Error('controlled diagnostic rejection'))
        if (sink === 'pending') return new Promise<void>(() => {})
      },
    },
  })
  const host = createDemoCallHost()
  try {
    await app.ready
    const who = await actor(app)
    const prepared = await app.prepareSession(who, `${label}-session`)
    if (!('session' in prepared)) throw new Error('session preparation unavailable')
    expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
    expect(await app.selectModel(who, prepared.session, 'deepseek/deepseek-v4-pro-0813')).toEqual({
      selected: 'deepseek/deepseek-v4-pro-0813',
    })
    expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
    expect(
      await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref(`observability-source-${sink}`),
        body: Buffer.from('controlled-local-credential'),
      })),
    ).toEqual({ stored: true })
    const dispatch = app.startServiceCall(who, prepared.session, {
      user: userMessage(label),
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      host: host.host,
    })
    if (upstream === 'hold') {
      await tls.contentSent.promise
      expect(tls.requests).toHaveLength(1)
      const stopping = host.stop()
      await tls.socketClosed.promise
      expect(await stopping).toEqual({ released: true })
    }
    const sent = await dispatch
    if (!('callId' in sent)) throw new Error('actual service call did not open')
    if (upstream === 'complete') {
      if (!('result' in sent) || !('replyPending' in sent.result))
        throw new Error('completed request did not hand off its reply')
      expect(
        await app.persistModelReply(who, prepared.session, sent.result.replyPending),
      ).toHaveProperty('settled')
    }
    const attempts = await app.bindModelRuntime(who, prepared.session)
    if (!('service' in attempts)) throw new Error('runtime service unavailable')
    const history = await attempts.service.readAttempts({
      session: prepared.session,
      callId: sent.callId,
    })
    const diagnosticFailures = app.status().diagnosticFailures
    const close = await app.close()
    return {
      sent,
      history,
      close,
      diagnosticFailures,
      recorded,
      requestCount: tls.requests.length,
      closedSockets: tls.closedSockets(),
    }
  } finally {
    tls.finishHeld()
    await host.stop()
    await app.close()
    await tls.close()
  }
}

describe('real demo service diagnostic boundary', () => {
  it.each([
    ['complete', 'throw'],
    ['http503', 'reject'],
    ['hold', 'pending'],
  ] as const)('%s request survives a %s diagnostic sink', async (upstream, brokenSink) => {
    const baseline = await runServicePath(upstream, 'healthy')
    const damaged = await runServicePath(upstream, brokenSink)
    expect(baseline.requestCount).toBe(1)
    expect(damaged.requestCount).toBe(1)
    expect(baseline.close.complete).toBe(true)
    expect(damaged.close.complete).toBe(true)
    expect(baseline.diagnosticFailures).toBe(0)
    expect(damaged.diagnosticFailures).toBeGreaterThan(0)
    if (!('state' in baseline.history) || !('state' in damaged.history))
      throw new Error('real call history unavailable')
    expect(damaged.history.state).toBe(baseline.history.state)
    expect(damaged.history.state).toBe(
      upstream === 'complete'
        ? 'complete'
        : upstream === 'hold'
          ? 'interrupted'
          : 'awaiting_decision',
    )
    expect(damaged.recorded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'operation', phase: 'publish', outcome: 'stored' }),
      ]),
    )
    expect(damaged.recorded.every(event => event.runId.startsWith('observability-'))).toBe(true)
    const diagnosticOutput = JSON.stringify(damaged.recorded)
    expect(diagnosticOutput).not.toContain('controlled-local-credential')
    expect(diagnosticOutput).not.toContain('controlled observability request')
    if (upstream === 'hold') {
      expect(baseline.closedSockets).toBeGreaterThan(0)
      expect(damaged.closedSockets).toBeGreaterThan(0)
      expect(damaged.history).toMatchObject({ state: 'interrupted' })
    }
    // The callback above is an injected diagnostic port. This test does not claim
    // a durable log, trace, metric, independent query or export was produced.
  })
})
