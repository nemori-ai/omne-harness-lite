import { open, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const PROVIDER = 'deepinfra/fp8'
const AT = '2026-09-28T00:00:00Z'

function user(label: string) {
  const judged = judgeMessage({
    type: 'user',
    id: `retry-user-${label}`,
    createdAt: AT,
    blocks: [
      {
        id: `retry-text-${label}`,
        kind: 'text',
        text: 'controlled retry',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

async function ready(label: string, onReceive?: () => Promise<void>) {
  const config = await callDeployment(label)
  const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'), onReceive)
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
  })
  const host = createDemoCallHost()
  await app.ready
  const who = await actor(app)
  const prepared = await app.prepareSession(who, `${label}-session`)
  if (!('session' in prepared)) throw new Error('session preparation failed')
  const session = prepared.session
  expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
  expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
  expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
  expect(
    await app.publishCredential(who, async checked => ({
      account: checked.account,
      tenant: checked.tenant,
      sourceRef: ref(`retry-control-${label}`),
      body: Buffer.from('controlled-retry-credential'),
    })),
  ).toEqual({ stored: true })
  const bound = await app.bindModelRuntime(who, session)
  if (!('service' in bound)) throw new Error('runtime binding failed')
  const effective = await bound.service.effectiveModel({ session })
  if (!('effectiveModel' in effective)) throw new Error('effective model unavailable')
  return {
    databaseFile: config.databaseFile,
    app,
    tls,
    host,
    who,
    session,
    service: bound.service,
    basis: effective.effectiveModel,
    async close() {
      await host.stop()
      await app.close()
      await tls.close()
    },
  }
}

async function openCall(fixture: Awaited<ReturnType<typeof ready>>, label: string) {
  const opened = await fixture.service.openCall({
    session: fixture.session,
    target: fixture.basis.routeName,
    basis: fixture.basis,
    messages: [user(label)],
    tools: [],
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    host: fixture.host.host,
  })
  if (!('callId' in opened) || opened.state !== 'open')
    throw new Error(`open rejected: ${JSON.stringify(opened)}`)
  return opened.callId
}

async function logKeys(
  app: ReturnType<typeof createAcceptanceApplication>,
  who: Awaited<ReturnType<typeof actor>>,
  session: string,
) {
  const read = await app.readSessionLog(who, session)
  if (!('entries' in read)) throw new Error('actual session log unavailable')
  return read.entries.flatMap(entry => entry.readKeys).map(decodeModelLogKey)
}

function kinds(keys: Awaited<ReturnType<typeof logKeys>>, callId: string) {
  return keys.flatMap(key =>
    'ok' in key && 'call' in key.ok && key.ok.call === callId ? [key.ok.kind] : [],
  )
}

function syncMethod(value: unknown): value is Pick<FileHandle, 'datasync'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'datasync' in value &&
    typeof value.datasync === 'function'
  )
}

describe('real model service retry and control', () => {
  it('reads a durable 503 failure and retries once with the same call id', async () => {
    const fixture = await ready('retry-503-success')
    const { app, tls, who, session, service } = fixture
    try {
      tls.setMode('http503')
      const callId = await openCall(fixture, 'retry-503')
      expect(tls.requests).toHaveLength(0)
      const first = await service.dispatch({ session, callId })
      if (!('settled' in first) || first.settled.outcome !== 'failed')
        throw new Error(`503 did not settle failed: ${JSON.stringify(first)}`)
      if (first.failureSubject === undefined) throw new Error('503 failure subject missing')
      expect(first.settled).toMatchObject({ failure: { cause: 'upstream_unavailable' } })
      expect(first.failureSubject).toMatchObject({
        failure: 'upstream_unavailable',
        statusCode: 503,
        retryConclusions: [],
      })
      expect(first.failureSubject.dispatches).toHaveLength(1)
      expect(first.failureSubject.dispatches[0].call).toBe(callId)
      expect(tls.requests).toHaveLength(1)
      const beforeRead = await logKeys(app, who, session)
      const attempts = await service.readAttempts({ session, callId })
      if (!('dispatches' in attempts) || attempts.state !== 'awaiting_decision')
        throw new Error(`failure history unavailable: ${JSON.stringify(attempts)}`)
      expect(attempts.dispatches).toHaveLength(1)
      expect(attempts.failureSubject).toEqual(first.failureSubject)
      const plan = { provider: PROVIDER }
      expect(await service.canDispatchAgain({ session, callId, plan })).toEqual({
        allowed: true,
      })
      expect(await logKeys(app, who, session)).toEqual(beforeRead)
      expect(tls.requests).toHaveLength(1)

      const malformed = { provider: PROVIDER, target: MODEL }
      expect(await service.canDispatchAgain({ session, callId, plan: malformed })).toEqual({
        invalidInput: { reason: 'malformed' },
      })
      expect(await service.dispatchAgain({ session, callId, plan: malformed })).toEqual({
        invalidInput: { reason: 'malformed' },
      })
      expect(await logKeys(app, who, session)).toEqual(beforeRead)
      expect(tls.requests).toHaveLength(1)

      const forbidden = { provider: 'unauthorized/provider' }
      expect(await service.canDispatchAgain({ session, callId, plan: forbidden })).toEqual({
        refused: { why: 'provider_not_allowed' },
      })
      expect(await service.dispatchAgain({ session, callId, plan: forbidden })).toEqual({
        retryRefused: { why: 'provider_not_allowed' },
      })
      expect(await logKeys(app, who, session)).toEqual(beforeRead)
      expect(tls.requests).toHaveLength(1)

      tls.setMode('complete')
      const retried = await service.dispatchAgain({ session, callId, plan })
      if (!('replyPending' in retried))
        throw new Error(`retry did not hand off reply: ${JSON.stringify(retried)}`)
      expect(tls.requests).toHaveLength(2)
      expect(retried.replyPending.call.callId).toBe(callId)
      const settled = await service.settleReply({
        session,
        callId,
        disposition: { consumed: { by: 'side_query' } },
      })
      expect(settled).toEqual({ callId, state: 'complete' })
      const after = await service.readAttempts({ session, callId })
      if (!('dispatches' in after)) throw new Error('retry history unavailable')
      expect(after.dispatches).toHaveLength(2)
      expect(after.state).toBe('complete')
      const durableKinds = kinds(await logKeys(app, who, session), callId)
      expect(durableKinds.filter(kind => kind === 'dispatched')).toHaveLength(2)
      expect(durableKinds.filter(kind => kind === 'opened')).toHaveLength(1)
      expect(durableKinds.filter(kind => kind === 'ended')).toHaveLength(0)
      expect(await service.canDispatchAgain({ session, callId, plan })).toEqual({
        alreadyEnded: true,
      })
      expect(await service.dispatchAgain({ session, callId, plan })).toEqual({
        alreadyEnded: true,
      })
      expect(tls.requests).toHaveLength(2)
    } finally {
      await fixture.close()
    }
  })

  it('ends a failed call once when the caller releases it, without another send', async () => {
    const fixture = await ready('retry-release')
    const { app, tls, who, session, service } = fixture
    try {
      tls.setMode('http503')
      const callId = await openCall(fixture, 'release')
      expect(await service.dispatch({ session, callId })).toMatchObject({
        settled: { outcome: 'failed' },
      })
      const before = await logKeys(app, who, session)
      expect(kinds(before, callId).filter(kind => kind === 'ended')).toHaveLength(0)
      expect(await service.releaseCall({ session, callId })).toEqual({ callId, state: 'handed_up' })
      expect(await service.readAttempts({ session, callId })).toMatchObject({ state: 'handed_up' })
      const after = await logKeys(app, who, session)
      expect(kinds(after, callId).filter(kind => kind === 'ended')).toHaveLength(1)
      const history = await app.readSessionLog(who, session)
      if (!('entries' in history)) throw new Error('actual session log unavailable')
      const ended = history.entries.find(entry =>
        entry.readKeys.some(key => {
          const parsed = decodeModelLogKey(key)
          return 'ok' in parsed && parsed.ok.kind === 'ended' && parsed.ok.call === callId
        }),
      )
      expect(ended?.payload).toEqual({
        format: 'mrr/3',
        category: 'record',
        value: { kind: 'model_call_ended', call: callId, ending: 'released' },
      })
      expect(await service.releaseCall({ session, callId })).toEqual({ alreadyEnded: true })
      expect(await logKeys(app, who, session)).toEqual(after)
      expect(tls.requests).toHaveLength(1)
    } finally {
      await fixture.close()
    }
  })

  it('opens two different calls without sending and interrupts only the chosen open call', async () => {
    const fixture = await ready('retry-before-dispatch')
    const { app, tls, who, session, service } = fixture
    try {
      const first = await openCall(fixture, 'first')
      const other = await openCall(fixture, 'other')
      expect(first).not.toBe(other)
      expect(tls.requests).toHaveLength(0)
      expect(await service.readAttempts({ session, callId: other })).toEqual({
        state: 'open',
        dispatches: [],
      })
      expect(await service.releaseCall({ session, callId: first })).toEqual({
        wrongPhase: { phase: 'open' },
      })
      expect(tls.requests).toHaveLength(0)
      expect(await service.interrupt({ session, callId: first, initiator: 'user' })).toEqual({
        stage: 'before_dispatch',
      })
      const keys = await logKeys(app, who, session)
      expect(kinds(keys, first).filter(kind => kind === 'intent')).toHaveLength(1)
      expect(kinds(keys, other)).toHaveLength(0)
      await expect
        .poll(() => service.readAttempts({ session, callId: first }), { timeout: 5000 })
        .toMatchObject({ state: 'interrupted' })
      expect(await service.readAttempts({ session, callId: other })).toEqual({
        state: 'open',
        dispatches: [],
      })
      expect(tls.requests).toHaveLength(0)
      expect(
        kinds(await logKeys(app, who, session), first).filter(kind => kind === 'ended'),
      ).toHaveLength(1)
      expect(await service.interrupt({ session, callId: first, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(
        kinds(await logKeys(app, who, session), first).filter(kind => kind === 'intent'),
      ).toHaveLength(1)
    } finally {
      await fixture.close()
    }
  })

  it('serializes concurrent dispatches of one call into one physical request', async () => {
    const entered = deferred(),
      release = deferred()
    const fixture = await ready('retry-concurrent-dispatch', async () => {
      entered.resolve()
      await release.promise
    })
    const { tls, session, service } = fixture
    try {
      const callId = await openCall(fixture, 'concurrent')
      const first = service.dispatch({ session, callId })
      await entered.promise
      const second = service.dispatch({ session, callId })
      expect(tls.requests).toHaveLength(1)
      release.resolve()
      const [firstResult, secondResult] = await Promise.all([first, second])
      expect(firstResult).toHaveProperty('replyPending')
      expect(secondResult).toEqual({ unavailable: true })
      expect(await service.readAttempts({ session, callId })).toMatchObject({
        state: 'reply_pending',
      })
      expect(tls.requests).toHaveLength(1)
    } finally {
      release.resolve()
      await fixture.close()
    }
  })

  it('serializes concurrent retries after one durable failure', async () => {
    const entered = deferred(),
      release = deferred()
    let received = 0
    const fixture = await ready('retry-concurrent-again', async () => {
      received++
      if (received === 2) {
        entered.resolve()
        await release.promise
      }
    })
    const { tls, session, service } = fixture
    try {
      tls.setMode('http503')
      const callId = await openCall(fixture, 'concurrent-again')
      expect(await service.dispatch({ session, callId })).toMatchObject({
        settled: { outcome: 'failed' },
      })
      const plan = { provider: PROVIDER }
      tls.setMode('complete')
      const first = service.dispatchAgain({ session, callId, plan })
      await entered.promise
      const second = service.dispatchAgain({ session, callId, plan })
      expect(tls.requests).toHaveLength(2)
      release.resolve()
      const [firstResult, secondResult] = await Promise.all([first, second])
      expect(firstResult).toHaveProperty('replyPending')
      expect(secondResult).toEqual({ unavailable: true })
      expect(tls.requests).toHaveLength(2)
      const attempts = await service.readAttempts({ session, callId })
      if (!('dispatches' in attempts)) throw new Error('retry history unavailable')
      expect(attempts.dispatches).toHaveLength(2)
    } finally {
      release.resolve()
      await fixture.close()
    }
  })

  it('refuses another send after a response has spoken and the stream ends early', async () => {
    const fixture = await ready('retry-already-spoke')
    const { app, tls, who, session, service } = fixture
    try {
      tls.setMode('hold')
      const callId = await openCall(fixture, 'already-spoke')
      const dispatch = service.dispatch({ session, callId })
      await tls.contentSent.promise
      tls.finishHeld()
      const first = await dispatch
      if (!('settled' in first) || first.settled.outcome !== 'failed')
        throw new Error(`early stream ending did not settle failed: ${JSON.stringify(first)}`)
      expect(first.settled).toMatchObject({ failure: { cause: 'interrupted_mid_reply' } })
      expect(await service.readAttempts({ session, callId })).toMatchObject({
        state: 'awaiting_decision',
      })
      const before = await logKeys(app, who, session)
      const plan = { provider: PROVIDER }
      expect(await service.canDispatchAgain({ session, callId, plan })).toEqual({
        refused: { why: 'already_spoke' },
      })
      expect(await service.dispatchAgain({ session, callId, plan })).toEqual({
        retryRefused: { why: 'already_spoke' },
      })
      expect(await logKeys(app, who, session)).toEqual(before)
      expect(tls.requests).toHaveLength(1)
    } finally {
      tls.finishHeld()
      await fixture.close()
    }
  })

  it('commits the chosen call interrupt intent before cancelling a pre-content send', async () => {
    const entered = deferred(),
      release = deferred()
    const fixture = await ready('retry-interrupt-in-flight', async () => {
      entered.resolve()
      await release.promise
    })
    const { app, tls, who, session, service } = fixture
    try {
      const callId = await openCall(fixture, 'in-flight')
      const other = await openCall(fixture, 'not-targeted')
      const dispatch = service.dispatch({ session, callId })
      await entered.promise
      expect(tls.requests).toHaveLength(1)
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        stage: 'in_flight',
      })
      const beforeServerRelease = await logKeys(app, who, session)
      expect(kinds(beforeServerRelease, callId).filter(kind => kind === 'intent')).toHaveLength(1)
      expect(kinds(beforeServerRelease, other)).toHaveLength(0)
      await tls.socketClosed.promise
      expect(tls.closedSockets()).toBeGreaterThan(0)
      release.resolve()
      expect(await dispatch).toMatchObject({ settled: { outcome: 'interrupted' } })
      expect(tls.requests).toHaveLength(1)
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(
        kinds(await logKeys(app, who, session), callId).filter(kind => kind === 'intent'),
      ).toHaveLength(1)
      expect(await service.readAttempts({ session, callId: other })).toEqual({
        state: 'open',
        dispatches: [],
      })
    } finally {
      release.resolve()
      await fixture.close()
    }
  })

  it('commits the chosen call interrupt intent after content before aborting the held stream', async () => {
    const fixture = await ready('retry-interrupt-speaking')
    const { app, tls, who, session, service } = fixture
    try {
      tls.setMode('hold')
      const callId = await openCall(fixture, 'speaking')
      const dispatch = service.dispatch({ session, callId })
      await tls.contentSent.promise
      expect(tls.requests).toHaveLength(1)
      await expect
        .poll(
          async () =>
            kinds(await logKeys(app, who, session), callId).filter(kind => kind === 'opened')
              .length,
          {
            timeout: 5000,
          },
        )
        .toBe(1)
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        stage: 'speaking',
      })
      expect(
        kinds(await logKeys(app, who, session), callId).filter(kind => kind === 'intent'),
      ).toHaveLength(1)
      const result = await dispatch
      if (!('replyPending' in result))
        throw new Error(`speaking interrupt did not hand off reply: ${JSON.stringify(result)}`)
      expect(result.replyPending.outcome).toBe('interrupted')
      expect(result.replyPending).toMatchObject({ initiator: 'user' })
      await tls.socketClosed.promise
      expect(tls.closedSockets()).toBeGreaterThan(0)
      expect(
        await service.settleReply({
          session,
          callId,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId, state: 'interrupted' })
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(
        kinds(await logKeys(app, who, session), callId).filter(kind => kind === 'intent'),
      ).toHaveLength(1)
      expect(tls.requests).toHaveLength(1)
    } finally {
      tls.finishHeld()
      await fixture.close()
    }
  })

  it('keeps the physical send alive when the interrupt intent append fails', async () => {
    const entered = deferred(),
      release = deferred()
    const fixture = await ready('retry-interrupt-append-fault', async () => {
      entered.resolve()
      await release.promise
    })
    const { app, tls, who, session, service } = fixture
    const probe = await open(join(dirname(fixture.databaseFile), 'probe'), 'w')
    const methods: unknown = Object.getPrototypeOf(probe)
    if (!syncMethod(methods)) throw new Error('actual file sync method unavailable')
    const original = methods.datasync
    let failNextSync = false,
      attempted = 0
    const spy = vi.spyOn(methods, 'datasync').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync'>,
    ) {
      if (failNextSync) {
        failNextSync = false
        attempted++
        throw Object.assign(new Error('controlled append failure'), { code: 'EIO' })
      }
      await original.call(this)
    })
    try {
      const callId = await openCall(fixture, 'append-fault')
      const dispatch = service.dispatch({ session, callId })
      await entered.promise
      failNextSync = true
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        unavailable: true,
      })
      expect(attempted).toBeGreaterThan(0)
      expect(
        kinds(await logKeys(app, who, session), callId).filter(kind => kind === 'intent'),
      ).toHaveLength(0)
      expect(tls.closedSockets()).toBe(0)
      release.resolve()
      await tls.contentSent.promise
      expect(tls.requests).toHaveLength(1)
      expect(await dispatch).toMatchObject({ replyPending: { outcome: 'complete' } })
    } finally {
      failNextSync = false
      release.resolve()
      spy.mockRestore()
      await probe.close()
      await fixture.close()
    }
  })
})
