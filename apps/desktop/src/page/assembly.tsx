import type { Plugin } from '@deepseek-ai/cordis'
import '@omne-harness/assets-ui/assets-ui.css'
import {
  assetGovernanceKey,
  assetsCategoryPage,
  assetsUiModule,
} from '@omne-harness/assets-ui/cordis'
import '@omne-harness/calendar-ui/calendar-ui.css'
import { calendarUiModule } from '@omne-harness/calendar-ui/cordis'
import '@omne-harness/human-intervention-ui/human-intervention-ui.css'
import { createHumanInterventionUiModule } from '@omne-harness/human-intervention-ui/cordis'
import { identityUiModule } from '@omne-harness/identity-ui/cordis'
import '@omne-harness/identity-ui/identity-ui.css'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import '@omne-harness/mcp-ui/mcp-ui.css'
import { notificationUiModule } from '@omne-harness/notification-ui/cordis'
import '@omne-harness/notification-ui/notification-ui.css'
import type { ProtocolContract } from '@omne-harness/public-contract'
import '@omne-harness/schedule-ui/schedule-ui.css'
import { scheduleUiModule } from '@omne-harness/schedule-ui/cordis'
import { sessionCallDetail, sessionDock, sessionUiModule } from '@omne-harness/session-ui/cordis'
import '@omne-harness/session-ui/session-ui.css'
import { createToolUiModule } from '@omne-harness/tool-ui/cordis'
import { domainProtocols } from '../shared/protocols.ts'

export type Assembly = Readonly<{
  protocols: readonly ProtocolContract[]
  modules: readonly Plugin.Object[]
}>

export const assembly: Assembly = {
  protocols: domainProtocols,
  modules: [
    identityUiModule,
    sessionUiModule,
    createHumanInterventionUiModule({ sessionDock }),
    notificationUiModule,
    scheduleUiModule,
    calendarUiModule,
    assetsUiModule,
    createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey }),
    createToolUiModule({ callDetail: sessionCallDetail }),
  ],
}
