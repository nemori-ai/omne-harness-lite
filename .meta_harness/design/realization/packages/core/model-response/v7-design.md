# model-response 当前格式直接迁移设计

2026-09-28，rev 1，**candidate；未接受、未实现、未验证**。节点仍为 `packages/core/model-response`，kind 为 provider，源码位置逐字相同。本页是纯模块的窄迁移，不新增能力、插件、服务或产品政策；已读实现，未声称双盲。原 design/v4/v5 正文与证据保留其历史范围，不作本次兼容实施要求。

## 精确输入、状态与迁移门

同一 baseline 为 `omne-harness-lite-design-2026-09-15`。已核 catalog：`data.model-response/6`（MR6）、`data.messages/5`（MS5）、`data.loop-extension/5`（LC5）由 D099 接受；`data.model-profile/4`（MP4）由 D097 接受。字段、Pending 表示、完整失败主体和限制快照的基线均来自这些接受版本。

| 本次目标 | 当前状态与采用边界 |
|---|---|
| `data.model-response/7`（MR7） | 后继候选；沿 MR6 S-1～S-40，只撤除旧格式兼容义务并更新精确依赖；尚未在本节点基线 catalog 登记或接受 |
| `data.messages/6`（MS6）、`data.model-profile/5`（MP5）、`data.loop-extension/6`（LC6） | 同批后继候选；完整值的结构与此前接受版本相同，精确版本闭包必须一起采用 |
| MR7/LC6/MS6/MP5 的最终工件 SHA | **null，等待候选发布并登记**；此页不能把正在制作的文件哈希冒充冻结采用 |
| 产品依据 | 输入限制为 PF-013 rev14/D096；其余需求按 MR6 精确依据继承，不自动升级产品 rev |

用户已要求第一版发布前直接破坏性重构，迁移全部当前消费者、移除兼容过渡。本设计服从该明确要求；但 MR6 S-40 仍承诺旧响应由精确旧版本读取结算，**本页不声称删除旧 codec 同时符合该旧条款**。MR7 等后继须先完成接受并由主线采用本映射。G7-1 只阻断与版本采用有关的交付，不重新打开已定字段和纯值算法。

四层分别为：语义接受——上述旧基线已接受，目标后继未接受；可实施——以下迁移路径为候选，受 G7-1 精确采用门约束；绑定证据——新增 0 条，原绑定保持旧范围；实际验证——本次没有产品代码或运行验证。

## 契约责任 → 纯公开面 → 实现投影

本表 S- 坐标指 MR7 候选，与 MR6 同号同结构；后继最终稿如改变结构须停止对应实施并回报。

| ID／契约责任 | 公开操作或贡献 | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| R7-P1：S-4～S-20、S-26～S-28、S-35～S-38 | 根 `ModelResponse`、`judgeModelResponse`、`validate`；名字为现存面，迁移实现为候选 | `src/v5/` 中多值头、无损数、原收场联合与有序拒绝并入根；根唯一 MR7，完整 Schema 原字节替换为 MR7 | V7-1/2/5；不以 Schema valid 等同业务事实已证 |
| R7-P2：S-39/S-27 | 候选 `PendingModelResponse`、`judgePendingModelResponse(value: unknown): ModelResponseJudgment`；`validate('PendingModelResponse', value)` | 纯接收投影与持久根分别编译，共用精确表示与有序判定构件；不伪造 `replyDisposition` 再调用根 judge | V7-3；持久写入仍只收完整 ModelResponse |
| R7-P3：S-40、S-36 | 根 Route 的完整 MP5 ModelProfileSnapshot/ModelAdaptationBinding | 只校验快照形状，保留全部 `upstreamInputLimits`/项目 cap/`updatedAt`；S-36 完整绑定的精确相等判断保留 | V7-4；不得调用完整 profile judge 重判 MP5 S-18/S-33 写方关系 |
| R7-P4：S-3/S-5/S-15/S-23，LC6 S-14/S-43 | 复用 LC6 FailureCause；完整 AfterModelCallFailureSubject 由 LC6 拥有 | 本包不重新定义或构造失败主体。runtime 从同一合法前缀产生完整 profile、dispatches、retryConclusions，再交 LC6 接收面；MR failed 响应是事实源之一 | V7-6；全历史完整性与可用性由 runtime/runner 验证 |
| R7-P5：S-6/S-9～S-11/S-26 | 原 schemaId、SCHEMA_DEF_NAMES、SchemaDefName、SchemaValidation | 19 个 `$defs` 含 ResponseFactsConstraints/PendingModelResponse，固定当前资源；MR-1 五组副本比较继续单向执行 | V7-1/7；19 是当前候选读数，最终采用时核对精确清单 |
| R7-P6：S-16～S-25、S-35/S-39 | 无 IO、无存储/Context 贡献 | 首 token/脱敏/处置/late/同批提交由原 runtime、transport、回复写方与会话日志 owner 承担，本包只判断显式值 | G7-3；纯函数通过不提升十三操作完成度 |

### 当前公开面与删除范围

