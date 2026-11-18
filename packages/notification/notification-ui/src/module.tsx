import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import {
  notificationProtocol,
  type NotificationProtocol,
} from '@omne-harness/notification-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  shellKey,
  type defineUiModule,
  type ShellService,
} from '@omne-harness/shell-contract/cordis'
import { InboxHub } from './model/inbox-hub.ts'
import { inboxSections } from './points.ts'
import { InboxPage } from './view/inbox-page.tsx'
import { UnresolvedBadge } from './view/unresolved-badge.tsx'

const NOTIFICATION = protocolServiceName({
  name: notificationProtocol.name,
  major: notificationProtocol.major,
})

export const PAGE_ID = 'notifications'
export const PAGE_ORDER = 11

type UiModule = ReturnType<typeof defineUiModule>
type Lookup = { get(name: string): unknown }

/** The sections other domains contributed, one after another, each under its label when it has one. */
function sectionsOf(shell: ShellService) {
  return inboxSections.slot(shell, { recipient: 'person' }, entries =>
    entries.length === 0 ? null : (
      <div className="notification-extra">
        {entries.map(entry => (
          <section key={entry.id} className="notification-section" aria-label={entry.label}>
            {entry.label === undefined ? null : (
              <h3 className="notification-section-title">{entry.label}</h3>
            )}
            {entry.node}
          </section>
        ))}
      </div>
    ),
  )
}

function contribute(shell: ShellService, hub: InboxHub): void {
  shell.contribute('pages', {
    id: PAGE_ID,
    title: '通知',
    order: PAGE_ORDER,
    badge: ({ scope }) =>
      scope === undefined ? null : <UnresolvedBadge hub={hub} tenant={scope} />,
    render: ({ scope }) =>
      scope === undefined ? null : (
        <InboxPage hub={hub} tenant={scope} sections={sectionsOf(shell)} />
      ),
  })
}

/** The notification page with its count, there while the `notification/v1` client is on the tree. */
export const notificationUiModule: UiModule = {
  name: 'notification-ui',
  inject: [shellKey, NOTIFICATION],
  apply(ctx) {
    const client = (ctx as unknown as Lookup).get(NOTIFICATION) as ClientOf<NotificationProtocol>
    const hub = new InboxHub({ client })
    ctx.effect(() => () => hub.dispose(), 'notification-ui.inbox')
    contribute(ctx.shell, hub)
  },
}
