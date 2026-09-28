## MR5 纯值切片实际验收

- 2026-09-27 MR5 实际纯值切片：主调度已技术签收 PV1～PV9 的本包有限范围，[原始运行与范围](../../../../record/evidence/2026-09-27-tests-model-response-v5-core/README.md)。HUB build/typecheck、387 tests、格式及规则通过；作者两份十包实际消费者与四个编译行为负控，独立77规范/360组合/17定义/492安装成员/两变异/六双语literal通过。独立原 Pass with issues 的版本导航文字已修；317 原档案成员读回。静态21资源、制品15资源、生产固定12资源/17定义范围分开，MR5-X1～X4 与完整 RT5/真实IO仍未闭合。本次新增绑定0、形式0、付费0。

## v4 候选验证边界（2026-09-27）

对象为 [v4-design.md](v4-design.md) 所列候选映射和 `data.model-response/v4`。本版没有生产实现运行，也没有新增绑定；下方 v3 的实际验证只支持原采用范围。规格证据不等于本节点提供者证据。

### v4 候选证据义务

| ID／条款与投影 | 所需证据与必须能失败的反例 | 当前状态 | owner 与关闭条件 |
|---|---|---|---|
| MR4-V1：S-4～S-19、S-26～S-28、S-35；P1 | 全部规范正反实例通过生产 `validate`/`judgeModelResponse`；完整原 Schema 逐字节一致；元 Schema及传递 `$ref` 解析成功 | 未开始；旧 v3 回归不覆盖 | 本包实施者；记录源码、精确资源和实际结果 |
| MR4-V2：S-36 前两项；P2 | 分别改变 implementation/definition/configuration 修订或一个嵌套值均拒绝；完整绑定相等通过，modelId 与 routeName 错配拒绝；`upstreamModel` 不参与比较 | 仅规格有限检查已有；生产未验 | 本包实施者；删除任一比较后对应反例须红，不仅测同一对象引用 |
| MR4-V3：S-27/S-28；P2/P3 | 新绑定错配分别叠加全部既有成员/具名跨字段失败，仍返回契约第一拒绝；`inBand` 缺码与具名失败叠加不抢先；不改变调用结局、不改输入 | 未开始 | 本包实施者；覆盖次序表及多处同时违规，禁止把 `validate` 顺序当 oracle |
| MR4-V4：S-19、S-37/S-38；P4/P5 | servingProvider 缺席、非空原串、空串/非串；别名/大小写不同保持原值且不直接判供应商违规；缓存正数/零/unknown 分别接受，缺失/额外镜像拒绝；大整数、极小费用无损，已知其他用量加未知缓存仍可为 upstream | 未开始 | 本包实施者；与 call-accounts/2 真实纯值组合，禁用浮点后再比较 |
| MR4-V5：S-6/S-9/S-11/S-26；P1/P6 | 默认 root/schema 固定 v4；`./v3` 保留现有 v3 纯函数/类型并钉 messages/3、profile/2 等精确依赖，同进程独立消费；v2 只核已有 Schema 资源闭包；规范字节/$id 核对；副本断言比较中的约束变异和同名实例字段变异必须被检测 | 未开始 | 本包与依赖包实施者；源码测试、构建产物测试、独立制品消费者同时闭合，依赖私有路径不可用；不新增 v2 纯函数 API |
| MR4-V6：S-28、SYS-OPEN；纯模块边界 | 不依赖 Cordis/runtime/存储/凭据；输入先严格无损快照，调用后无变异或静默修补；对象成员换序相等、数组换序不等、数字与布尔不等、大整数邻值不同、相等十进制不同词法相等 | 仅规格脚本含其中 5 个值变异；生产未验 | 本包实施者；正例加有针对性的反例；静态检查结合真实独立包消费 |

所有新增测试名和接口落点均待实施，不写成已存在的 `test:` 绑定。纯单文档性质不另建与 Schema 重复的行为模型。

### v4 已有实际执行

