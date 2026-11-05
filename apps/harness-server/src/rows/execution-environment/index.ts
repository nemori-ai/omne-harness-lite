// 执行环境的三行（B 段，装配页插件树 `execution-environment`、`execution-files`、`execution-command`）：
// execution-environment-host-local 的 `./cordis` 插件原样装进行，行只加声明，不加配置与行为。
// - `execution-environment`：`ExecutionEnvironmentRegistry`，提供 `executionEnvironment`。授权、可信作用域绑定与
//   恢复授权由它逐次从装载上下文现取（入口对象 `executionEnvironmentAuthority`、`executionScopeBinding`、
//   `executionRecoveryAuthority`），缺席答 unavailable。
// - `execution-files`：`files` 设施声明。
// - `execution-command`：`command` 设施声明，加 Shell 要的持久终端（`terminal`）设施声明。插件树没有单独的终端行，
//   终端只随命令进入，所以两个声明装在同一行，同生同灭。
// 宿主提供者在 `execution-host` 行（工厂行）。
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
