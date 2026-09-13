# Loop 上下文与流片段源基线

来源是固定 `c291e796` 的 agent-loop/runtime-context.ts 与 assistant-stream.ts，
及同版本 agent/runtime-types.ts 中单独的 AssistantStreamFrame 联合类型。
后者只有进程内帧的值投影，不导入完整 Agent 接口或其额外系统。

源算法把系统 prompt 的有效节点、动态上下文快照从 Session 的 surface 和
历史恢复，计算未提交的新消息或替换意图；运行贡献没有变化时不重复产生快照。
调用者拥有真正 append。源标记中的 DSH 插件名改为本地 baseline prompt 名，
其它排序/替换算法保留。它不是目标 MC-07 的全量 manifest 或权限检查。

AssistantStreamAttempt 将同一输入 chunk 快照一次，送到累积器和 block
装配器，再发进程内帧。start/end 顺序由源调用者负责；该类未独立阻止重复
start、重复 settle 或终态后 push。attemptId 在源中用 Session 名与本地计数
拼合，不是 D-008 的 tenant/attempt 身份，也不是重启去重键。保留这些源事实
供二次开发，不能把本组帧当目标独立执行器或审批后果。

settle 调用同步源 append，再发 committed 帧；append 抛错则发 abandoned 并
传播错误。这个源同步回调不证明磁盘已 fsync，也不能实现 DR 的耐久确认。
目标 Loop 仍需接入 Session/Run、模型准入、独立工具 owner、持久预算及 HITL。

本次不导入完整 agent-loop/index、agent、inbox 或 tool-calls 的应用驱动，
避免保留旧 turn/next-step/自动补偿结果等政策；只导出上述两个真实算法。
源测试使用实际本地 Session/LLM 源模块，完整目标组合留在 D-008 验收场景。
