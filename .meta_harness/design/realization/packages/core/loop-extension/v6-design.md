# loop-extension v6 当前实现迁移候选

2026-09-28；状态 **candidate，未采用、未实施验证**。本稿替代本节点旧候选中的运行兼容过渡方案，旧设计与证据保留原坐标。源码基线为 `11c6c5b0`：包已存在，当前根实现 LC4，另有 `src/v3` 运行实现；不是“尚未建包”。本稿中的迁移目标、类型增补和入口组合均为候选，不表示已有 API。

## 输入、范围与接受门

已接受语义基线是 [D099](../../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md) 采用的 [LC5](../../../../spec/data/loop-extension/v5/contract.md)。目标 `data.loop-extension/v6`（LC6）及其 MP5/MS6 精确后继正在成稿；registry 尚未登记接受，资源哈希须在主线释放后核对。本稿据主线给定的机械演进范围起草：移除旧格式过渡义务、更新精确引用；保留 LC5 S-1～S-43 的值与判断责任。不能仅凭本稿把候选当已接受规格实施。

产品依据承接 LC5：PF-012 rev15、PF-013 rev14；其他来源沿该契约依赖表。本次不新定产品政策。候选的条款坐标以下均指 LC6；接受前以其正式释放正文再核。LC5 S-43／版本差异中旧记录继续按旧格式读取的义务，须由主线通过后继规范明确替换；本节点不自行忽略冻结条款。

范围是 `packages/core/loop-extension` 的纯值实现和当前消费者迁移。完整 runner、Loop、工具执行、日志读取与落盘、默认重试政策不在本节点。沿 [D025](../../../../record/decisions/cordis-adoption-version/decision.md) 采用 Cordis 4.0.4，但本包不依赖 Cordis；没有新增上游机制主张或 basis 绑定。

## 公开面、实现路径与精确依赖

根公开入口 `@omne-harness-lite/loop-extension` 及 `./schema` 一起采用 LC6。既有 `judgeValue`、`judgeInput`、`judgeConclusion`、类型、表、声明推出与正文端口维持职责，直接更新所消费的数据。新增候选类型 `ModelRetryConclusion` 对应唯一同名规范定义。删除 `src/v3` 和 `./v3` 的运行实现及分发，不增 `/v4`、`/v5`、猜版、回退或旧值转换入口。

`./schema/v3` 与 `./schema/v2` 继续发布冻结资源：LC6 自己引用 AM3，AM3 固定引用 LC3；AM2 与 ArrivalEvents 固定引用 LC2。这是当前规范依赖，不能用 LC6 字节冒充其 `$id`，也不附带旧 codec、旧运行记录读取或结算能力。只有精确资源图不再引用时才能删资源，不静默改消费者采用坐标。

| 固定资源闭包 | 本节点使用方式与理由 |
|---|---|
| LC6、MP5、MS6 | 根 Schema 原字节与原 `$id`；配置、完整 profile、发出记录与重试结论表示由这一闭包承载 |
| identity-values/v1、offer-expiry/v1 | 身份和时刻继续用现有精确公共入口；不因数字较小而升级 |
| content-blocks/v3；必要传递资源 content-blocks/v2 | 严格 JSON／无损数及当前引用闭包；CB2 是现有其他依赖明确引用的资源 |
| asset-model/v3、call-accounts/v2、tool-definition/v3 | 正文端口、调用身份、工具名字与 Duration 等维持规范精确依赖 |
| LC3/LC2、MP2、MS3/MS2、AM2、TD2、connector2、mcp-endpoint2、skill-package2、slash-command2 | LC6→AM3→LC3→MP2/MS3，以及 AM2→LC2 的当前规范传递引用；按原字节登记资源，仅供固定图编译，无旧运行 codec |

递归核对的固定图共 21 个规范资源：LC6/3/2、AM3/2、MP5/2、MS6/3/2、CB3/2、TD3/2、CA2、IV1、OE1、connector2、mcp-endpoint2、skill-package2、slash-command2。它们是当前 LC6 的完整资源图，不是旧输入自动接收路径。不得为避免这些资源另改共享 Schema runtime 的选择性编译语义。

