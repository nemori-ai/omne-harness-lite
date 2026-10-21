# Session 消费与系统定位

本页按 #343 的文档主题组织 #342 候选。图表投影现有设计，不改变采用范围，也不表示运行实现或真实提供者验证已完成。

## 系统位置与消费入口

本包面向内部接入协调者、Agent、恢复者及其他领域的提交参加者，承担会话工作身份、日志、当前推进资格、原消费位置和逻辑终态。以下图示只投影本包消费关系，系统保证仍归[运行架构](../../../../docs/architecture/runtime/README.md)，组内责任归[组入口](../../README.md)。

```mermaid
flowchart LR
  Access[接入协调者] --> Session[SessionService]
  Agent[Agent] --> Session
  Recovery[恢复者] --> Session
  Session --> Transaction[同提交提供者]
  Model[Model 发起参加者] --> Transaction
  Tool[Tool 发起参加者] --> Transaction
  Session --> History[日志与原位置]
```

独立消费与 Harness 接入的候选形状见 [public-api](public-api.md)，当前实际导出与候选分开标明。独立包消费使用显式 SessionService 及其注入能力，不要求 Cordis。可靠状态仍须由相应提供者兑现。装配依赖和资源撤除见 [Cordis](../../session-cordis-contract/docs/cordis.md)。

## 原消费场景的前提

本页消费[工作契约候选](public-api.md)，不提供生产实现或接受声明。Session 的权威治理与 Model/Tool 的真实执行分别验证；SDK/server 入口继续由 #318 承接。

## 一轮正常推进

接入先经 management.create 保存合法创建和初值，完成具名初始化项。普通输入通过 work.accept 保存内容和去处。Agent 的协调宿主取得 readWork，向 startRun 提交当前合法采用和原初始位置。Session 在一次提交中选定全部首批输入、Run 和首次 advance，返回固定批界。

Agent 用 readBatch 按固定批次读取全部原消息，再按自己的纯决定准备原动作，bindCall 保存稳定生产者身份、固定请求及 consumer。Model/Tool 在自己的受理点读取 Session 参加者的当前守卫，实际发送/启动还须按原执行边界核验。登记不是已经发出。绑定后退出而尚未受理时，接手者用 readRequest 取得原精确请求，认回原受理状态后才能继续同一调用。

原执行收场后，当前合格消费者可以先 preserveResult 保存保管责任，或在生产者继续保管时完成处理并 completeConsumption。得到相应耐久证据后，调用 Model ACK 或 Tool releaseDelivery；reconciliation.receive 认回其真实确认。不能在发出请求时提前标 confirmed。

本轮完成候选经 Agent 的终态前判断，再由 finishRun 与当前待输入、等待和模式一起裁定。唯一终态成立后才运行终态后置扩展。后置扩展不能反转终态。

## 换代与控制

```mermaid
sequenceDiagram
  participant Old as Old Agent
  participant S as Session
  participant New as New Agent
  participant M as Model or Tool
  Old->>S: bind original call
  Old->>M: admit original call
  S->>S: commit handover and revoke old advance
  New->>S: read original recovery state
  New->>M: inspect original call
  M-->>New: real state or unknown
  Note over Old,M: Old Agent exit does not own producer lifetime
  New->>S: preserve or complete original consumption
```

图中换代已满足旧执行者排除/交还与新资格条件。恢复不能只凭目录为空或最大 attempt 序号取得推进权。M 返回 unknown 时 New 保留原 call，不发替代请求。

| 初始条件与交错 | 必须结果 | 权威责任 |
| --- | --- | --- |
| 两个协调者同时 startRun | 只准一个非空首批/Run/首次 advance；另方认回或报告条件变化 | Session 原子提交 |
| T1 读取期间新消息受理 | 本批成员固定，新消息留下一合法批次 | Session 输入批界 |
| 同一输入回执丢失后重提 | 原 operation 同内容认回，不新消息/Run；新独立 operation 的同文仍是新输入 | Session 原操作唯一性 |
| 新 attempt 生效后旧者提交 bindCall | stale-advance，不产生新发起责任 | Session 及生产者守卫 |
| 取消先成立，reload 候选随后校验完成 | 保留 cancelled，拒绝迟到换代，不复活原 Run | Session/采用源 |
| 已归档前收到普通输入，回执晚到 | 原受理与后续取消均可查，不能声称未曾受理 | Session 提交/控制 |
| Agent 退出，Model/Tool 还运行 | 恢复原等待，不因旧 Agent 卸载停止生产者 | 独立宿主及 Session 关联 |
| Run 已终态，原结果迟到 | 可依法保管/补账，不获旧推进权；是否新工作由仍有效原投递资格决定 | Session/原消费者 |
| 归档后撤销归档，旧结果迟到 | 旧已取消业务不重新入队，原事实仍保留 | Session 原取消事实 |
| 保管成功，生产确认未知 | 保管责任继续，从原 operation 查认 ACK/交付解除，不新领已清理 Model 全文 | 双方原操作协议 |
| 历史过滤后空页但扫描未结束 | 返回扫描进度及 next，不能误报历史结束 | SessionHistory |
| 权威日志缺批或未知相关类别 | 隔离受影响会话，不能发布部分治理状态或空队列 | Session 解释提供者 |
| 休眠会话有合法 Run 外调用 | bindExternalCall 保存原关联，completeExternalConsumption 完成原位置；不造 Run/attempt | Session 与实际消费者拥有者 |
| Tool 控制提交后、传播前退出 | loadRecovery 给出原 stop-call 或 background-tool 意图，不能仅按 target 猜测 | Session 控制责任 |
| 父归档提交后子方不可达 | 原 childOperation、目标和 archive 意图持续可恢复，回执核验后才解除 | Session 级联责任 |

