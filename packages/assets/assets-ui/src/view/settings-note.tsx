import { EmptyState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import type { JSX } from 'react'

export function SettingsNote(): JSX.Element {
  return (
    <PageColumn className="assets-settings">
      <PageHeader title="设置" />
      <EmptyState title="资产自己的设置都在「资产」页里。这一页以后放不属于任何资产的设置。" />
    </PageColumn>
  )
}
