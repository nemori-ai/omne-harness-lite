# 验证覆盖与实际证据

## v5 完整输入限制快照

本版从已接受且冻结的 MS4 起草，依据 PF-013 rev 14／D-096；MP4 公共名称、S-1～S-33 与 Schema 已由主线确认定型，仍为候选输入。MP4 Schema SHA-256 为 `cfdb0878cab32f961cfd8e1471e714c0abf2f8ca6d360e4326f7e0e076c72278`。初报的 `46c969…` 后只改根 description 的版本说明，主线确认无结构变化，本轮检查使用新摘要。

### v5 变化的影响

- S-49 的 `profileSnapshot` 引 MP4，完整保留供给 cap、适用上游事实和 `updatedAt`，不能按当前目录重建。S-37 的引用、缺席表、部署责任表与实例同步；条款仍为 S-1～S-50，表示层十四个拒绝值和 S-50 收场不变。
- 43 个 Schema 定义除 MP4 引用及已出门说明外，与 MS4 相同；AssistantMessage、工具／未解析调用原文、历史含义保持。不新增重试关联字段，失败干预结论由 loop-extension 的后继契约拥有。
- 新记录只经显式采用 v5 的读写面；旧记录按原精确版本读取／结算，不补 cap 或事实。运行时的新发送检查与历史版本分发不因数据规格成稿获得实现证据。
- 可读性 Alloy 原字节继承，新增限制留存不由该模型覆盖；不新增行为模型或 formal task。旧执行结果保留旧输入范围，本轮形式工具未运行。
- 新增十二个完整实例，继承的已出门实例补齐 MP4 输入字段，测试数值不是官方供给或默认值。无新政策或新术语；继承 G-1/G-2/G-5/G-6/G-7/G-11 仍由正文所列 owner 负责。
- 本轮限域核对 PF-004 rev 13、PF-006 rev 20、PF-014 rev 8、PF-015 rev 13 的 changelog：变化归工作区来源／显式 reload／会话工作区引用与感知，不改变本契约的消息值；S-17/S-25 保持不透明值及 G-6，不替 runtime context 选结构。头部当前依据同步，历史复核文字不改。

### v5 证据义务

| 条款／性质 | 可失败证据 | 状态与 owner |
|---|---|---|
| S-49 完整 MP4 形状与三态保留 | 缺 cap、适用事实、空事实或错误适用域拒绝；unknown、unbounded、limited 分别往返 | 规范实例形状检查已运行；生产接收边界未开始，core/messages owner |
| S-49 完整复制及同调用快照不变 | 当前目录改 cap／事实后，读回原记录仍相同；下一次发出只改一个 cap／事实必须暴露违约 | 未开始；runtime 与日志 owner |
| MP4 S-33 写入者关系 | 形状合法但 cap 大于有限事实不能产生快照 | 规范实例数值 oracle 已运行；真实写路径未开始，profile 与 runtime owner |
| S-37 无损耐久往返与历史读取 | 精确旧 codec 保留旧字节，新 codec 拒绝缺字段旧记录；无默认补齐 | 规范形状反例已运行；真实历史恢复／耐久往返未开始，codec 与日志 owner |
| S-1～S-50 继承语义 | MS4 Schema 定义差异守卫；继承实例与坏名未解析调用正反例 | 本轮形状检查已运行；生产回归未开始，core/messages owner |

### v5 本轮实际检查

2026-09-28，spoke `panqiwei/model-request-runtime-messages5-spec`，基线 `fd4c87f2`。本地 `.venv/bin/python`、jsonschema 4.26.0、Draft 2020-12 与 format checker；按 `$id` 注册设计树与上述 MP4 文件，不取网络内容。实际输出：`PASS: inherited table rows 152; fenced core cases 2; new cases 12; total 166`，`reference closure 93 resolved resources/fragments`；43 定义差异守卫、Alloy 字节对照与 S-1～S-50 编号守卫通过。MS5 Schema SHA-256：`80c829391ef4f5e736c36a93e6e103467f2890125375ae09ff16f64b11d2485e`。

这些检查只涵盖规范实例形状、一个跨字段数值反例和静态差异，不是生产校验器、持久化、恢复或实际模型计量证据。检查脚本及原始输出在本次任务的 `tmp/model-request-runtime/input-limit-successor/messages5/`，未作为长期权威。中央 registry 不在本 spoke 写权限内；候选 catalog、79 条 covers（均 reviewed:false）、零新增命名空间和零 formal task 已准备为四份片段，等待主线整批集成。

`check_design.py --root .meta_harness/design --formal skip` 本轮实际返回 `FAIL: design validation found 16 error(s)`：14 个 MP4 链接因 sibling 候选未合入本 spoke 而不存在，另 2 个新验证锚点在当时尚未写入；本轮已补锚点。此运行不能声称通过。主线明确承担七包合并后的整批检查，本 spoke 不复制依赖包或改中央登记来伪造完整环境；整批 checker 结果待主线实际运行。形式任务均显式 skip。

## v4 模型适配绑定

`data.messages/v4` 是从已接受 v3 演进的候选；本节维护本轮变化和实际证据，旧版结果不重标。v4 保留 S-1～S-50，增量落在 S-49，S-37、S-39 及缺席表同步。共用 `ModelAdaptationBinding` 和 `ModelProfileSnapshot` 的正式名称、字段及 S-27/S-29～S-31 已由其起草者确认定型；`data.model-profile/v3` 本身仍是候选。

### v4 变化的影响

- 已出门记录及其快照都必带 `adaptation`，形状经 `$ref` 取同一公共定义；两处相等及 `definition.modelId = profile.routeName` 由单条记录纯校验，失败为已有的 `malformed`，不新增失败值。
- 缺任一处绑定的历史记录不能作为 v4 记录，禁止用当前档案或最新注册版本补齐。采用者须显式切换，历史读面须按原版本解释；本包不制定存储迁移策略。
- 七种消息、v3 的非法模型名字未解析调用、严格 JSON 与数无损义务不变；可读性 Alloy 模型与 v3 逐字节相同。模型未包含绑定，不承担新增性质的证据。
- 直接消费者是候选 `capability.model-request-runtime/v3`、`data.model-response/v4`、会话日志与恢复读面；响应候选已确认采用 messages/v4，循环自定义形状的对齐说明指向 response/v4，不新增反向 catalog 依赖。既有接受版本的消费者不自动升级。

### v4 证据义务

| 性质与条款 | 证据及可失败场景 | 状态与负责者 |
|---|---|---|
| S-49 必填形状与精确引用 | `examples.md` 第 14、15 节和全部继承实例经 Draft 2020-12 校验；缺顶层/快照绑定、未知字段、null 配置必须拒绝 | 本轮 Schema 检查见下；生产接收边界验收未开始，core/messages 提供者 |
| S-49 两处绑定相等及模型 ID 对齐；S-39 `malformed` | 第 15 节形状通过但相等失败的值仍须拒绝；同修订异值、实现修订、窄定义修订、配置修订和模型名分别覆盖；对象顺序变化不造成错拒 | 本轮纯值对照见下；生产拒绝值和优先级验收未开始，core/messages 提供者 |
| S-37 严格读取、配置数无损 | 任意深度重复配置成员在解析前拒绝；大整数和长小数耐久往返保持精确值，相邻数不被舍入成相等 | 未开始；会话日志及其接收边界，不能由已解析对象的 Schema 通过代替 |
| S-49 持久绑定与恢复 | 日志先写完整绑定；诊断丢失、档案更新、旧注册不存在时仍从日志取回原绑定；再次发出不改用最新版本 | 未开始；运行时、真实日志提供者与验收装配 |
| S-49 同调用各次发出不变 | 两条记录各自形状合法、内部绑定相等，但第二次绑定改变时，日志/写入方检查必须失败 | 未开始；运行时与日志序列验收 |
| v3 core 修正保持 | 正常参数坏名拒绝，完整但未解析的坏名调用可留在 AssistantMessage；Message 定义不变 | 本轮 Schema 两例通过；生产回归未开始，core/messages 提供者 |
| 继承的 S-28～S-30 可读性结构性质 | 沿 v3 模型、作用域和变异核对；不声称覆盖适配绑定 | 本轮 Alloy 未运行，无新 formal task；验证负责人决定证据复用范围 |

