// 夹具 `runtime-context` 行：契约替身实现。它 inject 入口对象 `runtimeContextTrust`（受信名），
// 用于证明真实消费者缺入口对象时停在 PENDING、不得到占位（DP1-C11）。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { defineRow } from '../../../../../src/row.ts'
import {
  FixtureRuntimeContextService,
  runtimeContextKey,
  runtimeContextTrustKey,
} from '../../definitions.ts'

class RuntimeContextImpl extends FixtureRuntimeContextService {}

const doublePlugin: Plugin.Object = {
  name: 'fixture-runtime-context',
  inject: [runtimeContextTrustKey],
  apply(ctx: Context) {
    new RuntimeContextImpl(ctx)
  },
}

export const fixtureRuntimeContext = defineRow({
  row: 'runtime-context',
  implementation: 'contract-double',
  manifest: {
    provides: [runtimeContextKey],
    injects: [runtimeContextTrustKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: doublePlugin,
})
