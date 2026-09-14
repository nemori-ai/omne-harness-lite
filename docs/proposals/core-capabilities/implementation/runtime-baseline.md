# 最小运行节点的范围选择

原选择固定在 `1368c52b7255e16e9c2fcde30eebca6f870679f7`：在完整 M1/M2 之前，
先以确定性驱动验证真实身份、Session/Agent、当前授权、本地预算、JSONL/
共同准入、诊断与多命令工具的 allow 链路。选择缩小交付节点，保留真实资源、
失败与恢复保证；不能用替身或无条件放行取得可运行外观。

这一范围被 [D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)
引用，用于限定诊断目录所服务的首批消费范围。完整观测读面、模型费用接入与
OpenRouter 流程仍属后续能力，原 [M1/M2](scope.md) 和 [A01–A32](acceptance.md)
的含义没有改变。缺席的 ask 路径必须明确不可执行。

当前唯一装配与五项行为验证范围归
[local-harness 设计](../../../../apps/local-harness/design.md#可依赖的行为)；共享设施的
当前接口沿该设计链接至提供包。本节点尚未交付，设计接受或源 baseline 可消费
均不等于目标应用可运行。会话停止、排期与交接操作属于临时施工材料。
