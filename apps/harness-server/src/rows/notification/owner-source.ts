import {
  eventTypeNameSchema,
  sourceNameSchema,
  type SourceDeclaration,
} from '@omne-harness/notification-contract'

/** What the owner of a tenant writes for themselves. Speaking to an agent is a session's matter, so no agent subscribes to it. */
export const OWNER_POSTS: SourceDeclaration = {
  name: sourceNameSchema.parse('owner.posts'),
  label: '自己写的',
  types: [
    {
      name: eventTypeNameSchema.parse('post'),
      label: '自己写的一条',
      description: '租户的 owner 自己写给自己的一条。',
      kind: { kind: 'event' },
      subject: { presence: 'optional', hint: '这一条关于什么，可以不写' },
      subscribable: ['person'],
      nameable: ['person'],
      defaults: { person: 'strong', agent: 'off' },
      external: false,
    },
  ],
}
