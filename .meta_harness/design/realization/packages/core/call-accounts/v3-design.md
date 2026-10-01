# call-accounts CA3 候选增量

2026-09-29，`kind: provider`，candidate，未接受。节点及既有源码均为 `packages/core/call-accounts`；源码已存在，本稿不修改源码，也不取代 [CA2 已采用设计](design.md)。

## 输入与适用范围

精确坐标为 `(omne-harness-lite-design-2026-09-15, data.call-accounts, 3)`，见 [catalog](../../../../registry/catalog.json) 的 candidate 条目。语义输入固定为提交 `3f597c18` 中的 [CA3 contract](../../../../spec/data/call-accounts/v3/contract.md) 与 [Schema](../../../../spec/data/call-accounts/v3/call-accounts.schema.json)；下文 S- 坐标均属此版本。后续候选修订须核差异，不能把可变链接当作固定文本。

本批新增责任的产品范围为 PF-013 rev16、PF-012 rev21、PF-015 rev20；其余继承条款的当前来源由规格 owner 逐条复核，本稿不声称产品来源已全量对齐。边界背景见 [reference lifecycle 提案](../../../../record/proposals/model-runtime-reference-lifecycle/README.md) 与 [r4 交叉修订方向](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md)。本节点可独立起草；全批契约与节点 gate 完成前不得采用。

**契约承诺**：S-40～S-42 把 ready/final 唯一选择交给实际日志/成本读面；S-1～S-39 的值与纯计算义务沿前驱保留。**共同约定**：保持纯模块、现有公开操作及精确十进制；迁移当前格式消费者而不增兼容执行入口；无新账务服务。**本稿的实现推导**：现有显式输入足以承接唯一选择结果，CA3 不要求修改求和签名。它仍待独立节点评审。

## 实现路径与公开面

复用已有 `packages/core/call-accounts/src/index.ts` 公开入口。以下符号均已存在；“候选续用”指本次 CA3 的采用关系，未声称 CA3 已实现。金额沿 `decimal.ts` 的 `ExactDecimal`：无损 JSON 数字转整数系数与十进制指数，用 `BigInt` 运算，经 `toJsonNumber` 返回无损值；不经二进制浮点重算，也不能修复进入本包前已丢失的精度。

结构校验仍用当前依赖 `ajv` 8.20.0 与 core Schema；本次无新增库、fork 或服务。源码包版本当前为 `0.0.0`，它不是契约版本。CA3 Schema 相比 CA2 的变化仅为 `$id`、`title`、`description` 中的版本身份；没有新增 ready/final 账类型。

### 契约责任 → 公开操作／Cordis 投影 → 实现与版本 → 依据或缺口

| 行 | 契约责任 | 公开操作／插件服务（候选续用） | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|---|
| CA3-P1 | S-4～S-18、S-27～S-29、S-37～S-39 的既有值形状和判定 | 既有类型、`validate`、`judgeAccountValue`；无服务 | `types.ts`、`schema.ts`、`judge.ts`，Schema 迁到 CA3；归属与 late 事实由写方给 | 值形状未变；不能据准入通过推出来源、授权或 late 判定真实；V3-1 |
| CA3-P2 | S-5、S-26 的本地精度 | `ExactDecimal` 与既有严格无损读写；无服务 | 复用 `decimal.ts` 与 content-blocks；金额保留完整十进制值 | 候选无算法改动；跨 payload/日志/输出每跳保真归各边界 owner；V3-2 |
| CA3-P3 | S-22～S-24、S-40～S-42 的纯求值部分 | `prepareAccountGroup`、`summarize`、`effectiveCost`、`summarizeUsage` | 复用 `evaluate.ts` 的完整输入准入、冻结投影、原失败值与精确求值 | 只计算已交入的显式集合；不新增持久查询能力；V3-3～V3-5 |
| CA3-P4 | S-40、S-42 的授权、完整来源与唯一选择 | **外侧责任**：runtime/日志成本读面；CA 无新增操作 | 对同一已授权 Session 当前来源前缀先选唯一账值，再调用 CA3-P3 | 无 CA3 真实组合证据；G3-2，V3-6～V3-8；不得把纯 sum 通过当完整总账 |
| CA3-P5 | S-10、S-17、S-25、S-38～S-41 的归账、补账与镜像调用关系 | **外侧责任**：原写方、runtime/成本读面；包内只算明确输入 | 原壳核验及原 Session/Run/attempt 归组在外侧；包内排除工具镜像金额、套用目标补账 | 归属没有进入 `ModelAccountInput`，不由 core 猜出；G3-2，V3-4、V3-7 |
| CA3-P6 | S-21、S-42 的诊断与上下文边界 | **外侧责任**：runtime/读面结构化诊断；CA 不发事件 | 外侧诊断所选来源阶段与 ResponseId，按权限裁剪；账与 marker 不进模型上下文 | 不在纯计算增日志副作用；V3-8，受全局 [观测要求](../../../../foundation/observability-and-logging/requirements.md) 约束 |

