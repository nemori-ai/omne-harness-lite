# Session 契约流程

本目录把[运行契约](../../SPEC.md#运行契约候选)的条款展开成协议级流程：谁参加、按什么顺序调用哪个操作、每一步写哪条日志事实、失败时各方停在哪里。流程不新增条款。每条流程链到它依据的条款，条款仍是唯一的行为源。

## 阅读顺序

1. 先读 [SPEC 的五个锚点](../../SPEC.md#五个锚点)与 [Session 与 Agent 的同一日志](../../SPEC.md#session-与-agent-的同一日志)。全部流程以这两节为前提。
2. 再读组根的[跨成员流程 F-SE01 至 F-SE10](../../../docs/key-flows.md)。组根写各成员怎样分工，本目录写契约层的操作与事实。
3. 然后按 [scenarios](scenarios.md#编号表) 的编号表选读 F-SC01 至 F-SC16。每条流程的开头列出它细化的组根流程与依据的条款。F-SC01 至 F-SC10 沿 Session 与 Agent 的协议，F-SC11 至 F-SC13 是三条读路径，F-SC14 至 F-SC16 是冻结、引用查询与作用域释放。
4. 操作的形状在 [public-api](../public-api.md)，事件的含义在[事件目录](../object-model/session-log-events.md#原生事实类别)，守卫与完整结果在[状态转移页](../object-model/session-state-transitions.md#命令守卫与完整结果)。流程只引用它们，不复述。

## 流程适用范围

- 流程描述 Session 与 Agent、Model、Tool、存储提供者、读取者之间的协议。参与者是逻辑角色，不表示部署、进程或共同寿命。
- 时序图给出阅读次序与分支，不是算法证明，也不穷举并发交错。并发裁定按条款的「并发裁定」列与[共同提交与共享事务域](../../SPEC.md#共同提交与共享事务域)。
- 「提交」在图中指一次权威提交。提交结果未知时各方按 [PA-05](../../SPEC.md#pa-05) 与 [PA-07](../../SPEC.md#pa-07) 认回，不改写为失败或成功。每张图的未知分支都遵守这条规则。
- Session 只在 Agent 已有的四种调用方交接上作为提交参加者。其余 Agent 事实由 Session 从同一会话日志里的 Agent 条目解释派生。流程里的「参加」「冲突」「失败」「不支持」沿 Agent 契约的[提交参加者协议](../../../../agent/agent-contract/SPEC.md#提交参加者协议)。
- 流程只用契约已经定义的操作名。Agent 一侧的操作名沿 Agent 契约的[托管协调与运行实例](../../../../agent/agent-contract/SPEC.md#托管协调与运行实例)与[事件流与读取](../../../../agent/agent-contract/SPEC.md#事件流与读取)。
- 流程存在不表示实现、提供者或验证已经完成。

## 缺项与持续验证入口

契约没有写的内容在流程里标为「契约未定」，并在下表汇总。流程不替它们补规则。

| 契约未定的内容 | 出现在 | 当前拥有者或去向 |
| --- | --- | --- |
| 压缩转换在协调者一侧的唯一提交点 | [F-SC03](scenarios.md#f-sc03-压缩转换的共同提交与-epoch-新代) | [明确缺项](../../SPEC.md#具名前提与明确缺项) |
| 宿主失联判断的证据形状 | [F-SC09](scenarios.md#f-sc09-推进映射与换代) | Agent 宿主 |
| 「推进资格已被取代」的参加者冲突映射为 `stale-advance` | [F-SC09](scenarios.md#f-sc09-推进映射与换代) | Agent 拥有者，见[明确缺项](../../SPEC.md#具名前提与明确缺项) |
| 迟到账目与收场的读取资格（P-3） | [F-SC10](scenarios.md#f-sc10-迟到结果与终态后的后台结果) | Model 与 Tool 的拥有者 |
| 时间线显示哪些事件种类 | [F-SC11](scenarios.md#f-sc11-时间线投影与在途收敛) | `session` 投影与公开接入的策略配置 |
| 在途通道的订阅入口（订阅 Agent 句柄，或直接观察生产者） | [F-SC11](scenarios.md#f-sc11-时间线投影与在途收敛)、[F-SC12](scenarios.md#f-sc12-流到日志) | Agent、Model、Tool 契约与公开接入 |
| 助手消息的条目怎样关联原调用（`AdmittedMessage.consumption` 只在工具消息与后台占位消息上非空） | [F-SC11](scenarios.md#f-sc11-时间线投影与在途收敛) | message 包与 Agent 的消息形成 |
| 中断回复的消息形状与标记 | [F-SC12](scenarios.md#f-sc12-流到日志) | message 包与 Agent 的消息准入 |
| 在途项的调用键中「本次发出」一级的来源 | [F-SC12](scenarios.md#f-sc12-流到日志) | Model 契约 |
| Tool 常驻规则与采用点判定；应用装配的显式 tenant Reader 桥接（P-8） | [F-SC14](scenarios.md#f-sc14-会话冻结)、[F-SC15](scenarios.md#f-sc15-引用查询) | Tool 与应用装配拥有者；Session 只消费候选采用材料 |
| 执行环境重启到重新释放之间的窗口 | [F-SC16](scenarios.md#f-sc16-作用域释放与换代后重新释放) | 执行环境契约拥有者与工具宿主，见[明确缺项](../../SPEC.md#具名前提与明确缺项) |

条款一侧的前提与缺项见 [具名前提与明确缺项](../../SPEC.md#具名前提与明确缺项)。每条流程对应的验证义务见 [候选的持续验证义务](../../SPEC.md#候选的持续验证义务)与[持续验证义务与未覆盖](../../SPEC.md#持续验证义务与未覆盖)。产品旅程与流程的对应见 [关键旅程对应与验证](../../SPEC.md#关键旅程对应与验证)。
