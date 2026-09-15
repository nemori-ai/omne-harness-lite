# Agent/Session Binding v1 形式化工件

| 性质/条款 | 工件 | 抽象与限制 |
|---|---|---|
| CB-02～CB-14：共同提交、撤销竞争、附着释放、移交确认和依赖撤除 | [Binding.tla](Binding.tla)、[Binding.cfg](Binding.cfg) | 单逻辑协调权威的小状态空间；具体 IAM、存储事务、跨进程故障接管被抽象 |

模型来自旧 `composition.agent-session-binding@1` 当前规范并保持语义；本轮未携带旧执行日志。
TLC 实际执行与工具版本须记录到版本外 verification；模型文件存在不代表检查通过或真实提供者符合。
