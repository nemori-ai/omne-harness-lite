# 验证义务与方法

本页维护验证义务、方法、前提与范围。采用与接受状态从专题入口/registry 读取，实现状态从实际成员入口读取；单次执行留工作树 tmp，不维护运行台账。各版本义务按精确消费分别判读，旧范围不自动升级，删除旧日志不关闭缺口。

## v5 发布前破坏性演进

| 证据义务 | 可失败观察 | 责任 |
|---|---| --- |
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 规格与集成拥有者 |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 规格拥有者 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 对应消费者及验证 owner |

精确链 MP5/Directory5/MS6/MR7/LC6/RT7/runner5 的采用由各 owner 明确；IV/CB/日志/资产/hooks 不自动升级。字段与行为性质仍按 contract 核，不兼容输入明确拒绝，不进入旧 codec、不降级/回填、不写或清空原数据。已受理任务、不可变快照、未知结果及原批认回/恢复/释放责任不能因格式拒绝消失。字节与引用核对不执行模型，也不证明 I/O。

## v4 输入限制的验证义务

| 条款 / 性质 | 能失败的证据义务 | 责任 |
|---|---| --- |
| S-8/S-9/S-32 形状、必填、适用性、三态闭合 | examples.json 全部 74 条 Schema 正反例；三个宿主同条件；精确外部 $ref 全部可解析 | core/model-profile |
| S-24/S-25/S-31/S-33 表示层跨字段与优先级 | 四指标 N/N+1、上限冲突与输出冲突同时发生、缺 cap 与空 providers 同时发生；不能只跑 Schema | core/model-profile |
| S-11/S-28 相等与时间 | 只改 cap、只改事实、只改配置、对象键次序/模态次序、时间源不后退；记录是否实际改写均有断言 | directory |
| S-27 完整不可变快照 | 拷贝后修改原对象与当前目录，旧快照精确不变；新输入重计；MS/MR/LC 三位置往返不丢字段 | runtime / codec |
| S-8 准确计量或可靠保守界 | 有独立来源 oracle；消息/system/tools/协议/模态全部计入，保守界超 cap 但真值未知不得声称测得超限 | 模型计量提供者；G-15 |
| S-9/S-33 字节、图数、请求体独立指标 | 严格 base64 实际解码值、重复图项、逐图都过而总数或完整请求体失败；附件 bytes 不能放行 | runtime / transport；数据形状检查不替代最终门 |
| S-3/S-10/S-29/S-30 继承义务 | 同格原子判重、同身份恢复、修订不改义、配置无秘密、严格 JSON 无损 | 相应提供者与验证拥有者 |
| S-27 历史读取与新发送 | 旧快照只按旧版本读取/结算，不用当前目录回填；新版缺成员拒绝且无新发送 | runtime / codec；G-16 |

Schema 与 S-33 比较仅覆盖单文档三态/有限数值，不证明准确 token 计量。四独立指标的 N/N+1、缺 cap/空 providers 的优先级、可靠保守界与独立 oracle 都须实际生产者验证。完整快照拷贝后修改原对象和目录不能改变旧任务。模型责任归 directory/runtime，不在本 data 包建平行状态机。

## v3 模型适配绑定的验证义务

