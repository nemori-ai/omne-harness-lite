# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **下述为 v2 前身在 2026-09-25 起草时的历史验证状态；接受状态以 topic 入口与 registry 为准。**
> `capability.assembly-manifest` v2 是 `candidate`，**未接受、未经独立评审**；尚无提供者节点、尚无源码。
> 本版不建形式模型（[契约 S-25](v2/contract.md#s-25-本版选用哪些形式工件)）；规范场景**一条都没演练**。

## 证据义务

### 形式工件

**无。**理由在[契约 S-25](v2/contract.md#s-25-本版选用哪些形式工件)：条件追加的判定是一个整数相等，它的必要前提（判定与写入同一步）靠场景 S-26 的真并发与故障注入给证据。**若 PF-004 那一程把「一份清单」的复用与失效收进来、出现多个写入方或跨进程定序，重新判**。

### 规范场景

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-26 条件追加：两路并发恰一路成](v2/contract.md#s-26-条件追加两路并发恰一路成) | 演练，**真并发** ＋ **故障注入**（判定拆成两步，预期失败） | **未开始** | 受阻：最小提供者节点未立。会话资产注册表节点关键选择三的共同存储对象落在这里 |
| [S-27 装配那一次的回执丢了](v2/contract.md#s-27-装配那一次的回执丢了) | 演练 ＋ **杀进程** | **未开始** | 同上 |
| [S-28 按表时刻读回历史](v2/contract.md#s-28-按表时刻读回历史) | 演练 | **未开始** | 同上 |
| [S-29 头与各类最后一条出自同一刻](v2/contract.md#s-29-头与各类最后一条出自同一刻) | 演练，读与追加并发 | **未开始** | 同上 |
| [S-30 读不到不是没有](v2/contract.md#s-30-读不到不是没有) | **故障注入**（存储读不到） | **未开始** | 同上 |
| [S-31 在场判定三种答](v2/contract.md#s-31-在场判定三种答) | 演练 | **未开始** | 同上；事实由测试种子给（契约 G-2） |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 一条记录带齐它换掉的每一张表的完整构成 | [S-6](v2/contract.md#s-6-记录与它的壳) | 会话资产注册表 | 它的规范场景（重启重建） |
| 撞 `headMismatch` 之后重读、重算、再交 | [S-3](v2/contract.md#s-3-本契约明确不承诺什么) | 会话资产注册表 | 它的节点关键选择三 |
| 在场事实的给出 | [S-10](v2/contract.md#s-10-在场事实) 第 2 条 | 装配（本版验收：测试种子） | 据点装配的验收装配 |

## 对齐义务

- ~~**`EvaluationRef`**：两处定义、同轮核~~ **撤销（2026-09-25 修订波）**：权威只在本契约 [S-8](v2/contract.md#s-8-求值引用-evaluationref)，`capability.asset-registry/v2#S-13` 改为以坐标引用它（catalog 登那一侧 → 本契约，D-060 §八 N-37 ③；契约 G-6 闭合）。本契约改 S-8，按消费者影响分析通知那一侧，不再是双向的对齐义务。
- **`alreadyRecorded`** 与 `capability.session-log/v2` 的同名值说同一件事（这个键已有一条已提交的记录，这一次什么都没写）；载荷不同（这里交回那条记录，那里交回撞上的键）。两边改一边，另一边同轮核。
- **`headMismatch`、`alreadyRecorded`** 就是会话资产注册表节点 R-M1、R-M2 说的「冲突」「已在」；节点改用这两个名字与否由主线定。

## 实际执行

**无。**

## 独立评审

**尚未评审。**

## 变化的影响

| 日期 | 变化 | 影响 |
|---|---|---|
| 2026-09-25 | 起草 v1（candidate） | 新登 catalog、covers 条目；`capability.asset-registry` 的 G-1 与 S-18 第 4 条、会话资产注册表节点 A-1、派发器节点 RUN-N5、据点装配 C-2／C-14 **正文尚未改指本契约**，改指与否由主线裁 |

## 修订波（2026-09-25 公开面）

依据链：[D-063](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1（替身改为接口契约 ＋ 最小提供者）；[D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-33～N-37。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **`EvaluationRef` 的权威定在本契约 S-8**，`capability.asset-registry/v2#S-13` 改为以坐标引用它；原双向对齐义务撤销；G-6 闭合 | N-37 ③ | [S-8](v2/contract.md#s-8-求值引用-evaluationref) 第 5 条、首段词条说明、[G-6](v2/contract.md#十已知缺口)、本文件[对齐义务](#对齐义务) | 不改形状；消费者改为单向依赖（catalog：asset-registry → 本契约） |
| **`dependencyPresence` 是 `assemblyManifest` 的一个查询、不另设服务键**；派发器按它判 `needs`，整次 `unavailable` 不是「缺席」 | N-37 ② | 第十一节提供者映射、消费者核对「拓展点派发」一行 | 不改语义；派发器 S-12、S-16、S-33 同波写明 |
| 「尚无决定记录」改链 D-063 R-1；账本外名字标「主线已接受」 | R-1；N-37 ① | 首段、失败值表下注 | 不改语义 |
| 消费者正文改指本契约：`capability.asset-registry` v2（S-13、S-18 第 4 条、G-1）、`capability.loop-extension-runner` v2（S-12）已在本波改指 | R-1 | 那两份契约 | 本契约不变 |

**没有证据因此作废**——本契约此前没有执行证据。

## v3 候选：求值投影读面（2026-09-27）

状态：candidate，未接受。承接用户本次模型请求纵线交付要求与主线在 [适配提案 rev 2](../../../record/proposals/model-request-adaptation/design.md) 下的窄化裁定。保留 S-1～S-31 的四操作判定；新增 S-32～S-35、一个九项齐全的只读操作。采用 `capability.asset-evaluation/4` S-8/S-12/S-47；`data.asset-model` 显式由 2 改钉已接受 3，类别不变，另消费 S-3；其余 data 依赖原版不动。

| 证据义务 | 状态 | 范围与责任 |
|---|---|---|
| 旧四操作九项、冻结 v2 资源与需求 rev、候选五操作九项和精确依赖条款存在 | 本次局部检查通过 | `tmp/model-request-runtime/manifest-v3/check.py`；raw 为同目录 `check-output.txt`，SHA-256 为 `input-hashes.json`。35 条款、5 操作；不证明实现 |
| 全树设计检查（formal=registered） | 本次失败 | raw 为同目录 `design-check-output.txt`：4171 项错误，主要为并行新增 response 证据 Markdown 快照的失效相对链接，另有其他并行草稿尚缺文件/锚点。本包未被该次输出点名；不据此声称全树通过，交主线集成后重跑 |
| S-34 固定头上界后的最新新求值、旧表 reuse 不回退、读取一致性与故障 | 未开始 | assembly-manifest 提供者真实读与并发/故障注入；不能把 Python oracle 或手工 JSON 读写当产品实现证据 |
| S-35 空头、缺字段、畸形排列、严格无损 JSON、两会话隔离 | 未开始 | 真实追加与投影读边界；授权由既有装配/协议保证承接 |
| S-35 源输入→真实 evaluate→写方同一 append→运行时/内建重试消费者 | 未开始 | 求值 v4、asset-registry 新版与消费者实际采用；源输入不能换成人工拼好的最终求值结果 |
| TLA+/Alloy | 不新增，未运行 | 新增读投影不引入写入交错、持久状态或跨 owner 同提交；原 S-25 真并发与故障义务仍适用 |

### 变化的影响

- v2 冻结资源不动。v3 的旧四操作接受任意合法 JSON、条件追加顺序、幂等与未知结果不变，新增读面不倒逼旧追加校验投影。
- `content.evaluation`/`compositionOrder` 是读面需要的两个槽位。写入方自身的完整内容形状、如何生产及落到同一记录仍由它拥有；manifest 不新增原始 EvaluationInput 副本，也不拥有设置值或默认数值。
- 本轮技术裁定已替换初稿的按头引用寻源规则：`readEvaluation` 固定当前头后，按提交序号选上界内最近的同会话 `given`/`mint`。旧表 `reuse` 的引用仍保留，供原读面追溯，不使全会话最近已提交求值回退。runtime 和 runner 需显式采用；本读面不代证当下层配值。初稿检查结果保留其旧源范围，不支持本轮新规则。
- 新失败诊断 `unavailable{reason: invalid_evaluation_content}` 由主线账本给定；空头继续 `recordNotFound`。依赖内容无效和存储不可读都不能转成成功空结果。
- 原 G-4 在候选中补了读面表达，依赖版本的接受/实现/组合证据仍未完成；自动初选、完整 Agent 定义与外部 needs 不因本改动获得覆盖。

### 报给主线

起草前发现的写方未承接、根属性不投影与集合次序无意义，已由主线分派 asset-evaluation v4 和 asset-registry v3 演进；本包不自选产品政策。共享候选到齐后需批内对齐 S-8/S-12/S-47/S-32、写方内容与 runtime 每次读取的要求，再作独立规格评审。registry 唯一写入由本次主线集成，起草者交付完整 catalog/covers 候选元数据；未登记前不声称已登记或可接受。

### 同日读投影修订：旧表收窄不能回退新求值

主线根据独立架构反例修订尚未接受的 v3：E1 填表、局部 reload 提交 E2、旧表收窄追加 `reuse(E1)` 后，原按头引用读取会把根设置退回 E1。S-33 改为在同一读视图固定头后，按提交序号选择本会话上界内最近一次 `given`/`mint`；S-34 与实例同步此反例。`reuse` 自身的旧基准仍由原读面返回，四个旧操作语义不动。最新源畸形、缺失或不可读均不回退，且本面只回答已提交求值，不代证当下层配值；运行时每次发出的新鲜输入另由其契约承接。

初稿规范与旧检查脚本已保存于 `tmp/model-request-runtime/manifest-v3/pre-read-projection-revision/`，逐文件 SHA-256 见 `sources.json`；旧 `check-output.txt`、`input-hashes.json` 与 `design-check-output.txt` 保持原内容及其原范围。本轮产物另存同级 `read-projection-revision/`，不把旧检查改称新规则的证据。

- `selection-check.py` 是有限规则 oracle，仅使用完整返回三项的符号，覆盖固定上界、同会话、提交序号与失败不回退；不是真实 `EffectiveAssembly`、求值实现或存储实现。初次执行通过 9 个选源场景、3 个载荷失败场景，区分 6 个错误替代规则；输出与 source hash 为 `selection-output.txt`、`selection-result.json`。真并发、真实求值/追加/读取、权限边界与模型请求均仍未执行。
- 新局部结构检查第一次因集成中 `covers.json` 出现字符串项而停止，未忽略该输入错误；主线修复后实际重跑通过，原失败输出保留为 `check-output-initial.txt`，新输出为 `check-output.txt`。新源 hash 与候选登记元数据分别在 `input-hashes.json`、`registry-input.json`；登记关系未因这次选源修订新增。
- 本轮全树 `check_design.py --formal registered` 实际退出 1：2 项错误，均为并行 `data.loop-extension/v4` 指向尚缺的 verification 锚点，本 topic 未被点名。raw 与摘要分别为 `design-check-output.txt`、`design-check-summary.json`；不声称全树通过。形式工具未执行。

### 同日依赖接续：共享成功结果读取

独立规格评审指出，S-8 摘要表不能独自充当成功结果 DTO 的完整读取契约。本轮在 S-4 明确消费 `capability.asset-evaluation/v4#S-47`，S-32 与 S-33 使用该条全部公共纯值读取条件；本包不复制成员表或反推声明，不把结果读取等同于再次 `evaluate`。未通过共享读取的内容沿已有 `unavailable{reason: invalid_evaluation_content}` 收场，不变成请求 `invalidInput`，不增加失败值。固定头上界、按提交序号选最新源及禁止失败回退不变。

本轮采用的 AE4 成稿 `contract.md` SHA-256 为 `52b52bebd08c8451b41c3a318583210102c7d8a3a1c804bf58eab701d4d589a7`。共享读取通过不证明计算、来源、新鲜度或访问权，真实生产者与授权义务仍按原归属；提供者实现的公共 reader 采用及 DTO 反例执行不在本次起草检查中。

修订前源码/脚本存于 `tmp/model-request-runtime/manifest-v3/pre-shared-result-reader/`，旧证据不覆盖。本轮结构检查、依赖元数据与输入 hash 输出到 `shared-result-reader/`；metadata 仅在既有一条 AE4 依赖上追加 S-47，未操作 registry。既有关系已由主线登记，本次只读核对，未重复登记。形式工件未运行；真实共享 reader、存储或运行时符合性验证未运行。

本轮实际结果：结构检查通过（35 条款、5 操作九项、旧四操作保持、S-4/S-32/S-33 均消费 S-47），`check_design.py --formal registered` 退出 0、全树通过，`git diff --check` 通过。原始输出分别为 `shared-result-reader/check-output.txt`、`design-check-output.txt`；`input-hashes.json` 绑定本轮来源，`metadata-diff.json` 确认候选 catalog 仅增加这一消费 clause。`formal=registered` 只检查登记，不表示执行形式工具或产品验收通过。

## v4 候选原完整填表来源（2026-09-27）

**候选，未接受。** 依据主线来源认回施工简报与只读 refresh 的 H 观察点裁定；继承 D-073 接受的 v3，新增 S-36/S-37，正文与[实例](v4/examples.md)为本版规范工件。D-077 来源接口与 registry 来源缺口稿为动因，不替代契约接受。继承 v3 五操作，新增只读 readGiven(session,head)，范围内无给定记录明确 none；只选择并无损返回原记录，不解释 filledBy/资产根。

### 变化的影响

保持旧 v3 资源字节及原失败/授权/提交/恢复语义；新增承诺仅在 v4 被显式采用后成立。未自动重写任何下游精确版本。`registration-candidate.json` 仅交主线合入，不是中心 registry。无新身份、Schema、formal task；固定上界的选择/消费不新增状态转移，旧 formal 或实现证据不能推成新来源链已通过。

### 新增证据义务

| 义务 | 方法与反例 | 状态 |
|---|---|---|
| 精确坐标/依赖、完整原操作与九项、规范链接 | 候选结构检查与设计全树 checker；冻结哈希核对 | 见下方实际检查入口；不代替独立评审 |
| 固定 H、同会话、最后 given、none 与不可用分开 | 有限历史纯选择关系；最近 mint/忽略 H/跨会话/坏源回退/混拼负控 | 见下方实际检查入口；只覆盖抽象值关系 |
| 六类全部 reload/reuse 后重开、再次完整 fill | 真实生产求值→given→公开 readHead/readGiven→真实固定正文→操作 | **未开始** |
| 并发 append、reload CAS、refresh 旧 H 有效与混拼失败 | 真实存储两个写者/消费者，保留提交顺序、H 与返回事实 | **未开始** |
| 已存损坏、严格无损、权限/当前角色与捕获角色、实际 C16 | 真源与故障注入，零新表/记录/报告断言；不得用 fixture 代替来源 | **未开始** |

### 实际检查入口与边界

复跑入口为工作树 `tmp/model-request-runtime/manifest-origin-v4/check.py`；候选登记为同目录 `registration-candidate.json`，原输入 SHA 为 `input-sha256.json`。这些临时路径仅为代码文本，不是权威设计链接；永久证据由主线归档。检查脚本保存真实 stdout/stderr、命令和输入哈希，不以一段“通过”摘要替代原始输出。此段只列入口，**实际结果以本次 run 文件为准**；未跑提供者/组合，未运行新增 TLA+/Alloy（本增量未建模型）。

### 保留缺口与上报

来源定位/同头消费在候选中明确，不表示 OF-G1/OF-G2/EIS SI-G1 已实现或接受。提供者/消费者/验收装配仍负责真实源及恢复证据。继承全部旧 G 项与 owner；shared/workspace/MCP 真实来源、完整装配代际、权限和正式采用由各自 owner 接续，本文不填默认。

### 本次实际结果（v4 成稿）

`tmp/model-request-runtime/manifest-origin-v4/run-3/run.json` 记录两条真实命令：规格检查 exit 0；带候选 catalog/covers 的隔离设计工作区 `check_design.py --formal skip` exit 0。原始输出为同目录 `spec.stdout.txt`、`spec.stderr.txt`、`design-check.stdout.txt`、`design-check.stderr.txt`；输入快照与 5,454 项 SHA 见同目录 `input-sha256.json`，已逐项复核无变化。规范四文件与该次检查输入完全相同；本结果段在运行后追加，不属于当时输入。

规格检查实际核了 MF4 的 37 条/6 操作、AR4 的 52 条/7 操作及各自九项，4,977 个抽象历史输入、6 个错误选择变体、同 H 观察与混拼负例、严格 JSON 数值示例；这些不执行产品提供者、不运行完整 AE judge、不证明真实 CAS/权限/耐久。**真实组合与新来源恢复仍未开始**；没有新形式模型，既有 formal tasks 明确 skip，不称已运行。

原 `run-1` 也保留：纯检查 exit 0，设计检查因快照没有保留 `.meta_harness/design` 与 research/agents 的目录关系而 exit 1；361 个边界链接错误不是产品结论。其输入清单还存在同名覆盖的记录缺陷，不能当作完整哈希证据。`run-2` 修正快照与清单后两项 exit 0；`run-3` 针对说明对齐及合法 head 的跨会话负控重跑。原始输出未删除或替换。最终资源哈希与 v3→v4 差异在同目录 `final-hashes.json`、`changes.diff`，候选未接受。
