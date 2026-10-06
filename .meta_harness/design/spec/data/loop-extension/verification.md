# 验证义务与方法

本页维护验证义务、方法、前提与范围。采用与接受状态从专题入口/registry 读取，实现状态从实际成员入口读取；单次执行留工作树 tmp，不维护运行台账。各版本义务按精确消费分别判读，旧范围不自动升级，删除旧日志不关闭缺口。

## v6 发布前破坏性演进

| 证据义务 | 可失败观察 | 责任 |
|---|---| --- |
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 规格与集成拥有者 |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 规格拥有者 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 对应消费者及验证 owner |

当前格式拒绝不能抹除已受理事实；旧不兼容输入不进入兼容codec、不回填、不写清空用户旧数据，既有认回/结算责任由原 owner 保持。字节和引用核对不是形式执行或生产行为。

## v5 完整快照与重试结论历史

| 条款/性质 | 能失败的证据与前提 | 责任 |
|---|---| --- |
| S-14/S-36 完整 MP4/MS5 闭包 | 合法实例通过，删顶层/嵌套上游事实拒绝；依赖固定精确资源 | runtime/runner |
| S-42 调用关联 | 13 种位置分别带/不带成员；失败三种记录均必填；另须把不同调用 dispatch 混入主体或改 Conclusion.modelCallId 后，真实写边界拒绝且不写记录 | runner |
| S-43 历史完整性 | 对照日志，漏项、错序、同条目重复、跨会话/调用、改 extension/plan/at 均拒；等值不同条目保留两次 | runtime/runner |
| S-32/S-43 已给而未发出 | 默认 retry 落盘后停在再次发出前，恢复读已有结论，不能多给一次；事实取不到不得补空历史 | runtime/runner 行为与真实组合 |
| S-43 默认件与自定义件 | 规范实例第 12 节：相同 dispatches=[A,A] 的续接/重试历史分开，同 Run 两调用分开，保留全部自定义结论但不冒充默认件次数 | runtime 默认件及组合场景 |
| 继承位置、权限、回放 | 去除 v5 S-42/S-43 的增量并逆转两项依赖后，Schema 结构等于 LC4；原规范实例仍符合形状预期；真实回放保持 | runner |

S-42/S-43 的 modelCallId 仅失败位置必填，其他位置禁止；工具callId原义保持。retryConclusions 包含同会话/同调用合法完整前缀的全部有效结论，含自定义件及已给未发出的项，空数组只表示确认没有。Schema不能证明完整/次序/重数/归属，等值不同条目必须两次保留。runtime6/runner4分别生产完整主体、写前校关联、透传历史且已结论不重跑，默认件只数自身，计次政策归runtime。

## v4 模型适配绑定闭包

| 性质 | 证据与反例 | 责任 |
|---|---| --- |
| S-14 完整 failure subject 可表示 | 新版完整输入通过 v4、被旧 v3 闭包拒绝；缺顶层快照或任一发出记录绑定被 v4 拒绝 | core/loop-extension |
| 引用的单条记录合法性与类型保持 | 内部绑定不等、模型 ID 不符时执行 messages/v4 的纯校验；重复键、精度或 JSON 类型改变不能被形状通过掩盖 | runtime/runner 提供者 |
| 完整原值从 runtime 传到 runner/重试件 | 记录按发出序号，profile 与 dispatches 来自同一调用；目录更新与回放不换值 | runtime/v3、runner/v3 真实组合 |
| 原有控制规则保持 | v3 所有规范形状实例、四条 core 窄修订用例；失败位置 observed/retry 仍合法，rewrite 仍拒绝；Schema 除两项引用替换外结构不变 | 相应提供者与验证拥有者 |

