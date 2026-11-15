import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { SettingsPanel } from './view/settings-panel.tsx'

const ASSETS = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })

export const assetsUiModule = defineUiModule<Record<string, ClientOf<AssetsProtocol>>>({
  name: 'assets-ui',
  inject: [ASSETS],
  apply(shell, services) {
    const client = services[ASSETS]!
    shell.contribute('pages', {
      id: 'settings',
      title: '设置',
      order: 20,
      render: ({ scope }) =>
        scope === undefined ? null : <SettingsPanel client={client} tenant={scope} />,
    })
  },
})
