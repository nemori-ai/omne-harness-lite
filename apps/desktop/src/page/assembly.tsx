import type { Plugin } from '@deepseek-ai/cordis'
import '@omne-harness/assets-ui/assets-ui.css'
import {
  assetGovernanceKey,
  assetsCategoryPage,
  createAssetsUiModule,
} from '@omne-harness/assets-ui/cordis'
import '@omne-harness/human-intervention-ui/human-intervention-ui.css'
import { createHumanInterventionUiModule } from '@omne-harness/human-intervention-ui/cordis'
import { identityUiModule } from '@omne-harness/identity-ui/cordis'
import '@omne-harness/identity-ui/identity-ui.css'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import '@omne-harness/mcp-ui/mcp-ui.css'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { sessionCallDetail, sessionDock, sessionUiModule } from '@omne-harness/session-ui/cordis'
import '@omne-harness/session-ui/session-ui.css'
import { createToolUiModule } from '@omne-harness/tool-ui/cordis'
import { domainProtocols } from '../shared/protocols.ts'

export type Assembly = Readonly<{
  protocols: readonly ProtocolContract[]
  modules: readonly Plugin.Object[]
}>

const ASSET_CATEGORY_LABELS = {
  tool: '工具',
  'model-provider': '模型供应商',
  skill: '技能',
  AgentDefinition: '智能体',
  mcp: 'MCP',
}

export const assembly: Assembly = {
  protocols: domainProtocols,
  modules: [
    identityUiModule,
    sessionUiModule,
    createHumanInterventionUiModule({ sessionDock }),
    createAssetsUiModule({ categoryLabels: ASSET_CATEGORY_LABELS }),
    createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey }),
    createToolUiModule({ callDetail: sessionCallDetail }),
  ],
}
