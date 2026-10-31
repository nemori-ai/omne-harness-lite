# Agent 纯契约的架构边界

本包拥有公开值、操作、结果、行为及可替换端口。运行接口的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，接受范围见 [SPEC](../SPEC.md)。包根导出全部契约类型、三个判定函数、身份解码与结构判定和资产正文契约，不导出运行实现。

## 依赖方向

消费者依赖本包；[agent](../../agent/README.md) 提供通用实现；[agent-cordis-contract](../../agent-cordis-contract/README.md) 唯一绑定 Cordis Service；[agent-host-local](../../agent-host-local/README.md) 提供具体装配。纯契约及通用实现不依赖 Cordis，也不导入任何外部协调者的类型。

本包依赖 [assets](../../../assets/assets/README.md)，assets 不依赖本包。本包实现 assets 定义的 `BodyContract`，装配一侧把 `agentBodyContract()` 登记到 assets 的类别注册表。依赖方向与登记的规则见 SPEC 的[资产正文契约](../SPEC.md#资产正文契约)。

Agent 消费 Model/Tool 的公开执行契约以及 Context、HITL 的窄适配端口。外部协调者在外部提供 AgentJournal 的提交参加者，保存自己的业务关联，并消费事件。Journal 不暴露外部协调者的业务管理或业务终态方法，也不另立外部协调者的事实权威。tryFinish 终结本域执行；只有声明了提交参加者的 Journal 提供者承担与外部输入和业务终态的共同提交。独立消费者不需要终态批准协议。

## 值与行为

本域模型、外域消费视图、共享值与集成概念的分类归 [对象模型](object-model.md#跨域概念与内部可见范围)。外部引用用于来源、恢复和责任关联，不自动成为本域治理状态。

公开值及端口见 [公开入口](public-api/README.md)。[对象模型](object-model.md) 将可复用 runtime、可恢复 execution、物理的执行挂接和纯 evaluator 分开。目录只定位活体，持久事实及恢复不依赖目录存活。

边界校验可以由本包实现。调度器、具体事务提供者及工厂由 [通用实现](../../agent/docs/architecture/README.md) 拥有；外部协调者一侧的原子提交适配由系统集成拥有，不能复制在 Agent 核心。

## 当前设计限制

运行类型已导出，Journal 的持久性、实际发出围栏及 Cordis 生命周期仍须由后继提供者验证。本包的测试不证明这些运行保证。独立调用无需虚构任何外部协调者的对象，但仍须提供与所选托管接口相称的耐久、授权和保管能力。
