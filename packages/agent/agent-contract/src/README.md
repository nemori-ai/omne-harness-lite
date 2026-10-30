# Agent 声明契约源码

## 公开入口

[index.ts](index.ts) 导出声明、作者协议、身份、纯求值、请求接缝、台账与材料、托管协调与运行实例、Journal、生产者接收面的类型，常量 `ATTRIBUTE_ITEMS`、`POSITIONS`、`POWERS`、`POSITION_OUTPUTS`、`AGENT_IDENTITY_MAX_LENGTH`，以及 `judgeAgentDefinition`、`judgeLoopExtensions`、`judgeExtensionOutput`、`agentBodyContract`、十四个 `decode*` 身份解码函数和 `judgeAdoption`、`judgeEvidence`、`judgeAccess`、`judgeAuthority` 四个结构判定。公开形状以源码为准，边界行为见 [SPEC](../SPEC.md#声明判断)。包根导出托管协调、运行实例与 Journal 的类型，不导出它们的实现。

[testing.ts](testing.ts) 是 `./testing` 入口：接收面两个端口的一致性套件与非耐久替身，规则见 [SPEC 的生产者接收面](../SPEC.md#生产者接收面)。替身声明 `durability: 'none'`，不得装进生产。包根不加载这个入口。

## 模块

[definition.ts](definition.ts) 拥有 AgentDefinition 声明类型；[extensions.ts](extensions.ts) 拥有扩展作者协议的类型：九处位置、三档干预力、声明、输入、输出、结论与调用协议；[identity.ts](identity.ts) 拥有十四个品牌身份、`Authority`、`Continuation`、`AgentInstant`，再导出 exchange-refs 的 `Adoption`、`DurableEvidence`、`ConsumerRef` 与 legal-identity 的 `Access`，十四个由同一规则生成的身份解码函数（解码只给品牌，不证明存在、不授资格）和四个结构判定，它们是纯函数，返回 `Outcome`，除 `judgeAccess` 不捕获调用方注入的主体判定抛出的异常外，不抛异常；[evaluation.ts](evaluation.ts) 拥有纯求值类型与 `AgentEvaluator`；[request.ts](request.ts) 拥有请求准备、模型选择与压缩的类型和三个端口；[passages.ts](passages.ts) 拥有扩展台账、人工卡片、按位置的 `Subject`、动作与消息准入端口和材料类型；[execution.ts](execution.ts) 拥有托管协调与运行实例的类型：执行状态与快照、控制与结果责任记录、事件与分页、运行实例、目录、恢复与采用端口、登记与宿主、主体资格核验端口和时钟；[finishing.ts](finishing.ts) 拥有终结的类型：F1 commit 的候选内容、候选与路线记录、终结责任清单及其处置、受信取消判断的安装、输入、结果与记录、结算记录与快照投影，以及 commitSettlement 的六个变体；[journal.ts](journal.ts) 拥有 Journal 的类型：`CallerCommit`、`EffectIntent`、`JournalCommit`（含 `finish` 与不带 intent 的 `JournalCommitState`）、按使用角色分的五组端口、`JournalCapabilities` 和它们的并集 `AgentJournal`；[receiving.ts](receiving.ts) 拥有生产者接收面的类型：三类接收面条目与开放联合 `AgentJournalEntry`、记录端口 `AgentJournalEntries`、账目出站端口 `AgentAccountOutlet` 及其交接元组与结果；[testing-case.ts](testing-case.ts)、[testing-journal-entries.ts](testing-journal-entries.ts) 与 [testing-account-outlet.ts](testing-account-outlet.ts) 是 `./testing` 入口的用例形状、套件和替身；[testing-journal-core.ts](testing-journal-core.ts) 是 Journal 核心一致性套件，[testing-cancellation.ts](testing-cancellation.ts) 是套件与替身共用的测试取消政策与安装记录；[judgment.ts](judgment.ts) 拥有判断结果、声明判断的拒绝原因与扩展输出判断的拒收原因；[judge-definition.ts](judge-definition.ts) 判断 AgentDefinition；[judge-extensions.ts](judge-extensions.ts) 判断有序扩展声明；[judge-output.ts](judge-output.ts) 按位置输出表判断扩展作者返回的输出，表以数据 `POSITION_OUTPUTS` 导出；[body-contract.ts](body-contract.ts) 向资产包的类别注册表提供 `AgentDefinition` 的正文契约，同步读 json-text 读树，规则与 `judgeAgentDefinition` 同源；[check.ts](check.ts) 保留安全输入复制、JSON 限额和 schema 校验的内部机制。外部通过包入口消费，不深层导入这些模块。

## 依赖与资源

输入校验使用 json-text、schema-provider 和 zod。导入不创建 schema 缓存；一次判断持有并释放自己的校验执行域。接收面类型引用 model-contract 与 tool-contract 的交付键、call-account 的账目和 stream-arrival 的 `StreamRef`，不复制它们。源码不导入 Cordis、`agent`、`agent-host-local` 或装配实现；[dependency-direction.spec.ts](../tests/dependency-direction.spec.ts) 沿构建后的导入图核对。

共同提交参考设施的状态、发布和认回在 [testing-received-memory.ts](testing-received-memory.ts)，材料公开形状的检查在 [testing-received-material.ts](testing-received-material.ts)。后者消费已有内容与身份判定器，不选择 Tool 的内容策略，也不验证材料所指生产者事实是否成立。
