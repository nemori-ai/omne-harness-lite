import type { EntryOpeningSignal } from '@omne-harness-lite/governance-center-entry'
// 公开入口的类型（装配据它构造 config、合迁移、放核对）。
import { describe, expectTypeOf, it } from 'vitest'
import type { MigrationFragment, PreflightCheck } from '@omne-harness-lite/storage'
import type { Caller } from '../src/routing/caller.ts'
import {
  type GovernanceCenterEntryConfig,
  type GovernanceCenterOpsConfig,
  governanceCenterMigrations,
  governanceCenterPreflight,
} from '../src/index.ts'
import { type GovernanceCenterId } from '@omne-harness-lite/governance-center-entry'

describe('公开入口的类型', () => {
  it('EntryOpening 与两份配置的公共形状', () => {
    expectTypeOf<EntryOpeningSignal['wait']>().toEqualTypeOf<() => Promise<void>>()
    expectTypeOf<EntryOpeningSignal['isOpen']>().toEqualTypeOf<() => boolean>()
    expectTypeOf<GovernanceCenterEntryConfig>().not.toHaveProperty('openSignal')
    expectTypeOf<GovernanceCenterEntryConfig['listen']>().toEqualTypeOf<{
      readonly host: string
      readonly port: number
    }>()
    expectTypeOf<GovernanceCenterOpsConfig['deploymentKey']>().toEqualTypeOf<{
      readonly present: true
      readonly complete: true
    }>()
  })

  it('迁移片段与迁移前核对按 storage 协议的共用接口', () => {
    expectTypeOf(governanceCenterMigrations).toEqualTypeOf<readonly MigrationFragment[]>()
    expectTypeOf(governanceCenterPreflight).toEqualTypeOf<PreflightCheck>()
  })

  it('GovernanceCenterId 是品牌字符串：普通字符串不能当它用', () => {
    expectTypeOf<string>().not.toMatchTypeOf<GovernanceCenterId>()
  })

  it('Caller 是名义类型：结构相同的普通对象不能当它用（只在认人那一步构造）', () => {
    expectTypeOf<{ loginStateId: never; accountId: never }>().not.toMatchTypeOf<Caller>()
  })
})
