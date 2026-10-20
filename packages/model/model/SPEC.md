# Model 领域实现规格

本包非 pi-ai 实现设计已接受，独立执行及凭据存在性与解析的判定已有实现，本地保管归 model-host-local，createModelRuntime 已实现仅构造壳，托管运行行为尚未实现。pi-ai 细化的采用范围见[组架构各节](../docs/architecture.md#成员与新增条件)。共同领域行为与提供者协议由 [model-contract](../model-contract/SPEC.md) 唯一维护；本页只补本实现的执行、配置及资源义务。

## 独立执行

独立函数 `executeModel` 执行一次供应商请求，不重试、不保管、不 ACK。其 signal 请求该次传输停止，返回事实仍须区分请求取消与真实停止。托管模式的观察 signal 不传给它。托管模式只有原调用的有效控制可以请求传输停止。

`executeModel` 选用 request.suppliers 的首项，仅执行一次。需要另一供应商时调用者必须形成新的明确执行，不能把此函数冒充托管 fallback。

独立调用在 start 前观察到 signal 已取消时，只返回 not-started/cancelled，不调用 start。prepare 或 materialize 的四种声明失败原样放入 not-started/rejected，不改成托管提交失败，也不抛异常代替该结果；准备或物化过程意外抛错映射为 unavailable 及安全诊断。materialize 返回后、start 前再次检查取消及当前资格，已取消则 not-started/cancelled，失权则 not-started/rejected。已取得资源始终 close。开始发送后不再允许 not-started，signal 仅请求停止；只有传输确认停止才返回 ended/interrupted，未确认且失联返回 ended/failed 的 stream-lost，不虚构停止。竞争中实际 completed 仍报告 completed。流上恰好一个终结结果，消费者主动放弃读取不代表已取得终结事实，释放时仍关闭本次资源。

本实现每次调用各返回一个原生 async generator 实例，首次 next 才准备资源。重复取得迭代器或并发 next 不重发。return 按语言队列等待正在执行的 next，不抢占提供者等待；调用者通过 signal 请求停止，不设隐式关闭时限。

本次采用的供应商和表示字段在准备等待前固定。物化回执须精确匹配这两份 Adoption 的全部字段，payloadDigest 非空且重复读取稳定；不匹配返回 invalid，读取异常返回安全 unavailable。回执不授予当前资格，提供者仍负责发送授权。

交付 ended 或已取得资源后的 not-started 之前，按源 iterator、materialized、prepared 的次序完成全部释放尝试。任一步失败仍尝试后续步骤；不关闭借入的 transport。清理失败不覆盖业务终局，原终局仍交付一次。消费者随后 next、return 或 throw 时收到固定异常 independent-cleanup-failed；若不再推进，只能保证清理已尝试，不能保证消费者已观察该异常。非终局处早退在当次推进报告清理失败。清理只执行一次，后续 done 不证明失败资源已释放。

发送准备、物化回执、同步 start 与两级资源关闭的完整协议见 [传输协议](../model-contract/SPEC.md#342-独立执行与提供者操作)。其余托管行为直接遵循该规格，不另写状态机。

<a id="调用和各次真实发出"></a>调用受理与各次真实发出的事实归 model-contract 的[调用和各次真实发出](../model-contract/SPEC.md#调用和各次真实发出)。

## 工厂与配置

createModelRuntime 的构造形状以 [runtime.ts](src/runtime.ts) 为唯一声明，[公开入口](docs/public-api.md) 提供使用导航。outputBatchBytes、observerBufferBytes、resultPageTargetBytes、readIdleMs 为正整数；outputBatchDelayMs、retryBackoffMs、cleanupRetryMs 为非负整数。一次已取得 read 沿原期限，不因配置换代缩短。

构造所需 Commands、send、retry、instances 和 clock 必须显式取得；缺失时不得装成可用实例。工厂返回 ModelRuntimeProvider，普通消费者只取得其 runtime；恢复和 quiesce 的权限及原身份协议沿共同规格。

| 构造依赖 | 取得与义务 | 缺席、换代和释放 |
| --- | --- | --- |
| commands | 必需构造注入。提供者拥有本域存储、当前资格及提交组合 | 不可用时不能认成功；替换先排除旧写者并接续原操作，不靠清空缓存恢复 |
| send | 必需构造注入。内部组合当前授权、[#279](https://github.com/nemori-ai/omne-harness-lite/issues/279) 凭据、真实传输和发送围栏 | 缺席不发；在途连接的资源与未知归旧传输负责，新边界不得复制旧 dispatch |
| retry | 必需策略实现；原 request 的采用和允许范围约束每次决定 | 不可用则不再试并以 policy-unavailable 收场；替换不能重做已持久的决定 |
| instances | 必需实例宿主。登记能力只供 Model 提供者，目录供消费者 | 宿主退出撤路由；事实/保管不消失。后继先接管原责任再发布新实例 |
| clock | 必需时钟/等待能力；时间值为 UTC instant | 时钟不可用不虚构超时或许可；取消等待不取消原调用 |
| configuration | 构造时校验的纯数据，原实例固定采用 | 数值为有限整数，容量/页/空闲期限须正；延迟/退避可为零。替换只影响新实例，恢复读取已固定的在途期限 |

retryBackoffMs 是本实现的默认退避；次数、接收方及首内容边界沿共同重试协议。

配置不设未经测量的生产默认值。发行装配必须显式提供全部字段并注明来源，策略默认仍严格采用 SPEC 的供应商顺序与次数规则。缺配置是加载失败，不是隐式无界队列。输出队列满时背压，观察者落后时结束该观察并允许快照重连；不能因慢观察者无限保存重复快照。resultPageTargetBytes 是完整结果项的组页目标，超目标单项独页，不分割、截断或转换类型。整个 ResultPage 的规范 UTF-8 JSON 字节数不超过原容量 C，消费者须能接收接近 C 的单页。已有媒体引用保持原资格，不提供任意 text/tool_call/partial 附件化协议。

outputBatchBytes 与 outputBatchDelayMs 控制持久输出批次。未确认批次不向观察者发布，首内容窗口与游标仍沿[共同协议](../model-contract/SPEC.md#展示诊断与实施证据)。

## 实现与验证

[内部架构](docs/architecture.md)、[流程](docs/flows.md)和[构造对象](docs/object-model.md)描述具体协调。框架目录定义归 model-cordis-contract；宿主装配设计暂在[本成员装配页](docs/cordis.md)，model-host-local 目前只承载本地凭据保管。判定测试覆盖五种解析结果、租户隔离与关闭；持久化、轮换、文件故障与 Cordis 关闭由 [model-host-local](../model-host-local/SPEC.md) 的测试覆盖。它们不证明托管调用、结果保管、恢复或取消已经实现。

## 构造与关闭的可观察行为

本实现的三个独立能力工厂只组合算法，不启动运行。createModelRuntime 返回带driver的 ModelRuntimeProvider，普通runtime不暴露driver。装配者须完成显式host绑定，才能公开受理；绑定失败不得返回“可用runtime”。既有替代提供者无需复制这些工厂，但必须符合领域协议。

调用已经持久受理而schedule失败时，返回原受理事实，不伪装未受理。提供者记录唤醒失败并由恢复扫描续排。query和recover不得为了返回可用状态创建第二次逻辑调用。quiesce停止新的业务受理，仍允许已受理工作调度，不撤销原责任；现有查询、控制、结果保管及清理按可用依赖继续。

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

| 结果 | 含义 | 发送端行为 |
| --- | --- | --- |
| `value` | 当前资格允许 | 发出，并记下本次采用的值。`scope` 为 `tenant` 或 `factory`。 |
| `absent` | 没有这份凭据 | 不发送。 |
| `unreadable` | 引用在，值暂时读不出 | 不发送。 |
| `denied` | 跨租户、用途不符、无发送资格、已撤销或保管已关闭 | 不发送。 |
| `unavailable` | 保管或存储暂时不能判断 | 不发送，也不得报成 `absent`。 |

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

本包拥有存在性与解析的判定：`judgeGate`（不依赖绑定的拒绝：租户未铸造、保管已关闭、用途不符、发送无资格；保管实现在读存储之前先问它，所以存储不可读时仍拒绝本来就不会服务的请求）、`judgePresence` 与 `judgeResolution` 只读调用者传入的一份状态快照（`CustodianState`：关闭标志、工厂秘密、绑定列表，绑定寿命为 `active`、`revoked` 或 `unreadable`），不读文件，不持有状态，也不依赖任何保管实现。上文五种结果与存在性规则就是它们的行为。

保管归 [model-host-local](../model-host-local/SPEC.md)：保管库文件、文件锁、刷新、发布确认、关闭，以及装载保管库的 Cordis 插件。保管实现自己构造状态快照并调用判定，本包不依赖它。Cordis 服务键 `modelCredential` 的定义归 model-cordis-contract。独立调用可以不启动 Cordis，直接用判定函数配合任何保管实现；各入口看到的五种结果相同。

判定假设快照里的租户值由同一 legal-identity 实例铸造，保管实现须在其边界重新铸造租户值。查询里的租户同样须是铸造出来的值：未经铸造的租户（例如复制出的对象）使 `judgePresence` 与 `judgeResolution` 都返回 `denied`，先于其他判定，不会被当作没有任何绑定的租户而得到工厂秘密。反过来，快照里若有绑定的租户未经铸造，判定无法证明查询租户没有绑定，此时本应给出工厂秘密的解析返回 `denied`；其余结果不变，这样的绑定自己不匹配任何查询。

本包导出根入口和独立 testing 子路径，包清单不声明 Cordis、proper-lockfile 与 model-cordis-contract。

## 当前构造支持与本地模拟

根 createModelRuntime 校验五依赖的方法形状及全部七配置字段。缺项或错误类型抛 TypeError，数值非有限整数或超界抛 RangeError。构造不调用依赖，不绑定、排队或启动网络。当前十二个托管操作明确返回 unavailable(model-runtime, managed-runtime-not-implemented)，后续运行实现沿同一工厂补齐。本阶段不执行上文的托管业务流程。

独立 testing 入口的内存 Commands 实现共同协议的本地状态转换。每个公开方法同步形成候选，只有一个提交点发布调用事实与 operation 绑定。当前资格及执行通道在认回前重核。请求、owner 采用和 ActorRef 固定，P 不保存。待办和总预留从原责任派生，容量为整个装配共用的有限上界。

发送边界在准备前复制 execution、request、supplier、consumer 和 initiator 的值，后续异步步骤、计数和关闭使用同一份需求。合法 TenantId 与不透明 P 保留原身份，AbortSignal 保留原取消语义。调用者改写外层字段或嵌套值不改变本次发送；实际 start 仍重核当前资格、代次与控制。请求参数的统一校验覆盖 parameters、parameterAdoptions.applied 和显式 origin.requested。已知非法参数沿原结果通道拒绝，不进入摘要或消耗 unknown 注入；已有 operation 的异输入仍按原绑定冲突。retry 的决定认回也核对原请求，不重复消费决定。请求拥有的 suppliers、parameters、system、messages、tools、parameterAdoptions 及三个参数承载位置中的 stop 都要求数组无空位，并保留各自的元素规则。合法空序列仍允许，suppliers 与 stop 保持非空要求。内部规范编码独立拒绝空位，不将其编码为合法空数组。

内存分页以 resultPageParts 限项数、resultPageTargetBytes 定目标。每页先放一个完整 ResultPart，再在项数及候选 parts 数组规范 UTF-8 JSON 字节数都允许时加入后项。对象键递归排序，数组保序，字符串按 JSON.stringify 转义，孤立代理码元不丢失。首项超目标独页，空结果有空 parts 与真实终局。页包装、next 和 Settlement 另受原容量 C 硬界。配置在构造时复制固定，读只保存固定源的必要位置与保护元数据，不缓存第二份页正文。合法 after 从真实组页起点和该读最远已返回页派生，未发出的页起点拒绝。

保存计费还包含原请求/主体/采用、输出与真实 trim/曾有内容事实、历史确认 Snapshot、原状态/账目/重试、最终有序 parts 的交付表示。实现 [pages.ts](src/testing/pages.ts) 为每个 dispatch 保留4096字节实际终局槽，逻辑终局尚未固定时另保留4096字节。逻辑终局固定后按其实际编码计费，晚到实际回执不覆盖它。另保留8192字节 Settlement、12288字节 custody、1024字节 control、首个读1024字节和最大游标页包装64字节。实际材料落入相应槽后消费预留，不重复计费。每个已接纳的 open 窗口分别保留闭合状态增长和完整确认 Snapshot，Snapshot 包含当前正文及最大修订、游标和控制额度。没有 open 窗口且逻辑终局尚未到达时，另保留一个最大合法窗口及其确认 Snapshot。每次开窗和保存都在原提交边界按剩余义务重算，首个终局不撤销其他窗口的预留。容量不足在受理、准备或合法前缀保存边界拒绝，不发布半份事实。这个额度模型不等于 JavaScript 堆占用。

本地 terminal、身份事实及证据的规范编码分别最多4096字节，Settlement 最多8192字节。超长终局在 preserve/recordLateFact/策略 stop 的首次输入边界拒绝，证据在可信返回边界拒绝。consumer owner 构造/替换时最多512 UTF-8字节，避免受理无法形成有限 ACK 证据的 owner；窗口身份规范编码最多256字节，清理诊断规范编码最多4096字节。revision、cursor 和读取位置不超过 Number.MAX_SAFE_INTEGER，十进制游标最多16字节，实际铸造同时校验。UUIDv4 结果/读取身份和 SHA-256 摘要使用固定文本形状。生产 resultPageTargetBytes 当前只做构造校验，测试算法不证明生产运行。

operation 长期只保存 SHA-256 输入指纹、方法、调用、原提交修订与小回执。规范化只选协议字段，不包含 P。摘要相同按本地测试编码的碰撞假设认回，不声明数学无碰撞或跨版本持久恢复。ACK 后清理核活动读、未决操作、接收窗口及释放失败，释放后删除请求、输出、历史快照及无用引用。完全释放的调用不再参与恢复扫描，loadRecovery 返回 invalid(call, recovery-material-released)。晚到账目仍可更新最小事实。

控制器可按原身份注入两种 commit-unknown。applied 已完整提交，not-applied 只绑定原身份而无业务效果。揭示只将前者变 committed、后者变 rolled-back 或 not-committed。前置拒绝不消费计划，未知期间异输入冲突。query 的本地 not-committed 不构成 Storage 排除证明。

该入口只证明内存装配。它不提供生产耐久、跨重启恢复、真实旧发送者排除、资格共同事务、厂商网络或可靠消费保证。
