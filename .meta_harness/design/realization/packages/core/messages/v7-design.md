# messages v7 创建记录与回复关系候选

## 实现路径与来源

本稿为既有 `packages/core/messages` 的 candidate 增量，源码已经存在、当前 root 实施 MS6；不修改 [既有设计](design.md) 与 [v6 设计](v6-design.md)，不声称本稿已被接受或实现。节点仍为 `provider`，落点为共享数据与纯计算，无插件、服务、fiber、存储或权限面。

精确输入为 baseline `omne-harness-lite-design-2026-09-15` 的 [data.messages/v7](../../../../spec/data/messages/v7/contract.md)（catalog candidate）、[MR10](../../../../spec/data/model-response/v10/contract.md)、[CA3](../../../../spec/data/call-accounts/v3/contract.md)、[RT11](../../../../spec/capabilities/model-request-runtime/v11/contract.md)；后三份同为 candidate。MS7 的 MP6/MP5 等依赖按下表，不将结构同形视为相同版本。需求增量为 PF-013 rev16、PF-012 rev21、PF-015 rev20，范围沿 MS7 source-alignment；共同方向来自 [technical-choices-r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md)，不是采用决定。

直接复用现有 `src/{schema,types,values,json,judge,parameters,blocks,prefix}.ts` 的固定 Schema 图、品牌恢复与无损 JSON 判定；不引入通用 diff/transform 框架。现有公开入口没有下述回复关系判定，本稿新增该必要纯函数。下文新函数、类型及子路径均为**候选**；已存在函数明确写作“既有”。TS 表示是契约的投影，不改变正式技术值的唯一 owner。

## 契约到公开面与 Cordis 的投影

