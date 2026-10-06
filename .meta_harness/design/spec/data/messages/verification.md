# 验证义务与方法

本页维护验证义务、方法、前提与限制，不保存单次执行台账。精确采用版本与接受状态从本专题入口和 registry 读取；提供者与装配的当前实现从实际成员入口读取，不从旧的执行摘要推断。单次配置、输入、结果与反例留本工作树 `tmp/`；可复跑资源由当前承诺或实现拥有者维护。

## V6 发布前破坏性演进

| 证据义务 | 可失败观察 | 责任与限制 |
|---|---|---|
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 规格起草 / 集成 owner |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 规格起草 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 对应消费者及验证 owner |

## V5 完整输入限制快照

| 条款／性质 | 可失败证据 | 责任与限制 |
|---|---|---|
| S-49 完整 MP4 形状与三态保留 | 缺 cap、适用事实、空事实或错误适用域拒绝；unknown、unbounded、limited 分别往返 | 生产接收边界core/messages owner |
| S-49 完整复制及同调用快照不变 | 当前目录改 cap／事实后，读回原记录仍相同；下一次发出只改一个 cap／事实必须暴露违约 | runtime 与日志 owner |
| MP4 S-33 写入者关系 | 形状合法但 cap 大于有限事实不能产生快照 | 真实写路径profile 与 runtime owner |
| S-37 无损耐久往返与历史读取 | 精确旧 codec 保留旧字节，新 codec 拒绝缺字段旧记录；无默认补齐 | 真实历史恢复／耐久往返codec 与日志 owner |
| S-1～S-50 继承语义 | MS4 Schema 定义差异守卫；继承实例与坏名未解析调用正反例 | 生产回归core/messages owner |

## V4 模型适配绑定

| 性质与条款 | 证据及可失败场景 | 责任与限制 |
|---|---|---|
| S-49 必填形状与精确引用 | `examples.md` 第 14、15 节和全部继承实例经 Draft 2020-12 校验；缺顶层/快照绑定、未知字段、null 配置必须拒绝 | 生产接收边界验收core/messages 提供者 |
| S-49 两处绑定相等及模型 ID 对齐；S-39 `malformed` | 第 15 节形状通过但相等失败的值仍须拒绝；同修订异值、实现修订、窄定义修订、配置修订和模型名分别覆盖；对象顺序变化不造成错拒 | 生产拒绝值和优先级验收core/messages 提供者 |
| S-37 严格读取、配置数无损 | 任意深度重复配置成员在解析前拒绝；大整数和长小数耐久往返保持精确值，相邻数不被舍入成相等 | 会话日志及其接收边界，不能由已解析对象的 Schema 通过代替 |
| S-49 持久绑定与恢复 | 日志先写完整绑定；诊断丢失、档案更新、旧注册不存在时仍从日志取回原绑定；再次发出不改用最新版本 | 运行时、真实日志提供者与验收装配 |
| S-49 同调用各次发出不变 | 两条记录各自形状合法、内部绑定相等，但第二次绑定改变时，日志/写入方检查必须失败 | 运行时与日志序列验收 |
| v3 core 修正保持 | 正常参数坏名拒绝，完整但未解析的坏名调用可留在 AssistantMessage；Message 定义不变 | 生产回归core/messages 提供者 |
| 继承的 S-28～S-30 可读性结构性质 | 沿 v3 模型、作用域和变异核对；不声称覆盖适配绑定 | 验证负责人决定证据复用范围 |

## 模型绑定的验证方法

