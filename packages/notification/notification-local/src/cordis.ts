import type { Context } from '@deepseek-ai/cordis'
import type {
  NotificationCatalog,
  NotificationChangeFeed,
  NotificationDestinations,
  NotificationInbox,
  NotificationSending,
  NotificationSubscriptions,
} from '@omne-harness/notification-contract'
import type { NotificationChannels, NotificationSources } from '@omne-harness/notification'
import {
  NotificationCatalogService,
  NotificationChangesService,
  NotificationChannelsService,
  NotificationDestinationsService,
  NotificationInboxService,
  NotificationSendingService,
  NotificationSourcesService,
  NotificationSubscriptionsService,
} from '@omne-harness/notification-cordis-contract/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { createNotificationLocalApplication, type NotificationLocalOptions } from './application.ts'

/** What the assembly gives: everything but the storage, which is injected. */
export type NotificationLocalConfiguration = Omit<NotificationLocalOptions, 'sql'> &
  Readonly<{ sql: Omit<NotificationLocalOptions['sql'], 'storage'> }>

class LocalSending extends NotificationSendingService {
  readonly send: NotificationSending['send']
  readonly querySend: NotificationSending['querySend']
  constructor(ctx: Context, face: NotificationSending) {
    super(ctx)
    this.send = face.send
    this.querySend = face.querySend
  }
}

class LocalInbox extends NotificationInboxService {
  readonly list: NotificationInbox['list']
  readonly read: NotificationInbox['read']
  readonly mark: NotificationInbox['mark']
  constructor(ctx: Context, face: NotificationInbox) {
    super(ctx)
    this.list = face.list
    this.read = face.read
    this.mark = face.mark
  }
}

class LocalSubscriptions extends NotificationSubscriptionsService {
  readonly set: NotificationSubscriptions['set']
  readonly remove: NotificationSubscriptions['remove']
  readonly list: NotificationSubscriptions['list']
  readonly beat: NotificationSubscriptions['beat']
  readonly setBeat: NotificationSubscriptions['setBeat']
  constructor(ctx: Context, face: NotificationSubscriptions) {
    super(ctx)
    this.set = face.set
    this.remove = face.remove
    this.list = face.list
    this.beat = face.beat
    this.setBeat = face.setBeat
  }
}

class LocalDestinations extends NotificationDestinationsService {
  readonly add: NotificationDestinations['add']
  readonly change: NotificationDestinations['change']
  readonly remove: NotificationDestinations['remove']
  readonly list: NotificationDestinations['list']
  constructor(ctx: Context, face: NotificationDestinations) {
    super(ctx)
    this.add = face.add
    this.change = face.change
    this.remove = face.remove
    this.list = face.list
  }
}

class LocalCatalog extends NotificationCatalogService {
  readonly sources: NotificationCatalog['sources']
  readonly channels: NotificationCatalog['channels']
  constructor(ctx: Context, face: NotificationCatalog) {
    super(ctx)
    this.sources = face.sources
    this.channels = face.channels
  }
}

class LocalSources extends NotificationSourcesService {
  readonly lookup: NotificationSources['lookup']
  private readonly registry: NotificationSources
  constructor(ctx: Context, registry: NotificationSources) {
    super(ctx)
    this.registry = registry
    this.lookup = registry.lookup
  }
  protected contribute(declaration: Parameters<NotificationSources['register']>[0]) {
    return this.registry.register(declaration)
  }
}

class LocalChannels extends NotificationChannelsService {
  readonly lookup: NotificationChannels['lookup']
  private readonly registry: NotificationChannels
  constructor(ctx: Context, registry: NotificationChannels) {
    super(ctx)
    this.registry = registry
    this.lookup = registry.lookup
  }
  protected contribute(channel: Parameters<NotificationChannels['register']>[0]) {
    return this.registry.register(channel)
  }
}

class LocalChanges extends NotificationChangesService {
  readonly subscribe: NotificationChangeFeed['subscribe']
  constructor(ctx: Context, feed: NotificationChangeFeed) {
    super(ctx)
    this.subscribe = feed.subscribe
  }
}

export function createNotificationLocalPlugin() {
  return {
    name: 'notification-local',
    inject: [storageKey],
    async apply(ctx: Context, config: NotificationLocalConfiguration) {
      const application = await createNotificationLocalApplication({
        ...config,
        sql: { ...config.sql, storage: ctx.storage },
      })
      try {
        const bound = [
          ctx.plugin(LocalSending, application.sending),
          ctx.plugin(LocalInbox, application.inbox),
          ctx.plugin(LocalSubscriptions, application.subscriptions),
          ctx.plugin(LocalDestinations, application.destinations),
          ctx.plugin(LocalCatalog, application.catalog),
          ctx.plugin(LocalSources, application.sources),
          ctx.plugin(LocalChannels, application.channels),
          ctx.plugin(LocalChanges, application.changes),
        ]
        ctx.effect(() => () => application.close(), 'notification-local-drain')
        await Promise.all(bound.map(fiber => fiber.await()))
      } catch (error) {
        try {
          await application.close()
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Notification binding and cleanup failed')
        }
        throw error
      }
    },
  }
}
