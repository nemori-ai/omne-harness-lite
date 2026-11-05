# 日程与 Job

本页维护已接受的目标责任与公开协作，采用范围见[领域入口](../README.md#维护与状态)。目标沿源 Python 修订 `a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0` 的产品范围，采用用户确认的 D3、D4、D5、D9 单一终态。来源与验收映射归[产品正文](../../../.meta_harness/design/product/schedules-and-jobs/design.md)及[成员规格](../../../packages/schedule/schedule/SPEC.md)，正文接受不表示实现或提供者已验证。

## 范围与边界

Schedule 治理未来安排、内含 Routine 值、时间规则、候选和后续控制。Job 治理一次已接受工作的身份、冻结要求、来源、等待、取消、各部分结果及整体判定。两者属于同一既有责任域，不因身份不同自动拆成两个限界上下文、包或进程。Routine 没有独立 ID、CRUD 或共享可变生命周期。

Calendar、Schedule、Job 核心均不依赖 Session、Agent 或工具运行时。Job 保存 program 或 agent 执行意图；agent 包含 instruction 和 new/existing 会话要求，外部执行适配器实现本域 JobExecutor 端口，再消费实际执行方的公开协议。program 与纯通知不要求会话。Job 不等于 Run，创建者是 Agent 也不代表工作必须由 Agent 执行。

## 模块角色与事实归属

| 模块角色       | 事实与责任                                                             |
| -------------- | ---------------------------------------------------------------------- |
| 安排定义与控制 | 完整 Schedule、作者与 owner、管理状态、修订及替换 lineage              |
| 候选与最终接受 | 来源时刻、合并与处置、准备证明、接受回执、次数、冻结 Job 和可靠交接    |
| Job 工作治理   | 等待、启动、控制竞态、各部分结果和整体结算                             |
| 外部执行适配器 | 将冻结意图映射到原执行协议，保留原 executionRef 与受理、查询、停止关联 |
| 通知与结果适配 | 交接稳定意图和回执，分别观察回传、发布、归档、通知，不重做执行         |
| 接入与 tools   | 可信调用上下文、参数和输出映射，经公开应用服务调用，不承载业务规则     |

Job 先于执行存在，持久责任不依赖某个 runtime、插件或内存定时器存活。原执行、Session、通知和治理拥有者继续拥有自己的事实。

## 协作与依赖

Schedule 消费[日历](../calendars/README.md)的版本、覆盖和计算，消费环境、权限及配额拥有者的公共值与具名守卫。Clock 是横向时间来源，不判断到期、次数或补跑。Job 的执行协调者仅认识 JobExecutor；适配器才认识程序注册契约或 Session intake/inbound。详细消费方向见[领域协作](architecture.md)。

业务归属、发起者与接收方分开。系统 scope 不伪装成特殊租户，也不自动取得跨租户资格。目标引用、原结果和事件均须保持 owner 及披露范围。[通知](../notifications/README.md)确认耐久可取回、各渠道送达及确认事实，日程按冻结要求判断 Job 整体结果。

## 主路径与交接

1. 完整保存 draft 或 active 定义。draft 不扫描、不接受候选；promote 按当前资格、环境和时间重新核验。
2. 对账环境与依赖，按最新合法依据计算并准备候选。
3. 最终接受同提交保护控制、版本、资格、去重和次数，保存回执、冻结 Job 及交接 outbox。
4. 启动前再次核验当前资格，经 JobExecutor 承接原执行；pure reminder 直接交正式通知，不创建会话。
5. 沿原 operation identity、executionRef 或通知 intent 对账，分别结算各部分及整体结果。

开始前取消成立后不能启动；已发起停止只表示请求，必须取得真实收场证据。通知补送、结果归档和回执恢复不重做执行。完整流程见[关键流程](key-flows.md)。

## 契约与验证导航

[成员规格](../../../packages/schedule/schedule/SPEC.md)拥有精确状态、命令、API、失败与验收，[成员内部设计](../../../packages/schedule/schedule/docs/internals.md)承接提交、算法、队列及恢复。产品规则沿[产品正文](../../../.meta_harness/design/product/schedules-and-jobs/design.md)，领域消费与组合责任沿[协作设计](architecture.md)。

上层约束见[总体结构](../../architecture/structure.md)、[结果承接](../../architecture/structure.md#执行事实与结果承接)、[控制恢复](../../architecture/runtime/control-and-recovery.md)及[组合验证](../verification.md)。源码无环和文档检查不证明撤权、幂等或断电恢复已成立。

## 后续设计与维护

已确认规则沿唯一终态实施：follow/explicit 与冻结 Job 分开；eligibleLimit/jobLimit 独立且合取；draft/promote/discard 和原子 replace 保留；周期 execution 补跑只用 none/latestN，不保留 pending-first 兼容策略。精确规则与例外见[关键流程](key-flows.md)。

成员须兑现同提交 participant、当前资格守卫、执行查询与真实停止、通知承接、恢复和背压。storage 已有真实 sql-contract/sqlite-provider。Schedule 管理、预测、查询及本地持久化已有实现，Job 接受、扫描、执行与结果协调仍待兑现。提供者限制不能被同进程调用或 Cordis 注入掩盖。实际公开能力与验证边界以[成员入口](../../../packages/schedule/schedule/README.md)为准。

## 正式产品与技术承接导航

[产品正文](../../../.meta_harness/design/product/schedules-and-jobs/design.md)维护来源范围与规则，[能力组](../../../packages/schedule/README.md)维护工程关系，[成员规格](../../../packages/schedule/schedule/SPEC.md)及[内部设计](../../../packages/schedule/schedule/docs/internals.md)承接可实现行为。外部 self-wake 和 handoff 的组合责任见[协作设计](architecture.md#外部产品组合)，不成为核心强制依赖。

函数、并发与时钟消费的守护见[成员函数契约](../../../packages/schedule/schedule/docs/functions-and-coordination.md)及 [verification](../../../packages/schedule/schedule/verification/README.md)。有限模型检查不代替真实执行与协调验证。
