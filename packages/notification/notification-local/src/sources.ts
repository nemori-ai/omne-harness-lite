import {
  eventTypeNameSchema,
  recipientKey,
  sourceNameSchema,
  type Destination,
  type SourceDeclaration,
  type StandingItem,
} from '@omne-harness/notification-contract'

/** What an agent writes for people, or for other agents that subscribed to it. */
export const AGENT_POSTS: SourceDeclaration = {
  name: sourceNameSchema.parse('agent.posts'),
  label: 'Agent 写的',
  types: [
    {
      name: eventTypeNameSchema.parse('post'),
      label: 'Agent 写的一条',
      description: '一个 agent 整理好、写给人或别的 agent 看的一条内容。对象是写它的那个 agent。',
      kind: { kind: 'event' },
      subject: { presence: 'required', hint: '写这一条的 agent 的引用' },
      subscribable: ['person', 'agent'],
      nameable: ['person', 'agent'],
      defaults: { person: 'weak', agent: 'off' },
      external: false,
    },
  ],
}

const SYSTEM = sourceNameSchema.parse('notification.system')
const DELIVERY_BLOCKED = eventTypeNameSchema.parse('delivery-blocked')

/** The standing items of this group itself. */
export const NOTIFICATION_SYSTEM: SourceDeclaration = {
  name: SYSTEM,
  label: '通知',
  types: [
    {
      name: DELIVERY_BLOCKED,
      label: '投递受阻',
      description: '通知推不到某个投递去处。通知仍在收件箱里。',
      kind: { kind: 'standing', binding: 'notification.delivery-blocked' },
      subject: { presence: 'required', hint: '受阻的投递去处' },
      subscribable: ['person'],
      nameable: [],
      defaults: { person: 'weak', agent: 'off' },
      external: false,
    },
  ],
}

/** The standing items for the destinations that are blocked now: what this group publishes about itself. */
export function blockedItems(destinations: readonly Destination[]): StandingItem[] {
  return destinations.flatMap(destination => {
    if (destination.blockedSince === null) return []
    const subject = JSON.stringify([recipientKey(destination.recipient), destination.id])
    return [
      {
        id: `delivery-blocked:${subject}`,
        source: SYSTEM,
        type: DELIVERY_BLOCKED,
        subject,
        title: `通知推不到「${destination.channel}」`,
        locator: null,
        since: destination.blockedSince,
      },
    ]
  })
}
