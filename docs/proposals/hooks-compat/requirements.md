# 需求消费与设计覆盖

[提案索引](README.md) · [映射](mapping.md)

需求工作区快照与[工具执行提案](../tool-execution/requirements.md)相同：HUB 分支
`design/dsh-core-adoption` 提交 `18026b2`（新增 [PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md)）。
正式接受前按[需求维护](../../maintenance/requirements.md#基线保留)固定保留引用。

| 要求及确认范围 | 落点 | 性质 |
|---|---|---|
| [PF-025.C1](../../requirements/product/agent/PF-025-external-hooks-compatibility.md#已确认要求) 兼容外部命令式 hooks；只收紧或选择投影；逐项可查 | [事件映射](mapping.md#事件映射两家共有)、[站点与权力](mapping.md#站点与权力)、[字段映射](mapping.md#输入与输出字段) | HK-1、HK-2 |
| PF-025.C2 来源、主体与失败可辨认；续跑有刹车 | [机制对照](mapping.md#机制对照)、[观察事件](mapping.md#观察事件)、[刹车](mapping.md#stop-续跑的刹车) | HK-3、HK-4、HK-5 |
| [PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) hooks 作为资产成员 | 配置来源行：随资产版本、租户选用与 TG 资格发现 | HK-5 |
| [PF-016](../../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) 版本、启停与在途绑定 | [Cordis 视角](README.md#cordis-视角)：撤登记、abort 与 drain、已生效效果不撤销 | HK-3 |
| [PF-003](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) 工具站点只作用单次调用 | S5 / S7 落点消费 [工具执行提案](../tool-execution/cordis.md#hooks-兼容层在工具站点的落点) | HK-1 |
| [PF-013](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) hook 不扩大为 Session 级停止 | `Stop` 兑现为入队 trigger；`PermissionRequest.interrupt` 需控制权 | HK-1 |
| [PF-012](../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md) 隔离 | 决定 v：兼容层不声称隔离 | — |
| [SYS-OBSERVABILITY](../../requirements/system/observability-and-logging.md) | 每次运行一条 `hooks.run.completed`，经 records 写入 | HK-3 |

未覆盖：子 agent 事件形态（PF-004）、http / mcp_tool / prompt / agent handler、转录导出、
`PreModelSwitch` 守卫，见[未决项](README.md#未决项)。
