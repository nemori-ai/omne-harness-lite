import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { PointSink } from '@omne-harness/shell-contract'
import {
  shellKey,
  type defineUiModule,
  type ShellService,
} from '@omne-harness/shell-contract/cordis'
import { CardsHub } from './model/cards-hub.ts'
import { awaitingCount } from './model/cards-machine.ts'
import { DecisionsPage } from './view/decisions-page.tsx'
import { PendingBadge } from './view/pending-badge.tsx'
import { DetailHost, declareReleaseDetail } from './view/release-detail.tsx'
import { SessionCards } from './view/session-cards.tsx'

const HITL = protocolServiceName({
  name: humanInterventionProtocol.name,
  major: humanInterventionProtocol.major,
})

export const PAGE_ID = 'decisions'
export const PAGE_ORDER = 10
const IN_SESSION_ID = 'decisions-in-session'

export type HumanInterventionUiOptions = Readonly<{
  sessionDock?: PointSink<{ readonly session: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>
type Lookup = { get(name: string): unknown }

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
  return {
    name: 'human-intervention-ui',
    inject: [shellKey, HITL],
    apply(ctx) {
      const client = (ctx as unknown as Lookup).get(HITL) as ClientOf<HumanInterventionProtocol>
      const hub = new CardsHub({ client })
      ctx.effect(() => () => hub.dispose(), 'human-intervention-ui.cards')
      ctx.effect(() => reportAwaiting(ctx.shell, hub), 'human-intervention-ui.figure')
      declareReleaseDetail(ctx.shell)
      contribute(ctx.shell, hub, options)
    },
  }
}
