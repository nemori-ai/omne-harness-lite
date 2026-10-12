# 工具执行的有限协议模型

当前形状与行为归[公共SPEC](../../SPEC.md)。Execution.tla及配对cfg只检查有限执行、终局、交付、等待序号与恢复关系。原模型和cfg输入保持；注释中的坐标不构成中央权威。

Execution.cfg为安全/时序正配置，ExecutionProgress.cfg为显式公平性下的有限进展配置。NoFirstWins、VolatileHandoff、StopBeforeWrite、PartialRecovery、RestartOnRecover、NoWaitIndex分别松开一处保护；预期目标反例由对应cfg所选断言判断，不能把任意非零或超时算成功。

模型不证明真实租户授权、SQL同提交、外部作者至多启动一次、物理停止、无限等待或环境最终可用。消息占位/Run前后台与执行状态是不同投影；当前工具核心不以切后台创建新执行或释放并发额度。当前TE20以后日志、context读与管理关闭增量未由该模型表达，需各自测试和真实组合验证。

从本目录用TLC执行模型与相应cfg。运行输出、预算、公平性和判读放工作树tmp；文件存在或输入相等不表示本次执行通过。
