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
