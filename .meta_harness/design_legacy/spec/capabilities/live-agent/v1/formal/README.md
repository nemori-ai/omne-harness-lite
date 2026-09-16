# Live Agent v1 形式化工件

| 性质/条款 | 工件 | 抽象与限制 |
|---|---|---|
| 唯一占位、租户/身份归属、工作归属、过早释放与旧代失效的有限片段 | [Runtime.tla](Runtime.tla)、[RuntimeMC.tla](RuntimeMC.tla)、[Runtime.cfg](Runtime.cfg) | 检查 `Unique`、`IdentityConsistent`、`TenantSafe`、`OwnedWork`、`NoEarlyRelease` 等；不表达 AR-8 的 IAM/attachment 共同门或 AR-15 的真实可选贡献撤除 |
| 条件进展 | [RuntimeProgress.cfg](RuntimeProgress.cfg) | 只在模型列明的公平性与提供者最终响应前提下检查，不能声称无条件活性 |

模型来自旧 `capability.live-agent@1` 当前规范，经新谱系路径重基；旧运行日志不作为新证据。
本基线 safety/progress 已实际运行，精确结果见版本外 [verification](../../verification.md)。
