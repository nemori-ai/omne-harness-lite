import type { Context } from '@deepseek-ai/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  ExecutionEnvironmentRegistry,
  commandFacilityPlugin,
  filesFacilityPlugin,
  terminalFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { defineRow } from '../../row.ts'

const PROVIDER = { [executionEnvironmentKey]: { caller: 'provider' as const } }

export const executionEnvironmentRow = defineRow({
  row: 'execution-environment',
  implementation: 'real',
  manifest: { provides: [executionEnvironmentKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: ExecutionEnvironmentRegistry,
})

export const executionFilesRow = defineRow({
  row: 'execution-files',
  implementation: 'real',
  manifest: { provides: [], injects: [executionEnvironmentKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: filesFacilityPlugin,
})

export const executionCommandRow = defineRow({
  row: 'execution-command',
  implementation: 'real',
  manifest: { provides: [], injects: [executionEnvironmentKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'execution-command',
    inject: PROVIDER,
    Config: commandFacilityPlugin.Config,
    apply(ctx: Context) {
      commandFacilityPlugin.apply(ctx)
      terminalFacilityPlugin.apply(ctx)
    },
  },
})
