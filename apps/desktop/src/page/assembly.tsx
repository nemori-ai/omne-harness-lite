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
import {
  canvasElement,
  canvasIntake,
  canvasPicker,
  createCanvasUiModule,
} from '@omne-harness/canvas-ui/cordis'
import { createGoalUiModule } from '@omne-harness/goal-ui/cordis'
import '@omne-harness/goal-ui/goal-ui.css'
import '@omne-harness/human-intervention-ui/human-intervention-ui.css'
import {
  createHumanInterventionUiModule,
  releaseDetail,
} from '@omne-harness/human-intervention-ui/cordis'
import { accountPreferencesKey, identityUiModule } from '@omne-harness/identity-ui/cordis'
import '@omne-harness/identity-ui/identity-ui.css'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import '@omne-harness/mcp-ui/mcp-ui.css'
import { createMediaUiModule, mediaPictureIntakeKey } from '@omne-harness/media-ui/cordis'
import '@omne-harness/media-ui/media-ui.css'
import '@omne-harness/model-ui/model-ui.css'
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
  conversationTarget,
  createSessionUiModule,
  sessionBlockRender,
  sessionCallDetail,
  sessionToolCall,
  sessionComposerAttachments,
  sessionComposerIntakeKey,
  sessionComposerKey,
  sessionDock,
  sessionReadsSourceKey,
  sessionReadsUiModule,
  sessionModelChoiceKey,
  sessionRunFailure,
  sessionSide,
  sessionStatus,
} from '@omne-harness/session-ui/cordis'
import '@omne-harness/session-ui/session-ui.css'
import { createComposer } from '@omne-harness/slash-command-contract'
import {
  createSlashCommandUiModule,
  slashCommandComposerKey,
} from '@omne-harness/slash-command-ui/cordis'
import { createToolUiModule } from '@omne-harness/tool-ui/cordis'
import { storedLayouts } from '@omne-harness/usage-ui'
import { createUsageUiModule } from '@omne-harness/usage-ui/cordis'
import '@omne-harness/usage-ui/usage-ui.css'
import { workspaceChoicesKey, workspaceUiModule } from '@omne-harness/workspace-ui/cordis'
import { pluginFilePath } from '../shared/plugin-path.ts'
import { storedCanvasPreferences } from './canvas-preferences.ts'
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
      composerAssistant: slashCommandComposerKey,
      pictureIntake: mediaPictureIntakeKey,
    }),
    createSlashCommandUiModule({
      composer: createComposer,
      writer: sessionComposerKey,
      preferences: accountPreferencesKey,
    }),
    createHumanInterventionUiModule({ sessionDock }),
    createGoalUiModule({ sessionSide, conversation: conversationTarget }),
    notificationUiModule,
    createScheduleUiModule({ releaseDetail, conversation: conversationTarget, sessionStatus }),
    calendarUiModule,
    assetsUiModule,
    createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey }),
    createToolUiModule({ callDetail: sessionCallDetail, toolCall: sessionToolCall }),
    createModelUiModule({
      runFailure: sessionRunFailure,
      providers: assetsPageTarget(PROVIDER_CATEGORY),
      holding: assetsHolding,
      assets: assetGovernanceKey,
      modelChoice: sessionModelChoiceKey,
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
      canvasElement,
      canvasIntake,
    }),
    sessionReadsUiModule,
    createCanvasUiModule({ preferences: storedCanvasPreferences(() => window.localStorage) }),
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