S-14/S-36/S-37 从profile3/messages4公共源原样携带完整绑定。缺绑定旧输入不能剥字段/填默认作为v4，旧日志按原版解释，不由此包造迁移政策。原13位置、八结论、十拒绝值及控制顺序保持，完整坏名留存与禁止派发继续验证。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 |责任与限制|
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～5、7 节的正反实例逐条过 Schema，「Schema」列逐条比对；第 6 节四个走查里的 JSON 同样过对应的 `$defs` | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs`；**前提：五份同批契约 v2 已定型并在同一棵设计树里** | [S-1](v2/contract.md#s-1-十一个位置)、[S-2](v2/contract.md#s-2-两个维度)、[S-4](v2/contract.md#s-4-干预力三档)～[S-18](v2/contract.md#s-18-terminalfact)、[S-19](v2/contract.md#s-19-结论封闭八种)、[S-22](v2/contract.md#s-22-inject)～[S-28](v2/contract.md#s-28-ask)、[S-30](v2/contract.md#s-30-每件的结论必留)、[S-31](v2/contract.md#s-31-三种记录形状)、[S-36](v2/contract.md#s-36-规范表示与定义项)、[S-39](v2/contract.md#s-39-判别式与枚举闭合) 的**形状那一面** | 只支持形状，拒绝值、优先级与行为分别验证。 |
| V-2 | **两张合法组合表机检**：对 13 个位置（含维度）× 8 种结论 × 3 档逐一构造 `Conclusion`，比对 Schema 结果与 [S-20](v2/contract.md#s-20-档与结论的合法组合)、[S-21](v2/contract.md#s-21-位置与结论的合法组合) 的 ✓/✗，并比对拒绝值次序（[S-37](v2/contract.md#s-37-表示层拒绝值)） | 生成式校验（312 格）＋ Draft 2020-12 校验器 | S-20、S-21、S-37 | 使用真实依赖核312格并验证拒绝次序，人工逐格对读不能代替机器核对。 |
| V-3 | **回放一致**（[PF-012 §6.9](../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) 的验收办法）：把一件拓展件上次的结论留在日志里重算，下一步相同；停在 `ask` 的那一件回放到出卡处，**不出第二张卡、不再调模型** | 规范场景演练，**归 runner** | [S-32](v2/contract.md#s-32-结论即走向)、[S-35](v2/contract.md#s-35-跨过一次等待只能带已落日志的东西) | 需要 runner 提供者。本契约只登记它已触发  |
| V-4 | **不可用 ≠ 报错 ≠ 否决，三种策略各落其位**：让一件没声明不可用处置的可否决件的依赖不在场，观察记的是 `skipped: unavailable` ＋ `unavailability: skip`、瀑布跳过它、**这一关没有被当成否决**；让一件声明了 `veto` 的同样不在场，观察记 `unavailability: veto`、这一次经过以否决收场、原因写明「此刻不在、按否决处置」；把它的干预力收窄到 `rewrite` 再来一次，观察照 `skip` 办；让一件系统自带件不在场，观察记 `unavailability: fallback`、效果照 runner S-17 的表；再让它报错，观察在「之前」的位置落 `veto`、在「之后」的位置落 `stop{ terminal: failed }` 且运行落失败、在 `after_terminal` 落 `observed`，`error` 都可见；让一件可改写件报错，观察 `record` 落了一条以它名义的「没跑成」提醒、下一次组装看得到；`ignore` 对 agent 没有任何效果 | 规范场景 ＋ 故障注入 | [S-5](v2/contract.md#s-5-报错处置策略)、[S-6](v2/contract.md#s-6-声明的成员与类别)、[S-9](v2/contract.md#s-9-依赖声明与不可用)、[S-26](v2/contract.md#s-26-stop)、[S-31](v2/contract.md#s-31-三种记录形状)、[S-33](v2/contract.md#s-33-不可用与报错两分) | 这条最容易被一个 `catch { return observed }` 抹掉，**必须真跑**  |
| V-11 | **落终态之后不复活，回复被否决不走成因**：让一件 `after_terminal` 的件交回 `inject`，观察被拒、队列没有变非空、没有下一次运行；否决一条模型回复，观察回复没落盘、结论在日志里、那次调用照常结束、`after_model_call` 没有触发、没有产出任何成因 | 规范场景 | [S-2](v2/contract.md#s-2-两个维度)、[S-21](v2/contract.md#s-21-位置与结论的合法组合)、[S-22](v2/contract.md#s-22-inject)、[S-25](v2/contract.md#s-25-veto) | 需要 runner 提供者  |
| V-5 | **每件必留**：一次经过里挂了 N 件，日志里恰有 N 条最终结论（出过卡的另有一条 `ask`） | 规范场景 ＋ runner 的静态检查 | [S-30](v2/contract.md#s-30-每件的结论必留) | 按本行提供者责任验证 |
| V-6 | **不合法的结论按报错处置**：让一件 `rewrite` 档件交回 `veto`、一件件交回冒名的 `inject`、一件 `rewrite` 改了 `callId`，观察三次都记 `skipped: errored`、`error` 恰为拒绝值、**被拒的结论没有生效** | 规范场景 | [S-20](v2/contract.md#s-20-档与结论的合法组合)～[S-23](v2/contract.md#s-23-rewrite)、[S-34](v2/contract.md#s-34-不合法的结论按报错处置)、[S-37](v2/contract.md#s-37-表示层拒绝值) | 第三种（改了不可改的成员）Schema 放过，**只有这条演练能抓到**  |
| V-7 | **没有放宽**：兼容件的 `allow` 译成 `observed`，放行判断说「问一下」时动作仍等人 | 规范场景，**归兼容层与 runner** | [S-29](v2/contract.md#s-29-没有放宽) | 按本行提供者责任验证 |
| V-8 | **`select_model` 与 `retry` 的判定**：不在合法目标集合里的 `select_model` 不生效；撞上事实三类的 `retry` 不生效；两者都记成报错；`route.selectedBy` 记下本件 | 规范场景，**判定归模型请求那一侧的能力** | [S-24](v2/contract.md#s-24-select_model)、[S-27](v2/contract.md#s-27-retry) | 按本行提供者责任验证 |
| V-9 | **被拦的内容不进日志**：否决一条带敏感内容的用户消息，检查全部结论记录的 `reason`、`error` 里没有原文 | 规范场景 ＋ 日志内容扫描 | [S-25](v2/contract.md#s-25-veto)、[S-31](v2/contract.md#s-31-三种记录形状) | 按本行提供者责任验证 |
| V-10 | **跨进程后的传输故障映射**：远端拓展件回执丢失时记成不可用或报错之一，不折成 `observed` | 规范场景 | [第十节](v2/contract.md#十装配给与协议给)各行 | ——单机同进程没有这条边。跨进程演化启动时必须补做  |

## 结果与反例

本页维护验证义务、方法、前提与覆盖限制。单次执行的工具与版本、环境、配置、输入范围、步骤和原始结果留本工作树 `tmp/`，不建立永久运行索引。
**必须分开陈述**：Schema 校验、规范场景演练、真实组合的符合性——三者不能互相冒充（[S-38](v2/contract.md#s-38-表示层拒绝不是判定)）。

设计检查器只检查登记、`$id`、`$ref` 解析与 Markdown 链接锚点，不校验实例，因此不能支持上表的行为义务。临时桩、空 `$defs` 或补入草稿得到的导航通过不能代替真实依赖的实例校验；须对当前完整设计树执行检查，V-1 另用真实定义核对。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约第十六节](v2/contract.md#十六版本差异与规范工件)：
两张合法组合表是有限结构，Schema 已逐格写死；本契约没有状态转移。
**这不是把义务省掉**——V-2 把两张表的机检登记成义务；回放、先落后算、同一次经过只跑一轮是**行为**性质，形式模型归 `capability.loop-extension-runner`。
本契约**不拥有任何进展性质**。

## 变化的影响

规范规则归 [v2 contract](v2/contract.md) 及当前专题入口；本页不保留修复经过。共享数据变化同步真实defs与实例，V-1/V-2须真实完整依赖。

- FailureCause 家归本契约，下游逐字同义；落盘前veto/consumed不产成因且不触发after_model_call，失败重试只读完整subject不另读响应体。
- 推出规则限制干预力不高于声明，位置与维度不得跨类；治理写面 valueOutOfDomain、求值和runner按同一允许集核，不靠模型Schema补权。
- EnvironmentHandle在全部位置必带，按会话作用域取调用方租户与环境，只通过runner S-50读面，不暴露会话ID或有无Run；before_persist_message也带。hooks与modality-projection必须消费该途径。
- 兼容件的来源产品非阻断错误（非零/超时/坏输出）固定ignore，不进onError，这是干预力收窄策略的例外；记录沿现有形状，不立新输出种类。
- inBand只能true且与statusCode同在，表示流内code而非HTTP，重试件须区分来源。失败subject每条发出记录须全字段，并分别核反例的实际拒绝原因，不能缺字段误拒掩盖目标性质。
- G-1/PF010、G-4/Run、G-5工具词表、G-6/PF008、G-15/PF010、G-16/messages、G-18等继承缺口保持精确owner，删除形成史不关闭。

## 对齐义务

| 对齐什么 | 涉及 |
|---|---|
| **不可用处置**：记录的 `unavailability`（`skip`／`veto`／`fallback`）；不可用 ＋ `veto` ⇒ 这一次经过以否决收场、原因写明「此刻不在、按否决处置」；系统自带件记 `fallback`、效果照指定挂件的表；系统自带件的声明不带 `unavailability`，**带了也不采用** | `capability.loop-extension-runner` v2 S-12、S-13、S-17 |
| **工具的指认用模型面名字**：`ModelRequest.tools: ModelToolName[]`、`ToolDefinitionRef.name` 是模型面名字；传输适配不做逆转写 | `capability.model-request-runtime` v2 S-7、S-51；`capability.tool-admission` v2 S-7（`definition` 带模型面名字） |
| **调模型之前改写的参数怎么留痕**：响应体 `parameters` 记实际发出的值、`parameterAdjustments`、`droppedParameters` 含 `extra` 项名 | `data.model-response` v2；`capability.model-request-runtime` v2 S-7 |
| **`consumed` 的那一次不触发「调模型之后」** | `data.model-response` v2 S-5、G-14 |
| **`ask` 带改写**：`DecisionCardDraft.proposedRewrite`；改写在答复允许之后生效、回放从这一格重建 `rewrite` | `capability.hooks-import` v2 S-20、S-21 |
| **推出规则的坐标**：拓展件的属性项推出规则在本契约 [S-40](v2/contract.md#s-40-属性项的推出规则) | `capability.asset-evaluation` v2 S-4 末段、S-10、G-3；`data.asset-model` v2 CS-1；`capability.asset-governance` v2 G-5 |
| **`implementation.builtinName`**：装配清单里那件系统自带实现的名字；JSON 路径 `LoopExtensionDefinition.implementation.builtinName`（`kind = builtin` 那一支，Schema `#/$defs/ExtensionImplementation/oneOf/0/properties/builtinName`） | `data.asset-model` v2（壳 `$ref` `LoopExtensionDefinition`，随之生效） |
| **干预力上限由允许集合兑现**；**位置项只含同一维度成员的位置、维度项只收那一成员的取值，跨类的配值在治理写面以 `valueOutOfDomain` 拒** | `capability.loop-extension-runner` v2（「干预力不高于声明的值」一句、S-6 按求得的位置与维度匹配）；`capability.asset-governance` v2 S-38（`valueOutOfDomain`）；`capability.asset-evaluation` v2 S-23（不改） |
| **`batch` 含解析不了的调用** | `capability.loop-extension-runner` v2 S-21 ①、S-29；`capability.tool-execution-runtime` v2 S-23 |
| **执行环境句柄**：`ExtensionInput.environment`，读面（解析得到什么、何时有效、解析不出时怎样）在 runner；模态转换件的 `tenant`、兼容件的执行环境从它取 | `capability.loop-extension-runner` v2 S-7、S-10、S-50、S-32；`capability.modality-projection` v2 S-18、S-20；`capability.hooks-import` v2 S-17、S-18、S-19、S-26 |
