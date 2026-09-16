# D-005：以受管能力构成 Agent 运行时

- 当前状态：已接受；实现、装配和验证状态分别核对，不由本决定自动升级
- 来源修订：e3573ca72d18bfe7ddd002df5025551b51eede46
- 来源决定：docs/decisions/D-005-agent-runtime.md
- 来源 SHA-256：60caac8fa7fe25f097e6570b3bad53a85b1426284d68c2753cf256d5a2185a86
- 接受日期：2026-09-13
- 实际接受依据：用户授权从 Cordis 视角正式建模；任务作者在明确的复用、维护和阶段边界内接受技术选择，独立评审不代替接受。

## 选择与范围

1. 以 Cordis Context、服务、插件、依赖、作用域和受管生命周期组织装配；项目维护的 agent fork 负责活体实例协调与资源生灭。
2. 长期 SessionRef 与活体 AgentRef 分离，旧生命期引用不重定向；操作显式校验 tenant 和当前权限，Context 与因果归因不授权。
3. 逻辑协调权威在准备前独占预留，真实资源清理后才释放；通知失败不否决已提交事实。
4. 工作保持实际绑定；提供者换代遵循关准入、排空或合法移交、清理、重新激活。失败保留残留责任，自关闭不等待自身。

适用范围：单机 Agent 运行时的身份、受限入口、装配绑定、独占激活、工作归属和退出。

## 需求消费基线

原接受消费 `f580718295daaec0f42d3262643e95281c493063` 的确认需求；逐项旧覆盖记录为
`e3573ca:docs/proposals/agent-runtime/v1/requirements.md`（SHA-256
`fdbd45997603d15d3204c76f0c6f89c2b0d45214ead776d474ba9643208173c6`）。
本决定回应[系统约束](../../requirements/system/constraints/requirements.md)、[动态能力分离](../../requirements/system/fully-dynamic-system/requirements.md)、
[运行态连续性](../../requirements/system/runtime-state-and-continuity/requirements.md)及
[Session/Run 控制](../../requirements/product/PF-013-session-run-lifecycle-and-pending-input-control/requirements.md)中与身份、实例和绑定相关的部分；
完整 Session/Run 状态、持久恢复、后台接管、插件隔离和分布式执行权仍由各自能力承担。
当前需求的具体版本与变化由 requirements family 拥有，旧消费基线不自动升级。

## 理由与保留前提

显式占位、绑定和提供者使用关系保护租户隔离、同 Session 唯一激活、旧引用安全与动态替换。

当前规格为运行身份与活体 Agent，系统视图见 Agent Runtime。

## 新基线等价采用

用户已授权将获批准的旧设计按统一新 v1 谱系等价迁入，并在独立评审后直接正式化。
以旧批准修订 `e3573ca` 与目标 F 规范资源 `25238d8` 为比较对象，独立架构及规格评审确认
ARI-1～ARI-5、AR-1～AR-17 无语义改变；需求消费基线和有限 TLC 证据的表述已在 `506ae85`
收窄。`923ad7c` 记录的当前消费者采用及 `344cf2e` 的精确依赖复核补足发布链。
因此本决定接受新基线 `data.agent-runtime-identity@1` 的 ARI-1～ARI-5 与
`capability.live-agent@1` 的 AR-1～AR-17；精确资源由 catalog 和 frozen 清单界定。
core-agent 提供者中的审计耐久门仍是候选扩展，不属于本次接受；真实实现和装配符合性仍未证明。

## 取代与影响

D-007 细化跨提供者附着；D-012 至 D-015 补充 Session、Run 和工具等业务能力，没有取代活体身份与退出边界。

原决定、旧评审和旧实现证据只证明其记录的对象与时点。当前规格采用、提供者符合性、应用装配与发布仍须分别引用实际
catalog、review、formal execution、provider conformance 和 release evidence；本包不会把这些状态合并为“已交付”。
