import { setTimeout as sleep } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isJsonNumber,
  readOpaqueJson,
  toOpaqueJson,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { AssetDefinition } from '@omne-harness-lite/asset-model'
import { createAcceptanceApplication, type ControlledRunFixturePort } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { messagePrefixWithSources, readDemoCalibrationHistory } from '../src/model-request-text.ts'
import { DEMO_DEFAULT_RETRY, DEMO_ROOT, demoPublication } from '../src/deployment.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const RUN = 'controlled-retry-run'
const MODEL = 'deepseek/deepseek-v4-pro-0813'

function user() {
  const judged = judgeMessage({
    type: 'user',
    id: 'controlled-retry-user',
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: 'controlled-retry-text',
        kind: 'text',
        text: 'retry after explicit wait',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw Error('retry user invalid')
  return judged.ok
}

function handle<B extends string>(value: string, brand: B) {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!('ok' in parsed)) throw Error('retry handle invalid')
  return parsed.ok
}

function withoutTimingLimits(who: Awaited<ReturnType<typeof actor>>) {
  const publication = demoPublication(who, '1')
  const root = publication.definitions.find(item => item.capability.name === DEMO_ROOT.name)
  if (root === undefined) throw Error('published root absent')
  const original = root.versions[0]?.content
  if (original?.category !== 'agent_definition') throw Error('published root body absent')
  const body = readOpaqueJson(original.body)
  if (
    body === null ||
    typeof body !== 'object' ||
    isJsonNumber(body) ||
    !('attributes' in body) ||
    !Array.isArray(body.attributes)
  )
    throw Error('published root attributes absent')
  function timing(value: JsonValue): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      !isJsonNumber(value) &&
      'item' in value &&
      (value.item === 'first_token_wait_limit' || value.item === 'post_first_token_stall_limit')
    )
  }
  const updated: AssetDefinition = {
    ...root,
    versions: [
      ...root.versions,
      {
        number: 2,
        publishedAt: '2026-09-29T01:00:00Z',
        content: {
          category: 'agent_definition',
          body: toOpaqueJson({
            ...body,
            attributes: body.attributes.filter(item => !timing(item)),
          }),
        },
      },
    ],
  }
  return {
    ...publication,
    definitions: publication.definitions.map(item => (item === root ? updated : item)),
  }
}

async function ready(label: string) {
  const base = await callDeployment(label)
  let currentVersion = 1
  const config = {
    ...base,
    modelRequest: {
      ...base.modelRequest,
      defaultRetry: {
        policy: {
          kind: 'exponential' as const,
          base: 'PT1S',
          factor: 2,
          max: 'PT30S',
          jitter: 'full' as const,
        },
        sample: () => 0.5,
      },
      evaluationInputs: {
        ...base.modelRequest.evaluationInputs,
        deployedOfficial: [
          { capability: DEMO_ROOT, meta: false },
          { capability: DEMO_DEFAULT_RETRY, meta: false },
        ],
        async prepare(who: Awaited<ReturnType<typeof actor>>) {
          return {
            publication: currentVersion === 1 ? demoPublication(who) : withoutTimingLimits(who),
            recipe: { rootDefinition: DEMO_ROOT },
          }
        },
      },
    },
  }
  const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
  tls.setMode('http503')
  let fixture: ControlledRunFixturePort | undefined
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
    controlledRunFixture(port) {
      fixture = port
    },
    runHistory(prefix, run, attempt) {
      if (run !== RUN || attempt !== 1) return { unavailable: true }
      const selected = messagePrefixWithSources(prefix, { run: RUN, attempt: 1 })
      if ('unavailable' in selected) return { unavailable: true }
      const started = selected.messages.filter(
        message => message.type === 'system_reminder' && message.source.kind === 'attempt_started',
      )
      return started.length === 1
        ? { known: { run, originalAttempt: attempt, latestAttempt: 1, terminal: 'open' } }
        : { unavailable: true }
    },
    calibrationHistory(prefix, messages, target) {
      return readDemoCalibrationHistory(prefix, messages, target, { run: RUN, attempt: 1 })
    },
    async runnerExternal(_who, request) {
      if (request.run !== RUN) return { unavailable: true }
      return {
        readAskState: async () => ({ kind: 'unavailable' }),
        async openHandles() {
          return {
            log: handle('retry-log', 'LogHandle'),
            environment: handle('retry-environment', 'EnvironmentHandle'),
            release() {},
          }
        },
        mintReminder: () => ({ unavailable: true }),
        fallbackNeedsProjection: async () => false,
        commandPresence: async () => 'unavailable',
        invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
      }
    },
  })
  const host = createDemoCallHost()
  await app.ready
  const who = await actor(app)
  const diagnostics = await activateModelFixture(app, who, config)
  const prepared = await app.prepareSession(who, `${label}-session`)
  if (!('session' in prepared)) throw Error('retry session unavailable')
  const session = prepared.session
  expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
  expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
  expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
  expect(
    await app.publishCredential(who, async checked => ({
      account: checked.account,
      tenant: checked.tenant,
      sourceRef: ref(`${label}-credential`),
      body: Buffer.from('controlled-retry-key'),
    })),
  ).toEqual({ stored: true })
  if (fixture === undefined) throw Error('controlled Run fixture absent')
  const started = await fixture.startAttempt(who, session, RUN, 1)
  if (!('report' in started)) throw Error(`retry Run start unavailable: ${JSON.stringify(started)}`)
  started.release()
  const sent = await app.startServiceCall(who, session, {
    user: user(),
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    host: host.host,
    run: RUN,
    attempt: 1,
    report: started.report,
  })
  if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
    throw Error(`first retry response unavailable: ${JSON.stringify(sent)}`)
  expect(sent.result.settled.outcome).toBe('failed')
  const bound = await app.bindModelRuntime(who, session)
  if (!('service' in bound)) throw Error('runtime service absent')
  const read = await bound.service.readAttempts({ session, callId: sent.callId })
  if (!('state' in read) || read.state !== 'awaiting_decision')
    throw Error('durable failed call absent')
  const runner = await app.dispatchRunner(
    who,
    session,
    {
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      subject: read.failureSubject,
      manifest: session,
      anchor: sent.callId,
      run: RUN,
      attempt: 1,
    },
    new AbortController().signal,
  )
  if (!('conclusions' in runner)) throw Error(`P5 unavailable: ${JSON.stringify(runner)}`)
  const retry = runner.conclusions.find(item => item.output?.kind === 'retry')?.output
  if (retry?.kind !== 'retry') throw Error('durable P5 retry absent')
  expect(retry.plan.after).toBe('PT0.5S')
  expect(tls.requests).toHaveLength(1)
  return {
    app,
    who,
    session,
    host,
    diagnostics,
    tls,
    service: bound.service,
    callId: sent.callId,
    plan: retry.plan,
    changeLimits() {
      currentVersion = 2
    },
    async close() {
      await host.stop()
      const result = await diagnostics.closeAfterBusiness(() => app.close())
      expect(result.complete).toBe(true)
      await tls.close()
    },
  }
}