本稿没有任何“CA3 已兑现”声明。CA2 历史证据继续只支持其原坐标和原范围。

## 外侧交入什么，现有函数为何够用

本段是 S-40～S-42 对实际消费者的候选接线要求，不新增读面 API 或账内失败枚举。

1. 实际读面取得当前读取授权，限定原 Session/Run 范围，在同一合法当前来源前缀内认出已知发出、ready/final 与补账；核实原壳 tenant/session/run/attempt/initiator。查询者换 Run 不改原归属。
2. 对每一原 Session + ResponseId，已确认 final 优先；否则取已确认 ready 所引用的完整原 `Usage`、`Cost`。二者都无时交原在途/恢复责任收口，不能省略已知发出或填零。ready payload 不可取得/验证即外侧 `unavailable`；未知授权/来源同样不能调用纯 sum 后返回成功总账。可判坏表示仍沿 S-27。
3. 每个选中原响应只交一个既有 `ModelAccountInput`，成员是 `responseId`、原 `cost`、原 `usage`。不附加 phase、CallKey、payload ref、当前 Run 或伪造账身份。`ModelUsageInput` 同样每个响应一项；来源阶段留在外侧诊断。
4. 外侧在同一 Session 内交完整工具账与补账，补账保留原目标、原时间与精确金额。`models` **没有 Session 字段**；模型补账不能靠其 `sessionLog` 字符串在本包完成 Session 核验。调用方必须先核补账承载壳与目标同 Session，再按原 Run 分组。**本候选装配前提**是每次纯求值使用已核实的单 Session 组，这不是新增账内字段或契约承诺。跨 Session 聚合若存在，由外侧分别选择、求值后聚合既有 summary，不把相同 ResponseId 直接混成一笔；本批不交完整全局账面。
5. `prepareAccountGroup` 验完整值后形成冻结内部投影，`summarize` 依原规则应用最新无歧义补账一次并求和；它内部已排除工具 `model_call` 镜像及 `total_usd`。`effectiveCost` 是显式单目标求值辅助，不能先把它的派生费用覆写成原账再送完整汇总；完整汇总入口拒绝原模型费用使用 `later_correction` 来源。`summarizeUsage` 仍只核显式模型用量集合，不证明完整账组或费用补账合法。

因此不把 ready 与 final 两个物理记录直接交入 `models`，不在 core 里按 ResponseId 去重选赢家，也不按 CallKey 合并不同实际发出。现有重复账失败仍是误组输入的防线，不能承担日志来源选择。

## 依赖、作用域与绑定

| 精确契约／外部节点 | 本节点采用方式（候选） | 变更与缺席政策 |
|---|---|---|
| `data.identity-values/v1` S-5/S-11/S-17/S-31 | 静态 core 类型/Schema，身份不补默认值 | 随当前包图切换；缺依赖或坏 Schema 初始化失败 |
| `data.offer-expiry/v1` S-22 | 静态时刻表示/比较，不读取时钟 | 无运行时服务发现或重试 |
| `data.content-blocks/v2` S-14、`data.asset-model/v2` S-3 | 沿 CA3 catalog 精确依赖；实际包提供既有无损 JSON/身份与标识判断 | 不因外侧消费后继版本而擅升 CA3 语义依赖；当前依赖来源复核归规格 owner |
| `data.model-response/v10`、`data.messages/v7`、`capability.model-request-runtime/v11` | 都是本批 CA3 的消费者/原事实 owner；只接受它们送来的上述显式值 | 不建立 CA→MR/MS/runtime 的包或契约反向依赖；后继接口未成稿的部分不猜 |

无配置项、服务键、`inject`、isolate、Fiber、effect 或事件。外侧 Cordis 采用 4.0.4，依据 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)；本包无直接依赖，本候选不依赖任何 Cordis 上游语义，故没有新增 basis 绑定或待核对上游主张。

共同配置政策：静态非法构造/配置在初始化失败；外侧显式调用坏输入沿其闭合 `invalidInput`；可信来源不可用为 `unavailable`。本包值层仍返回已有拒绝值/求值失败，不把运行期来源错误塞进值枚举；本稿不增重试、超时或容量默认值。

