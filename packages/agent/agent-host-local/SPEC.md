# Agent 具体装配的行为边界

本包承担 Agent 的本地宿主装配。当前根入口及 `./cordis` 仍为空，独立接收组件与完整宿主插件均尚未实现。以下接收组件责任已明确，不能据此声称完整 reserve、实例启动插件或生产 Model 接收方解析器已经交付。领域行为消费 [agent-contract](../agent-contract/SPEC.md)，框架公共保证消费 [agent-cordis-contract](../agent-cordis-contract/SPEC.md)。

## 提供者责任

将 Cordis 依赖适配为通用工厂的纯端口，管理本包持有的服务与资源。计划撤除先完成业务交接，突然失去依赖保留未知和恢复责任，不宣称外部效果回滚。

Agent 本地宿主负责实例保留、协程托管和登记贡献。reserve 不授予推进资格。旧登记身份的撤除不得撤除后继登记。

## 独立结果接收组件

本包须在根入口提供独立接收组件工厂，由宿主装配并持有。纯接收算法由 [agent](../agent/README.md) 的独立公开模块提供，不依赖 `createAgentRuntime`；本包只通过公开入口使用该算法。接收方是 Agent 实例外的常驻角色，实例的 disposer 不持有或销毁它。本组件不新增 Cordis 服务键，不把 `./cordis` 的完整插件标为已实现。

装配者显式传入同一 `AgentReceivedProvider`、`AgentAccessCheck`、原消费绑定的稳定目标查询、`AgentAccountOutlet`、Model 的只读 inspect 与 dispatches、租户容量策略和宿主持有的接收状态。条目与账目出站均为必需依赖，不提供独立存储、吞账目或默认放行实现。received 为 null 时拒绝提供接收能力，不退回 preserve 加 record。原 instance 来自随 Journal 已提交 PendingCall 保存的绑定，不能由当前 attachment 推导。

接收组件逐次核验主体、原调用、consumer、admission 和完整 dispatch 集合，包括 saved 重投。它按 [J02](../agent-contract/SPEC.md#结果接收) 与 Model 原协议的顺序处理拒绝、认回、取消、容量和共同提交。只有收到 committed 的原结果才向 Model 返回 saved。内部共同提交结果与失败须按 [Model 接收结果与失败映射](../agent-contract/SPEC.md#model-接收结果与失败映射)转换，保留原操作、未知、排除和内部诊断。Model 自己取得 ACK，本组件不持有生产者 ACK 权限。

接收句柄须提供 push、recover、retry 和只读待办及诊断查询。宿主显式创建并持有接收状态；Agent 实例重建不清空它，接收组件重装配继续传入同一状态。recover 按 execution 从 received 及材料恢复账目待办。unknown 与 unavailable 保留原 handoff，宿主在可重试待办存在时驱动 retry。denied、conflict 与 invalid 保留为 blocked 待办和具名诊断，不自动重试，重装配也不重新发送。恢复和重试返回剩余待办与诊断，不能以空实现声称成功。

停止只停止本次驱动，不取消已受理的共同提交，不撤回 saved，不删除材料或待办。接收状态的内存实现仅支持同进程接续，不证明断电或跨进程恢复；要求耐久的宿主必须保存该状态。容量、材料、接收与出站的精确行为分别沿 [J02](../agent-contract/SPEC.md#结果接收)、[共同提交](../agent-contract/SPEC.md#接收共同提交)和 [J28](../agent-contract/SPEC.md#账目出站)。

## 验证

独立接收组件须验证租户隔离、原目标在 detach 或实例销毁后仍可取得、每次 push 的权威校验，以及条目和完整材料的共同可见。故障用例须覆盖提交前失败、提交回包未知、原 operation 认回、排除不复活和容量占用。使用 Model 公开 testing pusher 验证 saved 后的 ACK 仍由 Model 完成。

账目验证覆盖全部非 null 账目、迟到修订、同 handoff 重试、blocked 的重装配保留，以及实例重建后继续接收。合一内存提供者须显式执行接收共同提交套件的 required 模式，账目出站须执行其公开一致性套件。上述替身验证不证明生产 Model、磁盘耐久或跨进程恢复。

完整插件实现时另行验证 [装配协议](docs/cordis.md)、依赖撤除与恢复交接。当前骨架测试只检查导出，不代表独立接收组件或完整插件的运行验证。
