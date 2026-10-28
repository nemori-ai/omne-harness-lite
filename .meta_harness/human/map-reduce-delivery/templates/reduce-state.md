# Reduce 状态与监督模板

完整状态归[负责人状态](../../../../docs/engineering/map-reduce-states.md)，监督语义归[集成清单](../../../../docs/engineering/integration.md#等待监督)。

- <repo/milestone/wave、owner/epoch、phase/control、F/plan revision>
- <当前 roster、每请求 outcome/state、原 head/候选 head/base/merge、activeWrite>
- <pendingOps、稳定身份、实际回执、未知窗口、恢复点>
- <接收游标、处置位置、积压清单、原 shell tool-session 和续挂输入>

| 监督类别 | 活动对象、来源、期限 | 观测/证据 | 已处置与后续等待 |
| --- | --- | --- | --- |
| 交接与积压 | <ready/blocked/failed> | <事实> | <动作> |
| 申请 Action | <精确 request/head/run/attempt> | <事实> | <动作> |
| 候选及目标轨道 | <PR/head/base/check/review/ref> | <事实> | <动作> |
| 发布审批与合入 | <gate/deployment/权限> | <事实> | <动作> |
| 自有代理与本地检查 | <tool-session/进程/预算> | <事实> | <动作> |
| 接收监督基础设施 | <进程/连接/文件/游标/凭证> | <事实> | <动作> |
| 预期项与期限 | <开波明确期限及 roster> | <事实> | <动作> |
| 收口与下一波就绪 | <后继卡/delta/接受/release/close> | <事实> | <动作> |

- 提问前三问：<里程碑必要性、复杂度、自主可决策性结论/证据；剩余人类决定和冻结范围>
- 初始派发：<每线 GENERATED/VALIDATED/OPENED_FOR_HUMAN/FORWARDED_REPORTED/CLAIMED_READBACK 分别证据；queued 单列>
- 非成功处置：<旧执行停写、交权、takeover/rescope/redispatch 读回和 remaining responsibility>
- 收口链：<验证→后继卡→全线 delta→接受→最终记录→关闭，各步骤稳定操作与读回>
- 已停止对象与撤销检查：<仍需保留项，unknown 不能记健康>
