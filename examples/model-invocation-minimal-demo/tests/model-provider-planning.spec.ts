// @module-tag slow
import { symbols } from '@deepseek-ai/cordis'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ModelTransportService } from '@omne-harness-lite/model-request-runtime'
import { MODEL_TRANSPORT } from '@omne-harness-lite/model-request-runtime/cordis'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

describe('actual named provider planning custody', () => {
  it.each(['open', 'dispatch'] as const)(
    'drains original %s planning through managed application closure',
    async phase => {
      const config = await callDeployment(`named-planning-${phase}`)
      const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
      const entered = deferred(),
        native = deferred()
      let block = phase === 'open',
        signal: AbortSignal | undefined
      let active = 0,
        releases = 0
      const scopes: object[] = [],
        cleared: object[] = []
      let restore: (() => void) | undefined
      const app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
        hooks: {
          async fiberCreated(name, fiber) {
            if (name !== 'modelTransport') return
            await fiber
            const traced = fiber.ctx.get(MODEL_TRANSPORT)
            if (!traced) throw new Error('actual transport absent')
            const original = Reflect.get(traced, symbols.original) as ModelTransportService
            const acquire = original.acquire.bind(original),
              clear = original.clearReuseScope.bind(original)
            const acquisition = vi.spyOn(original, 'acquire').mockImplementation((...args) => {
              const result = acquire(...args)
              if (!('lease' in result)) return result
              const lease = result.lease
              return {
                lease: {
                  ...lease,
                  transport: {
                    ...lease.transport,
                    async plan(input, execution) {
                      if (!execution.reuseScope) throw new Error('actual reuse scope absent')
                      scopes.push(execution.reuseScope)
                      if (block) {
                        signal = execution.signal
                        entered.resolve()
                        await native.promise
                      }
                      return lease.transport.plan(input, execution)
                    },
                  },
                  async track<T>(completion: Promise<T>) {
                    active++
                    try {
                      return await lease.track(completion)
                    } finally {
                      active--
                    }
                  },
                  release() {
                    expect(active).toBe(0)
                    releases++
                    lease.release()
                  },
                },
              }
            })
            const cleanup = vi.spyOn(original, 'clearReuseScope').mockImplementation(scope => {
              expect(active).toBe(0)
              expect(releases).toBeGreaterThan(0)
              cleared.push(scope)
              clear(scope)
            })
            restore = () => {
              acquisition.mockRestore()
              cleanup.mockRestore()
            }
          },
        },
      })
      const host = createDemoCallHost()
      let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      let closing: ReturnType<typeof app.close> | undefined
      try {
        await app.ready
        const who = await actor(app)
        diagnostics = await activateModelFixture(app, who, config)
        const prepared = await app.prepareSession(who, `named-planning-${phase}`)
        if (!('session' in prepared)) throw new Error('session preparation failed')
        expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
        const bound = await app.bindModelRuntime(who, prepared.session)
        if (!('service' in bound)) throw new Error('actual runtime absent')
        expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
          attached: true,
        })
        expect(
          await bound.service.selectModel({
            session: prepared.session,
            routeName: 'deepseek/deepseek-v4-pro-0813',
          }),
        ).toHaveProperty('selected')
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref(`named-planning-key-${phase}`),
            body: Buffer.from('controlled-named-key'),
          })),
        ).toEqual({ stored: true })
        const effective = await bound.service.effectiveModel({ session: prepared.session })
        if (!('effectiveModel' in effective)) throw new Error('actual selected model absent')
        const user = judgeMessage({
          type: 'user',
          id: `named-planning-user-${phase}`,
          createdAt: '2026-09-28T00:00:00Z',
          blocks: [
            {
              id: `named-planning-text-${phase}`,
              kind: 'text',
              text: 'plan without sending',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        if (!('ok' in user)) throw new Error('user invalid')
        const opening = bound.service.openCall({
          session: prepared.session,
          creationKey: unwrap(
            parseOpaqueIdentifier(`named-planning-create-${phase}`, 'CreationKey'),
          ),
          target: effective.effectiveModel.routeName,
          basis: effective.effectiveModel,
          messages: [user.ok],
          tools: [],
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        const operation =
          phase === 'open'
            ? opening
            : opening.then(async opened => {
                if (!('callId' in opened)) throw new Error('call not opened')
                block = true
                return bound.service.dispatch({ session: prepared.session, callId: opened.callId })
              })
        await entered.promise
        expect(active).toBeGreaterThan(0)
        let closed = false
        closing = app.close().then(result => {
          closed = true
          return result
        })
        // Physical closure is asynchronous; observe the actual planning abort, not a timer guess.
        await expect.poll(() => signal?.aborted).toBe(true)
        expect(closed).toBe(false)
        expect(releases).toBe(0)
        expect(cleared).toEqual([])
        expect(new Set(scopes).size).toBe(1)
        expect(tls.requests).toHaveLength(0)
        native.resolve()
        await operation
        expect((await closing).complete).toBe(true)
        expect(active).toBe(0)
        expect(releases).toBe(1)
        expect(cleared).toEqual([scopes[0]])
        expect(tls.requests).toHaveLength(0)
        expect((await app.close()).complete).toBe(true)
      } finally {
        native.resolve()
        await closing
        await host.stop()
        if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
        else await app.close()
        restore?.()
        await tls.close()
      }
    },
  )
})