### v4 本轮实际检查

工作树 `panqiwei/model-request-runtime`，源基线 `d4eaf7673bc161bf22f6682385151e080d3323ae`。本轮本地命令使用该工作树 `.venv/bin/python`，`jsonschema 4.26.0` 与 `referencing`，读取设计区所有 Schema `$id`，不访问网络或安装依赖。

- 152 个表格 Schema 实例、第 11 节五条消息的单条形状及两条 core 修订实例，共 159 个 Schema 结果与期望一致，0 不一致；第 15 节 11 个形状通过的值再按完整 JSON 值与模型名做纯值对照，均符合期望，含 `true` 与 `1` 的类型区别、`1` 与 `1.0` 的精确数值相等及相邻大整数不相等。检查不包含日志层判定、原始重复成员文本以及第 11 节消息的组合行为。
- v3 的两条 fenced AssistantMessage core 修订实例分别得到预期通过/拒绝。所有 Message 的 `$defs` 保持 v3 原约束；本次结构约束变化仅为发出记录及模型切换的档案引用，另更新精确版本说明。与 `model-response/v4` 的 `SelectedBy`、`CredentialScope`、`ParameterAdjustment` 和 `droppedParameters` 在排除说明性注释后逐结构相同；不同含义的说明文字不作为形状比较对象。
- `Readable.als` 与 v3 字节相同。本轮 TLA+/Alloy **未运行**，未声明新的模型覆盖。
- 全树 `check_design.py --root .meta_harness/design --formal skip` 最近一次执行退出 1，共 2 个错误，均为并行起草的 model-request-runtime/v3 在 contract 与 formal 入口引用尚不存在的版本外验证锚点；本包无报告错误。整批齐备后仍须重跑，不能将局部无报告记成整树通过。命令显式跳过全部已登记形式任务，未执行 TLA+/Alloy。

这些是候选 Schema 与实例的局部检查，不是生产实现验收、形式证明或规格接受。

### v4 登记输入

本轮按主线指定的唯一 registry 写入 owner 交付如下候选登记输入，**此处不声明已经登记**：catalog 新坐标 `(omne-harness-lite-design-2026-09-15, data.messages, 4)`，`status=candidate`，`acceptance=null`；资源为 `v4/contract.md`、`v4/messages.schema.json`、`v4/examples.md`、`v4/formal/README.md`、`v4/formal/Readable.als`。精确依赖沿 v3 五条，唯 `data.model-profile` 改 v3，消费 `S-2,S-5,S-13,S-15,S-19,S-20,S-27,S-29,S-30,S-31`；content-blocks 保持 v3（含 S-24），其余身份/时刻/调用标识版本和 clauses 不变。

`covers` 沿 v3 的 78 条保留实际覆盖边界，仅把 target.version 改为 4、`reviewed=false` 并注明候选增量待独立复核。S-49 的新绑定细节来源于模型适配增量提案，不冒充已经写入 PF-013 的新产品条款；不造需求锚点。`id-namespaces` 无新编号族；`formal-tasks` 无新增，继承 Alloy 不按退出码登记为正式任务。

### v4 报给主线

- 提案原把 messages 输入写为 v2；主线已确认改为 v3 → v4，本稿采用已接受 v3 并保留 core 修正。
- 本轮依赖 `data.model-profile/v3` 仍是候选；本包不替该共同数据源接受，也不替运行时裁定旧实现缺失时的操作失败值。
- 沿用 v3 的 G-1（realization）、G-2（主线/会话）、G-5（PF-008）、G-6（PF-015）、G-7（PF-014）、G-11（PF-009/主线）；本次绑定的值约束没有新增未裁政策。旧缺口的现状复核归各 owner，未在本批擅自关闭。

## 当前3实际模型运行（2026-09-26）

