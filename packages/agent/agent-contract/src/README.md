# Agent 声明契约源码

## 公开入口

[index.ts](index.ts) 导出声明、作者协议、身份、纯求值、请求接缝、台账与材料、托管协调与运行实例、Journal 的类型，常量 `ATTRIBUTE_ITEMS`、`POSITIONS`、`POWERS`、`POSITION_OUTPUTS`、`AGENT_IDENTITY_MAX_LENGTH`，以及 `judgeAgentDefinition`、`judgeLoopExtensions`、`judgeExtensionOutput`、`agentBodyContract`、十四个 `decode*` 身份解码函数和 `judgeAdoption`、`judgeEvidence`、`judgeAccess`、`judgeAuthority` 四个结构判定。公开形状以源码为准，边界行为见 [SPEC](../SPEC.md#声明判断)。包根导出托管协调、运行实例与 Journal 的类型，不导出它们的实现。

## 模块

[definition.ts](definition.ts) 拥有 AgentDefinition 声明类型；[extensions.ts](extensions.ts) 拥有扩展作者协议的类型：九处位置、三档干预力、声明、输入、输出、结论与调用协议；[identity.ts](identity.ts) 拥有十四个品牌身份、`Adoption`、`Evidence`、`Access`、`ConsumerRef`、`Authority`、`Continuation`、`AgentInstant`，十四个由同一规则生成的身份解码函数（解码只给品牌，不证明存在、不授资格）和四个结构判定，它们是纯函数，返回 `Outcome`，不抛异常；[evaluation.ts](evaluation.ts) 拥有纯求值类型与 `AgentEvaluator`；[request.ts](request.ts) 拥有请求准备、模型选择与压缩的类型和三个端口；[passages.ts](passages.ts) 拥有扩展台账、人工卡片、按位置的 `Subject`、动作与消息准入端口和材料类型；[execution.ts](execution.ts) 拥有托管协调与运行实例的类型：执行状态与快照、控制与结果责任记录、事件与分页、运行实例、目录、恢复与采用端口、登记与宿主、主体资格核验端口和时钟；[journal.ts](journal.ts) 拥有 Journal 的类型：`CallerCommit`、`EffectIntent`、`JournalCommit`、按使用角色分的五组端口、`JournalCapabilities` 和它们的并集 `AgentJournal`；[judgment.ts](judgment.ts) 拥有判断结果与拒绝原因；[judge-definition.ts](judge-definition.ts) 判断 AgentDefinition；[judge-extensions.ts](judge-extensions.ts) 判断有序扩展声明；[judge-output.ts](judge-output.ts) 按位置输出表判断扩展作者返回的输出，表以数据 `POSITION_OUTPUTS` 导出；[body-contract.ts](body-contract.ts) 向资产包的类别注册表提供 `AgentDefinition` 的正文契约，同步读 json-text 读树，规则与 `judgeAgentDefinition` 同源；[check.ts](check.ts) 保留安全输入复制、JSON 限额和 schema 校验的内部机制。外部通过包入口消费，不深层导入这些模块。

## 依赖与资源

输入校验使用 json-text、schema-provider 和 zod。导入不创建 schema 缓存；一次判断持有并释放自己的校验执行域。源码不导入 Cordis、`agent`、`agent-host-local` 或装配实现；[dependency-direction.spec.ts](../tests/dependency-direction.spec.ts) 沿构建后的导入图核对。
