# Agent 定义与工作推进的角色与交接

本页保存已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)采用的技术设计。采用不等于阶段选择或实现支持。成员已初始化。声明判断已有实现，推进运行接口和验证仍待完成。

## 拥有者与输入

Agent 能力拥有定义专有声明、Loop 求值、推进协调和扩展位置协议。共同资产持有、版本、同标识来源与锁定由资产治理提供；共同权限与准入由授权责任提供；装配求值和有效构成切换由 assembly 协调；Session 拥有逻辑工作、推进资格、输入承接及终态。

| 事实 | 拥有者 | Agent 的使用关系 |
| --- | --- | --- |
| AgentDefinition 的类型、依赖、继承声明与工作规则 | Agent 能力 | 校验专有含义，向装配提供可解释声明 |
| 定义的持有、发布版本及替换资格 | 资产治理 | 读取合法版本，不建立第二份资产注册权威 |
| Session、Run、attempt、输入承接及逻辑终态 | Session 治理 | 会话适配器映射当前资格与输入，并参加本域终结的共同提交 |
| 清单、当前采用值与结构换代 | 装配交接 | 消费已校验依据，交出原进度与等待 |
| Loop 下一步与已采用扩展判断 | Agent 能力 | 保留规则依据及原求值位置 |
| 模型与工具原调用、收场、费用和实际效果 | Model 与 Tool | 发起、等待、可靠承接，不拥有执行寿命 |
| 数据注册、当前 Context、请求输入投影 | Context 两成员及原生产者 | 取得允许输入，固定实际请求，不改写生产者事实 |
| 决策卡片、答复资格和唯一有效答复 | 人工介入与授权责任 | 登记原等待并按原语义继续 |

会话路径的每次逻辑执行关联合法 Session、未终结 Run 与有效 attempt。外部适配器映射到 Agent execution 与 execution attachment，Agent 核心不依赖 Session 的具体治理接口。独立消费由 Agent 条件性结束自身 execution；会话专用提供者把输入受理和终结纳入 Session 的同一权威提交边界。runtime 的寿命不与某个 Run 绑定，执行结束后可回空闲供后续工作复用。定义校验和清单求值可先于 Run；独立模型或工具调用不为此伪造 Run。Agent 为某个 Run 发起的扩展判断和压缩调用必须关联该原工作，不能混入碰巧活跃的其他 Run。

```mermaid
flowchart LR
    Assets[资产、设置与权限] --> Definition[AgentDefinition 专有声明]
    Definition --> Assembly[装配求值与采用交接]
    Assembly --> Agent[Agent 推进者]
    Session[Session 逻辑治理] -->|原工作与有效资格| Agent
    Context[Context 供给与请求组装] --> Agent
    Agent --> Loop[Loop 下一步]
    Loop --> Extensions[规定位置的有序扩展]
    Extensions --> HITL[原卡片与人工决定]
    HITL --> Extensions
    Agent -->|独立调用| Model[Model runtime]
    Agent -->|准入后调用| Tool[Tool runtime]
    Model -->|原结果与消费位置| Agent
    Tool -->|原结果与消费位置| Agent
    Agent -->|原执行事实及集成提交| Session
```

箭头表达输入与结果协作，不规定源码互引或共同寿命。消费者通过公开契约及显式依赖使用能力。Cordis 接入遵循共同 IC，不能用 scope、fiber 或 disposer 代替租户隔离、业务提交或执行取消。


Agent 内部按纯求值、效果协调和宿主集成分责。纯求值只读有类型的决策事实；协调者消费 Model/Tool 原调用和交付协议；集成者负责外部工作映射与持久参加者。权限策略、Context 选择与排除、Tool 内部等待和模型内部重试各有原拥有者。完整分类归[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#跨域概念与内部可见范围)。

完整行为读[能力组](../../../packages/agent/README.md)，精确机制与流程随成员维护。
