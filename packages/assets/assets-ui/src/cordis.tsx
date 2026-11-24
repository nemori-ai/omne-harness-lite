import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { CONNECTION_SERVER_POINTS, type ServerPoints } from '@omne-harness/client-assembly'
import { needPoint, needProtocol, type AttachedLayout } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Fragment } from 'react'
import { assetGovernanceKey, governancePort } from './governance-port.ts'
import { createCategoryNames } from './model/category-names.ts'
import { createGovernance } from './model/governance.ts'
import { assetsCategory, assetsCategoryPage, assetsControl, assetsHolding } from './model/points.ts'
import { assetsParts } from './parts.ts'
import { AssetsPage } from './view/assets-page.tsx'
import { ControlDrawContext } from './view/control-draw.ts'
import { boundRow } from './view/setting-row.tsx'
import { SettingsPage } from './view/settings-page.tsx'

export const ASSETS_PAGE_ORDER = 15
export const ASSETS_PAGE = 'assets'

/** Where the page of one category is: the shell's navigate takes these two, and the page chooses that category. */
export function assetsPageTarget(category: string): Readonly<{ page: string; subject: string }> {
  return { page: ASSETS_PAGE, subject: category }
}
export const SETTINGS_PAGE_ORDER = 20

const inOrder: AttachedLayout = entries =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

export const assetsUiModule = defineUiModule({
  name: 'assets-ui',
  needs: {
    assets: needProtocol<ClientOf<AssetsProtocol>>(assetsProtocol),
    server: needPoint<ServerPoints>(CONNECTION_SERVER_POINTS),
  },
  apply(shell, { assets: client, server }, provide) {
    for (const part of assetsParts) part.declare(shell)
    for (const point of [assetsCategoryPage, assetsCategory, assetsHolding, assetsControl])
      point.declare(shell)
    const governance = createGovernance({ client })
    const categoryNames = createCategoryNames(client, server.get())
    provide(assetGovernanceKey, governancePort(governance, boundRow(shell)))
    shell.contribute('pages', {
      id: ASSETS_PAGE,
      title: '资产',
      order: ASSETS_PAGE_ORDER,
      icon: 'resource',
      render: ({ scope, subject }) =>
        scope === undefined ? null : (
          <ControlDrawContext.Provider value={shell}>
            <AssetsPage
              governance={governance}
              tenant={scope}
              {...(subject === undefined ? {} : { pointAt: subject })}
              categoryNames={categoryNames}
              categorySlot={category => assetsCategory.slot(shell, category, { category }, inOrder)}
              holdingSlot={(category, name) =>
                assetsHolding.slot(shell, category, { category, name }, inOrder)
              }
              pages={layout => assetsCategoryPage.slot(shell, {}, layout)}
            />
          </ControlDrawContext.Provider>
        ),
    })
    shell.contribute('pages', {
      id: 'settings',
      title: '设置',
      order: SETTINGS_PAGE_ORDER,
      icon: 'settings',
      group: 'utility',
      render: ({ scope }) =>
        scope === undefined ? null : (
          <ControlDrawContext.Provider value={shell}>
            <SettingsPage client={client} tenant={scope} />
          </ControlDrawContext.Provider>
        ),
    })
    shell.contribute('actions', {
      id: 'assets.settings',
      title: '打开设置',
      group: '页面',
      kind: 'ui',
      order: 0,
      keys: [{ chord: 'Mod+,', layer: 'global' }],
      available: () => true,
      run: () => shell.navigate('settings'),
    })
  },
})

export { assetsParts } from './parts.ts'
export { assetGovernanceKey, type AssetGovernance, type CategoryView } from './governance-port.ts'
export type {
  AssetEntry,
  CategoryAssets,
  CategoryGovernance,
  CategorySnapshot,
} from './model/governance.ts'
export type { Holding } from './model/holdings.ts'
export {
  ASSETS_CATEGORY,
  ASSETS_CATEGORY_PAGE,
  ASSETS_CONTROL,
  ASSETS_HOLDING,
  assetsCategory,
  assetsCategoryPage,
  assetsControl,
  assetsHolding,
  type AssetsControlSubject,
  type AssetsPageSubject,
  type CategorySubject,
  type HoldingSubject,
} from './model/points.ts'
