import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { AttachedLayout } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Fragment } from 'react'
import { assetsCategory, assetsHolding } from './model/points.ts'
import { SettingsPanel } from './view/settings-panel.tsx'

const ASSETS = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })

export type AssetsUiOptions = Readonly<{ categoryLabels?: Readonly<Record<string, string>> }>

const inOrder: AttachedLayout = entries =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

export function createAssetsUiModule(options: AssetsUiOptions = {}) {
  const categoryLabels = options.categoryLabels ?? {}
  return defineUiModule<Record<string, ClientOf<AssetsProtocol>>>({
    name: 'assets-ui',
    inject: [ASSETS],
    apply(shell, services) {
      const client = services[ASSETS]!
      shell.contribute('pages', {
        id: 'settings',
        title: '设置',
        order: 20,
        render: ({ scope }) =>
          scope === undefined ? null : (
            <SettingsPanel
              client={client}
              tenant={scope}
              categoryLabels={categoryLabels}
              categorySlot={category => assetsCategory.slot(shell, category, { category }, inOrder)}
              holdingSlot={(category, name) =>
                assetsHolding.slot(shell, category, { category, name }, inOrder)
              }
            />
          ),
      })
    },
  })
}

export const assetsUiModule = createAssetsUiModule()

export {
  ASSETS_CATEGORY,
  ASSETS_HOLDING,
  assetsCategory,
  assetsHolding,
  type CategorySubject,
  type HoldingSubject,
} from './model/points.ts'
