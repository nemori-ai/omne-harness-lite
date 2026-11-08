# Model 领域实现规格

本包非 pi-ai 实现设计已接受，独立执行、凭据存在性与解析的判定及档案读取 `createModelProfiles` 已有实现，本地保管归 model-host-local，createModelRuntime 已实现受理、事实查询、取消意图、原流保存、最小实例观察与下述支持范围内的调用收场，结果读取、processed ACK 与 quiesce 已实现，retained ACK 与生产托管宿主尚未实现。pi-ai 细化的采用范围见[组架构各节](../docs/architecture.md#成员与新增条件)。共同领域行为与提供者协议由 [model-contract](../model-contract/SPEC.md) 唯一维护；本页只补本实现的执行、配置及资源义务。

受理入口在解构和 await 前同步调用共同 judgeAdmit。直接 Memory Commands 在 store.run 前执行同一判断；sendBinding 使用 judgeFixedModelRequest 后仍核原 digest。畸形重放先 invalid，合法异输入仍 conflict。预算、不可变性、资格例外及失败 Pointer 归[共同封闭契约](../model-contract/SPEC.md#封闭输入判断)，不代表供应商 token/context 检查。

## 诊断只读动作

依据 [#1140 DA2 采用](https://github.com/nemori-ai/omne-harness-lite/issues/1140#issuecomment-6703474020)，Commands 的 `recall` 使用 `inspect`，`dispatches` 使用 `read-account`。两项动作分别读取调用身份与状态、派发及账目。它们不授予正文、执行、观察、控制或写入资格。`query` 与 admit 重放仍使用 `facts`，`recordLateFact` 仍使用 `account`。动作的公开形状归 [commands/types.ts](src/commands/types.ts)。

主体分类、异步资格捕获、读前与读后复核由装配兑现。核心只向注入的权威询问相应动作，不根据主体形状自行放行。动作分离的回归在 [memory-dispatch.spec.ts](tests/memory-dispatch.spec.ts)，其中同一份有效迟到账目在只读资格下拒绝，在写资格下可保存。


## 独立执行

独立函数 `executeModel` 执行一次供应商请求，不重试、不保管、不 ACK。其 signal 请求该次传输停止，返回事实仍须区分请求取消与真实停止。托管模式的观察 signal 不传给它。托管模式只有原调用的有效控制可以请求传输停止。

`executeModel` 选用 request.suppliers 的首项，仅执行一次。需要另一供应商时调用者必须形成新的明确执行，不能把此函数冒充托管 fallback。它以空的 `resent` 调用 prepare，因为一次独立执行是首次发出。流中的账目事实是账目报告，原样交给调用者；调用者需要完整账目时自己补上身份。

独立调用在 start 前观察到 signal 已取消时，只返回 not-started/cancelled，不调用 start。prepare 或 materialize 的四种声明失败原样放入 not-started/rejected，不改成托管提交失败，也不抛异常代替该结果；准备或物化过程意外抛错映射为 unavailable 及安全诊断。materialize 返回后、start 前再次检查取消及当前资格，已取消则 not-started/cancelled，失权则 not-started/rejected。已取得资源始终 close。

调用 start 即可能已经发送，包括 start 同步抛错的情形。start 调用、取得源 iterator 或读取时的异常，以及没有 ended 的 EOF，均产生唯一 ended/failed，fault.cause 为 stream-lost，upstreamStatus 为 null，诊断使用安全阶段码。此时不再返回 not-started。signal 仅请求停止；只有传输确认停止才返回 ended/interrupted，未确认且失联时不虚构停止。竞争中实际 completed 仍报告 completed。流上恰好一个终结结果，消费者主动放弃读取不代表已取得终结事实，释放时仍关闭本次资源。

本实现每次调用各返回一个原生 async generator 实例，首次 next 才准备资源。重复取得迭代器或并发 next 不重发。return 按语言队列等待正在执行的 next，不抢占提供者等待；调用者通过 signal 请求停止，不设隐式关闭时限。

本次采用的供应商和表示字段在准备等待前固定。物化回执须精确匹配这两份 Adoption 的全部字段，payloadDigest 非空且重复读取稳定；不匹配返回 invalid，field 为 receipt，reason 说明回执不匹配。读取异常返回安全 unavailable，诊断标明 receipt 阶段。回执不授予当前资格，提供者仍负责发送授权。

交付 ended 或已取得资源后的 not-started 之前，按源 iterator、materialized、prepared 的次序完成全部释放尝试。任一步失败仍尝试后续步骤；不关闭借入的 transport。清理失败不覆盖业务终局，原终局仍交付一次。消费者随后 next、return 或 throw 时收到固定异常 independent-cleanup-failed；若不再推进，只能保证清理已尝试，不能保证消费者已观察该异常。非终局处早退在当次推进报告清理失败。清理只执行一次，后续 done 不证明失败资源已释放。

发送准备、物化回执、同步 start 与两级资源关闭的完整协议见 [传输协议](../model-contract/SPEC.md#342-独立执行与提供者操作)。其余托管行为直接遵循该规格，不另写状态机。

<a id="调用和各次真实发出"></a>调用受理与各次真实发出的事实归 model-contract 的[调用和各次真实发出](../model-contract/SPEC.md#调用和各次真实发出)。

## 档案读取与同名求值

`createModelProfiles(source)` 返回 `ModelProfiles`。每次 `list` 与 `resolve` 先检查租户是否经 legal-identity 铸造，未铸造时返回 `denied`（action 为 `tenant`），先于读取来源。通过后读一次来源快照，来源失败原样返回，不折成 absent。快照交给纯函数 `judgeProfileResolution` 与 `judgeProfileChoices`（[profiles/judge.ts](src/profiles/judge.ts)，不读环境，不做 I/O，不抛异常，不进根入口）。本包不依赖任何 `pi-ai-*` 成员，由 [install-policy.json](tests/fixtures/install-policy.json) 与 `package.json` 共同保证。

求值规则依 [model-contract 同名求值](../model-contract/SPEC.md#同名求值选择及列表)：

1. 同路由候选先去掉已撤回的，再去掉被排除的，余下的按 `precedence` 取最具体者，层序位置靠后者更具体。求值不写死层序。
2. 没有同名候选是 `unknown-name`。同名候选全部撤回是 `withdrawn`。仍有在册候选而全部被排除是 `excluded`。
3. 胜出后才判相容：`required.modalities` 不全在 `definition.input` 内加 `modality` 原因，`locked` 为真加 `locked` 原因，`selectable` 等于无原因。含 `video` 的 `required` 因此不可选。
4. 缺凭据与模态不符都不改换外层，`credential` 原样取自候选，求值不读秘密。
5. `list` 的 `choices` 只含可选的 resolved 项，路由不重复，次序同候选在快照中的首次出现；`selected` 只解释传入值，保留当前不合法项；`source` 取自快照。
6. 快照有重复身份返回 `unavailable`（`duplicate-profile-identity`），候选范围不在 `precedence` 内返回 `unavailable`（`profile-scope-outside-precedence`），不使用半份目录。

契约没写的三点，本实现取下列值并由用例固定：`shadowed` 只含未撤回、未排除的低层同名项，次序同 `precedence`；`choices` 次序同候选在快照中的首次出现；`scope` 原因在本阶段不产生，因为快照里没有租户层与组织层候选，契约也没有定义它的触发条件，留给契约拥有者。

**O1，待契约拥有者裁定。** model-contract SPEC 的「同名求值、选择及列表」一节（先去掉已撤回候选，再取最具体）与「档案和准备提供者的组合协议」一节（被更高层同名档案遮蔽的低层项不能在高层撤回时自动顶替）在「两层同名、高层撤回」上读法不一。本实现按前一节读：高层撤回后，在册的低层同名档案胜出。用例（[profiles.spec.ts](tests/profiles.spec.ts)）标注了这一读法。M2 的快照只有 `factory` 一层，官方档案不触发这个情形。

## 工厂与配置

createModelRuntime 的构造形状以 [runtime.ts](src/runtime.ts) 为唯一声明，[公开入口](docs/public-api.md) 提供使用导航。outputBatchBytes、observerBufferBytes、resultPageTargetBytes、readIdleMs 为正整数；outputBatchDelayMs、retryBackoffMs、cleanupRetryMs 为非负整数。observerCheckIntervalMs 为必填正安全整数。一次已取得 read 沿原期限，不因配置换代缩短。

构造所需 Commands、send、retry、instances 和 clock 必须显式取得；缺失时不得装成可用实例。工厂返回 ModelRuntimeProvider，普通消费者只取得其 runtime；恢复和 quiesce 的权限及原身份协议沿共同规格。

| 构造依赖      | 取得与义务                                                                                                                 | 缺席、换代和释放                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| commands      | 必需构造注入。提供者拥有本域存储、当前资格及提交组合                                                                       | 不可用时不能认成功；替换先排除旧写者并接续原操作，不靠清空缓存恢复                                                                   |
| send          | 必需构造注入。内部组合当前授权、[#279](https://github.com/nemori-ai/omne-harness-lite/issues/279) 凭据、真实传输和发送围栏 | 缺席不发；在途连接的资源与未知归旧传输负责，新边界不得复制旧 dispatch                                                                |
| retry         | 必需策略实现；原 request 的采用和允许范围约束每次决定                                                                      | 不可用则不再试并以 policy-unavailable 收场；替换不能重做已持久的决定                                                                 |
| instances     | 必需实例宿主。登记能力只供 Model 提供者，目录供消费者                                                                      | 宿主退出撤路由；事实/保管不消失。后继先接管原责任再发布新实例                                                                        |
| clock         | 必需时钟/等待能力；时间值为 UTC instant                                                                                    | 时钟不可用不虚构超时或许可；取消等待不取消原调用                                                                                     |
| configuration | 构造时校验的纯数据，原实例固定采用                                                                                         | 数值为有限整数，观察复查间隔还须安全；容量/页/空闲期限/观察复查间隔须正；延迟/退避可为零。替换只影响新实例，恢复读取已固定的在途期限 |

retryBackoffMs 是本实现的默认退避；次数、接收方及首内容边界沿共同重试协议。

配置不设未经测量的生产默认值。发行装配必须显式提供全部字段并注明来源，策略默认仍严格采用 SPEC 的供应商顺序与次数规则。缺配置是加载失败，不是隐式无界队列。输出队列满时背压，观察者落后时结束该观察并允许快照重连；不能因慢观察者无限保存重复快照。resultPageTargetBytes 是完整结果项的组页目标，超目标单项独页，不分割、截断或转换类型。整个 ResultPage 的规范 UTF-8 JSON 字节数不超过原容量 C，消费者须能接收接近 C 的单页。已有媒体引用保持原资格，不提供任意 text/tool_call/partial 附件化协议。

outputBatchBytes 按事实 JSON 的 UTF-8 逻辑字节数触发持久输出批次。outputBatchDelayMs=0 时，收到一条事实后先保存，再读取下一条。正数延迟从首事实开始计时，允许跨片聚合。字节阈值或计时到期请求保存，终止或 EOF 立即闭合批次。已经挂起的 next 仍属原窗口，完成后将整批保存，不把它追溯划入后继窗口。只有前批保存与后继开窗均确认后才开始后继读取。

批延迟是安全读取边界上的软触发，不保证最大可见延迟。挂起读取持续沉默时，已收前缀也可能一直未保存展示。单条事实可超过字节目标，Commands 仍按原调用容量接纳或拒绝，不截断事实。未确认批次不向观察者发布，首内容窗口与游标仍沿[共同协议](../model-contract/SPEC.md#展示诊断与实施证据)。

## 实现与验证

[内部架构](docs/architecture.md)、[流程](docs/flows.md)和[构造对象](docs/object-model.md)描述具体协调。框架目录定义归 model-cordis-contract；[本成员装配页](docs/cordis.md)说明领域装配，实际本地宿主、发送阶段与凭据保管归 [model-host-local](../model-host-local/SPEC.md)。判定测试覆盖五种解析结果、租户隔离与关闭；持久化、轮换、文件故障与 Cordis 关闭由 model-host-local 的测试覆盖。这些凭据测试不证明托管调用、结果保管、恢复或取消已经实现。

## 构造与关闭的可观察行为

本实现的三个独立能力工厂只组合算法，不启动运行。createModelRuntime 返回带driver的 ModelRuntimeProvider，普通runtime不暴露driver。装配者须完成显式host绑定，才能公开受理；绑定失败不得返回“可用runtime”。既有替代提供者无需复制这些工厂，但必须符合领域协议。

调用已经持久受理而schedule失败时，返回原受理事实，不伪装未受理。提供者记录唤醒失败并由恢复扫描续排。query和recover不得为了返回可用状态创建第二次逻辑调用。quiesce停止新的业务受理，仍允许已受理工作调度，不撤销原责任；现有查询、控制、结果保管及清理按可用依赖继续。

<a id="quiesce-的受理闸门与计数"></a>**quiesce 的受理闸门与计数。** 本实现的 quiesce 关上 runtime 的受理闸门。之后的 admit 先按共同判断核验输入，再用 Commands.recall 查同一 operation 的原受理。找到原受理时，admit 照常经 Commands.admit 认回它。没有原受理时，admit 返回 unavailable，dependency 为 `model-runtime`，diagnostic 为 `quiesced`，不提交，也不留下调用。recall 的失败（例如 denied、commit-unknown）原样返回。已经通过闸门、尚未返回的受理，quiesce 先等它返回，再计数。quiesce 不调用 Commands，不关闭绑定，不取消或撤销已受理工作；schedule、drive、查询、取消、读取、ACK 与清理不受影响。

quiesce 返回十进制字符串 `{ pending, running }`。`running` 是本 provider 的 driver 正在 drive 的调用数。`pending` 是本 provider 新受理（认回不算）或 drive 过、尚未确认收场、此刻不在 drive 中的调用数。drive 确认 settle，或读到原调用已经 settled 时，该调用不再计入。重复 quiesce 返回同一形状，数字按当时的状态。用例 [runtime-quiesce.spec.ts](tests/runtime-quiesce.spec.ts) 固定这些行为。

已知限制：pending 只数本进程。进程外或重启前的耐久待办不计入，其他来源的唤醒在 drive 开始之前也不计入；它们归 5.4 恢复的耐久扫描（波 C）。drive 失败而原调用未收场时，该调用继续计入 pending。

本地关闭期限属于宿主配置，不是业务取消期限。到期时只能报告仍有未决资源；不能借超时宣称物理停止。故障恢复、真实执行者排除及旧写核实的前提由[宿主设计](docs/cordis.md#本地调度与执行者排除)维护。受理、发送和保管已承诺的事实不因构造方式改变。

## 凭据引用与解析

本成员提供凭据引用、存在性查询和发送前解析。秘密只留在本成员内部；调用记录、诊断、日志、错误消息和遥测只携带引用，不携带秘密值。

凭据引用由凭据身份、租户和用途组成。凭据身份 `CredentialId` 及引用、结果和持有者比较由 [model-contract](../model-contract/SPEC.md#342-凭据引用与解析端口)定义，本成员实现保管侧的取舍与持久化。凭据身份不是租户身份，也不是登录出示物。租户使用 `TenantId`。用途只取 `model-send`。引用本身不授予读取或发送授权。

公开操作是 `present`（存在性）和 `resolve`（获准发送时解析）。两者都接受一个用途字符串。用途不是 `model-send` 时，两者都返回 `denied`。

### 存在性

`present` 不判断发送资格。结果分三种：

- `known`：带上 `present`（布尔值）、`id`、`tenant`、`purpose`。同一身份且同一租户的行存在时 `present` 为 true，即使该行的寿命是 `revoked` 或 `unreadable`。同一身份只在别的租户手里，或者本租户没有这一行时，`present` 为 false。
- `denied`：保管已关闭或用途不符。
- `unavailable`：保管或存储整体不能判断。

### 解析结果

`resolve` 在获准发送时按当前资格返回五种结果之一。只有 `value` 携带秘密，并且只用于这一次发送。

| 结果          | 含义                                             | 发送端行为                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `value`       | 当前资格允许                                     | 发出，并记下本次采用的值。`scope` 为 `tenant` 或 `factory`。 |
| `absent`      | 没有这份凭据                                     | 不发送。产品发送边界把本次调用终结为失败，见下文。           |
| `unreadable`  | 引用在，值暂时读不出                             | 不发送。产品发送边界把本次调用终结为失败，见下文。           |
| `denied`      | 跨租户、用途不符、无发送资格、已撤销或保管已关闭 | 不发送。                                                     |
| `unavailable` | 保管或存储暂时不能判断                           | 不发送，也不得报成 `absent`。                                |

### 解析取舍顺序

`resolve` 按以下顺序判断，前面的结果一旦成立，后面的不再看：

1. 保管已关闭、发送未获准或用途不是 `model-send`：返回 `denied`。
2. 本租户有这一身份的行：
   - `active`：返回 `value`，范围 `tenant`。
   - `revoked`：返回 `denied`。
   - `unreadable`：返回 `unreadable`。
3. 本租户没有这一行：
   - 别的租户持有同一身份：返回 `denied`，不使用工厂秘密，不使用其他租户的值。
   - 本租户还有其他任意一行：返回 `absent`。
   - 本租户没有任何一行，且本次档案是官方档案：返回 `value`，范围 `factory`。
   - 否则：返回 `absent`。

已撤销或暂时读不出的行仍然存在，因此 `present` 为 true；只有 `resolve` 才按寿命分别返回 `denied` 或 `unreadable`。租户绑定仍在但值不可读时，不使用部署默认凭据，也不使用其他租户的值。未获准的官方发送拿不到工厂秘密。

### 判定与保管的分工

兼容期新路径由 `judgeQualifiedPresence` 与 `judgeQualifiedResolution` 实现，分别消费不含 `official` 的资格查询与完整 `QualifiedCredentialQuery<P>`。租户只取 `access.tenant`，不读取 `SendFace`，不接受自由租户或 `authorized`。提供者复用合法租户、用途、绑定寿命与工厂选择的判定；同一凭据身份仅由其他租户持有时，两个新判定都返回 `denied`。旧 `judgePresence` 在此情形仍返回 `known` 且 `present: false`，旧 `judgeResolution` 的行为也不变。

受信发送边界负责在受理点 C 核验 `access`，并从档案提供 `official`。这些纯判定不核主体铸造来源，也不核档案事实来源。调用方不能把成功解析当作主体来源已获核验。新路径保留五种解析结果，只有官方档案且租户没有绑定时可选工厂值。验证见 [qualified-credential.spec.ts](tests/qualified-credential.spec.ts)，真实文件与 Cordis 转发验证归 [model-host-local](../model-host-local/SPEC.md#兼容期资格凭据路径)。

本包拥有存在性与解析的判定：`judgeGate`（不依赖绑定的拒绝：租户未铸造、保管已关闭、用途不符、发送无资格；保管实现在读存储之前先问它，所以存储不可读时仍拒绝本来就不会服务的请求）、`judgePresence` 与 `judgeResolution` 只读调用者传入的一份状态快照（`CustodianState`：关闭标志、工厂秘密、绑定列表，绑定寿命为 `active`、`revoked` 或 `unreadable`），不读文件，不持有状态，也不依赖任何保管实现。上文五种结果与存在性规则就是它们的行为。

保管归 [model-host-local](../model-host-local/SPEC.md)：保管库文件、文件锁、刷新、发布确认、关闭，以及装载保管库的 Cordis 插件。保管实现自己构造状态快照并调用判定，本包不依赖它。Cordis 服务键 `modelCredential` 的定义归 model-cordis-contract。独立调用可以不启动 Cordis，直接用判定函数配合任何保管实现；各入口看到的五种结果相同。

判定假设快照里的租户值由同一 legal-identity 实例铸造，保管实现须在其边界重新铸造租户值。查询里的租户同样须是铸造出来的值：未经铸造的租户（例如复制出的对象）使 `judgePresence` 与 `judgeResolution` 都返回 `denied`，先于其他判定，不会被当作没有任何绑定的租户而得到工厂秘密。反过来，快照里若有绑定的租户未经铸造，判定无法证明查询租户没有绑定，此时本应给出工厂秘密的解析返回 `denied`；其余结果不变，这样的绑定自己不匹配任何查询。

本包导出根入口和独立 testing 子路径，包清单不声明 Cordis、proper-lockfile 与 model-cordis-contract。

## 当前构造支持与本地模拟

根 createModelRuntime 校验五依赖的方法形状及全部八配置字段。缺项或错误类型抛 TypeError，数值非有限整数或超界抛 RangeError。构造不调用依赖，不绑定、排队或启动网络。

calls.admit、dispatches、cancel 分别委托 Commands 的 admit、dispatches、control。inspect 先解析 invocation reference，再将 call/admission 交原 recall。普通 connect 和 beginRead 同样先解析引用，再将 call 交低层目录与 acquireRead；beginRead.operation 仍为读取操作。引用拒绝及三个入口的资格差别归[共同引用契约](../model-contract/SPEC.md#可保存调用引用)。Commands 拥有当前资格、租户隔离、原 operation 认回及原子提交。受理和取消成功后调用 instances.schedule；排队失败不撤销已提交事实，后续恢复扫描仍须接续责任。未知提交原样返回，不能当作明确拒绝。取消先提交意图，返回实际 ControlState，回复不代表供应商已经停止。意图提交成功后，runtime 请求停止同一租户、同一调用正在运行的供应商流；同一 Run 的其他调用不受影响。终止仍由传输在物理停止之后交出的终结事实决定：已经自然完成的流仍以完成收场，已交付内容与真实账目照常保存。

受控宿主显式调用 driver.drive，以稳定 claim operation、instance 和可信 continuity 取得原执行代次。driver 按调用单写，取得当前资格后，保护覆盖接收、异步等待与原资源释放。无 dispatch、无相关未决写且尚未 prepare 时，创建 cursor0 空 blocks 的确认初始投影，先 publish，再 prepare/send。已有 dispatch 且本实例没有确认内容时仍发布新 handle，但 observe 首项为 ended/unavailable，不伪造空恢复，也不重新发送。

发送边界交出原 window 与唯一 facts。driver 在附带投影刷新前固定原流接收拥有者，只取得一次 iterator，每批使用原窗口和全部已接收事实调用 preserve。Commands 唯一归约 blocks、首内容、账目与 cursor，确认回执才更新实例投影。Commands 保存账目时用账目报告补上 `subject`（本次调用）与 `receipt`（流内为 `received`，recordLateFact 补录为 `late`），再按原规则核验、去重与修订。同一事件经两条路径到达时只登记一次。诊断事实按到达次序保存在该 dispatch 上，不改变 blocks、首内容与终局；现有公开读面不返回它们。推理续接状态部件可以不经 open 整块封口，与图片和文件相同。

完成收场组成消息时，finish 的回放按下列规则取值：

- `scope` 取请求声明中这次发出供应商的 `produces`。
- `format` 取这次发出的物化回执的 `replayFormat`。
- 回复含推理续接状态部件而回执没有 `replayFormat` 时，preserve 与 recordLateFact 都返回 `invalid`（`termination`，`replay-format-unknown`），整批不保存。
- 回复只有 `thinking` 而 `scope` 与 `format` 缺一时，finish 不带回放。
- 物化提交时，回执的 `replayFormat` 不是合格的回放标签则返回 `invalid`（`receipt`，`binding`）。

请求声明覆盖每个可能发出的供应商。清理在同一步清空请求与 blocks，已收场调用的晚到终局不组成消息。所以含推理续接状态部件的收场总能取得 `scope`。取不到时是程序缺陷，内存 Commands 抛出 `TypeError`。

EOF 或流异常先保存完整已收前缀及 stream-lost 事实，再交出确认终止证据，沿 sender 释放原资源。满足下述收场前提时同时形成真实 Settlement，失联仍沿 drive 返回明确失败。sender 的明确 not-started 失败沿 drive 返回，保留已发布实例和 prepared 事实，不改成推进成功。

未知 claim、prepare、sender 写、开窗及 preserve 各由原拥有者认回。prepare/open/preserve 保留完整 operation、expected、dispatch、window 与 facts。query 为 unknown 或失败时保留责任，不继续读取或发布。committed 仍重放原方法取得原回执，未提交也只重放原参数。取消导致原 expected 冲突时不改旧输入；仅终止 preserve 和 settle 依下述有限接续建立新意图。非终止批次仍明确失败。sender 私有未决操作交原 sender 认回。陌生未决操作没有原输入时明确阻塞。

每个实例只保存一份确认 Snapshot。observe 首项为完整 snapshot，后续 changed 为最新完整快照，可以合并通知。内部版本同时记录控制变化，内容 cursor 不因取消单独推进。preserve 发出前设置确认屏障并推进内容 epoch；未知期间不把旧 blocks/cursor 与新 state 拼接。确认或明确拒绝后先固定接收后续阶段，再安排附带权威状态刷新。刷新失败或挂起不阻止接收和资源释放，也不重放已确认回执。内容 epoch 稳定且无确认屏障时，只有较新 revision 才发布 state-only 更新。接收刷新与控制刷新分别合并请求，沉默的接收刷新不阻塞已提交取消的投影。

每次交付内容前，observer 用自己的 principal/tenant 调用真实 directory.connect，核当前 observe 资格和原 handle/instance。它不需要 facts 或 recovery 权限。等待期间按必填 observerCheckIntervalMs 复查。撤权、断线、撤路由及换代分别结束观察，不取消原调用。已有 dispatch 的新实例缺少恢复快照时明确 unavailable。return/abort 唤醒本 observer 并撤除监听和时钟，不等待沉默上游。

observerBufferBytes 是每实例观察登记与每观察者未读通知的逻辑额度，不是 JavaScript 堆精确字节数。登记占64字节，最多 floor(observerBufferBytes/64) 个 observer；不足64时新观察明确 ended/unavailable。每个未读版本计32字节，超过额度结束该慢 observer。共享初始 Snapshot 的正文不重复计入每 observer 额度。每 observer 最多一个在途 next，并发 next 结束该观察为 unavailable，不形成 Promise 队列。

calls.admit 按[共同封闭契约](../model-contract/SPEC.md#封闭输入判断)拒绝附加字段。本包不形成固定请求：`FixedModelRequest.declarations` 由请求准备方写入，受理只按共同判断核验它与 `suppliers` 一一对应。其余入口只投影其声明字段，外层附加值不进入快照。入参在首个 await 前固定普通业务值。已铸造 TenantId 与不透明 principal 保留原引用。调用者随后改写外层对象不改变当前操作或 schedule 的身份。停止 signal 只停止本地 drive，不能撤受理、取消业务或删除未知写。当前暂存仅存在于本 provider 实例，不提供跨进程丢失原 prepare 输入后的恢复保证。

| 操作                                                               | 当前支持及剩余阶段                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| calls.admit、calls.inspect、calls.dispatches、calls.cancel         | 已实现受理、事实查询与取消意图                                                             |
| driver.drive                                                       | 已接原 sender、唯一事实流、确认保存与本节支持范围的收场；生产调度归 5.3                    |
| consumption.beginRead、consumption.readNext、consumption.closeRead | 已接真实 Commands 的读准入、分页与关闭                                                     |
| consumption.acknowledge                                            | processed 已接 handoff；retained 静态 unavailable，阶段 6.1；保留 operation 返回 invalid   |
| instances.connect                                                  | 委托实际 directory，提供最小实例观察；完整生产宿主归 3.5                                   |
| recover                                                            | unavailable，5.4                                                                           |
| quiesce                                                            | 已实现停新受理与本进程 pending/running 报告，见[受理闸门与计数](#quiesce-的受理闸门与计数) |

未实现操作的 diagnostic 为 `managed-runtime-not-implemented operation=<操作> stage=<阶段>`，dependency 为 model-runtime。操作和阶段取固定字面量，不含请求、身份或秘密。诊断供人阅读，不是解析协议。每次未实现操作返回独立的回复与 failure 对象。

独立 testing 入口的内存 Commands 实现共同协议的本地状态转换。每个公开方法同步形成候选，只有一个提交点发布调用事实与 operation 绑定。prepareDispatch 把固定请求的消息身份序列抄进发出记录的 `messages`；`dispatches` 返回它，清理释放请求材料时保留它。当前资格及执行通道在认回前重核。请求、owner 采用和 ActorRef 固定，P 不保存。待办和总预留从原责任派生，容量为整个装配共用的有限上界。

<a id="共享归约核心"></a>**共享归约核心。** 22 个方法的规则在 [src/commands/](src/commands/index.ts)，内存实现与耐久实现共用同一份。这是[父卡](https://github.com/nemori-ai/omne-harness-lite/issues/446) MD-03 决定 D3 第 2 条的选项 A。`createModelCommandsCore(options, storage)` 构造核心：构造时校验限额与 owner 声明，校验失败时抛出。`modelCommands(core)` 给出完整的 `ModelCommands`。两个实现的边界如下：

- 核心拥有每个方法的检查次序、调用文档的变化、回执与认回、待决写的阻挡、单调用容量、流事实归约、分页、读关系和发送绑定。核心只经端口读写，不做 I/O，也不持有进程外的状态。
- 存储实现 [ModelCommandStorage](src/commands/storage.ts)：`run` 一次只运行一个尝试；`documents` 读一个租户的调用与 operation 绑定；`reserved` 给出容量汇总；`commit` 在所读调用仍为当前值时写入调用并绑定 operation，返回 `committed` 或 `unknown`；`publish` 只用于读关系的进度；可选的 `pending(tenant, after, limit)` 由存储自己分页选出待恢复调用（`PendingPage`）。存储给出 `pending` 时，`scanPending` 在同样的资格与 limit 检查之后直接调用它，不经 `run`。
- 汇总范围由存储决定。内存存储汇总整个装配，`limits.capacity` 是整个装配共用的上界。
- 内存存储 [testing/state.ts](src/testing/state.ts) 只保留同步围栏、内存文档、注入未知与 reveal、测试控制和发送协调器。

核心与端口经子路径 `@omne-harness/model/commands` 导出：`createModelCommandsCore`、`modelCommands`、`MODEL_WRITE_METHODS`、`hasRecoveryWork` 与端口类型。根入口不导出它们，根入口只放运行面；子路径给耐久存储这类提供者装配核心，不是消费者接口。核心用到的规范编码、摘要与身份铸造在 [commands/value.ts](src/commands/value.ts)，[testing/value.ts](src/testing/value.ts) 只重新导出它们，所以子路径的导入图不经 testing，产品代码的 `no-testing-import` 检查也不受影响。testing 入口仍转导核心，供内存实现的测试使用。

`run` 的第二个参数 `scope` 可选，写明本次尝试的租户（规范文本）、call 与 operation。耐久存储可在运行同步的 `work` 之前按它预读；内存存储不读任何东西，忽略它。核心的每个 `run` 调用处都传 `scope`，传递义务如下，用例 [commands-scope.spec.ts](tests/commands-scope.spec.ts) 固定：

- 租户取方法输入的租户，用 `tenantCodec` 的规范文本。
- 写方法（`MODEL_WRITE_METHODS` 的 15 个）带 call 与 operation。
- 读方法带 call，不带 operation（`recall` 的 admission 也不带）。`query` 例外：它恢复一个原 operation，所以带上输入的 operation，读绑定的存储（SQL）据此读到原写的绑定。
- `scanPending` 跨调用读，只带租户。
- 租户没有规范文本时不传 `scope`，`work` 照旧返回 `denied`。

核心用 `runRead` 与 `runWrite` 两个入口传 `scope`，裁定逻辑不读它。

`hasRecoveryWork(call, pending?)` 回答一份调用文档是否还有待恢复工作：`pending` 是该调用仍为 `unknown` 的 operation，缺省为空。它与 `scanPending` 选调用用的是同一条规则，所以自己选待恢复调用的存储问同一个问题，不另写一份规则。用例固定两者的一致。

已知限制：内存 Commands 把每次确认的 Snapshot 计入调用容量。长回复即使分批保存，占用也随确认次数持续增长。耐久 Commands 须规定自己的快照与容量策略，这项工作归[父卡](https://github.com/nemori-ai/omne-harness-lite/issues/446)阶段 7.2。

发送边界在准备前复制 execution、request、supplier、consumer 和 initiator 的值，后续异步步骤、计数和关闭使用同一份需求。合法 TenantId 与不透明 P 保留原身份，AbortSignal 保留原取消语义。调用者改写外层字段或嵌套值不改变本次发送；实际 start 仍重核当前资格、代次与控制。请求参数的统一校验覆盖 parameters、parameterAdoptions.applied 和显式 origin.requested。已知非法参数沿原结果通道拒绝，不进入摘要或消耗 unknown 注入；已有 operation 的异输入仍按原绑定冲突。retry 的决定认回也核对原请求，不重复消费决定。请求拥有的 suppliers、parameters、system、messages、tools、parameterAdoptions 及三个参数承载位置中的 stop 都要求数组无空位，并保留各自的元素规则。合法空序列仍允许，suppliers 与 stop 保持非空要求。内部规范编码独立拒绝空位，不将其编码为合法空数组。

内存分页以 resultPageParts 限项数、resultPageTargetBytes 定目标。每页先放一个完整 ResultPart，再在项数及候选 parts 数组规范 UTF-8 JSON 字节数都允许时加入后项。对象键递归排序，数组保序，字符串按 JSON.stringify 转义，孤立代理码元不丢失。首项超目标独页，空结果有空 parts 与真实终局。页包装、next 和 Settlement 另受原容量 C 硬界。受理时复制装配默认页配置。受信 configureResultPaging 只能在结果尚未收场且没有 read 时调整；结果冻结后拒绝修改。读只保存固定源的必要位置与保护元数据，不缓存第二份页正文。合法 after 从真实组页起点和该读最远已返回页派生，未发出的页起点拒绝。

保存计费还包含原请求/主体/采用、输出与真实 trim/曾有内容事实、历史确认 Snapshot、原状态/账目/重试、最终有序 parts 的交付表示。实现 [judge.ts](src/commands/judge.ts) 为每个 dispatch 保留4096字节实际终局槽，逻辑终局尚未固定时另保留4096字节。逻辑终局固定后按其实际编码计费，晚到实际回执不覆盖它。分页配置的完整规范对象计入材料，从受理起预留两个正安全整数的最大表示及键和包装。控制器在既有 exclusive 内检查身份、正安全整数和冻结条件，复制 call、按原容量检查后一次发布；失败保留原对象与配置。另保留8192字节 Settlement、12288字节 custody、1024字节 control、首个读1024字节和最大游标页包装64字节。实际材料落入相应槽后消费预留，不重复计费。每个已接纳的 open 窗口分别保留闭合状态增长和完整确认 Snapshot，Snapshot 包含当前正文及最大修订、游标和控制额度。没有 open 窗口且逻辑终局尚未到达时，另保留一个最大合法窗口及其确认 Snapshot。每次开窗和保存都在原提交边界按剩余义务重算，首个终局不撤销其他窗口的预留。容量不足在受理、准备或合法前缀保存边界拒绝，不发布半份事实。这个额度模型不等于 JavaScript 堆占用。

本地 terminal、身份事实及证据的规范编码分别最多4096字节，Settlement 最多8192字节。超长终局在 preserve/recordLateFact/策略 stop 的首次输入边界拒绝，证据在可信返回边界拒绝。consumer owner 构造/替换时最多512 UTF-8字节，避免受理无法形成有限 ACK 证据的 owner；窗口身份规范编码最多256字节，清理诊断规范编码最多4096字节。revision、cursor 和读取位置不超过 Number.MAX_SAFE_INTEGER，十进制游标最多16字节，实际铸造同时校验。UUIDv4 结果/读取身份和 SHA-256 摘要使用固定文本形状。runtime 的组页实际由注入的 Commands 拥有。内存页配置由上述受信控制准备，不证明生产后端或生产参数映射。

operation 长期只保存 SHA-256 输入指纹、方法、调用、原提交修订与小回执。规范化只选协议字段，不包含 P。摘要相同按本地测试编码的碰撞假设认回，不声明数学无碰撞或跨版本持久恢复。ACK 后清理核活动读、未决操作、接收窗口及释放失败，释放后删除请求、输出、历史快照及无用引用。完全释放的调用不再参与恢复扫描，loadRecovery 返回 invalid(call, recovery-material-released)。晚到账目仍可更新最小事实。

控制器可按原身份注入两种 commit-unknown。applied 已完整提交，not-applied 只绑定原身份而无业务效果。揭示只将前者变 committed、后者变 rolled-back 或 not-committed。前置拒绝不消费计划，未知期间异输入冲突。query 的本地 not-committed 不构成 Storage 排除证明。

该入口只证明内存装配。它不提供生产耐久、跨重启恢复、真实旧发送者排除、资格共同事务、厂商网络或可靠消费保证。

## 已实现的调用收场

共同终局、限额和不可反转规则仍由 [model-contract](../model-contract/SPEC.md#故障交接)拥有。本节说明当前 driver 的具体支持与接续条件，不增加共同公开类型。

receiver 在终止 preserve 的确认回执下固定原 ended、Snapshot 和独立的接收失败，先推进内部阶段再通知观察投影。终止确认后不再读取原流。completed 和 failed 保留原 ended。真实 interrupted 仅关联同次确认 Snapshot 的 ControlState.operation，不读取可变 dispatch.terminal 推断原终局。

| 路径                                                                           | 当前实现状态                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 原 completed、completed/limit、input-over-limit                                | 已实现收场。limit 保留正常完成及真实 trim，reported 未报告字段保持 null                   |
| 无需新策略的 failed、首内容后失联                                              | 已实现原失败收场，保留已确认部分输出；接收失联仍沿 drive 返回失败                         |
| 原有效控制及真实 interrupted；无 dispatch 的已保存控制                         | 已实现关联原控制收场；无 dispatch 时不发送                                                |
| 首内容前可重试失败等待策略                                                     | 策略循环尚未实现，保留 retry-not-decided 等真实拒绝，不制造默认 stop                      |
| 无控制 interrupted、sender.not-started、已有 dispatch 但本实例没有确认终止证据 | 尚未支持精确收场。保留原事实和责任，不复制测试后端私有终局映射或恢复猜测                  |
| runtime 读取与 processed ACK                                                   | 已实现，见[结果消费支持](#结果消费支持)                                                   |
| retained ACK、生产调度、跨进程恢复                                             | 尚未实现，继续各自后续阶段。quiesce 已实现，见[受理闸门与计数](#quiesce-的受理闸门与计数) |

Activity 持有唯一的固定 settle 输入。首次写前读取当前资格、代次和 revision。query unknown、失败、调用异常或已知 committed 但原回执暂不可得时，保留原 operation、expected 和完整终局。后续 drive 先核当前资格，查询原操作，并以原参数取得回执，不重新发送或读取原流。

只有明确 expected 冲突、query 完整排除旧提交、当前资格及原代次仍成立时，终止 preserve 或 settle 才能建立新 operation。旧输入永不修改，终止 preserve 保留原 window 与完整 facts。两处共享每次 drive 最多一次替代意图的额度，再次竞争交回真实失败，下一次合法 drive 才继续。权威已 settled 时消费既有结果，不另写终局。

release 与业务收场分别记录。receiver 只启动一次 iterator.return 并缓存结果。driver 固定终止阶段后先发起 release，同时独立推进 settle，不先等待 release。原 drive 锁一直覆盖真实释放等待，防止第二消费者。释放挂起时 inspect 仍可读取已确认 Settlement。释放失败在收场确认后由 drive 返回，后续 drive 不重做 return 或 close。若同轮收场和释放都失败，先返回收场操作的失败，释放失败仍缓存，收场确认后再次可见。

业务收场确认且资源释放成功后，活动退出 finish，丢弃 receiver 及其发送材料引用。活动仅保留 done，或保留原接收失败的 failed。公开观察继续使用已有确认快照。收场未知或释放未成功时，不执行此转换。

settle 确认后先固定内部阶段，再安排附带状态刷新。刷新失败不重做业务写。后续取消、可信 recordLateFact 和事件重放不能改变原 Settlement 的 termination、version 或 source。未知事实不先展示。此实现仅在当前进程持有原确认依据时接续，不证明生产耐久、跨进程恢复或真实厂商停止。

## 结果消费支持

`runtime.consumption` 将 beginRead、readNext、closeRead 和 processed acknowledge 分别交给 Commands 的 acquireRead、nextRead、endRead 与 handoff。公开形状归[共同类型](../model-contract/src/call-surface.ts)，读取顺序、原操作认回与当前资格归[共同规格](../model-contract/SPEC.md#342-普通调用面与实例观察)。Commands 是操作账本、读保护和 ACK 排序的唯一拥有者。

四个方法在异步交接前只保存协议字段。不透明 principal 和已铸造 tenant 保留原身份，业务值及 completion 的 owner、record、revision、digest 断开调用方别名。明确失败与 commit-unknown 原样返回，程序异常继续抛出；facade 不查询、重试或换 operation。

processed 的完成事实须由冻结 consumer 的 owner 提供，经实际 evidence adapter 验证。Commands 的 `handoff` 先在写栅栏外读出该调用，按写入同样的检查（结算、结果版本、证据 owner、冻结的证据适配器）问 owner 的适配器，适配器可以晚些答复（它读 owner 自己的耐久记录，需要 await）；写入只在同一适配器、同一调用、consumer、结果版本与证据下采用这份答复，调用在两者之间变了就答 `unavailable`（`consumer-evidence`），消费者以同一 operation 重试。适配器确认的是只增不减的耐久事实（owner 保存的记录），所以栅栏外读到的确认在写入提交时仍成立（[handoff-evidence.ts](src/commands/handoff-evidence.ts)，R2-D257）。适配器还收到调用的 invocation reference 与本次 ACK 的 principal，用来定位它保存的交付。ACK 成功后仅请求已有观察刷新，不等待投影，辅助故障不改变原 AckReceipt。读取不要求额外 recovery 资格。消费方法不 schedule；自动清理工作者尚未实现，内存测试通过真实 advanceCleanup 命令验证读保护和清理状态。

retained 仍未实现，直接返回 dependency=model-runtime、阶段 6.1 的固定 unavailable。保留 operation 先按现行规则返回 invalid。此静态路径不读取资源、不执行 handoff，也不声称已核承接资格。它对存在、不存在、跨租户和伪造主体给同一支持拒绝。

[第五课](examples/05-read-and-acknowledge.ts)演示公开读取及 processed ACK。[消费测试](tests/README.md#公开结果消费)验证真实 runtime、内存 Commands 和脚本上游，不证明生产耐久、真实厂商或跨进程恢复。

<a id="ack-证据在栅栏外读取的证明"></a>

### ACK 证据在栅栏外读取的证明

本节是人工成文证明，依据[验证说明](../../../docs/verification.md#证据要求何时触发)「依赖某性质放宽顺序控制」一行：ACK 的 owner 证据不再在写栅栏内问，改为栅栏外读、栅栏内核对，须证明放宽之后目标保证不变。按 R2-D262 的裁定不建形式模型，本证明没有经过机器检查。

**命题。** `handoff` 以操作 o 把调用 c 的保管从 `producer` 改为 `acknowledged`，当且仅当 c 冻结的 owner 证据适配器确认了「提交那一刻的 c」上的这次 ACK。这与在栅栏内同步询问适配器的旧做法结果相同。不确认的答复（`unavailable`、`handoff-invalid`）都不写：保管、结果和份额都不变。

**定义。** 问题 Q(c, a) 是 ACK a 在调用 c 上交给适配器的输入，principal 除外，由 [handoff-evidence.ts](src/commands/handoff-evidence.ts) 的 `handoffQuestion` 给出。核对时比较 Q 的五项：

1. 适配器：按受理时冻结的证据采用找到的同一对象。
2. 调用：租户、call，以及由原 admission 得出的 invocation reference。
3. 完整 consumer。
4. 结果版本。
5. 证据本身。

Q 里还带执行代次（`execution`），所以比较比五项更严。栅栏外的读取记下 (适配器, Q, 答复)，写入在栅栏内对当前调用重新求 Q，两者相同才采用答复（`provenHandoff`）。

**前提。**

- H1（owner 记录只增不变）：Agent 的接收记录一旦稳定保存，查询就答 committed；committed 带原回执，已成立的成功记录保持原含义（agent-contract SPEC 第 237 与 241 行，「[原操作认回与恢复](../../agent/agent-contract/SPEC.md#原操作认回与恢复)」与「[查询的四种结论与持久拒绝](../../agent/agent-contract/SPEC.md#查询的四种结论与持久拒绝)」；会话日志只追加）。所以适配器在 t₁ 对 Q 的确认在任何 t₂ > t₁ 对同一 Q 仍成立。不确认的答复不被采用为确认，不依赖这一前提。
- H2（Q 的来源）：consumer、admission（因而 reference）与证据采用在受理时冻结（model-contract SPEC「[参数与注入的裁定](../model-contract/SPEC.md#342-参数与注入的裁定)」）；结果版本在收场时固定；执行代次只由 `claim` 改变；租户与 call 是输入。
- H3（写入串行）：同一调用的写入经存储的单写栅栏串行，栅栏内看到的是提交前的当前调用。

**推导。** 写入提交 `acknowledged` 必须满足两条：栅栏内对当前调用 c₂ 的前置判定通过；读到的答复是对 Q(c₂) 的确认。前置判定与栅栏外读取共用 `handoffQuestion`，两处拒绝同样的 ACK。第二条推出：适配器对 Q(c₁) 作了确认，且 Q(c₁) = Q(c₂)。由 H1，这份确认在提交时对 Q(c₂) 仍成立，与在栅栏内同步询问得到的确认相同。反方向：答复不是确认，或 Q(c₁) ≠ Q(c₂)，写入在提交前返回失败。写入的 apply 失败时不绑定操作、不改调用，所以什么也不写，同一操作以后可以重试。由 H3，提交与其他写入之间没有交错。

**交错逐条覆盖。**

| 读取与写入之间发生的事 | 为什么命题仍成立 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 另一个 ACK（另一操作）先提交 | 保管已是 `acknowledged`，Q 不含保管。写入沿原分支返回现有确认，不覆盖它；采用的答复仍须是对 Q(c₂) 的确认。同一操作已绑定时走认回，不用读到的答复 |
| 清理推进或完成 | 清理只在 `acknowledged` 之后发生，不改变 Q；此时写入返回现有确认，不恢复保管 |
| 换代（`claim`，代次加一） | 执行代次在 Q 里，Q(c₁) ≠ Q(c₂)，写入答 `unavailable`（`evidence-not-read-for-this-call`），不写；同一操作再来时按新代次提问 |
| owner 或证据采用变化 | consumer 与证据采用在受理时冻结，调用上的 owner 不变；装配换了适配器对象时，对象身份不同，答复不被采用 |
| 结果版本变化 | 已收场调用的结果版本固定；ACK 给的版本不同时，两处的前置判定都答 `handoff-invalid`，不问适配器 |
| 读失败、适配器答 `unavailable` 或 `handoff-invalid` | 不是确认，写入原样返回失败，不写 |

**守护用例。** [handoff-evidence.spec.ts](tests/handoff-evidence.spec.ts) 的「does not keep an answer read for the call before it was claimed again」：在适配器答复之前对同一调用 `claim`，断言答 `unavailable`、保管仍是 `producer`、同一操作随后确认。负控：把核对改成只看 `proof === null`，这条用例变红。同一文件还覆盖晚到的确认、晚到的 `unavailable`、拒绝不写，以及写入先拒的 ACK 不问适配器。

**未闭合的部分。** H1 由 Journal 提供者兑现，由它的用例支持：session-adapters 的 `agentReceivedRecords` 用例核对了同一存储上新实例读回同一记录。本证明不证明提供者实现。跨进程写入不在 H3 范围内，M2 是单协调进程（model-contract SPEC「资格、共同提交与实际发送」）。

## 准备资源与校准租约

`createModelPreparationResources(options)` 实现共同 [`ModelPreparationResources`](../model-contract/SPEC.md#档案和准备提供者的组合协议)。构造声明归 [preparation/resources.ts](src/preparation/resources.ts)。`options.commands` 只用 `dispatches`；`options.bindings` 是结构化端口，pi 家族贡献（`PiFamilyContributions`）直接满足它，本包不导入 pi-ai-transport；`options.supplierOf` 为每个档案供应商给出带凭据引用的 `Supplier`，与请求准备使用同一推导；`options.maxCitedCalls` 是一份 lineage 最多引用的调用数，来自配置，没有包默认值。`maxCitedCalls` 不是正安全整数时构造抛 `RangeError`。

取得准备租约时，在第一次异步获取家族绑定前复制完整 ModelProfile；后续供应商枚举始终读取该快照，调用方修改原档案不能省掉供应商。访问主体保持原拥有者提供的对象身份，不复制或序列化泛型主体。

`acquire(access & { profile, lineage? })` 按下列顺序执行：

1. 解析 lineage。以下情形返回 `invalid`：
   - lineage 本身不是对象：`lineage`，`shape`。
   - `sources` 不是数组，或某个条目不是对象：`lineage.sources`，`shape`。`sources: null` 也是畸形输入。只有 `undefined` 表示 `sources` 缺席。
   - `continues` 不是合格的调用身份：`lineage.continues`，`identity`。
   - 条目的 `message` 缺失、不是字符串或不是合格的消息身份：`lineage.sources`，`message-identity`。条目的 `call` 不是合格的调用身份：`lineage.sources`，`call-identity`。
   - 同一消息有两个来源：`lineage.sources`，`duplicate-message`。
   - 不同调用数超过 `maxCitedCalls`：`lineage`，`too-many-calls`。

   租约在边界逐项检查形状。畸形输入返回 `invalid`，不抛出。没有 lineage，或两项都为空，视为没有 lineage。

2. 按档案供应商的次序逐个取得绑定。以下情形返回失败，并释放已取得的绑定，不形成更窄的档案：
   - `supplierOf` 失败：原样返回。
   - 返回的供应商改变了采用、接收方或型号：`invalid`（`supplier`，`route-mismatch`）。
   - 绑定取得失败：返回该失败。
3. 有 lineage 时，以取得时的 `principal` 与 `tenant` 经 `commands.dispatches` 读取每个被引用调用一次。`denied` 与 `invalid` 折叠为无此事实；`unavailable` 等其他失败记为事实不可用。读取抛出异常时先释放绑定再抛出。取得不因读取失败而失败。

租约的 `bindings` 与档案供应商同序。没有 lineage 时，`meter` 给家族计量器包一层：释放前，`basis` 与 `measure` 的结果与家族计量器逐字节相同。有 lineage 时，`meter.measure` 判决事实并等待家族的 `measureCalibrated`。每个原因的条件归 model-contract 的[锚点不命中的原因](../model-contract/SPEC.md#锚点不命中的原因)与[来源扣留的原因](../model-contract/SPEC.md#来源扣留的原因)。本包只规定判决顺序：

- 锚点按下列顺序核对，第一个成立的原因决定结果：
  1. `not-declared`
  2. `call-unreadable`
  3. `facts-unavailable`
  4. `ambiguous-dispatch`
  5. `usage-unknown`，X 没有带账目的发出
  6. `messages-unrecorded`
  7. `supplier-changed`
  8. `representation-changed`
  9. `not-a-prefix`
  10. `usage-unknown`，`input`、`cache-read`、`cache-write` 中有未知项
  11. `units-missing`

  全部不成立时，锚点为 X 的三项之和与它的消息序列。锚点只依赖这三项已知，账目其他项的矛盾不影响锚点。`continuation-shrank` 由家族计量器给出。

  延续锚点还以被延续那次发出的 `resent` 为空为前提。今天的[发送边界](#产品发送边界)总以空的 `resent` 调用 prepare，没有 `replay-rejected` 后的再发，所以这个前提总成立，租约不核对它。以后实现再发时，发出记录须保存 `resent`。`resent` 非空时，锚点不命中。

- 来源按消息判决。lineage 没有为带推理续接状态部件的 assistant 消息给出来源时，结果为 `source-missing`。有声明来源的消息按下列顺序核对，第一个成立的原因决定结果，全部不成立时得到 O：
  1. `source-unreadable`
  2. `source-unavailable`
  3. `ambiguous-dispatch`
  4. `output-unknown`，来源调用没有带账目的发出
  5. `supplier-changed`
  6. `output-unknown`，账目的 `output` 未知
  7. `reasoning-exceeds-output`

  为请求之外的消息声明的来源被丢弃。本包不核对来源确实产生了该消息，这是请求组装方的事实。

- 判决写进 `RequestBudget.calibration`：锚点不命中时写本包的原因；命中时沿用家族报告的 `hit` 或 `continuation-shrank`。校准值只含数字与原因，不含访问依据、租户或调用身份。
- 租约交出锚点、而家族计量器的成功结果没有报告锚点判决时，家族违反了 `CalibratedInputMeter` 契约。租约抛出 `TypeError`，消息写明供应商采用，不把缺失的判决当作命中。

`release` 同步拒绝新计量并中止 acquire 传给家族的原 controller。它等待所有在途计量结清，再释放每个绑定一次。异步结果返回时再次核对释放状态，释放后不交出迟到成功。重复调用返回同一结果；某个绑定的释放拒绝时结果为 `unavailable`，`dependency` 为该供应商采用的 `owner`，诊断为 `release-failed`。释放后，租约交出的每个计量器的 `measure` 都返回 `unavailable`（`dependency` 为 `model-preparation`，诊断为 `preparation-lease-released`），有无 lineage 相同。`release` 同时清空事实视图。事实视图不跨租约保留。已取得租约仍可跨 preparation 插件卸载存活；插件卸载不是宿主关闭。当前没有把 Agent run stop 接到 preparation signal。

## 首次执行记录与私有通道

`./commands` 的 `createModelInitialRun` 创建运行级首次记录，`createModelInitialExecution` 把它与同一个命令核心组合。形状归 [initial.ts](src/commands/initial.ts)。核心与确认桥必须采用同一个工厂原值；结构克隆、反射取得的构造器或同形对象不能建立可用记录。登记、确认和 gate 校验由运行时私有端口保护，不以 TypeScript 不导出充当权限边界。

首次记录只来自本运行内真实的新 `admit`。核心在既有核验通过后、提交前同步预留 `admission-pending`，保存原 tenant/call/admission 和输入指纹。确认桥在底层 `run` 最终成功后，核对最后一轮真实 admit 绑定，才转为 `admitted`，并且先于公共观察发布。旧调用的重放或查询只能认回已有 pending，不能新建首次资格。`commit-unknown` 保留原 pending，后续以原 operation 和指纹认回；异常或确认处理故障使受影响侧口不可用，不把未确认写当作成功。

`maxRecords`、`maxBindings`、`maxCallsPerBinding` 都须显式给出正安全整数。pending、admitted 和 bound 都占记录名额，记录保留至运行结束。关闭 channel 只归还活绑定名额，不删除首次来源，也不把已绑定调用交给后继。同一活 instance 再次 `openHost` 返回 `invalid(instance, already-bound)`。记录、绑定或每绑定调用额度满时，分别返回 `record-capacity`、`binding-capacity` 或 `call-capacity` 的 `model-initial-execution` 不可用。

`readAcceptance` 在读前与同核心的 scoped read 内各核一次 `checkOriginRead`，只返回 tenant、call、initiator、consumer 四字段的窄投影。settled 或请求正文已释放不妨碍读取。未知保留 `commit-unknown`，缺调用与跨租户仍沿既有不可区分规则。它不签发 ActorRef，也不授予 claim；真实主体须由入口的现有签发结果取得，来源缺席继续不可用。

每个 `openHost` 返回独立的 channel，包含绑定后的 commands、可选 coordinator、`prepare`、`qualifyExecution` 与 `close`。`prepare` 每次核当前 recovery 资格，读取后再次核验：

- 本地 admitted 尚未 bound 时，必须仍是原 admission、没有 execution，且请求正文仍在。同步绑定本 channel、instance、一次随机 operation 和 continuity 后才返回。
- 同一活绑定重复准备时，认回原 operation、continuity 和 instance。正文可以已释放，已确认 execution 必须仍是原代次。claim 未知时也返回原输入，不换 operation，不先授执行资格。
- 无本运行记录、另一绑定、后继或重启均不可用。不能从 SQL 的 execution 为空推断首次资格。关闭后的 channel 默认拒绝。

continuity 绑定原调用、admission、instance、operation 和证据采用，只证明本进程的首次连续性。它不构成耐久接管证明。随机失败或碰撞返回 `identity-unavailable`。claim 真正确认后才保存其 ExecutionRef。

启用 initialRun 的核心对 claim 和携 ExecutionRef 的执行写要求真实的绑定 gate。公共 `modelCommands(core)` 不授此权，复制 ExecutionRef 不能绕过。通道内仍核原 authority 的当前执行主体与持久代次，每次 CAS 重试重新核验；发送协调器也消费同一 gate，并保留最终同步围栏。`recordLateFact` 沿原协议，不借通道扩权。未启用 initialRun 的旧路径保留原权威规则。

正文释放后，原绑定的 `prepare` 仍可解析结果推送和晚到账目的主体。随后 `loadRecovery` 因材料已释放而失败，不得据此重新 claim 或再次 start。正文释放不关闭 channel。正常释放次序由入口组合者承担，具体接线见 [model-host-local](../model-host-local/SPEC.md#首次执行与公共观察接线)。本机制不提供重启恢复、后继接管、完整撤权或跨进程排除。

## 确认源与公共观察

`createModelObservationStorage` 装饰同一存储，确认接缝归 [observation.ts](src/commands/observation.ts)，观察端口与十二项配置归 [stream-types.ts](src/stream-types.ts)。只有 initialRun 而没有 observation 配置时，仍安装首次确认接缝，但不创建公共观察源。两项都缺席时保留旧路径。

每次底层调用 work 都重建本轮 pass，只捕获 scope 的调用与 operation，不复制整个租户材料。`commit` 和 `publish` 暂存不发布。底层 `run` 最终返回后，先同步完成 initial 确认，再处理公共确认源，最后返回原 Outcome；CAS 前轮的暂存不生效。未知写不发布 staged 投影，并使该调用的观察源不可用。授权失败不污染别的观察者。initial 或 observation 回调失败只封闭对应侧口并报告安全种类，诊断不含正文或原异常，report 自身抛错也不覆盖原结果。底层抛错则不发布，并原样重新抛出。

`current` 与 `observe` 消费同一确认记录，其 state 与 snapshot 内的 state 共用冻结值。冷读使用同一个装饰后存储，核观察者自己的 facts 或 observe 资格、原 consumer 与 admission，不依赖 `loadRecovery` 或宿主拼接状态。异步读返回后重新核当前资格和来源。无公共投影时可以返回已确认 state 与 `current: null`；真实来源不可用必须返回失败，不能伪装成功空值。

记录忽略较旧 revision，同版本已识别的元数据冲突使本调用不可用。同一 admission/execution/dispatch/revision/OutputCursor 的重复确认不重新 diff、冻结或复制 blocks，也不分配公共 cursor。同流只有 state 前进时复用冻结 blocks，产生 `blocks: []` 的 state-only delta，同时推进公共 cursor。内容更新只复制确认后的窄投影，工作量允许随保留块 B 与差分 D 增长，不承诺整条 SQL 查询为常数成本。公共流位置使用独立的规范十进制位置，不复用 OutputCursor。

正文释放后只可复用 execution、dispatch 和内容 cursor 匹配的已有 blocks，不能把清理后的空正文发布为新快照。冷源没有可复用材料时保留 state 与空 current。Publication 或 dispatch 换代先退役旧流，新代分配新 StreamRef；旧引用永不指向后继。完整 Publication 比较 tenant/call、registration、instance 和 generation。同一 source 同时只允许一个活 host 租约，host 关闭退役本代流，source 关闭则永久结束该源。

首次 `next` 才开始观察。在一个无 await 的同步段内核资格与完整引用、预留名额、固定 snapshot/cursor 并登记 watcher，所以确认更新只会落在首快照或后续队列之一。每个 iterator 有独立 FIFO 与 lastDelivered，delta 的 from 衔接真正已交付帧，队列不主动合并。每次真正交付内容或终止帧前同步重核资格、来源、Publication 与期限。当前 denied、unavailable、stale-stream 优先于 observer-closed 及已持有的普通终止。

同一 iterator 同时只允许一个 pending next。第二个 next 使第一个取得经重核的 `ended(capacity)`，之后为 done。`return` 立即清除 pending 与后续读取；abort 只结束本观察，不取消调用、ACK 或释放业务结果。host/source 关闭也终止尚在冷读的观察，迟到读不披露内容。底层 SQL I/O 仍由存储收尾，读预算保留至该 Promise 完成，不声明已取消 I/O。

十二项上限全部为显式正安全整数，不设生产默认值。`timing` 提供同一进程单调时间域与可取消等待。

| 配置                                     | 约束                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `maxSnapshotBytes`、`maxDeltaBytes`      | 完整首帧与差分帧的规范 UTF-8 JSON 字节上限 |
| `maxQueuedFrames`、`maxQueuedBytes`      | 每个 iterator 的 FIFO 帧数与逻辑字节       |
| `maxObserversPerTenant`、`maxObservers`  | 租户与全局活观察者名额                     |
| `maxPendingSourceOperations`             | 创建冷读 Promise 前取得的源读取名额        |
| `maxRetainedCalls`、`maxRetainedBytes`   | 源确认记录的数量与逻辑字节                 |
| `maxTotalBytes`                          | 源、订阅与差分 scratch 的总逻辑预算        |
| `maxQueueResidenceMs`、`checkIntervalMs` | 队列驻留期限与等待观察者的资格复查间隔     |

字节与数量等于上限允许，驻留时间等于期限即过期。计量先于分配，可提前停止，逻辑字节不等于进程 RSS。snapshot 超界或订阅准入失败交 `ended(capacity)`；delta、FIFO 或驻留超界清内容并脱订阅，只留 `gap(buffer, after=lastDelivered)`。新订阅不驱逐旧订阅。冷读满额时 current 返回 unavailable，observe 交 capacity。源无法保留真实新状态时使本调用 unavailable，不沿用旧状态冒充 current。无 watcher 的记录可按 LRU 退役，不释放业务保管材料。终止与 return 解除计时器、监听器和各自预留。

持续验证入口为 [首次执行](tests/initial-execution.spec.ts)、[确认顺序](tests/confirmation-order.spec.ts)、[确认源](tests/stream-source.spec.ts)、[观察 FIFO](tests/stream-observation.spec.ts)与[预算](tests/stream-bounds.spec.ts)。这些资源不证明应用发行接线、生产参数、真实主体签发或跨进程恢复已经闭合。

## 产品发送边界

`createModelSendBoundary` 实现共同 `ModelSendBoundary`。实际构造声明归 [send/types.ts](src/send/types.ts)，共同物化与发送行为归 [model-contract](../model-contract/SPEC.md#物化回执的提交与发送)。本构造独立于 runtime 五依赖和八配置。runtime driver 作为受信消费者接入同一 sender。边界以空的 `resent` 调用传输的 prepare；`replay-rejected` 后的再发由重试决定填入这项，尚未实现。

边界只固定 SendDemand 的声明字段，已铸造 tenant 与不透明 principal 保留身份引用。当前访问与固定业务绑定先于本地尝试查询。原尝试已可能发送时，后续取消或代次变化不把它降级为未发；权威已有发送记录同样先被识别。首次发送的执行/控制资格另在取得资源前核验，最终同步围栏仍重核。产品持有物化资源、原写输入和一次事实交接；Commands 持有调用事实；具体同步协调者持有全部 sender 共用的当前资格与 dispatch 认领。物化回执、开窗确认后才进入最终同步围栏。协调者在同一排他次序核原主体、发起者、工作资格、代次、控制、固定请求、接收方及来源，先占用一次尝试，再调用产品闭包解析凭据和立即 start。重入拒绝，重复闭包调用复用首次结果。来源不可用、资格撤销、scope 错配和无 value 均不发送。

factory 的精确采用、官方身份、当前无 tenant 绑定及查询 ID 来自受信登记；Model 不生成凭据 ID。产品发送边界在同步围栏内只调用 `resolveFor`，传入原 `access`、凭据 ID、用途及档案事实。缺少该方法或已登记的 `ModelSendSource.credential` 事实时，返回 `unavailable`，依赖为 `model-credential`，诊断为 `qualified-path-missing`，不回退旧 `resolve`。

`official` 取自已登记的 `ModelSendSource.credential`。登记来源的 `kind` 为 `factory` 时，显式选择 tenant 凭据也保留该来源的 `official`；登记来源的 `kind` 为 `tenant` 时才取 false。tenant 选择只解析原 ID，且要求返回 tenant 范围的值，不接受 factory 范围的结果。旧 `resolve` 与 `SendFace` 路径的行为保留，不参与产品发送边界。

absent、unreadable、unavailable 保留不同的 model-credential 安全诊断；denied 保持拒绝。

凭据缺失与读不出不会自己恢复，所以产品发送边界把它们当作本次调用的确定失败，不让调用方等待：

1. 边界记下 not-sent 发送记录。
2. 边界在本尝试开的接收窗口里写一条终止事实：`{ kind: 'failed', fault: { cause: 'credential', diagnostic, upstreamStatus: null } }`。absent 的 `diagnostic` 是 `credential-missing`，unreadable 的是 `credential-unreadable`。没有字节发往上游，所以 `upstreamStatus` 为 null。
3. 边界释放资源，返回 not-started，`failure` 仍是 `unavailable`，依赖为 `model-credential`，诊断同上。
4. driver 读到这条 not-sent 发送记录带有失败终止，就用它结算本次调用。调用进入 settled，终止为上述失败。

终止写未确认时，边界返回 unknown，诊断为 `credential-terminal-unconfirmed`，并保留原写。重试先查询原 operation，再重放同一写，不生成新的 operation。

denied 与 unavailable 不写终止：denied 以确定拒绝结束、不结算；unavailable 的出口见「发送边界的出口」的已知限制。解析、start、事实读取及释放的异常正文不进入业务诊断。秘密只交给原资源的同步私有槽。资源提供者须核物化对象归属，清除临时秘密，并发送回执对应内容。

每个原写在首次提交前固定完整参数，operation 使用具有128位熵的随机值生成。未确认写先 query 原 operation，确定后重放原方法和参数，不改 expected、dispatch 或 payload。查询拒绝、异常或仍未知不证明原写未提交，原尝试、资源和容量继续保留。已确认 committed 但原方法暂不能返回回执时，同样保留原责任；只有权威未提交且原写明确拒绝才可按未提交结束。物化或窗口未知保留资源但零 start。已明确未发的资格拒绝不会因原 not-sent 写的已知冲突改称未知发送；未确认记录仍保留原责任。已经可能 start 的异常或记录冲突始终 unknown，不改报未发。

start 返回事实而记录未确认时，原流和资源由 sender 有界保留，不预取、不 return、不 close。认回原写后只交出一次原 window 和原流，不再次 start。并发重入返回 busy unknown，异输入拒绝；同一后端的独立 sender 由共享认领阻止第二次 start。未确认、活资源及释放失败均保留容量，满时在新资源取得前拒绝；没有过期遗忘。后续重试须由既有协议产生新的 dispatch。

交出 facts 后只允许一个 iterator，推进串行。耗尽、return、throw 或读取异常均按 materialized、prepared、resource 逆序尝试全部释放，各钩子最多一次。失败抛安全 resource-release-failed，保持可观察且继续占位。signal 只向原传输请求停止，sender 不在 abort 回调关闭原事实流。正常释放才删除本地尝试；后续 send 仍读权威 dispatch，不会再次 start。关闭、跨进程恢复、生产有界调度及完整控制排空不在此构造的实现范围。

内存测试的来源登记以 [commands/types.ts](src/commands/types.ts) 的 `ModelSendSource` 为准，同步围栏以 [testing/state.ts](src/testing/state.ts) 为准。SQL 实现的协调器（`@omne-harness/model-storage-sql` 的 `createSendMirror`）只有一处例外：主体获准、调用不在本进程镜像时，它答 `unavailable`（`qualification-unavailable`），内存实现答 `not-found`；主体未获准时两者都答 `denied`。缺 sending 配置没有默认成功凭据。脚本仅模拟外部传输；产品不得依赖 testing。共同 started 结果交出已确认的原 window 和唯一 facts 流。消费者使用 result.window 保存该流，Commands 仍核原 tenant、call、execution、dispatch 与 window 绑定。window 不授予访问权。driver 已接入该唯一事实消费者，按原窗口批量确认后发布。

### 传输准备的明确拒绝

prepare 或 materialize 返回结构化 denied、invalid、unsupported 时，发送边界分别记录 excluded、input-rejected、modality。此路径没有 start，也不生成物化回执。边界保留原拒绝，依次确认原接收窗口、not-sent 和安全的 ended/failed 事实，再由 driver 沿原调用结算。诊断只使用 transport-denied、transport-invalid、transport-unsupported，不保存外部失败正文。

窗口、发送记录或终止写丢回执时，边界保留原 operation、expected 和完整参数。下一次 send 先认回原写，不重做 prepare/materialize。取得版本的读取失败也保留原拒绝。写入资格失效时返回真实拒绝，不补造终态。释放失败保留尝试与容量；已保存的业务终局仍可单独结算。

Commands 以本域已确认 not-sent、无内容、原单条失败事实和其他窗口均闭合推导零内容。它不要求外域为从未启动的流伪造暂停证明。双向矛盾守护及原重试决定守护仍生效。证明和源码映射见 [零发送收尾](verification/proofs/not-sent.md)。

### 发送边界的出口

下表列出产品发送边界与 driver 的全部出口。「结局」一列说明调用方会不会无限等待：

- 「结算」：调用进入 settled。
- 「确定拒绝」：driver 以非 `unavailable` 的失败结束本次驱动。拒绝的原因归另一个拥有者，例如接管执行的实例、胜出的写或访问判定。
- 「重试」：同一驱动的下一次 drive 继续原阶段，原写只重放，不重新解析，也不再次 start。重试只消耗有界的瞬时故障，之后落到前两种结局。
- 「等待」：driver 停在 `failed`，失败为 `unavailable`，调用不结算。这是已知限制，见本表最后一组。

凭据缺失与读不出，以及上述传输准备明确拒绝，均沿带 fault 的确定拒绝路径。下表的 credential 行以凭据为例，传输准备采用上一节的 cause：

| 步骤与存储答复 | 边界答复 | driver | 结局 |
| --- | --- | --- | --- |
| not-sent 记录确认，终止写确认 | not-started，`unavailable`（`credential-missing` 或 `credential-unreadable`） | 读记录，有终止，结算 | 结算，`cause: credential` |
| 终止写确认后释放失败 | 同上，尝试与容量保留 | 读记录，有终止，结算 | 结算 |
| not-sent 记录或终止写未确认（已落地或未落地） | unknown，原写保留 | 下一次 drive 重放同一 operation | 重试 |
| not-sent 记录或终止写被明确拒绝（`stale-instance`、`conflict`、`denied`） | not-started，失败就是这次拒绝 | 读记录：拒绝前已落地终止就结算，否则以该拒绝结束 | 结算或确定拒绝 |
| 明确拒绝后释放失败 | 同上，尝试与容量保留，重复 send 答 unknown `resource-release-failed` | 同上 | 结算或确定拒绝 |
| 任一情况下读记录失败或抛出 | 不适用 | 保留「按记录结算」阶段，返回读取失败，下一次 drive 重读 | 重试 |
| 结算写遇到接管 | 不适用 | 以 `stale-instance` 结束 | 确定拒绝 |

其他解析结果：

| 步骤与存储答复 | 边界答复 | driver | 结局 |
| --- | --- | --- | --- |
| value：记录确认 | started，交出原流 | 接收并按流的终止结算 | 结算 |
| value：记录未确认或被拒绝 | unknown，原流保留，不再 start | 重试原写 | 重试；执行被接管时一直是 unknown，见已知限制 |
| denied 或 scope 错配 | not-started，`denied` 或 `invalid` | 读记录，无终止，以该拒绝结束 | 确定拒绝 |

已知限制：下列出口仍让调用方等待。前三行的失败是 `unavailable`，而同一个 dispatch 已不能再发送，driver 的 `failed` 阶段也不重试。最后一行是有意的：可能已发送的调用只能等原记录。

| 出口 | 诊断 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 凭据端口答 `unavailable` 或抛出 | `credential-unavailable` |
| 当前资格不可得、取得资源前已取消、传输 prepare 或物化返回 unavailable 或抛错 | `qualification-unavailable`、`cancelled-before-prepare`、`cancelled-before-start`、`transport-prepare-failed` 等 |
| 没有写终止的拒绝之后释放失败 | `resource-release-failed` |
| 已经 start 而发送记录始终不能确认（例如执行被接管） | `send-record-unconfirmed`。可能已发送，所以不得改报未发，也不得判成 credential 失败 |

消除它们需要为每个出口选定结局，例如以哪一种 `ModelFaultCause` 结算，这会改变 Model 的调用结局，每个出口的结局登记为 D-86。确定拒绝的机制不限于凭据：fence 拒绝带上 `fault`，边界就写终止，driver 就按记录结算。

表中的凭据拒绝路径由 TLC 模型 [SendBoundary.tla](../model-contract/verification/models/SendBoundary.tla) 检查：带 fault 的确定拒绝最终结算，或者以确定拒绝结束，可能已发送的调用不判成 credential 失败，重试不写第二个终止。性质、映射与负控见 [formal-mapping.md](../model-contract/verification/models/formal-mapping.md#发送边界)。新增传输拒绝与内部零内容依据的证明范围归 [零发送收尾](verification/proofs/not-sent.md)，不以旧模型运行代替。