## 资格与输入分类检查

principal、tenant、Session/Run/attempt、原操作及当前动作参数显式传入。固定定义与请求被可靠保管。Session 不保存接续值，只保存指向 Agent 权威记录的执行引用（[值与结果项的约束](../SPEC.md#值与结果项的约束)）。当前权限仍由参加者在提交/实际发起点核验。identity/evidence/transactions/clock/idle/context 是构造能力，notifier 是调用期可选取得，页容量属于纯配置。Context 与 Fiber 不进入这份业务数据契约。

SESSION 的 root 操作没有公开 append(events) 或直接修改推进布尔的方法。recordProgress 的 Agent 材料须经精确 schema 和原位置验证；未知 JSON 不能得到可信结论。原生产 facts 同样验证原 source，不让任意调用者自报工具完成或 Model ACK。

类型消费只验证参数和返回形状。唯一推进、输入批界、原操作未知、终态竞争、实际外部动作及跨进程提交需另有模型和提供者证据。状态图、静态类型和文档链接均不证明断电耐久或授权源已经实现。

## 空闲维护与原提交通知

自动归档关闭时，恢复协调者也可 inspectIdle，取得带时钟来源、完整子方/调用覆盖的观察，再以原 operation 和 expected 提交 recordIdle。回执未知时查询该 operation；重启读取 readWork.idle，保持已确认起点。开启自动归档后，将该记录的 CommitReceipt.source 交 considerAutoArchive，后者重新核当前配置和全部相关事实，不能仅比较时间。新子方或 Run 外工具在两步之间受理时，旧覆盖失效；recordIdle 返回 changed，或归档裁定返回 not-due。来源不明返回 unavailable，不能认定空闲。

R1 完成后 notifier 延迟，R2 已提交。通知仍传 R1 回执的 revision/source；不能通过 readWork 取 R2.source 给 R1 使用。通知失败不回滚 R1，扫描按原持久事实接续。

首次添加 Context 块时，接入准备绑定原 operation 的未生效变更材料，调用 Session.change。Session 共同提交注册与恢复事实后，Runtime Context 才消费该决定。Session 返回拒绝不改变注册；返回未知则查询同 operation，不能先注册再补日志。更新/移除同样由 Session 提交，并核材料所引用的前注册仍是当前版本。

## 与 Agent Loop 的分界

Session 的协调器与调度器只在 Agent 执行之外决定三件事：何时开始、何时续入输入、何时恢复。执行之内的一切归 Agent。所以它们不构成第二个 Loop。条款见 [SPEC 的运行契约候选](../SPEC.md#运行契约候选)，系统层说明见[协调器与调度器](../../../../docs/architecture/runtime/session-and-run.md#协调器与调度器)。

| 事项 | Agent 拥有 | Session 拥有 |
| --- | --- | --- |
| 推进 | 一个执行内的 Loop 节点、等待与唤醒，挂接的交还与接续 | Run 的业务状态：何时开 Run、何时承接输入、何时成立终态 |
| 等待 | 执行内对模型、工具与卡片的等待 | 跨执行的等待位置与资格：原等待、人工答复的分流 |
| 恢复 | 执行的对账与原节点接续；提供查询、读执行记录与接续 | 发现哪些会话要恢复、何时扫描、怎样退避 |
| 控制 | 控制在执行内的处置，以及向 Model 与 Tool 的传播 | 控制意图的保存、范围解析、传播责任与对账、终态时点 |
| 终态 | 执行的结束 | Run 的 completed、failed 或 cancelled，与 Agent 的条件终结在同一次提交中成立 |
| 输入 | 输入水位线与批次读取 | 受理、分流、待处理资格与批界 |
