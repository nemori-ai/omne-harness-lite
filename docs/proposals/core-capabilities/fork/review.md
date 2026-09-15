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

## 实际源码独立复核

architecture-reviewer 对整合修订 `60e42ef32785161f0a0f214e222cb5379a93e734`
只读复核上述边界、各组源说明、实际公开入口、来源映射、依赖闭包及关键生命周期。
它没有运行检查或替作者接受。本轮发现与处置如下：

| 发现 | 处置与证据 |
|---|---|
| Native 调用在 body 等待后读取原输入对象上的 signal/name，调用者复用该对象可能串用取消状态 | 入口一次捕获调用头，body/结算使用同一组值；两个 deferred body 反例在旧产物上失败，修订后通过，见 [red](evidence/invocation-alias-red.log)/[green](evidence/invocation-alias-green.log) |
| Projection 源说明将同版定义一致性和 checkpoint 的 Session 归属写成实现检查 | 改为实际只比较 stateVersion、继续共享首定义；定义一致及 Session 关联明确属于调用者前提，不增加新目标机制 |

修订 `f99c73cb2146f8679324c41921198401732bc7ec` 已完成定点只读复核，两个
发现均已处理，范围内未发现剩余阻断。复核还核对了实际产物测试日志。
初评遗漏 `jsonl-failures.spec.ts` 的覆盖说明已更正：部分写入后实际截回及截回失败
保留双错误已经执行；fsync 故障和 close 复合失败仍未注入。有限来源验证不表明
D-008 提供者或产品已经符合规格。

作者结合以上复核与[实际交付验证](delivery.md)，在用户授权内接受本批源码
二次开发起点。接受范围仅为已映射、构建和验证的源切片，不包括未导入 runtime、
真实后端或目标能力实现。
