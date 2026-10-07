import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import type {
  AcquireCallResult,
  RetainedCallReadView,
} from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { DEMO_REFERENCE_SOURCE_VERSION, deriveCreationKey } from '../src/call-references.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const AT = '2026-09-28T00:00:00Z'

function opaque<B extends string>(value: string, brand: B) {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!isOk(parsed)) throw new Error('opaque fixture invalid')
  return parsed.ok
}

/** A call that was not acknowledged has the retained view with a presence fact. */
function retained(result: AcquireCallResult): {
  readonly view: RetainedCallReadView
  readonly consumer?: unknown
} {
  if (!('view' in result) || 'acknowledged' in result.view)
    throw new Error(`no retained view: ${JSON.stringify(result)}`)
  return { view: result.view, ...('consumer' in result ? { consumer: result.consumer } : {}) }
}

function contentRows(databaseFile: string, callId: string): number {
  const db = new DatabaseSync(databaseFile, { readOnly: true })
  try {
    const row = db
      .prepare('SELECT count(*) AS n FROM model_call_content WHERE call = ?')
      .get(callId)
    return Number(row?.n)
  } finally {
    db.close()
  }
}

function user(label: string, text = 'controlled reference') {
  const judged = judgeMessage({
    type: 'user',
    id: `reference-user-${label}`,
    createdAt: AT,
    blocks: [
      {
        id: `reference-text-${label}`,
        kind: 'text',
        text,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

async function ready(label: string) {
  const config = await callDeployment(label)
  const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
  })
  const host = createDemoCallHost()
  await app.ready
  const who = await actor(app)
  const diagnostics = await activateModelFixture(app, who, config)
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
      sourceRef: ref(`reference-${label}`),
      body: Buffer.from('controlled-reference-credential'),
    })),
  ).toEqual({ stored: true })
  const bound = await app.bindModelRuntime(who, session)
  if (!('service' in bound)) throw new Error('runtime binding failed')
  const effective = await bound.service.effectiveModel({ session })
  if (!('effectiveModel' in effective)) throw new Error('effective model unavailable')
  return {
    app,
    tls,
    host,
    databaseFile: config.databaseFile,
    who,
    session,
    service: bound.service,
    basis: effective.effectiveModel,
    async close() {
      await host.stop()
      await diagnostics.closeAfterBusiness(() => app.close())
      await tls.close()
    },
  }
}

