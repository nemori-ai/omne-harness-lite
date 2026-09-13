# 候选验证范围

对象为本提案的 [Binding.tla](../../../spec/compositions/agent-session-binding/v1/Binding.tla)、[配置](../../../spec/compositions/agent-session-binding/v1/Binding.cfg)、
[组合正文](../../../spec/compositions/agent-session-binding/v1/contract.md)及[场景](../../../spec/compositions/agent-session-binding/v1/scenarios.md)。模型和正文的
受审字节由[快照清单](evidence/candidate.json)标识；实际命令、工具 JAR 哈希、
配置、退出码及原始输出见[模型结果](evidence/model/results.json)。

## 模型与义务的映射

| 性质 | 契约及覆盖 | 边界 |
|---|---|---|
| TenantBound | CB-01/04，B01：调用租户与 Session 所属租户匹配 | 不建模自然人/成员、完整 IAM、存在性泄漏 |
| SlotExact | CB-03/04，B04：准备至释放仍独占同一 Session | 一个逻辑权威、有限 AgentRef；非跨进程选主 |
| PublicationSafe | CB-02/03/05/06/13/14，B02/B03/B12 的准入：当前授权、资格、修订、必要依赖共同判定 | 发布动作是待实现的原子边界；不证明真实锁、远端缓存、租约或 Cordis 插件已兑现 |
| AttachmentExact | CB-07，B08：附着登记精确到原尝试 | 不模拟持久化 RPC 的重复/丢失；旧释放的错误键可由突变暴露 |
| DisposedIsClean、QuiescentIsSettled | CB-04/08/10/12，B05/B07：等待准备、工作与实际清理；晚到资源不遗失 | 模型中未知可无限保持；不推导所有后端最终成功或自动故障恢复 |
| TransferAccounted | CB-11，B09：目标确认前不结算移交 | 确认抽象了接管与旧资源独立；具体工具/HITL 协议尚需设计 |

正常配置枚举 1 个 Session、2 个永不复用的 AgentRef、2 个调用租户、一次可恢复
的 Session 资格变化、授权撤销、必要依赖失效、一个工作及其移交。Agent 阶段
沿 D-005；资格修订在预留时捕获，抽象准备尝试遇资格变化后不可复活的约束。
准备返回可与关闭任意交错；失败/未知清理不丢弃资源，显式核实后才继续。

状态图允许停顿和永久未知，本次检查为有限安全性探索。原 live-agent v1 的
有公平性前提的退出模型继续适用；这里没有新增无条件活性保证，也未建立两个
模型的机械 refinement 证明。所有尚未覆盖的真实场景逐项保留在规范场景中。

## 实际反例验证

正常配置必须退出 0 且完整探索无错误。以下独立故障配置必须退出 12 并命中
指定不变量；语法错误、超时或其它失败均不算预期反例。

| 突变 | 注入错误 | 应命中的不变量 |
|---|---|---|
| authorization | 发布时跳过当前权限 | PublicationSafe |
| eligibility | 发布时跳过 Session 资格及修订 | PublicationSafe |
| revision | 资格恢复后忽略附着的旧修订 | PublicationSafe |
| dependency | 必要依赖失效仍发布 | PublicationSafe |
| tenant | 按错误租户预留 | TenantBound |
| earlyRelease | 关闭后未结算便撤销占位 | DisposedIsClean |
| staleRelease | 旧释放仅按 Session 键删除新登记 | AttachmentExact |
| handoff | 未确认接管便减去原工作 | TransferAccounted |

每个故障配置及完整轨迹均在 [model](evidence/model/results.json) 所列相邻文件。
可从仓库根用记录中的参数数组重放，设置实际 `JAVA_BIN`、`TLA2TOOLS_JAR`；
把 `-config` 换成对应 cfg，并核对退出码和预期不变量。正向任务在正式化时纳入
`spec/formal-tasks.json`，故障配置留在证据目录，不作为需要成功的正常任务。

## 其它已执行与未执行

[需求恢复记录](evidence/requirements-baseline.json)从不含 main/开发分支的独立
bare 仓库读取原 bundle，核对 38 份需求/提示词输入与本轮检出相同。复用原保留
tag 和 bundle，未推送远端。

历史源模型搬迁后，原 4 个形式任务重新通过；接受的 identity/live-agent v1
规范字节不变。文档链接与冻结基线检查另记录在评审/交付结果中。未改产品源码、
开发工具实现或依赖；本轮不把已有上游测试当作目标组合的实际提供者符合性测试。
