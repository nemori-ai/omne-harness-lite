import type { Context, Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { modelProfileDirectoryPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis'
import { createAcceptanceApplication, type AcceptanceEvent } from '../src/index.ts'
import { deployment, evidence, noBusinessBeforeConfirmation, persisted } from './support.ts'

describe('AB-V2 original ordering negative control', () => {
  for (const nonempty of [false, true])
    it(`the unchanged real write oracle rejects preconfirmation ${nonempty ? 'nonempty' : 'empty'} manifest adoption`, async () => {
      const original = await deployment(`old-order-${String(nonempty)}`)
      const entries = nonempty
        ? [
            {
              routeName: 'synthetic-acceptance-profile',
              origin: 'official' as const,
              providers: ['synthetic-provider'],
              allowFallback: false,
              inputModalities: ['text' as const],
              outputModalities: ['text' as const],
              maxInputTokens: 1024,
              maxOutputTokens: 512,
              inputConstraints: {},
              upstreamInputLimits: {
                maxInputTokens: { status: 'unknown' as const },
                maxRequestBytes: { status: 'unknown' as const },
              },
              adaptation: {
                implementation: { name: 'synthetic-acceptance', revision: 'i1' },
                definition: { modelId: 'synthetic-acceptance-profile', revision: 'd1' },
                configuration: { revision: 'c1', values: {} },
              },
            },
          ]
        : []
      const config = { ...original, officialManifest: { ordinal: 1, entries } }
      const events: AcceptanceEvent[] = []
      let base: Context | undefined,
        extra: Fiber | undefined,
        observed: ReturnType<typeof persisted> | undefined
      let oracleFailure: string | undefined
      const app = createAcceptanceApplication(config, {
        diagnostics: { record: event => events.push(event) },
        hooks: {
          storageOpened(storage) {
            const atomic = storage.atomic.bind(storage),
              write = storage.write.bind(storage)
            const observe = () => {
              observed = persisted(config.databaseFile)
              try {
                noBusinessBeforeConfirmation(observed)
              } catch (error) {
                oracleFailure = error instanceof Error ? error.name : 'non-error'
                throw error
              }
            }
            storage.atomic = async callback => {
              const result = await atomic(callback)
              observe()
              return result
            }
            storage.write = async callback => {
              const result = await write(callback)
              observe()
              return result
            }
          },
          fiberCreated(name, fiber) {
            if (name === 'storage') base = fiber.ctx
          },
          async beforeConfirm() {
            if (base === undefined) throw new Error('actual base context absent')
            extra = base.plugin(modelProfileDirectoryPlugin, {
              faceMode: 'management',
              officialManifest: config.officialManifest,
            })
            try {
              await extra
            } finally {
              await extra.dispose()
            }
          },
        },
      })
      await expect(app.ready).rejects.toMatchObject({ phase: 'confirm' })
      expect(oracleFailure).toBe('AssertionError')
      expect(observed?.manifest).toBe('1')
      expect(events.some(e => e.event === 'confirm' && e.outcome === 'succeeded')).toBe(false)
      expect((await app.close()).complete).toBe(true)
      await evidence(`AB-V2-${String(nonempty)}`, {
        observed,
        oracleFailure,
        events,
        extraState: extra?.state,
        modelHttp: 0,
      })
    })
})