describe('durable call references through the actual demo model service', () => {
  it('creates one durable call per derived creation key and sends nothing before dispatch', async () => {
    const f = await ready('reference-creation')
    try {
      const request = (message: ReturnType<typeof user>) => ({
        creationKey: deriveCreationKey({ session: f.session, userMessage: message.id }),
        session: f.session,
        target: f.basis.routeName,
        basis: f.basis,
        messages: [message],
        tools: [],
        parameters: { reasoningEffort: 'low' as const, maxOutputTokens: 1024 },
        host: f.host.host,
      })
      // The key is a pure function of the operation identity, so it is stable across processes.
      expect(request(user('one')).creationKey).toBe(request(user('one')).creationKey)
      expect(request(user('one')).creationKey).not.toBe(request(user('two')).creationKey)
      const first = await f.service.openCall(request(user('one')))
      if (!('callId' in first) || first.state !== 'open')
        throw new Error(`open refused: ${JSON.stringify(first)}`)
      expect(first.ref).toEqual({ session: f.session, callId: first.callId })
      const second = await f.service.openCall(request(user('two')))
      if (!('callId' in second)) throw new Error(`second open refused: ${JSON.stringify(second)}`)
      expect(second.callId).not.toBe(first.callId)
      expect(f.tls.requests).toHaveLength(0)
      const read = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in read)) throw new Error('session log unavailable')
      const created = read.entries.flatMap(entry =>
        entry.readKeys.flatMap(raw => {
          const decoded = decodeModelLogKey(raw)
          return 'ok' in decoded && decoded.ok.kind === 'created' ? [decoded.ok.call] : []
        }),
      )
      expect(created.sort()).toEqual([first.callId, second.callId].sort())
      // An unsent call is readable by reference and reports its original creation origin.
      const viewed = retained(await f.service.acquireCall({ ref: first.ref, mode: 'read' }))
      expect(viewed.view).toMatchObject({
        ref: first.ref,
        state: 'open',
        origin: { session: f.session },
      })
      expect(viewed.view.result).toBeUndefined()
      expect(viewed.view.presence.kind).toBe('live')
    } finally {
      await f.close()
    }
  })

  it('acquires the ready result by reference without a second send, and refuses foreign or absent references', async () => {
    const f = await ready('reference-acquire')
    try {
      const sent = await f.app.startServiceCall(f.who, f.session, {
        user: user('acquire'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error(`request did not hand off a reply: ${JSON.stringify(sent)}`)
      expect(f.tls.requests).toHaveLength(1)
      const reference = { session: f.session, callId: sent.callId }
      const viewed = retained(await f.service.acquireCall({ ref: reference, mode: 'read' }))
      // The original execution owner still holds the call until its disposition is settled.
      expect(viewed.view.presence).toMatchObject({
        kind: 'live',
        sourceVersion: DEMO_REFERENCE_SOURCE_VERSION,
      })
      expect(viewed.consumer).toBeUndefined()
      expect(viewed.view.ref).toEqual(reference)
      expect(viewed.view.state).toBe('complete')
      expect(viewed.view.result?.disposition).toBe('disposition_pending')
      expect(viewed.view.origin).toMatchObject({ session: f.session })
      // A waiting acquire on an already ready call needs no consumer resource.
      const waited = retained(await f.service.acquireCall({ ref: reference, mode: 'wait' }))
      expect(waited.consumer).toBeUndefined()
      expect(waited.view.result?.disposition).toBe('disposition_pending')
      // Absence inside the authorized Session is reported from the authoritative log.
      const absent = await f.service.acquireCall({
        ref: { session: f.session, callId: opaque('call-never-created', 'ModelCallId') },
        mode: 'read',
      })
      expect(absent).toEqual({ callNotFound: true })
      // The bound service is scoped to this Session; another Session's reference is not answered.
      const foreign = await f.service.acquireCall({
        ref: { session: opaque('reference-foreign-session', 'SessionRef'), callId: sent.callId },
        mode: 'read',
      })
      expect(foreign).toEqual({ unavailable: true })
      expect(f.tls.requests).toHaveLength(1)
      // Settling the durable disposition does not stop the original execution owner. Only the
      // host's actual stop releases the container, and only then may presence report a stop.
      expect(
        await f.service.settleReply({
          ...reference,
          disposition: { consumed: { by: 'side_query' } },
        }),
      ).toEqual({ callId: sent.callId, state: 'complete' })
      const beforeStop = retained(await f.service.acquireCall({ ref: reference, mode: 'read' }))
      expect(beforeStop.view.presence.kind).toBe('live')
      expect(await f.host.stop()).toEqual({ released: true })
      const settled = retained(await f.service.acquireCall({ ref: reference, mode: 'read' }))
      expect(settled.view.result?.disposition).toBe('final')
      expect(settled.view.presence).toMatchObject({
        kind: 'stopped',
        target: null,
        unknownBatches: [],
      })
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      await f.close()
    }
  })

  it('acknowledges a settled call, releases the model copies and answers the small view by reference', async () => {
    const f = await ready('reference-acknowledge')
    try {
      const sent = await f.app.startServiceCall(f.who, f.session, {
        user: user('acknowledge'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error(`request did not hand off a reply: ${JSON.stringify(sent)}`)
      // The caller keeps its own copy of the original result before handing custody over.
      const pending = sent.result.replyPending
      const reference = { session: f.session, callId: sent.callId }
      const target = { kind: 'response' as const, response: pending.id }
      expect(contentRows(f.databaseFile, sent.callId)).toBeGreaterThan(0)
      expect(await f.app.persistModelReply(f.who, f.session, pending)).toHaveProperty('settled')
      // Another Session's reference is never answered by this Session's service.
      expect(
        await f.service.acknowledgeCall({
          ref: { session: opaque('reference-foreign-session', 'SessionRef'), callId: sent.callId },
          expectedResult: target,
        }),
      ).toEqual({ unavailable: true })
      const acknowledged = await f.service.acknowledgeCall({
        ref: reference,
        expectedResult: target,
      })
      expect(acknowledged).toMatchObject({
        acknowledged: { ref: reference, target, cleanup: 'released' },
      })
      // The durable acknowledgement is the linearization point and the copies are really gone.
      expect(contentRows(f.databaseFile, sent.callId)).toBe(0)
      // A repeated acknowledgement recognizes the original fact.
      expect(await f.service.acknowledgeCall({ ref: reference, expectedResult: target })).toEqual(
        acknowledged,
      )
      // The old reference now answers only the small acknowledged view, never the full result.
      const small = await f.service.acquireCall({ ref: reference, mode: 'read' })
      if (!('view' in small)) throw new Error(`acquire refused: ${JSON.stringify(small)}`)
      const view = small.view
      if (view.acknowledged === undefined) throw new Error('acknowledged view expected')
      expect(view).toMatchObject({
        ref: reference,
        acknowledged: { cleanup: 'released', target },
        terminalState: 'complete',
      })
      expect(view.attempts).toHaveLength(1)
      expect(view.attempts[0]).toMatchObject({ response: pending.id, outcome: 'complete' })
      expect(view).not.toHaveProperty('result')
      expect(view).not.toHaveProperty('presence')
      expect(JSON.stringify(view)).not.toContain('first second')
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      await f.close()
    }
  })

  it('acknowledges a ready-only call by its accounting witness and keeps the disposition pending', async () => {
    const f = await ready('reference-acknowledge-ready')
    try {
      const sent = await f.app.startServiceCall(f.who, f.session, {
        user: user('acknowledge-ready'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error(`request did not hand off a reply: ${JSON.stringify(sent)}`)
      const pending = sent.result.replyPending
      const reference = { session: f.session, callId: sent.callId }
      const target = { kind: 'response' as const, response: pending.id }
      // The reply's message was never persisted: only the caller-held Pending still carries it.
      const acknowledged = await f.service.acknowledgeCall({
        ref: reference,
        expectedResult: target,
      })
      expect(acknowledged).toMatchObject({
        acknowledged: { ref: reference, target, cleanup: 'released' },
      })
      expect(contentRows(f.databaseFile, sent.callId)).toBe(0)
      const small = await f.service.acquireCall({ ref: reference, mode: 'read' })
      if (!('view' in small)) throw new Error(`acquire refused: ${JSON.stringify(small)}`)
      const view = small.view
      if (view.acknowledged === undefined) throw new Error('acknowledged view expected')
      expect(view.attempts[0]).toMatchObject({
        response: pending.id,
        disposition: 'disposition_pending',
      })
      expect(view.attempts[0]).not.toHaveProperty('replyDisposition')
      expect(JSON.stringify(view)).not.toContain('first second')
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      await f.close()
    }
  })

  it('settles an acknowledged ready call from the caller-held original (RT12 S-99)', async () => {
    const f = await ready('reference-acknowledge-settle')
    try {
      const sent = await f.app.startServiceCall(f.who, f.session, {
        user: user('acknowledge-settle'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error(`request did not hand off a reply: ${JSON.stringify(sent)}`)
      const pending = sent.result.replyPending
      const reference = { session: f.session, callId: sent.callId }
      const target = { kind: 'response' as const, response: pending.id }
      expect(
        await f.service.acknowledgeCall({ ref: reference, expectedResult: target }),
      ).toMatchObject({ acknowledged: { ref: reference, target, cleanup: 'released' } })
      const vetoed = { ...reference, disposition: { vetoed: { by: 'input-gate' } } }
      // S-99⑥: after ACK without a final the caller must return its own original.
      expect(await f.service.settleReply(vetoed)).toMatchObject({ wrongPhase: {} })
      expect(await f.service.settleReply({ ...vetoed, retainedResult: pending })).toEqual({
        callId: sent.callId,
        state: 'complete',
      })
      const read = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in read)) throw new Error('durable session read unavailable')
      const responses = read.entries.filter(entry =>
        entry.readKeys.some(rawKey => {
          const decoded = decodeModelLogKey(rawKey)
          return 'ok' in decoded && decoded.ok.kind === 'response'
        }),
      )
      expect(responses).toHaveLength(1)
      expect(JSON.stringify(responses[0]?.payload)).toContain(
        '"replyDisposition":{"vetoed":{"by":"input-gate"}}',
      )
      // S-99⑦: the same committed disposition is recognized without the full value again;
      // a different one never overwrites it.
      const consumed = { ...reference, disposition: { consumed: { by: 'side_query' as const } } }
      expect(await f.service.settleReply(vetoed)).toEqual({
        callId: sent.callId,
        state: 'complete',
      })
      expect(await f.service.settleReply({ ...consumed, retainedResult: pending })).toEqual({
        alreadyEnded: true,
      })
      expect(await f.app.readSessionLog(f.who, f.session)).toEqual(read)
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      await f.close()
    }
  })

  it('withdraws access when the application starts closing', async () => {
    const f = await ready('reference-close')
    const sent = await f.app.startServiceCall(f.who, f.session, {
      user: user('close'),
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      host: f.host.host,
    })
    if (!('callId' in sent)) throw new Error('request refused')
    const reference = { session: f.session, callId: sent.callId }
    const closing = f.close()
    try {
      expect(await f.service.acquireCall({ ref: reference, mode: 'read' })).toEqual({
        unavailable: true,
      })
    } finally {
      await closing
    }
  })
})
