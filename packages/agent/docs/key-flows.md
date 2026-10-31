# Agent 定义与工作推进组的协作入口

定义解释向 assembly 交专有声明；外部协调者供给原工作与推进资格依据；推进协调者向 Context、Model、Tool 和 HITL 请求能力并认回原位置。单成员内部流程由成员拥有，跨组资格和事实交接分别由原责任方维护。

精确流程由[成员协调流程](../agent-contract/docs/flows/scenarios.md)拥有。下表只导航，不复制提交、重试、恢复或状态协议。

| 阅读任务 | 唯一流程位置 |
| --- | --- |
| F-AG01 定义选入和装配结果 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag01-定义选入和装配结果) |
| F-AG02 正常推进及全批拒绝 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag02-正常推进及全批拒绝) |
| F-AG03 整批判断、人工答复和后继出卡 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag03-整批判断人工答复和后继出卡) |
| F-AG04 输入失败与按来源拒收 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag04-输入失败与按来源拒收) |
| F-AG05 统一终态出口及控制范围 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag05-统一终态出口及控制范围) |
| F-AG06 接手原工作及可靠交付两条路径 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag06-接手原工作及可靠交付两条路径) |
| F-AG07 定义换代与在途语义交接 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag07-定义换代与在途语义交接) |
| F-AG08 长期读取、守卫及因果解释 | [成员流程](../agent-contract/docs/flows/scenarios.md#f-ag08-长期读取守卫及因果解释) |
| 协议细化拥有者 | [成员流程](../agent-contract/docs/flows/scenarios.md#协议细化拥有者) |

## 按读者选择阅读路径

下表按读者列出起点、接着要读的页和停止点。精确规则只在各页的拥有者处读取，本页不复述。路径上的页面描述的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。实现状态见[实施差异](../agent-contract/verification/coverage.md#实施差异)。

| 读者 | 起点 | 接着读 | 读到这里就够 | 这些路径不提供 |
| --- | --- | --- | --- | --- |
| 独立调用者：直接调用 Agent，不使用外部协调者 | [消费与系统定位](../agent-contract/docs/context.md#独立消费与外部协调)中独立调用者一节 | [托管协调与运行实例](../agent-contract/docs/public-api/README.md#托管协调与运行实例)的类型形状；流程 [F-AG02](../agent-contract/docs/flows/scenarios.md#f-ag02-正常推进及全批拒绝)与 [F-AG05](../agent-contract/docs/flows/scenarios.md#f-ag05-统一终态出口及控制范围) | 知道 invoke、resume、输出读取与确认、控制的类型与返回，知道 Agent 怎样结束自己的执行 | 业务关联与外部协议。实现与装配 |
| 外部协调者：在 Agent 外部保存业务关联，并参加输入受理与终结 | [外部协调者的前提](../agent-contract/docs/context.md#外部协调者的前提)与[交接清单](../agent-contract/docs/context.md#交接清单) | SPEC 的[提交参加者协议](../agent-contract/SPEC.md#提交参加者协议)、[托管协调与运行实例](../agent-contract/SPEC.md#托管协调与运行实例)和[事件流与读取](../agent-contract/SPEC.md#事件流与读取)；[执行记录与调用方交接端口](../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)；流程 [F-AG06](../agent-contract/docs/flows/scenarios.md#f-ag06-接手原工作及可靠交付两条路径) | 知道自己要保存哪些关联，要提供哪些受理与提交参加，要消费哪些事件与结果 | 该协调者自己的业务协议。它归自己的公开规格 |
| 扩展作者：写 Loop 扩展 | [扩展作者协议](../agent-contract/docs/public-api/extensions.md) | 系统页的[扩展位置与干预力](../../../docs/architecture/runtime/loop-extensions.md#扩展位置与干预力)；SPEC 的[扩展、卡片与材料](../agent-contract/SPEC.md#扩展卡片与材料)和[整批判断屏障与动作准入](../agent-contract/SPEC.md#整批判断屏障与动作准入)；流程 [F-AG03](../agent-contract/docs/flows/scenarios.md#f-ag03-整批判断人工答复和后继出卡) | 知道各位置的输入与合法输出，知道 fresh 与 replay 两种调用模式，知道整批屏障对作者可见的语义 | 位置的触发边界，它归系统页。Agent 内部的恢复与调度 |
| 实现者：实现通用 Agent、提供者或适配器 | [agent 架构入口](../agent/docs/architecture/README.md) | [Loop 完整算法](../agent/docs/architecture/loop-algorithm.md)、[内部机制](../agent/docs/architecture/mechanisms.md)、[通用工厂](../agent/docs/public-api.md)和[开放问题](../agent/docs/architecture/open-questions.md)；[实现交接与接受事项](../agent-contract/verification/coverage.md#实现交接与接受事项)与[持续验证场景](../agent-contract/verification/scenarios.md) | 知道要实现的节点、机制与配置，知道已知差异与外域依赖，知道每组场景的验收目标 | 公开行为规则。它归 SPEC |
| 装配者：把 Agent 装进 Cordis 或其他宿主 | [Cordis 服务定义](../agent-cordis-contract/docs/cordis.md) | [本地宿主装配](../agent-host-local/docs/cordis.md)；[通用工厂](../agent/docs/public-api.md)的工厂配置；[Cordis 集成约定](../../../docs/architecture/cordis-integration-conventions.md)；[本域尚未定义的装配问题](../agent/docs/architecture/open-questions.md#保留的专题边界)；[外域依赖](../agent/docs/architecture/open-questions.md#外域依赖) | 知道服务键、依赖、配置与撤除方式，知道缺少提供者时的失败路径，知道哪些依赖尚无提供者，知道哪些本域装配问题尚未定义 | 各依赖领域的内部设计 |

## Tool 普通调用与恢复

Agent 先保管完整原 ToolInvokeRequest facts，再提交 intent、固定材料引用与原消费位置，随后调用 Tool 普通 invoke。Tool 证明调用身份后保存 associated，未知关联保留 intent。历史未知后的 rejected 保留原 pending、完整请求、consumer、effect intent 与 open 屏障，不建立竞争 denied，不让 T3/T5 判完成；认回原受理后沿原槽位保管与解除。consumer 投影、四种 invoke 结果与控制迟到引用的唯一行为源是 [Agent SPEC](../agent-contract/SPEC.md#tool-调用关联与控制引用)，节点次序归 [Loop 算法](../agent/docs/architecture/loop-algorithm.md)。Model 保持受理前引用与原恢复规则。A2/T0 和生产提供者组合仍待实现。
