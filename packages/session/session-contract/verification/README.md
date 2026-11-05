# verification

本目录承载本包的持续验证资源：形式模型、论证或证明。单次运行的原始输出留任务 tmp，不进本目录。

## 本包资源

[Session frontier 有限模型](models/frontier/README.md)检查历史前缀、冻结解除、PM-02 首输入拒收及权威 gap 隔离接缝。每个模型分别说明性质、有限前提、配置、复跑命令与未覆盖。

[Run 与 attempt 层模型](models/run-advance/README.md)检查唯一推进者、Run 唯一、输入至多承接一次、终态与取消，以及有界收束是否被无关提交饿死。[唤醒模型](models/wake-up/README.md)检查唤醒不丢失与推进失败不静默。两者的运行记录与发现的缺陷见 [formal-runs.md](models/formal-runs.md)，手写证明见 [proofs/run-advance.md](proofs/run-advance.md)。模型通过不等于产品实现符合，也不等于完整组合或无条件证明。

持续义务见 SPEC 的[同日志前缀与归一的持续验证](../SPEC.md#同日志前缀与归一的持续验证)与[持续验证义务与未覆盖](../SPEC.md#持续验证义务与未覆盖)。产品行为验证沿 [tests](../tests/README.md) 的实际资源核对。`proofs/` 有 Run 与 attempt 层的手写证明。

## 维护

被验证承诺变化时，同步对应模型、配置、前提、动作映射及本目录索引。模型和配置字节变化使原结果失去直接适用性；沿实际影响重新验证，不用旧运行证明新版本。