以下是候选兑现位置，不是已兑现清单。M7-V* 与 M7-G* 的实际状态见 [verification](verification.md#v7-创建记录与回复关系候选义务)。

| 行／契约责任 | 插件、服务或公开操作 | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| M7-P1：MS7 S-37/S-39/S-51～S-54 | 既有 `validate`、`SCHEMA_DEF_NAMES` 与 root 类型；候选 CallKey、CreationKey、ModelCallPayloadRef、ModelCallCreationInput、ModelCallCreatedPayload、两个 marker 类型 | `src/schema.ts` 编译 MS7 全部 50 定义；`types.ts` 唯一声明共享值，runtime 只导入或重导出 | M7-V1/V2；Schema 只核形状，不赋权、不取回内容 |
| M7-P2：MS7 S-49/S-50/S-54 | 既有 `judgeModelInvocationRecord`、文本入口、`brandRecord` | 扩展为七种技术记录；保留 dispatched 的 MP5 判定；undispatched 两成员同在同缺，released/interrupted 禁止它们 | M7-V2/V7；accepted 后首次拒绝与初次拒绝的真实来源归 RT11，单条 judge 不伪造历史 |
| M7-P3：MS7 S-37/S-51～S-53 | 候选 `judgeModelCallCreatedPayload` 及 `judgeModelCallCreatedPayloadText` | 严格无损接收 accepted/rejected 创建内容；只用显式输入核内在关系，不引 MR 的 Pending 类型 | M7-V2/V3；来源版本真实性、动态凭据、原壳匹配由 runtime 读写边界另核 |
| M7-P4：MS7 S-9/S-39，CB3 S-3/S-5/S-19/S-20/S-22 | 候选 `judgeModelReplyMessage`，唯一公共关系 helper | 本包先用既有消息 judge，再按下节检查原成员与允许的成对新增；成功返回 owned persisted 副本 | M7-V4/V5；不检测真实系统转换来源或当前写权，成功不是可提交凭证 |
| M7-P5：MS7 S-37/S-52/S-53/S-55 | 既有 `snapshot`、`jsonEqual`、CB3 严格读写及品牌恢复构件 | 全链保留精确数值、对象完整成员、数组与原序；JSON 对象键无序、数组有序，数字比较沿既有精确值 | M7-V3；原字节 SHA-256 由读写边界在重编码之前核，值往返不证明原字节摘要 |
| M7-P6：MS7 S-1～S-50 未变部分与 S-55 无环副本 | 既有消息、日志前缀、可读性与配对公开面；本包 Schema 中的 MR 同义形状 | 七消息/十四拒绝及既有优先级保持，技术 marker 不进入 Message、OutboundMessage 或模型上下文；与 MR10 对齐 ResponseId、SelectedBy、CredentialScope、ParameterAdjustment、dropped 项 | M7-V2/V6；MR10 唯一拥有 Pending 和 final 同事实比较，本包不反向依赖 MR |
| M7-P7：MS7 本版运行格式边界 | root、`./schema` 与明确保留的 Schema 资源 | root 统一 MS7；公开当前精确图所需旧原字节资源，无旧消息执行路由、修补或自动降级 | M7-V1/V6/V8；各消费者的冻结规范采用不自动升级 |

项目 Cordis 采用版本为 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。本包不依赖 Cordis，公开函数不要求 Context、Session、tenant、store 或 runtime。无服务面、inject、event、effect，因而无必需／可选注入选择。消费者重载及清理的上游依据分别为 basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（4.0.4，probe 非 null）；本包不据它们声称业务取消、可靠清理或事务成立。本稿没有新增依赖 probe:null 的主张。

## 候选公开函数及判定顺序

候选签名只表达数据判定，不是新运行操作：

```ts
// 候选；类型同属本包，MessageRejection 沿既有闭合集合。
judgeModelReplyMessage(
  originalReply: unknown,
  persistedMessage: unknown,
): { readonly ok: AssistantMessage } | { readonly rejected: MessageRejection }

judgeModelCallCreatedPayload(
  value: unknown,
): { readonly ok: ModelCallCreatedPayload } | { readonly rejected: 'malformed' }

judgeModelCallCreatedPayloadText(
  text: string,
): { readonly ok: ModelCallCreatedPayload } | { readonly rejected: 'malformed' }
```

`judgeModelReplyMessage` 的候选拒绝顺序固定为：先判 originalReply，再判 persistedMessage，最后判两值关系。每一侧复用既有 `judgeMessage` 的 S-39 顺序，失败原样返回；该侧成功却不是 assistant 时返回 `malformed`，不继续判另一侧。两侧均合法后，关系不成立也为 `malformed`。成功取第二侧已经分离、恢复品牌的值，不返原输入引用；失败与成功均不修改输入，不执行转换。文本调用方先走 CB3 严格 JSON 读取，不使用普通 `JSON.parse` 丢掉数值后再比较。

关系判定按 MS7 S-9 的具体位置正向比较：消息其他成员必须完整精确相等；原 `blocks` 数量和次序不变，逐位置比较每个原块。对原本没有 `renderings` 和 `transcript` 的合格 audio/image/file 块，允许 persisted 块仅多出这两个成员且两者同时出现；每个原成员仍逐一精确相等，不能删、改或换序。原块已有任一派生成员时，合法输入应已成对，整块完整相等；不能覆盖、追加一份 rendering 或修改已有派生内部成员。非合格块整块相等。不先从两边删除派生成员，也不向递归的任意对象开放“加字段”权限。

新增 `renderings.blocks` 是合法嵌套位置，其新块可有新 id，不误判成原块列表增项；整个 persisted 消息仍经过 CB3 完整 judge 和全树 ID 唯一检查。派生子块类型、模态差异、成对属性、非空 transcript、可见性与父子合取沿 CB3；子块自身再带 renderings/transcript 仍按 CB3 S-19 拒绝。原 `visibility`、`opaque`、原话、媒体引用、MessageId、response、ending、createdAt 均不能改变。新增块的 `producedBy` 形状合规只证明表示；实际由系统转换件产生仍是最终批写方的事实检查。

创建内容判定先无损复制及 MS7 Schema 校验，再验证只靠该值可判的 S-53 关系：ref.session 与 origin.session 相等；accepted 中两处 adaptation 完整相等且模型与 profile.routeName 对齐；input.messages 与 adopted.messages 每条通过当前消息 judge；工具表示沿 TD3 的 ModelToolEntry。accepted 与 rejected 不互相补齐，缺身份、缺来源版本表示、错成对字段或内在关系失败统一 `malformed`。本函数不是完整创建准入；实际 target/basis/selectedBy 与原求值依据的对应、sourceVersions 可取得且固定、凭据与真实原壳归属，由 runtime 持有真实来源后完成。现有快照规则不被扩大：不拿收到的 MP5/MP6 snapshot 重跑完整目录档案准入或从当前目录补值。

两类 undispatched 的单记录形状由既有记录 judge 接收：初次 open 拒绝带 creationKey 与 rejected payload 引用；accepted 后首次 dispatch 拒绝不带二者。是否确无 dispatch、是否已有 accepted created、cause 是否匹配取回的 rejected 内容、同键是否指回原 CallKey，都不是无前缀的单记录输入可证明的事。runtime 必须将其与原壳、原内容、权威日志放在自己的接收与提交边界核实，不能将 `brandRecord` 或本函数成功替代这些检查。

## 精确依赖、资源与绑定

截至本稿的 MS7 Schema 递归本地 `$ref` 闭包是以下 **22 份原字节资源**，其中 MS7 有 50 个定义。沿既有 CB3 `./schema-runtime` 编译固定图；不远程解析，不用新资源冒充旧 `$id`，不建调用方 schema 缓存。下表子路径写“候选”的是实施要求，不表示目前已公开。

| 精确资源 | 包公开来源与用途 |
|---|---|
| MS7 | messages `./schema`（候选切换）与 root；唯一当前消息执行面 |
| CB3、CB2 | content-blocks `./schema`、`./schema/v2`；块、严格 JSON 与历史精确资源 |
| OE1、IV1 | offer-expiry `./schema/v1`、identity-values `./schema` |
| CA3、CA2 | call-accounts `./schema`（候选切换）、`./schema/v2`（候选补齐）；标识家与传递图 |
| MP6、MP5、MP2 | model-profile `./schema/v6`（候选补齐）、`./schema`（现行 MP5）、`./schema/v2`；created 精确 MP6，dispatched 精确 MP5，旧固定图精确 MP2 |
| TD3、TD2 | tool-definition `./schema`、`./schema/v2`；ModelToolEntry 及传递图 |
| AM3、AM2 | asset-model `./schema`、`./schema/v2` |
| LC3、LC2 | loop-extension `./schema/v3`、`./schema/v2`；只读 Schema，不引它的 root 执行面 |
| MS3、MS2 | 本包 `./schema/v3`、`./schema/v2` 原字节资源；不能用于当前运行数据降级 |
| SP2 | skill-package `./schema/v2` |
| MCP2、Slash2、Connector2 | mcp-endpoint `./schema`、slash-command `./schema`、asset-model `./schema/connector/v2` |

新链 `MS7 → TD3 → AM3 → LC3 → MS3 → CA2` 与 `AM3 → SP2 → AM2 → LC2 → MS2` 解释为何本包自己的新图也需要老资源；不再沿用 v6 的“七资源”计数。这些包的 JSON 资源导入不建立 core messages 对 loop-extension 的运行时反向依赖；类型只从其规范 owner 的公开类型面取用。

另需保留 **MS6 `./schema/v6`（候选新增）**：现行 LC6 明确 `$ref` MS6 的 Message、AssistantMessage、ModelCallDispatchedRecord 等，MR10 又精确消费 LC6。MS6 不进入上述本包 22 资源图，由 MR/LC 消费者在各自固定图中注册它与传递资源。此保留不提供 messages `/v6` 执行入口，也不使 MS6 model record 可经 MS7 root 自动降级接收。MS2/3/6 每份保留字节、原 `$id`、公开资源路径和消费者范围须在制品检查中逐一核实。

| 消费语义 | 绑定和失效点 | 缺席与旧引用 |
|---|---|---|
| CB3、IV1、CA3 的共享值；TD3 ModelToolEntry | 显式静态模块依赖，无 Context 查找；打包时固定 Schema 与类型版本 | 缺资源或图编译失败即初始化失败，不下载、不换版 |
| MP6 created / MP5 dispatched | 各定义按原 `$ref` 编译；MP6 与 MP5 全部 Schema 断言相同、S-27 快照值不变，完整副本无需转换；MP6 S-8/S-33 的 token 准入变化仍由 runtime 承担，形状相同不证明来源相同 | 同形不允许重写历史快照；未来形状分歧时由类型 owner 提供精确表示 |
| MR10、RT11 消费本包 | MR10 复用 S-9 helper；runtime 导入共享技术值，并持有外部来源及写权 | 不建立 MS→MR 环、不替 MR 定义 Pending，不从消费引用产生提交权 |

## 状态、失败、存储和装卸

本节点没有可变业务状态、I/O、提交点、索引、保留记录、日志写入、时钟、密钥、网络任务或租户授权。**对存储提供者的要求清单为 0 条，装载效应为 0 项。**同步判定完成于本次输入，消费者卸载不撤回已返回的数据、不删除持久事实，也没有可由本包取消的在途异步调用。

| 取得的资源／贡献 | owner 与可用时点 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| 固定 JSON 资源、编译后的纯校验器；无 Cordis 注册 | 本模块；固定图完整编译后函数可用 | 任一资源缺失或编译错误，初始化失败，不发布半套可用入口 | 无外部资源释放；同步判定跑完，返回值仍保持原事实 |

共同配置政策：静态错误在初始化失败；显式调用值错误沿本包闭合拒绝集合，能力入口再按自身契约映射 `invalidInput`；可信来源实际不可取由 runtime 的 `unavailable` 表达，本包不伪造该来源或新增能力错误。无自定重试、容量或超时默认值。纯函数不产生持久日志或后台 telemetry；实际读写/权限/失败 trace 归 runtime 的边界，沿 [全局观测要求](../../../../foundation/observability-and-logging/requirements.md)，不得把正文、secret 或完整 payload 复制进观测流。

S-52～S-55 的引用内容保留、marker 发布与回收互斥由 [runtime 节点](../../model/model-request-runtime/README.md) 承接；S-9 的消息与 final 原批归它与既有授权日志写方。本轮无独立回收路径使用runtime私有同存续内容行；只有独立回收路径才要求同内容保留记录；消息/final仍用同一Session日志批的权威对象；本纯值节点既不是写入者，也不能用本地锁替其兑现。以下交错只在未来启用独立回收时必须由外部真实组合证据检查；当前无GC另验内容同存续及关闭不删除：发布者读“内容存在”后回收者先删内容再发布 marker；旧写方持保留责任未结束时新实例只看空 Map 回收，而旧写方随后发布。单条 Schema/judge 均挡不住这两种反例，M7-V7/M7-G3 不据此关闭。

## 关键选择与弱点

| 候选选择 | 落选方的最强论证 | 本方弱点与置信度 |
|---|---|---|
| 保持一个纯数据节点，服务/fiber 为零 | 新服务能集中替换判定实现与发布版本 | 静态消费者需共同迁移；这里无独立状态或资源可由服务承载。高 |
| S-9 关系由 messages 唯一公共函数实现 | 各最终写方自己比较，可直接结合其权限/来源证据 | 纯 helper 易被误读成授权；须明确后置的真实来源与原批写入检查。高 |
| 正向保持每个原成员，只允许两个明确新增成员 | 剥派生后整体相等更简洁，通用 diff 更易复用 | 显式遍历需要完整成员及数值负控；但剥字段会漏掉原派生覆盖，通用扩展会扩大许可。高 |
| 保留精确 Schema 资源，当前 root 单轨 | 保留旧执行 codec 可减少一次迁移范围 | 当前固定图扩大到22资源，且MR/LC另需MS6；必须付出闭包与制品证据。高 |
| 候选创建纯值 judge 与真实来源检查分层 | 一个“创建验证”服务可包住全部来源访问 | 消费者必须补齐真实源核实；本包不拥有资格、内容读取或提交。中高 |

## 消费者迁移与实施缺口

| 消费者／owner | 本轮必须迁移的公开面与责任 |
|---|---|
| messages 实施者 | 当前类型、Schema、50定义、无损 codec、记录 judge 和新纯函数共同升级；保留原语义测试；更新实际 `README.md` 与 `README_ZH.md` 并执行公开示例 |
| model-response 实施者 | MR10 消费 MS7；从本包导入候选 `judgeModelReplyMessage`，自己的 ready/final 同事实判定仍完整保持 original reply、inputCalibration 与原数；注册 LC6 所需 MS6 资源 |
| model-request-runtime／日志写方 | 共享值不复制；读原字节再核摘要、解析、归属和交叉事实；trusted converter/当前资格与消息+final原批另核；两类 undispatched 与同键认回靠权威记录 |
| model-profile、call-accounts 与上述固定图资源 owner | MP5、CA2、MS2/3/6 等必要资源按精确公开入口补齐；不将 `$id` 重定向到默认新版 |
| loop-extension／runner、pi-ai-transport、stream-assembly、session-log-jsonl、session-tenancy-table、资产输入消费者 | 当前 root 类型/codec 调用方编译和行为对齐；仅精确 Schema 依赖保留旧资源，冻结规范采用另走各自 owner；原消息种类、工具和多模态测试不删 |
| demo、core-verification、ts-checks 与所有双语公开文档 owner | 实际包制品与 root imports 共同迁移；示例说明关系通过不授予写权；旧执行私有文件不可由打包残留导入；不改存量数据 |

归装配事项逐项点名：运行时装配者选择内容存储与保留责任实现、Session 日志、真实入口身份/当前写权与撤销来源、转换来源、时钟及密钥。它们不进入本包；本批不建立新 `apps` 节点。既有 `examples/model-invocation-minimal-demo` 只能展示明确可信本地上下文，不冒充完整 Session/Run 或生产授权，生产承接仍为 M7-G3。此缺口不阻止本包纯值实现，但阻止将通过的结构判定解释为 durable/authorized。

本次新增绑定 **0**，既有 v3 绑定不改。没有本版实际验证；独立评审、语义接受、制品实现与外部组合证据分别由主线及各 owner 闭合，详见 M7-G1～G3。

MP6 资源与当前 MP5 完整副本的精确差异及制品验收见 [model-profile 窄资源增补](../model-profile/v6-schema-resource-design.md)；本节点不要求 profile 根执行面升级。