完整 JSON 值比较区分 true 与 1、按精确数值比较 1 与 1.0，并区分相邻大整数。任意深度重复成员必须在解析前拒绝；日志多记录的同调用绑定不变须另验。静态差异检查不构成形式执行或生产验收。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 责任与限制 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～9 节、10.1、11、12、14 节逐行过 Schema，比对「Schema」一列。10.2 节不参与 | Draft 2020-12 校验器（须支持 `unevaluatedProperties`、`dependentRequired`、`minContains`／`maxContains`，并能按 `$id` 解析到 `data.content-blocks/v2`、`data.offer-expiry/v1`、`data.call-accounts/v2`、`data.model-profile/v2` 的 Schema）＋ 该文件按节绑定的 `$defs` | [S-1](v2/contract.md#s-1-七种消息)～[S-27](v2/contract.md#s-27-compactionmessage-与它的名单)、[S-49](v2/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](v2/contract.md#s-50-调用终结的三支) 的**形状那一面**、[S-38](v2/contract.md#s-38-判别式与枚举闭合) | 只支持形状；接收边界的具名拒绝、跨字段约束与日志序列须独立验证。 |
| V-2 | **拒绝值的具名与两段优先级**：对 `examples.md` 每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 12 节六行专验第一段的次序 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-39](v2/contract.md#s-39-表示层拒绝值)、[S-40](v2/contract.md#s-40-表示层拒绝不是判定也不修补) | 需要一个实现了接收边界的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **单条消息里 Schema 管不到的约束**（工具消息的结果块不得带 `terminated_by_agent`，由 Schema 检查，归 V-1）：工具消息两个 `callId` 相等；后台收场提醒里工具结果块与 `source` 的 `callId`／`outcome` 相等；名单不点自己；一条消息里块标识唯一（含嵌套，`block_id_duplicate`） | 接收边界的校验 ＋ [`examples.md` 10.1 节](v2/examples.md#101-单条消息里的跨成员约束) | [S-2](v2/contract.md#s-2-消息底座)、[S-11](v2/contract.md#s-11-toolmessage)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-29](v2/contract.md#s-29-合法名单的判定) ① | 块标识唯一这一条是 `data.content-blocks` v2 交过来的义务（它的 V-3），**落点就在本契约的接收边界** |
| V-4 | **日志层的判定**：名单的 ② ③ ⑤ ⑥（④ 已删去）、配对与唯一 ①～⑦（含 ⑦ 日志里没有 `SystemMessage`） | 日志序列检查（给定一份日志前缀，判一次追加合不合法）＋ [`examples.md` 10.2 节](v2/examples.md#102-会话日志层的判定)逐行 | [S-29](v2/contract.md#s-29-合法名单的判定)、[S-30](v2/contract.md#s-30-悬着的占位)、[S-32](v2/contract.md#s-32-会话日志里的配对与唯一) | 需要日志写入方的提供者。⑤ 的卡片那一半停在 [G-5](v2/contract.md#九已知缺口)，⑥ 停在 [G-2](v2/contract.md#九已知缺口)——停在缺口如实记为「本版到此为止」 |
| V-5 | **此刻模型可读的规范场景**：[`examples.md` 第 11 节](v2/examples.md#11-规范场景五条消息此刻哪些块模型可读)的五条消息，实现算出的两个可读集合与手算逐块相同；三个变体各跑一次 | 规范场景演练：真实组装，真实日志 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的)（[S-47](v2/contract.md#s-47-此刻模型可读)） | 需要 PF-010 组装的提供者。**手算不是证据** |
| V-6 | **规范场景** [S-41](v2/contract.md#s-41-七种之外即拒)～[S-46](v2/contract.md#s-46-名单的合法性)、[S-48](v2/contract.md#s-48-中断必补) | 规范场景演练：真实接收边界、真实落盘 | [S-1](v2/contract.md#s-1-七种消息)、[S-10](v2/contract.md#s-10-assistantmessage-怎么收的尾)～[S-13](v2/contract.md#s-13-toolinternalmessage)、[S-16](v2/contract.md#s-16-性质与来源定死对应)、[S-17](v2/contract.md#s-17-说状态的带前值与现值)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-21](v2/contract.md#s-21-中断之后必补一条)、[S-29](v2/contract.md#s-29-合法名单的判定) | [S-42](v2/contract.md#s-42-工具消息恰一块) 的两个反例**必须同跑**：只跑块数那一个，一个只信 Schema 的实现也会全过 |
| V-7 | **出门的三条义务**：每接一家，两种我们自己的消息各有落点、不丢；标识由系统加；提醒里的工具结果不译成第二个回答；`ToolInternalMessage` 到不了翻译方 | 传输适配的一致性用例（每家一组） | [S-34](v2/contract.md#s-34-四种直接对应)～[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求) | 需要模型请求运行时与传输适配（块 C）的提供者 |
| V-8 | **消费者路径走查**（[CS-1～CS-7](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | 见各场景 | 走查**不需要提供者**，现在就做得了；**CS-2 停在 G-2／G-5** |
| V-9 | **跨进程**：[第五节](v2/contract.md#五装配给与协议给)右列七行逐行演练 | 规范场景演练 | [S-3](v2/contract.md#s-3-messageid)、[S-29](v2/contract.md#s-29-合法名单的判定)、[S-32](v2/contract.md#s-32-会话日志里的配对与唯一)～[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求)、[S-39](v2/contract.md#s-39-表示层拒绝值) | 单机同进程不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-10 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | 验证义务 |
| V-12 | **与别处逐字相同的六份定义**：`model_call_ended.cause` 的四个值与 `data.loop-extension` v2 `FailureCause` 里出门前的四个逐字相同；`ResponseId` 的散文形状与 `data.model-response/v2#S-6` 逐字相同；`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 与 `data.model-response/v2` 的同名定义（S-10、S-9、S-11）逐字相同；「已出门」的 `droppedParameters` 与那份契约 `Route.droppedParameters` 的就地形状逐字相同 | 静态检查（两份 Schema 的对应片段做字面比较） | [S-37](v2/contract.md#s-37-规范表示)、[S-49](v2/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](v2/contract.md#s-50-调用终结的三支) | 这几处为避开互为依赖而没有 `$ref`，**任何一边改了而另一边没跟，不会报任何错** |
| V-11 | **结构模型**：[`formal/Readable.als`](v2/formal/README.md) 的两条 `run` 找到实例、四条 `check` 找不到反例；五个变异各自找到反例 | Alloy 6.2.0 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的) 的派生规则与嵌套合取（A4）、单调（A3，**最弱**：无变异核对，前提「块不变」按构造）；[S-29](v2/contract.md#s-29-合法名单的判定) ① ② **只经它们的推论 A1**（① ② 本身是事实）、⑤ 经 A2；[S-30](v2/contract.md#s-30-悬着的占位) 第 1 类。**不覆盖**：S-29 ③（按构造）、⑥（未建模）、S-32 ⑦（按构造） | 规格工具与验证 owner：按形式化工件的有限作用域、正负对照与 SAT/UNSAT 判读。 |
| V-13 | **严格读、数无损**：读一条消息（或运行时记录）的 JSON 文本，任一层有重复成员名即 `malformed`；消息与记录里超出 ±2^53 的整数写进会话日志、回读之后逐字不变 | 规范场景演练（会话日志的读写、跨节点传输）＋ [`examples.md` 10.1 节](v2/examples.md#101-单条消息里的跨成员约束)末尾两例 | [S-37](v2/contract.md#s-37-规范表示)、[S-39](v2/contract.md#s-39-表示层拒绝值) | Schema 本地自检测不出；块内那一半与 `data.content-blocks` 的 V-11 同一次演练 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。文件存在或义务已列出不能代替实际检查。

| # | 检查什么 | 对应条款 | 责任 |
|---|---|---|---|
| SC-1 | 不存在从消息正文推「这条是谁说的」的代码：说话者只读 `type` | [S-1](v2/contract.md#s-1-七种消息) | 验证义务 |
| SC-2 | 不存在从提醒正文推来源事实的代码：恢复对账、循环阶梯、呈现只读 `source` | [S-15](v2/contract.md#s-15-systemremindermessage正文给模型读来源给系统认)、[S-19](v2/contract.md#s-19-后台执行的两种收场提醒)、[S-23](v2/contract.md#s-23-循环守卫的干预) | 验证义务 |
| SC-3 | 不存在按 `createdAt` 排序或比较先后的代码 | [S-4](v2/contract.md#s-4-createdat-不是次序) | 验证义务 |
| SC-4 | 不存在「当前可读集合」这样一份被写下来的状态；也不存在回头改块上 `toModel` 的写路径 | [S-27](v2/contract.md#s-27-compactionmessage-与它的名单)、[S-28](v2/contract.md#s-28-此刻模型可读是算出来的) | 验证义务 |
| SC-5 | 翻译方的每一家映射都为 `system_reminder` 与 `compaction` 各有一个落点；不存在「认不出就跳过」的分支；`tool_internal` 不在翻译方的输入类型里 | [S-35](v2/contract.md#s-35-我们自己那两种必须在发出前译掉)、[S-36](v2/contract.md#s-36-toolinternalmessage-不进请求) | 验证义务 |
| SC-6 | 不存在「从最后一条压缩记录往后取」的组装实现 | [S-28](v2/contract.md#s-28-此刻模型可读是算出来的) | 验证义务 |

## 结果与反例

### Schema 实例的验证方法

按实例各节的校验对象绑定 $defs，设计树 Schema 按 $id 解析真实跨契约引用，逐行比对 Schema 列。此检查只覆盖形状；拒绝值一列、Schema 管不到的约束和组合行为须另验。

### 发出记录的跨记录限制

一次调用各次发出逐字相同属于跨记录约束，Schema 管不到；形状合法的实例仍可能违反该约束。对应实例须在真实日志/接收边界验证。

Schema、具名拒绝值、日志序列、规范场景与真实组合分别判读，不能互相冒充。

## 形式化工件

按 [`v2/formal/README.md`](v2/formal/README.md) 的模型、命令、作用域与变异方法检查 `Readable.als`。两条一致性 `run` 应为 SAT，四条 `check` 应在给定作用域中为 UNSAT；五个变异分别须使 A1、A2、A4 找到反例。读每条命令的 SAT/UNSAT 结果，不能把退出 0 当成无反例：Alloy 找到反例也可以退出 0。仅看退出码的 runner 不能作为这些义务的判读器。

结论只限各命令中恰 5 或 6 个 `Msg`、其余 sig 至多 5 或 6 个的作用域，不支持任意规模。A3 的「块不变」前提按构造，须由 SC-4 独立检查；S-29 ①②本身为事实，③与 S-32 ⑦按构造，⑥未建模。块形状归 V-1，真实实现的读写行为归 V-4/V-5；模型检查不能替代它们。单次输入、命令结果与反例留本工作树 `tmp/`。

## 变化的影响

规范内容从 [本专题入口](README.md) 定位；JSON 严格读取与无损数值按所采用版本的 S-37 验证，不能由已解析对象的 Schema 通过替代。精确依赖、绑定、快照、拒绝优先级或消息结局改变时，同步日志、运行时、传输适配与对应验证资源。

完整输入快照必须保留原 cap、适用事实与 updatedAt，不能用当前目录重建。当前格式的唯一接收路径不回填、不清空旧用户数据；格式拒绝不抹去已受理任务的恢复、认回或结算责任。这里维护验证义务，不授予实现状态。

跨进程演化时须执行 V-9；单机范围的模型、形状或静态结果不得外推。

## 后继版本的验证入口

[v7 验证义务](v7/verification.md) 与 [v8 验证义务](v8/verification.md) 分别维护新增承诺的验证责任；语义编码/摘要向量、相等与不等关系由 v8 的资源核对。ACK 模型范围为 2 calls / 2 consumers、单 Focus、一次可选 crash，公平性与负控按 [v8 形式入口](v8/formal/README.md) 读取；继承模型不能代替新增 ACK 义务。真实提供者、授权、存储、未知写入与清理仍须按对应 owner 的场景验收。

## 对齐义务

- **`ToolInternalEnding` 的对应表只在 [S-14](v2/contract.md#s-14-toolinternalmessage-怎么收的尾)**：`capability.stream-assembly`（S-2 等处）与 `capability.tool-execution-runtime`（S-19、S-39）引用它、不各写一份；`no_answer`、桥换代与宿主被撤下都落 `lost`。`data.arrival-events` 的 `FinishReason` 改值时本表同轮复核。
- **回复流结局的对应只在 [S-10](v2/contract.md#s-10-assistantmessage-怎么收的尾)**：`capability.stream-assembly` 与 `capability.model-request-runtime` 按它包消息、不另写。同一句的另一侧：`capability.model-request-runtime` S-36、S-51 在宿主停止与撤除时对在途的流放弃（不再先 `interrupt(run_cancelled)` 让调用方收口出一条回复）；`data.model-response` S-12／S-13 把系统发起的运行取消记成没有回复、带 `delivered` 的 `interrupted{run_cancelled}`；`data.arrival-events` S-16 的 `interrupted` 不再含「宿主把它带走」。这三处由各自承诺拥有者维护。
- **`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`droppedParameters` 的就地形状与 `ResponseId` 与 `data.model-response` v2 逐字相同**（V-12）：那份契约是这几项的家，本契约逐字自定义、不 `$ref`、不登依赖——registry「互引成环的登记口径」。那边改形状，本契约同轮改；「已出门」上写的值与同一次发出的响应体 `route` 必须相同。
- **`model_call_ended.cause` 与 `data.loop-extension` v2 `FailureCause` 出门前四值逐字相同**（V-12）。
- **`capability.model-request-runtime`**：写「已出门」时带上绑定（S-49）；续接或再发时凭据取不到写 `released{cause: credential_unavailable}`，不写 `undispatched`（S-50）。
- **「已出门」上的 `parameterAdjustments`、`droppedParameters` 与同一次发出的响应体 `route` 上的同名两项逐项相同**（S-49）：`capability.model-request-runtime` 写「已出门」时带上传输适配定下的处置，停机之后补写响应体时从这一条读（它的 S-33）；`data.model-response` 改这两项的形状，本契约同轮改（V-12）。
