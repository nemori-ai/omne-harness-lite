// `./cordis` 导出：只含 S0 替身插件。导出名就是发行配置里 `plugin` 的取值，也是装载的 allowlist。
export { createStubPlugin as stubPlugin } from './s0/stub-plugin.ts'
