import type { NotificationSummaryBody } from '@omne-harness/notification-protocol'
import {
  definePoint,
  defineRenderPoint,
  type Point,
  type RenderPoint,
} from '@omne-harness/shell-contract'

/** What a section in the panel is about: the inbox of the person the tenant is. */
export type InboxSubject = Readonly<{ recipient: 'person' }>

export const INBOX_SECTIONS = 'notification.inbox-sections'

/** Where another domain puts a section into the notification panel, under the notifications. */
export const inboxSections: Point<InboxSubject> = definePoint({
  name: INBOX_SECTIONS,
  summary: 'The sections other domains put into the notification page, under the notifications.',
  subject: {
    encode: subject => subject.recipient,
    decode: text => (text === 'person' ? { recipient: text } : undefined),
  },
})

/** One notification of the inbox, as the protocol gives it. */
export type NotificationEntrySubject = NotificationSummaryBody

export const NOTIFICATION_ENTRY = 'notification.entry'

/** Where the domain of a source draws the rows of its own notifications. */
export const notificationEntry: RenderPoint<NotificationEntrySubject> = defineRenderPoint({
  name: NOTIFICATION_ENTRY,
  key: 'the name of the source',
  summary: 'How a row of the inbox is drawn, by the source of the notification.',
})
