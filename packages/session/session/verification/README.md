# verification

本目录承载本包的持续验证资源：故障场景、模型、论证或证明。

## 允许的内容

[fault-scenarios.md](../docs/fault-scenarios.md) 的故障场景，`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。场景与模型是后继实现必须通过的可观察结果，不是已运行的证据。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步场景、模型、证明与本目录 `index.md`。[SPEC](../SPEC.md) 的机制条款或[会话契约](../../session-contract/SPEC.md)的条款编号变化时，先改场景表的「条款」列。

## 本包事实

- 故障场景在 [fault-scenarios.md](../docs/fault-scenarios.md)：组 A 输入绑定与 Agent 终结的共同提交，组 B 推进映射与重装配交接，组 C 日志、消费责任与恢复投影，组 F 会话冻结。崩溃矩阵在 [SPEC](../SPEC.md#cr-崩溃矩阵)。
- 机制自有的验证义务在 [SPEC 的 VM 表](../SPEC.md#vm-机制的持续验证义务)；契约的验证义务在[会话契约的 VC 表](../../session-contract/SPEC.md#候选的持续验证义务)。
- `models/` 与 `proofs/` 目前没有内容。候选的形式模型是 Run 两层状态机与 `claim` 到 `resume` 之间的窗口，尚未立项。
- 没有可运行的验证资源。根入口为空，当前测试只检查入口为空。
