## MR5 纯值切片实际验收

- 2026-09-27 MR5 实际纯值切片：主调度已技术签收 PV1～PV9 的本包有限范围，原始运行与范围。HUB build/typecheck、387 tests、格式及规则通过；作者两份十包实际消费者与四个编译行为负控，独立77规范/360组合/17定义/492安装成员/两变异/六双语literal通过。独立原 Pass with issues 的版本导航文字已修；317 原档案成员读回。静态21资源、制品15资源、生产固定12资源/17定义范围分开，MR5-X1～X4 与完整 RT5/真实IO仍未闭合。本次新增绑定0、形式0、付费0。

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
| 2026-09-27 response-v4 规格检查 | 完整归档：43 份输入快照、脚本、命令、环境、stdout/stderr、摘要；规范输入以归档原件为准 | 退出 0；58 个完整实例：22 通过、36 拒绝；12 个新增绑定判定与 5 个精确 JSON 值变异符合各自预期 | 给定规格实例的 Schema 与新增比较检查；不运行产品包、不覆盖 S-27 全部次序，不自动覆盖后来变动的输入 |
| 本节点设计静态检查，2026-09-27 | 执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，cwd 为本执行工作树根；包含本次四件套 | 退出 0；末行原文 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=skip.` | 链接/登记/节点结构检查；所有 formal 明确跳过，不是纯值实现验收 |

完整运行的来源与限制亦见 [规格验证入口](../../../../spec/data/model-response/verification.md)。不从探针暖读、目录声明或配置通过推导生产缓存命中。

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
新原始运行与逐项签收记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-response 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-response/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-response` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**242 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。原始执行、制品与范围。
- 逐项技术接受：本节点 5 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；精确 ID、坐标和前提。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
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

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## D-068 当前验证epoch

当前设计输入为 `data.model-response · v3`，规范资源在 acceptance.json 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。


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

对象：[v8-design.md](v8-design.md) R8-P1～P4；MR8/RT9 规范已接受，本映射未接受；新增绑定 0，生产实现验证尚无。既有 有限规格验证 不替代以下生产判定、声明与真实消费证据。

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
## MR9 输入校准值映射候选

2026-09-29，对象为 [v9 映射 revision 1](v9-usage-calibration-design.md) R9-P1～P5；MR9/RT10 均未接受。本增量绑定 0，产品运行 0；下列均为待执行义务。旧版本运行和规格模型结果不换成本包 MR9 验收标签。