| 规范/性质 | 证据方式与输入 | 责任与受阻消费者 |
|---|---|---|
| S-29 必填、三组分量闭合、字符串边界 | Schema 正反实例第 11、12 节，及三个档案表示的必填回归；显式空白码点、尾随换行/U+FEFF 均检查 | 规格工具与 core/model-profile；缺绑定不得补默认 |
| S-31 模型 ID 一致及 S-25 优先级 | 表示层校验的纯计算检查；examples 第 12 节的 Schema 通过而完整校验拒绝、与空路由名和输出上限同时错误场景 | core/model-profile；只运行 Schema 不足以通过 |
| S-30 配置 JSON 与数无损 | 严格解析重复成员、NaN、尾逗号及精确大整数/小数的往返；以 content-blocks/v2 S-24 的共同语义为依据 | 配置接收边界与 core 公共 JSON 设施；不能由 Schema 实例检查替代 |
| S-29 修订命名域、不原地改义、值相等 | examples 第 13 节；同档案改值不改修订被阻止，不同租户可用同修订字符串但保留各自 values；对象次序不影响相等、数组次序与精确数值参与比较 | 实现/定义/档案写入者；不能仅测结构合法 |
| S-27/S-29 调用快照完整且不随更新变化 | 原样复制绑定和 values 后修改当前档案，旧调用、重试与历史回读仍得旧值；另测外部对象别名修改 | 运行时与持久化消费者；其状态机模型和真实组合证据不在本 data 包伪造 |
| S-30 秘密/凭据禁入、自建只取声明式配置 | 接收边界检查与写入路径审阅；嵌套合成秘密不被当成 Schema 已排除；自建不能通过配置载入任意代码、冒充 official | 档案写入与适配注册 owner；Schema 通过不证明此性质 |
| S-29/S-30/S-31 跨消费者同一定义 | Schema 指针与精确依赖检查，messages/response/extension 等只引用公共定义；注册可用性与配置适用性失败由行为消费者闭合 | 主线整批对齐；G-14 阻断实现采用，不阻断候选表达 |

完整绑定值比较含五字符串与 JSON 配置；revision 不是全局唯一标识，不能用同修订取别的档案值。严格 JSON 重复成员、无损大数/小数与秘密排除由接收边界核；messages/response/extension 只引用公共定义，注册/配置适用性归行为 owner，G-14 未闭合不能因形状合法采用。

## 证据义务

