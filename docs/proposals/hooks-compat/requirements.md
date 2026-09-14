# 需求消费与设计覆盖

[提案索引](README.md) · [映射](mapping.md)

需求工作区快照与[工具执行提案](../tool-execution/requirements.md)相同：HUB 分支
`design/dsh-core-adoption` 提交 `18026b2`（新增 [PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md)）。
正式接受前按[需求维护](../../maintenance/requirements.md#基线保留)固定保留引用。

| 要求及确认范围 | 落点 | 性质 |
|---|---|---|
| [PF-025.C1](../../requirements/product/agent/PF-025-external-hooks-compatibility.md#已确认要求) 兼容外部命令式 hooks；只收紧或选择投影；逐项可查 | [站点与权力](mapping.md#站点与权力)、[事件映射](mapping.md#事件映射两家共有)、[配置字段](mapping.md#配置字段)、[字段映射](mapping.md#输入与输出字段) | HK-1、HK-2 |
| PF-025.C2 来源、主体与失败可辨认；续跑有刹车 | [机制对照](mapping.md#机制对照)、[观察事件](mapping.md#观察事件)、[刹车](mapping.md#stop-续跑的刹车)、[装配与信任](mapping.md#装配与信任) | HK-3、HK-4、HK-5 |
| [PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) hooks 作为资产成员；撤权影响下一道准入 | 配置来源行；装配者定义与每次触发前重验 | HK-5 |
| [PF-016](../../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) 版本、启停与在途绑定 | [Cordis 视角](README.md#cordis-视角)：ready 条件、撤登记、abort 与 drain、已生效效果不撤销 | HK-3 |
| [PF-003](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) 工具站点只作用单次调用 | S5 / S7 落点消费[工具执行提案](../tool-execution/cordis.md#hooks-兼容层在工具站点的落点) | HK-1 |
| [PF-013](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) hook 不扩大为 Session 级停止；interrupt_then_run 不被白白触发 | `Stop` 兑现为入队 trigger；`PermissionRequest.interrupt` 不支持；[S1 守卫协议](mapping.md#s1-守卫协议)的 interrupt_then_run 例外 | HK-1 |
| [PF-012](../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md) 隔离 | 决定 v 与 U1：兼容层不声称隔离；无沙盒映射时按装配者类别限制 command handler | HK-5 |
| [live-agent v1 执行信任前提](../../../spec/capabilities/live-agent/v1/contract.md) | command handler 的装载条件与进程环境 | HK-5 |
| [SYS-OBSERVABILITY](../../requirements/system/observability-and-logging.md) | 每次运行一条耐久 `hooks.run.completed`，`started` 为非关键诊断 | HK-3 |

未覆盖：子 agent 事件形态（PF-004）、http / mcp_tool / prompt / agent handler、转录导出、
`PreModelSwitch` 守卫，见[未决项](README.md#未决项)。
