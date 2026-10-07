/** @module-tag slow: actual identity, SQLite, image planning and local TLS. */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { LOGINS_SERVICE, type Logins } from '@omne-harness-lite/account-identity/cordis'
import { decodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { activateModelFixture, actor, PASSWORD, ref } from './support.ts'

// F0-A6: the same-unit original issue must check the login of this invocation.
test('a concurrent valid login cannot authorize an original invocation whose login was revoked during image planning', async () => {
  const base = await callDeployment('original-actor-issue', 'flash')
  const preparation = base.modelRequest.transport.imagePreparation!
  const native = preparation.codec!
  const entered = deferred(),
    proceed = deferred()
  let held = false
  const config = {
    ...base,
    modelRequest: {
      ...base.modelRequest,
      transport: {
        ...base.modelRequest.transport,
        imagePreparation: {
          ...preparation,
          codec: {
            ...native,
            async inspect(...input: Parameters<typeof native.inspect>) {
              const result = await native.inspect(...input)
              if (!held) {
                held = true
                entered.resolve()
                await proceed.promise
              }
              return result
            },
          },
        },
      },
    },
  }
  const tls = await createLocalTls(
    join(dirname(config.databaseFile), 'tls'),
    async () => {},
    0,
    base.modelRequest.transport.definitions[0]!.modelId,
  )
  let logins: Logins | undefined
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
    hooks: {
      async fiberCreated(name, fiber) {
        if (name !== 'accountIdentity') return
        await fiber
        logins = fiber.ctx.get(LOGINS_SERVICE)
      },
    },
  })
  const host = createDemoCallHost()
  let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
  let original: ReturnType<typeof app.startServiceCall> | undefined
  try {
    await app.ready
    const a = await actor(app)
    diagnostics = await activateModelFixture(app, a, config)
    const b = await app.authenticate('alice', PASSWORD)
    if (!('account' in b) || !logins) throw new Error('login fixtures unavailable')
    expect(b.account).toBe(a.account)
    expect(b.tenant).toEqual(a.tenant)
    expect(b.loginState).not.toBe(a.loginState)
    await app.prepareSession(a, 'original-actor-session')
    await app.prepareModelInputs(a, 'original-actor-session')
    await app.attachModelCallHost(a, 'original-actor-session', host)
    await app.selectModel(
      a,
      'original-actor-session',
      base.modelRequest.transport.definitions[0]!.modelId,
    )
    await app.publishCredential(a, async who => ({
      account: who.account,
      tenant: who.tenant,
      sourceRef: ref('original-actor-key'),
      body: Buffer.from('controlled-original-actor-key'),
    }))
    const png = await readFile(
      new URL(
        '../../../packages/model/pi-ai-transport/tests/fixtures/deepseek-v41-flash/public-red-544.png',
        import.meta.url,
      ),
    )
    const image = judgeMessage({
      type: 'user',
      id: 'original-actor-image',
      createdAt: '2026-09-28T00:00:00Z',
      blocks: [
        {
          id: 'original-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: png.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if (!('ok' in image) || image.ok.type !== 'user') throw new Error('image fixture invalid')
    original = app.startServiceCall(a, 'original-actor-session', {
      user: image.ok,
      parameters: {},
      host: host.host,
    })
    await entered.promise
    expect(await app.bindModelRuntime(b, 'original-actor-session')).toHaveProperty('service')
    expect(await logins.revoke(a.loginState, b.loginState)).toBe('ok')
    proceed.resolve()
    await original
    expect(tls.requests).toHaveLength(0)
    const read = await app.readSessionLog(b, 'original-actor-session')
    if (!('entries' in read)) throw new Error('durable history unavailable')
    expect(
      read.entries.filter(entry =>
        entry.readKeys.some(key => {
          const parsed = decodeModelLogKey(key)
          return 'ok' in parsed && parsed.ok.kind === 'dispatched'
        }),
      ),
    ).toHaveLength(0)
    const text = judgeMessage({
      type: 'user',
      id: 'valid-login-user',
      createdAt: '2026-09-28T00:00:00Z',
      blocks: [
        {
          id: 'valid-text',
          kind: 'text',
          text: 'hello',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if (!('ok' in text) || text.ok.type !== 'user') throw new Error('text fixture invalid')
    const valid = await app.startServiceCall(b, 'original-actor-session', {
      user: text.ok,
      parameters: {},
      host: host.host,
    })
    expect(valid).toHaveProperty('result.replyPending')
    if ('result' in valid && 'replyPending' in valid.result)
      expect(
        await app.persistModelReply(b, 'original-actor-session', valid.result.replyPending),
      ).toHaveProperty('settled')
    expect(tls.requests).toHaveLength(1)
  } finally {
    proceed.resolve()
    await original
    await host.stop()
    if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
    else await app.close()
    await tls.close()
  }
})
