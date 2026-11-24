// @module-tag slow
// Opens a real SQLite storage with its worker threads.
import { Context } from '@deepseek-ai/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { expect, it } from 'vitest'
import {
  notificationCatalogKey,
  notificationChangesKey,
  notificationChannelsKey,
  notificationDestinationsKey,
  notificationInboxKey,
  notificationSendingKey,
  notificationSourcesKey,
  notificationStandingKey,
  notificationSubscriptionsKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { createNotificationLocalPlugin } from '@omne-harness/notification-local/cordis'
import { NotificationPolicyError } from '@omne-harness/notification-local'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { builds, createStoreOptions, openApplication, owner, request, T1 } from './fixture.ts'
import { fakeChannel } from '@omne-harness/notification/testing'
import { openSqlWorld } from './storage/world.ts'

class FixtureStorage extends StorageService {
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']
  readonly database: SqlStorage['database']
  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.database = storage.database
    this.registerCombination = storage.registerCombination
    this.commit = storage.commit
    this.query = storage.query
    this.read = storage.read
  }
}

const KEYS = [
  notificationSendingKey,
  notificationInboxKey,
  notificationSubscriptionsKey,
  notificationDestinationsKey,
  notificationCatalogKey,
  notificationSourcesKey,
  notificationChannelsKey,
  notificationChangesKey,
  notificationStandingKey,
]

async function configuration(world: Awaited<ReturnType<typeof openSqlWorld>>) {
  const fixture = await openApplication({ world, channel: null })
  await fixture.application.close()
  const { storage: _storage, ...sql } = createStoreOptions(world, [T1])
  return { ...fixture.local, sql }
}

it('starts when the storage is there, binds every face and extension point, and withdraws them with their contributions', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  try {
    const local = ctx.plugin(createNotificationLocalPlugin(), await configuration(world))
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
    await ctx.plugin(FixtureStorage, world.storage).await()
    await local.await()
    for (const key of KEYS) expect(ctx.get(key)).toBeDefined()

    const heard: unknown[] = []
    const unsubscribe = ctx.get(notificationChangesKey)?.subscribe({
      changed: change => void heard.push(change),
      closed: () => void heard.push('closed'),
    })
    const contributor = ctx.inject([notificationSourcesKey, notificationSendingKey], child => {
      child.notificationSources.register(builds)
    })
    await contributor.await()
    const sending = ctx.get(notificationSendingKey)
    expect(heard).toEqual([{ kind: 'catalog' }])
    expect(await sending?.send(owner(), request('b1'))).toMatchObject({ kind: 'done' })
    expect(heard).toContainEqual({ kind: 'inbox', tenant: T1, recipient: null })
    await contributor.dispose()
    expect(ctx.get(notificationSourcesKey)?.lookup(builds.name)).toEqual({ kind: 'absent' })
    expect(await sending?.send(owner(), request('b2'))).toEqual({ kind: 'basis-unavailable' })
    expect(await sending?.send(owner(), request('b1'))).toMatchObject({
      kind: 'done',
      recalled: true,
    })

    await local.dispose()
    expect(heard.at(-1)).toBe('closed')
    unsubscribe?.()
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
    expect(await sending?.send(owner(), request('b1'))).toEqual({ kind: 'basis-unavailable' })
  } finally {
    await world.close()
  }
})

it('withdraws a contributed channel with its contributor: absent at once, gone when the delivery in flight has its outcome (INV-NO22)', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  try {
    await ctx.plugin(FixtureStorage, world.storage).await()
    await ctx.plugin(createNotificationLocalPlugin(), await configuration(world)).await()
    const landing: (() => void)[] = []
    const mail = {
      ...fakeChannel('mail'),
      deliver: () =>
        new Promise<{ kind: 'delivered' }>(resolve =>
          landing.push(() => resolve({ kind: 'delivered' })),
        ),
    }
    const contributor = ctx.inject([notificationChannelsKey], child => {
      child.notificationChannels.register(mail)
    })
    await contributor.await()
    const channels = ctx.get(notificationChannelsKey)
    const offered = channels?.lookup(mail.name)
    if (offered?.kind !== 'registered') throw new Error('fixture: the channel is not registered')
    const flight = offered.channel.deliver({} as never)
    let withdrawn = false
    const disposing = contributor.dispose().then(() => {
      withdrawn = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(channels?.lookup(mail.name)).toEqual({ kind: 'absent' })
    expect(withdrawn).toBe(false)
    landing[0]?.()
    expect(await flight).toEqual({ kind: 'delivered' })
    await disposing
    expect(withdrawn).toBe(true)
    const again = ctx.inject([notificationChannelsKey], child => {
      child.notificationChannels.register(fakeChannel('mail'))
    })
    await again.await()
    expect(channels?.lookup(mail.name)).toMatchObject({ kind: 'registered' })
  } finally {
    await world.close()
  }
})

it('does not start with an invalid policy', async () => {
  const world = await openSqlWorld()
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  try {
    await ctx.plugin(FixtureStorage, world.storage).await()
    const config = { ...(await configuration(world)), policy: { nothing: true } }
    const local = ctx.plugin(createNotificationLocalPlugin(), config)
    await expect(local.await()).rejects.toBeInstanceOf(NotificationPolicyError)
    for (const key of KEYS) expect(ctx.get(key)).toBeUndefined()
  } finally {
    await world.close()
  }
})
