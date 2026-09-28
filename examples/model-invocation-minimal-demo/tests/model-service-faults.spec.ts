import { dirname, join } from 'node:path'
import { open, type FileHandle } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { judgeMessage, type UserMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment, publication, ROOT } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
const AT = '2026-09-28T00:00:00Z'
const BODY = 'controlled-service-fault-key'

function user(id: string): UserMessage {
  const judged = judgeMessage({
    type: 'user',
    id: `user-${id}`,
    createdAt: AT,
    blocks: [
      {
        id: `text-${id}`,
        kind: 'text',
        text: 'hello',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('test user invalid')
  return judged.ok
}
function send(
  app: ReturnType<typeof createAcceptanceApplication>,
  who: Awaited<ReturnType<typeof actor>>,
  session: string,
  host: ReturnType<typeof createDemoCallHost>,
  id: string,
) {
  return app.startServiceTextCall(who, session, {
    user: user(id),
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    host: host.host,
  })
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

describe('real unified service boundaries in the demo', () => {
  it('rejects cross-tenant and malformed input before HTTP, and refuses missing or non-UTF8 credentials', async () => {
    const config = await callDeployment('service-zero-send')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    try {
      await app.ready
      const who = await actor(app),
        other = await actor(app, 'other')
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      expect(await send(app, other, 's1', host, 'cross')).toEqual({ failure: 'identityMismatch' })
      expect(
        await app.startServiceTextCall(who, 's1', {
          user: {} as UserMessage,
          parameters: {},
          host: host.host,
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      const missing = await send(app, who, 's1', host, 'missing')
      expect(missing).toMatchObject({ state: 'handed_up', undispatched: 'credential_unavailable' })
      await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref('nonutf8-service'),
        body: new Uint8Array([0x41, 0x80]),
      }))
      const nonutf8 = await send(app, who, 's1', host, 'nonutf8')
      expect(nonutf8).toMatchObject({ result: { unavailable: true } })
      expect(tls.requests).toHaveLength(0)
    } finally {
      await host.stop()
      await app.close()
      await tls.close()
    }
  })

  it('retains an unknown actual JSONL reply append and prevents a second physical send', async () => {
    const config = await callDeployment('service-unknown-reply')
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    const probe = await open(join(dirname(config.databaseFile), 'probe'), 'w')
    const prototype: unknown = Object.getPrototypeOf(probe)
    if (!fileMethods(prototype)) throw new Error('actual file methods unavailable')
    const sync = prototype.datasync,
      truncate = prototype.truncate
    let fail = false
    const syncSpy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
    ) {
      if (fail) throw Object.assign(new Error('controlled fs fault'), { code: 'EIO' })
      await sync.call(this)
    })
    const truncateSpy = vi.spyOn(prototype, 'truncate').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
      size,
    ) {
      if (fail) throw Object.assign(new Error('controlled fs fault'), { code: 'EIO' })
      await truncate.call(this, size)
    })
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref('service-unknown-key'),
        body: Buffer.from(BODY),
      }))
      const first = await send(app, who, 's1', host, 'first')
      if (!('result' in first) || !('replyPending' in first.result))
        throw new Error('pending reply unavailable')
      fail = true
      expect(await app.persistModelReply(who, 's1', first.result.replyPending)).toMatchObject({
        unavailable: true,
      })
      expect(await send(app, who, 's1', host, 'second')).toMatchObject({ unavailable: true })
      expect(tls.requests).toHaveLength(1)
      expect((await app.close()).complete).toBe(false)
    } finally {
      fail = false
      syncSpy.mockRestore()
      truncateSpy.mockRestore()
      await host.stop()
      await app.close()
      await probe.close()
      await tls.close()
    }
  })

  it('keeps the dispatched lock binding while the current source changes', async () => {
    const base = await callDeployment('service-locked-source')
    const entered = deferred(),
      resume = deferred()
    const tls = await createLocalTls(join(dirname(base.databaseFile), 'tls'), async () => {
      entered.resolve()
      await resume.promise
    })
    let changed = false
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          async prepare(who: Parameters<typeof publication>[0]) {
            const source = publication(who, changed ? '1' : null)
            return {
              publication: {
                ...source,
                scopes: source.scopes.map(scope =>
                  scope.holder.layer === 'organization'
                    ? {
                        ...scope,
                        holdings: source.scopes.flatMap(factory =>
                          factory.holder.layer === 'factory'
                            ? factory.holdings.map(holding => ({
                                ...holding,
                                holder: {
                                  layer: 'organization' as const,
                                  organization: who.tenant.organization,
                                },
                                assignments: [
                                  { item: 'model', value: MODEL, immutable: !changed, since: AT },
                                ],
                              }))
                            : [],
                        ),
                      }
                    : scope,
                ),
              },
              recipe: { rootDefinition: ROOT },
            }
          },
        },
      },
    }
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    const host = createDemoCallHost()
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref('locked-service-key'),
        body: Buffer.from(BODY),
      }))
      const started = send(app, who, 's1', host, 'locked')
      await entered.promise
      changed = true
      expect(await app.prepareModelInputs(who, 's1')).toEqual({ prepared: true })
      resume.resolve()
      const sent = await started
      if (!('result' in sent) || !('replyPending' in sent.result))
        throw new Error('pending reply unavailable')
      expect(sent.result.replyPending.route.selectedBy).toBe('layer_lock')
      expect(await app.persistModelReply(who, 's1', sent.result.replyPending)).toHaveProperty(
        'settled',
      )
      const current = await app.effectiveModel(who, 's1')
      if (!('ok' in current)) throw new Error('current model unavailable')
      expect(current.ok.selectedBy).toBe('session')
      expect(tls.requests).toHaveLength(1)
    } finally {
      resume.resolve()
      await host.stop()
      await app.close()
      await tls.close()
    }
  })
})
