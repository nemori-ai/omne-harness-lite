import { refusal, type BodyContract, type CategoryContribution } from '@omne-harness/assets'
import type { SettingsTarget, TenantSettingsAssetRef } from '@omne-harness/settings'

const PREFERENCE_CATEGORY = 'preference'

const preferenceContract: BodyContract = {
  category: PREFERENCE_CATEGORY,
  schema: { kind: 'null' },
  judge: () => refusal('not-publishable'),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

export const preferenceCategory: CategoryContribution = {
  contract: preferenceContract,
  display: {
    title: '偏好',
    summary: '各领域声明的个人设置，每个租户一份；不是可以发布的资产。',
  },
}

export function preferenceAssetOf(target: SettingsTarget): TenantSettingsAssetRef | undefined {
  return target.kind === 'independent'
    ? { category: PREFERENCE_CATEGORY, name: target.providerId }
    : undefined
}
