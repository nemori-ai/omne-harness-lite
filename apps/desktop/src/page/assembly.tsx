import type { Plugin } from '@deepseek-ai/cordis'
import * as ui from '@omne-harness/ui-kit'
import '@omne-harness/assets-ui/assets-ui.css'
import {
  assetGovernanceKey,
  assetsCategoryPage,
  assetsUiModule,
} from '@omne-harness/assets-ui/cordis'
import '@omne-harness/calendar-ui/calendar-ui.css'
import { calendarUiModule } from '@omne-harness/calendar-ui/cordis'
import '@omne-harness/human-intervention-ui/human-intervention-ui.css'
import {
  createHumanInterventionUiModule,
  releaseDetail,
} from '@omne-harness/human-intervention-ui/cordis'
import { identityUiModule } from '@omne-harness/identity-ui/cordis'
import '@omne-harness/identity-ui/identity-ui.css'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import '@omne-harness/mcp-ui/mcp-ui.css'
import { createMediaUiModule } from '@omne-harness/media-ui/cordis'
import '@omne-harness/media-ui/media-ui.css'
import { modelChoicesKey, modelUiModule } from '@omne-harness/model-ui/cordis'
import { notificationUiModule } from '@omne-harness/notification-ui/cordis'
import '@omne-harness/notification-ui/notification-ui.css'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import * as React from 'react'
import '@omne-harness/schedule-ui/schedule-ui.css'
import { createScheduleUiModule } from '@omne-harness/schedule-ui/cordis'
import {
  createSessionUiModule,
  sessionBlockRender,
  sessionCallDetail,
  sessionComposerAttachments,
  sessionComposerIntakeKey,
  sessionDock,
  sessionReadsSourceKey,
  sessionReadsUiModule,
  sessionSide,
  sessionStatus,
} from '@omne-harness/session-ui/cordis'
import '@omne-harness/session-ui/session-ui.css'
import { createToolUiModule } from '@omne-harness/tool-ui/cordis'
import { storedLayouts } from '@omne-harness/usage-ui'
import { createUsageUiModule } from '@omne-harness/usage-ui/cordis'
import '@omne-harness/usage-ui/usage-ui.css'
import { workspaceChoicesKey, workspaceUiModule } from '@omne-harness/workspace-ui/cordis'
import { pluginFilePath } from '../shared/plugin-path.ts'
import { domainProtocols } from '../shared/protocols.ts'

export const USAGE_REFRESH_MS = 60_000

export type Assembly = Readonly<{
  protocols: readonly ProtocolContract[]
  modules: readonly Plugin.Object[]
}>

export const assembly: Assembly = {
  protocols: domainProtocols,
  modules: [
    identityUiModule,
    createSessionUiModule({
      modelChoices: modelChoicesKey,
      workspaceChoices: workspaceChoicesKey,
      blockReads: sessionReadsSourceKey,
    }),
    createHumanInterventionUiModule({ sessionDock }),
    notificationUiModule,
    createScheduleUiModule({ releaseDetail }),
    calendarUiModule,
    assetsUiModule,
    createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey }),
    createToolUiModule({ callDetail: sessionCallDetail }),
    modelUiModule,
    workspaceUiModule,
    createUsageUiModule({
      sessionSide,
      sessionStatus,
      store: storedLayouts(() => window.localStorage),
      refreshMs: USAGE_REFRESH_MS,
    }),
    createMediaUiModule({
      composerAttachments: sessionComposerAttachments,
      block: sessionBlockRender,
      drafts: sessionComposerIntakeKey,
    }),
    sessionReadsUiModule,
    createPluginUiModule({
      code: {
        given: { React, ui },
        load: (name, version, path) =>
          import(/* @vite-ignore */ pluginFilePath(name, version, path)),
      },
    }),
  ],
}
