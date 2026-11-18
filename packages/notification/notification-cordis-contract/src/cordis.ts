import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ChannelContribution,
  ChannelLookup,
  ChannelName,
  NotificationCatalog,
  NotificationDestinations,
  NotificationInbox,
  NotificationSending,
  NotificationSubscriptions,
  SourceDeclaration,
  SourceLookup,
  SourceName,
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

/** The extension point `notification.sources`. A contribution is an effect on the contributor's scope. */
export abstract class NotificationSourcesService extends Service {
  static readonly provide = 'notificationSources'

  constructor(ctx: Context) {
    super(ctx, NotificationSourcesService.provide)
  }

  abstract register(declaration: SourceDeclaration): () => void
  abstract lookup(name: SourceName): SourceLookup
}
export const notificationSourcesKey = NotificationSourcesService.provide

export abstract class NotificationChannelsService extends Service {
  static readonly provide = 'notificationChannels'

  constructor(ctx: Context) {
    super(ctx, NotificationChannelsService.provide)
  }

  abstract register(channel: ChannelContribution): () => void
  abstract lookup(name: ChannelName): ChannelLookup
}
export const notificationChannelsKey = NotificationChannelsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    notificationSending: NotificationSendingService
    notificationInbox: NotificationInboxService
    notificationSubscriptions: NotificationSubscriptionsService
    notificationDestinations: NotificationDestinationsService
    notificationCatalog: NotificationCatalogService
    notificationSources: NotificationSourcesService
    notificationChannels: NotificationChannelsService
  }
}
