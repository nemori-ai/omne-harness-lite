import { expect, it } from 'vitest'
import { Service } from '@deepseek-ai/cordis'
import * as entry from '@omne-harness/notification-cordis-contract/cordis'

const services = [
  [entry.NotificationSendingService, entry.notificationSendingKey, 'notificationSending'],
  [entry.NotificationInboxService, entry.notificationInboxKey, 'notificationInbox'],
  [
    entry.NotificationSubscriptionsService,
    entry.notificationSubscriptionsKey,
    'notificationSubscriptions',
  ],
  [
    entry.NotificationDestinationsService,
    entry.notificationDestinationsKey,
    'notificationDestinations',
  ],
  [entry.NotificationCatalogService, entry.notificationCatalogKey, 'notificationCatalog'],
  [entry.NotificationSourcesService, entry.notificationSourcesKey, 'notificationSources'],
  [entry.NotificationChannelsService, entry.notificationChannelsKey, 'notificationChannels'],
  [entry.NotificationChangesService, entry.notificationChangesKey, 'notificationChanges'],
] as const

it('gives each face and each extension point one service identity', () => {
  for (const [service, key, name] of services) {
    expect(key).toBe(name)
    expect(service.provide).toBe(key)
    expect(service.prototype).toBeInstanceOf(Service)
  }
  expect(new Set(services.map(([, key]) => key)).size).toBe(services.length)
  expect(Object.keys(entry)).toHaveLength(services.length * 2)
})
