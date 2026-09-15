# Live Agent v1 形式化工件

| 性质/条款 | 工件 | 抽象与限制 |
|---|---|---|
| AR-4～AR-16：唯一占位、发布屏障、工作结算、退出与提供者撤除 | [Runtime.tla](Runtime.tla)、[RuntimeMC.tla](RuntimeMC.tla)、[Runtime.cfg](Runtime.cfg) | 小有限域行为模型；IAM、真实 I/O、进程崩溃和资源实现被抽象 |
| 条件进展 | [RuntimeProgress.cfg](RuntimeProgress.cfg) | 只在模型列明的公平性与提供者最终响应前提下检查，不能声称无条件活性 |

模型来自旧 `capability.live-agent@1` 当前规范，经新谱系路径重基；本轮保持模块正文，未把旧运行日志当作新证据。
Java/TLC 不可用时只登记与静态核对，实际运行状态见版本外 [verification](../../verification.md)。