目标 exports 仅本包根和 `./schema`，删除 `./v3`、`./v5`、`./schema/v2`、`./schema/v3`、`./schema/v5` 及对应旧源码/旧 Schema/构建制品。不新增 `./v6`、`./v7`、legacy alias、按输入猜版本或先新后旧的 fallback。MR7 完整 Schema 原 `$id` 不改写为“latest”；发布制品只带当前响应资源。

原无损 JSON、ExactDecimal、精确数比较及多值头语义直接复用。保持原参数绑定相等、收场互斥、首 token 与 ending 错配的具名拒绝和优先级；不把对象先经普通 JSON.stringify/parse 或 Number 往返。判定不修改、冻结或取得调用者对象所有权；`ok` 不作为捕获/授权/持久化凭证。持久根与 Pending 候选均先严格快照，再按 S-27 明确次序判定；Pending 的 `failed`、缺 reply、出现 disposition/late 是成员阶段 malformed，任意未知 outcome 仍优先 outcome_unknown，其余具名拒绝继续原优先次序。

RawHeaders 保持 string 或有序 string[]，保留空字符串、空数组、重复项、原大小写及缺席差异；不 join、trim、排序或去重。原 `src/v5/` 的必要实现移入根后删除旧目录，不保留重复 judge 来支持旧调用。

## 依赖、Schema 闭包与包依赖环

| 精确目标契约 | 公开解析与责任 |
|---|---|
| MR7 | 本包根/schema；完整资源及所有公开 definitions 逐一编译 |
| MS6、MP5、LC6 | 各 owner 的当前公开类型/schema；FailureCause 仍是 LC6 的八值，失败主体不复制到 MR |
| call-accounts/2、content-blocks/3 | 沿既有公开类型、ExactDecimal、无损 JSON 与 schema-runtime；不是本次全仓升级对象 |
| identity-values/1、offer-expiry/1 | 精确原类型/Schema；不得改为当前推荐版本；offer-expiry 的既有精确入口只兑现本契约仍有效的精确依赖 |
| content-blocks/2 的传递资源 | MP5、call-accounts/2 仍明确引用，按各自有效依赖提供；它不是旧响应兼容 codec，不在本节点改写或升级 |

继续使用既有公开 `createSchemaRuntime` 与锁定 Ajv 8.20.0，不增运行依赖。完整 Schema 资源与编译根分别核对：静态“文件含有引用”的图允许有递归边；实际编译的 `$defs` 可达图不能缺资源、错版、无限递归或绕去旧响应 judge。

本次只读候选完整资源扫描得到以下 **22 份**传递资源；最终候选 release 后重核。LC6→asset-model/3→LC3→MP2/MS3，以及资产图内部递归边均是当前精确契约依赖，不是旧响应运行兼容。沿现有共享 Schema runtime 的固定完整资源编译方法，不新建通用 resolver、不裁剪资源、不改 `$id`/$ref、不为消除历史数字而升级资产规格。

| 资源 owner | 当前 MR7 传递闭包必须承载的规范资源 |
|---|---|
| model-response | MR7；本包旧 MR2/MR3/MR5 资源没有进入这个闭包，删除对应旧导出 |
| loop-extension | LC6、LC3、LC2；后两者只作为现行资产契约的精确资源，保留必要 schema 子入口，不恢复旧运行 codec |
| messages | MS6、MS3、MS2；旧资源由其 owner 保留必要 schema 子入口 |
| model-profile | MP5、MP2；MP2 同样是现行精确依赖，非旧模型发送策略 |
| asset-model、tool-definition | AM3/AM2、TD3/TD2；沿现有公开资源入口和递归引用 |
| content-blocks、call-accounts | CB3/CB2、CA2；原无损数与调用账事实 |
| identity-values、offer-expiry | IV1、OE1；固定原资源 |
| skill-package、connector、mcp-endpoint、slash-command | SP2、connector2、mcp2、slash2；全为 LC6 所需 AM3/AM2 的传递资源 |

资源从各 owner 公开入口加载，不私读源码、不复制到 MR 包。必要 `./schema/vN` 只证明现行精确依赖可解析；与旧 `/vN` 运行 API、按旧格式判定/续接或双轨 codec 完全区分。初步扫描不是 Ajv 编译结果：仍须以原共享编译器构建所有 MR7 defs，证明闭包与循环引用可正常解析；缺口 G7-2 是精确资源承载/编译验证，不是重做共享编译基础设施的任务。

包依赖方向仍为 MR→上述纯包。messages 的 ResponseId 形状副本继续靠 MR-1 比较，不新增 messages→MR 的运行时导入；LC6 所有类型的 owner 不移入 MR；schema 引用环不等于许可 npm 运行时循环。依赖缺资源或编译失败暴露为构建/导入缺陷，不转成业务 malformed 或在线拉取资源。

## 当前消费者与同步迁移

范围为基线 `11c6c5b0` 的源码/测试实际引用；这些消费者必须与本包一起切换，不能以 demo 仍能运行作为保留旧入口的理由。