`bindings.yaml` 保持原字节，新增 **0** 条；保留的 1 条 CA2 有限测试绑定不覆盖 CA3。ReferenceLifecycle 模型存在不等于本节点已有实现证据；本候选的真实读面与负控义务见 [verification](verification.md#ca3-候选增量2026-09-29)。

## 状态、并发与失败

本包没有持久状态、外部提交、异步任务或晚到回调。一次同步纯调用针对显式输入完成；消费者的卸载不赋予本包取消或回滚语义。无效值不转 unknown，合法 unknown 不转 0，重复账/孤立补账/补账冲突不被静默跳过。

真正交错属于读面，必须验证以下两条，而非用纯函数单测代替：

| 交错 | 必须观察到的结果 | 责任与局限 |
|---|---|---|
| 读面取得含 ready 的合法前缀 P；写方发布 final；读面继续求值；下次读取得 P′ | P 只用 ready，P′ 只用 final；原费用相同，绝不先计 ready 又纳入较新 final | runtime/日志成本读面固定来源前缀；core 不知道 P/P′ |
| 读面在 P 中看见 ready；取 payload 时不可用，同时 final 在后续前缀发布 | 对 P 无可验证完整值则明确 unavailable，不能跳过 ready 或临时混入 P′；重取完整新前缀是独立读取 | 来源保留与一致读取归 runtime/存储提供者，纯 sum 无法兜底 |

本节点没有跨 owner “同一提交”写入义务，也没有可命名的共写存储对象；不据此推导外侧已满足引用保留或 final 原批唯一写入。

## 装载、撤除与存储要求

受管装载贡献 **0**、对应撤除 **0**；无连接、监听、timer、任务、内容租约或存储句柄。模块加载只准备本地校验/函数；失败不发布半成品服务，没有外部资源待交接。已有显式值与同步结果由调用者持有，不因外侧重新装配而撤销。

**对本节点存储提供者的要求清单：0 条。** 不选数据库、不建账表、不增加事务或共享锁。S-40/S-42 的同前缀读取、payload 完整性及留存是 [model-request-runtime](../../model/model-request-runtime/README.md) 与日志/成本读面 owner 的义务，由其节点列存储抽象要求。

**归装配**：本包无时钟、密钥或入口身份核实接线；外侧生产读面仍须承接当前读取授权、Session 日志及内容存储、原归属来源和诊断出口。当前开发示例不等于生产 Session/Run 实现，本批不新建 apps 装配节点；生产承接者未建立记 G3-3，不能用 caller 布尔替代。独立纯模块验证不依赖该生产装配完成。

## 关键选择与最强替代

| 选择（候选） | 落选方最强论证 | 本方弱点／反证信号 | 置信度 |
|---|---|---|---|
| 保留纯模块，0 Fiber/服务 | 集中账服务可统一跨读面的权限与选择，减少重复逻辑 | 完整性必须由外侧真实组合证明；若无人认领则总账消费受阻，不能靠本模块代偿 | 高，S-3/S-40/S-42 明确归属 |
| 保留公开求值签名，外侧先选唯一来源 | 传入 ready/final 判别联合可在类型层阻止某些误用 | 当前 `ModelAccountInput` 不携 Session/phase；调用方可能双传或错组，须靠组合边界与负控发现 | 高，S-40；待 V3-6/V3-7 |
| 原计算与金额实现复用；当前 Schema 升 CA3，具名保留仍被精确消费的 CA2 规范资源 | 只保留一个 Schema 文件最简单；并存旧执行入口则可少改旧调用者 | 混合 Schema 图必须显式注册两个 $id，保留资源增加打包核对成本；不能把保留资源变成第二套 judge/sum | 高，当前 LC6/AE3 仍引用 CA2；未做实现回归 |

## 具体变更面与消费者迁移

下表是实施义务，尚未执行；旧接受/冻结文档保留，当前产品包不并存 CA2/CA3 执行入口。

| owner／范围 | 候选改动与完成判据 |
|---|---|
| 本包 Schema 与元数据 | `schema/call-accounts.schema.json` 换成被最终采用的 CA3 精确副本；`schemaId` 通过既有 `schema.ts` 读取新 `$id`；更新 package description。新增候选具名 `./schema/v2` 出口，承载 CA2 原字节资源（候选文件 `schema/v2/call-accounts.schema.json`），保住仍被当前契约精确引用的 CA2 URI；两个资源分别核权威字节，不重写冻结消费者 refs |
| 本包 `src/types.ts`、`index.ts`、`judge.ts`、`evaluate.ts`、`decimal.ts` | 现有类型和公开操作足够；无行为/签名改动要求。不得新增 ready/final 类型、持久查询、授权或静默去重；生成声明也不得残留错误版本说明 |
| 本包 tests | `fixtures.ts`、`examples.spec.ts` 改当前规范入口；保留原正反值与十进制验证，新增 V3-3～V3-5 的显式输入反例；不把 raw marker 假装合法模型账传入 |
| 本包双语 README | `README.md`/`README_ZH.md` 更新 v3 Schema 与当前格式；示例明确使用已授权同 Session 中**先选出的唯一值**。展示 ready/final 两次独立读取的相同结果、一次补账和 unknown；不写尚未存在的外侧查询 API，不用文档示例假装已核授权 |
| MR10、MS7 与其他当前 Schema/codec 消费者 | 对各自精确 `$ref`、注册 Schema、类型 import 和打包副本成组核对；本批新引用取 CA3，仍明引 CA2 的规范图按下表保留 CA2。防互引的 ResponseId 同形义务放消费者检查，无 CA→MR 反向依赖 |
| runtime/成本读面 | 认领 CA3-P4/P5/P6、实现唯一选择与完整来源检查，再使用原函数；真实日志接替、权限、补账和新 Run 读取验收在外侧 |
| 其他实际直接消费者、工具与公开示例 | 按 [consumer-impact](../../../../spec/data/call-accounts/v3/consumer-impact.md) 及当前源码依赖图逐项核 scope；历史契约保留原采用，当前类型/codec/示例迁移不得通过旧入口维持兼容。完整图由主线/规格 owner 复核 |

### 规范 Schema 资源图的精确保留

既有本包只公开 `./schema`，没有 `./schema/v2`。CA2/CA3 值形状相同不使它们的 `$id` 可互换；保留 CA2 资源是当前冻结契约的精确依赖闭合，不是旧执行兼容。禁止把 CA2 URI 重定向成 CA3 或原地改 CA2 内容。

| 真实消费位置 | 当前精确依赖与候选迁移 |
|---|---|
| `packages/core/call-accounts/src/schema.ts` | 继续 root `./schema`，随采用切 CA3；不新增 CA2 judge/sum |
| `packages/core/arrival-events/src/schema.ts` | 当前 AE3 及其 LC2 资源仍明引 CA2；将 accounts Schema import 改为候选 `@omne-harness-lite/call-accounts/schema/v2`，不自动改 AE3 契约 |
| `packages/core/messages/src/schema.ts` | 新 MS7 的 CA3 refs 用 root Schema；如该装配图保留 MS2/MS3，则它们仍取具名 CA2 资源，按实际图同时注册 |
| `packages/core/loop-extension/src/schema.ts` | LC6、保留 LC2/LC3、MS2/MS3 明引 CA2；当前 messages 切 MS7 后又引 CA3。原 accounts import 改具名 CA2，并为新 MS7 图显式引入 root CA3，两份按各自 $id 注册 |
| `packages/core/model-response/src/schema.ts` 及 `tests/current-copies.spec.ts` | MR10/MS7 用 CA3，保留 LC/MS 规范资源仍有 CA2 refs；root CA3 与具名 CA2 同时进入规范图，current-copies 对当前类型采用新坐标，保留资源另核原字节 |
| `packages/core/stream-assembly/src/accept.ts`、`values.ts`、`abandon.ts` | 通过 arrival-events 的公开 judge/validate 间接依赖 AE3→CA2；没有直接 accounts Schema import。打包组合需证明 AE3 图仍解析，不能因 current root 升版而启动失败 |

本候选只指定以上迁移义务，不修改这些消费者。打包验收须同时包含 `./schema`→CA3 与 `./schema/v2`→CA2，并确认缺少 CA2 的负控确实使现行 LC6/AE3 解析失败；单测只编译新 MR10 不够。

## 缺口与受阻消费者

| 缺口 | 坐标／缺失内容 | owner、受阻消费与闭合条件 |
|---|---|---|
| G3-1 | S-1～S-42 候选语义与来源尚未完成全批 gate | 规格 owner、主线；阻止 CA3 正式采用及依赖实施；本稿不裁其他契约未决行为 |
| G3-2 | S-40～S-42 / G-13：实际同前缀完整来源、唯一选择、权限、补账与镜像归组无真实 CA3 证据 | runtime/成本读面 owner；总账消费者不能声称收全/不双加；以 V3-6～V3-8 真实组合闭合 |
| G3-3 | S-25/S-26/S-38/S-42：生产身份/日志/内容读取与原归属的装配承接 | 主线指定生产应用 owner；本批无新 apps 节点，生产总账交付受阻；不阻止独立纯计算验收 |
| G3-4 | S-5/S-22～S-24/S-27～S-29：CA3 Schema、消费者图与公开示例迁移未实施、未复验 | 本包实施者及各消费者 owner；以 V3-1～V3-5/V3-9 的当前制品和示例运行闭合 |

前驱 G-3/G-10 等仍以契约为准；本稿不补造完整 ToolRuntime、Run 读面或其失败政策。
