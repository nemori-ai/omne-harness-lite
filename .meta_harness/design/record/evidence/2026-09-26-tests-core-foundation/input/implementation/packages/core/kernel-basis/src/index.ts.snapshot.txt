// 内核层复用件：Cordis 4.0.4 采用版本下四个 tenancy 插件共用的形态与助手。取证 probe 在 tests/basis/。
export { type Outcome, type Ack, succeed, fail, isSuccess } from './outcome.ts'
export { FIBER_STATE, type FiberStateValue, fiberIsActive } from './fiber-state.ts'
export { type PluginDefinition, definePlugin, resolveOptional } from './plugin.ts'