| 运行 | 输入与配置范围 | 实际结果 | 可支持的结论 |
|---|---|---|---|
| 2026-09-27 response-v4 规格检查 | [完整归档](../../../../record/evidence/2026-09-27-probe-model-request-runtime/response-v4.tar.gz)：43 份输入快照、脚本、命令、环境、stdout/stderr、摘要；规范输入以归档原件为准 | 退出 0；58 个完整实例：22 通过、36 拒绝；12 个新增绑定判定与 5 个精确 JSON 值变异符合各自预期 | 给定规格实例的 Schema 与新增比较检查；不运行产品包、不覆盖 S-27 全部次序，不自动覆盖后来变动的输入 |
| 本节点设计静态检查，2026-09-27 | 执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，cwd 为本执行工作树根；包含本次四件套 | 退出 0；末行原文 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=skip.` | 链接/登记/节点结构检查；所有 formal 明确跳过，不是纯值实现验收 |

完整运行的来源与限制亦见 [规格验证入口](../../../../spec/data/model-response/verification.md#2026-09-27-v4-候选验证)。不从探针暖读、目录声明或配置通过推导生产缓存命中。

### v4 覆盖缺口与外部 owner

| ID／条款 | 本节点无法证明的事情与反例 | owner、受阻消费者与关闭条件 |
|---|---|---|
| MR4-X1：S-16、S-22～S-25、S-35、S-36 后两项 | 文档内部绑定相等，但写入者曾在重试时换绑；当前实现撤除后读历史失败；响应与已出门事实不一致；先落首内容前外露或回复/响应分开提交 | runtime 与共同会话日志 owner；真实请求、重试、恢复、旧版撤除和同一追加结算场景。受阻的是完整 runtime 与应用验收，不是本包纯值实施 |
| MR4-X2：S-19～S-21、S-37/S-38 | 供应商值来自请求而非上游、别名被误判不一致、首内容后错配误记可重发；缺失缓存被猜成零、把写入量当读取命中、费用由 TTL 估算；响应含凭据 | transport 采集与 runtime 写入 owner；请求/上游/持久记录三方对照，缺席、别名、错配前后及脱敏负例；37 模型生产路径缓存验收须使用真实计数 |
| MR4-G1/G2 | 候选契约尚未接受；v4 和 v3 纯值子面尚未实现，没有本版生产反例 oracle；既有 v2 Schema 闭包须复核 | 主线接受与本包/依赖包实施者；response/4、profile/3、messages/4 精确采用后完成 V1～V6。新 runtime 消费不可提前宣称可用；未实施的 v2 消费者另行决定采用 |
| 归装配 | 时钟、密钥、身份核实、耐久日志和最终独立验收应用不在本模块 | 主线及应用装配 owner；明确应用节点与真实提供者后执行 X1/X2。该节点尚未由本任务建立，不以假会话或合法 DTO 样本替代 |

本节点的存储要求和受管装载贡献均为 0。没有需要构造跨存储提交交错的本地性质；跨 owner 的真并发和耐久性不得转记成纯值检查已覆盖。

以下为 v3/core 阶段的历史执行及义务，保持原坐标读取。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 6 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-response 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-response/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-response` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**242 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 5 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/model-response/verification.md`](../../../../spec/data/model-response/verification.md#证据义务)（V-1～V-14）。
本页只登记**落在本节点上的那一部分**；写入纪律归模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | 第一、二节每个 JSON 块过 `judgeModelResponse`，结果与「预期」逐一对上，拒绝的核对拒绝值；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| 与 `data.messages`、`data.call-accounts` 的副本对齐（`data.messages` 验证入口 V-12 的一部分） | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 的完整断言投影逐字相同；冻结注解差异、原片段 hash 与有效性反例另留证据，不声称片段同字节 | 未开始 | 本节点（[design](design.md#副本定义的对齐放在依赖方)的 Schema 位置限定比较口径） |
| 金额不经浮点 | 超出 2^53 的用量与费用金额读入再写出逐字相同 | 未开始 | 本节点（借 content-blocks 与 call-accounts 的无损读写） |

**不在本节点**：V-2～V-14（写入纪律、序列性质、首 token、脱敏、无隐藏重试、`late`，都归模型请求运行时）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

## D-068 当前验证epoch

当前设计输入为 `data.model-response · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。


## v7 当前格式直接迁移候选