| ID／条款与投影 | 必须能失败的验收 | owner／状态 |
|---|---|---|
| V9-1／S-26/S-41/S-45，P1/P5 | MR9 规范 Schema 原字节/$id、25 defs 精确集合、既有22资源和私有成员资源用实际编译器全部编译；故意缺 MP5/错绑 MP6/漏一个新 def 要失败。实际 pack 仅当前根/schema，旧运行子面导入失败；依赖原精确 Schema 闭包仍可解析 | 本包/集成，待验 |
| V9-2／S-39/S-41/S-43，P1 | 持久/Pending 均缺 inputCalibration 或任一子项拒绝；三类观察/全部 unavailable reason；input unavailable + output known 必填自有 projectionRevision 为正例，漏/空版本为反例；类型编译不能用 optional 或任意 string reason 放过错误，Pending sentAt:null 仍拒绝 | 本包，待验 |
| V9-3／S-27/S-44，P2 | 多错误顺序：unknown outcome/dispatch_zero/cause_unknown 先于新增成员错；新增成员错先于 ending 错配；成员合法但新关系错时 reply_missing、reply_ending_mismatch、first_token_inconsistent 等原具名拒绝优先。注入把关系提前/全部用 Schema bool 取代 judge 的变异须红 | 本包独立验证，待验 |
| V9-4／S-41～S-44，P2 | 从完整有效值分别改变 binding 嵌套任一修订/值、两个 projection 相等关系、provenance 同名事实、output source/数量；精确已知分项和大于 total、三项齐却选 upstream_total、source 非 upstream 却选 from_usage 必须拒绝。unknown 不补零；合法 unavailable/inconsistent_usage 保留原用量，input unavailable/output known 通过。超 2^53 邻值、对象键换序、数组顺序/重复分别给正反例 | 本包，待验；不声称检测真实摘要与原字节错配 |
| V9-5／S-41/S-43/S-44，P3 | copy 对合法片段返回无损自有深快照；修改来值嵌套配置/fieldPaths/blockDigests 后结果不变；结果及全部嵌套容器被冻结，数值精确。getter/cycle/undefined/非法类型不运行 getter、不丢字段。片段局部版本不等拒绝；片段 copy 成功但完整 route/usage 不合的响应仍被 judge 拒绝 | 本包及真实 runtime 消费，待验；边界为值所有权，不是来源认证 |
| V9-6／S-45/S-19，P4 | 同一完整 MR9/Pending 经 runtime 生产 codec capture/encode/decode 后所有新增字段、原精确 usage/cost 和 unavailable reason 保持值相等；未知提交恢复使用原完整批，替换当前 adapter 后不得重算旧字段；缺字段旧日志不回填、不改写，按当前能力语义不可用 | core 负责纯值部分；runtime/SL3 负责原批、IO/恢复、原字节保真，分别验收；待验 |
| V9-7／SYS-OPEN、S-26/S-44/S-45，P3/P5 | 独立制品实际导入六类型/copy/validate/两 judge；README/README_ZH 原文完整示例严格编译执行；transport/runtime/demo/日志/core-verification 当前消费者同批编译。静态/实际消费者检查无 Cordis、网络、存储、tokenizer、当前租户读取；Schema 编译故障不伪装 malformed | 本包与集成，待验 |

新增测试名未落地，故不登记 `test:` 绑定。Schema-only 样本需与完整 judge 分别记录 oracle；不能仅比较同一对象引用或把模型假设当成运行事实。

### MR9 覆盖缺口与受阻消费者

- **G9-1（S-41～S-45）**：契约及本映射未接受、无本版产品实施；阻断正式 MR9 消费和交付声明。owner 为主线接受、本包实施及独立验证；采用精确快照后执行 V9-1～V9-7，旧证据不自动覆盖。
- **G9-2（S-45、RT10 S-80～S-83）**：共同存储对象仍是 SL3 原 session-log batch 内的 response（包含 inputCalibration）及应提交 reply。core 无第二写方或独立存储要求；runtime/日志 owner 必须验证两种交错：提交前另一读者不得取得耐久锚；原批已落但丢回执且 provider 换代，恢复认回/重送原批，不重造计量。部分 response/reply 提交、重写历史、unknown 提前发布的反例须失败。阻断完整 runtime/日志验收，不把纯函数通过当原子性证据。
- **G9-3（S-41～S-44／规范 G-16）**：真实 projectionRevision 编码、摘要/输出块逐项对应、上游输入统计范围、model/provider 映射、来源脱敏及 φ/δ 精度均归固定适配/计量提供者；core 不读取真实来源、不授权、不运行 tokenizer，不证明 hash 无碰撞。阻断相应模型的真实校准复用认证，不阻断共享表示实施。
- **G9-4（规范 G-17）**：PF-010 compaction 硬 fit 与估算门的整体保证归产品/上下文主线；本包无压缩实现、逐消息 token 拆账或硬窗口证明。受阻的是该整体保证声明。
- **归装配**：runtime/宿主 owner 提供授权身份、时钟、凭据、真实停止和耐久日志；本批未建立新的正式应用装配。完整生产消费者与跨进程验证仍须由主线落实，开发 demo 不能自动替代。

### MR9 本次检查范围

本次只检查三个指定设计文件的新增链接、目录范围与差异格式；全树规范 gate 交主线在完整设计树执行。稀疏检出中未物化的历史 evidence 不判为规范缺失。本页没有新增产品运行或 TLC 执行声明。
## MR10 原响应与未处分内容候选义务

2026-09-29，R10 候选，全部待执行；不改此前运行/采用。兑现映射见 [v10 设计](v10-reference-result-design.md)，新增 bindings 0。

