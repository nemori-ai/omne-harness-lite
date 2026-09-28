import { open, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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

async function scenario(label: string) {
  const config = await callDeployment(label)
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
    const prepared = await app.prepareSession(who, `${label}-session`)
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
        sourceRef: ref(`${label}-key`),
        body: Buffer.from('controlled-settlement-key'),
      })),
    ).toEqual({ stored: true })
    return {
      config,
      app,
      who,
      host,
      tls,
      session: prepared.session,
      service: bound.service,
      async close() {
        await host.stop()
        await app.close()
        await tls.close()
      },
    }
  } catch (error) {
    await host.stop()
    await app.close()
    await tls.close()
    throw error
  }
}

function fileMethods(value: unknown): value is Pick<FileHandle, 'datasync' | 'truncate'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'datasync' in value &&
    typeof value.datasync === 'function' &&
    'truncate' in value &&
    typeof value.truncate === 'function'
  )
}

function responseEntries<T extends { readonly readKeys: readonly string[] }>(
  entries: readonly T[],
): T[] {
  return entries.filter(entry =>
    entry.readKeys.some(rawKey => {
      const decoded = decodeModelLogKey(rawKey)
      return 'ok' in decoded && decoded.ok.kind === 'response'
    }),
  )
}

function messageEntries<T extends { readonly readKeys: readonly string[] }>(
  entries: readonly T[],
): T[] {
  return entries.filter(entry =>
    entry.readKeys.some(rawKey => {
      const decoded = decodeModelLogKey(rawKey)
      return 'ok' in decoded && decoded.ok.kind === 'message'
    }),
  )
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

  it('commits consumed with the full upstream facts, no assistant message, and no illegal persisted append', async () => {
    const s = await scenario('service-settlement-consumed')
    try {
      const sent = await s.app.startServiceCall(s.who, s.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: s.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error('real request did not hand off a reply')
      const key = { session: s.session, callId: sent.callId }
      const consumed = { ...key, disposition: { consumed: { by: 'compaction' as const } } }
      expect(await s.service.settleReply(consumed)).toEqual({
        callId: sent.callId,
        state: 'complete',
      })
      const read = await s.app.readSessionLog(s.who, s.session)
      if (!('entries' in read)) throw new Error('durable session read unavailable')
      const responses = responseEntries(read.entries)
      expect(responses).toHaveLength(1)
      expect(messageEntries(read.entries)).toHaveLength(1)
      const response = writeJsonLossless(responses[0]?.payload)
      expect(response).toContain('"replyDisposition":{"consumed":{"by":"compaction"}}')
      expect(response).toContain('"reply":{')
      expect(response).toContain('"input_tokens":5')
      expect(response).toContain('"output_tokens":3')
      expect(response).toContain('"cost_usd":0.0000117')
      expect(await s.service.readAttempts(key)).toHaveProperty('state', 'complete')
      // A runtime boundary still validates an untyped caller; persisted belongs to the caller's
      // single message + response commit, never to this service operation.
      await expect(
        Reflect.apply(s.service.settleReply, s.service, [{ ...key, disposition: 'persisted' }]),
      ).resolves.toEqual({ invalidInput: { reason: 'malformed' } })
      expect(await s.app.readSessionLog(s.who, s.session)).toEqual(read)
      expect(s.tls.requests).toHaveLength(1)
    } finally {
      await s.close()
    }
  })

  it('keeps the persisted message and response as the single winner over a later veto', async () => {
    const s = await scenario('service-settlement-persisted-wins')
    try {
      const sent = await s.app.startServiceCall(s.who, s.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: s.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error('real request did not hand off a reply')
      const persisted = await s.app.persistModelReply(s.who, s.session, sent.result.replyPending)
      expect(persisted).toHaveProperty('settled')
      const read = await s.app.readSessionLog(s.who, s.session)
      if (!('entries' in read)) throw new Error('durable session read unavailable')
      expect(responseEntries(read.entries)).toHaveLength(1)
      expect(messageEntries(read.entries)).toHaveLength(2)
      expect(writeJsonLossless(responseEntries(read.entries)[0]?.payload)).toContain(
        '"replyDisposition":"persisted"',
      )
      expect(
        await s.service.settleReply({
          session: s.session,
          callId: sent.callId,
          disposition: { vetoed: { by: 'input-gate' } },
        }),
      ).toEqual({ alreadyEnded: true })
      expect(await s.app.readSessionLog(s.who, s.session)).toEqual(read)
      expect(s.tls.requests).toHaveLength(1)
    } finally {
      await s.close()
    }
  })

  it('allows only one complete response when persisted and vetoed settle concurrently', async () => {
    const s = await scenario('service-settlement-competing-writers')
    try {
      const sent = await s.app.startServiceCall(s.who, s.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: s.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error('real request did not hand off a reply')
      const vetoed = {
        session: s.session,
        callId: sent.callId,
        disposition: { vetoed: { by: 'input-gate' } },
      }
      const [persistResult, vetoResult] = await Promise.all([
        s.app.persistModelReply(s.who, s.session, sent.result.replyPending),
        s.service.settleReply(vetoed),
      ])
      const read = await s.app.readSessionLog(s.who, s.session)
      if (!('entries' in read)) throw new Error('durable session read unavailable')
      const responses = responseEntries(read.entries)
      expect(responses).toHaveLength(1)
      const response = writeJsonLossless(responses[0]?.payload)
      expect(response).toContain('"cost_usd":0.0000117')
      expect(response).toContain('"input_tokens":5')
      if (response.includes('"replyDisposition":"persisted"')) {
        expect(messageEntries(read.entries)).toHaveLength(2)
        expect(persistResult).toHaveProperty('settled')
        expect(await s.service.settleReply(vetoed)).toEqual({ alreadyEnded: true })
      } else {
        expect(response).toContain('"replyDisposition":{"vetoed":{"by":"input-gate"}}')
        expect(messageEntries(read.entries)).toHaveLength(1)
        expect(vetoResult).toEqual({ callId: sent.callId, state: 'complete' })
        const retriedPersist = await s.app.persistModelReply(
          s.who,
          s.session,
          sent.result.replyPending,
        )
        expect(retriedPersist).toMatchObject({ settled: { disposition: 'firstWinner' } })
        expect(await s.service.settleReply(vetoed)).toEqual({
          callId: sent.callId,
          state: 'complete',
        })
      }
      expect(await s.app.readSessionLog(s.who, s.session)).toEqual(read)
      expect(s.tls.requests).toHaveLength(1)
    } finally {
      await s.close()
    }
  })

  it('keeps a vetoed settlement unknown when actual JSONL datasync and truncate both fail', async () => {
    const s = await scenario('service-settlement-unknown-receipt')
    const probe = await open(join(dirname(s.config.databaseFile), 'fault-probe'), 'w')
    const prototype: unknown = Object.getPrototypeOf(probe)
    if (!fileMethods(prototype)) throw new Error('actual FileHandle methods unavailable')
    const sync = prototype.datasync,
      truncate = prototype.truncate
    let faulting = false,
      syncFailures = 0,
      truncateFailures = 0
    const syncSpy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
    ) {
      if (faulting) {
        syncFailures++
        throw Object.assign(new Error('controlled datasync failure'), { code: 'EIO' })
      }
      await sync.call(this)
    })
    const truncateSpy = vi.spyOn(prototype, 'truncate').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
      size,
    ) {
      if (faulting) {
        truncateFailures++
        throw Object.assign(new Error('controlled truncate failure'), { code: 'EIO' })
      }
      await truncate.call(this, size)
    })
    try {
      const sent = await s.app.startServiceCall(s.who, s.session, {
        user: user(),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: s.host.host,
      })
      if (!('result' in sent) || !('callId' in sent) || !('replyPending' in sent.result))
        throw new Error('real request did not hand off a reply')
      faulting = true
      expect(
        await s.service.settleReply({
          session: s.session,
          callId: sent.callId,
          disposition: { vetoed: { by: 'input-gate' } },
        }),
      ).toEqual({ unavailable: true })
      expect(syncFailures).toBeGreaterThan(0)
      expect(truncateFailures).toBeGreaterThan(0)
      expect(s.tls.requests).toHaveLength(1)
      expect((await s.app.close()).complete).toBe(false)
    } finally {
      faulting = false
      syncSpy.mockRestore()
      truncateSpy.mockRestore()
      await probe.close()
      await s.close()
    }
  })
})
