# 验证覆盖与实际证据

## v7 发布前破坏性演进

本轮表达复评点名的版本自称、精确消费坐标与前驱执行声明已定点修订；MR7 与 runner5 当前产品依据按实际消费范围核对。字段结构、行为模型与既有操作责任保持不变。

本轮从已接受且冻结的 `capability.model-request-runtime/v6` 起草 candidate v7，基线 `11c6c5b0`。源接受依据为 D-097（MP4）或 D-099（其余六份）；本版没有接受、冻结或实现完成声明。

### 变化的影响（本轮）

- 只更新本批精确链 MP5 / Directory5 / MS6 / MR7 / LC6 / RT7 / runner5，并删除旧格式 codec、只读、认回与结算过渡义务；既有 IV、CB、日志、资产与 hooks 等精确依赖不升级。
- 字段、值域、Schema 结构、操作、失败集合、发送门、数值与策略不变；RT S-34 的完整失败主体重取继续原义。data 的 `$id` / `$ref` 与注释中的对应坐标同步迁移。
- 不原地改写、清空或回填用户旧数据；不兼容输入沿既有边界明确拒绝。当前代际已经受理的任务、不可变快照、未知结果、原批认回与释放结算责任继续成立。

| 证据义务 | 可失败观察 | 状态 / owner |
|---|---|---|
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 本次检查结果见下；规格起草 / 集成 owner |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 本次检查结果见下；规格起草 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 未开始；相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | 未开始；runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 未开始；对应消费者及验证 owner |

### 本次实际检查

本轮使用本树 `uv run --locked python` 执行临时审计脚本，实际输出：

```text
PASS: 584 frozen source hashes unchanged; 4 schemas structurally identical after exact $id/$ref remap; 276 refs resolved; 58 formal source/config files byte-identical; 86 explicit schema cases matched; RT S-34 unchanged except coordinates; all dependency clauses unchanged.
NOT RUN: TLC/Alloy; production old-format rejection; current-generation recovery/settlement and actual IO.
```

`uv run --locked python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip` 的本轮检查返回 0，输出 `PASS`（gate=internal; formal=skip）；候选中央登记尚待集成，检查通过不声称已登记或接受。`git diff --check` 返回 0。

本次核对本基线全部 **584** 个冻结资源，脚本与日志在本次任务区交集成 owner 保留，尚未归档为 record/evidence。本版 82 个规范资源中的 58 份形式源/配置均与各自前驱逐字节相同。**本轮形式工具未运行**，源有限结果只保留相同模型输入与断言范围，不提升为本版真实实现验证。当前格式拒绝与责任不丢失的实现场景仍为未开始；原有缺口的 owner 保留，旧格式分发缺口改为当前格式采用与拒绝证据。

### v7 候选变化与证据

本版仅继承该专题性质与来源证据，实际状态统一见本节「本次实际检查」；不声明本轮重新运行模型或实现测试。


## 2026-09-27 v4 精确接受与有限形式结果

[D086](../../../record/decisions/model-runtime-tail-settlement-adoption/decision.md)接受最终contract `4a31cb8b…`及27资源，未提升实际验证状态。独立架构／表达复审关闭ER1～4；全部24形式资源与revision2运行输入一致，新增四组规范向量仍待实际执行。运行及输入权威见 [新形式run](../../../record/evidence/2026-09-27-formal-model-request-settlement/README.md)：原run1为Fail，修复模型括号后run2新SANY／3正／6指定负控有限Pass。run2所测contract仍27f547…，不改称最终正文已执行；旧RT3继承形式不重标签为本轮运行。真实IO／完整合法读权／生产Run／共同codec和旧写者实际停止／多值headers、全部十三操作与37认证均未完成。下面candidate／未执行状态按其历史事件读取，当前接受沿D086与registry。

## v3 候选变化与证据

**S-36 表达收敛（本次）**：按主线及独立架构确认，明确正常已知收场的 `run_cancelled` 与锚点未知隔离后 S-33 恢复分开；无耐久中断意图时，恢复只据 opened 有无落既有 `runtime_lost` 两支，不声称系统停止原因跨失联已保存。补系统停止后 opened 有/无的规范对照；不新增意图、记录、失败值或恢复禁止政策。仍为 67 条、13 个服务操作，S-55 九项未改，模型未改未重跑；真实故障验收未开始。本轮快照与检查在 `tmp/model-request-runtime/runtime-v3/system-stop-isolation/`。

**RT-AR1 回执未知修订（本次）**：主线裁定区分函数可见序列与耐久 opened 事实。S-15/S-16/S-51/S-52 的立即失败分支限确知未提交；S-17/S-29/S-33/S-55 明确未知回执或取消后迟到提交先隔离、不写普通响应/不重试、真实停止与有效栅栏后按完整权威读回恢复。保留 S-33 两种既有时机、中断意图优先、S-55 独立函数结果；67 条、13 个服务操作及失败枚举不变。新增 SessionLog2 S-22/S-23 实质消费，registry 仍由主线登记。

**新增真实验收义务，未开始**：对已提交但丢回执、未提交但回执未知、取消门等待后迟到成功、旧追加未静止、旧 tail 假空及无 Run 旧属主未退出逐项故障注入；检查恢复前 unavailable/零内容/零重发/无响应，恢复后依据 opened 与中断意图精确结算、timing 一致、账恰一次。owner 为 runtime、真实日志提供者和验收装配；规范实例已补，现有有限模型均不含该真实 IO 范围，本次不改模型、不重跑 TLC。输入快照及检查记录位于 `tmp/model-request-runtime/runtime-v3/opened-ack-unknown/`。

**依赖接受状态对齐（本次）**：按 registry 更新 RT3 首部的七项依赖为 accepted，并同步 G-25、演进说明及版本外入口；依据为 D-070/D-073。RT3 自身仍为 candidate，S-66/S-67、规范行为、精确依赖坐标与条款、模型及元数据依赖均未改变；下文历史起草记录中的 candidate 描述只反映当时状态。

2026-09-27，工作树 `panqiwei/model-request-runtime`，基线 `d4eaf7673bc161bf22f6682385151e080d3323ae`。本轮只起草候选，不改 v2 冻结资源、不接受规格。候选坐标 `(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 3)`。

**变化的影响**：S-1/S-4/S-7/S-28/S-29/S-33 采用完整适配绑定，直接候选依赖为 model-profile3、messages4、model-response4、目录3、AE4、registry3、LC4。content-blocks/tool-definition/stream-assembly 采用已接受 v3，session-tenancy 采用已接受 v2。先前候选用 manifest3 已提交求值承载设置读取；独立架构反例后，本次由 S-66 当前输入端口取代，manifest3 仅保留历史导航。S-10/S-24 当前 model、S-28 basis 的原选择窗口、S-21/S-29 每次现求两个时限与 S-7 旧调用绑定分开。新会话仍显式 selectModel 写真记录，不猜初选。S-53～S-66 新增函数及投影、引用寿命、内容门、宿主、观察者、诊断及当前输入责任，原十三个业务操作不增加。S-54 发送前取消为外层分支，S-60 retryDelay 为本批技术候选；S-28/S-29 新增已有历史发出的续接规划拒绝分支，均未追认为旧版已有。

需求复核：PF-013 rev 13 只收窄既有验收的据点适用与显示归属，本包不承诺据点持有出厂凭据；PF-012 rev 15 明确结算不受旧尝试栅栏拒绝，原 S-17 已承载。其余采用 PF-009 rev 8、PF-004 rev 12、PF-001 rev 19、PF-015 rev 11。新适配与函数行为由主线施工简报及 model-request-adaptation rev 2 及 read-projection 当前输入增量候选分配，不伪装成产品正文已接受的新 rev。

| 验证对象 | 必须执行的证据 | 本轮状态 |
|---|---|---|
| S-53 精确绑定、恢复旧版缺席 | `AdaptationBinding.tla` 正向配置、两个预期反例；真实日志恢复后移除旧实现，核对账不联网/再发 unavailable | 正向无反例、两份否定各得指定反例（实际输出见下）；真实组合未开始 |
| S-54～S-56 首内容门与取消 | `ContentGate.tla` 正向配置、两个预期反例；所有快照/增量读面门前无内容，gate reject 与 abort 后迟到 resolve | 正向无反例、两份否定各得指定反例（实际输出见下）；实现验收未开始 |
| S-54 发送前取消与 S-60 retryDelay | 表示校验/规划拒绝/取消的终局次序；none/full/half/decorrelated 的 u=0、u趋近1、D=0、退化区间及非法配置向量 | 规范实例已写；实现符合性验收未开始 |
| S-9/S-10/S-21/S-66 当前输入与纯求值 | captured standing 只作配方、当前本机成员有效性/内部权限另核、真实 session/root/workspace 配方、当前持有/配值、租户错配、源版本竞争、无 model 无锁、显式初选、每次发出时限现求 | 当前端口候选已写；实际生产者及组合验收未开始；旧 manifest 历史读面不能代证 |
| S-54/S-60 公开函数独立性 | 无会话/租户/存储/Cordis 的独立消费者；仅一次 send；无合成业务身份；纯判定零副作用 | 未开始 |
| S-57～S-59 传输构件 | 已有 T1–T20/SC1–SC3 不因本版省略；精确规划→一次 send→流读；原始参数、推理、计费、身份不外传 | 未开始；上游真实模型证据由提供者报告 |
| S-61 宿主生命周期 | 登记与停止竞争、在途取消实际收口、结算失败与释放次序；独立验证真实组合 | 未开始 |
| S-62 观察者 | 错会话同 callId、错 dispatch、snapshot/delta 衔接、慢消费者按事件数与字节数分别触顶、消费异常 | 未开始 |
| S-63 诊断 | 正常/拒绝/失败/取消/恢复全链关联，秘密哨兵、缺 usage 与 0 区分、导出失败、关键诊断缺口状态；对照耐久锚点失败 | 未开始 |
| 原有运行时义务 | v2 原规范场景与三条真并发/崩溃验收继续；新类型依赖与行为须重新过符合性 | v2 既有证据保留原范围；没有本轮产品实现证据 |

注册/撤除、直接函数与 runtime 共用版本引用的有限模型由主线拥有 `v3/formal/Adaptation.tla` 及其配置；本起草者不以 ContentGate/AdaptationBinding 模型代证该范围。主线实际执行的[正向日志](../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation/stdout.txt) exit 0，20404 generated、5430 distinct、深度 17；三负控各 exit 12，分别反驳 NoAcquireRetired、NoDisposeWithLease、BindingPinned，原始运行参数与输出在[证据入口](../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md)。RegistrationDoesNotAdopt 与 AdoptionFailureKeepsProfiles 只有正向检查，不声称变异有效性已覆盖。首轮 exit 150 语法错误保留于 lifecycle-formal。新增模型不含真实资源释放、追加失败或多会话状态；限制见[formal 入口](v3/formal/README.md)。

**本轮形式工具实际执行**：2026-09-27 使用 `/usr/local/bin/tlc`，原始 banner 为 `TLC2 Version 2026.09.12.025210 (rev: 867aefb)`。两个正向和四个否定配置均用 1 worker、180 秒外层上限，关闭 deadlock 检查（终态允许无动作，不声称死锁自由）。首轮因两条 action property 写法非法均 exit 150，保留原记录；修正为 stuttering 包裹后第二轮如下：

| 配置 | 实际输出 | exit |
|---|---|---|
| ContentGate.cfg | `Model checking completed. No error has been found.`；25 generated、21 distinct、深度 7 | 0 |
| AdaptationBinding.cfg | 同上；66 generated、49 distinct、深度 9 | 0 |
| ContentGate_NoWait.cfg | `Invariant NoContentBeforeGate is violated.` | 12 |
| ContentGate_IgnoreCancel.cfg | `Action property NoRevealAfterCancel is violated.` | 13 |
| AdaptationBinding_UseLatest.cfg | `Invariant SentUsesOriginal is violated.` | 12 |
| AdaptationBinding_MissingFallback.cfg | `Invariant SentMatchesRecord is violated.` | 12 |

原始 argv、cwd、输入副本及 SHA-256、raw.log、exitcode、时间已由主线归档至第二轮运行清单（见[运行原始档案](../../../record/evidence/2026-09-27-probe-model-request-runtime/runtime-v3.tar.gz)中对应路径）；首轮原始错误保留在其上级 runtime-v3。两模型 SHA-256 分别为 `ContentGate.tla: 3610b3ba7b7ec3b92d48190de90bd4155dc3b49f56ab4e7c024706ae06d2e95e`、`AdaptationBinding.tla: dcdc3fcf8615a533bf09645c1e3690f4dcb341af68f0e12a2e2a411b5c3d32f4`，配置哈希见输入哈希（见[运行原始档案](../../../record/evidence/2026-09-27-probe-model-request-runtime/runtime-v3.tar.gz)中对应路径）。每个 result.json 保留完整命令，形式为 `tlc -metadir <独立目录> -cleanup -noGenerateSpecTE -workers 1 -config <配置副本> <模型副本>`。归档只对应所列形式输入：后补根属性与读面依赖的契约文字不在该模型输入里，不冒称这些新语义已经运行验证。证据只能支持 formal 入口所列有限范围，不能称为实现证明或接受依据已齐全。

