# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.loop-extension` v2 是 `candidate`（2026-09-23 起草），未接受、未冻结；尚无提供者设计、无源码、无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。起草时一条都没有执行过；**整批对齐（2026-09-24）跑过一次 V-1 的本地自检**（见[本节末](#2026-09-24-整批对齐候选未冻结)），其余义务仍未开始。
> 2026-09-24 第一轮独立评审（基线 HUB `765b01dc`）的处置见[独立评审](#独立评审)；本轮重跑了 V-1 的本地自检（[变化的影响](#2026-09-24-第一轮独立评审的处置候选未冻结)）。
> **两张合法组合表与 Schema 的逐格对照是人工比对**（[`examples.md` 第 9 节](v2/examples.md#9-两张合法组合表与-schema-逐格对照)），**不是机检**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～5、7 节的正反实例逐条过 Schema，「Schema」列逐条比对；第 6 节四个走查里的 JSON 同样过对应的 `$defs` | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs`；**前提：五份同批契约 v2 已定型并在同一棵设计树里** | [S-1](v2/contract.md#s-1-十一个位置)、[S-2](v2/contract.md#s-2-两个维度)、[S-4](v2/contract.md#s-4-干预力三档)～[S-18](v2/contract.md#s-18-terminalfact)、[S-19](v2/contract.md#s-19-结论封闭八种)、[S-22](v2/contract.md#s-22-inject)～[S-28](v2/contract.md#s-28-ask)、[S-30](v2/contract.md#s-30-每件的结论必留)、[S-31](v2/contract.md#s-31-三种记录形状)、[S-36](v2/contract.md#s-36-规范表示与定义项)、[S-39](v2/contract.md#s-39-判别式与枚举闭合) 的**形状那一面** | **本地自检已跑**（整批对齐 2026-09-24 一次；第一轮评审处置之后重跑）：最近一次 100 行 ＋ 第 6 节 11 个 JSON 块，0 处不符；**只判形状、不判拒绝值是哪一个**，也不是评审或接受 |
| V-2 | **两张合法组合表机检**：对 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 结果与 [S-20](v2/contract.md#s-20-档与结论的合法组合)、[S-21](v2/contract.md#s-21-位置与结论的合法组合) 的 ✓/✗，并比对拒绝值次序（[S-37](v2/contract.md#s-37-表示层拒绝值)） | 生成式校验（312 格）＋ Draft 2020-12 校验器 | S-20、S-21、S-37 | **只做了人工逐格比对**（examples 第 9 节）；机检**未开始**，同样被 V-1 的前提阻断 |
| V-3 | **回放一致**（[PF-012 §6.9](../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) 的验收办法）：把一件拓展件上次的结论留在日志里重算，下一步相同；停在 `ask` 的那一件回放到出卡处，**不出第二张卡、不再调模型** | 规范场景演练，**归 runner** | [S-32](v2/contract.md#s-32-结论即走向)、[S-35](v2/contract.md#s-35-跨过一次等待只能带已落日志的东西) | **未开始**；需要 runner 提供者。本契约只登记它已触发 |
| V-4 | **不可用 ≠ 报错 ≠ 否决，三种策略各落其位**：让一件没声明不可用处置的可否决件的依赖不在场，观察记的是 `skipped: unavailable` ＋ `unavailability: skip`、瀑布跳过它、**这一关没有被当成否决**；让一件声明了 `veto` 的同样不在场，观察记 `unavailability: veto`、这一次经过以否决收场、原因写明「此刻不在、按否决处置」；把它的干预力收窄到 `rewrite` 再来一次，观察照 `skip` 办；让一件系统自带件不在场，观察记 `unavailability: fallback`、效果照 runner S-17 的表；再让它报错，观察在「之前」的位置落 `veto`、在「之后」的位置落 `stop{ terminal: failed }` 且运行落失败、在 `after_terminal` 落 `observed`，`error` 都可见；让一件可改写件报错，观察 `record` 落了一条以它名义的「没跑成」提醒、下一次组装看得到；`ignore` 对 agent 没有任何效果 | 规范场景 ＋ 故障注入 | [S-5](v2/contract.md#s-5-报错处置策略)、[S-6](v2/contract.md#s-6-声明的成员与类别)、[S-9](v2/contract.md#s-9-依赖声明与不可用)、[S-26](v2/contract.md#s-26-stop)、[S-31](v2/contract.md#s-31-三种记录形状)、[S-33](v2/contract.md#s-33-不可用与报错两分) | **未开始**。这条最容易被一个 `catch { return observed }` 抹掉，**必须真跑** |
| V-11 | **落终态之后不复活，回复被否决不走成因**：让一件 `after_terminal` 的件交回 `inject`，观察被拒、队列没有变非空、没有下一次运行；否决一条模型回复，观察回复没落盘、结论在日志里、那次调用照常结束、`after_model_call` 没有触发、没有产出任何成因 | 规范场景 | [S-2](v2/contract.md#s-2-两个维度)、[S-21](v2/contract.md#s-21-位置与结论的合法组合)、[S-22](v2/contract.md#s-22-inject)、[S-25](v2/contract.md#s-25-veto) | **未开始**；需要 runner 提供者 |
| V-5 | **每件必留**：一次经过里挂了 N 件，日志里恰有 N 条最终结论（出过卡的另有一条 `ask`） | 规范场景 ＋ runner 的静态检查 | [S-30](v2/contract.md#s-30-每件的结论必留) | **未开始** |
| V-6 | **不合法的结论按报错处置**：让一件 `rewrite` 档件交回 `veto`、一件件交回冒名的 `inject`、一件 `rewrite` 改了 `callId`，观察三次都记 `skipped: errored`、`error` 恰为拒绝值、**被拒的结论没有生效** | 规范场景 | [S-20](v2/contract.md#s-20-档与结论的合法组合)～[S-23](v2/contract.md#s-23-rewrite)、[S-34](v2/contract.md#s-34-不合法的结论按报错处置)、[S-37](v2/contract.md#s-37-表示层拒绝值) | **未开始**。第三种（改了不可改的成员）Schema 放过，**只有这条演练能抓到** |
| V-7 | **没有放宽**：兼容件的 `allow` 译成 `observed`，放行判断说「问一下」时动作仍等人 | 规范场景，**归兼容层与 runner** | [S-29](v2/contract.md#s-29-没有放宽) | **未开始** |
| V-8 | **`select_model` 与 `retry` 的判定**：不在合法目标集合里的 `select_model` 不生效；撞上事实三类的 `retry` 不生效；两者都记成报错；`route.selectedBy` 记下本件 | 规范场景，**判定归模型请求那一侧的能力** | [S-24](v2/contract.md#s-24-select_model)、[S-27](v2/contract.md#s-27-retry) | **未开始** |
| V-9 | **被拦的内容不进日志**：否决一条带敏感内容的用户消息，检查全部结论记录的 `reason`、`error` 里没有原文 | 规范场景 ＋ 日志内容扫描 | [S-25](v2/contract.md#s-25-veto)、[S-31](v2/contract.md#s-31-三种记录形状) | **未开始** |
| V-10 | **跨进程后的传输故障映射**：远端拓展件回执丢失时记成不可用或报错之一，不折成 `observed` | 规范场景 | [第十节](v2/contract.md#十装配给与协议给)各行 | **未开始，且本版装配下无法演练**——单机同进程没有这条边。跨进程演化启动时必须补做 |

## 结果与反例

**尚无任何执行记录。**首次执行时在此记录工具与版本、环境、输入范围、可复现步骤与原始结果位置；
原始产物归 [`record/evidence/`](../../../record/evidence/README.md)。
**必须分开陈述**：Schema 校验、规范场景演练、真实组合的符合性——三者不能互相冒充（[S-38](v2/contract.md#s-38-表示层拒绝不是判定)）。

**本轮只跑过设计检查器**——它只检查登记、`$id`、`$ref` 解析与 Markdown 链接锚点，**不校验任何实例**，因此不支持上表任何一条义务：

| 运行 | 对象 | 结果 |
|---|---|---|
| `make design-check`，2026-09-23，本分支起草提交之前的工作树 | 真实设计树 | **FAIL，27 个错误，全部指向并行候选的缺席**：1 个是 catalog 依赖 `data.content-blocks` v2 坐标未知（检查器在一条目的第一个未知依赖处停下，其余四个同类依赖被它遮住），26 个是指向 content-blocks、messages、model-profile、call-accounts、tool-definition 五份 Schema 的 `$ref` 解析不到。**没有 Markdown 链接或锚点错误**。make 在第一步失败后中止，**同一目标里的对象清单与实现节点两步没有跑**（本包没有碰它们的输入） |
| 同一检查器（`check_design.py --root`）跑在临时副本上 | 真实设计树的副本 ＋ content-blocks 草稿 `204d078` 的原件 ＋ 其余四份的**桩**（只含本包引用的那几个 `$defs` 名、空定义）＋ 五条 catalog 候选登记 | **PASS**。说明：五份到齐后，本包的 `$id`、全部 `$ref` 指针（含指到 `CapabilityId/properties/name` 的那一个）、catalog 依赖与链接都解析得到。**桩是空定义，它不说明本包的实例能过真实定义**——那是 V-1 |

按主线裁定原地修订之后（2026-09-23，本分支修订提交之前的工作树）又跑了四次：

| 运行 | 对象 | 结果 |
|---|---|---|
| `make design-check` | 本分支工作树 | **FAIL，37 个错误**：1 个 catalog 依赖（`data.content-blocks` 坐标未知）＋ 29 个 `$ref` 解析不到（比首稿多的 3 个是 `RunId`、`AttemptId` 的三处引用，`data.call-accounts` 在本分支整份缺席）＋ 7 个链接断开，**全部指向 D-058**（`record/decisions/message-and-shape-rulings/decision.md`）——那份决定只在 HUB 上、不在本分支的基线里。没有别的错误 |
| `make docs-check` | 本分支工作树 | **FAIL，7 个错误**，恰是上一行那 7 个 D-058 链接 |
| `check_design.py --root`（同一检查器） | HUB `panqiwei/assets-runtimes` 在 `3b99594a` 的 `.meta_harness` 快照 ＋ 本包 ＋ 本包的 catalog 条目与 46 条 covers ＋ **`data.messages` 的桩**（只含本包引用的四个 `$defs` 名、空定义；HUB 上那份还没合入） | **PASS**。说明：content-blocks、call-accounts（含 `RunId`、`AttemptId`）、model-profile、model-response、tool-definition 用的是 HUB 上的真稿，D-058 的两个锚点也解析得到；`data.model-response` 引本包 `FailureCause` 的那一处同样解析得到。**messages 仍是桩**，它不说明本包的实例能过真实定义——那是 V-1 |
| `omne-docs-check --root` | HUB `3b99594a` 的整仓快照 ＋ 本包 ＋ 同上的两份清单 | **PASS**（686 个 Markdown 文件） |

这组报错在本包合入 HUB、`data.messages` 定型之后应当消失；在那之前，本包**不能**被当成已通过检查。

## 独立评审

| 项 | 值 |
|---|---|
| reviewer | spec-reviewer（只读） |
| 日期 | 2026-09-24 |
| 基线 | HUB `765b01dc`（批 R2a） |
| 处置 | 2026-09-24 修复波 1，候选期内原地改；标「主线处置裁定」的是主线在修复简报里的裁定，已收进 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K1～K50） |

| 发现 | 处置 | 落点 |
|---|---|---|
| X-1 产品依据 rev 落后（PF-012 10→14、PF-013 8→12、PF-008 5→7、PF-002 16→20、PF-014 5→7、PF-006 17→19） | **改**。逐 rev 复核：PF-012 rev 11 把「回复落盘前被否决」「模型产出的消息只开放否决 ＋ 挂派生表示」「同一步连续被否决有上限」写进产品正文 ⇒ 设计依据改引产品小节，原「与 PF-012 rev 10 措辞不同」的注删去，G-12、G-14、G-17 改指产品正文；rev 12～14 拓展件不可用处置与系统自带件的指定挂件 ⇒ L-1；rev 13/14 转换件不是资产，五件表原已如此。PF-013 rev 9～12：否决回复入产品、默认重试次数（§5.12）归模型请求运行时、路由名（已落）——本契约无别处要改。PF-008 rev 6：搬来的 hook 出的卡不带授权含义、第四档写得进去才出现 ⇒ S-28 改写那一句；rev 7（孤卡、全拒件）无涉。PF-002 rev 17 `usableBy` 八类共用 ⇒ S-40 写明；rev 20 D-5 闭合 ⇒ L-1。PF-014 rev 6/7、PF-006 rev 18/19：所引 §5.6、§6.10 未变 | 抬头、设计依据、S-23、S-25、S-28、S-40、第十四节 |
| X-4 / L-5 「一次经过」两处说法；干预力、合法目标集合、试尽没链词条；「链接待合流后补」 | **改**：统一链 UL-extension-point-pass、UL-intervention-power、UL-legal-target-set、UL-retry-exhaustion，加 UL-extension-unavailability-policy；删「不定为正式名」与「待合流后补」 | 设计依据末行、二（token 表）、S-17、S-24、S-27；[对齐义务](#对齐义务) |
| X-5 「放行判断那一行待裁，账本 U-5」 | **改**：U-5 已由 D-059 裁定，改引 D-059 与 PF-012 §5.8「系统自带的几件不可用时各有定法」 | 设计依据、S-33 |
| X-6 依据只在任务区账本 | **改**：S7-a～e、S8-c、S1-a、S15-b、S15-e、S17-c、S17-d、S16-c、C-R1、C-R3 改链 D-060；已落进产品正文的改引产品；**C-9（`before_model_call` 否决即运行落失败）与 RP-33（不承诺自定义重试件会停）D-060 未收录**，改写为本契约的推导并在条款里写出理由（已报主线）。**第二轮改链**（XB-1）：两条推导已由 [D-060 §六 N-2](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 接受，设计依据表两行补引 | 设计依据、S-8、S-10、S-14、S-15、S-23、S-25、S-27、第十三、十四节；Schema 四处 `$comment` |
| X-8(b) S-7 说「同 tool-definition S-2」，那里没给这个拒绝值 | **改**：直接引 `data.asset-model/v2#S-10`，catalog 同登 | S-7；`registry/catalog.json` |
| L-1 拓展件不可用处置没有落点 | **改**（主线处置裁定）：S-6 加声明成员 `unavailability ∈ skip \| veto`（缺席即 `skip`；不是设置也不是权限；`veto` 只随声明的 `veto` 档与「之前」位置，否则 `malformed`；`fallback` 只给系统自带件、不经声明）；新 `$defs/UnavailabilityPolicy`（`skip`／`veto`／`fallback`，`fallback` 是本契约的取名）；S-31 不可用记录必带实际采用的 `unavailability`；S-33 改写为「租户件按声明；系统自带件由装配预先声明的指定挂件顶上」；S-9、S-13 随之改；删「不在就不许跑本版没有正文」两处；性质加 P-14 | S-6、S-9、S-13、S-31、S-33、S-36、S-37、S-39、第十二、十三、十五节；Schema `UnavailabilityPolicy`、`LoopExtensionDefinition`、`Conclusion`；examples 第 2、5、8 节 |
| L-2 没有属性项推出规则；asset-evaluation 坐标指错 | **改**（主线处置裁定）：新 [S-40](v2/contract.md#s-40-属性项的推出规则)：`position`、`dimension` 是绑定类设置项、`power` 是权限项，取值域为各自枚举、默认 = 声明值；`onError`、`needs`、`implementation`、`unavailability` 不出项；按 asset-model S-12 四项义务逐条核对。**G-7 随之关闭**（`onError` 是这一件自己的声明）；PF-002 的「它自己的配置」推不出，登 **G-18**（owner 主线）。asset-evaluation 181 行的坐标改指 S-40 由 R3 改（本批不写那份） | S-40、S-5、S-6、G-7、G-18；[对齐义务](#对齐义务) |
| L-3 `tools` 每项一个能力标识，MCP 来源没有 | **改**（主线处置裁定）：`ModelRequest.tools: ModelToolName[]`（`data.tool-definition` 新立的 `$defs/ModelToolName`）；model-request-runtime 同改由 R5 落 | S-15、抬头；Schema `ModelRequest`；examples 第 3 节加三行 |
| L-4 `ToolDefinitionRef.name` 与 `Conclusion.extension` 引错了权威；`implementation.capability` 与 `AssetDefinition.capability` 同名；Schema 另写命名规则 | **改三处、不改一处**：`ToolDefinitionRef.name` 改引 `ModelToolName`（与调用块的工具名同一套，主线处置裁定）；`Conclusion.extension` 改引 asset-model `CapabilityName`；Schema 删「五件用能力契约坐标」的命名规则、写明不归本契约。**`implementation.capability` 不换名**：D-060 S15-b 定的就是 `builtin{capability}`；换名要主线给一个名字（runner、hooks-import 无该字段引用，2026-09-25 核对）——本轮在 S-8 与 Schema 写明它不是能力标识、与 `AssetDefinition.capability` 同名不同义，换名已报主线。**「不换名」一半已被 [D-060 §六 L2](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 改判**：成员名改为 `builtinName`，落在修复波 1b（见[变化的影响](#2026-09-24-修复波-1b候选未冻结)） | S-8、S-14；Schema `ExtensionImplementation`、`ToolDefinitionRef`、`Conclusion` |
| L-6 README 依赖计数不一致；过期的「同批未定型」表；messages 登 S-37 而语义在 S-49 | **改**：README 改八项／六项；过期表删去（留一句沿革）；catalog 的 messages 补登 S-49（S-37 是那份契约的规范表示，`$defs` 都在那里，保留），content-blocks 去掉不再用的 S-20，并补登 content-blocks S-19、asset-model S-12／S-13／S-15／S-36、tool-definition S-6 | README；变化的影响；`registry/catalog.json` |
| （K13）`before_model_call` 那一行「实际发出的参数留痕在响应体」 | **改**（主线处置裁定，只改这一句）：响应体 `parameters` 记实际发出的值，适配器改动记 `parameterAdjustments`，丢掉的项名（含 `extra`）记 `droppedParameters`，形状归 `data.model-response` | S-23 |
| （K32）兼容件 `ask` 带改写 | **改**（主线处置裁定）：`DecisionCardDraft.proposedRewrite?: { arguments }`，只在 `before_action`；是提议不是结论 | S-28；Schema `DecisionCardDraft`；examples 第 4 节三行、EX-1 |

### 第二轮

| 项 | 值 |
|---|---|
| reviewer | spec-reviewer（只读），发现表 `tmp/assets-runtimes/reviews/r2-R2a.md`；H-a 出自 `r2-R4b.md` |
| 日期 | 2026-09-25 |
| 基线 | HUB `8ad37c50` |
| 处置 | 修复波 2，候选期内原地改；主线裁定见 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M1～M29） |

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| XB-1（本契约那几行） | 设计依据表、S-2、S-40 与本文件仍写「D-060 未收录，已报主线补登」 | **改**：一律改链 [D-060 §六 N-2](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；C-9、RP-33 两行「本契约的推导」加引 N-2（主线已接受）；S16-c 那一行补指 D-060 §四 的登记；「主线裁定」的出处说明补第六、七节 | 设计依据表五行与表下注；[S-2](v2/contract.md#s-2-两个维度)、[S-40](v2/contract.md#s-40-属性项的推出规则)；上表 X-6 行、变化的影响 |
| LE-1（阻断） | 「求得的值不高于声明的值」没有一份契约兑现：S-40 的 `values` 是三档全集、asset-evaluation S-23 把声明默认当挑选 | **改**（[D-060 §七 M3](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)，取评审方案 (a)）：S-40 的干预力项 `values` 为声明档及其以下，出厂格给出的整个 `values` 就是上限；S-4、S-40 两句改为「由允许集合兑现」；asset-evaluation S-23 不改 | [S-4](v2/contract.md#s-4-干预力三档)、[S-40](v2/contract.md#s-40-属性项的推出规则)；examples 第 10 节（新） |
| LE-2 | 跨「有维度／无维度」改位置配不出维度项，件静默不跑；谁拦没写 | **改**（[D-060 §七 M4](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：位置项与维度项的取值域收到同一维度成员，跨类配值即取值域以外，治理写面以 `valueOutOfDomain` 拒，runner 遇不到不合法的一对。**收细一处（推导）**：M4 字面分「有维度／无维度」两类，但两个带维度的位置各带一种成员，两类读法仍配得出 `(after_action, {ending})`；本契约按**维度成员**分三类（无维度九个位置一类、`after_model_call`、`after_action` 各自一类），理由写在 S-40 表下，已报主线 | [S-2](v2/contract.md#s-2-两个维度)、[S-6](v2/contract.md#s-6-声明的成员与类别)、[S-40](v2/contract.md#s-40-属性项的推出规则)；examples 第 10 节 |
| LE-3 | S-33 转述「模态转换一律当转换失败」比 runner S-17 宽 | **改**：删去逐件效果的转述，只指 runner S-17 的表 | [S-33](v2/contract.md#s-33-不可用与报错两分) |
| LE-4 | 系统自带件带了 `unavailability`：本契约写「由 runner 核对」，runner 写「带了也不采用」 | **改**：统一为「带了也不采用」，指 runner S-12 表那一行 | [S-6](v2/contract.md#s-6-声明的成员与类别)；对齐义务第一行 |
| LE-5 | 实例用 `builtinName: "capability.model-request-runtime"`；名字的解析「不归本契约」没点名归谁 | **改**：实例换成中性的 `default-retry`；S-8 与 Schema 写明归装配清单（PF-004）与 runner S-6 | [S-8](v2/contract.md#s-8-装配进来的实现与外部命令)；Schema `ExtensionImplementation`；examples 第 2 节一行、EX-4 |
| LE-6 | 处置表 L-4 行未注 L2 改判；对齐义务仍写「待落条款」；D-060 §四 缺 S16-c 一行 | **改**：L-4 行补注；对齐义务逐行改为已对齐并指到落点。D-060 §四 那一行归主线，已由主线补登（S16-c → K10），本契约设计依据表那一行补指它 | 上表 L-4 行；[对齐义务](#对齐义务)；设计依据表 |
| H-a（`r2-R4b.md`） | 兼容件载荷的家仍用「宿主」指 Claude Code／Codex，与 runner 和 UL-cancellation-follows-host 的「宿主」撞 | **改**：S-8 与第十五节「宿主」改「来源产品」，成员名 `host` 沿用并注明它指来源产品；Schema 两处描述、examples 五处同改 | [S-8](v2/contract.md#s-8-装配进来的实现与外部命令)、[十五](v2/contract.md#十五明确不承诺)；Schema；examples 第 2 节、EX-2 |
| （M11 跨批） | 解析不了的调用算不算在 `batch` 里 | **改**（[D-060 §七 M11](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：它在 `batch` 里、不是一个动作、不过 `before_action`；`batch` 可以含没有对应一次经过的 `CallId` | [S-14](v2/contract.md#s-14-按位置的-subject) |

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约第十六节](v2/contract.md#十六版本差异与规范工件)：
两张合法组合表是有限结构，Schema 已逐格写死；本契约没有状态转移。
**这不是把义务省掉**——V-2 把两张表的机检登记成义务；回放、先落后算、同一次经过只跑一轮是**行为**性质，形式模型归 `capability.loop-extension-runner`。
本契约**不拥有任何进展性质**。

## 变化的影响

- **引用的别的契约**（content-blocks、messages、model-profile、call-accounts、tool-definition、asset-model，都是同一棵设计树里的候选）：本契约 `$ref` 它们的 `$defs`、catalog 按条款号登记（[契约抬头](v2/contract.md)）。它们任一改名、改结构，本 Schema 的对应 `$ref` 与 examples 里的实例要跟着改，V-1、V-2 要重跑。
  （2026-09-23 起草时这里有一张「同批契约未定型」表，记各份当时的状态与 catalog 暂登 `$defs` 名的做法；那几份已在同一棵树里、catalog 已换成条款号，表于 2026-09-24 第一轮评审处置时删去。）
- **`FailureCause` 的下游**：`data.model-response` v2 照抄本契约 [S-17](v2/contract.md#s-17-failurecause) 的八个 token。
  本契约改任何一个 token 或改它们的含义，那一份要同步；**本契约是定名的一方**。
  「回复在落盘之前被否决」**不产出成因**，它在响应体上记成 `replyDisposition` 为 `vetoed`——那一侧的形状归 `data.model-response`，两份要说同一件事。
- **[G-15](v2/contract.md#十四已知缺口) 被裁决**：可能改变两张合法组合表。未接受之前可直接落在 v2 并在本节记一行；接受之后出 v2，V-1、V-2 按新表重做。
- **主线裁定被产品负责人推翻**：下面那次修订里六条「主线裁定 2026-09-23」任一条被改判，对应条款、Schema 与实例回改，V-1、V-2、V-4、V-11 按新答案重做。

### 2026-09-23 按主线裁定原地修订（候选，未冻结）

起草提交 `f03e72a` 之后，主线裁了本包报回的产品问题，本包**原地**改 v1（候选未冻结，可以原地改）。
依据行一律写「主线裁定 2026-09-23，待产品负责人确认」；形状草案那几条裁决改引 [D-058](../../../record/decisions/message-and-shape-rulings/decision.md)。

| 改了什么 | 条款 | Schema | 实例 |
|---|---|---|---|
| `stop` 加 `terminal ∈ { cancelled, failed }`，缺席即 `cancelled`；循环守卫 L3 用 `failed`；G-10 关闭 | S-26、消费者表、第十三节 | `StopOutput.terminal` | 第 4 节三条 |
| 三种报错处置策略各落什么：`ignore` → `observed`；`record` → 一条以本件名义的「没跑成」提醒（`inject`）；`treat_as_veto` → 「之前」`veto`、「之后」`stop{ terminal: failed }`、`after_terminal` `observed`；G-8、G-9 关闭 | S-5、S-13、S-37 | `ErrorPolicy` 描述；`LoopExtensionDefinition` 的策略约束改成 `observe` 只能 `ignore`；`Conclusion` 新增「报错只落四种」一条 | 第 2 节两条、第 5 节五条、第 8 节三条、EX-3 注 |
| 被用户中断的调用不触发 `after_model_call`；G-11 关闭 | S-2 | `AfterModelCallCompleteReplySubject` 描述 | 第 1 节一条的依据 |
| 回复与系统追加的消息在落盘之前被否决：不落盘、结论落日志、调用照常结束，不走成因、不触发 `after_model_call`；G-12、G-14 关闭；**新增 G-17**（一再被否决时什么让它停下） | S-2、S-17、S-25、S-27、第十二节进展性质 | — | — |
| `after_terminal` 不许 `inject` | S-21、S-22 | `Conclusion` 里 `after_terminal` 那条的 `enum` 改成只有 `observed` | 第 7 节第 8 行加一例、第 9 节行列计数 |
| 运行与执行尝试的标识改引 `data.call-accounts` 的 `RunId`、`AttemptId`，删掉本契约的 `RunRef`、`AttemptRef`；`LogHandle` 按 identity-values S-31 在本契约内定义，不再跨契约 `$ref`；G-3 收窄为只剩 `LogHandle` 的读面（运行标识的产生与唯一范围已由 `data.call-accounts` 给出） | S-12、S-14、S-36（定义项 42 → 40）、G-3 | 删两项、`LogHandle` 自带 pattern | — |
| Q3/Q6/Q8/Q9/Q10/Q19/8c 依据改引 D-058 | 设计依据、S-4、S-10、S-14、S-21、S-23、S-24、P-6、P-7、G-13、G-15 | — | — |
| 新增性质 P-12（落终态之后不复活）、P-13（报错不多出权力）；新增义务 V-11 | 第十二节 | — | — |
| EX-3 的 `ModelProfileRef` 按 HUB 上已合入的 `data.model-profile` 候选改成 `{ origin: custom, scope, routeName }` | — | — | EX-3 |

**对证据的影响**：本包的证据义务一条都没执行过，修订不使任何既有证据失效；V-1、V-2 的实例与格数（位置表 `inject` 一列 13 → 12）随本次修订更新，执行时按修订后的版本。
- **跨进程演化启动**：V-10 从「无法演练」转为必须演练；[第十节](v2/contract.md#十装配给与协议给)写着「须由协议兑现」的各行从待兑现转为须兑现。
  **本版的一切证据只保留其单机范围，不得外推。**

结果不改写规范。发现语义问题回到来源设计（PF-012／PF-013／PF-008／PF-002／PF-014），不在这里改契约。

### 2026-09-24 整批对齐（候选，未冻结）

整批对齐波（简报 S23）原地改 v1。依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S15-b、S15-e、S16-c、S17-c、C-7、C-9、C-R1、RP-33）。

| 改了什么 | 条款 | Schema | 实例 |
|---|---|---|---|
| `implementation` 改为 `builtin{capability}` 与 `command{host, dialect, event, command, matcher?, timeout?}` 二选一，兼容件的载荷有了家；`native`、`compat` 作废；`event` 保留（账本 S15-b 未列，已报主线） | S-8（改名「装配进来的实现与外部命令」）、S-6、消费者表、S-37 第 1 行 | `ExtensionImplementation` | 第 2 节改 14 行、加 6 行；EX-1～EX-4 的声明 |
| 两处末位：放行判断在 `before_action` 末位、模态转换件在 `before_persist_message` 末位；G-13 关闭 | S-10、S-23、第十四节 | — | EX-1 注 |
| `ModelRequest` 恰四个成员，加 `tools`（`CapabilityId[]`，不可改），成员名与 `ModelCallRequest` 逐字相同；G-2 关闭 | S-15、S-23 | `ModelRequest` | 第 5 节一行补 `tools` |
| `after_model_call{failure}` 的主体加 `profile`（`ModelProfileSnapshot`）与 `dispatches`（`ModelCallDispatchedRecord[]`，至少一条） | S-14 | `AfterModelCallFailureSubject` | 第 3 节四行补齐、加两行反例；EX-4 |
| 模型产出的消息落盘之前只开放否决，另许系统模态转换件挂派生表示 | S-23、五件表 | —（Schema 管不到，判定在 runner S-14 ②） | — |
| `before_model_call` 的否决 = 不发且运行落终态「失败」 | S-25 | — | — |
| `retry` 只有 `provider`、`after`；不承诺自定义重试件会停 | S-27 | — | — |
| 答复之后可以再出一轮 `ask`；放行判断四档选项由 tool-admission S-15 定 | S-28、G-6 收窄 | — | — |
| 系统自带五件不可用不照「视作卸载」，指向 runner S-17 | S-33、五件表 | — | — |
| 放行判断整批求值与放行凭据的交出不在本契约形状里（推导，已报主线） | S-14 逐行补充 | — | — |
| G-3、G-17 由 runner S-9、S-30 关闭；G-16 注明 messages S-3 的写入方铸号 | 第十二、十四节 | — | — |
| `FailureCause` 的下游改为 `$ref`（model-response、arrival-events） | S-17、消费者表 | 描述 | — |
| （同日续）**声明里的 `name` 是能力标识 name 的镜像，不是第二个身份**：与资产记录的 `capability.name` 逐码点相等（`data.asset-model/v2#S-10`，同 `data.tool-definition/v2#S-2`）；词法改取 `data.asset-model` 的 `CapabilityName`（禁 `/`、许 `:`），依赖表加 `data.asset-model` 一行。**表示收紧**：含 `/` 的拓展件名从收到拒；现有实例无一受影响，本地自检重跑 82 行 ＋ 11 块仍 0 处不符 | S-6、S-7、依赖表 | `LoopExtensionDefinition.name` | — |

**本地自检**（Draft 2020-12，`jsonschema` 按仓库 `uv.lock`；脚本在任务暂存区、不入库）：以对齐后的整棵设计树的全部 Schema 建 registry，
`examples.md` 第 1～5、7、8 节 82 行（预期通过 25、拒绝 57）逐行按所在节的 `$defs` 求值，**0 处不符**；第 6 节 11 个 JSON 块各自恰过一种 `$defs`（声明 4、输入 1、结论 6）。
**只判 Schema 通过与否**：拒绝值是哪一个、「逐值相同」「来自系统转换件」这类对照输入的判定不在内。V-2（312 格机检）仍未开始。

**对证据的影响**：没有既有证据失效；V-1 的前提（同批契约在同一棵树里）在对齐分支上成立。

### 2026-09-24 PF-013 rev 12「用哪个模型记路由名」（候选，未冻结，原地改；主线裁定）

- [S-15](v2/contract.md#s-15-modelrequest) 的 `target` 与 [S-24](v2/contract.md#s-24-select_model) `select_model` 的 `profile` 由 `ModelProfileRef` 改为 `data.model-profile` v2 [S-2](../model-profile/v2/contract.md#s-2-routename) 的 `RouteName`；这一次的有效模型是这个名字按层覆盖落到的那一行，解析归 `capability.model-request-runtime`（它的 S-10 第 2′ 步，本契约只指路）。S-24 对合法目标集合的转述改为「元素是路由名」。成员名 `profile` 未改。
- Schema：`ModelRequest.target`、`SelectModelOutput.profile` 两处 `$ref` 改指 `$defs/RouteName`，两条 description 同改；抬头依赖表 `data.model-profile` 一行改列 `RouteName`，头部产品依据注明 rev 12 这一处；上面「同批契约未定型」表的 `data.model-profile` 一行同改。
- 实例：第 5 节那条 `rewrite` 结论记录里的 `target` 改成裸名字；EX-3 的 `profile` 改成 `"fast-small"`，说明改写；第 8 节一行与开头「读法的边界」一处措辞随之改。
- catalog：`data.loop-extension → data.model-profile` 加 `S-2`；`S-13`（`ModelProfileRef`）随之撤下——本契约已不再据它写出任何形状。
- **对证据的影响**：上一节的 V-1 本地自检跑在改动之前。改动的两处实例已按同样办法（Draft 2020-12，`jsonschema` 按仓库 `uv.lock`，整棵设计树的 Schema 建 registry，脚本在任务暂存区、不入库）单独复核：EX-3 的结论记录过 `Conclusion`；第 5 节那一行仍拒绝，去掉 `skipped`／`error` 的对照件通过——拒绝仍来自 S-5，不来自 `target`；EX-3 换回旧的引用形状被拒（对照：`$ref` 确实换了）。**只判形状**，其余 80 行未重跑。

### 2026-09-24 第一轮独立评审的处置（候选，未冻结）

逐条见[独立评审](#独立评审)。**表示改变**：声明多一个可选成员 `unavailability`；不可用的结论记录**必带** `unavailability`（此前的不可用记录从合法变为 `malformed`）；`ModelRequest.tools` 的元素由能力标识对象改为模型面名字字符串；`ToolDefinitionRef.name` 改引 `ModelToolName`（`:` 不再合法）、`Conclusion.extension` 改引 `CapabilityName`（禁 `/`）；卡片草稿多一个可选成员 `proposedRewrite`；定义项 40 → 41。
**语义改变**：不可用不再一律「视作卸载」，按这一件的不可用处置办；`onError` 定为这一件自己的声明（G-7 关）；新 S-40 推出规则；`before_model_call` 否决即运行落失败、不承诺自定义重试件会停两处的依据由「主线裁定」改为本契约的推导（结论不变）。
**对消费者**：没有已采用的消费者，无迁移；runner、hooks-import、tool-admission、model-request-runtime、model-response、asset-evaluation、asset-model、asset-governance 各自那一半由同一修复波的对方批次落（[对齐义务](#对齐义务)）。
**证据**：V-1 本地自检重跑（Draft 2020-12，`jsonschema` 4.26.0 按仓库 `uv.lock`，以整棵设计树的全部 Schema 建 registry，脚本在任务暂存区、不入库）：`examples.md` 第 1～5、7 节 **100 行**逐行按所在节的 `$defs` 求值，**0 处不符**；第 6 节 11 个 JSON 块各自恰过一种 `$defs`。**只判 Schema 通过与否**，拒绝值是哪一个不在内；V-2 仍未开始。

**同日稍后（候选，未冻结，原地改）**：K 裁定收进 D-060 第五节之后，正文里标「第一轮评审处置」的几处改链 D-060 §五（K8、K9、K10、K13、K32、K36）；随 `data.model-response` 那一批的交付：[S-2](v2/contract.md#s-2-两个维度) 加一种不触发「调模型之后」的情形——回复被系统拿去用（`replyDisposition = consumed`）的那一次，与落盘前被否决同理（主线裁定，D-060 未收录，已报主线补登；**第二轮改链 [D-060 §六 N-2](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)**）；[S-14](v2/contract.md#s-14-按位置的-subject) 写明失败主体是重试件下结论的唯一依据、不另读响应体（K36）；[S-23](v2/contract.md#s-23-rewrite) 那一句改为「响应体上的 `parameters` 是实际发出的值」。**表示不变**（Schema 与实例未动，未重跑）；语义收紧一处：`consumed` 的那一次从「未写明」变为不触发。

### 2026-09-24 修复波 1b（候选，未冻结）

主线裁定 [D-060 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) L2，原地改。
**表示改变**：[S-8](v2/contract.md#s-8-装配进来的实现与外部命令) 装配进来的实现那一格的成员名 `capability` 改为 **`builtinName`**（装配清单里那件系统自带实现的名字，不是能力标识；免得与资产记录的 `AssetDefinition.capability` 同名）。带旧成员名的实例由合法变为 `malformed`；Schema `ExtensionImplementation` 的 builtin 一支同改（成员、`required`、描述），取值规则不变。
**语义不变**。**消费者影响**：`data.asset-model` 的壳 `$ref` `LoopExtensionDefinition`，自动随之生效，它的实例第 272 行同轮改（同一位起草者）；runner、hooks-import 无该字段引用（2026-09-25 核对）。
实例：第 2、6、7 节 21 处改成员名；第 2 节加一行旧成员名的反例；第 5 节第 125 行（现第 126 行）的系统自带件名由 `omne-official:tool-admission` 改为放行判断的能力标识 name `omne-official:admission-judgment`（[D-060 §五 K29](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
**证据**：V-1 只重跑受影响的部分——`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境，设计根下全部 Schema 按 `$id` 登表，脚本在会话暂存区、不入库）：第 2 节 **27 行**按 `$defs/LoopExtensionDefinition`、第 5 节 **18 行**按 `$defs/Conclusion`、第 6 节带 `implementation` 的声明块与第 7 节十行按各自注明的 `$defs`（共 **15 处**），**0 处不符**；第 1、3、4 节未改、未重跑。

### 2026-09-25 第二轮独立评审的处置（候选，未冻结）

逐条见[第二轮](#第二轮)。**语义改变**：[S-40](v2/contract.md#s-40-属性项的推出规则) 推出的三项取值域收窄——干预力项 `values` 由三档全集改为声明档及其以下（M3）；位置项的 `schema` 由整个 `LoopPosition` 改为与声明同一维度成员的位置，维度项的 `schema` 由整个 `Dimension` 改为那一个成员（M4）。后果：一层给拓展件配出高于声明档的干预力、或把位置配到另一类，从「求值时由谁收窄没写」变为「配了取值域以外的值」；这件件求得的 `(position, dimension)` 恒合 S-2，求得的干预力恒不高于声明值。
**表示改变**：声明本身的 Schema 不变（S-40 的取值域是推出规则的产出，不在本 Schema 里）；Schema 只改两处描述（来源产品、`builtinName` 归谁）。
**其余**：S-14 写明 `batch` 含解析不了的调用（M11）；S-6 系统自带件带 `unavailability` 改为「带了也不采用」（LE-4）；S-33 删转述（LE-3）；「宿主」改「来源产品」（H-a）；依据改链 N-2（XB-1）。
**对消费者**：没有已采用的消费者，无迁移。`capability.asset-evaluation` 按推出的取值域求值，不改；`capability.asset-governance` 的写面按取值域判 `valueOutOfDomain`，不改判定、只补一行指路；runner「不高于声明的值」一句由丁同轮改为「由允许集合兑现」。
**证据**：Schema 的 JSON 未改结构、第 1～9 节的实例只改了两处 `builtinName` 的字符串，V-1 不重跑那几节；新加的第 10 节是 `AttributeDeclaration` 实例，按 `data.asset-model` 的 `$defs/AttributeDeclaration` 求值：`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境，设计根下全部 Schema 按 `$id` 登表，脚本在会话暂存区、不入库），第 10 节 **6 个**完整写出的条目逐个求值，**0 处不符**；另核了 Schema 之外那一步——设置项的内联 `schema` 是合法的 Draft 2020-12 schema、`default` 合它，权限项的 `default` 在 `values` 里；位置项的九值清单等于 `$defs/LoopPosition` 去掉两个带维度的位置、维度项的内联 schema 与 `$defs/Dimension` 那一支逐字相同。**只判形状**；「写面以 `valueOutOfDomain` 拒」是资产治理的行为，不在此检内。

### 2026-09-25 修复波 3：实现映射反推（候选，未冻结，原地改）

依据 [D-060 §八 M38](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，逐条见[实现映射反推（2026-09-25）](#实现映射反推2026-09-25)。
**表示改变**：`ExtensionInput` 多一个**必有**成员 `environment`（新 `$defs/EnvironmentHandle`，照 `data.identity-values/v1#S-31` 在本契约内定义，与 `LogHandle` 同写法）；不带它的输入由合法变为 `malformed`。定义项 41 → 42。
**语义改变**：新条款 [S-41](v2/contract.md#s-41-执行环境句柄)——一件拓展件经这只按会话作用域的句柄取得调用方租户身份与这一会话的执行环境，**不经别的通道**；句柄不交出会话标识（L9 不变）、不交出有没有运行在跑，所以在 `before_persist_message` 上照样带。句柄的读面（解析得到什么、何时有效、解析不出时怎样）归 `capability.loop-extension-runner` v2 S-50。S-11、S-35、第十节、第十三节、消费者表、S-36 同改；产品依据加 PF-005 rev 5、PF-015 rev 11（两处都是当前 rev，只取 §6.3 与 §6.12，未改任何已有条款）。
**对消费者**：没有已采用的消费者，无迁移。runner 造输入时多造一只句柄（S-10、S-50，同一起草者同轮改）；`capability.modality-projection` 的 `tenant`、`capability.hooks-import` 的执行环境改从它取（同轮改）；原生拓展件作者多拿到一只句柄，不用可以不读。
**证据**：V-1 只重跑受影响的第 3 节与第 6 节的输入块——`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境，设计根下全部 Schema 按 `$id` 登表，脚本在会话暂存区、不入库）：第 3 节 **19 行**（原 16 行各加 `environment`，另加 3 行：缺 `environment`、句柄首尾空白、`before_persist_message` 照带）按 `$defs/ExtensionInput`，**18 行相符、1 行不符**；第 6 节 EX-1 的输入块 0 处不符。**那一处不符不是本轮造成的**：第 3 节第一行（`after_model_call{failure}`，标「通过」）主体里的 `ModelCallDispatchedRecord` 缺 `profile`、`profileSnapshot`、`parameters`、`selectedBy`、`credentialScope`——`data.messages` S-49 按 [D-060 §五 K20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 加了这五个必有成员之后，本包实例没有跟上；拿掉 `environment` 重跑同样不过。本轮**未改**那几行（`data.messages` 正由另一位起草者同轮修订），已报主线交跨批对齐。**只判形状**。

### 2026-09-25 修复波 3 跨批对齐（drafter 丑；候选，未冻结，原地改）

**实例修正（上一条记下的那一处不符）**：第 3 节里 `after_model_call{failure}` 的五行（一行「通过」、四行「拒绝」）共用的那条 `ModelCallDispatchedRecord` 补齐 [D-060 §五 K20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 之后的必带五项——`profile`（`{"origin": "official", "routeName": "vendor-a/chat-large"}`）、`profileSnapshot`（与同一行主体的 `profile` 快照相同）、`parameters`（`{}`）、`selectedBy`（`"session"`）、`credentialScope`（`{"layer": "factory"}`，官方档案走出厂格那一把）——取值照 `data.messages` 实例第 14 节。**不只是那一行**：另四行「拒绝」原先也因这条发出记录不全而被拒，拒绝的来由与依据栏写的不是同一件事（Schema 这一关对得上、理由对不上）；补齐之后四行各只因依据栏那一条被拒（主体缺快照；`dimension` 缺席；成因 `timeout`、`interrupted_by_user` 不在八值里）。
**语义与表示都不变**：只改实例，Schema 与条款不动。消费者表 runner 一行补「执行环境句柄由它造、读面在它的 S-50」（指路）。
**证据**：本轮以暂存区脚本（`jsonschema` 4.26.0，`Draft202012Validator` ＋ `referencing`，设计根下全部 Schema 按 `$id` 登表，不入库）对**全部**实例重跑——第 1～5、7 节表行、第 6 节十一个代码块，共 **115 处，0 不符**；第 3 节「拒绝」各行另核了最先命中的错误就是依据栏那一条。第 8 节不参与机检（它自己写明）。

### 2026-09-25 修订波（公开面，主线补裁；drafter 辰；候选，未冻结，原地改）

**兼容件的非阻断错误**：主线裁定兼容件以来源产品语义下的非阻断错误收场（非零退出、超时、输出不合形状）时，runner 固定按 `ignore` 处置、不进 `onError`，**记录形状与越档那一条相同**、不另立（`capability.loop-extension-runner/v2#S-13` 新一条；`capability.hooks-import/v2#S-19`；那边 G-17 闭合）。
本契约只加两句指路：[S-5](v2/contract.md#s-5-报错处置策略) 末条写明这是「策略只随求得的干预力收窄」的唯一例外；[S-8](v2/contract.md#s-8-装配进来的实现与外部命令) 「两种实现没有任何区别」改为「对状态转移表没有区别，对 runner 只有这一处」。
**语义**：`ErrorPolicy` 三值、[S-31](v2/contract.md#s-31-三种记录形状) 三种记录形状、Schema 都不变；对状态转移表不变（它读的是记录里的 `output`，仍是 `observed`）。catalog 不变：本契约对 runner、hooks-import 只作定义引用（二者以坐标依赖本契约）。**没有证据因此作废。**

**失败主体加 `inBand`**（主线裁定 D-060 §八 N-40 ④，pi-ai 传输节点 PAT-N4）：`AfterModelCallFailureSubject` 加可缺成员 `inBand`（只取 `true`、只能与 `statusCode` 同在；在即那个状态码是流已开始之后带内错误的 `code`、不是 HTTP 状态），与 `data.model-response/v2#S-15` 同一个成员、同一个意思；[S-14](v2/contract.md#s-14-按位置的-subject) 那一行与 `statusCode` 那一条、Schema 同步。重试件读状态码时据它分得出两种来处。只加一个可缺成员，已有实例都不带它、仍然通过；没有证据因此作废。

## 实现映射反推（2026-09-25）

五位 realization-drafter 起草节点时报回的契约层缺陷，主线裁定见 [D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；本契约涉及一条。

| 裁定 | 来源 | 处置 | 落在哪 |
|---|---|---|---|
| M38 统一输入加按会话作用域的不透明 `environment` 句柄：不暴露会话标识，能取到调用方租户身份与这一会话的执行环境 | 辛 MP-N1／RUN-N3／HI-N2（统一输入不带会话与租户，模态转换件要 `tenant`、兼容件要执行环境，两边对不上） | **接受**。成员名取裁定原文 `environment`；`$def` 名 `EnvironmentHandle` 是本契约取的（与 `LogHandle` 同构，规格层形状名、不是词条，已报主线）；新条款号 S-41（本版只追加、不重排）。**句柄在十一个位置都必带**是本契约的推导：它不交出有没有运行在跑，S-11 末段不带 `run`/`attempt` 的理由对它不成立，而入站消息落盘之前的模态转换同样要租户身份 | [S-11](v2/contract.md#s-11-输入的成员)、[S-41](v2/contract.md#s-41-执行环境句柄)、S-35、第十节、第十三节、S-36、消费者表；Schema `EnvironmentHandle`、`ExtensionInput`；examples 第 3 节与 EX-1 |

表中写明「推导」的各项与 `EnvironmentHandle` 这个名字，已经 [D-060 §八 N-20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 接受（2026-09-25）。

## 对齐义务

**这些是本契约与别的契约之间要一起落的事**，不是本契约自己的证据义务。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| **不可用处置**：记录的 `unavailability`（`skip`／`veto`／`fallback`）；不可用 ＋ `veto` ⇒ 这一次经过以否决收场、原因写明「此刻不在、按否决处置」；系统自带件记 `fallback`、效果照指定挂件的表；系统自带件的声明不带 `unavailability`，**带了也不采用** | `capability.loop-extension-runner` v2 S-12、S-13、S-17 | **已对齐**：本契约 [S-6](v2/contract.md#s-6-声明的成员与类别)、[S-31](v2/contract.md#s-31-三种记录形状)、[S-33](v2/contract.md#s-33-不可用与报错两分)；runner S-12 表、S-17（第二轮 LE-4 把本契约「由 runner 核对」改成与 runner 同一句「带了也不采用」） |
| **工具的指认用模型面名字**：`ModelRequest.tools: ModelToolName[]`、`ToolDefinitionRef.name` 是模型面名字；传输适配不做逆转写 | `capability.model-request-runtime` v2 S-7、S-51；`capability.tool-admission` v2 S-7（`definition` 带模型面名字） | **已对齐**：本契约 [S-14](v2/contract.md#s-14-按位置的-subject)、[S-15](v2/contract.md#s-15-modelrequest)；model-request-runtime S-7、S-51 末段，tool-admission S-7 |
| **调模型之前改写的参数怎么留痕**：响应体 `parameters` 记实际发出的值、`parameterAdjustments`、`droppedParameters` 含 `extra` 项名 | `data.model-response` v2；`capability.model-request-runtime` v2 S-7 | **已对齐**：本契约只写指路那一句（[S-23](v2/contract.md#s-23-rewrite)）；形状在 `data.model-response`、model-request-runtime S-7 |
| **`consumed` 的那一次不触发「调模型之后」** | `data.model-response` v2 S-5、G-14 | 本契约已落（[S-2](v2/contract.md#s-2-两个维度)）；那边 G-14 据此关（R2b 已交付） |
| **`ask` 带改写**：`DecisionCardDraft.proposedRewrite`；改写在答复允许之后生效、回放从这一格重建 `rewrite` | `capability.hooks-import` v2 S-20、S-21 | **已对齐**：本契约 [S-28](v2/contract.md#s-28-ask)；hooks-import S-20、S-21 |
| **推出规则的坐标**：拓展件的属性项推出规则在本契约 [S-40](v2/contract.md#s-40-属性项的推出规则) | `capability.asset-evaluation` v2 S-4 末段、S-10、G-3；`data.asset-model` v2 CS-1；`capability.asset-governance` v2 G-5 | **已对齐**：asset-evaluation S-4 末段、S-10 与 G-3；asset-model CS-1；asset-governance S-4 表 `loop_extension` 一行 |
| **`implementation.builtinName`**（原 `implementation.capability`）：装配清单里那件系统自带实现的名字；JSON 路径 `LoopExtensionDefinition.implementation.builtinName`（`kind = builtin` 那一支，Schema `#/$defs/ExtensionImplementation/oneOf/0/properties/builtinName`） | `data.asset-model` v2（壳 `$ref` `LoopExtensionDefinition`，随之生效；它的实例第 272 行已同轮改） | 本契约已落（[S-8](v2/contract.md#s-8-装配进来的实现与外部命令)）；runner、hooks-import 无该字段引用（2026-09-25 核对） |
| **干预力上限由允许集合兑现**（M3）；**位置项只含同一维度成员的位置、维度项只收那一成员的取值，跨类的配值在治理写面以 `valueOutOfDomain` 拒**（M4） | `capability.loop-extension-runner` v2（「干预力不高于声明的值」一句、S-6 按求得的位置与维度匹配）；`capability.asset-governance` v2 S-38（`valueOutOfDomain`）；`capability.asset-evaluation` v2 S-23（不改） | 本契约已落（[S-4](v2/contract.md#s-4-干预力三档)、[S-6](v2/contract.md#s-6-声明的成员与类别)、[S-40](v2/contract.md#s-40-属性项的推出规则)，[D-060 §七 M3、M4](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）；runner 那一句由丁同轮改；asset-governance S-38 一行指路（同一位起草者） |
| **`batch` 含解析不了的调用**（M11） | `capability.loop-extension-runner` v2 S-21 ①、S-29；`capability.tool-execution-runtime` v2 S-23 | 本契约已落（[S-14](v2/contract.md#s-14-按位置的-subject)）；runner、TER 由丁、丙同轮改 |
| **执行环境句柄**（[D-060 §八 M38](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：`ExtensionInput.environment`，读面（解析得到什么、何时有效、解析不出时怎样）在 runner；模态转换件的 `tenant`、兼容件的执行环境从它取 | `capability.loop-extension-runner` v2 S-7、S-10、S-50、S-32；`capability.modality-projection` v2 S-18、S-20；`capability.hooks-import` v2 S-17、S-18、S-19、S-26 | 本契约已落（[S-11](v2/contract.md#s-11-输入的成员)、[S-41](v2/contract.md#s-41-执行环境句柄)）；三份消费契约由同一起草者同轮改（修复波 3） |
