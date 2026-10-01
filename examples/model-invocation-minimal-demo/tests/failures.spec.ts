import { chmod, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Fiber } from '@deepseek-ai/cordis'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import type { ModelCatalogRead } from '@omne-harness-lite/model-profile-directory'
import { MODEL_CATALOG_SERVICE } from '@omne-harness-lite/model-profile-directory/plugin'
import {
  createAcceptanceApplication,
  AcceptanceStartupFailure,
  type AcceptanceEvent,
} from '../src/index.ts'
import { actor, deployment, evidence, fixture, latch, PASSWORD, persisted } from './support.ts'

function catalogRead(value: unknown): value is Pick<ModelCatalogRead, 'listProfiles'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'listProfiles' in value &&
    typeof value.listProfiles === 'function'
  )
}

describe('AB-V3 / V5: startup failures preserve the correct side of confirmation', () => {
  for (const kind of ['mode', 'size', 'directory', 'missing', 'keyPair'] as const) {
    it(`rejects ${kind} before storage or confirmation`, async () => {
      let config = await deployment(`key-${kind}`)
      const events: AcceptanceEvent[] = []
      if (kind === 'mode') await chmod(config.keys.modelReplica, 0o644)
      if (kind === 'size') await writeFile(config.keys.modelReplica, Buffer.alloc(31))
      if (kind === 'directory') {
        await unlink(config.keys.modelReplica)
        config = {
          ...config,
          keys: { ...config.keys, modelReplica: dirname(config.keys.modelReplica) },
        }
      }
      if (kind === 'missing') await unlink(config.keys.modelReplica)
      if (kind === 'keyPair')
        await writeFile(config.keys.activationVerification, generateHandoffKeyPair().publicKeyPem)
      const app = createAcceptanceApplication(config, {
        diagnostics: { record: event => events.push(event) },
      })
      await expect(app.ready).rejects.toMatchObject({ phase: 'prepare', category: 'configuration' })
      expect(events.some(e => e.event === 'confirm')).toBe(false)
      expect((await app.close()).complete).toBe(true)
      await expect(stat(config.databaseFile)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  }

  it('refuses an unsafe existing database without changing its bytes or mode', async () => {
    const config = await deployment('existing-unsafe-database')
    const bytes = Buffer.from('preexisting-database-input')
    await writeFile(config.databaseFile, bytes, { mode: 0o644, flag: 'wx' })
    const app = createAcceptanceApplication(config, { diagnostics: { record() {} } })
    await expect(app.ready).rejects.toMatchObject({ phase: 'prepare', category: 'configuration' })
    expect((await app.close()).complete).toBe(true)
    expect(await readFile(config.databaseFile)).toEqual(bytes)
    expect((await stat(config.databaseFile)).mode & 0o777).toBe(0o644)
    await evidence('AB-V3-existing-unsafe-database', {
      unchanged: true,
      mode: '0644',
      serving: app.status().serving,
    })
  })

  it('does not confirm when loss of the actual storage contribution leaves required fibers pending', async () => {
    const config = await deployment('required-pending')
    const events: AcceptanceEvent[] = []
    let storageFiber: Fiber | undefined
    let pendingObserved = false
    const app = createAcceptanceApplication(config, {
      diagnostics: { record: event => events.push(event) },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name === 'storage') storageFiber = fiber
          if (name === 'accountIdentity') {
            if (storageFiber === undefined) throw new Error('storage fiber not captured')
            await storageFiber.dispose()
            await fiber.await()
            pendingObserved = fiber.state === FIBER_STATE.PENDING
          }
        },
      },
    })
    await expect(app.ready).rejects.toMatchObject({ phase: 'accountIdentity', category: 'pending' })
    expect(pendingObserved).toBe(true)
    expect(events.some(event => event.event === 'confirm')).toBe(false)
    expect((await app.close()).complete).toBe(true)
    await expect(stat(config.databaseFile)).rejects.toMatchObject({ code: 'ENOENT' })
    await evidence('AB-V3-required-pending', {
      pendingObserved,
      events,
      serving: app.status().serving,
    })
  })

  it('does not confirm a real failed migration or a required disposed fiber', async () => {
    for (const fault of ['migration', 'fiber'] as const) {
      const config = await deployment(`base-${fault}`)
      const events: AcceptanceEvent[] = []
      const app = createAcceptanceApplication(config, {
        diagnostics: { record: e => events.push(e) },
        hooks:
          fault === 'migration'
            ? {
                extraMigrations: [
                  {
                    name: 'actual-failed-migration',
                    migration: {
                      async up(db) {
                        await db.schema
                          .createTable('partial_migration')
                          .addColumn('id', 'integer')
                          .execute()
                        throw new Error('controlled migration fault')
                      },
                    },
                  },
                ],
              }
            : {
                async fiberCreated(name, fiber) {
                  if (name === 'credentials') await fiber.dispose()
                },
              },
      })
      await expect(app.ready).rejects.toBeInstanceOf(AcceptanceStartupFailure)
      expect(events.some(e => e.event === 'confirm')).toBe(false)
      expect(app.status().serving).toBe(false)
      expect((await app.close()).complete).toBe(true)
      await expect(stat(config.databaseFile)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('a real clock storage failure leaves its required fiber failed and never confirms', async () => {
    const config = await deployment('required-failed')
    const events: AcceptanceEvent[] = []
    let failedObserved = false
    let injected = 0
    const app = createAcceptanceApplication(config, {
      diagnostics: { record: event => events.push(event) },
      hooks: {
        storageOpened(storage) {
          const write = storage.write.bind(storage)
          storage.write = callback => {
            if (injected === 0) {
              injected += 1
              throw new StorageUnavailable('controlled clock lease write failure')
            }
            return write(callback)
          }
        },
        async fiberCreated(name, fiber) {
          if (name === 'clock') {
            try {
              await fiber.await()
            } catch (error) {
              failedObserved = fiber.state === FIBER_STATE.FAILED
              throw error
            }
          }
        },
      },
    })
    await expect(app.ready).rejects.toMatchObject({ phase: 'clock', category: 'failed' })
    expect(failedObserved).toBe(true)
    expect(injected).toBe(1)
    expect(events.some(event => event.event === 'confirm')).toBe(false)
    expect((await app.close()).complete).toBe(true)
    await expect(stat(config.databaseFile)).rejects.toMatchObject({ code: 'ENOENT' })
    await evidence('AB-V3-required-failed', { failedObserved, injected, events })
  })

  it('a failed additional migration restores a real existing database and its committed identity facts', async () => {
    const { config, app: first } = await fixture('existing-migration-failure')
    expect(await first.register('before-upgrade', PASSWORD)).toBe('registered')
    expect((await first.close()).complete).toBe(true)
    const prior = persisted(config.databaseFile)
    const key = await readFile(config.keys.modelReplica)
    const events: AcceptanceEvent[] = []
    const failed = createAcceptanceApplication(config, {
      diagnostics: { record: event => events.push(event) },
      hooks: {
        extraMigrations: [
          {
            name: 'existing-failed-addition',
            migration: {
              async up(db) {
                await db.schema
                  .createTable('existing_partial_migration')
                  .addColumn('id', 'integer')
                  .execute()
                throw new Error('controlled existing migration failure')
              },
            },
          },
        ],
      },
    })
    await expect(failed.ready).rejects.toMatchObject({ phase: 'storage', category: 'storage' })
    const closed = await failed.close()
    expect(closed.complete).toBe(true)
    expect(closed.pending).toBe('clear')
    expect(persisted(config.databaseFile)).toEqual(prior)
    expect((await stat(config.databaseFile)).mode & 0o777).toBe(0o600)
    expect(await readFile(config.keys.modelReplica)).toEqual(key)
    expect(events.some(event => event.event === 'confirm')).toBe(false)
    await evidence('AB-V3-existing-migration-failure', {
      prior,
      restored: persisted(config.databaseFile),
      closed,
      unchangedKey: true,
      events,
    })
  })

  it('loss of the real manifest commit receipt keeps its committed state despite directory provide failing', async () => {
    const config = await deployment('manifest-receipt-loss')
    const events: AcceptanceEvent[] = []
    let confirmed = false
    let injected = 0
    const app = createAcceptanceApplication(config, {
      diagnostics: {
        record(event) {
          events.push(event)
          if (event.event === 'confirm' && event.outcome === 'succeeded') confirmed = true
        },
      },
      hooks: {
        storageOpened(storage) {
          const write = storage.write.bind(storage)
          storage.write = async callback => {
            const result = await write(callback)
            if (confirmed && injected === 0 && persisted(config.databaseFile).manifest === '1') {
              injected += 1
              throw new StorageUnavailable('controlled lost manifest commit receipt')
            }
            return result
          }
        },
      },
    })
    await expect(app.ready).rejects.toMatchObject({ phase: 'directory', category: 'failed' })
    expect(injected).toBe(1)
    expect(app.status().serving).toBe(false)
    expect((await app.close()).complete).toBe(true)
    const committed = persisted(config.databaseFile)
    expect(committed.manifest).toBe('1')
    expect(Object.values(committed.counts)).toEqual([0, 0, 0, 0, 0, 0])
    const same = createAcceptanceApplication(config, { diagnostics: { record() {} } })
    await same.ready
    expect((await same.close()).complete).toBe(true)
    const conflictEvents: AcceptanceEvent[] = []
    let query: Pick<ModelCatalogRead, 'listProfiles'> | undefined
    const conflicting = createAcceptanceApplication(
      {
        ...config,
        officialManifest: {
          ordinal: 1,
          entries: [
            {
              routeName: 'synthetic-conflict-profile',
              origin: 'official',
              providers: ['synthetic-provider'],
              allowFallback: false,
              inputModalities: ['text'],
              outputModalities: ['text'],
              maxInputTokens: 1024,
              maxOutputTokens: 512,
              inputConstraints: {},
              upstreamInputLimits: {
                maxInputTokens: { status: 'unknown' as const },
                maxRequestBytes: { status: 'unknown' as const },
              },
              adaptation: {
                implementation: { name: 'synthetic-conflict', revision: 'i1' },
                definition: { modelId: 'synthetic-conflict-profile', revision: 'd1' },
                configuration: { revision: 'c1', values: {} },
              },
            },
          ],
        },
      },
      {
        diagnostics: { record: event => conflictEvents.push(event) },
        hooks: {
          async fiberCreated(name, fiber) {
            if (name === 'directory') {
              await fiber.await()
              const value: unknown = fiber.ctx.get(MODEL_CATALOG_SERVICE)
              if (!catalogRead(value)) throw new Error('directory read face absent')
              query = value
            }
          },
        },
      },
    )
    await conflicting.ready
    expect(
      conflictEvents.some(
        event => event.event === 'directory' && event.outcome === 'manifestNotNewer',
      ),
    ).toBe(true)
    expect(persisted(config.databaseFile)).toEqual(committed)
    const identity = await actor(conflicting, 'catalog-query-account')
    if (query === undefined) throw new Error('public directory query unavailable')
    const profiles = await query.listProfiles(identity.tenant)
    expect(profiles).toEqual([])
    expect((await conflicting.close()).complete).toBe(true)
    await evidence('AB-V5-manifest-receipt-loss-conflict', {
      injected,
      committed,
      afterConflict: persisted(config.databaseFile),
      events,
      conflictEvents,
      profiles,
    })
  })

  it('confirmation cannot admit the back half when close overlaps the actual guard', async () => {
    const config = await deployment('confirm-close'),
      entered = latch(),
      release = latch()
    const events: AcceptanceEvent[] = []
    const app = createAcceptanceApplication(config, {
      diagnostics: { record: e => events.push(e) },
      hooks: {
        beforeConfirm(guard) {
          const confirm = guard.confirm.bind(guard)
          guard.confirm = async () => {
            entered.resolve()
            await release.promise
            return confirm()
          }
        },
      },
    })
    await entered.promise
    const close1 = app.close(),
      close2 = app.close()
    expect(close1).toBe(close2)
    expect(await app.register('forbidden', PASSWORD)).toEqual({ failure: 'stageClosed' })
    release.resolve()
    await expect(app.ready).rejects.toMatchObject({ phase: 'confirm', category: 'closing' })
    expect((await close1).complete).toBe(true)
    expect(events.filter(e => e.event === 'confirm').map(e => e.outcome)).toEqual([
      'started',
      'succeeded',
    ])
    expect(events.some(e => e.fiber === 'directory' || e.fiber === 'lookup')).toBe(false)
    expect(persisted(config.databaseFile).manifest).toBe('0')
  })

  it('actual confirmation removal failure restores the unconfirmed new database', async () => {
    const config = await deployment('confirm-delete-fail')
    let removalFailed = false,
      snapshotStillPresent = false
    const app = createAcceptanceApplication(config, {
      diagnostics: { record() {} },
      hooks: {
        beforeConfirm(guard) {
          const confirm = guard.confirm.bind(guard)
          guard.confirm = async () => {
            await chmod(dirname(config.databaseFile), 0o500)
            try {
              return await confirm()
            } catch (error) {
              removalFailed = true
              snapshotStillPresent = (await guard.pending()) !== 'clear'
              throw error
            } finally {
              await chmod(dirname(config.databaseFile), 0o700)
            }
          }
        },
      },
    })
    await expect(app.ready).rejects.toMatchObject({ phase: 'confirm', category: 'confirmation' })
    expect(removalFailed).toBe(true)
    expect(snapshotStillPresent).toBe(true)
    expect((await app.close()).complete).toBe(true)
    await expect(stat(config.databaseFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('CCL construction failure preserves committed manifest and supports explicit reopen / old-manifest rejection', async () => {
    const config = await deployment('post-confirm-failure')
    const key = await readFile(config.keys.modelReplica)
    const events: AcceptanceEvent[] = []
    const failed = createAcceptanceApplication(
      { ...config, officialManifest: { ordinal: 2, entries: [] } },
      {
        diagnostics: { record: e => events.push(e) },
        hooks: { beforeReplica: () => chmod(config.keys.modelReplica, 0o644) },
      },
    )
    await expect(failed.ready).rejects.toMatchObject({ phase: 'replica' })
    expect((await failed.close()).complete).toBe(true)
    expect(persisted(config.databaseFile).manifest).toBe('2')
    expect(persisted(config.databaseFile).counts.account).toBe(0)
    await chmod(config.keys.modelReplica, 0o600)
    for (const ordinal of [2, 1]) {
      const reopened = createAcceptanceApplication(
        { ...config, officialManifest: { ordinal, entries: [] } },
        { diagnostics: { record: e => events.push(e) } },
      )
      await reopened.ready
      expect(persisted(config.databaseFile).manifest).toBe('2')
      expect(reopened.status().serving).toBe(true)
      expect((await reopened.close()).complete).toBe(true)
    }
    expect(events.some(e => e.event === 'directory' && e.outcome === 'manifestNotNewer')).toBe(true)
    expect(await readFile(config.keys.modelReplica)).toEqual(key)
    await evidence('AB-V5-replica-failure-reopen', {
      state: persisted(config.databaseFile),
      events,
      unchangedKey: true,
    })
  })

  it('lookup startup failure retains manifest, migrated data and unchanged keys', async () => {
    const config = await deployment('lookup-start-fail')
    const key = await readFile(config.keys.activationSigning)
    const app = createAcceptanceApplication(config, {
      diagnostics: { record() {} },
      hooks: {
        beforeLookup() {
          throw new Error('controlled lookup startup failure')
        },
      },
    })
    await expect(app.ready).rejects.toMatchObject({ phase: 'lookup' })
    expect((await app.close()).complete).toBe(true)
    expect(persisted(config.databaseFile).manifest).toBe('1')
    expect(await readFile(config.keys.activationSigning)).toEqual(key)
    const reopened = createAcceptanceApplication(config, { diagnostics: { record() {} } })
    await reopened.ready
    expect((await reopened.close()).complete).toBe(true)
    await evidence('AB-V5-lookup-failure-reopen', {
      state: persisted(config.databaseFile),
      unchangedKey: true,
      closing: app.status(),
    })
  })
})