对象：[v7-design.md](v7-design.md) R7-P1～P6；本次新增绑定 0、产品运行 0、形式执行 0。以下均为待验义务，旧 MR5 证据不迁标签。

| ID | 必须能失败的验收与反例 | owner／状态 |
|---|---|---|
| V7-1／P1/P5 | 最终接受 MR7 完整 Schema 原字节/$id 一致；19 defs 精确清单及元 Schema；公开根/schema 实际 pack 消费并编译每个定义，依赖 IDs 无缺失/重复错版；分别记录全文件引用环和实际编译可达图，不从“有环”推断失败或从静态可达推断通过 | 本包/Schema owner；待验 |
| V7-2／P1 | 全部规范正反例、有序拒绝和多处同时非法回归；未知 outcome 优先、dispatch 精确小于一、原 cause/ending/firstToken/绑定错配次序；不改输入，无浮点往返 | 本包；待验 |
| V7-3／P2 | complete/truncated/有回复 interrupted 的完整 Pending 正例；缺 reply、failed、disposition/late 任一出现为 malformed，unknown outcome 优先；持久根缺 disposition 仍拒绝；同一合法 Pending 由真实写方确定处置与 late 后可成持久根，其余事实不丢 | core 负责纯值；runtime/回复写方负责实际提交；待验 |
| V7-4／P3 | 快照缺任一新版必填、类型或条件域错误拒绝；形状合法但 MP5 S-18/S-33 写方关系不合的样本，MR 接收不额外拒绝；S-36 完整适配绑定错配仍拒绝。计数/金额/配置嵌套 exact 值不损失 | 本包；待验 |
| V7-5／P1/P3 | RawHeaders 字符串/混合数组/空 map/空数组/重复值均按规范；缺席与空不同；非法嵌套值拒绝；极大整数、极小费用、未知缓存不改为零；数组头贯通真实 transport→runtime→codec→reopen | 本包纯值与外部链分别报告；待验 |
| V7-6／P4 | MR FailureCause 精确 LC6；LC6 完整失败主体含当前完整快照、所有 dispatches/完整 retryConclusions。运行时按同一日志前缀保留顺序/重数/未发出的有效重试；读不全返回 unavailable，不能补空数组；MR 不增加主体构造器或历史 IO | core/loop-extension 与 runtime/runner；待验 |
| V7-7／P5 | MR-1 五组同义定义断言比较保留；真实包循环导入检查；破坏副本、错版 `$ref` 必须使相应检查失败；精确依赖 CB2/IV1/OE1 不因全仓 latest 悄悄改变 | 本包/集成；待验 |
| V7-8／公开迁移 | pack exports 和文件清单仅当前响应；旧子入口 import/JSON import 必须失败；旧 shape 在当前 root 拒绝，不测试“旧 judge 仍通过”；全仓当前消费者无遗留旧引用。冻结历史材料/证据不需改写 | 集成；待验 |
| V7-9／文档与边界 | README/README_ZH 完整根判定、Pending 与 RawHeaders 示例用实际包严格编译执行；纯模块无 Cordis/存储/网络/计时/凭据；缺 Schema/编译错不得冒充 malformed | 本包/独立验证；待验 |

### v7 缺口与受阻消费者

- **G7-1（MR6 S-40 → MR7，LC6/MS6/MP5 精确闭包）**：本基线 catalog 仅已接受旧坐标；后继未接受/最终 hash 未发布。主线完成后继规范接受、提供者采用和精确资源锁定后关闭；阻断宣布当前根迁移可交付，不要求恢复兼容。
- **G7-2（MR7 S-26/S-40、LC6 精确引用）**：22 份完整资源含现行资产契约要求的 LC2/3、MP2、MS2/3 以及递归边。各资源 owner 保留必要公开 schema 子入口，执行面仍删除旧 codec/旧 API；本包以现有共享编译器完整构建 MR7 definitions，并在实际 pack 中证明循环解析、无缺资源及精确 ID。未跑编译前不得称已验证；不重做共享 resolver 或扩展资产规格。
- **G7-3（MR7 S-16～S-25/S-35/S-39；LC6 S-14/S-43）**：完整事实捕获、Pending 交接后事务、late 判定、失败主体完整历史及首 token 耐久均归 runtime、runner、日志与回复写方。它们须在共同真实日志提交边界提供证据；本 data 包无自己的存储要求和同提交机制。阻断相关十三操作整体验收。
- **G7-4（MR7 S-40 与当前代际责任）**：runtime/transport/demo/session-log 测试及制品脚本须同批迁移；旧用户数据只拒绝，不修改/删除/回填。当前已发送请求的停止、结算和恢复仍归原运行 owner，不因破坏性重构消失。真实调用身份、时钟、密钥、日志装配待对应实施者验证，示例多轮成功不能替代完整装配接受。