| 规范条款与性质 | 证据形式 | 未完成义务、责任与受阻消费者 |
|---|---|---|
| [S-24](v2/contract.md#s-24-表示层校验是一次纯计算)、[S-25](v2/contract.md#s-25-拒绝值闭合一次恰一个) 表示层校验与拒绝值次序 | Draft 2020-12 校验器对 [`model-profile.schema.json`](v2/model-profile.schema.json) 求值加 S-18 那一步，再按 S-25 的表与次序得出拒绝值；输入是 [`examples.md`](v2/examples.md) 第 1～6 节与第 10 节全部实例 | 责任：规格工具（首次可由评审前的自检承担）。须覆盖两条引擎差异回归例（尾随换行、前导 U+FEFF）、第 6 节四条与第 10 节一条次序例、`input_text_missing` 一例、M12 各行，以及第 3 节官方／自建两支互斥的各行。**校验通过不支持** S-3、S-14、S-21 任何一条 |
| [S-18](v2/contract.md#s-18-档案参数的输出上限) `max_output_exceeds_profile` | **不由 Schema 兑现**：表示层校验在 Schema 之外那一步的单元检查；输入是 examples 第 2 节三行、第 6 节末行与第 10 节一行（建档内容） | 责任：表示层校验的实现者。**只跑 Schema 的实现会让这几行通过**——这一条必须单独断言，对档案与建档内容两种都要 |
| [S-28](v2/contract.md#s-28-建档内容产生一条档案时给的那一份) 建档内容不带在册状态与 `updatedAt`（M12） | Schema（成员集合闭合）＋ examples [第 10 节](v2/examples.md#10-建档内容)；外加场景：以带 `registration` 或 `updatedAt` 的建档内容分别调建档与装入清单，**两边都得 `invalidInput`、`reason = malformed`**，且什么都没写 | 责任：`capability.model-profile-directory` v2（建档与清单装入收它）。**带了 `registration: "listed"` 也要被拒**——只挡 `withdrawn` 的实现会让那一行失败 |
| [S-18](v2/contract.md#s-18-档案参数的输出上限)／[S-21](v2/contract.md#s-21-不静默丢也不静默改) 上游输出上限已低于档案参数：`maxOutputTokens` 一项不跟着降，发出时改值并留痕 | 规范场景：假上游的输出上限低于档案 `parameters.maxOutputTokens`，发一次；**同时断言**档案的 `maxOutputTokens` 没变、出站请求里的 `maxOutputTokens` 是上游收得下的值、留痕的 `parameters` 里是实际发出的那个值、`parameterAdjustments` 记下了要求的与发出的两个值。**另一场景**：同一次同步里上游还改了窗口——断言窗口照常更新、`updatedAt` 动了、`maxOutputTokens` 仍是旧值；一份把 `maxOutputTokens` 降到参数值之下的修订整份被拒（`max_output_exceeds_profile`），什么都没写 | 责任：**模型请求运行时**（adapter）与维护档案的能力（写入面整份拒）；留痕形状在 `data.model-response` v2 S-11 |
| [S-3](v2/contract.md#s-3-撞名判定同一范围内唯一) 撞名拒建（只比同一格） | 规范场景演练：examples [第 7 节](v2/examples.md#7-判定撞名拒建不是-schema-实例)十二行——**同一格撞名、同一格撞已撤回行（要走恢复在册）、与官方同名照常建出、组织层与租户层同名照常建出、别的组织同名照常建出、新官方档案与自建同名照常建出、已撤回的官方档案在清单里重现时走恢复在册（`relisted`，不是 `route_name_taken`，也不另起一行）、只差大小写照常建出**，**并发三行**（同一格里并发同名恰一次成功、自建与官方发布并发都成功、组织层与租户层并发都成功）与读不到一行（故障注入） | 责任：`capability.model-profile-directory` v2（candidate，建档与装入官方清单的那两个操作）。并发那几行要么真并发演练、要么由那份能力的行为模型检查「判定读到的名字与写入同提交」，**两者择一，不能靠顺序执行的场景代替**。「照常建出」那几行同样要断言——**一个判到别的格去的实现会让它们失败**（P-11） |
| [S-10](v2/contract.md#s-10-registration) 两条转移、恢复的是同一行、行保留 | **静态检查**：维护档案的能力的写路径里，在册状态只有撤回与恢复在册两条边、没有删行、恢复不另起一行；外加场景：撤回后按引用读，仍读到这一条、`registration = withdrawn`；**单纯的恢复**（`relistProfile`）后按同一个引用读，读到**同一行**、`registration = listed`、其余成员与 `updatedAt` 不变；**清单装入的 `relisted`** 只断言同一行、身份分量不变、`registration = listed`，属性按清单改写、`updatedAt` 按 S-11 | 责任：`capability.model-profile-directory` v2 |
| [S-14](v2/contract.md#s-14-引用只精确解析不跨层) 引用只精确解析，三种收场不折叠 | 规范场景：官方引用读一次、自建引用读一次；再用**名字对、所在范围或来源不对**的引用各读一次（须是「查无此条」，不得顺着名字解析到那一条）；再对不存在的引用、存储不可用各读一次，**三种结果值须两两不同** | 责任：`capability.model-profile-directory` v2 的读面（失败值名在那里） |
| [S-5](v2/contract.md#s-5-providername-与允许的供应商)、[S-6](v2/contract.md#s-6-允不允许回退) 只发往允许列表里的一家；不允许回退时只走第一家；不把整份列表交给上游回退 | 规范场景：以可控的假上游让第一家失败，分别在 `allowFallback` 为 `true`／`false` 下观察第二次发往哪一家；**检查每一次出站请求只点名一家、且关掉了上游侧的回退** | 责任：`capability.model-request-runtime` v2。只看最终结果不够——上游自己回退成功时，结果与「我们换了一家」长得一样 |
| [S-21](v2/contract.md#s-21-不静默丢也不静默改) 不静默丢、不静默改 | 规范场景：假上游不认某一项（统一项一次、`extra` 项一次）、只认某项的更窄取值域，各发一次；比对「实际发出的请求体」与留痕 | 责任：模型请求运行时的 adapter；留痕形状在 `data.model-response` v2 S-11。**三条都要断言**：没发出去的项在 `droppedParameters` 里有名字（`extra` 项以键为名）；改了值的项在 `parameters` 里是实际发出的值；同一项在 `parameterAdjustments` 里记着要求的与发出的两个值 |
| [S-27](v2/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) 快照是原样副本 | 规范场景：打开一次调用之后改档案、撤回档案，断言那次调用的快照与打开那一刻的档案逐成员相等（[S-28](v2/contract.md#s-28-建档内容产生一条档案时给的那一份) 的相等规则），且 S-18 的关系在快照上成立 | 责任：`capability.model-request-runtime` v2（写快照的一方）。收快照的一方不重判，所以这一条只能在写的一方断言 |
| [S-17](v2/contract.md#s-17-缺席即不带没有人补值) 缺席不补值 | 规范场景：档案不给某一项、拓展件也不设，检查出站请求体里**没有**这一项 | 责任：模型请求运行时 |
| [S-22](v2/contract.md#s-22-凭据价格与实际用了哪条都不在档案上) 档案上没有凭据 | Schema（档案文档本身，examples 第 2 节的 `credential` 一行）＋**静态检查**（档案的一切交换表示与读面返回里不出现凭据） | 责任：维护档案的能力与展示列表的提供者 |
| [S-11](v2/contract.md#s-11-updatedat) `updatedAt` 何时动、不后退 | 规范场景：改 `providers`（它不动）、改 `maxInputTokens`（它动）、写回同值（它不动）、把两组模态换个次序写回（它不动：按集合比） | 责任：`capability.model-profile-directory` v2 |
| [S-13](v2/contract.md#s-13-modelprofileref) 引用的持久形状：`origin` 判别式原样存、自建那一支的 `scope` 存成带判别式的值 | **静态检查**：持久形状里有 `origin`，自建那一支是一个 `ScopeLayerIdentity`、不是两个可空列；**不存在「缺 `scope` 即官方」的读法** | 责任：凡持久化 `ModelProfileRef` 的 owner（Agent 定义、会话、响应留痕） |

## 对齐义务

| 对齐什么 | 本包现状 | 另一边 |
|---|---|---|
| **`Modality` 只有一份定义** | 两组模态 `$ref` `data.content-blocks` 的 `$defs/Modality`，本包不再自定义 | `data.content-blocks/v2#S-6` 是唯一的家 |
| **`ModelProfileRef` 的消费** | S-13 定形状：按 `origin` 判别两支，官方 `{origin, routeName}`、自建 `{origin, scope, routeName}` | `data.model-response` 的路由留痕取这个值（`data.loop-extension` 请求的 `target` 改取 `RouteName`） |
| **撞名范围与大小写规则** | S-3：同一范围（同一格）内唯一，含已撤回行；不同格可同名（官方与自建、组织层与租户层、不同组织）；逐码点比较，不做大小写折叠与相似字判定 | `capability.model-profile-directory` 的建档与装入官方清单；任何按路由名去重、索引或展示的消费者（展示列表、`data.model-response` 的 `upstreamModel` 对照） |
| **上游输出上限低于档案参数的收场** | S-18：`maxOutputTokens` 一项不跟着降（其余四项照常更新），义务归模型请求运行时 | `data.model-response` v2 S-11 的 `parameters` 与 `parameterAdjustments` |
| **`ModelRequestParameters` 与项名** | S-15～S-21；项名规则在 S-20；S-21 三种处置 | `data.model-response` v2 S-11 的三个成员（`parameters`、`parameterAdjustments`、`droppedParameters`）；`data.messages` v2 S-49「已出门」上的 `parameters`（要求的那一组）与同名两份处置清单；`data.loop-extension` 的「调模型之前」可改的参数 |
| **建档内容** | S-28：`ModelProfile` 去掉 `registration`、`updatedAt`；带了即 `malformed`（M12） | `capability.model-profile-directory` v2 S-5、S-8、S-9、S-14 ①⑧、S-18 ①⑧ 引 `#S-28` |
| **恢复与属性改写同提交** | S-10：转移本身只改 `registration`；清单装入的 `relisted` 可同时改属性；「其余不变」只对 `relistProfile` | `capability.model-profile-directory` v2 S-18 `relisted`、S-33 |
| **快照照原样复制** | S-27：S-18 的关系在快照上由写的一方保证，收的一方不重判 | `capability.model-request-runtime` v2（写）；`data.model-response` 的 `route.profileSnapshot`、`data.loop-extension` 的「调模型之后 · 失败」主体（收） |
| **`withdrawn` 两处同名** | `Registration` 的 `withdrawn` 是档案的在册状态 | `data.loop-extension` 的失败成因取值 `withdrawn`（已下架） |

## 结果与反例

### 表示层与分类的一致性

验证分别进行 Schema 加跨字段比较、按契约拒绝次序的分类，逐行比对规范实例的预期、拒绝值及 M 编号。按同一条款另写分类脚本只能检查表、Schema 与条款自洽，不是独立实现符合性。判定与写路径场景需另验；本方法不证明 S-3、S-10、S-14、S-21 或 S-27。

## 形式化工件

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**，理由在[包入口](README.md#版本包)与[契约第十二节](v2/contract.md#十二版本差异与规范工件)。
**这不是把义务省掉**：会被并发反驳的那一条（S-3 的判定与写入同提交）登记在上表 S-3 那一行，落点是拥有建档操作的能力契约。
没有 Alloy 或 TLA+ 任务登记到 `formal-tasks.json`。

## 变化的影响

规范规则导航 [v2](v2/contract.md)、[v3](v3/contract.md)、[v4](v4/contract.md)、[v5](v5/contract.md)，不在本页复述改判历史。各版本的目录写读、快照编码与真实发送按该版本承诺核。

- 单格撞名范围、撤回恢复同一行、身份不复用、updatedAt 动因、逐层求有效模型与精确引用不回退分别核；不得使用被取代的全局或同树撞名算法。
- 参数原值、实际发送值、丢弃清单和 requested/sent 调整逐项相合；extra 全丢则整个成员缺席。上游输出上限低于参数的改值义务有前提：此刻上限事实有真实来源。G-22/G-23 的事实/逐路由 wire hints 若未闭合，不能猜值或解析路由名冒充来源。
- G-2 供应商词法、G-8 覆盖去参数、G-9 extra 同义收场、G-10 模型组、G-14 消费者升级、G-15 计量、G-16 旧快照解释等按各精确版本 owner 接续。

## v6 估算计量保证

[v6 contract](v6/contract.md) 的准入计量与 RT8 S-74 分开 exact/estimated；estimated 拒绝不冒充准确超限，bytes/图数仍精确，actual usage 来自上游。multiplier≥1 的有限十进制与 reserveTokens≥0 整数显式配置，admissionTokens=ceil(estimatedTokens×multiplier)+reserveTokens。政策非法按既有 malformed，在 cap/事实 missing 后检查；同时有准确超限与估算拒绝时优先报告准确事实。

实际 tokenizer 适用依据、完整输入、任意有限十进制、固定最终请求及37模型生产认证和真实 I/O 归对应提供者。MP G-15/RT G-33 的逐模型/供应商/版本材料、RT G-28 生产 Run 终结来源不因 data 修改关闭。

FinalPlan 区分日志路径与公开无日志路径，保留 CheckedBeforeEffects、SameFixedPlan、UnknownNotExceeded、EstimateCanProceed、MarginApplied、EstimateNotActual、MissingPriority、BytesExact、UsageFromUpstream 负控。它允许 estimated≤cap 而上游 token>cap 的发送，本契约不排除该状态。有限模型、Schema 或仅登记模式均不证明真实 I/O。
