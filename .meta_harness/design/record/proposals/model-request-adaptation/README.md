# 模型请求适配与独立纵线补齐

本包接续模型请求运行时与 pi-ai 传输的已接受设计，记录公共实现、家族规则和模型窄定义的演进选择。用户已确认实施目标；本包具体机制与新规格仍是候选，不以任务授权冒充规格接受。

- 输入：`capability.model-request-runtime/v2`、`data.model-profile/v2`、`data.messages/v3`、`data.model-response/v3`；既有实现映射与 D-019/D-063 的复用边界。
- 本次范围：独立函数、37 个官方模型、策略版本绑定、声明式自建档案、诊断、单机真实验收装配。完整 Agent Loop、工具执行、中心与据点同步、任意租户代码隔离不在范围内。
- 持续消费者：本轮规格候选、model-request-runtime/pi-ai-transport 提供者和独立验收装配。
- 共有脱敏构件的候选比较见[credential-policy](credential-policy.md)，限定技术采用归[D-093](../../decisions/model-credential-policy-adoption/decision.md)；全S-20及实际头交接未放行。
- 真实身份阶段启动循环的三个接线选择见 [auth-bootstrap](auth-bootstrap.md)；精确采用归 [D-092](../../decisions/model-auth-bootstrap-adoption/decision.md)，应用和符号守卫仍待真实实施验收。
- 方法限制：本会话已阅读机制，补充领域读数不满足双盲；下列性质不是独立盲测结果。

| 问题 | 入口 |
|---|---|
| 哪些保证新增、由谁承担 | [设计正文](design.md) |
| 共用实现及模型插件怎样选择 | [候选比较](alternatives.md) |
| 独立评审与处置 | [评审记录](review.md) |
| 已发出响应按实际提交顺序判定 late 的三种演进方向 | [迟到结算候选比较](late-coordination.md)，选择记录见 [D-081](../../decisions/model-late-coordination-direction/README.md) |
| JSONL 健康打开与不可信物理重启恢复的识别信号 | [恢复识别三候选](log-recovery.md)，精确技术采用见 [D-085](../../decisions/session-log-recovery-projection-adoption/README.md) |
| 多值响应头表示与独立函数事实交接 | [两轴候选比较](header-handoff.md)，MR5／RT5仍待精确采用与真实链验收 |

排期、执行负责人和实时状态留在任务区；本包不维护第二份实施计划。