## v8 恢复时序实施候选

对象：[v8-design.md](v8-design.md) R8-P1～P4；MR8/RT9 规范已接受，本映射未接受；新增绑定 0，生产实现验证尚无。既有 [有限规格验证](../../../../record/evidence/2026-09-28-formal-model-recovery-timing/README.md) 不替代以下生产判定、声明与真实消费证据。

| ID／投影 | 必须执行的正反例 | owner／状态 |
|---|---|---|
| V8-1／P1 | MR8 Schema 原字节/$id、完整22资源及私有成员资源；19 defs 用现有实际编译器全部编译；故意缺 MP5/误连 MP6 必须失败，必要历史资源正常闭环。实际 pack 根/schema 为当前，旧运行入口不可导入 | 本包与集成；待验 |
| V8-2／P1/P3 | Timing 独立接受 null，持久 interrupted 合法各分支 null/实际时间均按规范；缺 sentAt、整数、空字符串及 Timing:null 拒绝；complete/truncated/failed null 拒绝，Pending（含 interrupted）null 拒绝。严格类型用例：普通分支/任意 Pending null 不可赋值，持久 interrupted 可赋值 | 本包；待验 |
| V8-3／P2/P3 | 持久 complete 无 reply + null → reply_missing；failed 无 failure + null → failure_missing；有 reply 无 firstTokenAt + null → first_token_inconsistent；除 null 外均合法的非 interrupted → 最后 malformed。Pending null + ending 错配 → 成员 malformed；unknown outcome/dispatch_zero/cause_unknown 仍按 S-27 先于成员错误。反向注入“把 null 提前判”及“剥 Pending timing.allOf”必须使对应断言失败 | 本包独立验证；待验，不从 Schema 通过推导 judge 顺序 |
| V8-4／P4 | 合法 null 与已知 exact 用量/费用、多值头、完整原适配参数/快照并存，判定不改输入、不补空、不清零；原 S-36 绑定错配、S-40 shape-only、首 token 条件与无损数回归均保留 | 本包；待验 |
| V8-5／消费传播 | runtime invoke/Pending 精确时刻收窄，codec 捕获与 reopen 合法 null；sentAt:null 时仍拒绝 firstTokenAt 晚于 endedAt，实际时刻已知时仍验证完整顺序。demo、日志测试和 core-verification 当前消费者严格编译；中英文 README 原文示例编译执行 | runtime/集成与本包；待验 |

### v8 外部缺口与边界

- **G8-1（MR8 S-16/S-17/S-24；RT9 S-33/S-36）**：真实 durable dispatched、已知实际时刻保留、未知不代填、锚点后零 send 和失联恢复的正确分支归 runtime/transport/日志 owner；纯 core 不能证明。完整批认回、竞争提交、实际停止与 zero-HTTP 恢复须另验，不把 null 当授权。
- **G8-2（MR8 S-9/S-11/S-19/S-21）**：可信同次事实与原固定计划、已知账/头/身份保留由写方验证，未知费用不被 null 覆盖为零或已知；本包无 IO、配置及日志后端。来源政策未裁项继续原状态，不因本映射打开或关闭。
- **G8-3（MR8 S-26/S-27/S-39/S-40）**：本映射待采用、实现与验收；根 Schema 精确依赖仍含 MP5 而非随最新根自动升级。直接消费者须完成类型/资源闭包迁移，不能靠旧格式执行或类型断言消除差异。归本包与各当前消费者 owner。