| 当前消费者 | 迁移责任（均为候选施工） |
|---|---|
| model-request-runtime：`src/types.ts`、`invoke.ts`、`invoke-policy.ts`、`response-construction.ts`、`anchored-invocation-types.ts`、`anchored-invocation.ts` | 所有 `/v5` 改为根；新构造完整当前快照；reply pending 交接使用 MR7 完整 Pending 值，不能仅给 reply 或先承诺 persisted；已有 responseFor 闭包不得替代完整事实交接 |
| model-request-runtime：`src/log-codec-domain.ts`、`log-codec-settlement.ts` | 删除 MR4/MR5 双判定和 legacy domain，当前承载格式只调用根；encode/decode、批识别、比较、结算必须拒绝旧 shape，不补当前目录字段；具体承载格式名由 runtime 的采用映射负责，本节点不选择新字符串 |
| model-request-runtime：`tests/anchored-invocation.spec.ts`、`invoke-policy.spec-d.ts`、`log-codec-settlement.spec.ts`，及其构造夹具 | 当前夹具包含完整限制快照、Pending 与完整失败主体；保留有效行为断言，旧入口成功用例改为不存在/旧 shape 拒绝反例 |
| pi-ai-transport：`src/http.ts` | RawHeaders 从根取；真实头获取/脱敏仍归 transport，迁移不得损失空值、多值或原串 |
| `examples/model-invocation-minimal-demo/src/demo.ts` | 根判定/类型与当前构造一致；明确新数据目录进行当前代际运行，旧用户数据保持原字节，不自动删除、补写或转换 |
| session-log-jsonl：`tests/model-data.spec.ts` 及 model-response-v4 夹具 | 当前生产根夹具迁移，未知/旧格式拒绝仍保留明确负例；日志模块不新增 response 版本判断或业务升级器 |
| 本包 src/schema、judge 与全部 tests/README/README_ZH | 删除本包旧响应 exports/多版成功对照及旧响应 Schema 编译，保留上表现行精确传递资源；迁移有价值的有序拒绝、数字、头和副本回归到当前根；双语示例只示范当前公开面 |
| `tools/core-verification/src/w6-stream-consumer.ts`、`tests/w6-public-types.spec-d.ts`、包依赖及制品消费者清单 | 集成 owner 全仓检索旧包子入口并更新当前执行者；历史 record、冻结规范和证据原件按历史读取，不重写成当前执行成功 |

## 状态、存储、失败与装卸

这是数据 owner 的纯模块：无 Cordis service/fiber/plugin、运行配置、密钥、计时器、监听、后台任务或跨调用业务状态。全局 Cordis 采用依据仍为 D025/4.0.4，此节点不使用其 API，不借用 basis 的生命周期保证。对存储提供者要求 **0 项**，本节点无提交点或跨 owner 同提交声明。

装载贡献和撤除责任均为 **0 项**；固定 Schema 编译产物仅为模块私有纯构件，初始化失败即模块不可用且异常明确暴露，无受管资源需回滚。同步调用自行结束；卸载 runtime 不会由本纯模块取消在途 HTTP。替换版本不能免除当前代际运行 owner 的未结算责任；旧数据拒绝不等于对当前已发送调用假称未发送。

沿统一观测约束，本包返回明确判定/异常，不创建日志后端，不输出输入或 rawHeaders。runtime 负责关联调用身份并记录拒绝；凭据/头脱敏发生在事实交接边界，本包不通过字段名推定可信来源。入口身份核实、时钟、密钥与持久事务均归消费 runtime/装配，现示例不自动成为完整生产装配。

## 关键选择与缺口

| 选择 | 落选方最强论证 | 本方弱点、置信度 |
|---|---|---|
| 当前根直接迁移并删除旧入口 | 多版本共存可让消费者分批迁移、旧日志持续可读 | 用户明确禁止兼容过渡；代价为同批迁移与旧数据明确不可消费，必须防止误写。高 |
| 继续纯模块，共用有序纯判定构件 | Cordis 校验服务可动态替换规则 | 数据无独立生命周期，服务增加不必要运行依赖；静态升级需重构建消费者。高 |
| Pending 单独公开判定、共享事实约束 | 先补 disposition 再调用持久 judge 可少写函数 | 先补值会伪造事实与错误次序；双判定需共同正反用例防漂移。高 |
| 原资源精确固定、完整公开资源闭包沿现有编译器 | 只加载 FailureCause 可达片段能缩小表面依赖 | 精确资产依赖含旧版本数字，必须解释资源用途并实测循环编译；不为整齐重做共享编译器。高 |

缺口与关闭条件详见 [verification 的当前迁移增量](verification.md#v7-当前格式直接迁移候选)。G7-1 归主线精确后继接受与本节点采用；G7-2 归本包和共享 Schema owner；G7-3 归 runtime/runner/日志/回复写方；G7-4 归集成与实际装配验证者。本页不接受自己、不新增证据绑定，不将完成本页计为十三操作的任何一项完成。
