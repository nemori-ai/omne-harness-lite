/** Card attribute values adopted in docs/engineering/delivery.md「卡属性与合法组合」. */
export const natures = ['design', 'contract', 'impl', 'integration', 'baseline'] as const
export const contractChanges = ['none', 'additive', 'breaking'] as const
export type Nature = (typeof natures)[number]
export type ContractChange = (typeof contractChanges)[number]
