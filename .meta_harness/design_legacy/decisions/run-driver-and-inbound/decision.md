# D-012：Run 驱动器与 Session Inbound

- 状态：旧谱系目标设计及有限验证已接受；当前目标 v1 仍为候选。
- 来源：`e3573ca72d18bfe7ddd002df5025551b51eede46:docs/decisions/D-012-run-driver-and-inbound.md`，SHA-256 `44ac6d2cfafb327776bad400617ec892a11b4f61485ade116f0d2a84ef74fb4a`；来源提案为同修订 `docs/proposals/agent-loop-inbound/README.md#接受记录`，研究背景见[循环/事件/hooks 研究](../../research/agent-loop-events-and-hooks/README.md)。
- 接受依据：2026-09-14，任务作者在用户授权正式决定与规格撰写的范围内，结合两轮独立评审接受提案 r3 修订 `6fafacb`。接受的旧精确对象是 `run-driver@1` 与 `session-run@2`，需求基线 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`。

## 保留的选择

1. Agent Loop 是可重建的 Run 驱动：用已提交事实求纯 `decide`，只在安全边界推进；驱动位置可由投影重算，意图才是权威。[RunDriver RD](../../spec/capabilities/run-driver/v1/contract.md)与[Run RN](../../spec/capabilities/run/v1/contract.md)分别拥有推进和耐久状态。
2. 一次 Run 中途异步到达进入 Session 级 Inbound：先耐久受理 arrival，再由独立裁决者按裁决时 Run 状态选 queue、continuation、context 或 control；迟到不能复活已主动终止的 Run。[Session SE-12～17](../../spec/capabilities/session/v1/contract.md)拥有到达与队列，[生命周期组合 LC](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)约束原子交接。
3. waiting/stopping 的占位、epoch 封闭与重取、`waiting_gate` 恢复重做准入，及已出队工作进入 Run 控制，仍是当前恢复边界。连续用户文本、slash command 与 trigger 的排位规则由[Session 队列](../../spec/capabilities/session/v1/contract.md)细化。

## 取代与限制

[D-014](../session-run-agent-lifecycles/decision.md)取代旧 `session-run@2` 与 `run-driver@1` 作为新设计的**精确版本身份**，把前者逐项拆给 Session/Run/生命周期组合并重指后者；未变的拓扑选择继续有效。[D-015](../tool-execution-message-stream-hooks/decision.md)后来引入 Run 等待登记簿、`superseded` 终态和工具结算规则；不能照搬 D-012 的旧 Run 终点或旧等待推导。D-012 的“keyboard command 是即时控制”仅在目标确实是 Session/Run control 时成立；快捷键依现已接受的[命令输入 IN-02](../../spec/capabilities/command-input/v1/contract.md)只触发已存在的命令或业务入口，不获得独立授权通道。

原 RunDriver 有限模型只覆盖记录的三个安全、三个进展配置及否定变体；它不证明当前新 v1 的全组合、崩溃窗口、门恢复生产者或 provider 符合性。旧 `session-run` 身份已退役，不应出现在当前依赖关系中。
