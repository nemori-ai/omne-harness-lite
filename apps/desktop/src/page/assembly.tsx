import type { Plugin } from '@deepseek-ai/cordis'
import '@omne-harness/assets-ui/assets-ui.css'
import { assetsUiModule } from '@omne-harness/assets-ui/cordis'
import { identityUiModule } from '@omne-harness/identity-ui/cordis'
import '@omne-harness/identity-ui/identity-ui.css'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { sessionUiModule } from '@omne-harness/session-ui/cordis'
import '@omne-harness/session-ui/session-ui.css'
import { domainProtocols } from '../shared/protocols.ts'

export type Assembly = Readonly<{
  protocols: readonly ProtocolContract[]
  modules: readonly Plugin.Object[]
}>

export const assembly: Assembly = {
  protocols: domainProtocols,
  modules: [identityUiModule, sessionUiModule, assetsUiModule],
}
