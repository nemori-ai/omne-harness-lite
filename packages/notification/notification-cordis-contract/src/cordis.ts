import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ChannelContribution,
  ChannelLookup,
  ChannelName,
  NotificationCatalog,
  NotificationChangeFeed,
  NotificationDestinations,
  NotificationInbox,
  NotificationSending,
  NotificationSubscriptions,
  SourceDeclaration,
  SourceLookup,
  SourceName,
  StandingRead,
  TenantId,
} from '@omne-harness/notification-contract'

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationSendingService extends Service implements NotificationSending {
  static readonly provide = 'notificationSending'

  constructor(ctx: Context) {
    super(ctx, NotificationSendingService.provide)
  }

  abstract readonly send: NotificationSending['send']
  abstract readonly querySend: NotificationSending['querySend']
}
export const notificationSendingKey = NotificationSendingService.provide

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationInboxService extends Service implements NotificationInbox {
  static readonly provide = 'notificationInbox'

  constructor(ctx: Context) {
    super(ctx, NotificationInboxService.provide)
  }

  abstract readonly list: NotificationInbox['list']
  abstract readonly read: NotificationInbox['read']
  abstract readonly mark: NotificationInbox['mark']
}
export const notificationInboxKey = NotificationInboxService.provide

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationSubscriptionsService
  extends Service
  implements NotificationSubscriptions
{
  static readonly provide = 'notificationSubscriptions'

  constructor(ctx: Context) {
    super(ctx, NotificationSubscriptionsService.provide)
  }

  abstract readonly set: NotificationSubscriptions['set']
  abstract readonly remove: NotificationSubscriptions['remove']
  abstract readonly list: NotificationSubscriptions['list']
  abstract readonly beat: NotificationSubscriptions['beat']
  abstract readonly setBeat: NotificationSubscriptions['setBeat']
}
export const notificationSubscriptionsKey = NotificationSubscriptionsService.provide

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationDestinationsService
  extends Service
  implements NotificationDestinations
{
  static readonly provide = 'notificationDestinations'

  constructor(ctx: Context) {
    super(ctx, NotificationDestinationsService.provide)
  }

  abstract readonly add: NotificationDestinations['add']
  abstract readonly change: NotificationDestinations['change']
  abstract readonly remove: NotificationDestinations['remove']
  abstract readonly list: NotificationDestinations['list']
}
export const notificationDestinationsKey = NotificationDestinationsService.provide

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationCatalogService extends Service implements NotificationCatalog {
  static readonly provide = 'notificationCatalog'

  constructor(ctx: Context) {
    super(ctx, NotificationCatalogService.provide)
  }

  abstract readonly sources: NotificationCatalog['sources']
  abstract readonly channels: NotificationCatalog['channels']
}
export const notificationCatalogKey = NotificationCatalogService.provide

/** The extension point `notification.sources`. Registering is the effect of the caller (IC-13). */
export abstract class NotificationSourcesService extends Service {
  static readonly provide = 'notificationSources'

  constructor(ctx: Context) {
    super(ctx, NotificationSourcesService.provide)
  }

  register(declaration: SourceDeclaration): void {
    this.ctx.effect(() => this.contribute(declaration), 'notificationSources.register')
  }

  protected abstract contribute(declaration: SourceDeclaration): () => void
  abstract lookup(name: SourceName): SourceLookup
}
export const notificationSourcesKey = NotificationSourcesService.provide

/** The extension point `notification.channels`. Withdrawing ends when no delivery is in flight. */
export abstract class NotificationChannelsService extends Service {
  static readonly provide = 'notificationChannels'

  constructor(ctx: Context) {
    super(ctx, NotificationChannelsService.provide)
  }

  register(channel: ChannelContribution): void {
    this.ctx.effect(() => this.contribute(channel), 'notificationChannels.register')
  }

  protected abstract contribute(channel: ChannelContribution): () => Promise<void>
  abstract lookup(name: ChannelName): ChannelLookup
}
export const notificationChannelsKey = NotificationChannelsService.provide

/** What this group publishes about itself: the standing items of its blocked destinations. */
export abstract class NotificationStandingService extends Service {
  static readonly provide = 'notificationStanding'

  constructor(ctx: Context) {
    super(ctx, NotificationStandingService.provide)
  }

  abstract readonly blocked: (tenant: TenantId) => Promise<StandingRead>
}
export const notificationStandingKey = NotificationStandingService.provide

/** @owner packages/notification/notification-cordis-contract */
export abstract class NotificationChangesService extends Service implements NotificationChangeFeed {
  static readonly provide = 'notificationChanges'

  constructor(ctx: Context) {
    super(ctx, NotificationChangesService.provide)
  }

  abstract readonly subscribe: NotificationChangeFeed['subscribe']
}
export const notificationChangesKey = NotificationChangesService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    notificationSending: NotificationSendingService
    notificationInbox: NotificationInboxService
    notificationSubscriptions: NotificationSubscriptionsService
    notificationDestinations: NotificationDestinationsService
    notificationCatalog: NotificationCatalogService
    notificationSources: NotificationSourcesService
    notificationChanges: NotificationChangesService
    notificationChannels: NotificationChannelsService
    notificationStanding: NotificationStandingService
  }
}
