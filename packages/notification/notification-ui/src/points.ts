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

/** The point on the server's tree whose keys are the names of the registered sources. */
export const NOTIFICATION_SOURCES = 'notification.sources'

/** Where the domain of a source draws the rows of its own notifications. */
export const notificationEntry: RenderPoint<NotificationEntrySubject> = defineRenderPoint({
  name: NOTIFICATION_ENTRY,
  key: 'the name of the source, as the server registers it on notification.sources: OmneExtensionPoints show notification.sources lists the names',
  summary: 'How a row of the notification inbox is drawn, by the source of the notification.',
  keysFrom: NOTIFICATION_SOURCES,
  subject:
    'one notification of the inbox: source and event; recipient; sequence; type; title; level, which is weak or strong; cause; acceptedAt; marks, with seenAt, resolved and supersededBy',
  example: [
    '{"point":"notification.entry","key":"agent.posts","module":"post-row.js","export":"row"}',
    'post-row.js:',
    'export const row = ({ React }) => ({ subject }) =>',
    "  React.createElement('div', null, React.createElement('strong', null, subject.title), ' ' + subject.level)",
  ].join('\n'),
})
