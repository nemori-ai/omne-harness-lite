# Fork 计划评审与接受

独立 architecture-reviewer 只读评审 `654ea25` 的计划，并消费作者明确提供的
scope 修订。原稿新建 scope 副本会与既有 agent 内的私有 Symbol/WeakMap
形成两份路由状态；作者选择复用现有实现、补齐 store 并公开 scope-baseline。
评审确认该修订消除冲突，未发现其余计划级阻断；要求跨两份真实 tarball 验证
共同 scope 的事件过滤、父链及撤回，不能只验证分别 import 成功。

切片注意事项：上游 tools/types.ts 为 PTC 扩展，排除；当前 agent/baseline
没有 AssistantStreamFrame，Loop 所需 source-only 记录投影由本轮统一定义，
不得为补类型回引完整 Agent/Loop/preset。普通库与源类型都不替代目标契约。

作者在用户设计后 fork 的授权内接受修订计划。此接受允许按 D-006 的来源
范围构建实验性基线，不允许假成功占位或重新引入排除子系统，也不表示目标
产品实现完成。实际包/模块和验证证据随施工结果补齐。