`src/schema.ts` 通过依赖包公开资源入口建立闭包，禁止私有源码路径、网络 `$ref`、空 Schema 补位、同 `$id` 换字节。目标 Schema 有 **43 个 `$defs`**，含 `ModelRetryConclusion`；`SCHEMA_DEF_NAMES` 与实际规范集合相等。沿现有 CB3 `createSchemaRuntime` 与 Ajv 技术路径，不另造解释器。源码 `earlyResource` 用于既有拒绝顺序的私有视图需随新条件核对；现有 `allOf` 下标不能未经证明原样搬用，不得由此遗漏新必填/禁止条件。

## 契约责任到实现的投影

下表均为拟兑现点，新增证据尚未建立。

| 契约责任 | 公开组件／拟源码位置 | 精确采用与兑现范围 | 证据义务或缺口 |
|---|---|---|---|
| LC6 S-1～S-10、S-40 | `types.ts`、`tables.ts`、`declarations.ts`、`body.ts` | 声明、位置、干预力、引用和属性推出维持原语义；正文端口只替换采用资源 | LV6-1/6；不得引入资格、配置求值或派发 |
| S-11～S-18、S-36 | `types.ts`、`schema.ts`、`judge.ts`、`values.ts` | failure subject 完整保留 MP5 profile、MS6 dispatches、必填 `retryConclusions`；空数组仅表达已明确给定的空历史 | LV6-1/2/4；不能凭缺字段补 `[]` |
| S-19～S-29、S-37～S-39 | `judgeOutput`、`judgeValue`、`judgeConclusion`、`rewrite.ts` | 保持八种结论、十个拒绝值及优先次序；共享发出记录调用 MS6 单条判断，失败转 `malformed` | LV6-2/3；不把 Schema 通过说成正式派发允许 |
| S-30/S-31/S-42 | `Conclusion` 类型、Schema、`judgeConclusion(value, inputs)` | failure 位置三种记录均必带 `modelCallId`，其余位置禁止；与给定实际输入唯一 dispatch call 不等即 `malformed`，不复用工具 `callId` | LV6-3；缺输入／无效辅助参数沿既有 TypeError 边界，不能把明确领域关联错误改成 TypeError |
| S-43 | 候选 `ModelRetryConclusion`、failure subject 的协议槽位检查和无损复制 | 每个元素必须是完整有效 retry 结论，全部可见 `modelCallId` 与 dispatch call 一致；保留序列、重复值、作者、时刻、计划和全部原字段 | LV6-2/4/5；不能凭 JSON 相等去重或以 `at` 排序 |
| S-30～S-35、S-42/S-43 跨历史责任 | 本节点不新建存储／历史读取 API | runtime 生产者与 runner 接收/写入者核同会话、同完整日志前缀、条目身份、有效性、重数、完整性及顺序 | LV6-5 外部 owner；无法取得事实必须由生产者报告不可用，不能补空或假定试尽 |
| S-41 | 既有不透明 `EnvironmentHandle` 类型和词法检查 | 仅表示；不增加 Context 查找、租户绑定、凭据或句柄解析 | LV6-1；真实解析归 runner |

`judgeValue` 只在协议定义的 subject／结论槽位识别字段，不按任意 JSON 键名递归搜 `dispatches`、`profile`、`modelCallId` 或 `retryConclusions`。适配配置、工具参数等不透明 JSON 的同名字段仍是普通内容。单值可确定的跨调用矛盾立即拒绝；值本身不能证明未提供的日志条目是否缺失。

`judgeConclusion` 的 `inputs` 提供本次真实输入以核 `modelCallId`；不增加可从目录反查的隐式默认身份。`values.ts` 在前置校验通过后恢复 `ModelCallId` 品牌、独立复制和冻结每条完整 retry 结论及其计划；profile 配置、消息、工具参数中的精确数不能经 Number 舍入。复制/品牌恢复不能替代 `judgeModelInvocationRecord` 的正式判断。原始文本的重复键检测仍归入口的严格读取，已解析对象无法追认此前是否丢失信息。

