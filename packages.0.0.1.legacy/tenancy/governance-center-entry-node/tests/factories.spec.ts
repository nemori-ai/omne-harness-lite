import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SERVING_EVENT,
  STOPPED_EVENT,
  DEFECT_EVENT,
  LISTENING_EVENT,
  type EntryMaintenanceResources,
} from '@omne-harness-lite/governance-center-entry'
import {
  createGovernanceCenterEntry,
  createGovernanceCenterOps,
  GovernanceCenterWorkStopped,
  GovernanceCenterEntryConfigSchema,
  GovernanceCenterOpsConfigSchema,
  type GovernanceCenterEntryDependencies,
  type GovernanceCenterOpsDependencies,
  type GovernanceCenterWork,
} from '../src/index.ts'
import {
  bootCenter,
  bodyOf,
  envelopeOf,
  REGISTER,
  PASSWORD,
  type Center,
} from './support/composition.ts'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

function entryDependencies(center: Center): GovernanceCenterEntryDependencies {
  const ctx = center.ctx
  return {
    storage: center.storage,
    clock: center.ctx.clock,
    services: {
      accounts: ctx.accounts,
      logins: ctx.logins,
      registration: ctx.registration,
      credentials: ctx.credentials,
      organizations: ctx.organizations,
      memberships: ctx.memberships,
      offers: ctx.offers,
    },
    opening: ctx.entryOpening,
    logger: ctx.logger('factory-test'),
    notifications: {
      serving: notice => {
        ctx.emit(SERVING_EVENT, notice)
      },
      stopped: () => {
        ctx.emit(STOPPED_EVENT)
      },
      defect: () => {
        ctx.emit(DEFECT_EVENT)
      },
      onListening: listener => ctx.on(LISTENING_EVENT, listener),
    },
    isCurrent: () => true,
    isReadyToOpen: () => true,
  }
}

function opsDependencies(center: Center): GovernanceCenterOpsDependencies {
  const storage = center.storage,
    maintenance = storage.maintenance
  if (maintenance === undefined) throw new Error('fixture requires owned maintenance')
  const ctx = center.ctx
  return {
    storage: { read: storage.read.bind(storage), write: storage.write.bind(storage), maintenance },
    clock: center.ctx.clock,
    opening: ctx.entryOpening,
    maintenance: ctx.entryMaintenance,
    logger: ctx.logger('factory-ops-test'),
    notifications: {
      listening: () => {
        ctx.emit(LISTENING_EVENT)
      },
      onServing: listener => ctx.on(SERVING_EVENT, listener),
      onStopped: listener => ctx.on(STOPPED_EVENT, listener),
      onDefect: listener => ctx.on(DEFECT_EVENT, listener),
    },
    isCurrent: () => true,
  }
}