describe('P5 retry remains a decision until explicit wait and a new runtime guard', () => {
  it('waits the accepted nonzero delay, then dispatches the original call through a second TLS request', async () => {
    const f = await ready('runner-after-wait')
    try {
      expect(
        await f.service.canDispatchAgain({ session: f.session, callId: f.callId, plan: f.plan }),
      ).toEqual({ allowed: true })
      const beforeRetry = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in beforeRetry)) throw Error('durable retry prefix unavailable')
      await sleep(550)
      f.tls.setMode('complete')
      const retried = await f.service.dispatchAgain({
        session: f.session,
        callId: f.callId,
        plan: f.plan,
        attempt: 1,
      })
      if (!('replyPending' in retried))
        throw Error(`retry did not send: ${JSON.stringify(retried)}`)
      expect(f.tls.requests).toHaveLength(2)
      expect(retried.replyPending.call.callId).toBe(f.callId)
      expect(await f.app.persistModelReply(f.who, f.session, retried.replyPending)).toHaveProperty(
        'settled',
      )
      const after = await f.service.readAttempts({ session: f.session, callId: f.callId })
      if (!('dispatches' in after)) throw Error('retried history unavailable')
      expect(after.dispatches).toHaveLength(2)
      const afterRetry = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in afterRetry)) throw Error('durable retry history unavailable')
      expect(afterRetry.entries.slice(0, beforeRetry.entries.length)).toEqual(beforeRetry.entries)
    } finally {
      await f.close()
    }
  })

  it('retains the P5 conclusion when current EIS timing limits disappear before dispatchAgain', async () => {
    const f = await ready('runner-limits-after-p5')
    try {
      const before = await f.app.readSessionLog(f.who, f.session)
      f.changeLimits()
      expect(await f.app.prepareModelInputs(f.who, f.session)).toEqual({ prepared: true })
      expect(
        await f.service.canDispatchAgain({ session: f.session, callId: f.callId, plan: f.plan }),
      ).toEqual({ allowed: true })
      const withNewInput = await f.app.readSessionLog(f.who, f.session)
      expect(
        await f.service.dispatchAgain({
          session: f.session,
          callId: f.callId,
          plan: f.plan,
          attempt: 1,
        }),
      ).toEqual({ unavailable: true })
      expect(await f.app.readSessionLog(f.who, f.session)).toEqual(withNewInput)
      expect(f.tls.requests).toHaveLength(1)
      const after = await f.service.readAttempts({ session: f.session, callId: f.callId })
      if (!('state' in after) || after.state !== 'awaiting_decision')
        throw Error('retry history lost')
      expect(after.failureSubject.retryConclusions).toHaveLength(1)
      expect(before).not.toEqual({ unavailable: true })
    } finally {
      await f.close()
    }
  })
})
