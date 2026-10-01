import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment, demoRetirement } from './model-request-support.ts'
import { actor, ref } from './support.ts'

function user() {
  const result = judgeMessage({
    type: 'user',
    id: 'd6-io-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'd6-io-text',
        kind: 'text',
        text: 'private diagnostic io prompt',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid D6 user')
  return result.ok
}

describe('D6 business durability under actual diagnostic filesystem failure', () => {
  it.each(['write', 'sync'] as const)(
    '%s failure does not undo an actual model reply',
    async failure => {
      const config = await callDeployment(`d6-completion-${failure}-fault`)
      const directory = dirname(config.databaseFile)
      const tls = await createLocalTls(join(directory, 'tls'))
      const app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
      const host = createDemoCallHost()
      let armed: 'none' | 'write' | 'sync' = 'none'
      let faultCalls = 0
      let diagnostics: Awaited<ReturnType<typeof openDemoDiagnosticAssembly>> | undefined
      try {
        await app.ready
        const who = await actor(app)
        await ensureDemoDiagnosticParent(directory)
        const base = createDemoDiagnosticConfig(directory, who.tenant, demoRetirement())
        diagnostics = await openDemoDiagnosticAssembly({
          ...base,
          journalFileSystem: {
            ...fs,
            open: async (path, flags, mode) => {
              const handle = await fs.open(path, flags, mode)
              if (
                flags !==
                  (constants.O_CREAT |
                    constants.O_EXCL |
                    constants.O_WRONLY |
                    constants.O_NOFOLLOW) ||
                !String(path).includes('/tenant/')
              )
                return handle
              return new Proxy(handle, {
                get(target, key) {
                  const value: unknown = Reflect.get(target, key, target)
                  if (key === 'write' || key === 'sync') {
                    if (typeof value !== 'function')
                      throw new Error('diagnostic FileHandle operation absent')
                    return (...args: unknown[]) => {
                      if (armed === key) {
                        faultCalls++
                        throw new Error('controlled diagnostic filesystem failure')
                      }
                      return Reflect.apply(value, target, args)
                    }
                  }
                  return typeof value === 'function' ? value.bind(target) : value
                },
              })
            },
          },
        })
        expect(await app.activateModelRequest(who, diagnostics, diagnostics.transports)).toEqual({
          activated: true,
        })
        const prepared = await app.prepareSession(who, 'd6-io-session')
        if (!('session' in prepared)) throw new Error('session preparation failed')
        expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
        expect(
          await app.selectModel(who, prepared.session, 'deepseek/deepseek-v4-pro-0813'),
        ).toEqual({ selected: 'deepseek/deepseek-v4-pro-0813' })
        expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({
          attached: true,
        })
        expect(
          await app.publishCredential(who, async checked => ({
            account: checked.account,
            tenant: checked.tenant,
            sourceRef: ref('d6-io-credential'),
            body: Buffer.from('d6-io-private-key'),
          })),
        ).toEqual({ stored: true })
        await expect.poll(() => diagnostics?.tenant.health().queuedRecords).toBe(0)
        await expect.poll(() => diagnostics?.tenant.health().pendingWrites).toBe(0)
        const priorWritten = diagnostics.tenant.health().writtenSequence
        if (failure === 'write') armed = 'write'
        const sent = await app.startServiceCall(who, prepared.session, {
          user: user(),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: host.host,
        })
        if (!('result' in sent) || !('replyPending' in sent.result))
          throw new Error('real model reply absent')
        expect(
          await app.persistModelReply(who, prepared.session, sent.result.replyPending),
        ).toHaveProperty('settled')
        const beforeClose = await app.readSessionLog(who, prepared.session)
        if (!('entries' in beforeClose)) throw new Error('durable session prefix unavailable')
        expect(beforeClose.entries.length).toBeGreaterThan(0)
        expect(tls.requests).toHaveLength(1)
        if (failure === 'sync') armed = 'sync'
        let businessClose: Awaited<ReturnType<typeof app.close>> | undefined
        const closed = await diagnostics.closeAfterBusiness(async () => {
          businessClose = await app.close()
          return businessClose
        })
        expect(businessClose?.complete).toBe(true)
        expect(closed.businessComplete).toBe(true)
        expect(closed.complete).toBe(false)
        expect(faultCalls).toBeGreaterThan(0)
        if (failure === 'write') {
          expect(diagnostics.tenant.health().writeFailures).toBeGreaterThan(0)
          expect(diagnostics.tenant.health().writtenSequence).toBe(priorWritten)
        } else {
          expect(diagnostics.tenant.health().writtenSequence).toBeDefined()
          expect(diagnostics.tenant.health().flushedSequence).toBeUndefined()
          expect(diagnostics.tenant.health().flushFailures).toBeGreaterThan(0)
          expect(closed.tenant).toMatchObject({ incomplete: { flushFailed: true } })
        }
        expect(diagnostics.tenant.health().coverage).not.toBe('complete')
      } finally {
        armed = 'none'
        await host.stop()
        if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
        else await app.close()
        await tls.close()
      }
    },
  )
})
