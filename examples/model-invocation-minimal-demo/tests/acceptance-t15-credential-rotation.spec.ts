import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const PROVIDER = 'deepinfra/fp8'
const FIRST = 't15-first-custodian-secret'
const ROTATED = 't15-rotated-custodian-secret'

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function userMessage() {
  const judged = judgeMessage({
    id: 't15-rotation-user',
    type: 'user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 't15-rotation-text',
        kind: 'text',
        text: 'retry after credential rotation',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('valid user input missing')
  return judged.ok
}

describe('RT10 T15 real credential custodian rotation on one call', () => {
  it('sends the new published secret on dispatchAgain while keeping the first binding', async () => {
    const config = await callDeployment('t15-credential-rotation')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
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
      const prepared = await app.prepareSession(who, 't15-credential-rotation-session')
      if (!('session' in prepared)) throw new Error('session preparation unavailable')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
      expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('t15-credential-first'),
          body: Buffer.from(FIRST),
        })),
      ).toEqual({ stored: true })
      const bound = await app.bindModelRuntime(who, session)
      if (!('service' in bound)) throw new Error('real service unavailable')
      const service = bound.service
      const effective = await service.effectiveModel({ session })
      if (!('effectiveModel' in effective)) throw new Error('effective model missing')
      const opened = await service.openCall({
        session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [userMessage()],
        tools: [],
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in opened) || opened.state !== 'open') throw new Error('open refused')
      const call = { session, callId: opened.callId }
      tls.setMode('http503')
      expect(await service.dispatch(call)).toMatchObject({
        settled: { outcome: 'failed', failure: { cause: 'upstream_unavailable' } },
      })
      expect(await service.readAttempts(call)).toMatchObject({ state: 'awaiting_decision' })
      expect(tls.requests.length).toBe(1)
      const firstAuthorization = tls.requests[0]?.authorization
      if (firstAuthorization === undefined) throw new Error('first HTTPS authorization absent')
      expect(digest(firstAuthorization)).toBe(digest(`Bearer ${FIRST}`))

      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('t15-credential-rotated'),
          body: Buffer.from(ROTATED),
        })),
      ).toEqual({ stored: true })
      tls.setMode('complete')
      const retried = await service.dispatchAgain({ ...call, plan: { provider: PROVIDER } })
      if (!('replyPending' in retried)) throw new Error('same-call retry did not produce reply')
      expect(tls.requests.length).toBe(2)
      const rotatedAuthorization = tls.requests[1]?.authorization
      if (rotatedAuthorization === undefined) throw new Error('second HTTPS authorization absent')
      expect(digest(rotatedAuthorization)).toBe(digest(`Bearer ${ROTATED}`))
      expect(digest(rotatedAuthorization)).not.toBe(digest(firstAuthorization))
      const read = await app.readSessionLog(who, session)
      if (!('entries' in read)) throw new Error('real SL3 log unavailable')
      const dispatches = read.entries
        .filter(entry =>
          entry.readKeys.some(key => {
            const parsed = decodeModelLogKey(key)
            return (
              'ok' in parsed &&
              parsed.ok.kind === 'dispatched' &&
              'call' in parsed.ok &&
              parsed.ok.call === call.callId
            )
          }),
        )
        .map(entry => {
          const wrapper = entry.payload
          if (
            wrapper === null ||
            typeof wrapper !== 'object' ||
            Array.isArray(wrapper) ||
            !('category' in wrapper) ||
            wrapper.category !== 'record' ||
            !('value' in wrapper) ||
            wrapper.value === null ||
            typeof wrapper.value !== 'object' ||
            Array.isArray(wrapper.value) ||
            isJsonNumber(wrapper.value)
          )
            throw new Error('real dispatch record malformed')
          return wrapper.value
        })
      expect(dispatches).toHaveLength(2)
      const original = dispatches[0]
      if (
        original === undefined ||
        !('adaptation' in original) ||
        !('profileSnapshot' in original) ||
        !('parameters' in original)
      )
        throw new Error('original binding facts missing')
      expect(dispatches[1]).toMatchObject({ call: call.callId, dispatch: 2, provider: PROVIDER })
      expect(dispatches[1]).toMatchObject({
        adaptation: original.adaptation,
        profileSnapshot: original.profileSnapshot,
        parameters: original.parameters,
      })
      expect(
        await service.settleReply({
          ...call,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId: call.callId, state: 'complete' })
    } finally {
      await host.stop()
      if (diagnostics !== undefined) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})