describe('independent server factory ownership', () => {
  it('construct and close before setup make no dependency calls; stopped setup remains stable', async () => {
    let calls = 0
    const forbidden = (): never => {
      calls += 1
      throw new Error('unexpected dependency call')
    }
    const work = createGovernanceCenterEntry(
      {
        listen: { host: '127.0.0.1', port: 0 },
        tls: { certificateChainPem: 'unused', privateKeyPem: 'unused' },
        version: 'test',
        drainTimeoutMs: 10,
        clockReadyTimeoutMs: 10,
      },
      {
        get storage() {
          return forbidden()
        },
        get clock() {
          return forbidden()
        },
        get services() {
          return forbidden()
        },
        get opening() {
          return forbidden()
        },
        get logger() {
          return forbidden()
        },
        get notifications() {
          return forbidden()
        },
        isCurrent: forbidden,
        isReadyToOpen: forbidden,
      },
    )
    expect(calls).toBe(0)
    const close = work.close()
    expect(work.close()).toBe(close)
    await close
    const setup = work.setup()
    expect(work.setup()).toBe(setup)
    await expect(setup).rejects.toBeInstanceOf(GovernanceCenterWorkStopped)
    expect(calls).toBe(0)
  })

  it('register accepted business before synchronous close reentry; wait for actual persisted registration', async () => {
    const center = await bootCenter({ skipCenterPlugins: true, drainTimeoutMs: 50 })
    cleanup.push(() => center.dispose())
    const dependencies = entryDependencies(center),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    let closing: Promise<void> | undefined,
      done = false,
      result: unknown
    let work: GovernanceCenterWork
    const original = dependencies.services.registration.register.bind(
      dependencies.services.registration,
    )
    work = createGovernanceCenterEntry(
      GovernanceCenterEntryConfigSchema.parse(center.entryConfig),
      {
        ...dependencies,
        services: {
          ...dependencies.services,
          registration: {
            register(...args) {
              const pending = original(...args)
              closing = work.close()
              void closing.then(() => {
                done = true
              })
              entered.resolve()
              return pending.then(async value => {
                result = value
                await release.promise
                return value
              })
            },
          },
        },
      },
    )
    cleanup.push(() => work.close())
    try {
      const setup = work.setup()
      expect(work.setup()).toBe(setup)
      await setup
      await center.open()
      const network = center.call(
        envelopeOf(REGISTER, { loginIdentifier: 'factory.reentry', credential: PASSWORD }),
      )
      await entered.promise
      await new Promise(setImmediate)
      expect(done).toBe(false)
      expect(work.close()).toBe(closing)
      release.resolve()
      await closing
      await network
      expect(result).toBe('registered')
      const rows = await center.storage.read(tx =>
        tx.db
          .selectFrom('account')
          .select(['activated'])
          .where('login_identifier', '=', 'factory.reentry')
          .execute(),
      )
      expect(rows.map(row => row.activated)).toEqual([1])
    } finally {
      release.resolve()
    }
  })

  it('install all ops subscriptions synchronously, serve real Unix health, then remove subscriptions and socket', async () => {
    const center = await bootCenter({ withOps: false })
    cleanup.push(() => center.dispose())
    const notice = await center.open(),
      dependencies = opsDependencies(center),
      installed: string[] = [],
      removed: string[] = []
    const originalClosed: string[] = [],
      replacementClosed: string[] = []
    let completion: EntryMaintenanceResources = {
      snapshotChecks: dependencies.maintenance.snapshotChecks,
      closed: status => {
        originalClosed.push(status)
      },
    }
    const work = createGovernanceCenterOps(
      GovernanceCenterOpsConfigSchema.parse(center.opsConfig),
      {
        ...dependencies,
        get maintenance() {
          return completion
        },
        notifications: {
          listening() {},
          onServing(listener) {
            installed.push('serving')
            listener(notice)
            return () => {
              removed.push('serving')
            }
          },
          onStopped() {
            installed.push('stopped')
            return () => {
              removed.push('stopped')
            }
          },
          onDefect() {
            installed.push('defect')
            return () => {
              removed.push('defect')
            }
          },
        },
      },
    )
    cleanup.push(() => work.close())
    expect(installed).toEqual([])
    const setup = work.setup()
    expect(work.setup()).toBe(setup)
    expect(installed).toEqual(['serving', 'stopped', 'defect'])
    await setup
    completion = {
      snapshotChecks: completion.snapshotChecks,
      closed: status => {
        replacementClosed.push(status)
      },
    }
    expect(bodyOf((await center.ops()).bytes)).toMatchObject({
      centerId: notice.centerId,
      reachable: true,
    })
    const close = work.close()
    expect(work.close()).toBe(close)
    await close
    expect(removed.sort()).toEqual(['defect', 'serving', 'stopped'])
    expect(existsSync(center.socketPath)).toBe(false)
    expect(originalClosed).toEqual(['clean'])
    expect(replacementClosed).toEqual([])
  })

  it('preserve subscription setup failure and clean exactly the acquired prefix without creating a socket', async () => {
    const center = await bootCenter({ skipCenterPlugins: true })
    cleanup.push(() => center.dispose())
    const original = new Error('subscription installation failed'),
      removed: string[] = []
    const work = createGovernanceCenterOps(
      GovernanceCenterOpsConfigSchema.parse(center.opsConfig),
      {
        ...opsDependencies(center),
        notifications: {
          listening() {},
          onServing: () => () => {
            removed.push('serving')
          },
          onStopped: () => () => {
            removed.push('stopped')
          },
          onDefect() {
            throw original
          },
        },
      },
    )
    cleanup.push(() => work.close())
    await expect(work.setup()).rejects.toBe(original)
    await work.close()
    expect(removed).toEqual(['stopped', 'serving'])
    expect(existsSync(center.socketPath)).toBe(false)
  })
})
