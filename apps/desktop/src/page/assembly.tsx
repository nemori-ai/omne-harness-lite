import type { Plugin } from '@deepseek-ai/cordis'
import * as ui from '@omne-harness/ui-kit'
import '@omne-harness/assets-ui/assets-ui.css'
import {
  assetGovernanceKey,
  assetsCategoryPage,
  assetsHolding,
  assetsPageTarget,
  assetsUiModule,
} from '@omne-harness/assets-ui/cordis'
import '@omne-harness/calendar-ui/calendar-ui.css'
import { calendarUiModule } from '@omne-harness/calendar-ui/cordis'
import '@omne-harness/canvas-ui/canvas-ui.css'
import { canvasElement, canvasPicker, canvasUiModule } from '@omne-harness/canvas-ui/cordis'
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
import {
  PROVIDER_CATEGORY,
  createModelUiModule,
  modelChoicesKey,
} from '@omne-harness/model-ui/cordis'
import { notificationUiModule } from '@omne-harness/notification-ui/cordis'
import '@omne-harness/notification-ui/notification-ui.css'
import { createPluginUiModule } from '@omne-harness/plugin-ui/cordis'
import '@omne-harness/plugin-ui/plugin-ui.css'
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
  sessionRunFailure,
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
import { storedFloor, whenDrawn } from './shell/floor.ts'
import { domainProtocols } from '../shared/protocols.ts'
import { LOOK_KEY, storedTenantTexts } from './shell/tenant-text.ts'
import { hostScreen } from './screen-source.ts'

export const USAGE_REFRESH_MS = 60_000

export type Assembly = Readonly<{
  protocols: readonly ProtocolContract[]
  modules: readonly Plugin.Object[]
}>

/** Whether the page has put its own interface where the line it boots with stood. */
function pageDrawn(): boolean {
  const root = document.getElementById('root')
  return root !== null && root.childElementCount > 0 && root.querySelector('.booting') === null
}

/** The floor of this page: the loader asks it, and the page hears from it when everything has an outcome. */
export const pageFloor = storedFloor(() => window.localStorage, whenDrawn(pageDrawn))

export const assembly: Assembly = {
  protocols: domainProtocols,
  modules: [
    identityUiModule,
    createSessionUiModule({
      modelChoices: modelChoicesKey,
      workspaceChoices: workspaceChoicesKey,
      blockReads: sessionReadsSourceKey,
      canvasElement,
      canvasPicker,
    }),
    createHumanInterventionUiModule({ sessionDock }),
    notificationUiModule,
    createScheduleUiModule({ releaseDetail }),
    calendarUiModule,
    assetsUiModule,
    createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey }),
    createToolUiModule({ callDetail: sessionCallDetail }),
    createModelUiModule({
      runFailure: sessionRunFailure,
      providers: assetsPageTarget(PROVIDER_CATEGORY),
      holding: assetsHolding,
      assets: assetGovernanceKey,
    }),
    workspaceUiModule,
    createUsageUiModule({
      sessionSide,
      sessionStatus,
      store: storedLayouts(() => window.localStorage),
      refreshMs: USAGE_REFRESH_MS,
    }),
    createMediaUiModule({
      screen: hostScreen(),
      composerAttachments: sessionComposerAttachments,
      block: sessionBlockRender,
      drafts: sessionComposerIntakeKey,
      holding: assetsHolding,
      assets: assetGovernanceKey,
    }),
    sessionReadsUiModule,
    canvasUiModule,
    createPluginUiModule({
      floor: pageFloor,
      looks: storedTenantTexts(() => window.localStorage, LOOK_KEY),
      code: {
        given: { React, ui },
        load: (name, version, path) =>
          import(/* @vite-ignore */ pluginFilePath(name, version, path)),
        files: (name, version) => pluginFilePath(name, version, ''),
      },
    }),
  ],
}