[2026-09-26-formal-core-v3](../../../record/evidence/2026-09-26-formal-core-v3/README.md) 保存当前3冻结输入的实际执行与指定变异，主调度核原文/工具/冻结资源/归档字节，独立表达对应复核无阻断。按逐command的SAT/UNSAT与有解实例读取，263主读数中Messages11（含五变异），不是按退出0宣称通过；Alloy无正式task/binding。有限scope、被构造吸收的前提及实现范围以run和本版formal入口为准。旧执行输入不重标当前3；产品/真实组合仍独立验收。

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：几乎全部未开始。**`data.messages` v2 是 `candidate`（2026-09-25 修复波 3 原地改——[实现映射反推](#实现映射反推2026-09-25)），未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **执行过的只有 Alloy 结构模型**（2026-09-23 首跑；2026-09-24 模型改后重跑，含五个变异；**未登记为 formal task、未入 `record/evidence/`**，见[形式化工件](#形式化工件)）。
> **Schema 正反实例跑过三次本地自检**（2026-09-23 整批对齐、2026-09-24 第一轮评审修复、2026-09-25 修复波 2，未登记，见[结果与反例](#结果与反例)；修复波 1b 另只重跑过第 14 节）；
> 八条规范场景、七条消费者核对场景、六条静态检查**一条都未执行**——文件存在不代替结果。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～9 节、10.1、11、12、14 节逐行过 Schema，比对「Schema」一列。10.2 节不参与 | Draft 2020-12 校验器（须支持 `unevaluatedProperties`、`dependentRequired`、`minContains`／`maxContains`，并能按 `$id` 解析到 `data.content-blocks/v2`、`data.offer-expiry/v1`、`data.call-accounts/v2`、`data.model-profile/v2` 的 Schema）＋ 该文件按节绑定的 `$defs` | [S-1](v2/contract.md#s-1-七种消息)～[S-27](v2/contract.md#s-27-compactionmessage-与它的名单)、[S-49](v2/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](v2/contract.md#s-50-调用终结的三支) 的**形状那一面**、[S-38](v2/contract.md#s-38-判别式与枚举闭合) | **本地自检，未登记**（[结果与反例](#结果与反例)）：最近一次 2026-09-25 修复波 2 全量重跑，142 行（含第 11 节五条）与「Schema」列一致。**正式覆盖未开始** |
| V-2 | **拒绝值的具名与两段优先级**：对 `examples.md` 每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 12 节六行专验第一段的次序 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-39](v2/contract.md#s-39-表示层拒绝值)、[S-40](v2/contract.md#s-40-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **单条消息里 Schema 管不到的约束**（工具消息的结果块不带 `terminated_by_agent` **不在此列**——2026-09-25 起 Schema 管得到，归 V-1）：工具消息两个 `callId` 相等；后台收场提醒里工具结果块与 `source` 的 `callId`／`outcome` 相等；名单不点自己；一条消息里块标识唯一（含嵌套，`block_id_duplicate`） | 接收边界的校验 ＋ [`examples.md` 10.1 节](v2/examples.md#101-单条消息里的跨成员约束) | [S-2](v2/contract.md#s-2-消息底座)、[S-11](v2/contract.md#s-11-toolmessage)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-29](v2/contract.md#s-29-合法名单的判定) ① | **未开始。**块标识唯一这一条是 `data.content-blocks` v2 交过来的义务（它的 V-3），**落点就在本契约的接收边界** |
| V-4 | **日志层的判定**：名单的 ② ③ ⑤ ⑥（④ 已删去）、配对与唯一 ①～⑦（含 ⑦ 日志里没有 `SystemMessage`） | 日志序列检查（给定一份日志前缀，判一次追加合不合法）＋ [`examples.md` 10.2 节](v2/examples.md#102-会话日志层的判定)逐行 | [S-29](v2/contract.md#s-29-合法名单的判定)、[S-30](v2/contract.md#s-30-悬着的占位)、[S-32](v2/contract.md#s-32-会话日志里的配对与唯一) | **未开始。**需要日志写入方的提供者。⑤ 的卡片那一半停在 [G-5](v2/contract.md#九已知缺口)，⑥ 停在 [G-2](v2/contract.md#九已知缺口)——停在缺口如实记为「本版到此为止」 |
| V-5 | **此刻模型可读的规范场景**：[`examples.md` 第 11 节](v2/examples.md#11-规范场景五条消息此刻哪些块模型可读)的五条消息，实现算出的两个可读集合与手算逐块相同；三个变体各跑一次 | 规范场景演练：真实组装，真实日志 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的)（[S-47](v2/contract.md#s-47-此刻模型可读)） | **未执行。**需要 PF-010 组装的提供者。**手算不是证据** |
| V-6 | **规范场景** [S-41](v2/contract.md#s-41-七种之外即拒)～[S-46](v2/contract.md#s-46-名单的合法性)、[S-48](v2/contract.md#s-48-中断必补) | 规范场景演练：真实接收边界、真实落盘 | [S-1](v2/contract.md#s-1-七种消息)、[S-10](v2/contract.md#s-10-assistantmessage-怎么收的尾)～[S-13](v2/contract.md#s-13-toolinternalmessage)、[S-16](v2/contract.md#s-16-性质与来源定死对应)、[S-17](v2/contract.md#s-17-说状态的带前值与现值)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-21](v2/contract.md#s-21-中断之后必补一条)、[S-29](v2/contract.md#s-29-合法名单的判定) | **未执行。**[S-42](v2/contract.md#s-42-工具消息恰一块) 的两个反例**必须同跑**：只跑块数那一个，一个只信 Schema 的实现也会全过 |
| V-7 | **出门的三条义务**：每接一家，两种我们自己的消息各有落点、不丢；标识由系统加；提醒里的工具结果不译成第二个回答；`ToolInternalMessage` 到不了翻译方 | 传输适配的一致性用例（每家一组） | [S-34](v2/contract.md#s-34-四种直接对应)～[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求) | **未开始。**需要模型请求运行时与传输适配（块 C）的提供者 |
| V-8 | **消费者路径走查**（[CS-1～CS-7](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | 见各场景 | **未开始。**走查**不需要提供者**，现在就做得了；**CS-2 停在 G-2／G-5**（对齐波之后 CS-4、CS-6 不再停在缺口） |
| V-9 | **跨进程**：[第五节](v2/contract.md#五装配给与协议给)右列七行逐行演练 | 规范场景演练 | [S-3](v2/contract.md#s-3-messageid)、[S-29](v2/contract.md#s-29-合法名单的判定)、[S-32](v2/contract.md#s-32-会话日志里的配对与唯一)～[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求)、[S-39](v2/contract.md#s-39-表示层拒绝值) | **未开始，且本版装配下无法演练**——单机同进程不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-10 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |
| V-12 | **与别处逐字相同的六份定义**：`model_call_ended.cause` 的四个值与 `data.loop-extension` v2 `FailureCause` 里出门前的四个逐字相同；`ResponseId` 的散文形状与 `data.model-response/v2#S-6` 逐字相同；`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 与 `data.model-response/v2` 的同名定义（S-10、S-9、S-11）逐字相同；「已出门」的 `droppedParameters` 与那份契约 `Route.droppedParameters` 的就地形状逐字相同 | 静态检查（两份 Schema 的对应片段做字面比较） | [S-37](v2/contract.md#s-37-规范表示)、[S-49](v2/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](v2/contract.md#s-50-调用终结的三支) | **未开始。**这几处为避开互为依赖而没有 `$ref`，**任何一边改了而另一边没跟，不会报任何错** |
| V-11 | **结构模型**：[`formal/Readable.als`](v2/formal/README.md) 的两条 `run` 找到实例、四条 `check` 找不到反例；五个变异各自找到反例 | Alloy 6.2.0 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的) 的派生规则与嵌套合取（A4）、单调（A3，**最弱**：无变异核对，前提「块不变」按构造）；[S-29](v2/contract.md#s-29-合法名单的判定) ① ② **只经它们的推论 A1**（① ② 本身是事实）、⑤ 经 A2；[S-30](v2/contract.md#s-30-悬着的占位) 第 1 类。**不覆盖**：S-29 ③（按构造）、⑥（未建模）、S-32 ⑦（按构造） | **2026-09-24 模型改后重跑，结论与预期一致**，见[形式化工件](#形式化工件)；**未登记为 formal task，原始输出未入 `record/evidence/`** |
| V-13 | **严格读、数无损**（2026-09-25，M36）：读一条消息（或运行时记录）的 JSON 文本，任一层有重复成员名即 `malformed`；消息与记录里超出 ±2^53 的整数写进会话日志、回读之后逐字不变 | 规范场景演练（会话日志的读写、跨节点传输）＋ [`examples.md` 10.1 节](v2/examples.md#101-单条消息里的跨成员约束)末尾两例 | [S-37](v2/contract.md#s-37-规范表示)、[S-39](v2/contract.md#s-39-表示层拒绝值) | **未开始。**Schema 本地自检测不出；块内那一半与 `data.content-blocks` 的 V-11 同一次演练 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 不存在从消息正文推「这条是谁说的」的代码：说话者只读 `type` | [S-1](v2/contract.md#s-1-七种消息) | 未开始 |
| SC-2 | 不存在从提醒正文推来源事实的代码：恢复对账、循环阶梯、呈现只读 `source` | [S-15](v2/contract.md#s-15-systemremindermessage正文给模型读来源给系统认)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-23](v2/contract.md#s-23-循环守卫的干预) | 未开始 |
| SC-3 | 不存在按 `createdAt` 排序或比较先后的代码 | [S-4](v2/contract.md#s-4-createdat-不是次序) | 未开始 |
| SC-4 | 不存在「当前可读集合」这样一份被写下来的状态；也不存在回头改块上 `toModel` 的写路径 | [S-27](v2/contract.md#s-27-compactionmessage-与它的名单)、[S-28](v2/contract.md#s-28-此刻模型可读是算出来的) | 未开始 |
| SC-5 | 翻译方的每一家映射都为 `system_reminder` 与 `compaction` 各有一个落点；不存在「认不出就跳过」的分支；`tool_internal` 不在翻译方的输入类型里 | [S-35](v2/contract.md#s-35-我们自己那两种必须在发出前译掉)、[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求) | 未开始 |
| SC-6 | 不存在「从最后一条压缩记录往后取」的组装实现 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的) | 未开始 |

## 结果与反例

### 已执行：整批对齐时的本地自检（2026-09-23）

| 项 | 值 |
|---|---|
| 对象 | 对齐波改过之后的 `v2/messages.schema.json` 与 `v2/examples.md`（未冻结，无 hash 可绑） |
| 工具 | CPython 3.12 ＋ `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，工作区锁定 uv 环境，未另装依赖；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，跨契约引用都解析到真身 |
| 做了什么 | 按各节「校验对象」逐行求值，比对「Schema」一列（第 1～9 节、10.1、12、14 节）；第 11 节五条消息另按 `$defs/Message` 各求一次 |
| 结果 | **125/125** 与「Schema」列一致（通过 47、拒绝 78）；第 11 节 **5/5** 通过 |
| 脚本在哪 | 会话暂存区，**未入库** |
| 范围与局限 | 只核 Schema 这一关；「拒绝值」一列（V-2）与 Schema 管不到的约束（V-3）**未机核**，第 10.1 节的 `通过` 只说明那几行确实需要接收边界另判 |

### 已执行：第一轮评审修复后的本地自检（2026-09-24）

| 项 | 值 |
|---|---|
| 对象 | 第一轮评审修复之后的 `v2/messages.schema.json` 与 `v2/examples.md`（未冻结，无 hash 可绑） |
| 工具 | 同上一次：`jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，锁定 uv 环境（`uv run --offline`）；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表 |
| 做了什么 | 按各节「校验对象」逐行求值，比对「Schema」一列（第 1～9 节、10.1、12、14 节）；第 11 节五条消息另按 `$defs/Message` 各求一次 |
| 结果 | **131/131** 与「Schema」列一致（通过 49、拒绝 82）；第 11 节 **5/5** 通过。比上一次多的 6 行：第 2 节「系统提示词带图块」一个反例；第 14 节「已出门」第二次发出与 `released{credential_unavailable}` 两个正例、缺档案快照与凭据落在组织格与 `selectedBy` 未知值三个反例 |
| 范围与局限 | 同上一次。「已出门」绑定的跨记录约束（一次调用各次发出逐字相同）Schema 管不到，第 14 节第二行是它的一个形状合法的违例 |

### 已执行：修复波 2 之后的本地自检（2026-09-25）

| 项 | 值 |
|---|---|
| 对象 | 修复波 2 之后的 `v2/messages.schema.json` 与 `v2/examples.md`，连同本轮改过的 `data.content-blocks` v2 Schema（`ToolCallBlock.tool` 取 `ModelToolName`）（未冻结，无 hash 可绑） |
| 工具 | `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，锁定 uv 环境（`uv run --offline`）；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表；脚本在会话暂存区，未入库 |
| 做了什么 | 按各节「校验对象」逐行求值，比对「Schema」一列（第 1～9 节、10.1、12、14 节）；第 11 节五条消息另按 `$defs/Message` 各求一次 |
| 结果 | **137/137** 与「Schema」列一致（通过 52、拒绝 85）；第 11 节 **5/5** 通过——合计 142 行（通过 57、拒绝 85）。比上一次全量多的 2 行：第 5 节 `m_t10`（工具消息的结果块带 `terminated_by_agent` ⇒ 拒）、第 7 节 `m_r1b`（同一块在后台收场提醒里 ⇒ 过）；修复波 1b 加的第 14 节四行一并在内 |
| 范围与局限 | 同前两次：只核 Schema 这一关，「拒绝值」一列与 Schema 管不到的约束未机核 |

### 尚无的记录

V-2～V-10、V-12 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**未登记、无输入快照、未进 [`record/evidence/`](../../../record/evidence/README.md)**，不作为任何一条义务的证据。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 `record/evidence/`。
**必须分开陈述**：Schema 校验的结果、拒绝值一致性的结果、日志序列检查的结果、规范场景演练的结果、真实组合的符合性——**几者不能互相冒充**。

## 形式化工件

**V-11 执行过一次**（2026-09-23，起草者在本 spoke 上执行；**不是 registry 登记的 formal task，通过不提升任何状态**）：

| 项 | 值 |
|---|---|
| 输入 | `v2/formal/Readable.als`，SHA-256 `59f9358476700b3f9770d53ac6db3a86ca73688ca1cc94b50e6b6302ad35b406` |
| 工具 | Alloy 6.2.0（`/opt/alloy/alloy.jar`，JRE 21），命令 `alloy exec -f -o <临时目录> Readable.als`，全部命令、各自带的作用域 |
| 结果 | `run placeholderNamedOnlyAfterItEnded` **SAT**（1/1）；`run aNestedBlockSilencedAlone` **SAT**（1/1）；`check NewBlocksBornReadable`、`check OutstandingPlaceholderStaysReadable`、`check ReadabilityMonotone`、`check NestedReadableImpliesContainersReadable` 均 **UNSAT**（给定作用域内无反例）；退出 0 |
| 变异核对 | 在副本上各改一处（改法见 [formal 入口](v2/formal/README.md#alloy)），只跑对应的 `check`：`legal` 允许自指 → A1 **SAT**；`legal` 允许前向 → A1 **SAT**；「悬着」按整份日志判 → A2 **SAT**；「悬着」只算顶层块 → A2 **SAT**；`path` 只含自己 → A4 **SAT**。**五个变异都找到反例，且每一次退出码仍是 0** |
| 原始输出 | 首次只在起草者的临时目录；**未入 `record/evidence/`**（起草者对该区无写权限）。需要可复核的证据时，由主线按上面的命令对同一 SHA-256 的文件重跑并入档 |
| 复跑（2026-09-24 整批对齐） | 同一 SHA-256 的文件复制到主检出 `tmp/formal-runs/messages-v2-readable-2026-09-24/` 再跑（`alloy exec -f -o out Readable.als`，本机 `/usr/local/bin/alloy` 6.2.0）：六条结果与上一行逐条相同，退出 0；**判读：`check` 行 `UNSAT` 读作「本作用域内无反例」，`run` 行 `SAT` 读作「有实例」**——退出码不参与判读。原始输出（`exec-stderr.txt` 是结果表、`out/` 是实例与回执）留在那里，未入库；变异核对未复跑 |

**2026-09-24 第一轮评审修复：模型改了，重跑**（上表是改之前那份的记录，SHA-256 已不再对应现在的文件）：

| 项 | 值 |
|---|---|
| 改了什么 | `SystemMessage` 不落会话日志（PF-009 rev 8）：删掉 `sig SystemMsg` 与 `legal` 里「不点系统提示词」那一行（S-29 ④ 删去）；文件头与 formal 入口的覆盖声明改成逐条写明证据强度（按构造的标出来） |
| 输入 | `v2/formal/Readable.als`，SHA-256 `313f76ee2cee52286884a56e2676401f87766adb8b73d562e8ea9a48c14da266`，逐字复制到主检出 `tmp/formal-runs/messages-v2-2026-09-24d/Readable.als`（两份哈希相同，见那里的 `sha256.txt`） |
| 工具与命令 | 本机 `/usr/local/bin/alloy`（Alloy 6.2.0），`alloy exec -f -o out Readable.als`，全部命令、各自带的作用域 |
| 结果（读 `exec-stderr.txt` 的结果表，不读退出码） | `run placeholderNamedOnlyAfterItEnded` **SAT**；`run aNestedBlockSilencedAlone` **SAT**；`check NewBlocksBornReadable`、`check OutstandingPlaceholderStaysReadable`、`check ReadabilityMonotone`、`check NestedReadableImpliesContainersReadable` 均 **UNSAT**（本作用域内无反例）；退出 0 |
| 变异核对 | 五个变异 M1～M5（改法见 [formal 入口](v2/formal/README.md#alloy)）各在副本上改一处，`alloy exec -f -c <对应断言> -o <M> <M>.als` 只跑对应的 `check`：M1、M2 → A1 **SAT**；M3、M4 → A2 **SAT**；M5 → A4 **SAT**。**五个都找到反例，每一次退出码仍是 0** |
| 原始输出 | `tmp/formal-runs/messages-v2-2026-09-24d/`：`run.log`、`exec-stderr.txt`（结果表）、`exit.txt`、`out/`（实例与回执）、`mutants/`（`M*.als`、`M*.diff`、`M*.out`、各自的输出目录）、`mutants-summary.txt`、`sha256.txt`。**未入库、未入 `record/evidence/`** |

**这次执行说明的，只是**：在各命令的作用域内（`Msg` 恰 5 或 6 条、其余 sig 至多 5 或 6 个），四条断言无反例，两条一致性 `run` 有实例，五个变异让 A1、A2、A4 失败——这三条断言不是空的。
**它不说明**：任意规模成立；块的形状合法（归 V-1）；S-29 ① ② 本身、③、⑥ 与 S-32 ⑦ 成立（① ② 是事实，③ 与 ⑦ 按构造，⑥ 未建模）；A3 在前提「块不变」不成立时仍成立（前提按构造，归 SC-4）；任何实现满足这些性质（归 V-4、V-5）。

**为什么不登记为 formal task**：上面的变异核对**当场复现了** registry 记下的那件事——`alloy exec` 找到反例时照样退出 0，而 `--formal run` 只看退出码。
登记了会得到一个**永远通过的任务**。起草简报允许「退出 0 且无反例才登记」，但这条前提在这个工具上判不出「无反例」，因此按「拿不准就不登记」处理，**已报主线**。

## 变化的影响

- **整批对齐（2026-09-23）**，仍是 `candidate`，未冻结，改在 v2 原地：

  | 改的是什么 | 依据 | 对证据与消费者的影响 |
  |---|---|---|
  | `ModelCallId` 改 `$ref` `data.call-accounts/v2#S-37`（G-4 关）；`attempt_started.attempt` 改 `$ref` 同处的 `AttemptId` | 简报 §A | 形状不变；catalog 增依赖 `data.call-accounts` [S-37] |
  | `ResponseId` **保留散文自定义**，不 `$ref` `data.model-response`（G-3 关）：那份契约 `$ref` 本契约的 `AssistantMessage`，反向会成环 | 简报 §C「无环」；**与简报 §A「messages `$ref`」相抵，已报主线** | 新增 V-12 的一半 |
  | `attempt_started.reason` 三值 `first`／`resumed_after_interruption`／`resumed_after_wait`（G-8 关） | 主线裁定，待产品负责人确认（账本 S3-a） | **表示变化**；examples 第 7、8 节改行；CS-6 走通 |
  | `loop_guard.level` 改 `level_1`／`level_2` | 主线裁定，待产品负责人确认 | **表示变化**；examples 四行改写 |
  | 中断提醒去掉 `what: tool_execution` 与 `about` 的工具那一支：工具执行被中断不另补，占位承载 | 主线裁定，待产品负责人确认（简报 §B tool-execution-runtime） | **表示变化**；examples 第 7、8 节改行；S-21 改写 |
  | 拓展件名字 `LoopExtensionName` = 类别 `loop_extension` 的能力标识的 `name`（G-10 关） | 主线裁定，待产品负责人确认 | 新增一项 `$defs`；形状仍是非空字符串 |
  | `SessionRef` 的家定在本契约（全树统一） | 主线裁定，待产品负责人确认（账本 S21-c） | `data.connector` 改 `$ref` 它 |
  | 新拒绝值 `block_id_duplicate`（第一段，排在块层六个之后） | 简报 §B 与块 D 交接（账本 S4） | 拒绝值十四个；examples `m_x5` 改期望；`data.arrival-events`／`capability.stream-assembly` 的 G-6 改指它 |
  | S-22 读法：答复落卡片、解除等待时追加提醒 | 主线裁定，待产品负责人确认（账本 S3-c） | 无表示变化 |
  | S-31 有了合法表示（G-12 关）；S-11 占位表改指 `data.content-blocks` S-18，不再列原因个数 | `data.content-blocks` 对齐波补了形状与三个占位原因 | CS-4 走通 |
  | **新增 S-49、S-50 与 `ModelInvocationRecord` 等六项 `$defs`**：模型请求运行时写的五种记录，不是消息 | 主线裁定，待产品负责人确认（账本 S16-d） | **新增表示**；examples 新增第 14 节十八行；新增 P-13、V-12 的另一半；catalog 增依赖 `data.model-profile` [S-5, S-13] |
  | 设计依据改链 D-058（Q3、Q15），其余写「主线裁定 2026-09-23，待产品负责人确认」（G-13 关） | 简报 §B | 无 |
  | 本地自检 125 行 ＋ 第 11 节 5 条 | 简报 | V-1 首次有机检记录 |

  下面「起草」一条里预告的 G-3、G-4、G-8、G-12、G-13 那几行，已由本条兑现。

- **2026-09-24 随 `data.content-blocks` S-18 的两处裁定（主线裁定 2026-09-24；候选，未冻结，原地改）**：[S-11](v2/contract.md#s-11-toolmessage) 占位表「被中断」一行加「前台超时」，表下那一句由「那边还没有原因取值（它的 G-7）」改为取值是 `foreground_timeout`；另补一句 `terminated_by_agent` 不在占位里出现、只落后台执行收场提醒的结果块。
  **本契约的缺口表里没有对应项**（那一处指的是 `data.content-blocks` 的 G-7，已在那边闭合）；Schema、实例与拒绝值都不变，本契约的证据不受影响。

- **起草（2026-09-23）**：首版候选，建在 PF-009 rev 7、PF-010 rev 5、PF-012 rev 10、PF-014 rev 5、PF-015 rev 11、PF-006 rev 17、PF-004 rev 10、PF-008 rev 5 上。
  **依赖 `data.content-blocks` v2（candidate，未冻结）**：它若在评审或对齐中改 `ContentBlock`、`ToolResultBlock`、`BlockId`、`CallId`、`ExecutionOutcome` 的定义或拒绝值，本契约的 Schema 引用、[S-6](v2/contract.md#s-6-每种消息能装哪几类块) 的表与 [S-39](v2/contract.md#s-39-表示层拒绝值) 的六个借来的名字须同轮复核，V-1 重跑。
  `data.offer-expiry` v2 与 `data.identity-values` v2 已接受、已冻结，**这两条引用的目标不会漂移**；它们若出 v2，本契约不自动跟随。
  同轮登记：catalog 一条 `candidate`（三项依赖）；covers 73 条，全部 `reviewed=false`，按[设计依据](v2/contract.md#设计依据)表机械展开、**未逐条复核**；`formal-tasks.json` 与 `id-namespaces.json` 未动（理由见[形式化工件](#形式化工件)；所用编号前缀均已登记）。
  设计依据表的任何一行改动，都要同轮改 covers 的对应条目。
- **对齐波（主线补充裁决已知的几项）**：`ResponseId` 改为 `$ref` `data.model-response` v2（[G-3](v2/contract.md#九已知缺口)），`ModelCallId` 改为 `$ref` `data.call-accounts` v2（[G-4](v2/contract.md#九已知缺口)）——
  **形状不变则语义不变**，但 Schema 的引用改了、catalog 多两条依赖，**未冻结时原地改、在此记一笔**；若对方的形状与本契约的占位不同，V-1 重跑。
- **[G-8](v2/contract.md#九已知缺口) 被裁决**（尝试开始的原因）：`reason` 多出取值 ⇒ **表示改变**；未冻结时原地改，冻结后出 v2。V-1、CS-6 重做。
- **[G-5](v2/contract.md#九已知缺口) 被裁决**（卡片）：`CardId`／`CardAnswer` 换成卡片契约的 `$ref`，[S-30](v2/contract.md#s-30-悬着的占位) 第 2 类有了定义 ⇒ Alloy 模型要加卡片的占位，V-11 重跑。
- **[G-12](v2/contract.md#九已知缺口) 被裁决**（解析不了的调用块）：`data.content-blocks` 出下一版后，[S-31](v2/contract.md#s-31-收齐却解析不了的调用) 有了合法表示，[S-6](v2/contract.md#s-6-每种消息能装哪几类块) 的表多一格 ⇒ V-1、CS-4 重做。
- **[G-6](v2/contract.md#九已知缺口)／[G-11](v2/contract.md#九已知缺口) 被裁决**：若 runtime context 的块可以为 `null`，`previous` 的表示要改（出 v2）；若 `extension` 说状态时要结构化的前后值，`ExtensionSource` 多成员（出 v2）。
- **[G-2](v2/contract.md#九已知缺口) 闭合**（条目壳与日志）：⑥ 的判定有了落点，V-4 从「停在缺口」转为可演练；Alloy 模型可以加上「上一次模型请求」这个对象。
- **[G-13](v2/contract.md#九已知缺口) 闭合**（裁决落进决定）：只改[设计依据](v2/contract.md#设计依据)表的链接，语义与表示不变。
- **跨进程演化启动**：V-9 从「无法演练」转为**必须演练**；[第五节](v2/contract.md#五装配给与协议给)右列七行从「待兑现」转为「须由协议兑现」。
  **本版的全部证据只保留其单机范围，不得外推。**
- **2026-09-24 切换事实记路由名（PF-013 rev 12；候选，未冻结，原地改）**：[S-49](v2/contract.md#s-49-模型请求运行时写的五种记录不是消息) 表里 `model_selection_changed` 的成员由 `profile`（`ModelProfileRef`）改为 `routeName`（`data.model-profile/v2#S-2` 的 `RouteName`）——产品正文定「用哪个模型」记路由名、落到哪一行由按层覆盖定，切换就是改这一格的值。Schema `ModelSelectionChangedRecord` 同改；实例第 313 行（通过）改为带 `routeName`，第 323 行（拒绝）改为带旧的 `profile` 引用。依赖表那一行改为 `S-2`、`S-5`；catalog 同步。**表示变更**：带 `profile` 的旧记录按新 Schema 被拒（`malformed`）。对证据：没有既有执行记录。

- **2026-09-24 第一轮独立评审修复（候选未冻结，原地改）**——逐条处置见[独立评审](#独立评审)：
  - **产品依据逐 topic 复核到当前 rev**（按各 topic changelog 逐版读）：
    PF-009 rev 7→8：**`SystemMessage` 不落日志、每次组装现算** ⇒ S-1、S-7 改写，S-29 ④ 删去（编号保留），S-32 加 ⑦，Alloy 删 `SystemMsg`，G-9 闭合；「这次尝试的账」统一为「那次模型调用的账」⇒ S-10、S-21、S-48 措辞；**工具帧出错照常收尾** ⇒ S-13 写明成立判据、S-14 给出对应表；在途快照、入站语音、「开口是账」——与本契约既有条款一致（「已开口」早是 S-49 的一种记录），不改；
    PF-010 rev 5→6：**系统提示词本版只含文本** ⇒ S-6 的 `system` 列与 Schema `SystemMessage` 收窄为只收文本块，实例第 2 节加一个反例；要求五的三选一不涉本契约；
    PF-012 rev 10→14：rev 11 的对账两行、「落盘前对模型回复只能否决」与 S-21、S-9 一致；rev 12 拓展件不可用处置、rev 13–14 转换件不涉本契约；
    PF-013（头部原来没列）补进头部，rev 12：切换记路由名（S-49 早已改）；一次调用各次发出用同一份绑定 ⇒ S-49「已出门」带上绑定；
    PF-014 rev 5→7：rev 6 **被中断的回复不交出动作** ⇒ S-10 写明收齐的调用块没有工具消息是合法的；「中断提醒不让队列非空」「模态转换失败不受理」不涉本契约；rev 7 连接件开新会话仍落成 `UserMessage`，S-8 不变；
    PF-006 rev 17→19：前台超时、发起即后台、被中断写全——S-11 占位表早已含；rev 19 不涉；
    PF-004 rev 10→12：I-4 的时间尺度、构成变小重新装配——不涉本契约（S-7 引的 §5.4 不变）；
    PF-008 rev 5→7：写不出卡不放行、清卡的第三条路「已作废」——S-22 只写答复回来那一种，不变；卡片什么时候算结束多了一种终态，记进 G-5 的待答范围（卡片契约未起草）；
    PF-015 rev 11 未变。
  - **K2**：S-14 给出帧流结局 → `ToolInternalEnding` 的对应表（唯一一份），`no_answer` 与桥换代落 `lost`；S-13 写明成立判据是收尾交出的 `blocks` 非空。Schema `ToolInternalEnding` 描述同步。**表示不变。消费者影响**：`capability.stream-assembly`、`capability.tool-execution-runtime` 改引本表（TER S-39 现写 `no_answer → finish{interrupted}`，须改为 `lost`）。
  - **K3**：见上 PF-009 rev 8、PF-010 rev 6 两行。**表示改变**：`SystemMessage` 带非文本块的旧实例按新 Schema 被拒（`malformed`）。**Alloy 模型改了，已重跑**（[形式化工件](#形式化工件)）。
  - **K20**：S-49「已出门」加 `profile`、`profileSnapshot`、`parameters`、`selectedBy`、`credentialScope`（必带）；Schema 新增 `SelectedBy`、`CredentialScope` 两项定义（42 项），与 `data.model-response` 逐字对齐、不 `$ref`；依赖补 `data.model-profile` S-13、S-15、S-27 与 `data.identity-values` S-11。**表示改变**：不带绑定的旧「已出门」按新 Schema 被拒。**消费者影响**：`capability.model-request-runtime` 写「已出门」时带上绑定、续接时从它恢复。
  - **K21**：S-50 `released` 可带 `cause`，只取 `credential_unavailable`（续接或再发时凭据取不到）；`undispatched` 只指一次也没发出。**表示改变**（放宽）：`released{cause: credential_unavailable}` 旧 Schema 拒、新 Schema 收。**消费者影响**：`capability.model-request-runtime` S-29 ⑧／S-30 ⑧ 续接的再发写 `released`，不写 `undispatched`。
  - **成员改名**：中断提醒的 `about.callId` 改名 `about.call`（与 S-49 的 `call` 同义），本契约里 `callId` 只指工具调用。**表示改变**：带 `about.callId` 的旧实例被拒。无外部消费者引用这个成员名（已核）。
  - **依据链接化**：「主线裁定 2026-09-23，待产品负责人确认」逐条改成 D-060 §一 的 S3、S13、S16、S21 各节链接；D-060 里没有原文的（`about`、「一次回复只有一份」、`level_n`、名字空间、`block_id_duplicate`）改写成规格层推导并写理由；G-13 的关闭说明同步。本轮落的 K 各项，契约正文的依据链到 D-060 §五（K1～K50，2026-09-24 夜追加）。
  - **词条**：来源标记（`source`，UL-source-tag）、来路标记（`origin`，UL-origin-tag）、占位消息、模型响应体、一次发出、有效模型改为链接词条；**卸载后带摘要的那条不再列为占位**（按 UL-placeholder-message 的「别混」）。
  - **形式覆盖声明收窄**：第七节、V-11、`Readable.als` 文件头与 formal 入口改成逐条写证据强度；S-29 ③、S-32 ⑦、A3 的前提标「按构造，不作证据」。
  - 本地自检重跑（131/131 ＋ 第 11 节 5/5）；实例第 13 节的计数改为实际数（136 行）。

- **2026-09-24 修复波 1b（主线裁定 [D-060 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) L1、L4、L5；候选未冻结，原地改）**：
  - **L4**：S-49「已出门」加可选的 `parameterAdjustments`、`droppedParameters`——传输适配在出门之前为这一次发出定下的处置；约束（名字在 `parameters` 里、`requested` 等于那一项、缺席即断言、空数组不合法）与「实际发出的那一组」的算法写进 S-49；Schema 新增 `$defs/ParameterAdjustment`（43 项）、`ModelCallDispatchedRecord` 加两个成员。**形状按 `data.model-response/v2#S-11` 逐字自定义、不 `$ref`**：简报写「形状 `$ref` model-response」，但那份契约以 `$ref` 取本契约的 `AssistantMessage`，反向引用会让依赖图成环（与 `SelectedBy`、`CredentialScope` 同法，已报主线）。项名的含义取 `data.model-profile/v2#S-20`，catalog 对 `data.model-profile` 的依赖补 `S-20`（头部依赖表与包入口同改）。
    **表示改变**（放宽）：带这两项的「已出门」旧 Schema 拒、新 Schema 收；不带的照旧通过。**消费者影响**：`capability.model-request-runtime` S-33 的追补体从这一条读这两项（它的 G-18 关，归那份契约改）。
    实例第 14 节加四行（两条通过、其中一条是跨成员违约；两条空数组反例）；第 13 节计数改为 140 行（通过 56、拒绝 84）。**证据**：只重跑第 14 节——`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境，设计根下全部 Schema 按 `$id` 登表，脚本在会话暂存区、未入库），**27/27** 与「Schema」列一致；其余各节 Schema 未改、未重跑。
  - **L5**：「切换事实」不再作概念名（[UL-model-switch](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch) 的「弃用」）：第一节、第二节非词条清单、S-49 表与其后一条、头部依赖表、包入口、Schema 两处描述与实例第 14 节一行改称「模型切换落下的那条记录」并链词条。**语义与表示不变**。
  - **L1**：依赖表与 S-6、S-8 里指向 `data.content-blocks` S-8 的锚点随那边的新标题改为 `#s-8-文本块与来路标记`；原先那条对齐义务已兑现，删去。
  - 形式工件未改（Alloy 模型不涉「已出门」的成员），不重跑。

- **2026-09-25 修复波 2（主线裁定 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) M1、M2、M12、M23、M28；候选未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：
  - **M1**：第一节「它不拥有」、第十节「到达」两处改写——帧流与回复流的结局怎样对到 `ending` **归本契约**（S-14、S-10）；消费者表 `data.arrival-events` 一行改为「不消费本契约、只以坐标指路」，`capability.stream-assembly`、`capability.tool-execution-runtime`、`capability.model-request-runtime` 三行写明是这两张对应表的消费者。**语义与表示不变。**
  - **M12**：S-10 加「回复流的结局怎样对到本条」对应表（这张对应只在这里）；**运行被取消按谁发起的分两路、不新增取值**——用户发起 ⇒ 与用户叫停同一行（`interrupted_by_user`、S-21 `by: user`），系统发起（会话归档、宿主停止）与宿主被撤下 ⇒ 在途的流被放弃、`lost`、**不成为消息**，已交付的在那一次发出的响应体上（被中断、发起方 `run_cancelled`），S-21 `by: system`。S-14 对应表加「工具执行运行时有序撤下」一行（先放弃在途的装配状态、再当场写 `failed{abnormal_interruption}`，帧流 `lost`；主线在 TER 那一侧交付后点名补的，对 TER S-48）；S-11 占位表与 S-19 `background_execution_interrupted` 那一行同步写明「有序撤下时当场写下的是同一种」。S-21 `by` 的释义、S-48 规范场景（加运行被取消两支与一条「绝不能观察到」）、Schema `AssistantEnding`／`ToolInternalEnding`／`InterruptedSource` 的说明同步。
    顺带更正 S-10 一句旧字面：「无论哪一行都补一条中断提醒」包括了正常收尾，改为「这次调用以除正常收尾之外的哪一行收尾都补一条」，并写明按一次调用补、出错断之后又再发的那一次发出不另补（与 S-21「一次模型调用……被中断就追加一条」、S-48 本来的意思一致）。**表示不变。**
    **消费者影响**：`capability.model-request-runtime` 按 S-10 包消息时，宿主停止与撤除走放弃、不再交出一条 `interrupted_by_user` 的回复（那份契约 S-36、S-51 的改动归它）；`data.model-response` 的 G-13 随之可闭合（归那份契约）。
  - **M23**：S-11 与 S-39 写明工具消息的结果块带 `terminated_by_agent` 即 `malformed`；Schema `ToolMessage` 的 `blocks.items` 加一条 `not` 直接排除这个值。**表示改变**（收紧）：这样的工具消息旧 Schema 收、新 Schema 拒。实例第 5 节加 `m_t10`（拒），第 7 节加 `m_r1b`（同一块在后台收场提醒里，过）。
  - **M28** 与 R2b 的 L4 余项：S-49 的还原规则补两句——去掉 `droppedParameters` 列的 `extra` 键之后 `extra` 一个不剩时整个成员缺席（`data.model-profile/v2#S-19`）；算出的那一组是合法的 `ModelRequestParameters`（每个 `sent` 在取值域内，与 `data.model-response/v2#S-11` 第 5 条同一个要求）。**表示不变**（跨成员，Schema 管不到）。据 `data.model-profile/v2#S-19` 写出这一条，catalog 对 `data.model-profile` 的依赖补 `S-19`（头部依赖表、包入口同改）。
  - **M2**：头部与第九节 G-3 行改链 D-060 §七 M2 与 registry 的「互引成环的登记口径」，删去「已报主线」；`ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`droppedParameters` 的逐字自定义不变。
  - **措辞**（R1 第二轮 MS2-2、MS2-5～MS2-7）：Schema `ToolMessage` 说明与实例 `m_t4` 不再把卸载之后带摘要的那条叫占位；S-14「有意停下」一行写成「收场为 `interrupted` 的全部情形」并补 agent 掐掉后台执行；S-7 写明 `SystemMessage` 的 `createdAt` 由组装方给；S-50 的「已报主线」改链 D-060 §四；设计依据「没有产品行」表补链 D-060 §六 N-5，并加一行登记本轮的 M 各项；Schema 根 `$comment` 补列 `ParameterAdjustment` 与 `droppedParameters`；实例 `m_u2`「来源标记」→「来路标记」、`m_nc`「账本原有的」改写；V-1 的行数更正。
  - **证据**：本地自检全量重跑，142 行 0 处不符（[结果与反例](#结果与反例)）。**形式工件未改**（Alloy 模型不涉结局对应、工具消息的结果块与「已出门」），不重跑。

- **2026-09-25 修复波 3（候选未冻结，原地改）**：见[实现映射反推](#实现映射反推2026-09-25)。**语义改变**：读消息文本时重复成员名是 `malformed`；数的读写无损写成义务。**表示不变**：Schema 与拒绝值集合都没动（`malformed` 的举例多一项）。

结果不改写规范。发现语义问题回到来源设计（PF-009／PF-010／PF-012／PF-014／PF-015／PF-006／PF-004／PF-008），不在这里改契约。

## 独立评审

| 评审 | 日期 | 基线 | 发现 | 处置 | 落点 |
|---|---|---|---|---|---|
| spec-reviewer，S25 第一轮批 R1 | 2026-09-24 | HUB `765b01dc` | MS-1 产品依据 rev 过时；PF-013 未列 | **改**：九个 topic 逐版复核（有实质的逐条改条款，见[变化的影响](#变化的影响)本轮一条），PF-013 补进头部 | 头部；S-1、S-6、S-7、S-10、S-13、S-14、S-29、S-32、S-49、S-50 |
| 同上 | 同上 | 同上 | MS-2 `SystemMessage` 仍被当成可能在日志里 | **改**（主线 K3）：不落日志、每次现算；S-29 ④ 删去（编号保留），S-32 加 ⑦；G-9 闭合；Alloy 删 `SystemMsg` 并重跑 | S-1、S-7、S-29、S-32、CS-3、S-46；`formal/`；G-9 |
| 同上 | 同上 | 同上 | MS-3 `system` 列允许非文本块 | **改**（主线 K3）：`system` 只收文本块 | S-6；Schema `SystemMessage`；实例第 2 节 |
| 同上 | 同上 | 同上 | MS-4 `ToolInternalEnding` ↔ `FinishReason` 的对应无人拥有 | **改**（主线 K2）：本契约 S-14 拥有对应表；`no_answer`、桥换代落 `lost`；S-13 写明成立判据。流装配与工具执行运行时改引（跨批，见下「对齐义务」） | S-13、S-14；Schema `ToolInternalEnding` |
| 同上 | 同上 | 同上 | MS-5 model-profile 的依赖三处说法不一 | **改**：README、S-37、Schema `$comment` 与依赖表、catalog 一致（S-2、S-5、S-13、S-15、S-27，后三个因「已出门」带绑定而新增） | README；S-37；Schema；catalog |
| 同上 | 同上 | 同上 | MS-6 CB S-20 未登 | **改**：依赖表与 catalog 补 CB `S-20` | 头部；catalog；README |
| 同上 | 同上 | 同上 | MS-7 `about.callId` 是模型调用、`callId` 却指工具调用 | **改**：成员改名 `about.call`，与 S-49 的 `call` 同义；S-21 写明本契约里 `callId` 只指工具调用 | S-21；Schema `InterruptedSource`；实例两行 |
| 同上 | 同上 | 同上 | MS-8 卸载后的带摘要那条被列为占位 | **改**：按 UL-placeholder-message 移出占位表，另写一条说明它就是结果；「占位消息」链词条 | S-11；第二节 |
| 同上 | 同上 | 同上 | MS-9 覆盖声明超过证据（④ 没有断言） | **改**：第七节加逐条证据强度表；V-11、`Readable.als` 文件头、formal 入口同改；④ 已随 K3 删去 | 第七节；V-11；`formal/` |
| 同上 | 同上 | 同上 | MS-10 A3 与其余断言强度没分开 | **改**：注明 A3 无变异核对、前提按构造，证据归 SC-4 | 第七节；formal 入口 |
| 同上 | 同上 | 同上 | MS-11 实例第 13 节统计过时 | **改**：改为实际行数（136 行，通过 54、拒绝 82） | 实例第 13 节 |
| 同上 | 同上 | 同上 | MS-12 `modality_mismatch` 两处同名 | **改**（写明两个值域互不相干的那一种）：不改名——`cause` 的取值与 `data.loop-extension` 的 `FailureCause` 逐字相同，拒绝值取自 `data.content-blocks`，改任一个都会让两份契约的同一件事有两个名字 | S-50；Schema `ModelCallEndedRecord` |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R1（另含批 R2b 转给本契约的一条）；基线 HUB `8ad37c50`。本批对本契约的总判是「不可进 F」，唯一原因是 MS2-1。依据一律是 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；只剩「待产品负责人追认」的不再登缺口。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| MS2-1 | §一、§十 说帧流收尾的对应不归本契约，与 K2 和本契约 S-14 字面相反（阻断） | **改**（M1）：两处改为「归本契约」（帧流 S-14、回复流 S-10）；消费者表 AE 一行改「只以坐标指路」，流装配、工具执行运行时、模型请求运行时写明是对应表的消费者 | 第一节「它不拥有」与消费者表；第十节「到达」 |
| MS2-2 | Schema 与 content-blocks 把卸载之后带摘要的那条叫「占位」（应修） | **改**：Schema `ToolMessage` 说明删去「卸载后的带摘要占位」、改写为「是那次调用的结果、不是占位」；实例 `m_t4` 同改。content-blocks 那一半由同一位起草者同轮改（见那份契约的验证入口） | Schema `ToolMessage`；实例第 5 节 |
| MS2-3 | `terminated_by_agent` 落在工具消息上时是 `malformed` 还是只算写入方义务，没有落点（应修） | **改**（M23）：进 S-39 的单条消息约束，Schema `ToolMessage` 直接排除；S-11 写明 | S-11、S-39、「Schema 管得到什么」；Schema `ToolMessage`；实例 `m_t10`、`m_r1b`；V-1、V-3 |
| MS2-4 | 运行被取消时模型已经开口，`ending` 与 `by` 取什么没写（应修） | **改**（M12）：S-10 加回复流结局的对应表；用户发起的 ⇒ `interrupted_by_user`、`by: user`；系统发起的（会话归档、宿主停止）与宿主被撤下 ⇒ 经放弃落 `lost`、不成为消息、`by: system`；不新增取值、不登缺口 | S-10、S-21、S-48；Schema `AssistantEnding`、`InterruptedSource` |
| MS2-5 | 「有意停下」的列举漏了 agent 掐掉后台执行（建议） | **改**：S-14 那一行写成「收场为 `interrupted` 的全部情形」并补 `terminated_by_agent`；`data.arrival-events` S-16 由同一位起草者同轮改 | S-14 |
| MS2-6 | 陈述过时六处（建议） | **改**：V-1 行数；Schema 根 `$comment` 补 `ParameterAdjustment`、`droppedParameters`；`m_u2`「来路标记」；`m_nc` 删施工用语；S-50「已报主线」改链 D-060 §四；设计依据补链 D-060 §六 N-5 | V-1；Schema 根 `$comment`；实例第 3、8 节；S-50；设计依据 |
| MS2-7 | `SystemMessage` 的 `createdAt` 指什么没写（建议） | **改**：由组装出它的那一方给，记这一份被算出的时刻；不落日志、没有谁拿它比先后 | S-7 |
| CB2-3（本契约那一半） | 引 `data.model-response` S-6／S-9～S-11 自定义同一形状、不登依赖，这条口径没有持久落点（应修） | **改**（M2）：口径已由主线写进 registry README；本契约头部与 G-3 行改链它与 D-060 §七 M2 | 头部依赖说明；第九节 G-3 行 |
| R2b「L4 余项」 | 「已出门」没带上「`sent` 须在统一词表里表示得出」（建议，R2b 转来） | **改**：S-49 还原规则写明算出的那一组是合法的 `ModelRequestParameters`；同轮落 M28（`extra` 去空之后整个缺席） | S-49 |
| R2b R2-MR-1（本契约那一半） | L4 字面要求 `$ref`、两份契约实际逐字自定义（阻断，登记层） | **不改条款**（M2 已在 D-060 §四 把 L4 改判为「逐字自定义 ＋ 对齐义务」）：本契约的做法本来就是这样，只把依据改链 | 头部；S-49 |

## 实现映射反推（2026-09-25）

起因：realization-drafter 戊报回 MSG-3（与 SA-1 同一件事）；主线裁定 [D-060 §八 M36](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（「JSON 解析口径（content-blocks S-12、stream-assembly S-10、messages）」）。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M36** RFC 8259 严格解析；重复键 ⇒ `malformed` | [S-37](v2/contract.md#s-37-规范表示) 加一条（读消息与运行时记录的 JSON 文本，口径同 `data.content-blocks/v2#S-24`、只说一次）；[S-39](v2/contract.md#s-39-表示层拒绝值) `malformed` 举例补一项；Schema 管不到表加一行；examples 10.1 末尾两例；新 V-13 | M36 点名「messages」而没点条款：本契约只有**读文本的接收边界**这一处，重复键在这里就是 `malformed`（与 N-20 一致——`unparseable` 只属于参数串的那一次解析，在 content-blocks S-12） |
| **M36** 超出 2^53 的整数与金额无损保留原文，落盘与回读走无损读写 | [S-37](v2/contract.md#s-37-规范表示) 同一条；[第五节](v2/contract.md#五装配给与协议给)加一行；examples 10.1；V-13 | 写成性质、不写怎样实现；会话日志是本契约管的落盘处，所以「落盘与回读」在这里说 |

**对证据的影响**：没有既有证据受影响（Alloy 模型不涉文本读写；Schema 本地自检测不出这两件事）。

**对消费者**：会话日志的写入方与读者、跨节点传输按 S-37 读写；`data.content-blocks` 的块内一半同批由癸落（它的 S-24）；`capability.stream-assembly` S-10 同批由子落。

**registry**：catalog、covers、formal-tasks、id-namespaces 都不变（`data.content-blocks` 的依赖原已登，S-24 是说明「同一口径」的指路，不新增消费的承诺）。

**examples 对 Schema 的机检（2026-09-25，跨批对齐，drafter 丑）**：暂存区脚本（不入库），`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境），设计根下全部 `*.schema.json` 按 `$id` 登表；逐节按「校验对象」把第一列喂给校验器、拿「Schema」列比对（含第 14 节五种记录——`model_call_dispatched` 那几行带着 K20 的绑定五项）：**137 处，0 不符**。第 10.1 节「读 JSON 文本」两例、第 10.2 节与第 11 节不参与（写不成一个 JSON 值，或是日志层判定）。只核形状，不是 V- 义务的执行证据。**跨契约**：`data.loop-extension` 实例第 3 节借用本契约 `ModelCallDispatchedRecord` 的那几行原先缺绑定五项，已由丑按本契约第 14 节补齐（见那份验证入口）。

## 对齐义务

- **`ToolInternalEnding` 的对应表只在 [S-14](v2/contract.md#s-14-toolinternalmessage-怎么收的尾)**：`capability.stream-assembly`（S-2 等处）与 `capability.tool-execution-runtime`（S-19、S-39）引用它、不各写一份；`no_answer`、桥换代与宿主被撤下（M12，TER S-48 放弃在途状态）都落 `lost`。`data.arrival-events` 的 `FinishReason` 改值时本表同轮复核。
- **回复流结局的对应只在 [S-10](v2/contract.md#s-10-assistantmessage-怎么收的尾)**（M1、M12）：`capability.stream-assembly` 与 `capability.model-request-runtime` 按它包消息、不另写。同一句的另一侧：`capability.model-request-runtime` S-36、S-51 在宿主停止与撤除时对在途的流放弃（不再先 `interrupt(run_cancelled)` 让调用方收口出一条回复）；`data.model-response` S-12／S-13 把系统发起的运行取消记成没有回复、带 `delivered` 的 `interrupted{run_cancelled}`；`data.arrival-events` S-16 的 `interrupted` 不再含「宿主把它带走」。这三处归各自的起草者，本包不改。
- **`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`droppedParameters` 的就地形状与 `ResponseId` 与 `data.model-response` v2 逐字相同**（V-12）：那份契约是这几项的家，本契约逐字自定义、不 `$ref`、不登依赖——registry「互引成环的登记口径」（[D-060 §七 M2](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；§四 已把 L4 的「`$ref`」改判为这一口径）。那边改形状，本契约同轮改；「已出门」上写的值与同一次发出的响应体 `route` 必须相同。
- **`model_call_ended.cause` 与 `data.loop-extension` v2 `FailureCause` 出门前四值逐字相同**（V-12）。
- **`capability.model-request-runtime`**：写「已出门」时带上绑定（S-49）；续接或再发时凭据取不到写 `released{cause: credential_unavailable}`，不写 `undispatched`（S-50）。
- **「已出门」上的 `parameterAdjustments`、`droppedParameters` 与同一次发出的响应体 `route` 上的同名两项逐项相同**（S-49）：`capability.model-request-runtime` 写「已出门」时带上传输适配定下的处置，停机之后补写响应体时从这一条读（它的 S-33）；`data.model-response` 改这两项的形状，本契约同轮改（V-12）。

## 2026-09-26 D-068 当前 v3

`data.messages · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，此前旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。
