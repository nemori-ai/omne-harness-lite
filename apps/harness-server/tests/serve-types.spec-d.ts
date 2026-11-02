// 行声明类型的负例（DP1-C15）：成员插件不能直接做带关闭阶段的行。
import type { Plugin } from '@deepseek-ai/cordis'
import { expectTypeOf, test } from 'vitest'
import type { RowBody, RowDefinition } from '../src/row.ts'

type Manifest = RowDefinition['manifest']
const manifest: Manifest = { provides: [], injects: [], sameProviderGroup: null }
const plugin: Plugin.Object = { apply() {} }
const body: RowBody = async () => ({ stop: async () => ({ kind: 'settled' }) })

test('a plugin row cannot name a phase: with a phase the declaration must be a body or an entry-object row', () => {
  type PluginWithPhase = {
    row: string
    implementation: 'real'
    manifest: Manifest
    lifecycle: { kind: 'body'; phase: 'entry' }
    plugin: Plugin.Object
  }
  expectTypeOf<PluginWithPhase>().not.toExtend<RowDefinition>()

  type BodyWithoutPhase = {
    row: string
    implementation: 'real'
    manifest: Manifest
    lifecycle: { kind: 'none' }
    body: RowBody
  }
  expectTypeOf<BodyWithoutPhase>().not.toExtend<RowDefinition>()

  type EntryObjectWithoutVia = {
    row: string
    implementation: 'real'
    manifest: Manifest
    lifecycle: { kind: 'entry-object'; phase: 'storage' }
    plugin: Plugin.Object
  }
  expectTypeOf<EntryObjectWithoutVia>().not.toExtend<RowDefinition>()

  const valid: RowDefinition = {
    row: 'x',
    implementation: 'real',
    manifest,
    lifecycle: { kind: 'entry-object', phase: 'storage', via: 'storageHost' },
    plugin,
  }
  void valid
  void body
})

test('a declaration cannot be an s0-double, and its manifest does not carry the phase', () => {
  expectTypeOf<RowDefinition['implementation']>().toEqualTypeOf<'real' | 'contract-double'>()
  const withPhase: Manifest = {
    provides: [],
    injects: [],
    sameProviderGroup: null,
    // @ts-expect-error the phase comes from the lifecycle, not from the manifest
    phase: 'entry',
  }
  void withPhase
})
