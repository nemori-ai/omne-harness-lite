import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule, type ShellService } from '@omne-harness/shell-contract/cordis'
import { CardsHub } from './model/cards-hub.ts'
import { awaitingCount } from './model/cards-machine.ts'
import { DecisionsPage } from './view/decisions-page.tsx'
import { PendingBadge } from './view/pending-badge.tsx'
import { DetailHost, declareReleaseDetail } from './view/release-detail.tsx'
import { SessionCards } from './view/session-cards.tsx'
import { humanInterventionParts } from './parts.ts'

export const PAGE_ID = 'decisions'
export const PAGE_ORDER = 10
const IN_SESSION_ID = 'decisions-in-session'

export type HumanInterventionUiOptions = Readonly<{
  sessionDock?: PointSink<{ readonly session: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>

function contribute(shell: ShellService, hub: CardsHub, options: HumanInterventionUiOptions): void {
  shell.contribute('pages', {
    id: PAGE_ID,
    title: '待你决定',
    order: PAGE_ORDER,
    icon: 'awaiting',
    badge: ({ scope }) => (scope === undefined ? null : <PendingBadge hub={hub} tenant={scope} />),
    render: ({ scope }) =>
      scope === undefined ? null : (
        <DetailHost.Provider value={shell}>
          <DecisionsPage hub={hub} tenant={scope} />
        </DetailHost.Provider>
      ),
  })
  shell.contribute('actions', {
    id: 'human-intervention.waiting',
    title: '去「待你决定」',
    group: '页面',
    kind: 'ui',
    order: 1,
    keys: [{ chord: 'Mod+Shift+A', layer: 'global' }],
    available: () => true,
    run: () => shell.navigate(PAGE_ID),
  })
  options.sessionDock?.contribute(shell, {
    id: IN_SESSION_ID,
    order: 0,
    render: ({ scope, subject }) =>
      scope === undefined ? null : (
        <DetailHost.Provider value={shell}>
          <SessionCards hub={hub} tenant={scope} session={subject.session} />
        </DetailHost.Provider>
      ),
  })
}

/** Reports the awaiting-answer count of the shell's tenant to the figure; it follows the tenant, not a view. */
function reportAwaiting(shell: ShellService, hub: CardsHub): () => void {
  let held: (() => void) | null = null
  let followed: string | undefined | null = null
  const follow = (scope: string | undefined): void => {
    if (scope === followed) return
    followed = scope
    held?.()
    held = null
    const tenant = scope === undefined ? undefined : readTenantText(scope)
    if (tenant === undefined) {
      shell.figure({ doing: 'idle', waiting: 0 })
      return
    }
    const driver = hub.driver(tenant)
    const report = (): void =>
      shell.figure({
        doing: 'idle',
        waiting: awaitingCount(driver.getState()),
        waitingPage: PAGE_ID,
      })
    const stop = driver.subscribe(report)
    const release = driver.retain()
    report()
    held = () => {
      stop()
      release()
    }
  }
  const unsubscribe = shell.scope.subscribe(follow)
  follow(shell.scope.get())
  return () => {
    unsubscribe()
    held?.()
  }
}

export function createHumanInterventionUiModule(
  options: HumanInterventionUiOptions = {},
): UiModule {
  return defineUiModule({
    name: 'human-intervention-ui',
    needs: {
      humanIntervention:
        needProtocol<ClientOf<HumanInterventionProtocol>>(humanInterventionProtocol),
    },
    apply(shell, { humanIntervention: client }) {
      for (const part of humanInterventionParts) part.declare(shell)
      const hub = new CardsHub({ client })
      const stopFigure = reportAwaiting(shell, hub)
      declareReleaseDetail(shell)
      contribute(shell, hub, options)
      return () => {
        stopFigure()
        hub.dispose()
      }
    },
  })
}