**检查状态**：本轮已运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`。最后一次完整 raw 在工作树 `tmp/model-request-runtime/runtime-v3/final-candidate/design-check.stdout.txt`、`design-check.stderr.txt`、`design-check-run.json`，exit 1，共 4165 错：主要为主线新归档 response-v4/inputs 的原始 Markdown 快照相对链接被全树检查器扫描为断链，另含进行中的 asset-evaluation/v4 3 锚点与 response-v4 的 6 个 tmp 外链；本 runtime 包没有报错，已报对应 owner。该结果后补 S-40/G-26 的主线模型映射与根读取规范实例；该次检查时新增求值依赖仍待整批对齐；本次对齐后的结构检查另记如下，不能把部分无报错称为整树通过。registry 按任务授权由主线唯一集成，本起草者仅返回条目候选，未自行修改清单。尚无独立评审，未接受。

**本次有限对齐的影响**：只更新消费坐标、精确条款与候选状态，引用主线 read-projection 账本；data.agent-definition/v1 的声明域由 AE4 S-45 消费，不另复制定义。S-9/G-20 初选政策不扩张，原形式输入字节不变，本次未重跑 TLC；归档 tar.gz 链接原样保留。结构自检执行结果在本轮交接快照记录，不把候选齐稿当作实现或验收完成。

**当前输入增量的变化影响（本次）**：独立架构指出历史 E 不能承担 current settings，主线据此裁定 S-66 currentEvaluationInputs.read；manifest3 改为历史参考导航，从直接依赖移除。AE4 增 S-6/S-7/S-15/S-29，session-tenancy/v2 S-8 提供真实租户锚；S-10/S-24 消费当前求值，S-28 basis 保留原选择窗口，S-29/S-30 每次发出只现求两个时限，不改旧调用绑定。输入 IO/一致性由 packages/assets/evaluation-input-store 承担，读取时点/evaluate/错误零出网由 runtime 承担，真实生产者由 acceptance app 验证。

**当前授权来源对账修订**：S-66 捕获 standing 仅作会话求值配方；每次组输入由真实本机权威或明确采用副本另核当前成员有效性和内部调用权限，保持 AE4 PRE-3，不以旧 captured effective 放行，也不逐请求向中心更新会话身份/roles。失败、规范实例与 G-9 增加当前失效、未知、无权以及固定根 C16 失配零 HTTP；runtime 不改 holding 迁就根。AE4 通用输入文字的采用关系由其 owner 修订，本包不改他包。本修订未改形式模型、未重跑 TLC，实际当前授权及输入提供者验收仍未开始；增量结构检查与哈希记录于 `tmp/model-request-runtime/runtime-v3/current-authorization/`。

S2-B1 随 LC4 候选精确采用处理：失败主体保留完整 profile3/messages4 绑定，runner3 为反向消费者候选；不裁字段迁就旧 LC3。续接重新 plan 的输入错误分支按历史已出门计数区分：零次保留首次模态终结，已有发出时三类拒绝均为 invalidInput 并保持原状态；新增 bad-tool→repair 与 new-modality 零 HTTP 规范反例。未更改形式模型，没有重跑旧模型并冒称覆盖 S-66；所有旧 raw 与归档链接保留。

本次结构检查及最终规范输入哈希记录在工作树 `tmp/model-request-runtime/runtime-v3/current-input-port/`；它们验证引用/登记和表达结构，不验证当前数据生产者的真实 IO、并发一致性或恢复新输入行为。候选未接受，actual fresh producer 验收未开始。

**默认重试身份增量**：S-35 指向新增 S-67，由本契约唯一拥有 `{category:loop_extension,name:"omne-official:default-retry"}`，声明位置沿 after_model_call、维度沿 `{ending:failure}`。runtime → LC4 消费补 S-2/S-4/S-5/S-6/S-7/S-20；runner 反向消费本条识别系统件。重试行为、参数、生命周期及替换规则不变，未设出厂 power/onError，未把 retry 或 record 加进 Power。命名由主线技术裁定；实例补身份正反例，实际 runner 识别验收未开始。本次只跑结构及引用检查，不改或重跑形式模型，旧 raw 均保留；原始结果在 `tmp/model-request-runtime/runtime-v3/default-retry-identity/`。

**报给主线**：G-25 直接候选依赖改含 LC4、移除 manifest3，AE4 当前输入条款与 session-tenancy2 已标明，仍待主线登记、独立评审、接受与真实组合验收；G-26 注册/撤除机制接受与真实组合由主线负责；G-27 已给精确关系与向量，仍待技术评审接受。G-9/G-20 已区分候选读取路径与尚无生产者的初选，不吞旧缺口；沿用未关闭的 G-5/G-6/G-11/G-12/G-17/G-22。无词条的旧记录简称与新的函数/端口接口描述名保留为非领域身份，不新造领域对象。

---

以下保留 v2 的历史验证记录；其中起草期 candidate 等措辞不代表当前 registry 状态，也不覆盖 v3 增量。

`capability.model-request-runtime` v2（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范、模型与实现修订。

**当前状态**：第一轮独立评审之后的修复稿（另经 2026-09-25 修复波 1b、修复波 2 原地改，都未改模型），行为模型在 2026-09-24 整组重跑（下文「实际执行」，输入、哈希与日志在主检出 `tmp/formal-runs/model-request-runtime-v2-2026-09-24d/`）；**没有实现，没有执行过任何规范场景或测试**。
模型检查的结论只对所列常量成立，**不是无条件证明**，也不代表任何实现符合本契约。

## 证据义务

### 形式工件

模型、配置与断言 ↔ 条款的映射在 [formal 入口](v2/formal/README.md)。

| 条款与性质 | 模型／配置 | 前提 | 状态 |
|---|---|---|---|
| [S-15](v2/contract.md#s-15-两个锚点先写后行) 两个锚点先写后行；[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢) 结算幂等、先到者赢；[S-22](v2/contract.md#s-22-同一次调用的发出序列) 第 3、4 条（开口之后跨尝试不再发出、只在策略类故障或无声失联之后再发）；[S-30](v2/contract.md#s-30-dispatchagain) 守卫 1、2；[S-31](v2/contract.md#s-31-interrupt) 意图先落；[S-33](v2/contract.md#s-33-reconcile) 对账（失联发出被追补且不重发；没发出过而有中断意图的写调用终结） | `Invocation.tla` ＋ `Invocation.cfg`（允许回退）、`Invocation_NoFallback.cfg`（不允许回退）；formal task `model-request-runtime-v2-invocation`、`model-request-runtime-v2-invocation-no-fallback` | 常量：2 家、至多 3 次发出、至多 2 次停机；对「出网、首 token、四种收场、中止、撤除结算、对账」弱公平；写下一条响应体是原子的 | **本机跑过，退出 0、无反例**（2026-09-24 修复稿，见下）。**只有六条不变量有否定配置证明能失败**（下一行）；其余分类见 [formal 入口](v2/formal/README.md#配置与它检查什么) |
| 上一行里六条断言**能失败**：`NoDispatchAfterSpoke`、`ContinuationOnlyAfterStrategyOrSilentLoss`、`NoDispatchAfterSeen`、`QuiescentSettled`、`NoDispatchAfterInterrupt`、`AtMostOneBodyPerDispatch` | 六份 `Invocation_Validity_*.cfg`（各拧反一个开关、各只检查那一条） | 同上 | **本机跑过，六份均按预期出反例**（退出 12，2026-09-24）；不登记为 formal task |
| 续接、换家两条路可达 | 两份 `Invocation_Reach_*.cfg` | 同上 | **跑过，均按预期报出见证**（退出 12，2026-09-24）；不登记 |
| [S-22](v2/contract.md#s-22-同一次调用的发出序列) 第 2、3、5 条（首次第一家、续接同一家、只发给允许的家）、[S-30](v2/contract.md#s-30-dispatchagain) 守卫 3、[S-28](v2/contract.md#s-28-opencall) 出门前检查不过即无发出 | `ProviderAllowed`、`FirstDispatchFirstProvider`、`ResumeSameProvider`、`UndispatchedHasNoDispatch` | —— | **按构造，不作证据**：模型的动作前置把它们写死，条款被违反时模型不会失败。证据在下表场景 S-41、实例第 4、8、11 节 |

**模型没有覆盖、不得写成「已由模型覆盖」的**：追加口的原子性与按 `ResponseId` 幂等、回复消息与响应体同一提交、`reply_pending` 与 `settleReply`、绑定落在「已出门」上（含追补体参数三项的来源）、模型侧到达装配的宿主前提（[S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺)）、`released{cause}`、`session` 归属、对账由谁触发、只读守卫 `canDispatchAgain`、成因分类表的内容、脱敏、凭据取值、合法目标与展示列表、投影、拓展件与 loop 的行为（见 [formal 入口「模型吸收了什么」](v2/formal/README.md#模型吸收了什么不写成已由模型覆盖)）。它们的证据在下两表。

### 规范场景与测试

| 条款与性质 | 场景／测试 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-22](v2/contract.md#s-22-同一次调用的发出序列)、[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢) 发出序列与一次发出一条响应体；[S-29](v2/contract.md#s-29-dispatch) ⑧、[S-30](v2/contract.md#s-30-dispatchagain) ⑧ 再发时取不到凭据写 `released{cause}`；[S-49](v2/contract.md#s-49-settlereply) 被否决的那一条由本能力写 | [S-41](v2/contract.md#s-41-两家发出第一家-429-未开口第二家完成)（含凭据一支、否决一支） | 脚本化传输 → 真实会话日志；核两条响应体、两份账；凭据一支核调用终结是 `released{cause: credential_unavailable}` 而非 `undispatched`；否决一支核 `replyDisposition = vetoed`、日志里没有回复消息 | 未开始 |
| [S-15](v2/contract.md#s-15-两个锚点先写后行)、[S-33](v2/contract.md#s-33-reconcile) 停机前后；[S-7](v2/contract.md#s-7-一次调用绑定了什么) 绑定从「已出门」读 | [S-42](v2/contract.md#s-42-开口之后断流不重发)（含路由留痕一支）、[S-47](v2/contract.md#s-47-用户叫停之后停机不再发出) | **故障注入**：在两个锚点前后各杀一次进程，新进程对账；停机与对账之间改档案，核追补体与续接用的是「已出门」上的绑定；参数一支核追补体上的 `parameterAdjustments`、`droppedParameters` 与「已出门」逐字相同、`route.parameters` 是由它还原的实际送出那一组（[S-33](v2/contract.md#s-33-reconcile) ④） | 未开始 |
| [S-27](v2/contract.md#s-27-selectmodel)、[S-7](v2/contract.md#s-7-一次调用绑定了什么) 切换先落后生效、不作用于在途；[S-28](v2/contract.md#s-28-opencall) ①④ 用交来的 `target`、不重算 | [S-43](v2/contract.md#s-43-切换先落事实后生效)（含交接一支） | 集成；另一支让模型切换的记录写不进；交接一支在 `effectiveModel` 与 `openCall` 之间插入一次切换 | 未开始 |
| [S-11](v2/contract.md#s-11-合法目标集合)、[S-12](v2/contract.md#s-12-展示列表)、[S-9](v2/contract.md#s-9-选中模型) 已下架、恢复在册后自然接上、模态挡在这一刻 | [S-44](v2/contract.md#s-44-已下架的档案)（含恢复一支）、[S-45](v2/contract.md#s-45-模态不兼容挡在算合法目标那一刻) | 纯计算的表驱动测试 ＋ 集成 | 未开始 |
| [S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步把路由名解析为一行（先滤已撤回与范围不允许、再取最具体；模态与缺凭据不滤；作用在锁之上；`selectedBy` 不变）；[S-11](v2/contract.md#s-11-合法目标集合)、[S-12](v2/contract.md#s-12-展示列表) 以路由名为元素、每个名字一条、主标取胜出行的来源、被盖住的行列在下面带 `overridden_by{scope}`；[S-19](v2/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 按覆盖之后那条的来源取凭据、自建档案不用出厂格那一把 | [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)；[examples §9](v2/examples.md#9-同路由名按层覆盖一个名字一条落到胜出行场景-s-48) ；[examples §10](v2/examples.md#10-三层同名锁与已撤回的行) | 集成：目录替身配两种部署（有无出厂格那一把）、租户配与不配两种、同名一至三层与锁、已撤回的行（被覆盖方与选中方各一次）；核 `route.profile`、`selectedBy` 与 `route.credentialScope` | 未开始 |
| [S-18](v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 成因按来源、[S-20](v2/contract.md#s-20-写入之前脱敏) 脱敏 | [S-46](v2/contract.md#s-46-成因按来源分类与脱敏) | 哨兵串扫全部记录；前提：`status_cause_table` 与三个脱敏参数有值（G-5、G-6） | 未开始（被 G-5、G-6 阻断） |
| [S-13](v2/contract.md#s-13-模态投影读到的必须追到日志尾) 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 随机日志生成器 | 未开始 |
| [S-35](v2/contract.md#s-35-默认重试件可替换) 默认件逐家一遍、不允许回退时同家至多再试一次 | 表驱动测试（它是一个纯函数） | —— | 未开始 |
| [S-14](v2/contract.md#s-14-缺席时的默认答案与失败集合) 失败值闭合与判定次序（含 `callId` 属于别的会话、`reply_pending` 上的 `alreadyEnded`） | [examples §8](v2/examples.md#8-每个失败值一个反例) 与次序回归例 | —— | 未开始 |
| [S-49](v2/contract.md#s-49-settlereply) 交回之后的收口、[S-50](v2/contract.md#s-50-candispatchagain) 只读守卫与 `dispatchAgain` 同一张表 | [examples §11](v2/examples.md#11-交回之后的收口与只读守卫) | 表驱动：对同一组调用状态与计划，`canDispatchAgain` 的答案与 `dispatchAgain` 的判定逐条相同；`settleReply` 幂等与 `alreadyEnded` | 未开始 |
| [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条 | 适配层的契约测试（脚本化上游）：单家、禁止回退、一次发出之内不自行重试、状态码、首 token 映射、只用交来的那一把凭据、不送会话标识、不换占位文本、固定 base URL、改值与丢项在出网之前定下并与实际送出的一致、模型侧工具名不做逆转写 | 前提：G-10 的 basis 条目 | 未开始 |
| [S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺) 模型侧到达装配的七条宿主前提（`capability.stream-assembly/v2#S-28` 第 1、2、4、6、7、8、9 条）与不做逆转写；[S-36](v2/contract.md#s-36-宿主停止与撤除) 撤除走放弃 | [S-52](v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)（一次发出、两次发出、两个会话同一个 `callId`、「已开口」写不进、宿主停止时在途，五支） | 脚本化传输 ＋ 结构化日志的读取：核被拒的增量只报一次且日志里有带齐四样的事件、观察者刷新之后读到的是装配结果、收场之后同一次发出的迟到事件不进、上一次发出的迟到事件不进下一次、按（会话，目标）路由、工具调用块保留模型侧名字、没砍时响应体没有 `trims`；故障注入让「已开口」追加失败；宿主停止与本能力撤除各一次 | 未开始 |
| [S-11](v2/contract.md#s-11-合法目标集合) 末段、[S-28](v2/contract.md#s-28-opencall) 出门前检查第 3 行：传输承载是可发出的另一条前置 | [S-45](v2/contract.md#s-45-模态不兼容挡在算合法目标那一刻)（传输一支）、[examples §6](v2/examples.md#6-模态不兼容挡在算合法目标那一刻场景-s-45) 语音那一行 | 集成：据点传输配成送不出某一模态；核合法目标不变、出门前以 `modality_mismatch` 挡下 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| 回复消息与响应体同一提交、追加按 `ResponseId` 幂等、结算不受栅栏拒收 | 会话日志追加口：`capability.session-log` v2（S-8、S-10 第 3 条、S-17；2026-09-25 修订波改指）；整本日志的真承接者是 loop 那一程 | [S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢)、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) |
| 上交条目、中断提醒、用户取消运行时宿主停止前先中断 | loop | [S-3](v2/contract.md#s-3-本契约明确不承诺什么)、[S-36](v2/contract.md#s-36-宿主停止与撤除) |
| 跨进程的新鲜度、秘密送达、转发链不越过锚点 | 组合契约（尚未立） | [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证)、[G-12](v2/contract.md#十二已知缺口) |
| 传输适配须兑现的十一条 | pi-ai 传输节点的符合性测试 T-1～T-11（[`realization/packages/model/pi-ai-transport`](../../../realization/packages/model/pi-ai-transport/verification.md)；fork 之后不再依赖上游库的缺省行为；2026-09-25 修订波，主线裁定 D-060 §八 N-40 ④）。本契约**不以坐标依赖**那个包：它不是契约，catalog 不登 | [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条、[G-10](v2/contract.md#十二已知缺口) |

## 独立评审

**第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R5：本契约与 `capability.model-profile-directory`、`capability.modality-projection` 同批）。
处置按主线的修复简报（2026-09-24）与 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的裁定（K10、K13、K16、K19～K22、K36、K40、K42）；**评审意见不代替接受**，本契约仍是 candidate，修复稿尚未复审。二十七条全部**改**。

| 发现 | 处置 | 落点 |
|---|---|---|
| MRR-1（阻断：绑定只在内存里，失联补写的响应体与续接没有耐久来源） | **改**（K20）：「已出门」带这次调用的绑定（`data.messages/v2#S-49` 已改）；续接与对账从它读，不重读档案。**剩下一项**：传输适配改过的值与丢掉的项不在「已出门」上，追补体上参数那三项仍无耐久来源，立 **G-18** | [S-7](v2/contract.md#s-7-一次调用绑定了什么)、[S-28](v2/contract.md#s-28-opencall) ④、[S-33](v2/contract.md#s-33-reconcile)、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 快照那一行、[G-18](v2/contract.md#十二已知缺口)；场景 S-42 路由留痕一支 |
| MRR-2（阻断：`ResponseId` 铸点与 `data.model-response/v2#S-6` 相冲） | **改**：权威处已改为「本能力写『已出门』时铸、各结算方沿用」（R2b 交付）；本契约引它，S-4 表写明 | [S-8](v2/contract.md#s-8-调用在会话日志里留下的六种记录)、[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢)、[S-4](v2/contract.md#s-4-依赖方向与被消费的面) |
| MRR-3（阻断：续接或再发时凭据取不到没有合法编码） | **改**（K21）：写调用终结 `released{cause: credential_unavailable}`（`data.messages/v2#S-50`，成因名随 R1 交付定为 `credential_unavailable`）；`undispatched` 只指一次也没发出；S-6 `handed_up` 补入口；模型不建成因，`UndispatchedHasNoDispatch` 列为按构造 | [S-6](v2/contract.md#s-6-调用的状态)、[S-29](v2/contract.md#s-29-dispatch) ⑧、[S-30](v2/contract.md#s-30-dispatchagain) ⑧、[S-14](v2/contract.md#s-14-缺席时的默认答案与失败集合) 注；[formal 入口](v2/formal/README.md) 第二类；场景 S-41 凭据一支 |
| MRR-4（阻断：`callId` 唯一范围与调用操作不收会话） | **改**（K19）：`callId` 会话内唯一（与 `data.call-accounts/v2#S-37` 一致）；指认一次调用的操作 ① 都收 `session`、先判归属，不符 `callNotFound` | [S-5](v2/contract.md#s-5-一次调用一次发出)、[S-29](v2/contract.md#s-29-dispatch)～[S-34](v2/contract.md#s-34-readattempts)、[S-49](v2/contract.md#s-49-settlereply)、[S-50](v2/contract.md#s-50-candispatchagain) ①、[S-14](v2/contract.md#s-14-缺席时的默认答案与失败集合)；examples §8 |
| MRR-5（「已开口」写不进时编码冲突） | **改**：没写下的开口不算开口——内容不交给观察者、中止、按首 token 之前的故障结算、成因 `unrecognized`，响应体不带 `firstTokenAt`，缺席是如实的断言 | [S-15](v2/contract.md#s-15-两个锚点先写后行) 末条、[S-16](v2/contract.md#s-16-首-token-判据) 末段 |
| MRR-6（交回之后没有收口者） | **改**（K36）：新状态 `reply_pending`；调用方把落盘成消息的那一条与消息同一提交写下，否决与被系统使用的那一条经新操作 `settleReply` 由本能力写；调用方没收口时由撤除或对账兜底；列进 formal 的吸收 | [S-6](v2/contract.md#s-6-调用的状态)、[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢)、[S-49](v2/contract.md#s-49-settlereply)、[S-36](v2/contract.md#s-36-宿主停止与撤除)、[G-11](v2/contract.md#十二已知缺口) ②；examples §11 |
| MRR-7（不属于任何 Run 的调用没有对账触发点） | **改**：S-33 ② 加第二个调用时机——会话在据点上重新承载之后、会话级调用打开之前（规格层推导，谁来调归会话生命周期，[G-11](v2/contract.md#十二已知缺口) ③） | [S-33](v2/contract.md#s-33-reconcile) ②、[S-5](v2/contract.md#s-5-一次调用一次发出) |
| MRR-8（从 `resumable` 放手时上交带什么） | **改**：`releaseCall` 一律写不带 `cause` 的 `released`，从 `resumable` 放手时没有成因可带；上交条目带什么立 **G-17**（loop／PF-011，产品疑问报 PF-013） | [S-32](v2/contract.md#s-32-releasecall) ④、[S-6](v2/contract.md#s-6-调用的状态)、[G-17](v2/contract.md#十二已知缺口) |
| MRR-9（`selectModel` 判合法与判重复的先后） | **改**：先判合法，再判重复；重选已下架的当前选中得 `notLegalTarget{because: [withdrawn]}` | [S-27](v2/contract.md#s-27-selectmodel) ⑦ |
| MRR-10（没改目标时 loop 怎么传 `target`） | **改**：`target` 恒在（`data.loop-extension/v2#S-15`）；加输入 `basis`（loop 填 `target` 时用的那份 `effectiveModel` ⑤）；用交来的 `target`、不重算；没有 `targetChangedBy` 时 `target` 必须等于 `basis.routeName`；`basis` 这个名字待主线定名（[G-13](v2/contract.md#十二已知缺口)） | [S-28](v2/contract.md#s-28-opencall) ①③④、[S-26](v2/contract.md#s-26-effectivemodel) ⑤；场景 S-43 交接一支；examples §8 |
| MRR-11（runner 要的只读守卫缺失） | **改**（K22）：新操作 `canDispatchAgain(session, callId, plan)`，与 `dispatchAgain` 同一张表、同一次序；收 `plan` 是规格层推导（守卫 3 要看它） | [S-50](v2/contract.md#s-50-candispatchagain)、[S-30](v2/contract.md#s-30-dispatchagain) ③、第十三节；examples §11 |
| MRR-12（发起者的来源） | **改**（K16）：发起者由承载条目壳上的租户身份给出；响应体上的 `initiator` 只指中断发起方 | [S-19](v2/contract.md#s-19-凭据每次发出现取取值只交给传输适配)、[S-5](v2/contract.md#s-5-一次调用一次发出) 末条 |
| MRR-13（「切换事实／SelectionFact」） | **改**：改为「模型切换（UL-model-switch）落下的那条记录」，即 `data.messages/v2#S-49` 的 `model_selection_changed`；「切到哪条档案」改为「切到哪个路由名」 | [S-8](v2/contract.md#s-8-调用在会话日志里留下的六种记录)、[S-27](v2/contract.md#s-27-selectmodel) ④ |
| MRR-14（合法目标集合多出一项） | **改**（K40）：合法目标恰三项（与词条一致）；「本据点传输能承载的模态」写成可发出的另一条前置，在出门前检查第 3 行挡下 | [S-11](v2/contract.md#s-11-合法目标集合) 末段、[S-12](v2/contract.md#s-12-展示列表) 注记表、[S-28](v2/contract.md#s-28-opencall) 出门前检查第 3 行；场景 S-45 传输一支 |
| MRR-15（形式主张超过证据；守卫编号错位） | **改**：只对六条有否定配置的断言说「能失败」；四条按构造吸收的标「按构造，不作证据」并指向场景；其余十条标「只检查过」；守卫编号改为守卫 1（`already_spoke`）、守卫 2（`fact_class`），守卫 3 不在 `GuardOn` 里；模型注释同改 | [S-40](v2/contract.md#s-40-本版选用哪些形式工件)、[formal 入口](v2/formal/README.md)、`Invocation.tla` 注释、本页形式工件表 |
| MRR-16（`open` 被中断、停机之后正文与模型不一致） | **改**：正文与模型都取「有中断意图 ⇒ 写调用终结 `interrupted`」；模型 `Reconcile` 的 `nd = 0` 一支分两支，整组重跑（下文） | [S-33](v2/contract.md#s-33-reconcile) 第 2 行与末条、`Invocation.tla` `Reconcile` |
| MRR-17（注记判据对象；同一情形两个失败值） | **改**：名字有胜出行时判胜出行，没有时只判落点卡在哪一道滤、不判模态与凭据；选中模型的名字链上一行都没有时列表也得 `profileNotFound` | [S-12](v2/contract.md#s-12-展示列表)、[S-25](v2/contract.md#s-25-displaylist) ⑥⑧、[S-27](v2/contract.md#s-27-selectmodel)；examples §8 |
| MRR-18（S-4 缺 `data.model-profile` S-2） | **改**：补一行 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面) |
| MRR-19（产品 rev 落后） | **改**：逐 rev 复核（结论见[变化的影响](#变化的影响)本轮一条），页首改为 PF-012 rev 14、PF-009 rev 8、PF-004 rev 12、PF-001 rev 19 | 契约页首 |
| MRR-20（引注表里的 INV-／SAF-／LIV- 编号） | **改**：删去编号，改指决定记录 | 契约「设计依据」 |
| MRR-21（`retryRefused` 后两条在非 `awaiting_decision` 时要不要求值） | **改**：守卫 2、3 只在 `awaiting_decision` 时求值；只读守卫同一口径 | [S-30](v2/contract.md#s-30-dispatchagain) ⑥ 与表头、[S-50](v2/contract.md#s-50-candispatchagain) ⑥；examples §8 回归例 |
| MRR-22（身份不符判 `invalidInput`；括注可反读） | **改**：`selectModel` 不另收租户身份，「谁切的」从条目壳读；S-26 ⑤ 写成单向：`selectedBy = layer_lock` 当且仅当有一格上锁，不论名字是否相同 | [S-27](v2/contract.md#s-27-selectmodel) ②、[S-26](v2/contract.md#s-26-effectivemodel) ⑤ |
| MRR-23（过期引用；宿主停止的调用终结没写发起方） | **改**：删去对已闭合 G-1 的引用；写明取 `run_cancelled` | [S-36](v2/contract.md#s-36-宿主停止与撤除)、[S-33](v2/contract.md#s-33-reconcile) 第 2 行 |
| MRR-24（实例缺 `routeName`；守卫编号） | **改**：`effectiveModel` 的返回补 `routeName`；`already_spoke` 标守卫 1 | examples §1、§2、§4 |
| MRR-25（README 的 fiber 一句；传输九条用库级措辞） | **改**：删去 README 那句；九条改为语言无关的性质（不再点名库与环境变量） | [README](README.md)、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输九条 |
| MRR-26（`open` 调用读不到；条目没有「选中」；S-13 没登记对 MP S-6 的消费） | **改**：`readAttempts` 对本能力手里的 `open` 调用答 `{ state: open, dispatches: [] }`；展示列表条目加 `selected`；S-4 与 catalog 补 `capability.modality-projection` S-6 | [S-34](v2/contract.md#s-34-readattempts) ⑤⑧、[S-25](v2/contract.md#s-25-displaylist) ⑤、[S-13](v2/contract.md#s-13-模态投影读到的必须追到日志尾)、[S-4](v2/contract.md#s-4-依赖方向与被消费的面) |
| MRR-27（运行记录没绑定可核对的修订） | **改**：2026-09-24 整组重跑，输入副本与 SHA-256 入主检出 `tmp/formal-runs/`，本页绑定 `Invocation.tla` 的哈希 | 下文「实际执行」 |


### 第二轮

spec-reviewer（只读），2026-09-25，基线 HUB `8ad37c50`，发现表 `tmp/assets-runtimes/reviews/r2-R5.md` 第二节（批 R5）。裁定出处 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（下表简写「§七」）；**评审意见不代替接受**。

| 编号 | 处置 | 落点 |
|---|---|---|
| R2-MRR-1（「已开口」写不进那一支，S-51 第 6、7 条没有承接） | **改**（§七 M15）：第 6 条补这一支——交 `finish{lost, error{cause: unrecognized}}`、这次发出就此中止；第 7 条写明这一支 `closeOut` 交出的块不进 `delivered`、响应体不带 `firstTokenAt`；S-52 加一支 | [S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺) 第 6、7 条、[S-52](v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进) |
| R2-MRR-2（依赖说明写「不据以写出任何承诺」，catalog 漏登 arrival-events） | **改**：删去那句；S-4 表补 `data.arrival-events` 的 S-5、S-14、S-16、S-21，catalog 同步（已核无环：arrival-events 不依赖本契约）；页首依赖列表、G-14 闭合行、README 依赖数（十四项）随之改 | 页首、[S-4](v2/contract.md#s-4-依赖方向与被消费的面)、G-14、`registry/catalog.json`、README |
| R2-MRR-3（「观测」没有定义，S-52 判不出） | **改**（§七 M16）：S-51 第 4 条改为一条结构化日志事件——不进会话日志、不成为六种记录之一，必带会话、`callId`、目标、被拒的值（`accept` 交回的失败值；收场之后到达的事件记 `event_after_finish`，这一取法是**本契约推导**）；依据 SYS-OBSERVABILITY.C3；事件名不由本契约取（归提供者设计）。S-52 断言改为「日志里有这条事件」 | [S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺) 第 4 条、[S-52](v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)、设计依据表 |
| R2-MRR-4（允许集合 `A` 没有来源） | **改**（§七 M17）：新立 [G-19](v2/contract.md#十二已知缺口)，owner PF-002／PF-004 ＋ `capability.asset-evaluation`，闭合条件照裁定；闭合之前 `A` 读不到即 `unavailable`、不以空集或全集代替；G-4 只保留「取值域是路由名」；S-11 那一行指向 G-19 | [S-11](v2/contract.md#s-11-合法目标集合)、G-4、G-19 |
| R2-MRR-5（README 删去了 T-3 那一句） | **改**（§七 M18，维持 §一 T-3）：README 补「本能力的提供者是运行时协程」；统一语言 `conflicts.md` C-31 以此闭合（与 `capability.tool-execution-runtime` README 同一句） | [README](README.md)、`ubiquitous_language/conflicts.md` C-31 |
| R2-MRR-6（S-51 第 1 条的路由键不带会话） | **改**（§七 M16）：第 1 条写明按（会话，目标）路由，第 9 条只推给本会话的观察者；S-52 加「两个会话同一个 `callId`」一支 | S-51 第 1、9 条、S-52 |
| R2-MRR-7（第 9 条的快照没受「已开口」约束） | **改**：第 9 条补「『已开口』写下之前交出的快照不含内容」 | S-51 第 9 条 |
| R2-MRR-8（S-51 第 6 条宿主停止交 `finish{interrupted}`，与 stream-assembly S-28 第 6 条字面不一） | **改**（§七 M12，评审原判「本契约不必改」，主线选边后要改）：宿主停止（系统发起的运行取消）与本能力自身被撤除时在途的流一律 `abandon`、不带缘由，流结局 `lost`，收场仍是 `interrupted{run_cancelled}`、没有回复；S-36 结算与末条同改；S-31 写明经本操作的 `run_cancelled` 只出自用户取消运行（**本契约推导**，已报主线）；G-11 ① 限定为用户取消运行那一路；examples §11 加一行 | [S-36](v2/contract.md#s-36-宿主停止与撤除)、[S-31](v2/contract.md#s-31-interrupt) ①、S-51 第 6 条、[S-6](v2/contract.md#s-6-调用的状态)、G-11、S-52、examples §11 |
| R2-MRR-9（`trims` 没写换写） | **改**（§七 M24）：第 7 条写明一次也没砍时响应体的 `trims` 缺席；S-4 与 catalog 登 `capability.stream-assembly` 的 S-13（同轮另登 S-23：被拒的值） | S-51 第 7 条、S-4、`registry/catalog.json` |
| R2-MRR-10 ①（G-10 写「九条」） | **改**：改为「十一条」 | G-10 |
| R2-MRR-10 ②（`alreadyEnded` 括注把 `settleReply` 与 `reply_pending` 并列） | **改**：拆成两个分句、分别列适用的操作；写明 `settleReply` 在 `reply_pending` 上不得 `alreadyEnded`；examples §8 加回归例 | [S-14](v2/contract.md#s-14-缺席时的默认答案与失败集合)、examples §8 |
| R2-MRR-10 ③（S-6「收场已定」与撤除、对账的兜底字面相左） | **改**：`reply_pending` 那一行写成「对调用方的操作而言已定」，并列出撤除与对账两处兜底例外 | [S-6](v2/contract.md#s-6-调用的状态) |
| R2-MRR-10 ④（D-060 §五 K22 与 §六 N-9 的 `canDispatchAgain` 签名不一） | 归主线（D-060 自身）；本契约按 N-9 收 `plan`，不改 | — |
| 范围外 1（「范围允许」到底是什么） | 与 R2-MRR-4 同一件，落 G-19，产品侧已在主线待裁清单 | G-19 |
| 范围外 2（T-3 去留） | 主线维持（M18），见 R2-MRR-5 | — |
| 范围外 3（仍开着的 G-5、G-6、G-8～G-12、G-17） | 不变 | — |
| 未覆盖 5（`droppedParameters` 去掉 `extra` 全部键） | 归 data 契约（§七 M28，甲批）；本契约 S-7 只从「已出门」读，不改 | — |
| 未覆盖（TER S-62 同形、runner S-14 ② 对 `canDispatchAgain` 其余失败值的处置） | 前者归丙批；后者归 runner（同为丁所写）：正常路径不出现，本轮不改，已报主线 | — |
| L4、L6 专项结论 | 评审判一致；L6 的缺口即 R2-MRR-1、8、9 | — |

## 实际执行

### 2026-09-24 修复稿：TLC 十份配置（有效记录）

- **模型修订**：工作树 `.worktrees/assets-runtimes`（分支 `panqiwei/assets-runtimes`，未提交）上的 `v2/formal/Invocation.tla`，SHA-256 `7dafcaa2185ca3ae41a043ff16bb6b4e2a81cd8720f7fa66d1ff23e5b5221b48`；十份配置的哈希在运行目录 `input.sha256`，与工作树逐字相同
- **运行目录**：主检出 `tmp/formal-runs/model-request-runtime-v2-2026-09-24d/`（`run.sh`、`input/`、`logs/`、`run-exit.txt`、`summary.txt`）
- **工具**：TLC2 Version 2026.09.12.025210 (rev: 867aefb)；Eclipse Adoptium (Temurin) 21.0.12.1；`-workers 1`，工作目录 `.meta_harness/design`
- **相对上一次的模型改动**：`Reconcile` 的 `nd = 0` 一支，有中断意图时写调用终结 `interrupted`（MRR-16）；两处注释的守卫编号

| 配置 | 退出码 | 结果 |
|---|---|---|
| `Invocation.cfg` | 0 | 29,521 states generated，15,802 distinct，深度 21；20 条不变量与进展性质 `SentEventuallySettled` 无违反；无死锁 |
| `Invocation_NoFallback.cfg` | 0 | 13,861 generated，7,420 distinct；同上 |
| `Invocation_Validity_NoGuard_Spoke.cfg` | 12 | `NoDispatchAfterSpoke` 违反：OpenPass → Dispatch → Send → FirstToken → FailAfter → DispatchAgain(1) |
| `Invocation_Validity_NoGuard_Fact.cfg` | 12 | `ContinuationOnlyAfterStrategyOrSilentLoss` 违反：OpenPass → Dispatch → Send → FailBefore(事实类) → DispatchAgain(1) |
| `Invocation_Validity_SpokeAfterObserve.cfg` | 12 | `NoDispatchAfterSeen` 违反：… → FirstToken（先交观察者）→ Crash → Reconcile（当成没开口）→ Dispatch → Send |
| `Invocation_Validity_SendBeforeAnchor.cfg` | 12 | `QuiescentSettled` 违反：… → Send（锚点未写）→ Crash → Reconcile（找不到这次发出） |
| `Invocation_Validity_AbortBeforeIntent.cfg` | 12 | `NoDispatchAfterInterrupt` 违反：OpenPass → Dispatch → Interrupt(user)（未写意图）→ Crash → Reconcile（当成失联）→ Dispatch → Send |
| `Invocation_Validity_NonIdempotentSettle.cfg` | 12 | `AtMostOneBodyPerDispatch` 违反：… → Send → HostStop → FailBefore(策略类) → TeardownWrite（第二条） |
| `Invocation_Reach_ResumeThenComplete.cfg` | 12 | 见证 `NotResumeThenComplete` 被报出：OpenPass → Dispatch → Crash → Reconcile → Dispatch → Send → FirstToken → Complete |
| `Invocation_Reach_FallbackThenComplete.cfg` | 12 | 见证 `NotFallbackThenComplete` 被报出：… → FailBefore(策略类) → DispatchAgain(2) → Send → FirstToken → Complete |

**这次运行能说明的**：六条断言在对应开关拧反时会失败，正向配置在所列常量内无反例；**不能说明的**：四条按构造成立的断言、模型吸收掉的语义（[formal 入口](v2/formal/README.md#模型吸收了什么不写成已由模型覆盖)），以及任何实现。

### 2026-09-23 起草者本机：TLC 十份配置（已被上一节取代）

- **模型修订**：本分支 `panqiwei/assets-runtimes-spec-modelrt` 上首次提交的 `v2/formal/Invocation.tla`（提交号见 `git log`，本页不填哈希）
- **工具**：TLC2 Version 2026.09.12.025210 (rev: 867aefb)；openjdk 21.0.12.1；`-workers 1`，工作目录 `.meta_harness/design`
- **命令形状**：`java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/<id> -cleanup -noGenerateSpecTE -workers 1 -config <cfg> Invocation.tla`

| 配置 | 退出码 | 结果 |
|---|---|---|
| `Invocation.cfg` | 0 | 29,521 states generated，15,802 distinct，深度 21；20 条不变量与进展性质 `SentEventuallySettled` 无违反；无死锁 |
| `Invocation_NoFallback.cfg` | 0 | 13,861 generated，7,420 distinct；同上 |
| `Invocation_Validity_NoGuard_Spoke.cfg` | 12 | `NoDispatchAfterSpoke` 违反：OpenPass → Dispatch → Send → FirstToken → FailAfter → DispatchAgain |
| `Invocation_Validity_NoGuard_Fact.cfg` | 12 | `ContinuationOnlyAfterStrategyOrSilentLoss` 违反：OpenPass → Dispatch → Send → FailBefore(事实类) → DispatchAgain |
| `Invocation_Validity_SpokeAfterObserve.cfg` | 12 | `NoDispatchAfterSeen` 违反：… → FirstToken（先交观察者）→ Crash → Reconcile（当成没开口）→ Dispatch → Send |
| `Invocation_Validity_SendBeforeAnchor.cfg` | 12 | `QuiescentSettled` 违反：… → Send（锚点未写）→ Crash → Reconcile（找不到这次发出） |
| `Invocation_Validity_AbortBeforeIntent.cfg` | 12 | `NoDispatchAfterInterrupt` 违反：… → Interrupt（未写意图）→ Crash → Reconcile（当成失联）→ Dispatch → Send |
| `Invocation_Validity_NonIdempotentSettle.cfg` | 12 | `AtMostOneBodyPerDispatch` 违反：… → HostStop → FailBefore → TeardownWrite（第二条） |
| `Invocation_Reach_ResumeThenComplete.cfg` | 12 | 见证 `NotResumeThenComplete` 被报出：续接路径可达 |
| `Invocation_Reach_FallbackThenComplete.cfg` | 12 | 见证 `NotFallbackThenComplete` 被报出：换家路径可达 |

原始输出只留在起草者本机的临时目录，**没有入库**、没有绑定哈希；对应的模型在 2026-09-24 已改（`Reconcile` 一支），**结论以上一节为准**。复跑以 `make design-check FORMAL=run`（两份登记配置）或运行目录里的 `run.sh`（十份）为准。

## 结果与反例

**正向配置无反例。**否定配置的反例都是预期的，形状见上表；它们说明的是「对应开关拧反时断言会失败」，**不是契约的缺陷**。

## 变化的影响

- **2026-09-23 起草**：首版，无旧证据。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在 [D-060 §S16](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)。
  - **G-1 闭合**：`data.model-response` 的 `interrupted{initiator}` 三值、`attemptId` 在每一次发出上、`route.profileSnapshot`／`route.credentialScope`，`data.call-accounts` 的 `late` 与 `initiator` 都已落；「首 token 之前失联之后能否再发」的口径与本契约一致（那边 S-23 第 2 条）。**模型不变**：`lost_silent`／`lost_spoken`、`int_user`／`int_cancel` 正是那几支，`ContinuationOnlyAfterStrategyOrSilentLoss` 与对账表第三行不改。
  - **G-2 闭合**：五种记录的形状归 `data.messages/v2#S-49`、`#S-50`；场景的核对对象改为那里的成员名。不影响模型。
  - **G-3 闭合**：`ModelCallRequest` 定形（`parameters`、`tools: CapabilityId[]`、`targetChangedBy?`，与 `data.loop-extension` 的 `ModelRequest` 同名成员逐字相同）。
  - **`retryRefused{call_ended}` 删去**（S16-b）：已终结的调用在 `dispatch`／`dispatchAgain` 上一律 `alreadyEnded`；`why` 剩三值、守卫重新编号。模型里守卫是谓词、不带这个名字，**不需重跑**。
  - **默认重试件**：不允许回退的档案同家至多再试一次（S16-g）；它不在模型里（模型把 `dispatchAgain` 建成非确定选择，守卫是唯一约束），`Invocation_NoFallback.cfg` 的 `ProviderAllowed`（每一次都是第一家）照旧成立。实例第 7 节已改写。
  - **G-7 闭合**（S16-g：首 token 之后停机 = `interrupted{runtime_lost}`）；**G-8、G-9 收窄**；**G-4 改为产品缺口**（「范围允许」的输入是 asset-evaluation 求值结果里「用哪个模型」那一项的允许集合，S16-i）；**G-14 闭合**（三份并行契约登进 catalog；runner 只指路，它消费本契约、反向登记会成环）。
  - **凭据链多一格**（`capability.model-profile-directory` 同轮改，[D-060 §S16 S16-f](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）：S-19 取「最具体的一把」末尾加出厂格那一把，S-12 的 `credential_missing` 改为三格都没有；模型不含凭据取值，不受影响。
  - **对证据的影响**：没有既有证据失效；两个登记任务在本轮 `FORMAL=run` 重跑。
- **2026-09-24 规格修订批（PF-013 rev 10 之后；候选，未冻结，原地改）**。依据：PF-013 rev 10 裁决 33–38、decisions P33–P37，主线施工简报第三节：
  - **取凭据次序同步目录**：[S-19](v2/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 删「否则组织层」——发起租户有自己那一把就用它（不论档案建在哪一层），否则只有官方档案取出厂格那一把，自建档案没有就是 `credential_unavailable`；取用时带有效模型引用的 `origin`，不另填。[S-12](v2/contract.md#s-12-展示列表) 的 `credential_missing` 按每一条的来源各问一次；[S-28](v2/contract.md#s-28-opencall) 出门前检查第 4 行、[S-29](v2/contract.md#s-29-dispatch) ⑧ 措辞随改。
  - **展示列表每条带来源**（裁决 36）：[S-12](v2/contract.md#s-12-展示列表)、[S-25](v2/contract.md#s-25-displaylist) ⑤ 写明来源即条目 `ref` 里的 `origin` 与 `scope`，不另立成员；[S-11](v2/contract.md#s-11-合法目标集合) 补一句同路由名可有几条。
  - **撤回可恢复**（裁决 37）：[S-9](v2/contract.md#s-9-选中模型) 补恢复之后自然接上；进展性质加一行；[S-44](v2/contract.md#s-44-已下架的档案) 加恢复一支；实例第 5 节加两行。
  - **新增场景 [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)** 与实例第 9 节；上表加一行。
  - [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 两行改写（在册状态两个方向都要单调读；秘密送达去掉旧的凭据缺口指引与「组织层那一把」，来源须如实到达）；安全性质加「自建档案用上出厂格那一把」一行；catalog 本契约对 `data.model-profile` 增 S-4。
  - **对证据的影响**：没有既有证据失效——行为模型不含凭据取用、在册状态与展示列表，**十份配置不需重跑，本轮未运行 TLC**；场景全部未开始，S-44、S-48 首次执行按新内容。
- **2026-09-24 主线裁定落地（候选，未冻结，原地改）**：
  - **首 token 之后停机再 `dispatch` 得 `alreadyEnded`**：实例第 3 节那一行原写 `retryRefused{call_ended}`（整批对齐时已作废的值，漏改）；场景 [S-42](v2/contract.md#s-42-开口之后断流不重发) 停机一支原写 `retryRefused{already_spoke}`，按 [S-29](v2/contract.md#s-29-dispatch) ⑥ 的次序（`alreadyEnded` 先于 `retryRefused`）改为 `alreadyEnded`。条款本身不变。
  - 产品依据改 PF-013 rev 11（rev 11 只动转换件呈现落点，不影响本契约条款）。
  - **对证据的影响**：模型里守卫是谓词、不带失败值名字，**不需重跑，本轮未运行 TLC**；S-42 首次执行按新内容。
- **2026-09-24 用量／成本分记的理由对齐**（候选，未冻结，原地改）：「账上分记两件事」一段补一句——两者只在走出厂格那一把时分叉，出厂格那一把是唯一分叉点（与 `data.call-accounts/v2#S-38` 同轮改写一致，主线裁定）。不改条款，对证据无影响。
- **2026-09-24 产品负责人裁定同名按层覆盖（候选，未冻结，原地改）**：原话「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」（`data.model-profile` v2 G-13、`capability.model-profile-directory` v2 G-11 同日闭合）。
  - [S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 加第 2′ 步**同标识覆盖**：以路由名为能力标识，在会话范围链上取最具体一格的那条（先后取 `capability.model-profile-directory/v2#S-17` 末段）；作用在第 2 步结果上（选中或锁都一样，`selectedBy` 不变），第 3 步拓展件给出的目标在打开调用时同样经它。**按行存在取、不看能不能用**：最具体那条已撤回或用不了，第 4 步照样挡下，不落到下一层——缺席默认取拒绝，要不要让位立为 **G-15**（产品负责人）。
  - [S-11](v2/contract.md#s-11-合法目标集合)：式子改为判 `覆盖(p)`——按引用各算、各是一个元素，但判的是选它实际会用的那条（**规格层推导**：否则判为合法的引用会在出门前检查被挡下）；同名几条判定相同。[S-12](v2/contract.md#s-12-展示列表)：每条标自己的来源，注记与 `credential_missing` 按覆盖之后那条算；被覆盖的条目怎样说明实际用哪一条立为 **G-16**（产品负责人与交付面）。
  - [S-26](v2/contract.md#s-26-effectivemodel) ⑤：`profile` 是第 2、2′ 步之后的结果，与 `selected` 不同可能是锁、覆盖或两者；[S-28](v2/contract.md#s-28-opencall) ④：`target` 给出时也经覆盖。
  - 场景 [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 改写（标题与锚点随之改）：原「官方那条走出厂格那一把」在组织层有同名自建档案时不再成立——选官方那条也落到组织层那条；加三层与组织锁两支。实例第 9 节改写，新增第 10 节（三层同名、锁、已撤回的最具体那条）。设计依据表那一行补裁定原话。
  - **catalog 不变**：已消费 `capability.model-profile-directory` S-6、S-17。covers 里 PF-013 §4「档案的身份」那一条补 S-10、S-11、S-26、S-28。
  - **对证据的影响**：行为模型不含有效模型的求值与展示列表，**十份配置不需重跑，本轮未运行 TLC**；S-48 首次执行按新内容。
- **2026-09-24 主线裁定 G-15、G-16 与三条推导（候选，未冻结，原地改）**：
  - **三条推导被主线接受**，正文标「主线裁定 2026-09-24」：合法性看胜出的那条（[S-11](v2/contract.md#s-11-合法目标集合)）；覆盖同样作用在锁之上——锁定的是路由名，供应商、参数、凭据取胜出的那条（[S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步）。
  - **G-15 闭合**：挑胜者时**先滤掉已撤回的行，再取最具体一格**（类推 PF-002 §5.6「先滤掉被禁用的，再取最具体」）；缺凭据不滤。上一轮「按行存在取」改掉。`覆盖(p)` 的定义随之改（一条在册的都没有时 = p）；`LegalTargetSet` 的第一个合取项由「`覆盖(p)` 在册」改为「`p` 在册」——已撤回的引用即使被接住也不能被新选中（**规格层推导**，依据 `data.model-profile/v2#S-10` 末段）。S-10 加「代价」一段：组织层建了同名、成员没配自己那一把之前同名官方档案用不上；租户建了同名又撤回不再堵官方那条；选中的那条自己撤回而链上有在册同名时照常用那条，不说「已下架」。[S-9](v2/contract.md#s-9-选中模型) 已撤回一条随之补。
  - **G-16 闭合**：[S-12](v2/contract.md#s-12-展示列表) 注记表加 `overridden_by{scope}`（附加注记，`覆盖(p) ≠ p` 时带，`scope` 是胜出那条所在的一格，官方那条为 `factory`）；被覆盖的条目照列、每条带自己的来源，呈现归 PF-016。`withdrawn` 注记改回按这一条自己的在册状态判；其余三项按胜出那条判。
  - [S-26](v2/contract.md#s-26-effectivemodel) ⑤「两者不同」的说明补「或它自己已撤回时链上在册的那条」。场景 [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 补 `overridden_by`、缺凭据不滤的代价、锁、撤回一支；实例第 9 节补注记，第 10 节改写（标题改为「三层同名、锁与已撤回的行」）。
  - **对证据的影响**：没有既有证据；行为模型不含这些求值，**不需重跑，本轮未运行 TLC**。
- **2026-09-24 主线裁定：范围不允许的也在挑胜者前滤掉（候选，未冻结，原地改）**：类推 PF-002 §5.6 三小步完整版「禁用滤（= 已撤回）→ 谁可以使用它滤（= 范围不允许）→ 取最具体」；模态不兼容与缺凭据不滤。[S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步与「只滤」一条、代价一段补范围不允许；[S-11](v2/contract.md#s-11-合法目标集合) `覆盖(p)` 改为在册且范围允许的最具体一条，`LegalTargetSet` 的范围一项改判 `p` 自己（**规格层推导**：与「已撤回的引用不能被新选中」同理，这个范围不允许的引用也不能被新选中）；[S-12](v2/contract.md#s-12-展示列表) `scope_disallowed` 改按这一条自己判，被接住时与 `overridden_by` 并存；[S-9](v2/contract.md#s-9-选中模型) 与 G-15 闭合行同步。实例里没有范围不允许的行参与覆盖的例子，未改。`overridden_by{factory}` 名字保留；「已下架」口径变化由主线转 PF-013 rev 12。不需重跑 TLC，本轮未运行。
- **2026-09-24 PF-013 rev 12 最后一轮简化（候选，未冻结，原地改）**：产品正文定「用哪个模型」**记路由名**，运行时按链取胜者；主线裁以产品为准。
  - [S-9](v2/contract.md#s-9-选中模型)：选中模型 = 一个路由名（切换事实记的名字）；「名字不变，落点会变」一条取代原「引用 + 覆盖」的说法。
  - [S-10](v2/contract.md#s-10-有效模型四步每步来源可查)：第 2′ 步改为「把路由名解析为一行」，按 `capability.model-profile-directory/v2#S-17` 末段的落点（先滤已撤回、再滤范围不允许、取最具体；没有胜出行时落点那一行由第 4 步以 `withdrawn`／`scope_disallowed` 挡下；链上没有这个名字 ⇒ `profileNotFound`），不再有「引用 + 覆盖」两层；代价一段保留并补「锁得住名字锁不住落点」。
  - [S-11](v2/contract.md#s-11-合法目标集合)：合法目标集合以**路由名**为元素（胜出行存在且模态兼容、传输承载得了）；`覆盖(p)` 与 `p 在册` 那一套删去。
  - [S-12](v2/contract.md#s-12-展示列表)：**每个名字一条**，主标是落点那一行的来源；被盖住的同名行列在该条之下、带 `overridden_by{scope}`（及它自己的 `withdrawn`／`scope_disallowed`），选不了；注记表加「挂在哪」一列。
  - [S-24](v2/contract.md#s-24-legaltargets) ⑤ 一组 `RouteName`；[S-25](v2/contract.md#s-25-displaylist) ⑤ 条目形状 `{ routeName, ref, 注记集合, covered }`；[S-26](v2/contract.md#s-26-effectivemodel) ⑤ 加 `routeName`、`selected` 改为名字，⑥⑧ 加 `profileNotFound`；[S-27](v2/contract.md#s-27-selectmodel) 输入改 `routeName: RouteName`，切换事实记名字；[S-28](v2/contract.md#s-28-opencall) ① 拓展件的 `target` 只取其中的路由名（`data.loop-extension` 的形状仍是 `ModelProfileRef`，待那份契约对齐），⑧ 的 `profileNotFound` 改为「链上没有这个名字」。
  - 场景 [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 改写（标题与锚点随之改）；S-44 注明链上没有别的同名行；实例序言注明 `M1`、`M2` 同时指行与名字，第 8 节 `profileNotFound` 那行改为一个名字，第 9、10 节改写（加「三行都撤回」一行）。
  - **catalog**：本契约对 `data.model-profile` 补 `S-2`（`RouteName`）。**covers**：PF-013 §4「档案的身份」一条补 S-9、S-24、S-27。
  - **对证据的影响**：行为模型不含选中模型的形状与这些求值，**不需重跑，本轮未运行 TLC**；场景全部未开始，S-48 首次执行按新内容。
- **（2026-09-24 同日续，主线裁定，不改语义）**：`data.loop-extension` v2 S-15 的 `target` 与 S-24 的 `profile` 改为 `RouteName`，[S-28](v2/contract.md#s-28-opencall) ① 与 ④ 随之改为直接取这个名字、经 S-10 第 2′ 步解析；上一条里「只取其中的路由名，形状仍是 `ModelProfileRef`」的过渡读法作废。**对证据的影响**：无既有证据；本轮未运行 TLC。
- **2026-09-25 修复波 1b（候选，未冻结，原地改）**：裁定出处 [D-060 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（L4、L6、N-9）。
  - **L4，G-18 闭合**：「已出门」另带传输适配为这一次定下的 `parameterAdjustments` 与 `droppedParameters`（形状归 `data.messages/v2#S-49`，与 `data.model-response/v2#S-11` 同名成员同义）；[S-7](v2/contract.md#s-7-一次调用绑定了什么) 写明由它还原实际送出的一组，[S-8](v2/contract.md#s-8-调用在会话日志里留下的六种记录) 已出门一行、[S-29](v2/contract.md#s-29-dispatch) ④ 的次序（改值与丢项先定、再写已出门、再出网）、[S-33](v2/contract.md#s-33-reconcile) ④ 追补体参数三项从「已出门」读；[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配九条 → 十一条（第 10 条改值与丢项在出网之前定下，第 11 条不做逆转写）；实例第 3 节首行改写；场景 [S-42](v2/contract.md#s-42-开口之后断流不重发) 加参数一支。
  - **L6**：新条款 [S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺)——对 `capability.stream-assembly/v2#S-28` 第 1、2、4、6、7、8、9 条逐条承诺，并写明模型侧名字不做逆转写（逆转写只在 `capability.tool-execution-runtime`，K10）；新场景 [S-52](v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)。`capability.stream-assembly` v2 G-2 随之闭合（那份契约同轮改）。S-1 加第 12 行、S-4 stream-assembly 一行改列 S-14、S-18～S-22、S-26、S-28，被消费者表加 stream-assembly 一行，安全性质加两行。
  - **N-9，G-13 闭合**：`settleReply` 与输入成员 `basis` 由主线接受；S-23、S-49 与依据表随改。
  - **registry**：catalog 本契约对 `capability.stream-assembly` 由 `S-16` 改为 `S-14`、`S-16`、`S-18`～`S-22`、`S-26`、`S-28`（与 S-4 表逐项相同）；对 `data.messages` 已消费 S-49，不变。covers、formal-tasks、id-namespaces 不变（S-51 是宿主前提的承诺、S-52 是场景，不对应新的产品条款）。
  - **对证据的影响**：行为模型不含参数、到达事件与装配状态（[formal 入口](v2/formal/README.md#模型吸收了什么不写成已由模型覆盖)已补两句），**十份配置不需重跑，本轮未运行 TLC**；场景全部未开始，S-42 参数一支与 S-52 首次执行按新内容。
- **2026-09-24 第一轮独立评审修复（候选，未冻结，原地改）**：逐条处置见上文[独立评审](#独立评审)；裁定出处 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K10、K13、K16、K19～K22、K36、K40、K42），正文里对这些 K 的依据都链到那里。
  - **产品 rev 复核**：PF-012 rev 10 → 14——rev 11 补的对账两行与本契约 S-33 一致；否决三路的模型回复一行（照常结束、记下被谁否决、不交给重试挂件）落为 S-49；「系统自带的几件，不可用时各有定法」落为 S-35「它挂了」；I-11「已发起的账迟到了照样落、标明迟到」落为 S-17 的 `late`（只在属于某个运行的调用上）；rev 12 的拓展件不可用处置由 `capability.loop-extension-runner` 执行、本契约只引；rev 13、14 只动转换件，不涉本契约。PF-009 rev 7 → 8——「已经开口是账」与本契约「已开口」记录一致，`SystemMessage` 不落日志与本契约无关，不改条款。PF-004 rev 10 → 12、PF-001 rev 16 → 17——本契约引的 §6.6、§6.4 含义未变，不改条款。
  - **新增的服务面**：`settleReply`（[S-49](v2/contract.md#s-49-settlereply)）、`canDispatchAgain`（[S-50](v2/contract.md#s-50-candispatchagain)）；新增状态 `reply_pending`。`settleReply` 与 `openCall` 的输入成员 `basis` 是规格层给的候选名，待主线定名（[G-13](v2/contract.md#十二已知缺口)）。
  - **新缺口**：[G-17](v2/contract.md#十二已知缺口)（从 `resumable` 放手时上交带什么）、[G-18](v2/contract.md#十二已知缺口)（追补体上参数三项没有耐久来源）。**G-4 闭合**（K42）。
  - **实例**：各调用加 `session`；第 3 节路由取自「已出门」；第 8 节加 `callId` 属于别的会话、`reply_pending` 上的 `alreadyEnded`、`target` 与 `basis` 不符、`settleReply` 两行、判定次序回归例两条、列表的 `profileNotFound`；新增第 11 节（交回之后的收口与只读守卫）。
  - **registry**：catalog 本契约对 `data.model-response` 补 S-3、S-35，对 `data.loop-extension` 补 S-14，对 `data.call-accounts` 补 S-25，对 `capability.modality-projection` 补 S-6（与 S-4 表逐项相同）；formal-tasks 不变（两个任务、配置名不变）。covers 补登 4 条（PF-012 §6.17 → S-17、PF-012 否决三路 → S-49、PF-012 系统自带件不可用 → S-35、PF-015 会话睡一觉醒来 → S-33），给 4 条追加条款（PF-013 §6.17 加 S-35、§6.5 加 S-11、§6.9 加 S-10／S-28、「它只有一个宿主」加 S-5），1 条注去掉施工标签；本契约条目 51 → 55。
  - **对证据的影响**：模型改了 `Reconcile` 一支（MRR-16），**十份配置整组重跑**（上文「实际执行」2026-09-24 一节），2026-09-23 那次作废；形式工件的主张收窄到六条能失败的断言，四条标「按构造，不作证据」。场景全部未开始，S-41、S-42、S-43、S-45 首次执行按新内容。
- **2026-09-25 修复波 2（候选，未冻结，原地改）**：裁定出处 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) M12、M15、M16、M17、M18、M24；逐条处置见上文[第二轮](#第二轮)。
  - **语义改变**：宿主停止（系统发起）与本能力撤除时在途的流改走 `abandon`（流结局 `lost`），收场仍是 `interrupted{run_cancelled}`、**不再产出回复**——此前第 6 条交 `finish{interrupted}`，照它写出的回复会落成 `interrupted_by_user`；经 `interrupt` 的 `run_cancelled` 只出自用户取消运行。「已开口」写不进那一支的流收尾与记账写明。被拒事件的落点由「观测」改为结构化日志事件。
  - **表示改变**：响应体 `trims` 一次也没砍时缺席（原文只说「进响应体」）。没有已采用的消费者，无迁移。
  - **新缺口 G-19**（允许集合 `A` 的来源）；G-4 收窄、G-10、G-11、G-14 措辞改。
  - **registry**：catalog 本契约新增依赖 `data.arrival-events` `["S-5","S-14","S-16","S-21"]`；对 `capability.stream-assembly` 补 `S-13`、`S-23`；对 `data.model-response` 补 `S-5`（撤除时的映射例外）。已核：这三条都不成环（catalog 全图只余 runner ↔ 执行运行时一处既有的环，已报主线）。covers、formal-tasks、id-namespaces 不变。
  - **对证据的影响**：行为模型不含到达事件、回复与日志事件——`TeardownWrite` 写的 `int_cancel` 本来就没有「带不带回复」这一维，追加口失败（含「已开口」写不进）也不在模型里；[formal 入口](v2/formal/README.md#模型吸收了什么不写成已由模型覆盖)「模型吸收了什么」补一条写明这两处，证据归 S-52 的对应两支；**模型不改，十份配置不需重跑，本轮未运行 TLC**。S-52 由两支扩为五支，仍「未开始」。

## 修订波（2026-09-25 公开面）

依据链：[D-063](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-4（允许集合 `A` 本版不收窄）、R-6（重试是可配置策略、不写死）；[D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-33（默认退避逐次取值、停止只由 S-35 决定）、N-36（策略对象的五个成员、次数由供应商个数与回退声明推出、默认初值放配置层、不引入执行器库）。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **G-19 闭合**：`A` 本版就是链上档案里出现的全部路由名，由目录读面直接给、与链上档案同一次读；`scope_disallowed` 本版不出现；式子仍以 `A` 为显式参数 | R-4 | [S-11](v2/contract.md#s-11-合法目标集合) 允许集合那一行与第一条、[S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 末段一条、[S-12](v2/contract.md#s-12-展示列表) `scope_disallowed` 一行、S-2、S-4 两行、页首依赖说明、设计依据新两行、[G-4](v2/contract.md#十二已知缺口) 注、[G-19](v2/contract.md#十二已知缺口) | **收窄成一个确定答案**：原先 `A` 读不到 ⇒ `legalTargets`、`displayList`、`effectiveModel`、`openCall` 一律 `unavailable`；现在 `legalTargets`、`selectModel` 与写过模型切换记录的会话的 `displayList` 照常。`capability.model-profile-directory` v2 的 S-17 同波写明同一来路 |
| **另立 G-20**：原 G-19 里「用哪个模型」这项设置本身由谁产出、锁怎么判的一半**不随 R-4 闭合**——S-9 未切换过时的初值与 S-10 第 2 步的锁都读它，而它挂在 Agent 定义上、属性项没有正文契约（asset-evaluation G-21），R-4 的落点又写「资产求值不出『用哪个模型』项」。闭合之前 `effectiveModel` 一律 `unavailable` | R-4 的范围；本契约推导 | [S-9](v2/contract.md#s-9-选中模型)、[S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2 步、[G-20](v2/contract.md#十二已知缺口) | **本契约的推导**：与简报「MRR 解阻」只部分一致，见下「报主线」 |
| **S-4 撤下 `capability.asset-evaluation` `#S-23` 权限**：它只为「`A` 是设置还是权限」而消费，`A` 不再从求值结果里取；`#S-8`、`#S-22` 仍消费（G-20） | 引用即消费 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面) 那一行；catalog 那条边的 clauses 同步 | 不改语义 |
| **G-8 闭合、S-35 第 4 条改写**：`default_retry_backoff` 是一个可配置策略对象（`kind`、`base`、`factor`、`max`、`jitter`），次数与失败谓词不是它的成员（由第 1～3 条定）；默认初值放配置层，本契约不填 | R-6；N-36 | [S-35](v2/contract.md#s-35-默认重试件可替换) 第 4 条与末尾引文、[G-8](v2/contract.md#十二已知缺口)、设计依据新一行 | **不改默认件的行为规则**（第 1～3、5 条原样）；只把「一个退避值」改成「一个退避策略」。成员名沿 N-36（对齐 cockatiel 的退避词汇），**`kind` 各取值怎样长只写到性质**（封顶 `max`、`none` 不取随机），算式归提供者设计与它的性质测试 |
| **G-20 保持开放，第 2 步区分「读不到」与「没有这一项」**：求值成功而 `values` 里没有「用哪个模型」这一项（`capability.asset-evaluation/v2#S-12`：组合根的设置本版不进 `values`）⇒ 第 2 步答「没有锁」——不存在的项上不可能有锁，是事实不是默认值；求值读不到才 `unavailable`。于是 `effectiveModel` 不再因这一项缺席而 `unavailable`；**从没切换过的会话选中模型仍判不出**（S-9），本程验收装配以种子写一条 `model_selection_changed` | 主线裁定（2026-09-25，回本文件「报主线」第一条） | [S-9](v2/contract.md#s-9-选中模型) 末句、[S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2 步、[G-20](v2/contract.md#十二已知缺口)、S-4 asset-evaluation 一行加 `#S-12` | **`effectiveModel` 对写过模型切换记录的会话解阻**；经 loop 的模型链在验收装配里走得通（种子写切换记录） |
| **`openCall` ⑧ 删「层级求值」**：④ 用交来的 `target`、不重算，层级求值已在 `basis` 那一次 `effectiveModel` 里做过 | 主线裁定（2026-09-25，回「报主线」第二条） | [S-28](v2/contract.md#s-28-opencall) ⑧ | 失败集合不变，只是 `unavailable` 少了一个不会被读的来源 |
| **会话日志的引用改指 `capability.session-log` v2**（与工具执行运行时同口径）：追加入口即 `append`（S-17，返回即持久 S-13）；两个锚点、中断意图与调用终结带栅栏、结算类不带（S-10 第 3 条）；响应体以 `ResponseId` 拼出判重键（S-8）；对账与读发出记录经 `readSince`（S-19）；条目壳 S-6 | 主线裁定 [D-060 §八 N-39](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) | [S-2](v2/contract.md#s-2-本契约不拥有什么)、[S-3](v2/contract.md#s-3-本契约明确不承诺什么) 两行、[S-7](v2/contract.md#s-7-一次调用绑定了什么) 那一行、[S-8](v2/contract.md#s-8-调用在会话日志里留下的六种记录) 首段、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 三行、S-4 新一行、页首依赖、README、本文件「由别处承担」那一行 | **不改语义**。**「哪几种写带栅栏」在本契约里是首次写出**，取自那份接口契约 S-10 第 3 条对本契约的读法（推导，与 S-17「结算写入不受栅栏拒收」一致；**主线已接受**，2026-09-25 第二轮补裁）；catalog 新增本契约 → `capability.session-log`（S-6、S-8、S-10、S-13、S-14、S-17、S-19），那份契约不以坐标依赖本契约，无环 |

**没有证据因此作废**——本契约此前没有执行证据。

**报主线**：
- **「MRR 解阻」只部分成立**：R-4 闭合的是 `A`；`effectiveModel` 仍因「用哪个模型」这项设置没有产出方而 `unavailable`（新 G-20），`openCall` 要的 `basis` 就是 `effectiveModel` 的输出，所以经 loop 的整条模型链在产品装配里仍走不通。需要主线定：本版是不是「没有这一项」（那样第 2 步答「没有锁」、S-9 的初值另要一个来路），还是等 PF-004 立 Agent 定义的属性项。
- **`openCall` ⑧ 列了「层级求值」读不到 ⇒ `unavailable`**，而 ④ 只用交来的 `target` 经第 2′ 步解析、从不做第 2 步；这一项在 ⑧ 里是多余的还是 ④ 漏写了「此刻再核一次锁」，本波不自改。
- **两项已裁（主线，2026-09-25）**，落法见上表后三行：G-20 保持开放，但第 2 步区分「读不到」与「没有这一项」；`openCall` ⑧ 删「层级求值」。
- **「哪几种写带栅栏」的分法主线已接受**（2026-09-25 第二轮补裁）：[S-8](v2/contract.md#s-8-调用在会话日志里留下的六种记录) 首段与上表会话日志那一行已标明。

## 修订波（2026-09-25，pi-ai 传输节点反推）

依据链：[D-060 §八 N-40](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④（pi-ai-transport 节点 PAT-N3、N4、N9、N11、N16、N17 与 PAT-N14 ③ 的裁定）。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **状态码两种来处**：HTTP 层失败取 HTTP 状态；流已开始之后的带内错误取带内 `code` 并标 `inBand: true`；场景 S-46 第 6 支改为「首 token 之后的带内 500」 | PAT-N4 | [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 2 条、[S-18](v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 表第四、五行、[S-29](v2/contract.md#s-29-dispatch) ⑤、[S-46](v2/contract.md#s-46-成因按来源分类与脱敏) | **改语义**：原第 2 条「状态码从实际的 HTTP 响应取」与 S-46 相抵，流开始之后的 500 只能是带内 `code`。形状加一个成员 `inBand`（只取 `true`、只能与 `statusCode` 同在）：`data.model-response` S-15、`data.loop-extension` 失败主体、`data.arrival-events` 收尾的 `error` 三处同步（`data.call-accounts` 没有状态码成员，不动）。**本契约推导**：首 token 之前的带内 `code` 查同一张 `status_cause_table`，前提是带内 `code` 与 HTTP 状态同一套码（未取证，记进 G-5） |
| **规划拒绝归出门前检查**：传输适配在「已出门」之前组请求时的三种拒绝不算已出门；模态送不出 ⇒ `undispatched{modality_mismatch}`；S-18「传输本地」一行写明只管已出门之后；S-29 ④ 的次序补这一支 | PAT-N9 | [S-28](v2/contract.md#s-28-opencall) 出门前检查新第 6 行与表下一条、[S-29](v2/contract.md#s-29-dispatch) ④、S-18 前两行、新 [G-21](v2/contract.md#十二已知缺口) | **改语义**（原先「传输本地」一行写「这次发出已出门」，与规划在出门之前对不上）。**有调用没结果、`ToolInternalMessage` 混进请求两种没按裁定落 `undispatched`**：出门前的四个成因没有一个说得上它们，`undispatched` 的成因又只许是那四个（`data.messages/v2#S-50`）；本版按调用方输入错收 `invalidInput{reason}`（与第 5 行同理，**本契约推导**）。**主线已裁（D-060 §八 N-41）：维持 `invalidInput`、不放宽 S-50，G-21 闭合**；本节其余四处推导（带内 `code` 查同一张表并记 G-5 前提、`inBand` 只取 `true`、同步到 `data.loop-extension` 与 `data.arrival-events`、G-22 依据改 D-019）同时接受 |
| **上游输出上限事实本版无来源**：`data.model-profile` S-18 标有前提；本契约记 G-22，闭合之前不改值、按参数原样发 | PAT-N11 | [G-22](v2/contract.md#十二已知缺口)；`data.model-profile/v2#S-18` | 不改本契约条款；传输适配少做一件做不到的事 |
| **wire hints 的长期归属记缺口**：本版由装配按路由名逐码点精确给，初值空；`anthropic/*` 初值下不打缓存断点的代价写明；传输适配不得按前缀判 | PAT-N17 | [G-23](v2/contract.md#十二已知缺口) | 不改语义（`data.model-profile/v2#S-2` 不解析路由名原样成立） |
| **`402` ⇒ `credential_unavailable`、`403` ⇒ `request_rejected`** 按成因定义定下（两行都选得出，没有进 G-5 的「选不出」）；S-18 末条顺带写清「出门前那四个」里 `credential_unavailable` 两处都有 | PAT-N3 | S-18 末两条、[G-5](v2/contract.md#十二已知缺口) | **约束 `status_cause_table` 的两行**：402 与 403 都成为事实类成因，重试件不再对它们换家（S-30 守卫 2）。前提是两个码的含义取证属实；**报产品负责人知悉** |
| **G-10 的闭合条件**改为 pi-ai 传输节点的符合性测试 T-1～T-11；本文件「由别处承担」加一行 | PAT-N14 ③ | [G-10](v2/contract.md#十二已知缺口)、[由别处承担](#由别处承担本契约只写明要求的) | 不改语义；catalog 不登（那个包不是契约） |
| 抬头与 S-4：MRR → `data.messages` 的 clauses 补 S-32（出门前检查第 6 行据它写出「一问一答」） | 引用即消费 | `registry/catalog.json` | 无环：`data.messages` 不以坐标依赖本契约 |

**传输落在哪几条（戌指出简报把 S-13、S-14 列为传输相关有误，核对结果）**：S-13 是模态投影的读法、S-14 是缺席默认与失败集合，都不是传输义务；传输落在 [S-11](v2/contract.md#s-11-合法目标集合) 末段（本据点传输能承载的模态）、[S-15](v2/contract.md#s-15-两个锚点先写后行)、[S-16](v2/contract.md#s-16-首-token-判据)、[S-18](v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现)～[S-22](v2/contract.md#s-22-同一次调用的发出序列)、[S-29](v2/contract.md#s-29-dispatch) ④、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证)、[S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺)。契约不因此改。

**没有证据因此作废**——本契约此前没有执行证据。场景 S-46 第 6 支的观察项变了，仍「未开始」。

## N7 评审之后（2026-09-25，主线裁定 D-060 §八 N-42）

依据链：[D-060 §八 N-42](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（N7 实现映射评审的契约侧处置）。候选未冻结，原地改。

| 变化 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|
| **名字到工具条目由本能力解析**：`tools` 仍是模型面名字；本能力按名字经会话资产注册表 `lookup` 在 `tool` 类里取条目——属于某个 Run 的调用读这一次尝试的报告所依的快照，不属于任何 Run 的读当前快照；取到「没有」⇒ `invalidInput{unknownTool}`；续接时按同一份报告重取 | [S-28](v2/contract.md#s-28-opencall) ① ④ ⑧、S-4 新一行、页首依赖、README；catalog 新登本契约 → `capability.asset-registry`（S-11、S-25） | **改语义**（原先谁把名字变成条目未写）。**本契约推导**：`within` 分两种、不以当前快照代读报告那一份——`ModelCallRequest` 不带报告，**另立 [G-24](v2/contract.md#十二已知缺口)**，闭合之前属于某个 Run 的 `openCall` 取不到条目；候选闭合是请求里加一个成员带报告（与 runner `dispatch` 的 `admission.report` 同一份） |
| **S-28 表下「规划仍拒」一条写出收场**，不再「见 S-29 ④」 | [S-28](v2/contract.md#s-28-opencall) 表下 | 不改语义（与 S-29 ④、G-21 同一收场） |
| **契约正文不再引节点缺口号**：S-38 第 2 条、S-28 表下、S-18 末条、G-5、G-22、G-23 里的节点编号删去，依据改引 D-060 N-40／N-41 或本文件修订波表；G-22 的依据改为 D-019（主线已接受，N-41） | 各处 | 不改语义。**G-10 的闭合条件仍指那个节点的符合性测试**（主线 N-40 ④ 裁定的闭合条件本身） |

**同日追加（PAT-N18 ②，主线裁定 D-060 §八 N-42）**：[S-18](v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 表加第五行——首 token 之前、流已开始、带内错误没有整数 `code` ⇒ `unrecognized`，不带状态码，留痕 `upstreamError`（原文）；首 token 之后那一行同步写明「没有整数 `code` 时不带状态码」；[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 2 条并列「没有 `code` 的那一支」。**补一处原先没写的收场**，不改已有各行；`data.model-response` 的 `unrecognized` 必带留痕由 `upstreamError` 满足，形状不变。原「S-18 表第四、五行」的说法里，首 token 之后那一行现在是第六行。

**G-24 闭合（主线裁定 D-060 §八 N-43）**：[S-28](v2/contract.md#s-28-opencall) ① 的 `ModelCallRequest` 加成员 `report`（属于某个 Run 的调用必带，与 runner `dispatch` 的 `admission.report` 同一份；不属于任何 Run 的不带、`within = session`）；③ 加「`report` 与 `run` 同在同缺、必须是这个会话这个运行这一次尝试的」，不合即 `invalidInput`；④ 续接按这一次交来的 `tools` 与 `report` 重取。**改变 `openCall` 的输入**：loop（调用方）每次属于某个 Run 的调用都要交报告。**Schema 不动**：`ModelCallRequest` 没有任何 Schema（capability 不发布 Schema；`data.messages`、`data.model-response` 都不承载请求形状；`data.loop-extension` 的 `ModelRequest` 只含 `target`、`parameters`、`messages`、`tools` 四个共名成员，`report` 与 `run`、`attempt`、`basis` 同在它之外）。没有证据因此作废。

**同日追加（MRR-N15，主线裁定）**：[S-21](v2/contract.md#s-21-两个时限是运行时设置项) `first_token_wait_limit` 那一行「超了算什么」加限定——`upstream_unavailable` 只在请求已到达上游时成立；传输交回 `local{queued}`（排队没拿到连接、对上游零请求）时按 S-18「传输本地」那一行收 `unrecognized`。**收窄**：把一次本地排队到点报成「上游给不出」，重试件会拿它去换家、退避。没有证据因此作废。
## v4 候选变化与证据

2026-09-27：从 D-076 已接受 RT3 与 D-083 已接受 SL3 起草 [RT4](v4/contract.md)。只改变必要消费：第四实参 condition、全部 withRun 结算者同次完整前缀及提交点 late、完整批认回、unknown 强门、争用政策/耗尽与 owner；十三服务操作、独立 invokeModel、其余十六项精确依赖不变。旧版本冻结字节及旧证据范围保持。本候选未接受，不新增提供者绑定，也不关闭 B1 或总体验收。

| 施工验收项 | 候选规范落点 | 证据义务与状态 |
|---|---|---|
| 1 全部 append 显式 condition，保持 fence 分类 | S-8/S-68；实例 V-7 及失败分支 | 完整调用方清单及旧三参数拒绝；真实消费者迁移未开始 |
| 2 全部 withRun 结算方同次完整前缀、原 attempt、全批 tailEquals；无 run 原义 | S-69/S-72；V-1～V-5/V-7/V-14 | Settlement 三正配置与真实回复/日志交错；正式形式执行及真实组合未开始 |
| 3 THIS 零写、身份/原值、完整批认回 | S-70；V-4～V-8/V-10/V-13 | NoOrphanMessage、ClaimsWholeBatch、UnknownNotAbsence 正负配置；共同 codec/真实读回未开始 |
| 4 不增领域状态或失败、耗尽责任保留 | S-14/S-71/S-72；V-11～V-13/V-15 | PendingOwned 正负配置及逐操作返回/恢复故障验收；未开始 |
| 5 显式可替换争用政策、无默认/紧循环/模型重试许可 | S-71；V-10/V-11 | 参数缺失、耗尽、取消、无限争用有限退出；真实政策符合性未开始；有限模型不给无饥饿证明 |
| 6 unknown opened 强门/物理旧写者停止 | S-17/S-33/S-70；V-8/V-9/V-15 | NoSettlementThroughUnknownOpened 正负配置；真实门/网络/append/unfenced 写者停止仍未开始，模型 StopOld 仅假设 |
| 7 共同物理日志/全写方键、生产 Run 和合法完整读取 | S-69/S-70/S-73、G-28～G-30 | 有限模型不代证文件 IO、读取权限或生产 Run 认法；原 owner 缺口保持 |
| 8 多值头保持原表示 owner 缺口 | G-31 | MR4 不改；TransportFailure 数组不冒充合法持久 string-map；依赖此映射的实现继续受阻 |
| 9 双向竞争与未知实例齐全 | [15 个新场景](v4/examples.md#v4-增量结算竞争与恢复)，旧操作/失败实例继承 | 规范场景已起草；真实执行未开始 |

**形式工件**：[Settlement](v4/formal/README.md#结算组合模型) 新行为模型、三正配置、六个指定负控；原 RT3 三 TLA/十 cfg 逐字复用，v2 Invocation 仍精确引用原版。新候选登记分别覆盖三个继承任务与三个 Settlement 任务；否定配置不登记正任务。旧运行不改称 RT4 运行，正式 TLC 由独立验证者执行后在本节追加实际输入与结果。

**作者结构检查范围**：逐操作九项、S-1～S-73 编号、27 项候选资源及候选登记、17 个精确依赖、55 项 reviewed=false 覆盖、继承函数/配置字节、局部链接、配置常量与 oracle 名和冻结资源不变性；这些不证明策略正确、模型有反例或真实实现符合。首次检查只报告新验证锚点尚未落盘，补齐本节后，作者定向结构检查通过（930 个本地链接、64 个旧冻结资源不变）；设计检查 `internal / formal=skip` 通过，TLC 明确跳过；新 Settlement 经主线给定 Java/TLA2TOOLS 执行 SANY 解析，退出 0、无语法/语义错误，模型 SHA256 `345bec05910174cfd0e27509b0cb2f753b4ea218ebf6077724d8af9330fe5c86`。SANY 不执行配置、不证明断言或反例。正式语义/表达评审和接受尚未开始。

**变化的影响**：从 RT3/SL2 到 RT4/SL3 必须沿 [consumer-impact](v4/consumer-impact.md) 显式传播到 runtime、JSONL、外部回复、runner 日志写者和验收应用；旧推荐版或提供者单独采用不自动升级消费者。G-28～G-31 只把现有跨 owner 缺口放在本候选消费入口，不在本轮替它们选择政策。条件追加不要求 MS4/MR4/CA2 升版，也不展开完整 Agent Loop、模型认证或通用资产主线。

### v4 独立评审后修订 2、3（候选，待定向复审）

以上作者结构检查及模型哈希是首稿记录，不代表修订后的正文已获接受。独立 run 1 的 `UnknownAsAbsent` 负控退出 75：轨迹 `Prepare(1) → Submit(1) → LoseAck(1) → Recover(1)` 留下 `unsafeAbsence = null`，属于后继状态未完整赋值，**不是指定反例通过**。修订 2 仅给 `unsafeAbsence'` 等式的整个析取右值加括号，未改不变量、常量或 oracle；该模型经作者 SANY 解析退出 0，SHA256 为 `d7f25d31fa24a25560bf67d4bc9adf0ccb9b7a9f66606f9a56023f9e2e9049f5`。原输入、失败原文及最小 diff 已保全在任务临时证据中。独立 run 2 由主线另行执行；本作者未运行 TLC，不把首轮结果移作新模型证据。

修订 3 按主线基于独立表达/架构评审所界定的最小边界修改，当前只交复审，不由起草者判断发现已闭合：

| 发现与变化 | 落点 | 证据与影响 |
|---|---|---|
| RT4-ER2：切换追加确知未提交只保证本次无切换；回执未知仍 unavailable，当前选中以 S-9 权威记录为准；读值不识别本次未知命令，旧写者未停缺席读不关闭未知 | S-27⑧/S-43/S-72；examples §4 与补充规范向量 | 不增加命令键、恰一次、自动重放或回滚。同步 S-6/S-32⑧/S-33/S-49⑧：本实例待确认责任不否认已耐久的响应或终结；按原认回与返回规则收口 |
| RT4-ER3：进展须有合法完整前缀、实际停止/恢复、政策许可内可得的提交机会，恢复实际被调用且可执行 | §八进展首行及续接行、S-17；examples 补充规范向量 | 首次收口触发、保留 owner 都不保证未来成功或获调度；前提不满足仍有未完成义务。没有增加恢复调度或无条件时间界承诺 |
| RT4-ER4：更新可编辑入口中的采用状态 | topic README；S-4/S-35/G-25；consumer-impact | RT3 与 runner3 按 D-076/当前 registry 标明已接受；runner3 仍精确消费 RT3，不自动升级 RT4；冻结正文和历史记录原样保留 |

编号场景 V-1～V-15 保留，增加四组未执行的补充规范向量。S-1～S-73、十三操作、失败集合、S-54～S-67 独立函数正文与候选登记保持；消费者落实要求同步于 [consumer-impact](v4/consumer-impact.md)。修订 3 的全部 TLA、cfg、oracle 及 formal 说明与修订 2 保持逐字节一致，形式运行不因正文修订被追认为覆盖这些新表述。结构检查只核结构、链接及字节边界，不能代替定向复审、真实故障验收或独立形式执行。

**本修订作者实际检查**：候选结构检查、`check_design.py --gate internal --formal skip`、`git diff --check` 均退出 0；73 条、13 个九项操作、926 个本地链接，64 个旧冻结资源及 13 个继承形式文件不变；全部 24 个 formal 资源相对修订 2 哈希相同。原始 stdout/stderr、argv/cwd/退出码与旧新清单保全在任务目录 `tmp/model-request-runtime/b1-runtime-spec/revision-3/`，供主线冻结交复审。未在本修订重新运行 SANY 或 TLC；新向量的实际执行仍未开始。

## v5 候选变化与证据

**状态：candidate，未接受；真实符合性未开始。** 完整规范为 [contract](v5/contract.md)、[examples](v5/examples.md)、[consumer-impact](v5/consumer-impact.md) 和 [formal](v5/formal/README.md)。MR5 三份规范是固定 candidate 输入，不在本次改写；方向依据为 [header-handoff rev1](../../../record/proposals/model-request-adaptation/header-handoff.md)，技术选择评审不代本版全文评审或接受。

**变化的影响**：完整保留 S-1～S-73、十三服务操作各九项、原失败/拒绝次序和 SL3 耐久结算/恢复；唯一依赖升级 MR4→MR5，原二十六 MR 消费条款与其余十六依赖保持。S-58 公共 rawHeaders 单一权威→S-54 最终结果→S-17 完整响应保留原值；S-59 不覆盖，S-16/S-20/S-62/S-63/S-64 承接首 token、秘密、观察与交接责任。没有新失败代码、Schema、模型调用、观察队列、政策默认或兼容决定。消费者须另做精确采用，旧 D-087/D-088 投影和 MR4 接收面不自动支持数组。

| 本 topic 局部标签 | 可失败的证据义务 | 责任与状态 |
|---|---|---|
| RT5-H1 | string／ordered string[] 的原形、顺序、重复、空串/空数组/空 map/缺席；非法 map/混型拒绝；自有不可变；原表示校验和发送前取消优先不变 | core/transport/runtime 与 response owner；公开端口/完整 MR5 形状符合性及变异负控，未执行 |
| RT5-H2 | 同次 send→invoke，真实 TLS 的成功/HTTP 错误/带内失败/读体或解析中断/门失败/取得头后取消全分支保留；成功 R 不透明、read 无另一头权威 | transport/runtime owner；真实组合和取消/关闭故障场景，未执行 |
| RT5-H3 | 仅头不触发门/首 token、snapshot/onAccepted/arrival 不交头，模型上下文/默认人类呈现/diagnostic detail 无头对象 | runtime/observer/各消费 owner；边界观测和头当 token 负控，未执行 |
| RT5-H4 | 原参数/绑定/实际值/usage/cache/cost、四 outcome、最多一次 send、十三操作拒绝/失败、SL3 整批/unknown 与实际停止全部回归 | runtime/host/日志/回复 owner；原操作及37模型真实验收仍未完成，本轮未执行 |
| RT5-H5 | 完整 MR5 原值→所有真实写方→一次 append→关闭旧 writer/reopen；同批身份/账/原批优先、unknown 强门与秘密哨兵 | core/codec/runtime/所有回复写方与日志 owner；真实日志与故障负控，未执行，不能只测 map JSON 往返 |
| RT5-H6 | public 制品和双语 literal 严格消费完整值；compiled 形状损坏、取消丢值、头当 token 与旧 MR4 错接等负控能失败 | core/运输/运行时/codec owner；先明确公开入口和精确采用，未执行；不自决 wrapper/key 的历史兼容/混用 |

详细前提、输入和期望在实例的同标签行。场景驱动给显式测试政策不成为产品默认；G-6 的真实取值仍未定。Schema 只能判表示，不证明采得／原样交接／脱敏／持久过程，readonly 不能证明自有不可变。

**形式义务**：v5 目录逐字携带四 TLA、十九 cfg（六正配置、十三否定配置），六个新任务 ID/路径/metadir 从 v4 精确换版登记；未运行 TLC/Alloy。可失败断言、常量、公平性、模型吸收的前提保持 formal README 映射；rawHeaders 没有进入继承模型，不能将旧模型或 CancelEventuallyStops 记为新头性质及真实资源停止的证据。全部否定配置只作 validity-check。

**保留的缺口**：G-28 生产 Run 终结认法归原 loop/Run/runtime/回复 owner；G-29 共同业务键与真实提交/恢复/实际停止归日志、runtime、全部回复方与主线；G-30 合法完整前缀的授权/供给归访问授权、宿主、日志与结算者。G-31 仅候选表示/交接表达完成，MR5/RT5 正式采用、core 完整接收、提供者投影、全写方和真实链均未闭合。其他继承 G-n 原 owner 不变，见契约完整表。

**本次未覆盖的产品 rev 重核边界**：继承 RT4 原 PF-013 rev13、PF-012 rev15、PF-009 rev8、PF-004 rev12、PF-001 rev19、PF-015 rev11 的已接受依据。现场前三项一致；后三项现为 rev13/rev23/rev13，本轮 headers 增补未全量重核或重采纳这些后续修订。后续差异处置归各原产品 owner 与主线；本候选 covers 55 条均未独立复核，不改旧 accepted 行。

**起草检查与证据范围**：本树 baseline checker internal/formal=skip 实际退出 0（PID 120930），不执行形式工具。作者最终结构/引用/旧字节及 diff 检查结果由下面的本次记录给出。原输入、initial dirty、实际 argv/cwd/PID/exit/wait、stdout/stderr、首次失败、输入/候选快照及作者独立 patch 归施工交接。以上工具检查不代替独立架构/表达评审，不声称规格已接受或真实链通过。

### v5 本次作者检查记录

2026-09-27，本树自身 .venv 执行 internal/formal=skip：最终候选检查 PID 125605 退出 0，60 项 formal 均明确 skip；结构/旧字节检查 PID 125661 退出 0；git diff --check PID 125583 退出 0。73 条、十三个九项服务操作、27 规范资源、17 精确依赖已核；472 冻结原文件、7 个 root 所有输入、20 个提供输入均无漂移。catalog/covers/tasks 的原 80/2043/54 条记录原字节保留，仅增加 1/55/6；四 TLA 与十九 cfg 字节等同 RT4。

首次候选检查 PID 124834 退出 1：catalog 缺必填 acceptance:null、实例标题锚点遗漏，前者连带使新 task 的资源未入 catalog。已修复；首次结构助手 PID 125086 退出 1（漏算四级条款标题），第二次 PID 125178 退出 1（依赖归属表在 S-2，助手误列 S-4），只修正助手，不放宽规格保证。原 raw/argv/PID/exit/wait 保留于本次施工证据，修复后通过不抹去首次失败。工具输出截断导致的首次 apply_patch 拒绝另有记录，未修改规范。没有执行 TLC、Alloy、模型请求、真实 IO、实现测试或新的 Schema 检查。完成证据追加后的最终复查及交接归档索引由施工 HANDOFF 记录。


## v6 候选变化与证据

2026-09-28：RT6 candidate 从 D-090 已接受 RT5 复制后定点演进；未接受，未冻结，未提交。76 条（原73+S74～S76）；原十三操作九项保留，七个 TLA 模块、二十九配置，共四十资源。能力层不新发 Schema，唯一值引用 MP4/MS5/MR6/LC5；PendingModelResponse 与 ModelRetryConclusion 由各 data owner 拥有。

### 变化的影响

- PF-013 rev14/D-096：完整 cap/upstreamInputLimits 固定在快照；每次实际 plan 在新锚点/HTTP之前计量，公开函数与服务同门，保守界不可判与准确超限分开。old codec保留历史，禁止借新目录补旧cap。
- MR6 S39/S40：带回复返回完整 PendingModelResponse，禁止 disposition/late；只有显式处分后构造持久响应，实际提交时 late 原义不变。原头/取消/未知锚点/凭据/完整批保证保留。
- LC5 S42/S43：失败维结论明确 modelCallId，主体完整 retryConclusions。默认件按自身已生效结论计数，已给未发计入，失联续接与自定义件不冒充自身重试。
- 原四模型与十九配置逐字继承 RT5；新 FinalPlan/PendingReply/RetryHistory 及四正配置、六负配置为新增义务。跨包 Schema 不由本包复制；其他产品 rev 仍沿契约抬头的继承范围。

### 本次实际检查

- `python3 tooling/src/check_design.py` 首次因解释器过旧中止：`AttributeError: 'PurePosixPath' object has no attribute 'is_relative_to'`。随后使用工作区已存在的 Python3.12，不安装依赖。
- 第一次 Python3.12 检查实际输出 `FAIL: design validation found 9 error(s).`：3处新 verification 导航尚未写入，6处链接目标为本 spoke 未集成的 MS5/MR6/LC5 包。前三处由本节补齐；后六处保留 G-32，在批集成后检查。
- 最终 Python3.12 原工作树检查实际输出 `FAIL: design validation found 6 error(s).`（退出1）：仅本 spoke 尚未集成的 MS5 S49/S50、MR6 S39 与 examples、LC5 S42/S43 六处链接。各 owner 已给稳定锚点；共同批集成与复查归主线，不能将这个失败报告成通过。
- 本包结构核对实际输出 `PASS: RT6 has 76 unique clauses; all 13 service operations have nine items; all 23 inherited formal files byte-identical; 40 candidate resources present; catalog fragment has 17 exact dependencies.`；`git diff --check` 退出0。该核对不验证业务语义或形式模型。
- 临时原始输出为本次 `runtime6-fragments/check-design-final.log`、`local-audit.log`，登记片段由主线收存；它们不是 record/evidence 的已发布证据。

### 证据义务及状态

| 义务 | 规范落点 | 状态与负责者 |
|---|---|---|
| 十三操作原完整动作链、headers、credential、cancel/late/unknown 实际组合 | 原实例及 RT5-H1～H6、S68～S73 | 未开始本版验收；原owner保持 |
| 每模型/供应商的可靠计量、所有实际发送模态/工具/协议、UTF8最终体 | RT6-I1～I9、S74、FinalPlan | 未开始；计量/传输/runtime提供者，G33 |
| 完整pending数据交接、无默认处分、持久schema门与多写方 | RT6-P1～P3、S75、PendingReply | 未开始；MR/core/runtime/codec/实际回复写方 |
| 已给未发、[A,A]两历史、跨调用与自定义结论、旧格式拒猜 | RT6-R1～R4、S76、RetryHistory | 未开始；LC/runner/runtime/日志提供者 |
| TLC 正反配置 | v6/formal/README.md 的精确映射 | 新增四正退出0、六负指定断言退出12；精确独立证据见下节。继承配置未重跑 |
| 数据 Schema 与真实生产读取、Run 终结认法 | MR6/LC5/MP4 owner；G28～G35 | 本包不代证；无 generic bool/fixture 闭合 |

### 登记边界

本 spoke 不修改中央 registry。提供 `catalog.fragment.json`（1候选/17依赖/40资源）、`covers.fragment.json`（58条 reviewed:false）、`formal-tasks.fragment.json`（10正任务候选）、`id-namespaces.fragment.json`（复用S-/G-、无新增前缀）的待集成片段；它们不等于中央已登记。负配置不列formal task。主线在共同批集成后落唯一清单并复核精确消费，接受另行。

### v6 候选修复：FinalPlan 比较表达式

2026-09-28 独立 TLC 首跑 FinalPlan.cfg 退出150，原始输出为 `Error: Parsing or semantic analysis failed.`，尚未进行性质检查，不是预期负配置反例。起因是 `checked' = measured <= Cap` 的运算符歧义；候选仅将 Evaluate 的三处 `measured <= Cap` 显式括起，性质、常量与配置不变。修后 FinalPlan.tla SHA-256 为 `bdc58e64ef05a4c598340386a7c2d8305393cc2dc1f55a89b4526c02324bbf92`；已交独立验证者另存输入并复跑两正三负，复跑结果尚未取得。旧失败日志保留在本次独立验证任务目录，执行归档由主线统一收存。`git diff --check` 通过；未重跑全仓检查或旧字节未变配置。


### v6 当前需求来源核对与独立形式结果

2026-09-28：按本版实际义务重读 PF-004 rev13 §6.6、PF-001 rev23 §6.4、PF-015 rev13 §6.12 与会话恢复段，并核对各包工作区增量的变化范围。对应请求时模型绑定、租户隔离/成本归属、固定会话租户与恢复义务仍成立；contract 的来源元数据及表改引这些当前精确来源。共享工作区、参与治理、reload、实例/多 worktree 和 AGENTS.md 上下文变化不由本版新增保证，归其所属契约。不是盲改 rev，也不改变旧冻结版来源。

[独立有限 TLC 证据](../../../record/evidence/2026-09-28-formal-model-input-successors/README.md)已完成本版新增三模型的四正六负：FinalPlan.cfg 退出0/49不同状态，FinalPlan_Public.cfg 退出0/43，PendingReply.cfg 退出0/8，RetryHistory.cfg 退出0/42；六负均退出12且分别命中 CheckedBeforeEffects、SameFixedPlan、UnknownNotExceeded、NoInventedDisposition、CompleteHandoff、CountsOwnConclusions。已实际读取本轮 REPORT.md 与首次失败日志；记录中的工具为 TLC2 2026.09.12.025210（rev867aefb），Java21.0.12.1。首次 FinalPlan 解析失败退出150的记录保留，修后模型哈希仍为 `bdc58e64ef05a4c598340386a7c2d8305393cc2dc1f55a89b4526c02324bbf92`，不是把解析失败当预期反例。

此结果仅支持 formal 入口列出的有限安全范围及输入前提；不证明实际计量、附件取得、Schema完备性、完整日志来源、真实多写方/资源或生产Run识别。旧字节不变配置未重跑；Alloy、规范场景及真实IO未运行。证据目录由主线迁入，候选包本轮未修改 record/registry，也未接受规格。


### v6 变化的影响：失败主体的只读重取

2026-09-28 整批表达检查发现：S29 已提交失败响应但 history 暂不可用后，原只读面未返回完整失败主体。主线裁定在现有 S34 readAttempts 的④⑤⑦⑧补 failureSubject 分支，S76.2/.5明确引用：awaiting_decision且最近实际响应failed时，同一合法完整前缀决定状态、响应、dispatches及完整retryConclusions；必要源不可判整体unavailable，恢复后重复读取可重取。其他状态不附主体，读取没有写入/发送/凭据/计次副作用，后续dispatchAgain仍核当时状态/守卫/fence。十三操作数目不变，旧冻结版未改。

新增 RT6-R5～R8 覆盖源恢复、缺历史整体失败、并发前缀一致和S33后重取，真实消费者场景**未开始**。此变更只补现有读取的结果关系，不新增耐久状态或写入交错；不扩张现有 RetryHistory 模型覆盖。上述独立四正六负仅验证原已建模范围，不声称已验证这一重取路径。consumer-impact同步；本轮不改registry或接受记录。

## v8 估算计量保证

### 变化的影响

PF-013 rev15 产品语义由用户明确确认，正文来源 a61cc601 与 §8 对齐修订 578e39f2（本 spoke 输入提交 7ee05060）；表达复核与技术接受归主线，candidate 不声明已接受。仅 MP6 与 RT8 后继；MP6 S-8/S-33 改准入计量保证但字段、Schema断言和纯判定不变。RT8 S-74 允许适用 tokenizer 估算加显式 tokenMargin，basis=estimated 拒绝不冒充 exact；bytes/图数保持精确，actual usage仍来自上游。Directory5/MS6/MR7/LC6继续精确消费原表示，理由见候选的消费者影响段。

简报裁定：multiplier≥1有限十进制、reserveTokens≥0整数，两项显式；admissionTokens=ceil(estimatedTokens×multiplier)+reserveTokens；原三拒绝reason不变。推导细化：政策非法沿既有malformed、在cap/事实missing检查后验证；准确超限与估算拒绝并存时优先报告准确事实，理由是保持原准确超限优先且不混淆来源。没有新增领域对象、服务操作或实际usage字段。

### 证据义务与缺口

真实tokenizer适用依据、完整输入覆盖、任意有限十进制实现、固定最终请求、37模型生产认证与真实IO：**未开始**。MP6不增加状态机/Alloy；RT8仅改FinalPlan，其他模型仍按前驱的明确输入范围解释，不把旧结果改称本次通过。

既有缺口owner保持，MP G-15与RT G-33仍要求逐模型/供应商/版本的计量及材料证据；RT G-28生产Run终结认法不因本轮关闭。无新术语定义；tokenMargin及metadata为既有计量概念的技术参数（无独立词条）。中央registry未修改，候选登记片段在任务区fragments，主线负责合入与接受。

### 本次实际检查（2026-09-28）

候选静态检查 240 项全部通过：MP5/MP6 Schema 断言逐项相同、同一组实例在两版结果相同、纯判定不变；RT8 保留 76 条与十三操作各九项及原失败集合、其他六个 TLA 模型及其配置逐字继承，五组精确十进制公式向量通过。`check_design.py --root .meta_harness/design --formal registered` 实际退出 0；它检查中央已有登记，不代替候选片段集成。片段资源路径、消费条款与覆盖条款另经上述静态检查。

FinalPlan 两份正配置实际 TLC 退出 0（WithLog=true：8737 不同状态；公开无日志：8545）；九份负配置均退出 12，分别命中 CheckedBeforeEffects、SameFixedPlan、UnknownNotExceeded、EstimateCanProceed、MarginApplied、EstimateNotActual、MissingPriority、BytesExact、UsageFromUpstream。模型允许 estimated≤cap 而实际上游 token>cap 的发送；这不是本契约承诺排除的状态。首次运行使用异类型集合导致 TLC 指纹错误退出 75，原日志保留；改成带标签记录后另存最终输入重跑。未重跑其他继承模型，未运行 Alloy 或真实 IO。

本次本地证据位于 spoke 的 `tmp/model-request-runtime/token-estimate/`：`checks/checks.json`、`checks/check-design-run.json` 及原始输出；`formal-run-1/` 保留首次工具失败，`formal-run-2/runs.json`、`formal-run-2/sha256.json` 与各配置原始输出保存最终形式输入和结果；`fragments/` 保存八份待集成登记片段，`CHANGE-AUDIT.md` 记录最小变动与推导项。主线需归档这些临时证据；它们不是已经归入 record 的接受材料。


## 恢复时序候选

2026-09-28：[RT9 契约](v9/contract.md) 与候选登记起草完成；未接受、未冻结。变化的影响：只扩展已锚定 interrupted 的 sentAt:null 表示，保留真实已知时刻，禁止时间代填与据 null 重发。首 token、实际账、十三操作、全部计量余量政策和原精确数据依赖不变。Scope/可用性/真实事实仍由能力与写入者兑现，纯 Schema 不提供其证据。

- 契约与 registry 内部检查：本次以 uv 缓存 CPython 3.12、spoke 自身 tooling/src/check_design.py 执行 `--gate internal --formal registered`，退出 0（输出 `/tmp/recovery-timing-check-4.log`）；该工具不执行 Schema 实例或 TLC，不把登记通过称为形式验证。Schema 实例验证待执行。
- 新形式工件：RT9 RecoveryTiming 一正配置四负控；工具链未提供，未运行。旧模型逐字继承；本版未重跑，不复述旧执行为本次通过。
- 真实实现符合性：未开始。runtime/response/codec owner 须验证两种相同完整前缀（锚点后未 send、send 后丢时刻）、opened 保留、已知时刻保留、零 HTTP、未知门与完整批认回，以及 Pending/独立 invoke 禁 null。具体验收向量见 RT9 examples 的 v9 节。
- 新编号族：无，沿 registry/id-namespaces.json 的 S-/G-；旧 accepted/frozen 不修改。覆盖复制为 reviewed:false，候选依赖不提升接受状态。
- 报给主线：loop-extension-runner/v5 仅消费 MR7 S-10/S-14/S-36，没有 Timing/根 Schema 的实质依赖，不需连锁升版；实现若私下依赖应收回对应实现边界。恢复 provider、核心响应与日志 codec 的采用/实现由主线另派，不在本包起草权内。

- G-15（MR8）补充裁定已落：主线允许窄澄清同次固定计划与真实发送关系；MR8 S-9/S-11、RT9 S-33 同步更新。正常发送必须实际一致，零 send／不可判中断沿锚点原样还原适配结果，不猜发送/费用/重试；候选待独立审查，未接受。


### 恢复时序候选的独立评审修订

2026-09-28：按主线转交的独立表达发现，S-17/S-33 三个追补分支与撤除说明统一为“保留同次可信真实事实，不可得部分才 unknown”，不从 sentAt:null 丢已知账。可信来源限定原执行 owner 持有且经过既有传输/归一化边界确认的同次事实／原完整批，禁止任意 caller 声称；不增加采信入口、账修补或 HTTP 重查。修正 §十四 RT8→RT9 来源和 G-31 采用坐标。新增规范正反场景；真实故障注入、Schema/TLC 执行状态不因此提升。UL/领域对象的表达对齐由主线其他 owner 处理，本包未越权修改。

上述修订后同命令 internal/formal registered 实际退出 0，输出 `/tmp/recovery-timing-check-5.log`；`git diff --check` 通过。仍未执行 Schema 实例与 TLC。

## 2026-09-28 恢复时序有限执行

[D-104](../../../record/decisions/model-recovery-timing-adoption/decision.md) 已接受；[10个Schema边界与1正4负有限形式结果](../../../record/evidence/2026-09-28-formal-model-recovery-timing/README.md)实际执行通过预期。不是完整旧例回归、纯判定拒绝优先级、真实恢复或提供者迁移证据。


## RT11 本批候选验证（2026-09-29）

变化和未开始的真实义务见[v11/verification](v11/verification.md)。实际工具运行：Schema检查57/57形状实例；RT11三个新增TLC正配置均exit0（ReferenceLifecycle:2206 generated/621 distinct；Publication:147/60；OpenedOrder:254/166），九个负控均exit12且命中目标不变量。未重跑继承形式工件，不将其旧结果算成本批覆盖。原始日志位于任务worktree的`tmp/model-registry-design/spec-draft/`（schema-check.log及tlc/）；提供者/装配/真实网络/权限/存储故障与性能测量均未开始。设计检查最终结果由本批交接记录，不预写通过。

本批最终登记/文档检查：`check_design.py --root .meta_harness/design --formal registered` 实际exit0，输出 `PASS: design tree ... passed gate=internal; formal=registered.`（design-check-locked.log）。本树`.venv/bin/omne-docs-check`实际exit0，`PASS: 1836 Markdown files; local links and skill mirrors.`（docs-check.log）。852份原frozen资源逐项SHA匹配，frozen.json与4edf6cdc原字节相同。未运行release gate，不声称接受。

## v12 ACK后继候选

[v12 contract](v12/contract.md) · [消费者影响](v12/consumer-impact.md) · [验证义务](v12/verification.md)。candidate，未接受；前驱v11接受状态不传递。ACK确认、真实处分与清理分别可见；本批证据未完成时不据目录存在宣称通过。

### 本批已执行检查（2026-09-29）

三个新Schema的80个显式root/defs正反实例全部符合预期；MS8的20个固定语义编码/摘要向量及4组相等、6组不等关系通过独立逐例编码核对。RT12 AckLifecycle与AckProgress各生成6688/2124状态，exit0；8个单变异负控各exit12并报告对应不变量反例。初次形式运行解析失败、第二次admission负控赋值错误及Schema检查器一处选错Pending入口，均另保留输入hash与原日志，修正后另目录运行，不声称一次通过。

形式工具为TLC2 2026.09.12.025210（867aefb）、Temurin 21.0.12.1；2calls/2consumers、单Focus、一次可选crash、显式公平性范围见新版本formal/ACK-README。90份继承形式工件逐字相同，本批未重跑；不把它们算为ACK新证据。design检查internal/formal=registered已通过，该模式只核登记不执行模型。实际脚本、commands、输入SHA与日志由主线提升正式evidence；真实提供者/授权/存储/内存清理/未知写入组合验收仍未开始。

本批文档检查亦实际通过：1948份Markdown；冻结清单970文件SHA均保持。文档检查不代表语义接受。
