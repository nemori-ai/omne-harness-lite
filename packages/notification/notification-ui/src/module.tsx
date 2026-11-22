import {
  notificationProtocol,
  type NotificationProtocol,
} from '@omne-harness/notification-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { InboxHub } from './model/inbox-hub.ts'
import { watchStrongArrivals } from './model/strong-arrivals.ts'
import { inboxSections } from './points.ts'
import { InboxPage } from './view/inbox-page.tsx'
import { UnresolvedBadge } from './view/unresolved-badge.tsx'

export const PAGE_ID = 'notifications'
export const PAGE_ORDER = 11

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
    icon: 'mail',
    badge: ({ scope }) =>
      scope === undefined ? null : <UnresolvedBadge hub={hub} tenant={scope} />,
    render: ({ scope, subject }) =>
      scope === undefined ? null : (
        <InboxPage
          hub={hub}
          tenant={scope}
          sections={sectionsOf(shell)}
          {...(subject !== undefined && { focus: subject })}
        />
      ),
  })
}

/** The notification page with its count, its page is there always, its count only while `notification/v2` is served. */
export const notificationUiModule = defineUiModule({
  name: 'notification-ui',
  needs: { notification: needProtocol<ClientOf<NotificationProtocol>>(notificationProtocol) },
  apply(shell, { notification: client }) {
    const hub = new InboxHub({ client })
    inboxSections.declare(shell)
    contribute(shell, hub)
    const stopArrivals = watchStrongArrivals({
      hub,
      scope: shell.scope,
      page: PAGE_ID,
      toast: toast => shell.toast(toast),
    })
    return () => {
      stopArrivals()
      hub.dispose()
    }
  },
})
