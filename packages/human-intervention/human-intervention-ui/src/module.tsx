import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  shellKey,
  type defineUiModule,
  type ShellService,
} from '@omne-harness/shell-contract/cordis'
import { CardsHub } from './model/cards-hub.ts'
import { DecisionsPage } from './view/decisions-page.tsx'
import { PendingBadge } from './view/pending-badge.tsx'
import { SessionCards } from './view/session-cards.tsx'

const HITL = protocolServiceName({
  name: humanInterventionProtocol.name,
  major: humanInterventionProtocol.major,
})

export const PAGE_ID = 'decisions'
export const PAGE_ORDER = 10
const IN_SESSION_ID = 'decisions-in-session'

export type HumanInterventionUiOptions = Readonly<{ sessionAnchor?: string }>

type UiModule = ReturnType<typeof defineUiModule>
type Lookup = { get(name: string): unknown }

function contribute(shell: ShellService, hub: CardsHub, options: HumanInterventionUiOptions): void {
  shell.contribute('pages', {
    id: PAGE_ID,
    title: '待你决定',
    order: PAGE_ORDER,
    badge: ({ scope }) => (scope === undefined ? null : <PendingBadge hub={hub} tenant={scope} />),
    render: ({ scope }) =>
      scope === undefined ? null : <DecisionsPage hub={hub} tenant={scope} />,
  })
  const anchor = options.sessionAnchor
  if (anchor === undefined) return
  shell.contribute('attached', {
    id: IN_SESSION_ID,
    order: 0,
    anchor,
    render: ({ scope, subject }) =>
      scope === undefined ? null : <SessionCards hub={hub} tenant={scope} session={subject} />,
  })
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
      contribute(ctx.shell, hub, options)
    },
  }
}
