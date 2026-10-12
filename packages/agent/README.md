# Agent 定义与工作推进能力组

正式维护位置已具名，当前仍无真实workspace成员、源码或运行实例。以下为文档目标及待审细化，不授予实现或接受。

## 责任与范围

工程范围由[领域责任](../../docs/domains/agent-progression/README.md)与[产品正文](../../.meta_harness/design/product/agent-progression/design.md)约束。本组拥有成员分解、公开依赖、组协作及组合验证导航。

## 成员与依赖

目标成员的职责、状态和读取顺序从[agent 入口](agent/README.md)进入，再按任务核对下面的规格与专题。


状态为候选，待用户确认。目标成员为 `packages/agent/agent/`，拥有 AgentDefinition 专有声明、Loop 求值、推进协调和 Loop extensions。该目标目录不表示实际包已经存在。

[成员 SPEC](agent/SPEC.md)是行为入口。[定义专题](agent/definition.md)、[Loop 专题](agent/loop.md)和[扩展专题](agent/extensions.md)由同一成员拥有，按责任查阅。共同持有、设置和权限沿 assets 组公开契约；有效构成切换沿 assembly；业务工作和终态沿 session。能力组不另设一份合并 SPEC。

独立入口隐藏存储、调度和具体提供者，Cordis 适配沿系统 IC 的同包集成入口组织。定义消费不得无意引入业务提供者或 Cordis 装配树。接口、导出和安装闭包须由后续成员设计与实际消费验证。

新增扩展或修改 Loop 时，先定位现有状态位置、行为依据和可恢复消费责任，再维护成员专题及相称验证。新增公开操作、系统协作保证或产品含义分别交给相应拥有者，不凭目录或已有回调自动取得采用。

按用户目标阅读时，从[产品关键旅程](../../.meta_harness/design/product/agent-progression/design.md#关键用户旅程)进入[架构流程](agent/docs/key-flows.md)，再到[成员旅程验证入口](agent/SPEC.md#旅程验证入口)。具体检查及实现观察由实际成员补证，本候选只维护目标行为和验证义务。


工程关系见[组设计](docs/architecture.md)。成员目标已有文档，不等于真实包；公开入口、安装闭包和提供者映射尚待设计。

## 关键协作

定义解释向 assembly 交专有声明；Session 供给原工作与当前资格；推进协调者向 Context、Model、Tool 和 HITL 请求能力并认回原位置。单成员内部流程由成员拥有，跨组资格和事实交接分别由原责任方维护。

流程从[组协作入口](docs/key-flows.md)导航到协调成员。

## 组合验证

Agent 成员承担定义、Loop、扩展及整批屏障验证。与 Session、assembly、原执行、HITL 和存储共同验证当前资格、等待接续、可靠承接和控制竞争。验证资源、真实装配与故障运行证据尚缺，静态图和文档结构不能替代。

## 维护

修改行为同步成员SPEC、原具名专题、实际消费者及相称验证；修改工程分解同步组导航和登记。具名维护人尚缺，由项目负责人指定；职责拥有者不等于已派发个人。产品、组工程和成员机制分别维护唯一正文。
