import { expect, it } from 'vitest'

it('the cordis entry gives the interface module, the page id and order, the point for sections and the point for rows', async () => {
  const cordis = (await import('@omne-harness/notification-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'INBOX_SECTIONS',
    'NOTIFICATION_ENTRY',
    'PAGE_ID',
    'PAGE_ORDER',
    'inboxSections',
    'notificationEntry',
    'notificationParts',
    'notificationUiModule',
  ])
  expect(cordis['PAGE_ID']).toBe('notifications')
  expect(cordis['PAGE_ORDER']).toBe(11)
  expect(cordis['notificationUiModule']).toMatchObject({ name: 'notification-ui' })
})

it('the root entry gives the hub and the two views', async () => {
  const root = (await import('@omne-harness/notification-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['InboxHub', 'InboxPage', 'UnresolvedBadge'])
})
