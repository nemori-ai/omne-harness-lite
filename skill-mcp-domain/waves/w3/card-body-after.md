# Skill 与 MCP 领域内实现：契约、通用实现与本地宿主（M2 边界前，波段式交付）

**接手本卡**

1. 先读当前修订、评论、条件和现存attempt。在本Issue评论声明认卡，写明负责的人、会话/agent实例、权限依据及现存执行核对结果。
2. 已获本卡派发时按该授权接手；尚未派发时向指定调度者请求领取。由授权调度者登记并读回唯一attempt，不能凭Assignee或认卡留言抢占执行。
3. 开工前核对[当前执行与交接](#当前执行与交接)中的分支、基线、写范围和task context。不涉及Git交付时明确不适用，仍须履行认卡和状态更新。
4. 在开工、关键进展、阻塞或范围变化、可审阅候选、暂停/接续和交付时及时交回事实。获授权的正文单写者更新摘要，指定调度者更新Project Stage；已有权限时直接执行并读回，不重复请示。
5. 交付时给出成果、验证和剩余责任，由有权者接受。有效决定读回后完成关闭与看板对账；部分接受不销整卡。

具体规则归[交付操作][r1]和[交付协议][r2]。

## 身份与责任

- 交付层级：delivery
- 主工作类型：feature
- 交付线：tool-exec
- 性质：impl
- 契约变更：additive
- 交付修订：1
- 创建操作标识：skill-mcp-m2-065af66e-3a06-4824-bf1b-df9de79dca73（登记见 https://github.com/nemori-ai/omne-harness-lite/issues/184#issuecomment-6622798014）
- 责任范围：Skill 领域（`packages/skills/*`）与 MCP 领域（`packages/mcp/*`）的领域内实现，以及用本领域词表达的对外契约。两个领域的组页、领域页与 key-flows 的写回。
- 卡负责人、主结果接受者及授权依据：PanQiWei。2026-11-03 会话指定本会话为两领域的独立负责人，按单会话 map-reduce 波段交付到 M2 边界；2026-11-04 会话要求建本卡。
- 受影响语义拥有者：两组组页与成员 SPEC 由本卡负责人拥有；资产类别注册（`@omne-harness/assets`）、Cordis 装配、进程落点与凭据保管的提供者归各自拥有者，本卡只声明需求端口。
- 调度者：PanQiWei 委派的 Claude Code 会话（本会话兼 reduce 与 Skill、MCP 两条线负责人）。
- 正文单写者：同上。

## 目标与范围

两个领域要在 M2「端到端多轮闭合」之前把领域内部做完：契约、通用实现与本地宿主在替身端口上完整可用，M2 之后只需接真实提供者并与消费者联调。现状是 W1、W2 已收波，W3 的各闭包已合入父分支，W4 的方案与规格已写好、未开波。

范围原则：两个领域只交付已要求的需求。超出的记入停放清单，不在本卡做（负责人 2026-11-06 的指示，见[决定与剩余责任](#决定与剩余责任)）。

- 本次结果：Skill 与 MCP 两领域各自的契约成员、通用实现成员、本地宿主成员与（W4）Cordis 契约成员在 M2 边界前完成并通过评审，组页与成员 SPEC 一致。
- 包含：`skill-contract`、`skill`、`skill-host-local`、`mcp-contract`、`mcp`、`mcp-host-local`，W4 新建 `skill-cordis-contract`、`mcp-cordis-contract`；两组组页、领域页、key-flows、README；每波的评审、准入读数、实现架构页与交接报告。
- 不含：真实需求端口提供者（资格、解析、凭据、落点、耐久存储）；消费者接入（工具一侧从 MCP 已知动作派生工具、会话与 Agent 读取 Skill 即 #322）；插件进应用插件树；跨领域联合验收与端到端。这些在 M2 之后由集成联调承担。
- 类型补充（feature）：每个成员交付公开形状、完整必要行为、SPEC、README、符合性套件与持续验证；接口或报告不能代替实现。

### 总体设计

两个领域各是一个限界上下文，彼此不依赖、不共用模型。Skill 回答「一份合法的 Skill 包是什么，怎样按读取权与材料依据取出它的声明、正文、资源与包字节」；MCP 回答「怎样为一个已采用的接入点建立隔离的连接，合法取得动作清单，发出调用并如实报告结局」。持有、选择、采用、读取权与使用资格、凭据保管与授权流程、进程落点、动作权限判定都不属于两个领域，经本领域声明的需求端口交来结论；两个领域对资产都是同一种关系：实现 `@omne-harness/assets` 的 `BodyContract`，登记自己的类别。

成员四分（沿 Tool 组先例）：

| 成员 | 入口 | 内容 |
| --- | --- | --- |
| `<组>-contract` | `.` 给调用方；`./provider` 给端口实现方；`./testing` 给实现方自测 | 值与品牌、失败联合、应用服务接口、纯函数、类别端口；需求端口与唯一构造器；符合性套件（`ConformanceCase[]` + `node:assert`，不依赖测试框架）与内存替身 |
| `<组>` | `.` | 通用实现：应用服务工厂 |
| `<组>-host-local` | `.` | 本地宿主：Skill 的目录来源；MCP 的 stdio 与 Streamable HTTP 传输工厂 |
| `<组>-cordis-contract` | （W4） | 服务键与抽象 Service |

建模手法（两组共用）：品牌只由校验守卫授予，`src` 不写 `as`/`any`；构造即一致（`sealSnapshot`、`completeListing` 是唯一构造器，模块私有 `WeakSet` 登记，伪造抛 `TypeError`）；判别联合代替可选字段袋；失败按操作用 `Extract` 收窄；对端自报内容用 `Untrusted<T>` 包住；能力令牌（MCP 的 `AdmittedEndpoint` 只能由关口铸出）；穷尽检查；类只给有状态的内存聚合（`Connection`、`InFlightCalls`）。

Skill 的关键承诺：`parseSkillPackage` 按封闭次序给出第一个拒绝原因；读取 11 步由四段函数 `gate → materialOf → pin → verifiedBytes` 承担，失败类型逐段收窄；对无权主体「无权」「身份不存在」「依据不是本身份」三路径同答；带依据时固定那份材料，取不到报 `basis-unavailable`，不拼两个版本；每页 65536 字节，按 UTF-8 字符边界截取；`signal` 在每次端口调用前后检查。

MCP 的关键承诺（协议基线 2026-07-28，任务按 SEP-2663 由对端决定）：连接键含租户、持有、采用修订与对端账号，永不跨租户或对端账号共用；关口先采用后资格；建连时限在 `attempt()` 之后起计时，覆盖再停遗留进程、取凭据、进程启动、打开传输、协商，以及失败或关停之后的收场，`ensure` 入口另有临界区时限，加入在途建连的调用另有从加入起计的时限，取页另起同一上界；`refresh` 整份发布，发布边界四项核对紧挨存储写入，迟到的旧代际结果不发布；拆除只有一份（关传输 → 停进程 → 释放句柄），`close()` 只报告实际确认的范围；`closeAll` 之后要连接的操作先判关停、不问宿主端口，在途操作不再开始下一步，答同样的结果（`refresh` 与调用答 `connection-unavailable`，任务操作答 `effect-unknown`），已发出的请求结局与已发布的清单不改，也不再向对端派取消；未发出、已发出无应答（`effect-unknown`）、对端错误与读不懂的应答分开。

完整设计与建模见下表 I-01–I-05；过程材料（DDD 草图、波段计划、逐轮评审、交接报告）在远端记录分支 I-06。

### 波段计划（越近越细）

| 波 | 状态 | 交付 | 出口 |
| --- | --- | --- | --- |
| W1 契约地基 | 已收波（父分支 c5a49fd46） | `skill-contract`、`mcp-contract` 的公开形状、纯函数、端口、符合性套件与 SPEC | 两契约成员可供 W2 直接依赖；组页写回 |
| W2 通用实现与本地来源 | 已收波（父分支 78e978ab6） | `skill`（`createPackageInspection`、`createSkillAccess`）、`skill-host-local`（`createDirectorySource`）、`mcp` 核心（`createMcpCore`、内存 `CatalogStore`、聚合、关口、连接表）、SDK 探路 | Skill 首条旅程在目录来源加替身上跑通；MCP `refresh` 在替身传输上整份发布，迟到结果不覆盖较新的采用 |
| W3 调用、传输与目录 | 各闭包已合入父分支，波末收口中 | `w3-skill-catalog`（#1122：`SkillCatalog` 的 `summaries`/`search`，真实目录示例）；`w3-skill-fix`（#1135：生态兼容放宽，引用身份，带依据时的内容摘要）；`w3-mcp-contract`（#1132：传输应答的全决策表、线上事件归类、服务条款衔接）；`w3-mcp-lifecycle`（#1134：连接表结构化并发重写，含 W2 已知限制，配有界穷举探索器与 TLA+ 模型）；`w3-mcp-host`（#1138：stdio 与 Streamable HTTP（含旧 HTTP+SSE 回退）的 `McpTransportFactory`。官方 SDK 2.4.0 优先复用，复用会违反结局如实分类、进程归落点、不代调用方重发三条硬承诺之一时按例外自写，产品源码不导入官方 SDK，SDK 客户端与服务端只作测试对照与夹具）；`w3-mcp-call`（#1141：`ActionInvoker`、任务表、`createMcp`）；`w3-mcp-e2e`（#1149：本地真实服务端上的端到端旅程与兼容对照）；`w3-docs-skill`、`w3-docs-mcp`（#1151、#1152：组页与领域页写回）。契约的改动登记在 mcp-contract SPEC 的[调用口闭包的裁定][r14]。 | 本地真实 MCP 服务端上端到端：协商 → 刷新 → 调用（完成、动作错误、多轮输入、任务）→ 取消，两种传输读数一致；Skill 摘要与检索可用。服务端形状与兼容目标的范围见判据 C4 |
| W4 契约偏离对齐与 Cordis 服务键 | 方案与规格已写好，未开波 | W4-1 契约偏离对齐：契约给传输的答复加「传输不再可用」标记（可加字段），两种传输给出它，`mcp` 按标记转 `lost`，兑现 W3 登记的契约偏离；W4-2 `skill-cordis-contract` 与 `skill-host-local` 的 Cordis 插件；W4-3 `mcp-cordis-contract` 与 `mcp-host-local` 的 Cordis 插件，撤除时经 `closeAll` 收口；W4-4 两组组页「完整行为候选的正式承接缺口」表与领域页写回，在卡上请求 D-01、D-02 | 插件不进应用插件树；不接真实提供者；出口是可以请求 D-01、D-02，不是已接受 |
| M2 之后 | 只定成果 | 接真实提供者并用本组符合性套件验收；插件进应用插件树；与消费者联调（#322 等）；联合验收 | 排程随 M3 规划 |

### 交付方式

单会话 map-reduce 波段式滚动交付：本会话兼 reduce 与两条线负责人；每波冻结输入 F、写集不相交、共享文件（锁文件、catalog、组页、领域页）只由 reduce 写；每个闭包一个写者、一棵工作树、一份闭包规格（十二字段 + 追加记录），推 PR 以 merge commit 合入父分支 `PanQiWei/skill-mcp`（普通开发分支，不是集成轨道）；交回后 reduce 复跑门禁与读数，派交付边界、正确性/L3 逐行（探针实跑）、设计与实践、差分变异评审，修复轮按 `quality.md` 计轮与收口；每个闭包合入后更新面向源码的实现架构页；波末写回组页、父分支头跑一次准入与 `loop:status --strict`、写五节交接报告、同步记录分支。

## 依据与实施输入

| 输入ID | 唯一源或获准问题 | 精确修订/提交及采用状态 | 本次适用条款或范围 |
| --- | --- | --- | --- |
| I-01 | [Skill 组工程设计](https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/skills/docs/architecture.md)、[MCP 组工程设计](https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/mcp/docs/architecture.md) | `78e978ab6`；候选决定，尚未技术接受 | 边界、模型、端口、应用服务、失败种类、承接缺口 |
| I-02 | [Skill 领域交接](https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/docs/domains/skills/architecture.md)、[MCP 领域交接](https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/docs/domains/mcp/architecture.md) 与两份 key-flows | `78e978ab6`；技术草案 | 跨领域端口的实现方与交接 |
| I-03 | 成员 SPEC：[skill-contract][r3]、[skill][r4]、[skill-host-local][r5]、[mcp-contract][r6]、[mcp][r7] | `78e978ab6`；候选 | 精确公开形状、行为、失败码、已知限制 |
| I-04 | 外部规格：[Agent Skills](https://agentskills.io/specification)；MCP 2026-07-28 核心 schema 与任务扩展 `io.modelcontextprotocol/tasks`（SEP-2663）；官方 TypeScript SDK 2.4.0（负责人 2026-11-04 决定，取代 2.3.1） | 固定修订 | Skill 包格式；MCP 协议线上形状 |
| I-05 | 项目规则：[产品包组织][r8]、[质量与风险][r9]、[派发契约][r10]、[贡献交付][r11] | 派发时重读现行有效规则 | 成员准入、风险与评审、署名与 trailer |
| I-06 | 过程记录分支 [`PanQiWei/skill-mcp-records`](https://github.com/nemori-ai/omne-harness-lite/tree/PanQiWei/skill-mcp-records/skill-mcp-domain) | `844e76982`；任务过程材料，不是正文 | `model/`（DDD 与 SOLID 建模）、`waves/`（范式、波包、两线 spec/plan、评审、交接、2026-07-28 核对与 SDK 探路结论）、`delegate/`（闭包规格与派发流水）、`techdoc/`（实现架构页源）、`evidence/` |

- 实施输入与约束：只写 `packages/skills/*`、`packages/mcp/*` 与两组领域页；不接真实提供者；`mcp-host-local` 优先复用官方 MCP SDK，因硬承诺自写的块与理由登记在它的 SPEC；产品源码不导入官方 SDK，SDK 客户端与服务端只在测试里作对照与夹具；新增依赖与锁文件由 reduce 单写。
- 契约变更的限定：「契约变更：additive」指公开形状。两契约成员的改动按 0.x 政策同步真实消费者，不保证字节兼容。例外逐条登记在 mcp-contract SPEC 的[调用口闭包的裁定][r14]第 26–31 条：第 26 条（`McpPorts.checkOutput` 必填）对构造 `McpPorts` 的宿主不是可加的改动；第 27、29 条放宽一个字段或一个原因的定义（`ContinueRequest.inputResponses` 可选，`cancelled` 的范围）；第 28 条把 O1 加强为全函数并加两个导出常量与一个原因取值；第 30、31 条是行为改动（`closeAll` 之后 `refresh` 对未采用接入点答 `connection-unavailable`，调用方已中止时被关口拒绝的 `refresh` 答 `kept`（`cancelled`））。`mcp-host-local` 兑现传输时关闭了契约的未封闭项 F4（stdio 上读不懂的行丢弃而不是断流，改写了一条原有用例），并在[真实传输兑现时的裁定][r15]第 11、12、15 条改变了传输行为。
- 受影响消费者：W4 之前只有本组成员与测试；M2 之后是 Tool（动作派生）、会话与 Agent（Skill 读取）、资产（类别注册）。
- 持续成果落点：各成员 SPEC、README、符合性套件与测试；两组组页、领域页、key-flows。
- 可恢复输入：父分支 `PanQiWei/skill-mcp` 与记录分支 I-06 都在远端；接手者从 I-06 的 `waves/operating-model.md`、当前波的两线 `plan.md` 与最近一条波报告卡评论开始。

## 验收与测试

| 判据ID | 依据ID | 成功及禁止结果 | 验证方法与所需证据 |
| --- | --- | --- | --- |
| C1 | I-01、I-03 | 两契约成员的公开形状、纯函数、端口、符合性套件与 SPEC 封闭组页全部「归 SPEC」项；套件能对违反披露要求的替身变红 | W1 交接报告判据 SC1–SC8、MC1–MC8 的证据 |
| C2 | I-01、I-03 | Skill 首条旅程（检查 → 描述 → 读 → 列 → 导出）在目录来源上可用；无披露、依据固定、不拼两个版本、不交部分内容 | W2 交接报告 SK2-1–SK2-12 |
| C3 | I-01、I-03 | MCP 核心在替身端口与脚本化传输上：关口、连接、发现、整份发布、状态、释放；并发下无无主资源、关闭次序正确、迟到结果不改变新状态。W3 起新代码的并发在有界穷举探索器与 TLA+ 模型的守护之内 | W2 交接报告 MC2-1–MC2-10（MC2-6 部分，理由见报告）；W3 起另有各成员探索器与 TLA+ 模型的读数 |
| C4 | I-01、I-03、I-04 | MCP 调用口与任务操作在两种真实传输（stdio、Streamable HTTP）上，对本地真实服务端端到端走通协商 → 刷新 → 调用 → 取消。本地服务端是 server-everything（stdio、Streamable HTTP、旧 HTTP+SSE 三种模式）、server-filesystem 与 mcp-server-fetch。调用覆盖完成与动作错误两种结局。多轮输入与任务在服务端支持的形状上跑，形状不一致的项由脚本化传输上的契约用例覆盖，并在报告里写明。六个兼容目标上「发现 → 列工具 → 调一个只读工具」的结论与官方 SDK 2.4.0 客户端一致。远程三个目标在有网络时跑，读数写明时刻。GitHub MCP 需要 OAuth，不在范围内。新代码的并发在探索器与 TLA+ 模型的守护之内。Skill 目录服务（`summaries`、`search`）可用 | 卡评论：每一条有命令、退出码、输出尾部与日志哈希 |
| C5 | I-01、I-03 | 两组 Cordis 服务定义成员由模板生成，`pnpm package:template scan` 为 pass。每个服务键只由一个抽象 Service 的 `static provide` 给出（[IC-2][r16]），根入口不导入 Cordis（[IC-4][r17]）。两个 host-local 的 `./cordis` 插件在真实 Cordis `Context` 上装配后，测试按服务键取到服务，各走通一条旅程：Skill 在目录来源上走描述 → 读，MCP 在本地传输与脚本化对端进程上走刷新 → 调用。撤除插件时，MCP 的连接与进程经 `closeAll` 收口，用例断言撤除完成之后才返回。两组组页「完整行为候选的正式承接缺口」表与领域页按实际成员和状态写回，review-docs 无阻断 | W4 报告卡评论；负责人技术接受另记 |
| C6 | I-05 | 每波：闭包合入前复跑门禁与读数；父分支头一次准入与 `loop:status --strict` 硬线；组页写回 review-docs 无阻断；基线既有失败分开报 | 每波报告卡评论（W1、W2 另有当时的 `handoff.md`） |

| 测试/验证拥有者 | 类型 | 大致覆盖 | 真实依赖或替身及不覆盖 | 执行入口/所需环境 |
| --- | --- | --- | --- | --- |
| 各成员（`packages/skills/*`、`packages/mcp/*`） | 单元、契约（符合性套件）、包内集成 | 纯函数穷举、端口套件、服务 + 内存替身、聚合状态机、并发次序（deferred）、真实临时目录；W3 起新代码的并发由有界穷举探索器与 TLA+ 模型守护（正控无反例，负控变红） | 需求端口全部是替身；W3 起 MCP 用本地真实服务端；不覆盖真实提供者与消费者 | `pnpm turbo run build typecheck test --filter=<成员>`（探索器随 `test` 运行）；TLA+ 模型在各成员的 `verification/` 下，经 TLC v1.7.4 运行（`mcp`、`mcp-host-local` 有 `verification/models/run.py`）；差分变异 `pnpm run mutation --base <F>` |
| 本卡负责人（reduce） | 结构读数与准入 | 依赖方向、圈复杂度与 CRAP、差分变异、回路硬线 | 工具对静态变异可能判「测量无效」，按读数记录 | `pnpm run admission`、`pnpm run loop:status --strict --base <F>` |
| 只读评审子代理 | 交付边界、L3 逐行（探针实跑）、设计与实践、文档 | 每个闭包与写回 | 评审不是接受 | 评审报告在 I-06 `waves/w<n>/reviews/` |

- 独立复核与接受：每个闭包至少交付边界 + 正确性/L3 + 设计三面；L3 热点（租户隔离、凭据句柄、并发发布、读取关口）逐行读并用探针实跑反例。整卡与各成员候选决定的技术接受归 PanQiWei。
- 未覆盖或环境缺口：容器以 root 运行，权限类失败只经注入接缝验证；没有真实提供者与消费者；`admission` 在父分支头有基线既有失败（`execution-environment-host-local` 三条，`acceptance:lock` 的 7 个主线历史提交），与两域无关。

## 交付条件

| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 | 适用目标 |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | decision | 两组组页与成员 SPEC 的候选决定 | acceptance | 负责人对 W4 收齐后的组页与成员 SPEC 做技术接受 | PanQiWei，在本卡评论 | all |
| D-02 | decision | 本卡 revision 1 完整结果 | acceptance | C1–C6 都有证据，负责人整卡接受；部分认可不关闭 | PanQiWei，在本卡评论 | all |

## 当前执行与交接

### 认领与派发

- 认卡声明：本会话为调度者兼执行者，2026-11-03 由 PanQiWei 在会话内指定；本卡建于 W2 收波后补记。
- 派发情况：未登记 dev-flow binding。本卡的交付走父分支 `PanQiWei/skill-mcp`，不进集成轨道（负责人 2026-11-03 决定）；进轨道时另行派发。
- 执行实例：W1、W2 为 Claude Code 云会话 `session_01PbhoipRPZPd5MWa6gt878Z`。2026-11-05 起为本机 Claude Code 会话接手（reduce 兼两线负责人）。写者与评审者为其子代理。
- 工作树：父分支工作树 `.worktrees/skill-mcp`；每个闭包一棵临时工作树，合入后删除。

### 分支、基线与task context

未登记 binding。父分支 `PanQiWei/skill-mcp`：每波开波时合入 `origin/integration/mainline`，闭包以 merge commit 合入。最终路线（进 `integration/mainline` 轨道）在 M2 边界前另行派发；当前不生成 task context。

| 开工读回项 | 实际值/回执 |
| --- | --- |
| 本次直接合入分支全名 | `PanQiWei/skill-mcp`（普通开发分支） |
| 实际开工HEAD | W1 F = `21175c9f9`；W2 F = `b0f2ec7fb`；W3 F0 = `05f281394` |
| 本次读回的目标HEAD | `706152690`（W3 各闭包合入后，2026-11-06 读回，与远端一致） |
| task context路径与核验 | 未生成：不经 dev-flow 轨道 |

### 当前进展

- 最近更新：2026-11-06，W3 完成；W4 已开波（F = `60acfc28b`），MCP 切片 01 与 Skill 切片 01 的写者在跑。
- 已完成事实与保存位置：W1、W2 共 9 个闭包合入父分支（见波段报告评论 [W1][r12]、[W2][r13]）。W3 的闭包合入父分支 `PanQiWei/skill-mcp` @ `706152690`：Skill 线 #1122、#1135，MCP 线 #1132、#1134、#1138、#1141、#1149，组页与领域页写回 #1151、#1152；W3 报告评论 [W3 波末][r21]。W4 共享写（两个 Cordis 草稿成员与依赖）`60acfc28b`。W4 的方案、规格与闭包规格在 I-06 的 `waves/w4/` 与 `delegate/closures/`。波末小卡 #1155、#1156 在 W4 期间做完关卡。
- 阻塞与范围变化：无阻塞。范围变化：负责人 2026-11-06 定 W3 的交付边界与 W4 的目标（见[决定与剩余责任](#决定与剩余责任)）。清单容错不做，契约偏离的核心部分移到 W4，形状美化项与探索器抽包停放，W4 不补 profiling。
- 下一步及责任：W4：MCP 01（传输答复的「不再可用」标记与转 `lost` 的全函数）、Skill 01（Cordis 服务定义与插件）→ MCP 02（MCP 的 Cordis 插件）→ 两组组页写回、#1155、#1156 → 波末读数、W4 报告评论与 D-01、D-02 的请求。本会话负责。
- Project对账：未加入主 Project——本会话的工具没有 Project 写入能力；Line、Kind 字段由 `start` 写入，本卡未经 `start`。待负责人或有权工具补。

### 成果交回

- 固定成果：父分支 `PanQiWei/skill-mcp` @ `706152690`（W3 各闭包合入后）；PR #1110、#1111、#1112、#1113（W1），#1114–#1118（W2），#1122、#1132、#1134、#1135、#1138、#1141、#1149、#1151、#1152（W3）。
- 判据与证据：C1 达到（W1 报告）；C2 达到；C3 达到（MC2-6 部分）；C4 达到（证据评论：[host 最终证据][r18]、[W3 合入与组合][r19]、[端到端、兼容对照与写回][r20]）；C5 在 W4 进行中；C6 W1、W2、W3 达到（W3 的准入读数见 [W3 波末][r21]：快层失败都在别组成员、基线既有，硬线全过）。
- 集成观察：只在父分支，未进轨道。
- 请求接受及剩余责任：W4 收波后请求 D-01、D-02。

## 决定与剩余责任

- 有效决定：负责人 2026-11-03 会话：两领域由本会话独立负责、单会话 map-reduce 波段交付、以 M2 完结为边界、父分支不是集成轨道；2026-11-04 会话：建本卡并自主推进 W3，MCP SDK 采用 2.4.0；2026-11-05 会话：新代码的并发要在探索器与 TLA+ 模型的守护之内。尚无技术接受。
- 负责人 2026-11-06 的两条指示：
  1. Skill 与 MCP 偏应用服务性质。外部领域提的需求以满足已要求的为主，不无边界扩张，不过度设计，不过度优化。
  2. 遇到问题做第一性原理的结构分析，必要时用形式化定理守护，或把关键偏函数全化后按接口实施。
- 两条指示怎样同时成立：范围原则收功能与形状，不收正确性。SPEC 已承诺的不变式仍按结构修法与形式守护处理，它们是租户与对端账号隔离、结局如实、关闭不挂起、关停答复一致、资源恰好释放一次。已要求的需求来自四处：判据 C1–C6、两份领域交接（I-02）、生态兼容基线、成员 SPEC 已承诺的条款。
- 负责人 2026-11-06 06:15 与 06:16 的决定：W3 的交付边界按上述原则收；W3 完成后直接开 W4，自主推进。
- 剩余责任：W4（含小卡 #1155、#1156）；测试运行器的差分变异缺陷（负责人 2026-11-06 定暂不发卡，草稿在 I-06）；M2 之后的联调另立卡。相关卡：#784（M2 里程碑）、#322（Skill 内容读取，M2 之后的消费者接入）。
- 停放清单（全文与理由在 I-06 的 `waves/w4/plan.md` 第 2.4 节）。每一项都写明重开条件：
  - 清单容错（单个不合法工具剔除并报告）与契约 C1 未封闭项（`inputSchema` 不是 object 的工具）：官方 SDK 2.4.0 遇一项不合法就整份拒绝，六个兼容目标都列得出工具。重开条件：兼容目标或消费者报告某份清单因单个工具被整份拒绝。
  - `TaskRef` 与任务表键带对端账号：现在碰撞时答 `unknown`，即拒绝，没有隔离漏洞，改它是形状改动。重开条件：消费者需要同一主体在两个对端账号上并行操作同名任务。
  - 形状美化与 0.1.0 公开形状项（`TaskControl` 加 `signal`、`OutputCheck.violates.reason` 封闭联合、`ContinueRequest` 写成联合、`WireClassification`、`AnswerClass`、`WireAnswer`、`AnswerConclusion.unusable` 等）：没有消费者要求。重开条件：0.1.0 公开形状评估。
  - 探索器引擎抽成 `tools/` 下的开发期包：两份副本各自稳定。重开条件：出现第三个使用者。
  - 按风险补 profiling：没有性能需求。重开条件：消费者给出时延或吞吐要求。
- 收尾对账：未接受，保持 OPEN。

[r1]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/agent-delivery.md
[r2]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/delivery.md
[r3]: https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/skills/skill-contract/SPEC.md
[r4]: https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/skills/skill/SPEC.md
[r5]: https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/skills/skill-host-local/SPEC.md
[r6]: https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/mcp/mcp-contract/SPEC.md
[r7]: https://github.com/nemori-ai/omne-harness-lite/blob/78e978ab6b06ffb470c7cab4186c3cff9a0ef563/packages/mcp/mcp/SPEC.md
[r8]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/package-organization.md
[r9]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/quality.md
[r10]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/workflow.md
[r11]: https://github.com/nemori-ai/omne-harness-lite/blob/main/CONTRIBUTING.md
[r12]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6622861352
[r13]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6622868909
[r14]: https://github.com/nemori-ai/omne-harness-lite/blob/70615269032b96255dbde69dc679dc4637b90248/packages/mcp/mcp-contract/SPEC.md#decisions-w3-call
[r15]: https://github.com/nemori-ai/omne-harness-lite/blob/70615269032b96255dbde69dc679dc4637b90248/packages/mcp/mcp-contract/SPEC.md#decisions-host
[r16]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/architecture/cordis-integration-conventions.md#ic-2
[r17]: https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/architecture/cordis-integration-conventions.md#ic-4
[r18]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6680928470
[r19]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6681699320
[r20]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6683488904
[r21]: https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6684636018