| ID | 必须失败或成立的真实检查 | 负责面与当前边界 |
|---|---|---|
| R10-V1 | MR10 root/Schema 与 MR10、MS7、CA3、MP5/MP6 所需闭包全量解析；原 Pending、final、partial failed/interrupted 值均按各自入口判断，根 final 不接受缺处分的 Pending | MR pure；待实施，不是网络证据 |
| R10-V2 | Pending 原数 >2^53、长小数、未知费用、raw、多值headers与inputCalibration完整保存；getter/重复JSON键/非JSON值拒绝；不以字段白名单漏未来成员 | MR strict边界及实际公开制品；只判值 |
| R10-V3 | 同 Pending 的三种合法 final 关系可通过，改任一原事实（id、route、reply、原派生、usage/cost、headers顺序、校准）均 malformed；对象键换序与数值同值不误拒；两侧混合错误按 pending→final 及各自固定优先级 | 新 `judgeResponseFinalization`；变异掉原字段比较应导致验收失败 |
| R10-V4 | 最终化与复制不调用当前 provider/meter、不重算旧digest；known/unknown/source均保留；给final新增派生而改原reply必须拒绝 | MR pure + runtime消费；不证明上游统计准确 |
| R10-V5 | 最终写方实际组合MR关系与MS唯一消息扩展关系：合法新增派生的Assistant可同批，改已有派生/原成员/伪造系统来源/当前无权必须分别拒绝；unknown只认回原批，不重新转换 | runtime/消息写方真实组合，MR单测不能关闭真实来源与原子性 |
| R10-V6 | 同ResponseId的ready/final传入成本读面只计一次，原unknown不零、原Session/Run不转移、补账一次；不得把单值judge通过当成来源齐全 | runtime/成本读面 + CA3；外置真实组合待验 |
| R10-V7 | 实际pack安装只用公开入口；CA2/CA3、MS6/MS7、MP5/MP6等精确资源各按原$id可达；移除必要旧规范resource出口或注册时必须失败；不能用URI重定向通过 | MR与各数据资源owner；无旧执行兼容接口 |
| R10-V8 | README/README_ZH的Pending→final示例、拒绝例和未知账例从实际制品严格编译执行，runtime/transport/core-verification当前消费者同步构建；旧MR9实现证据不记为本轮通过 | 包实施者及独立验收者 |

R10-G1 采用门、R10-G2 新实现/纯值证据、R10-G3 外部真实内容/权限/转换/日志/选择证据保持开放。没有新增存储提供者、正式应用或完整Session/Run验收承诺。

## 当前公开定义资源闭包后继候选（2026-09-29）

[共同后继](../messages/public-definition-resource-closure-followup.md)以 MS7 50/MR10 25 公开定义及真实私有入口为编译根，各9份规范资源；RC1–RC5替代原全依赖文件defs扩张要求的范围尚待主线采用。T26固定输入的75公开编译/18因果删除反控已有，生产注册迁移、实际制品与冷构建仍待；原冻结设计/证据保持各自范围。

## MR11 ACK 候选义务

对应[v11](v11-acknowledgement-design.md)，全部待执行，bindings新增0。

| 编号 | 验证 | 边界 |
| --- | --- | --- |
| R11-V1 | 25公开defs与既有两个private入口、最终必要资源冷编译/缺URI负控、packed跨包与严格声明 | 不编译依赖无关defs，不引回全图循环 |
| R11-V2 | MR11原Pending/final正反、精确数及原合法消息派生关系回归；ACK不是第四处分 | 形状未变的旧证据限定精确diff复用 |
| R11-V3 | 保存原Pending→ACK→模型副本删除→consumer自持完整原值→摘要核→真实veto/consumed或独立persisted | 只给reply不能合成完整final，缺/篡改route/raw/calibration拒绝；原O/I不重算 |
| R11-V4 | 原final/ACK并发、当前撤权、原批unknown与新结算暂存恢复、原值不变且late真实 | 纯包不能冒称日志/Storage/权限已测；由runtime组合兑现 |
