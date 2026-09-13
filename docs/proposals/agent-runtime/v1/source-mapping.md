# Cordis 映射与 fork 差异

本页是实现映射依据，不是候选库的完整调研报告。此前包复用与协议调研仍保留在
主检出 `tmp/dsh-reuse-assessment-20260913/`，本轮没有迁入 research。

## 固定来源

观察仓库 `deepseek-ai/deepseek-harness`，commit
`c291e7961a515f6d7af9304e7fd1d257929aef26`。源码中 dsh-agent 为 `0.1.5-rc.2`，
vendor Cordis 为 `@deepseek-ai/cordis 4.0.2`。这些是被检查源码的版本，**没有证明
同名 npm 发布产物兼容**。正式实现仍直接使用官方发布 Cordis；源码阶段固定版本、
完整性及实际发行包的符合性测试，本轮不添加产品依赖。

| 来源 | 有依据的机制与本项目映射 |
|---|---|
| [服务教程](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md) | 服务经 Context 解析；inject 管理依赖生灭。本项目用它组织提供者/消费者，额外维护具体贡献的使用关系与实际可用性 |
| [生命周期与 effects](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md) | 受管注册随 owner 撤除；异步 disposer 可并发发起。本项目把有依赖顺序的排空、释放、撤登记放进一个明确等待的退出过程 |
| [Service API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md) | Service 名称与提供者注册/撤除；不能据此把“能解析到服务”解释为“其内部某条目和远端资源可用” |
| [事件 API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/events.md) | scope/subject 及通知/拦截可组合；租户授权和业务事实提交仍由本项目边界负责 |
| [源原语基线](../source-baseline/design/contract.md)与[源码映射](../source-baseline/source-map.md) | 固定上游 Registry/Handle/Factory、initiator 及辅助入口的实际规则；其既有测试只覆盖该源码配置 |

以上映射中的“本项目”是设计选择，不是 Cordis 官方保证。提供者撤除前的协作排空
需要 OMNE 生命周期所有者参与，不能假定任意直接 HMR 都已遵循它。若 Cordis
本身或进程突然失效，契约要求保留真实故障边界，不声称还能完成内存中协议。

## 上游到目标的差异清单

| 源基线规则/入口 | 目标处置 | 依据与验证要求 |
|---|---|---|
| LA-R1 单 Session ID 登记、直接返回活体 | 修改为 SessionRef 预留 + AgentRef 生命期，受限 Handle | AR-1/2/4；跨租户、并发准备、旧句柄场景 |
| LA-R2/R3 created 同步否决与重入窗口 | 保留精确实例和一次公告思想；发布前私有检查，发布后通知隔离 | AR-6；通知抛错不伪造回滚，重入关闭 |
| LA-R4 精确且幂等 detach | 保留旧清理不删新实例；公开完成升级为完整退出，原始 detach 内部化 | AR-11/12；准备、工作、清理结束前一直占位 |
| LA-R5 owner 和 roots | 不作为业务树或租户目录；必要内部 owner 关系服务资源清理 | AR-3；PF-004 产品后代目录另行设计 |
| LA-F1 单 factory 槽 | 演进为作用域/解析键的明确贡献，单键互斥并追踪使用 | AR-15；支持不同装配，不盲目沿用应用全局单槽 |
| LA-F2 调用 context 追踪 | 保留明确效果归属；产品 child 使用稳定宿主，临时调用者只是因果来源 | AR-3/5；运行时重建不误杀独立工作 |
| LA-F3 释放顺序差异 | 统一为关准入 → 排空/移交 → 清资源/attachment → 撤注册 | AR-12；不删除长期 Session |
| LA-I1/I2/I3 归因与自身排除 | 归因机制可复用；不将 Promise 跟踪及自身排除当成整个 Agent 排空 | AR-8/14/17；显式 self-wait 结果 |
| LA-E1 事件助手 | 可复用分发机制，按目标通知、精确载荷、授权和故障契约修订 | AR-2/6/17；不导出无权跨租户引用 |
| LA-T1 typert ID → 活体 | 从目标公开面移除无租户、可重定向的解析；若保留桥接也必须走同一门 | AR-1/2；不可由序列化值取得控制能力 |
| Agent options/session/inbox/status、send/cancel 等 | 驱动端口重新按所属能力定义；不承诺继承上游队列/Run 政策 | AR-8/10；idle 不证明静止 |
| model-selection、consumed-work、invariant 附属入口 | 不列为本轮内核契约；后续能力按需要迁入、修订或不导入 | 避免附属 helper 偷带上游 Loop、LLM、Session 类型与策略 |

不会把旧源草案改名成目标规格。目标 v1 是一次明确的语义选择；源 draft 与
原评审/测试继续按当时修订保留。实现时逐项核对差异；旧上游测试通过不能覆盖
目标的租户、资源、装配与隔离义务。没有决定在本轮 fork 其他 DSH 产品包。
