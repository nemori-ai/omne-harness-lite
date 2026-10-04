import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createOfficialProfileContent,
  createXaiInputMeter,
  xaiDefinitions,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor, PASSWORD, ref } from './support.ts'

function user(round: number) {
  const value = judgeMessage({
    type: 'user',
    id: `xai-closeout-${round}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `text-${round}`,
        kind: 'text',
        text: `Keep ALPHA-42, turn ${round}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in value) || value.ok.type !== 'user') throw new Error('invalid fixture')
  return value.ok
}

describe.each(xaiDefinitions)('$modelId service encrypted-history closeout', definition => {
  it('persists the actual opaque reply and resends it intact in an identity-admitted second round', async () => {
    const base = await callDeployment('xai-closeout-service')
    const profile = createOfficialProfileContent(definition, {
      providers: ['xai'],
      allowFallback: false,
      configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const meter = createXaiInputMeter(definition)
    if (!meter) throw new Error('missing xAI meter')
    const config = {
      ...base,
      officialManifest: { ordinal: 1, entries: [profile.ok] },
      modelRequest: {
        ...base.modelRequest,
        tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
        transport: {
          ...base.modelRequest.transport,
          definitions: [definition],
          inputMeters: [meter],
        },
      },
    }
    const details = [
      { type: 'reasoning.summary', summary: 'Keep the code', format: 'xai-responses-v1', index: 0 },
      {
        type: 'reasoning.encrypted',
        data: 'abcd.efgh',
        format: 'xai-responses-v1',
        id: 'reason-1',
        index: 1,
      },
    ]
    const tls = await createLocalTls(
      join(dirname(config.databaseFile), 'tls'),
      async () => {},
      0,
      definition.modelId,
      JSON.stringify({
        prompt_tokens: 1600,
        completion_tokens: 20,
        completion_tokens_details: { reasoning_tokens: 10 },
        prompt_tokens_details: { cached_tokens: 128, cache_write_tokens: 0 },
        cost: 0.0001,
      }),
      'xAI',
      [{ reasoning_details: details }],
    )
    tls.setMode('reasoning')
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'xai-closeout-session')
      if (!('session' in prepared)) throw new Error('session unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('xai-local-key'),
          body: Buffer.from('local-only'),
        })),
      ).toEqual({ stored: true })
      expect(await app.selectModel(who, session, definition.modelId)).toEqual({
        selected: definition.modelId,
      })
      const first = await app.startServiceCall(who, session, {
        user: user(1),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('result' in first) || !('replyPending' in first.result))
        throw new Error(JSON.stringify(first))
      const response = first.result.replyPending
      const thinking = response.reply.blocks.find(block => block.kind === 'thinking')
      if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
        throw new Error('opaque reply missing')
      expect(readOpaqueJson(thinking.opaque)).toMatchObject({
        routeName: definition.modelId,
        reasoning_details: details,
      })
      expect(response.inputCalibration.observedInput).toMatchObject({ kind: 'from_usage' })
      expect(writeJsonLossless(response.usage.input_tokens)).toBe('1472')
      expect(writeJsonLossless(response.usage.cache_read_tokens)).toBe('128')
      expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.0001')
      expect(await app.persistModelReply(who, session, response)).toHaveProperty('settled')
      const before = await app.readSessionLog(who, session)
      if (!('entries' in before)) throw new Error('durable log unavailable')
      expect(writeJsonLossless(before.entries)).toContain('abcd.efgh')
      const second = await app.startServiceCall(who, session, {
        user: user(2),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      // The local reply carries the real `xAI` / route-id identity pair, which mp4-20 admits:
      // the second round is planned and sent with the complete original group resent verbatim.
      // Three-round two-entry coverage lives in pi-ai-transport's xAI identity specs.
      if (!('result' in second) || !('replyPending' in second.result))
        throw new Error(JSON.stringify(second))
      expect(tls.requests).toHaveLength(2)
      expect(tls.requests[1]?.body).toMatchObject({
        messages: [
          { role: 'user' },
          { role: 'assistant', content: 'first second', reasoning_details: details },
          { role: 'user' },
        ],
      })
      expect(await app.persistModelReply(who, session, second.result.replyPending)).toHaveProperty(
        'settled',
      )
      const durable = await app.readSessionLog(who, session)
      if (!('entries' in durable)) throw new Error('durable log unavailable')
      expect(durable.entries.slice(0, before.entries.length)).toEqual(before.entries)
      await host.stop()
      expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
      diagnostics = undefined
      const reopened = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
      let reopenedDiagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      try {
        await reopened.ready
        const authenticated = await reopened.authenticate('alice', PASSWORD)
        if (!('account' in authenticated)) throw new Error('reopen authentication failed')
        reopenedDiagnostics = await activateModelFixture(reopened, authenticated, config)
        expect(await reopened.readSessionLog(authenticated, session)).toEqual(durable)
      } finally {
        if (reopenedDiagnostics)
          await reopenedDiagnostics.closeAfterBusiness(() => reopened.close())
        else await reopened.close()
      }
      expect(tls.failures).toEqual([])
    } finally {
      await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})