## 当前消费者的同批迁移

以下为源码基线的实查清单；不包含未来尚不存在的调用者。类型/函数名为现有名字，迁移方案为候选。

| 消费者与实际位置 | 最小当前迁移 | 限制与验收 |
|---|---|---|
| `packages/core/model-response/src/{types,judge,schema}.ts` 及其 `v3`／`v5` 副本 | MR7 当前根采用 LC6，删除被替代的 MR 运行副本，由响应节点负责 | 不保留旧 LC3 `$id` 映射 LC6；完整失败主体传递与判定要组合验收 |
| `packages/model/model-request-runtime/src/decide-retry*.ts`、`dispatch-guard.ts` | 当前类型和输入生产/消费链采用 LC6，给完整 retry 历史 | 纯 LC 通过不替代日志完整前缀、重试计次、持久化与十三操作验收 |
| `packages/core/asset-evaluation/src/defaults.ts` 与其现行消费者 | 默认正文端口沿下述精确声明接线复用 root 行为并显式供给 LC3 资源；AE 自身精确契约采用不变 | AE 消费的 LC3 S-4/S-8/S-40 声明子集未变，必须以该精确子集做差异/组合检查；不声称整个 LC6 等于 LC3，不为 AE 保留整个旧 codec |
| `packages/core/arrival-events/src/types.ts`、`src/schema.ts` | `FailureCause` 类型复用当前 root 未变域，Schema 继续使用现行 LC2 冻结资源 | 只保留必要资源，不改变 ArrivalEvents 的规范坐标；枚举域逐值相等核对 |
| `packages/tools/asset-registry/src/tables.ts` | `LoopExtensionDefinition` 类型从当前 root 取相同声明子集 | 不展开资产新能力；验证类型、声明表行为无语义变化 |
| 上述包的类型/Schema/制品测试与本包 EN/ZH README | 一起改为当前根；删除只是为了旧导出存在的测试，保留原性质断言并迁移 fixture | 增加旧运行导出不可解析负例；精确依赖资源有独立例外清单 |

### AE 现行声明端口的精确资源接线

`packages/core/asset-evaluation/src/defaults.ts` 是这条组合的资源供给 owner。它从当前 loop-extension 根取得共用 `judge`、`deriveDeclarations`、`references` 行为，从 `@omne-harness-lite/loop-extension/schema/v3` 取得原字节 LC3 资源，构成 AE 所采用声明子集的 `BodyContract`：`schema` 明确为 LC3，行为复用根实现；不把 LC6 资源改成 LC3 的 `$id`，不加载 `/v3` 运行实现。`context.definition` 仅接受 AE 现行规范采用的七个定义（LoopExtensionDefinition、Power、LoopPosition、Dimension、ExtensionImplementation、ErrorPolicy、UnavailabilityPolicy），其他定义按既有无效辅助参数 TypeError 拒绝。无 definition 时仍执行当前共享声明完整判断。

该端口经现有 `defaultBodyContracts.loop_extension` 传给 `createAssetModelJudge`，由既有 `resources(bodies)` 将原 LC3 加入 AM 私有编译实例；其余 AM 固定资源及 tool/skill/mcp/slash body 原有资源保持。这保留该实例原有完整资源集合，不把 LC6 的整个新图塞进 AM，不要求共享注册表、全局缓存或新 resolver。LC6 根行为自己的完整 21 资源图仍由 LC 包独立拥有和编译，不能以两实例共用进程代替各自资源供给。

这是一份仍有效的 AE 声明契约的直接实现接线，没有旧模型请求解码、数据转换或过渡寿命。LV6-6 必须实际构造 AE 默认 AM judge、验证七定义与声明/拒绝行为；负控将该端口唯一 LC3 资源去掉或换成 LC6 时，AM 编译必须失败。若实际使用越出七定义或根行为与原声明义务不同，停止该消费迁移并报告，不能隐式扩域。

