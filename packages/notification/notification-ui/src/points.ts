import { definePoint, type Point } from '@omne-harness/shell-contract'

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
