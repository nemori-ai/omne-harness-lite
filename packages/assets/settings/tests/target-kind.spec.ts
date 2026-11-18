import { describe, expect, it } from 'vitest'
import {
  AssetTargetSchema,
  IndependentTargetSchema,
  SettingsTargetSchema,
  sameTarget,
  targetSortKey,
} from '@omne-harness/settings'

const asset = { kind: 'asset', holdingRef: 'tool/web', scopeRef: 'tenant-a' } as const
const independent = {
  kind: 'independent',
  providerId: 'calendar',
  definitionId: 'environment',
  scopeRef: 'tenant-a',
} as const

describe('who a settings target belongs to is a closed kind of its identity', () => {
  it('收两种：资产目标与独立目标', () => {
    expect(SettingsTargetSchema.parse(asset)).toEqual(asset)
    expect(SettingsTargetSchema.parse(independent)).toEqual(independent)
    expect(AssetTargetSchema.safeParse(independent).success).toBe(false)
    expect(IndependentTargetSchema.safeParse(asset).success).toBe(false)
  })

  it.each([
    ['带 policyId 的旧形状', { policyId: 'asset', targetRef: 'tool/web', scopeRef: 'tenant-a' }],
    ['种类之外的第三种', { kind: 'preference', providerId: 'p', definitionId: 'd', scopeRef: 't' }],
    ['目录快照的主语', { kind: 'catalog-capture', deploymentRef: 'd', tenantRef: 'tenant-a' }],
    ['资产目标多一个字段', { ...asset, providerId: 'calendar' }],
    ['独立目标少一个字段', { kind: 'independent', providerId: 'calendar', scopeRef: 'tenant-a' }],
  ])('拒收 %s', (_case, value) => {
    expect(SettingsTargetSchema.safeParse(value).success).toBe(false)
  })

  it('同一个目标按值相等；排序键按范围、种类、身份', () => {
    expect(sameTarget(asset, { ...asset })).toBe(true)
    expect(sameTarget(asset, { ...asset, holdingRef: 'tool/other' })).toBe(false)
    expect(sameTarget(asset, independent)).toBe(false)
    expect(targetSortKey(asset)).toEqual(['tenant-a', 'asset', 'tool/web'])
    expect(targetSortKey(independent)).toEqual([
      'tenant-a',
      'independent',
      'calendar',
      'environment',
    ])
  })
})
