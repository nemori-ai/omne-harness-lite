import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { AttachedLayout } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Fragment } from 'react'
import { assetGovernanceKey, governancePort } from './governance-port.ts'
import { createCategoryNames } from './model/category-names.ts'
import { createGovernance } from './model/governance.ts'
import { assetsCategory, assetsCategoryPage, assetsHolding } from './model/points.ts'
import { AssetsPage } from './view/assets-page.tsx'
import { boundRow } from './view/setting-row.tsx'
import { SettingsPage } from './view/settings-page.tsx'

const ASSETS = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })

export const ASSETS_PAGE_ORDER = 15
export const SETTINGS_PAGE_ORDER = 20

const inOrder: AttachedLayout = entries =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

export const assetsUiModule = defineUiModule<Record<string, ClientOf<AssetsProtocol>>>({
  name: 'assets-ui',
  inject: [ASSETS],
  apply(shell, services, provide) {
    const client = services[ASSETS]!
    const governance = createGovernance({ client })
    const categoryNames = createCategoryNames(client)
    provide(assetGovernanceKey, governancePort(governance, boundRow))
    shell.contribute('pages', {
      id: 'assets',
      title: '资产',
      order: ASSETS_PAGE_ORDER,
      icon: 'resource',
      render: ({ scope }) =>
        scope === undefined ? null : (
          <AssetsPage
            governance={governance}
            tenant={scope}
            categoryNames={categoryNames}
            categorySlot={category => assetsCategory.slot(shell, category, { category }, inOrder)}
            holdingSlot={(category, name) =>
              assetsHolding.slot(shell, category, { category, name }, inOrder)
            }
            pages={layout => assetsCategoryPage.slot(shell, {}, layout)}
          />
        ),
    })
    shell.contribute('pages', {
      id: 'settings',
      title: '设置',
      order: SETTINGS_PAGE_ORDER,
      icon: 'settings',
      render: ({ scope }) =>
        scope === undefined ? null : <SettingsPage client={client} tenant={scope} />,
    })
  },
})

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
  ASSETS_HOLDING,
  assetsCategory,
  assetsCategoryPage,
  assetsHolding,
  type AssetsPageSubject,
  type CategorySubject,
  type HoldingSubject,
} from './model/points.ts'