AE body port 的现有 `context.definition` 可以查询定义，不能把任意 LC6 新定义默认为 AE 原采用义务；真实 AE 调用范围应在组合检查中固定。当前可见七个声明相关 `$defs` 在 LC3／LC6 草稿中逐值相同，但这只是静态读数，不能代替推出规则、拒绝次序与独立制品验证。AE 的旧版实现删除是否属于本次消费者迁移，由其 owner 按现行采用清单裁定；本节点不得借此升级 Skill、工具、IV、CB 等无关依赖。

## 状态、装卸、失败和归装配

本包无业务状态、持久写入、事务、异步后台任务或 Cordis 注册，因此没有插件、fiber、service、inject、effect、event 或跨 owner 同提交边界。本节点对存储提供者的要求清单为空；runtime/runner 的共同日志前缀与写入栅栏须由各自节点承接，不用进程内锁或值数组假装兑现。

| 取得／可见 | 所有者与部分失败 | 撤除／仍为真 |
|---|---|---|
| 模块加载时编译固定 Schema 图；完整编译后提供纯函数 | 模块持有只读验证器；缺依赖/无效资源使初始化明确失败，不发布部分可用图 | 无资源 disposer；调用完成后值归调用者，包不持有会话或记录 |
| 每次调用复制并判断显式输入 | 调用栈拥有中间值；按既有表示拒绝与调用前提错误收口，不吞异常 | 无取消/排空接口；同步调用跑完即收场，不因消费者插件卸载撤销结果 |

装配不需给本包时钟、密钥或存储；`at`、身份和环境句柄均为显式输入。本包不认证输入者；入口身份核实、当前调用历史取得、不可用处置与日志先落后算归 runtime/runner。完整纵线装配尚待对应 owner 释放，demo 不是完整 runner 或生产 app 的替身。升级不改写、清空或补造用户旧数据；当前代际已受理工作的原恢复责任依然属于其运行时 owner。

## 关键选择与代价

| 选择 | 落选方最强论证 | 本方弱点／反证信号 | 置信度 |
|---|---|---|---|
| 维持纯模块，现有函数直接升级 | Cordis 服务可统一发现与替换 | 运行时必须自己装配和承担跨记录责任；若产生独立资源/生命周期须重新判断 | 高：没有新增运行事实 |
| 删除旧 codec、当前消费者一起迁移 | 双轨可让既有消费者分批迁移 | 单批集成影响较广，必须列全实际引用；这是既定发布前政策，不重开选择 | 高：用户已裁定 |
| 保留当前精确引用的 LC3/LC2 及其传递资源 | 删除所有旧号导出更容易扫描 | 需要说明资源用途；若已无当前 `$ref` 消费即删除，不演变为运行兼容入口 | 高：AM3/AM2/ArrivalEvents 实际固定引用 |
| 同一纯声明实现服务 AE 未变子集 | 留完整 LC3 body codec 可直接沿用旧测试 | 需独立证明所消费子集一致；若发现语义差异则报告契约/采用缺口，不静默扩大接口 | 中：七个定义相同，行为组合待验 |

## 缺口与受阻消费

1. LC6/MP5/MS6 正式资源、catalog 坐标、接受及 provider 采用尚未释放：阻止本候选被当作实施授权；由主线完成。与 LC5 旧读取义务的取代关系须明确。
2. S-37/S-42/S-43 的新实现、43 定义闭包、独立复制及全部当前消费者组合未验证：由本包实施 owner 与消费者 owner 按 [LV6 清单](verification.md#lc6-直接迁移候选证据义务) 完成。
3. 同会话完整日志前缀、条目身份/重数/顺序、重放不重求最终结论属于 runtime/runner；本稿不能把尚未提供的真实存储证据登记为本包绑定。

新增绑定 **0 条**；既有 LC3 绑定保留原运行范围。候选检查通过只说明文档/引用检查的范围，不表示 LC6 提供者已被接受或真实验证。
