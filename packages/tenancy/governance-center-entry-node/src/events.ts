// 事件声明模块（入口节点 verification「包布局常量」）：只导出四个通知名，不 import 任何 @omne-harness-lite/* 包。
// 运维面只许 on/once 前三个、emit 第四个；结构规则 ops-event-whitelist 据此查。
export const serving = 'governance-center-entry/serving' as const
export const stopped = 'governance-center-entry/stopped' as const
export const defect = 'governance-center-entry/defect' as const
export const listening = 'governance-center-ops/listening' as const
