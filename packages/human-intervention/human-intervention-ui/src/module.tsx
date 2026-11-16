import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import {
  humanInterventionProtocol,
  type HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { DecisionsPage } from './view/decisions-page.tsx'

const HITL = protocolServiceName({
  name: humanInterventionProtocol.name,
  major: humanInterventionProtocol.major,
})

export const PAGE_ID = 'decisions'
export const PAGE_ORDER = 10

export const humanInterventionUiModule = defineUiModule<
  Record<string, ClientOf<HumanInterventionProtocol>>
>({
  name: 'human-intervention-ui',
  inject: [HITL],
  apply(shell, services) {
    const client = services[HITL]!
    shell.contribute('pages', {
      id: PAGE_ID,
      title: '待你决定',
      order: PAGE_ORDER,
      render: ({ scope }) =>
        scope === undefined ? null : <DecisionsPage client={client} tenant={scope} />,
    })
  },
})
