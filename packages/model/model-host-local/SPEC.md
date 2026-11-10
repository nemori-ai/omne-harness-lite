# @omne-harness/model-host-local 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包承载四项能力：Model 凭据端口（读取设置域秘密保管的 `createSecretCredentialPort`，及以 `modelCredential` 提供端口的 `serveModelCredential`）；本地发送路径（生产发送资源 `createPiSendResources` 与本地 Model 装配 `assembleLocalModel`），装配同时接入 model 的计量准备资源；单机宿主插件（实例目录、转换目录、宿主驱动、运行门面 `modelRuntime` 与结果推送、请求准备及其计量租约，以及发送阶段）；以及官方档案读取（`ModelProfilesLocalPlugin`，来源构造 `createOfficialProfileSource` 不出本包公开入口）。恢复扫描、重试与目录阶段插件不在本包当前范围，没有实现也不由本文件承诺。

发送资源满足 model 的 `SendResources` 端口，端口形状与发送边界的行为归 [model 的 SPEC](../model/SPEC.md)。传输、家族贡献、网络资源与路由的形状和行为归 [pi-ai-transport](../pi-ai-transport/SPEC.md)。秘密不进入请求、发出记录、失败、扩展或遥测的要求归 [model-contract](../model-contract/SPEC.md)。

凭据层、失败、`CredentialPort` 以及选层与判读两条规则归 [model-contract](../model-contract/SPEC.md#342-凭据引用与解析端口)。`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/SPEC.md)。秘密保管的两个端口归 settings，保管库文件、文件锁、原子发布与读分类归 [settings-local 的秘密保管](../../assets/settings-local/SPEC.md#secret-custody)。本包只读秘密：按供应商知道它声明的凭据项、发行是否持有它，以及装配给出的绑定键。目标归属见[组架构](../docs/architecture.md#凭据的现有装配边界)。

## 结果与不变量

### 凭据端口

`createSecretCredentialPort({ custody, providers })` 返回 `CredentialPort`。`custody` 是设置域秘密保管的读面（`describe`）与使用面（`use`），端口不写。`providers` 按供应商名给出 `CredentialProviderSource`：供应商正文声明的凭据项、发行是否持有该供应商，以及一项在一个层的绑定键 `keyOf(scope, item)`。绑定键的形状由装配决定，本包不定义。

- `layerOf` 按 model-contract 的 `selectCredentialLayer` 选层。它先读本租户层每一项的状态；只有本租户层一项都没有、档案是官方档案、且发行持有该供应商时，才读官方层。本租户层持有任一项时，官方层读不读得出都不影响结果。
- `resolve` 只读请求固定的那一层。它按 `readCredentialLayer` 判读该层；全部项可用时，逐项经使用面取秘密，返回项到秘密的映射。层为 `none` 时，只有供应商没有凭据项才成功。层为 `official` 而发行不持有该供应商时，返回 `denied`。
- 未知的供应商、用途不是 `model-send` 时，两个操作返回 `denied`。保管答 `denied` 或 `unavailable` 时原样返回。读面看到某项在、使用面却不再给出它时（两次读之间绑定变了），返回 `unavailable`。
- 每次调用都重读保管，不缓存。轮换、撤销与清除在下一次调用时可见。
- 租户只取 `access.tenant`。只有受信的准备与发送边界注入端口；端口不核主体来源，也不核 `official` 的来源。

### 发送资源

`createPiSendResources({ network, families, routes, limits, materialization })` 返回生产 `SendResources` 与只读的 `materialization` 证据端口。精确形状归 [send-resources.ts](src/send-resources.ts) 与 [materialization-proof.ts](src/materialization-proof.ts)。

- 构造时，发送资源用一个空凭据槽建一个探针传输，检查配置。传输拒绝的配置（路由不是纯 `https:` 地址、限额越界、家族贡献或网络资源不合格）让构造抛出 `RangeError`。探针不发送，构造时即开始关闭，发送资源的 `close` 等待其结果。
- 每次 `acquire` 建一个新的 pi 传输。这个传输的凭据槽是本资源的私有闭包，其他资源读不到它。网络资源与家族贡献由所有资源共享。
- `acquire` 先核当前 execution，再按显式的 `materialization.maxRecords` 预留名额，之后才创建真实传输。每资源捕获原 demand，`prepare` 核原 request、supplier 与空 resent，重复准备复用原 Promise。
- 装配可给 `requestDisclosure`，同步检查固定请求是否满足本次宿主激活的披露政策。它须为无副作用的纯函数，不改请求，不读取可变政策。发送资源先核 demand 绑定，再调用它，允许后才准备 pi 传输。重复准备认回同一检查结果；新资源重新检查。省略表示独立宿主未采用上层披露政策，不表示满足任何应用的工具正文上限。
- 检查返回 `denied`、`invalid` 或 `unsupported` 时，沿 Model 既有传输拒绝协议记录 not-sent 与失败终态。不能只返回未发送而跳过耐久记录。`unavailable` 或检查抛错保留既有不可用/认回责任，不当作允许。政策在一次激活内不变化，连接重试使用已检查的相同请求；新激活检查恢复的固定请求。已经发送或发送事实未知的请求保持原发送协议，不被新政策追溯改成未发送。
- 同一 prepared 的并发 `materialize` 共享一个 Promise。底层真实成功产出处才登记完整非秘密绑定与回执；重复成功返回原对象，重复失败认回原失败，不再次物化。释放期间迟到的成功产物不登记，并关闭该产物。
- `startWithCredential(materialized, value, signal)` 先核对 `materialized` 出自本资源。不是本资源交出的物化传输让调用抛出 `SendResourceDefect`，`reason` 为 `foreign-materialization`；资源释放后调用抛出 `SendResourceDefect`，`reason` 为 `resource-released`。这两种情形都不填槽，也不发送。
- 核对通过后，资源填入凭据，同步调用 `materialized.start(signal)`，在 `finally` 中清空凭据槽。`start` 正常返回或抛出时，槽都在 `startWithCredential` 返回前清空。pi 传输在 `start` 的同步调用内读槽一次，所以凭据只在这次调用期间存在。
- `SendResourceDefect` 的消息只含原因。凭据值不得出现在事实、诊断、失败、异常消息或日志中。
- `release()` 开始时先撤销该资源的 reader 可读性并归还预留，再关闭 pi 传输并等待完成。重复调用返回同一结果，传输只关闭一次。底层关闭失败也不能继续证明已撤销的来源。
- `close()` 拒绝之后的 `acquire`，后者返回 `{ kind: 'unavailable', dependency: 'pi-send-resources', diagnostic: 'send-resources-closed' }`。`close()` 释放仍打开的资源，关闭探针，等待它们完成；第一个失败在全部完成后抛出。重复调用返回同一结果。`close()` 不关闭网络资源。

reader 只有 `prove`，没有任意 register 或 sign 操作。它每次先核当前 execution，再查真实产出记录，调用 model 的 `describeModelMaterialization` 比较原 tenant/call/execution/dispatch、请求、供应商、consumer、initiator 与完整 receipt 的描述摘要。真实回执经过两次值克隆仍可验证，只有相同形状而没有真实记录不能验证。真实记录缺失或撤除为 `model-materialization/source-unavailable`，记录存在但绑定改变为 `invalid(receipt, binding)`。同一键的其他活资源不能覆盖来源。reader 不授 start 权，start 仍要求本资源原物化对象。

记录没有 TTL，不因提交未知而遗忘。sender 的物化或开窗提交未知时保留原资源和记录，不重新物化或 start。这里的先撤 reader 顺序属于 `resource.release`；上层 sender 仍沿原协议先关闭 materialized、prepared，再释放 resource，不把它改称全局资源排空顺序。

### 本地 Model 装配

`assembleLocalModel(config)` 组合本地发送路径与计量准备资源，返回 `{ send, preparation, materialization, close }`。返回的 reader 就是所建发送资源的 reader。

- 配置项是 `credentials`（`CredentialPort`，如 `createSecretCredentialPort` 的端口）、`commands`（`ModelCommands`）、`coordinator`（`SendCoordinator`）、`families`（组合后的 `PiFamilyContributions`）、`network`（`NetworkConfig`，含代理与 TLS）、`routes`、`transportLimits`、`maxRetainedAttempts`、`materialization` 与 `preparation`。`preparation` 有两项：`maxCitedCalls`（一个 lineage 最多引用的不同调用数）与 `supplierOf`（model 的 `SupplierPort`，为档案供应商补上凭据层）。
- 本包不写任何路由地址、代理、限额或余量的默认值。OpenRouter 的地址必须由配置的 `routes` 给出。计量余量是家族配置的一部分，由调用方组合家族时给出。
- `materialization` 必须显式提供当前 execution 核验函数与正安全整数 `maxRecords`，且 `maxRecords >= maxRetainedAttempts`。不满足时在创建网络前抛出 `RangeError`，不使用夹具数值作为生产默认值。
- `transportLimits` 原样交给传输，含可选的 `connectRetry`（请求发出之前的连接失败的有界重试，见 [pi-ai-transport 的 SPEC](../pi-ai-transport/SPEC.md#请求发出之前的重试)）。本包不重试，也不加默认值：非法的 `connectRetry` 使装配抛出 `RangeError`；次数与退避由运维者层给出。
- 连接重试的可见性：`LocalModelConfig.onConnectRetry`（可选）在每次重试之前收到 `{ call, dispatch, attempt, delayMs, reason }`。发送资源为每次发送建一个传输，并把该发送的 `call` 与 `dispatch` 补进传输级的 `onConnectRetry` 事件；探针传输没有这个观察者。观察者抛出的异常被丢弃。send-stage 插件（`ModelSendStagePlugin`）把它接到 Cordis logger：每次重试写一条 `warn`，文字含调用标识、第几次重试、延迟与原因，不含 URL、凭据或请求体。重试全部失败时的 `failed` 由 Run 的失败路径记录，本插件不重复写。重试次数不进入调用记录或模型账目：`ProviderDiagnostic` 的封闭词表在 model-contract，尚无对应成员，这是已知限制。
- 装配从 `network` 创建网络资源，用它们与 `families`、`routes`、`transportLimits` 建发送资源，再用 `commands`、`coordinator`、`credentials`、发送资源与 `maxRetainedAttempts` 建 model 的发送边界 `send`。
- 装配用 model 的 `createModelPreparationResources` 建 `preparation`：绑定来源是 `families`，调用事实经同一个 `commands` 的 `dispatches` 读取，`supplierOf` 与 `maxCitedCalls` 取自 `preparation` 配置。租约的取得、读取、判决与释放归 [model 的 SPEC](../model/SPEC.md)。
- 网络、传输、发送边界或准备资源拒绝配置时（`preparation` 不是对象也算），装配抛出 `RangeError`，并关闭它已创建的网络资源。
- 发送边界在发送围栏内同步解析凭据，经 `startWithCredential` 交给本次发送的私有槽。传输交出的事实原样经发送边界交给调用方；账目事实经 model 运行时的接收路径到达 `commands.preserve`，由 `commands` 补全、去重与替换修订。
- 生产代码不导入任何 `testing` 模块。`commands` 与 `coordinator` 由调用方注入；内存版 `ModelCommands` 只用于装配测试，不是生产保管。

### 宿主插件

宿主与目录插件从 `./cordis` 导出。名称、注入键与责任以 [model 的装配设计](../model/docs/cordis.md#单机提供者的插件划分)为准，本包实现它。

- `ModelInstancesLocalPlugin` 与 `ModelConvertersLocalPlugin` 分别继承契约包的目录服务，静态注入 `modelPublicationAuthority` 与 `modelConverterAuthority`。权威缺席时 fiber 停在等待，不发布服务。权威换代或撤除时 Cordis 连同目录一起卸载再装载，后继目录从空开始，旧目录登记的 handle 不由它服务。非解析器租户的 `connect` 返回 `invalid`，字段为 `tenant`。
- 宿主部分由 `createModelRuntimeLocalPlugin(options)` 造出的类装载，静态注入 `modelCommands`、`modelClock`、`modelHostAuthority`，发布 `modelInstanceHost`；提供者带 `runtime` 时同时发布 `modelRuntime`，见[运行门面与结果推送](#运行门面与结果推送)。配置是 `concurrencyLimit`、`wakeCapacity`、`scanBatchSize` 与 `scanIntervalMs`，四项必需，正整数（`scanIntervalMs` 为非负整数），其余取值让加载失败，不取默认值。宿主本身不用 `scanBatchSize` 与 `scanIntervalMs`。结果推送的启动扫描用 `scanBatchSize` 作页长，见[运行门面与结果推送](#运行门面与结果推送)。`scanIntervalMs` 留给周期恢复扫描，目前没有消费者。
- `bind` 是插件与本域执行宿主之间的装配操作，不在服务面上。同一宿主只认一个 driver：同一对象重复绑定认回原 binding，其他对象返回 `conflict`，已关闭的宿主拒绝新绑定。未绑定或已关闭时 `schedule` 返回 `unavailable`。
- `schedule` 只置唤醒位：同一 tenant/call 已有位时不再入队；等待中的不同调用最多 `wakeCapacity` 个，满了返回 `unavailable`、诊断 `queue-full`，不为它建 Promise。最多 `concurrencyLimit` 个 drive 同时运行，由宿主自己的闭包启动，不挂在调用方 fiber 上。一个正在运行的调用被再次唤醒时保留其位，drive 交还后重跑一次。成功只表示本地唤醒被接受，不是耐久入队。
- drive 输入由 `modelHostAuthority.resolve` 取得。它答失败时（例如取不到旧进程终止证据）宿主不驱动该调用，报告一条诊断；原待办仍在 `ModelCommands` 里，查询与保管由别的服务继续，宿主不把它们算作完成。
- `publish` 只接受当前绑定的代次：同一发布认回原回执，旧代次返回 `stale-instance` 且不夺回路由，较晚代次取代旧路由。`withdraw` 只撤除登记匹配的发布。`directory.connect` 先经装配给的 `qualifyObservation` 核当前观察资格，失败（含 `denied`）原样返回，命中路由不当作授权。
- 有序关闭是一个流程：先 quiesce（`provider.quiesce`，拒绝或抛出只报告），再停派发、发停止信号并等待每个 drive 交还，最后撤发布服务的贡献（Cordis 撤除子插件）。未派发的唤醒明确留给后继，计数写进诊断，不报告为完成。shutdown 不抛出：它之后的撤除若被跳过，服务就撤不掉。
- 发布服务的子插件在 bind 之后、同一个 `try` 里创建。启动窗口里 fiber 被卸载、子插件创建失败时，已绑定的宿主关闭，此后 `schedule` 返回 `unavailable`、诊断 `host-closed`，服务不发布。

### 首次执行与公共观察接线

采用 [model 首次记录与确认源](../model/SPEC.md#首次执行记录与私有通道)时，入口运行级组合者持有真实 initialRun，并从同一次 records 激活取得 initial 与 observation 配对。入口只开一个 channel，宿主和发送阶段的 `executionChannel` getter 须返回这同一个对象。两边每激活期各捕获一次，getter 后来变化不迁移旧闭包。宿主的 provider、runtime 命令包装和发送阶段分别使用该 channel 的 commands；发送阶段也使用该 channel 的 coordinator 和 qualifyExecution。声明 channel 而取得失败时装载失败，不回落公共命令。未配置 getter 的旧路径保留。

宿主的 `observation: { commands, source }` 必须来自同次 records 激活。装载时在包装运行命令之前，将 commands 与 `Reflect.get(ctx.modelCommands, symbols.original)` 比较。这里采用官方 Cordis 4.0.4 的公开原体标记，不能直接比较每次产生的代理。错 pair 在取得观察租约之前失败，不发布观察服务；配对对象、channel 和 source 留在闭包里。

source 的 `openHost` 成功后，宿主在发布路由的同一同步段先 attach 真实 Publication，再更新路由。withdraw 只有 tenant/call、registration、instance、generation 全匹配才 retire 和删除，旧 withdraw 不影响后继。尚无 snapshot 时旧 handle 路由可以存在，而公共 current 仍为空。

`createModelStreamLocalPlugin({ source })` 以两个薄 Service 子类转发该租约的 current 与 observe。宿主把它们和 runtime 放进同一个 `model-runtime-local-contribution` 子 fiber，在 bind 成功后发布现有 `modelStreamReferences` 与 `modelStreamObservation` 键，不新增键。宿主关闭开始即同步关闭本代观察租约，退役引用并阻止挂起读取披露内容，再等 drive 与推送收尾。关闭宿主租约不永久关闭 records 所有的 source。

发送阶段成功装配后通过 `installMaterialization(reader)` 把真实 reader 交给入口证据适配器，返回的撤除函数由发送阶段持有。安装失败撤回凭据端口并关闭已建路径。退出先撤凭据和 reader，再等待 local.close；reader 撤除失败只报告安全诊断，仍继续关闭发送路径。

配置 `executionChannel` 时必须同时给宿主 `releaseExecution: () => Promise<void>`，缺失则装载失败。正常退出先关闭观察、quiesce、停止派发并等待 drive 交还、停止结果推送，然后 await 此回调。入口回调须先 dispose 自己捕获的真实发送子 fiber，等发送资源关闭，再关闭 channel，期间保持 commands 父 fiber 存活。HOST 在 finally 幂等关闭捕获的 channel，回调失败只输出安全诊断，不宣称资源已成功释放。该回调的等待不设隐式超时。

这是入口运行级组合保证，单个宿主 fiber 或 Cordis 的多个独立 effect 不自动保证跨 fiber 次序。异常依赖撤除与入口失效时的立即撤权仍由入口绑定拥有者承担。正文释放不撤 channel，以便原绑定继续处理晚账。`createConfiguredModelRuntimeLocalPlugin` 原样转发 channel、releaseExecution 和 observation 对象选项。

本成员没有新增生产 ActorRef 映射、SQL 接管表或执行的重启恢复。重启后只有结果推送由启动扫描接续。完整撤权、E7 与跨进程保证仍未闭合。真实签发来源缺失时保持 unavailable。ACK 取决于冻结 owner 的证据适配器：适配器答 `unavailable` 时推送保留 saved 的结果与原 ACK operation，不释放份额，下一次唤醒以同一 operation 再交接；发行的 Agent owner 适配器按耐久接收记录核验，见[应用的 Model 行页](../../../apps/harness-server/docs/rows/model-release.md)。发行接线与跨装配行的相等约束归应用拥有者，成员支持不表示发行已经安装。验证入口为 [plugins-host.spec.ts](tests/plugins-host.spec.ts)、[send-stage.spec.ts](tests/send-stage.spec.ts)与[materialization-proof.spec.ts](tests/materialization-proof.spec.ts)。

### 运行门面与结果推送

运行门面与结果推送是 `ModelRuntimeLocalPlugin` 的运行部分，在 [src/plugins/runtime.ts](src/plugins/runtime.ts)。协议归 model-contract 的[结果推送与保存](../model-contract/SPEC.md#结果推送与保存)与 [ACK 的前提与效果](../model-contract/SPEC.md#ack-的前提与效果)，登记规则归 model-cordis-contract 的[结果接收登记](../model-cordis-contract/SPEC.md#结果接收登记)。本节只写本包的实现。

- **发布。** 提供者带 `runtime` 时，插件在发布 `modelInstanceHost` 的同一个子插件里发布 `modelRuntime`，同样在 bind 之后。`modelRuntime` 是 `ModelRuntimeService` 的子类，四个调用、四个消费方法与 `connect` 转给提供者的 runtime，runtime 只在闭包里。带 `runtime` 而缺 `results` 选项，或有 `results` 而提供者不带 `runtime`，插件加载失败。
- **推送从哪里知道结果。** 插件把自己的命令端口交给提供者。提供者的 `settle` 提交成功后，推送唤醒该调用。推送不从读取推断提交。每个调用有一个唤醒位，同时处理的调用最多 `maxConcurrentCalls` 个，等待的调用不建 Promise。
- **冻结。** 推送以 `modelHostAuthority` 给出的主体读取该调用一次：受理事实、全部发出记录与全部结果页。结果交付的键是规范调用引用与 `Settlement.version`，载荷是冻结的 consumer、真实 Settlement、全部有序结果项与冻结时每个发出的账目快照（没有账目的写 `null`）。冻结后的交付深冻结，此后每次推送与重投都发送同一个值。读取用记录里固定的读操作，ACK 用记录里固定的 ACK 操作。
- **推送与回执。** 接收方按冻结的 `consumer.owner` 从本插件的登记表解析，不重新选择 owner。没有登记时交付保持等待，诊断 `no-receiver`，日志级别是 warn（R2-D237），该 owner 登记时重推。回执的键必须与原键相同，证据的 owner 必须是冻结的 consumer owner，否则不算 saved，交付记为失败并报告 `receipt-mismatch`。`outcome-unknown` 与抛出都算结果未知：用原键与原载荷立即重投，最多 `maxRedeliveries` 次，之后保持未知，下一次唤醒再重投。`unavailable`、`backpressured` 与 `cancelled-before-accept` 使交付等待下一次唤醒。`denied`、`invalid` 与 `conflict` 使交付失败，不自动重推。已经 saved 的交付不被后来的回答改写；未知只被 saved 取代。
- **ACK。** ACK 只接受推送接受过的 saved 回执，这是唯一能到达交接的路径：以固定的 ACK 操作和回执证据调用 `ModelCommands.handoff`，证据种类为 retained。`commit-unknown` 时用同一操作与同一输入重发，最多 `maxRedeliveries` 次，之后记为未知，下一次唤醒继续认回，不换操作，不清理。
- **清理。** ACK 成立后推送推进清理，每轮最多 `maxCleanupSteps` 步。清理失败或受阻时保持已确认，报告 `cleanup-pending`，下一次唤醒或后继插件继续，不撤回确认，不再 ACK。清理释放后推送只留结果键与回执，丢掉正文。
- **晚到账目。** 晚到账目经插件交给提供者的同一个命令端口进入。账目被接受之前先占一个名额：租户待交付账目达到 `maxPendingAccountsPerTenant`，或全部租户达到 `maxPendingAccounts` 时，`recordLateFact` 不提交，返回 `unavailable`（dependency `model-result-push`，诊断 `late-account-capacity`），并报告一条警告。来源仍持有它的报告，有名额后用同一操作重交。同一操作重交不另占名额。接受的结果是 `commit-unknown` 或 `unavailable` 时，账目可能已经提交，名额不归还。接受后推送立即读回这次提交的修订并冻结一个账目交付：键是调用引用、发出与修订，载荷是冻结的 consumer 与账目。同一调用的晚到账目一个接一个接受，每个修订一个交付，不合并。结果冻结时已在快照里的修订不另推。账目交付只在结果 saved 之后推送，正文释放后照常推送，名额在交付 saved 后归还。账目的未知项保持未知，不写零。
- **登记。** 登记规则由契约包的登记表实现：两个存活 fiber 争同一 owner 时后来者 `FAILED`；旧登记属于已卸载或正在卸载的 fiber 时被直接取代，所以插件因别的依赖重跑后重新登记不失败。本插件在每次登记成功后唤醒该 owner 的未完成交付。
- **推送状态的存放。** 推送记录放在装配给出的 `ResultPushLedger` 里，记录里有冻结交付、回执、ACK 与清理状态和待交付账目。账本同一时刻只有一个写者：`claim` 拒绝第二个。`createMemoryResultPushLedger` 是进程内的实现。本包不提供耐久账本，也不需要它：还欠什么由 `ModelCommands` 的耐久 custody 回答，见下一条。
- **启动扫描（R2-D260）。** 装配给出 `results.recovery` 时，推送在启动时扫描一次。它从 `recovery.scopes()` 取每个租户和该租户的恢复主体。它以 `scanBatchSize` 为页长逐页调用 `scanPending`，再对每个调用调用 `loadRecovery`。已收场、且 custody 仍在 producer 或清理还没释放的调用被唤醒。尚未收场的调用不唤醒，它由自己的 `settle` 唤醒。唤醒之后照常冻结、推送、ACK 与清理，账本为空也一样：
  - 结果收场后不再变化，所以从耐久记录重新冻结的交付与原交付同键同内容。接收方按同 key 同内容认回原回执，不另存一份。
  - Model 用新的 ACK 操作和这份回执的证据交接。早先的 ACK 如果已经提交，custody 已是 acknowledged，推送不再推送，只续做清理。
  - 扫描失败时报告一条警告（`start scan stopped at` 加 `scopes`、`scan` 或 `load`），停止这个租户的扫描，不重试。没扫到的调用等下一次启动。
  - 扫描结束时报告一条信息，写出唤醒的调用数。撤除时先等扫描停下，扫描停下后唤醒的调用不推送。
  - 没有 `recovery` 时不扫描。账本里没有的已收场调用就一直欠着。
- **生命周期。** 撤除时先关闭本代公共观察，再 quiesce、停派发并等待 drive 交还、停推送（此后 `recordLateFact` 对账目返回 `unavailable`，dependency `model-result-push`，诊断 `result-push-stopped`，来源向后继重交；中止在途推送并等待它们结束；等正在接纳的晚到账目冻结完；未接收的账目写入账本；释放账本）。采用首次通道时随后等待入口 releaseExecution，最后撤发布服务的子插件。未完成的推送、ACK、清理与晚到账目留在账本里。拿同一账本装载的后继插件用原键与原载荷继续。启动窗口里插件被卸载时，已绑定的宿主关闭，服务不发布。

已知限制：

- 推送的界从插件选项 `results.limits` 读取，在插件启动时校验，不在插件配置 `Config` 里：`Config` 目前只校验宿主的四项上限。
- 进程内账本随进程消失。已收场而未确认的结果交付由启动扫描接续，插件不在时收场的调用也一样。下面两种情形启动扫描接续不了：
  - 重启前已接受、还没 saved 的晚到账目交付。结果已经 ACK 时，这些交付只在账本里，重启后丢失。
  - 结果冻结之后、重启之前接受了晚到账目的调用。重新冻结的结果带着新的账目修订，与原交付内容不同。接收方答 `conflict`，交付记为失败，不 ACK，份额不归还。
  - M2 没有晚到账目的来源，这两种情形在发行里不出现。
- 启动扫描需要装配给出每个租户的恢复主体，还需要 `modelHostAuthority.resolve` 对重启前受理的调用给出主体。发行目前两样都没有，所以发行不传 `recovery`，见[应用的 Model 行页](../../../apps/harness-server/docs/rows/model-release.md)。
- 账本为每个调用留一条小记录（调用引用、consumer 与已交付的账目修订），不逐出。
- 推送不发出 `model-cordis-contract/call-changed` 事件。
- model 运行时的 `quiesce` 停止新受理并报告本进程的 pending 与 running（#446 阶段 5.5，C-QUIESCE）；进程外或重启前的耐久待办不计入，归 5.4 恢复。
- 模型发送没有重试策略（M2 范围）。
- 进程内没有再驱动等待（`waiting`）或未知（`unknown`）的交付。只有五个唤醒来源：`settle` 提交、晚到账目接受、owner 登记、后继插件启动与启动扫描。没有计时器，运行期间不再扫描。波 C 的周期恢复扫描接续这些交付。
- 被接收方以 `denied`、`invalid` 或 `conflict` 拒绝的晚到账目一直占着名额，不自动重推。租户份额因此可能被耗尽。波 C 的恢复扫描收场这些账目。
- 停推送等正在接纳的晚到账目，不设超时。命令端口一直不答时，卸载不返回。这与宿主关闭时的排空相同。
- `runtime.ts` 里有四个函数的圈复杂度高于 warn 线 10，不超 alert 线 12，保留不拆：`freeze`（12）按契约顺序读受理事实、引用、发出记录与结果页，每一步失败各自报告并返回；`push`（12）的分支逐个对应「推送与回执」的回答分类与重投上界；`hold`（12）是读回修订前后的顺序检查，每一项提前返回；`reportRuntimeEvent`（11）为 `RuntimeEvent` 的每个种类写一个分支，种类增加时它随之增加。拆开会把一个按顺序的决定分到几个函数里，读者要跨函数核对次序。

#### 53 项提供者义务

[tests/runtime-host.spec.ts](tests/runtime-host.spec.ts) 在真实 Cordis 4.0.4 上装出整装配，用 model-contract 的 `checkModelProviderConformance` 跑全部 53 项提供者义务。装配是：本包的 `ModelRuntimeLocalPlugin`（宿主、运行门面、结果推送）与 `ModelSendStagePlugin`（`modelSendBoundary`），model 的真实运行时，以及 model-storage-sql 的耐久 `ModelCommands`（`createSqlModelCommands`，带 `send` 选项，命令与发送协调器共用一个核心）。装配、钩子与故障注入在 [tests/support/durable-assembly.ts](tests/support/durable-assembly.ts)。

- **替身。** SQL 存储是 model-storage-sql 自己测试里的 node:sqlite 测试提供者的复制：每个事务域一个内存库，按完整身份认回执，参加者停止时回滚；它运行该成员真实的参加者、迁移与读 handler，不模拟 Worker、耐久性、队列与上限。参加者模块还不在 model-storage-sql 的公开面上，支撑文件从该成员源码导入它。传输是 model-contract 的脚本传输，事实来自套件的钩子，不连网络；发送阶段的网络是只会关闭的替身。
- **故障注入。** `failNextWrite` 在存储端口的装饰层实现：下一次匹配租户与 operation 的提交，`applied` 时先真提交再回 `unknown`，`dropped` 时不提交只回 `unknown`。`blockCleanup` 让该调用下一次 `advanceCleanup` 的提交在存储受理前被拒（`queue_full`）。`disconnectObservers` 与 `failDirectory` 在运行时读取的实例目录上注入。`revokeAccess` 从核心的授权方按动作撤权，观察资格经同一授权方判断。
- **受理的放行。** 调用的第一次 `schedule` 在路由发布且 drive 在上游资源处阻塞之后才返回，所以返回的受理有路由，状态不会自己变。`startRun` 放开该调用的上游并等发出记录为 `started`；`settleCall` 把结果项译成上游事实并等 drive 结束。耐久命令的分页在构造期固定为每页两项，不按钩子的 `pageSize` 逐调用设置；套件只用 `pageSize: 2`。
- **结果。** 2026-11-02 在 C-QUIESCE 合入之后：53 项 pass，0 项 fail，0 项 not-applicable。用例保留显式的已知失败表与不适用允许表，两张表目前都为空，任何失败或不适用都使用例变红。设 `OMNE_EVIDENCE_OUT=<目录>` 时用例写 `conformance.json`（逐项 obligation、status、detail）、`assembly.json`（`ModelCommands` 的实现、SQL 提供者、Cordis 版本、各插件，取自实际装出的对象）与 `hooks.json`。

#### 宿主插件的已知限制

- 同一服务键同时只有一个提供者（Cordis 不允许两个）。旧宿主在有序关闭里等 drive 交还时，服务键仍被它占着，此时装载的后继 fiber 失败（`FAILED`），旧宿主退出后没有宿主。失败是响亮的，不静默。需要换宿主时，先等旧宿主退出再装载。`tests/plugins-host.spec.ts` 固定这个行为。
- 关闭时的排空没有上界：`closeNow` 等所有在途 drive 交还，不设超时。忽略停止信号的 driver 会让卸载一直不返回。driver 必须响应传给它的停止信号。上界数值属装配配置，M2 不加这个机制。
- 收到响应头之前的流停顿经本地装配与 Model 运行时调用时，属首内容之前的可重试失败。M2 没有重试策略，调用停在 `retry-not-decided`，仍为 `running`，不形成 Settlement，见 [Model 已实现的调用收场](../model/SPEC.md#已实现的调用收场)。本包的 C4 用例只在首内容之后的一支要求 Settlement 可读。这是 M2 无重试的限制，不是宿主或停顿上界的缺陷。

### 请求准备插件与计量租约

`createModelRequestPreparationPlugin(options)` 交出插件类与该插件的租约来源 `resources`。插件在同一 fiber 上提供两个键：`modelRequestPreparation` 与 `modelPreparationResources`。静态注入只有 `modelCommands`；不依赖 `modelRuntime` 或供应商网络，传输缺席时 `prepare` 照常工作。配置是 `maxCitedCalls`（正整数，必需）。

- `prepare` 先核租户、档案范围、可用性与模态，再经与装配入口相同的 `createModelPreparationResources` 取一份不带 lineage 的租约，按每个绑定的 `rules.plan` 形成参数采用，按次序用 `judgeReplayDeclaration` 与 `judgeFixedModelRequest` 校验，交还租约后返回固定请求。它不计量、不发送。释放失败使这次调用失败，不报告为成功。
- 租约与宿主读同一份 `ModelCommands`：装配与插件都经 `modelCommands` 注入它。所以延续计量读得到同一存储里的调用事实；换一份命令时读不到（`call-unreadable`）。
- `modelPreparationResources` 的 `acquire` 交给本次装载的租约来源，即 `prepare` 所用的同一来源，读插件注入的同一份 `ModelCommands`。`resources` 是插件树外看到的同一来源。键的规则见 [model-cordis-contract 的 SPEC](../model-cordis-contract/SPEC.md#准备资源租约)。
- 插件卸载时租约来源拒绝新租约（`unavailable`，诊断 `preparation-plugin-unloaded`），`prepare` 同样拒绝。卸载前取得的 `modelPreparationResources` 服务引用也这样拒绝，不转给后继装载。卸载前取得的租约持有自己的调用事实视图，继续可用到释放；释放幂等，释放后的 meter 答 `preparation-lease-released`。
- 交给请求组装的租约来源是对象，不是服务键（R1-D17 Q-8）。插件装载后可用，卸载后拒绝。

### 官方档案读取

`ModelProfilesLocalPlugin` 把 pi-ai-openai 的官方档案作为一份冻结快照，经 model 的 `createModelProfiles` 发布为 `modelProfiles` 服务。求值规则归 [model 的 SPEC](../model/SPEC.md#档案读取与同名求值)，本节只写本包构造快照的规则。

- **来源构造。** `createOfficialProfileSource({ definitions, updatedAt })` 在 [profile-source.ts](src/profile-source.ts)，不导入任何家族包。每份定义成为一份工厂层档案，`identity` 为 `{ scope: { kind: 'factory' }, route }`，`route` 取第一家供应商的 `model`（依据：pi-ai-openai SPEC 写明记录名等于路由名）。`availability` 为 `active`，`updatedAt` 取配置。候选 `excluded` 与 `locked` 为 `false`，`credential` 为 `unavailable`，`precedence` 只有 `factory` 一层。构造时路由重复是装配缺陷，抛 `RangeError`，不服务半份目录。
- **档案 adoption 的身份规则。** 档案 adoption 是 `{ owner, name, revision, digest }`：`owner` 与 `revision` 取第一家供应商采用的 `owner` 与 `revision`，`name` 为路由名，`digest` 为整份定义的规范 JSON 的 SHA-256。它与供应商记录的 adoption 在 `owner`、`name`、`revision` 上重合，`digest` 不同：供应商的 digest 覆盖家族记录，档案的 digest 覆盖装配输入后的定义（含配置给出的 `retryPolicy` 与 `compactionTriggerPercent`）。家族包没有发布过档案的摘要，所以不存在可「向原拥有者核实」的档案摘要；这个 digest 只证内容相同。规范 JSON 规则同 tokenizer-tiktoken SPEC「规范 JSON」，tokenizer-tiktoken 与 pi-ai-transport 都没有从公开入口导出该函数，本包自写一份小函数，并由 [profile-source.spec.ts](tests/profile-source.spec.ts) 用独立算出的摘要固定。
- **快照 `source` 与 `revision` 规则。** `source` 为 `{ owner: '@omne-harness/model-host-local', record: 'official-profiles', revision: updatedAt, digest }`，`digest` 为各档案 adoption 列表的规范 JSON 的 SHA-256。`revision` 取配置的 `updatedAt`。家族记录升修订而配置不变时，`revision` 不变而 `digest` 变，所以只比 `revision` 的消费者会把它们当作同一来源。本阶段没有消费者核对 `source`：快照 `source` 只证内容相同，不证已向原拥有者核实。
- **凭据状态。** 候选 `credential` 固定为 `unavailable`，表示来源没有凭据元数据可给，它不是暂态，也不是 `missing`，更不是 `available`。这不挡选择：缺凭据与凭据不可得都不使 `selectable` 为假，所以官方档案在本阶段都可选。读取 settings 与凭据状态元数据留给后续波。依据：R1-D4。消费方（如选择界面或运行线）不得把「非 `available`」当作不可选。
- **不核主体。** 官方档案对所有租户相同，不含租户数据。本阶段来源只核租户经 legal-identity 铸造，不核主体；待身份适配器进入装配后补。

插件的配置经 Standard Schema 在入口一次解析，只含可序列化值，没有默认值，非法配置使插件加载失败：`retryPolicy`（一份 Adoption，四项均为非空字符串）、`compactionTriggerPercent`（字符串，1 至 100 的十进制整数）、`updatedAt`（RFC 3339 UTC 文本）。

- **具名偏离：插件内固定 OpenAI 家族。** 插件文件 [plugins/profiles.ts](src/plugins/profiles.ts) 是本包唯一导入 `@omne-harness/pi-ai-openai` 的文件，调用 `officialOpenAiProfiles`。这偏离[组架构的包依赖图](../docs/architecture.md#包依赖与装配)里「Host 没有指向 Family 的边」。依据：R1-D4 与线包 C-PROFILE。退出条件：发行装配改由调用方注入定义列表或经装配页登记，此后只改这一个文件，来源构造与求值不动。`pi-ai-openai` 因此从 devDependencies 提到 dependencies，选择本成员会多安装 `@omne-harness/pi-ai-openai` 及其 `js-tiktoken`；根入口导入家族即持有 o200k 词表模块，是已知代价。本阶段不引入 `pi-ai-anthropic`。
- **`retryPolicy` 只是随档案走的值。** 插件配置里的 `retryPolicy` 与 `modelRetryPolicy` 服务是同一事实的第二个写入处。本阶段没有任何阶段解析这个字段，两者的相等保证归装配页，不由本包承担。

生命周期：插件没有资源可关闭，不登记需要等待的清理。快照在构造时创建一次，之后每次读取看到同一份。插件撤除后 `ctx.modelProfiles` 为 `undefined`，仍被持有的旧句柄的 `list` 与 `resolve` 返回 `unavailable`（`dependency` 为 `model-profiles`，`diagnostic` 为 `plugin-removed`），不继续回答旧快照；这与「撤除后不再回答」一致。换代不改在途采用：在途请求已固定档案 adoption。

已知限制：`scope` 原因本阶段不产生（没有租户层与组织层档案）；`retryPolicy` 本阶段不被任何阶段解析；快照 `source` 的 digest 只证内容相同。

### 发送阶段插件

`createModelSendStagePlugin(options)` 交出插件类 `ModelSendStagePlugin`，继承契约包的 `ModelSendBoundaryService`，提供 `modelSendBoundary`。静态注入是 `modelCredential` 与 `modelCommands`：两者缺一个，插件不装载，不建发送路径。配置是 `maxRetainedAttempts`（正整数，必需），其余取值让加载失败，不取默认值。`options` 是对象，不是可序列化配置：家族、协调器、网络、路由、限额与 `preparation`。`preparation` 必需，因为 `assembleLocalModel` 在同一次调用里建准备租约，插件不使用它们。

- 构造时，插件用 `assembleLocalModel` 建发送路径。`credentials` 是插件自己的端口，`commands` 是注入的 `modelCommands`。装配拒绝配置时构造抛出 `RangeError`，什么都没有打开，服务不发布。
- 服务面只有 `send`，委托给发送路径的发送边界。发送规则全归 model 与[发送资源](#发送资源)：围栏、尝试保留、凭据解析与凭据槽。本插件不另写发送规则。凭据槽仍只在 `start` 期间有值，经插件发送时也一样。
- 凭据端口转发注入服务的 `layerOf` 与 `resolve`，不缓存任何值。
- 退出是一个流程：先撤回凭据端口，此后端口返回 `unavailable`，插件不再持有服务。再撤已安装的物化 reader，然后关闭发送路径：释放发送资源，关闭网络并等待在途交换停止。reader 撤除失败仍继续关闭。流程不抛出，失败只记不含原因的安全警告。卸载等它结束。
- 退出时在两步之间的发送不启动传输，也不解析凭据：它以 `not-started` 收场，失败是 `unavailable`，`dependency` 为 `model-credential`，诊断为 `credential-unavailable`。
- 退出后，仍持有旧服务引用的调用方继续得到原发送边界的答复。没有开始过的 dispatch 得到 `not-started`，`dependency` 为 `pi-send-resources`，诊断为 `send-resources-closed`，此时不取得资源，不解析凭据。
- 卸载不收回已经发出的请求。网络关闭让在途交换停止，该交换的终止仍由传输按自己的映射给出。接替的插件建一个新的发送边界，它对已发出的 dispatch 的答复归 model 的发送边界。本包没有测试这两种情形。

## 所有权、失败与生命周期

### 凭据服务

`serveModelCredential(ctx, port)` 在 `ctx` 上以 `modelCredential` 提供 `port`，寿命随 `ctx` 的 fiber。服务继承 model-cordis-contract 的 `ModelCredentialService`，不另写键。端口只在两个方法的闭包里，不是实例属性，经 `ctx.modelCredential` 取不到端口背后的保管。

服务不核调用者资格，不从 `ctx`、实例或谁装了它推断租户。租户、用途与档案是否官方是两个操作的参数，由受信的准备与发送边界提供；装配只把服务交给它们。

### 发送路径的所有权

- 发送资源拥有它为每次 `acquire` 建的 pi 传输，在 `release` 或 `close` 中关闭它们。发送边界拥有每次尝试的资源，在尝试结束时调用 `release`。
- 装配拥有它创建的网络资源。`close()` 先关闭发送资源，再关闭网络资源，并等待在途交换实际停止。网络关闭也让仍在途的交换停止。
- 装配不拥有 `commands`、`coordinator`、`credentials` 与 `families`。`close()` 不关闭它们，调用方负责它们的寿命。
- `close()` 开始后，`preparation.acquire` 返回 `{ kind: 'unavailable', dependency: 'model-host-local', diagnostic: 'assembly-closed' }`。这个名字指向装配，不复用发送资源的名字：发送资源也能单独关闭，`pi-send-resources` 只指它。拒绝时不调用 `supplierOf`，不取得绑定。
- `close()` 不释放租约。关闭前取得的租约持有自己的绑定，关闭后仍可计量，直到取得它的调用方调用 `release`。家族计量器是纯函数，不持有网络资源。
- 装配的 `close()` 重复调用返回同一结果。`close()` 关闭发送资源与网络资源两者，一个失败不跳过另一个。只有一个失败时抛出该失败。两者都失败时抛出 `AggregateError`，含两个失败。
- 关闭只改变本进程内的状态。已经发出的请求与上游已经产生的费用不可撤回。

### 资源所有权

秘密保管的文件归设置域的保管提供者（settings-local），本包不打开文件。disposer 或关闭只改变本进程内的状态，已经交给发送端的值不可撤回。

## 组合与验证

选层与判读规则来自 model-contract，本包不另写。端口用 model-contract 的凭据符合性套件在真实的 settings-local 保管库上核对。文件机制（锁、原子发布、读分类、故障注入）在 settings-local 的 `tests/secrets/` 验证，本包不重复。

持续验证在 [tests](tests/index.md)。各测试覆盖的义务如下：

- [credential-service.spec.ts](tests/credential-service.spec.ts)：端口在真实的 settings-local 保管库上通过 model-contract 凭据符合性套件的全部义务；未知供应商与其他用途得到 `denied`；读面与使用面之间绑定变化时得到 `unavailable`；在真实 Cordis 4.0.4 下，`serveModelCredential` 的服务实例只暴露 `layerOf` 与 `resolve`，随 fiber 撤除。
- [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)：`./cordis` 入口的运行时导出清单。
- [profile-source.spec.ts](tests/profile-source.spec.ts)：来源构造的身份、adoption、revision 与快照证据，摘要用独立算出的夹具核对，路由重复与非法修订在构造时拒绝。
- [profiles-plugin.spec.ts](tests/profiles-plugin.spec.ts)：在真实 Cordis 4.0.4 下，`ModelProfilesLocalPlugin` 发布 `modelProfiles`，每条路由的档案定义与 `officialOpenAiProfiles` 逐字段相同，`list` 与 `resolve` 的答案，撤除后旧句柄返回 `unavailable`，非法配置使加载失败，并与档案替身对拍。
- [send-resources.spec.ts](tests/send-resources.spec.ts)：用观察凭据槽的传输工厂核对，槽只在 `start` 期间有值，正常返回与抛出后都为空，两个资源互不见对方的值，异物与释放后的物化传输被拒绝且不填槽，`release` 与 `close` 幂等。它还核对连接重试的报告带出每次发送各自的 `call` 与 `dispatch`、探针传输没有观察者；并用真实 pi 传输核对异物物化传输被拒绝，以及传输拒绝的配置在构造时抛出。
- [assembly.spec.ts](tests/assembly.spec.ts)：装配对路由、网络、尝试容量与准备配置的拒绝。`preparation` 的租约经配置的家族取得绑定，并调用配置的 `supplierOf`。`close` 开始后的取得返回具名为 `model-host-local`、`assembly-closed` 的不可用，且不调用 `supplierOf`。关闭前取得的租约在关闭后计量结果不变并能释放。`close` 幂等。
- [plugins-instances.spec.ts](tests/plugins-instances.spec.ts)：真实 Cordis 4.0.4 下两个目录插件的等待、发布、登记与释放、非解析器租户、授权方拒绝、后继目录、失去权威与转换目录的独立。
- [plugins-host.spec.ts](tests/plugins-host.spec.ts)：真实 Cordis 4.0.4 下宿主部分的绑定后发布、四项配置的拒绝、并发上限、唤醒容量满、重复唤醒、调用方 fiber 退出、无可信输入时不驱动、有序关闭的次序与未派发唤醒、后继宿主不接管旧引用、失去依赖、启动窗口卸载时宿主关闭、观察资格与换代路由。
- [runtime-push-bounds.spec.ts](tests/runtime-push-bounds.spec.ts)：同一推送场景。核对每次唤醒的推送上限（R2-D273）：接收方一直答 unavailable 或 backpressured 时一次唤醒只推一次，一直答 outcome-unknown 时推 `1 + maxRedeliveries` 次。性质见 model-contract 的 [formal-mapping.md](../model-contract/verification/models/formal-mapping.md)。
- [runtime-push.spec.ts](tests/runtime-push.spec.ts)：真实 Cordis 4.0.4、真实 model 运行时与内存 `ModelCommands`、脚本传输与脚本接收方（代 agent-host-local 的接收方）。核对：冻结的结果交付与 retained ACK；saved 的四项事实各缺一项时不 ACK；键或证据 owner 不符的回执不算 saved；未知时用原键原载荷重投；ACK 未知时以原操作认回；清理失败保持确认、后继完成清理；没有接收方时等待、登记后推送；正文释放后每个晚到修订一个账目交付；账目在结果 saved 之后；晚到账目超界被拒并可观察、有名额后接受；未知后被拒的重投保持未知；晚到账目接受未知时不归还名额、同一操作重交不另占；卸载等正在接纳的晚到账目并交给后继、停后拒收；两个存活 fiber 争同一 owner；因别的依赖重跑后重新登记；撤除时未完成推送交给后继。启动扫描（模拟重启：新插件类与空账本，同一份内存 `ModelCommands`）：saved 未 ACK 的结果以原键原载荷再推、ACK 并归还份额；已提交而回包丢失的 ACK 只续做清理、不再推送；已结清的调用下次启动不唤醒；未收场的调用不唤醒；扫描被拒时报告警告、custody 不变。
- [runtime-cancel.spec.ts](tests/runtime-cancel.spec.ts)（慢层）：本地 HTTPS 流进行中的 `calls.cancel`。核对：终止在传输报告物理停止之后，已交付内容保留，费用不写零；同租户另一调用照常完成；取消与自然完成同时到达时只有一个终止。
- [runtime-host.spec.ts](tests/runtime-host.spec.ts)（慢层）：真实 Cordis 4.0.4 上的整装配（运行时插件、发送阶段插件、真实 model 运行时、model-storage-sql 的耐久 `ModelCommands` 与协调器）跑 model-contract 的 53 项提供者义务；每项出现一次，失败只允许显式的已知失败表，not-applicable 只允许显式允许表（两张表目前都为空）；`assembly.json` 的实现描述取自实际装出的后端。见[53 项提供者义务](#53-项提供者义务)。
- [line-e2e.spec.ts](tests/line-e2e.spec.ts)（慢层）：线内贯通。一个进程、一个真实 Cordis 4.0.4 根 Context 装出凭据服务（真实保管库上的凭据端口）、官方档案、请求准备、发送阶段、运行门面与推送，耐久 `ModelCommands` 用 model-storage-sql 的 `createSqlModelCommands`（命令与发送协调器共核）；走完 准备 → 发送（回放 `openai-tool-call` 合成件，请求摘要等于旁注）→ 持久（关掉并重开 SQLite 文件后新命令读出终态与结果页）→ 推送（接收方替身先 saved，生产方才 ACK，之后清理 released）→ 取消（`exchange-stopped` 先于 settle，终止为该取消的 interrupted）。SQL 提供者是 node:sqlite 文件替身，不覆盖 sqlite-provider 的 Worker、队列与耐久；接收方是脚本替身。设 `OMNE_EVIDENCE_OUT` 时写脱敏 `line-e2e.json`。
- [plugins-preparation.spec.ts](tests/plugins-preparation.spec.ts)：真实 Cordis 4.0.4 下无运行面与网络时的 `prepare`、档案拒绝、租约交还、卸载后查询仍可用、同一命令上的第 2 轮锚点与另一份命令的读不到、卸载后的租约、命令换代。`modelPreparationResources`：经键取得的租约读到注入命令里的调用，键随插件撤除，旧引用拒绝新租约，重装后键恢复；真实插件跑契约成员的两条符合性用例。
- [local-model.spec.ts](tests/local-model.spec.ts)（慢层）：本地 HTTPS 服务回放 OpenAI 与 Anthropic 两个家族录制的 SSE 正文，两家各有一条回复含推理续接状态部件。调用经保管库上的凭据端口、装配的发送边界、真实 pi 传输、两个家族与 model 运行时。测试核对：请求带凭据端口从官方层读出的 `Bearer` 占位值；事实以唯一的 `ended` 结束；调用收场，发出记录的终局与之相同；物化回执带该家族记录产出的 `replayFormat`；账目带本次调用的 `subject` 与 `receipt: 'received'` 到达内存 `ModelCommands`，并经 `dispatches` 读回；`payableAmount` 得到已知的 `openrouter-credit` 金额；占位值不出现在事实与发出记录中。
- [continuation.spec.ts](tests/continuation.spec.ts)（慢层）：两家各让一次带推理状态的调用 X 经装配收场、读取、确认并释放请求材料，再用 `preparation` 的真实租约与真实家族计量器计量延续 X 的下一次请求。测试核对：锚点命中；金额等于 X 的 `input`、`cache-read` 与 `cache-write` 之和加新增部分的估算；余量只按估算部分计算；方法名以 `+continuation-anchored/1` 结尾；带 X 回复的请求比不带时恰好多 X 的输出 token 数。另一租户声明 X 时，计量结果与声明一个不存在的调用逐字节相同。
- [send-stage.spec.ts](tests/send-stage.spec.ts)：真实 Cordis 4.0.4 下发送阶段插件的装载与卸载（服务发布与撤回，缺凭据服务时等待，随凭据服务卸载，配置与装配被拒时什么都不建）、凭据槽、退出后的发送、退出时在途的发送，以及卸载等发送路径关闭。慢层用例把四份真实回放件经插件的 `modelSendBoundary` 回放，并与装配路径在同一用例里对比事实、请求与发出记录。另有一条慢层用例：本地前置 TCP 端口丢弃第一条连接（请求字节未发出），经插件重试后调用 completed，Cordis logger 恰好收到一条含调用标识、重试序号、延迟与原因的 `warn`。
- [recording-replay.spec.ts](tests/recording-replay.spec.ts)（慢层，门禁）：把 pi-ai-transport 的四份真实回放件逐一经装配路径回放，核对收场、唯一终止、推理状态与回放格式、请求摘要可复现、账目经真实路径到达，以及占位凭据只出现在 `Authorization` 头里。它还回放两个工具调用用例的合成回放件：请求带 function 形状的工具、`tool_choice` 为 `auto`、推理档位为 `medium`，首轮以工具建议收场；延续轮带首轮回复里的工具调用与推理状态，再带工具结果；录制器把合成流原样写出，旁注摘要等于发出请求体的摘要，密钥模式命中时不写文件，回复没有工具调用时不写文件。合成回放件是手写数据，不证明真实模型的输出。
- [recording-c9.spec.ts](tests/recording-c9.spec.ts)（慢层）：两家各计量一次延续真实首轮的请求，再回放延续轮，记录发送前计量与真实输入合计之差。差值只记录，不是门槛。
- [recorder.spec.ts](tests/recorder.spec.ts)（慢层）与 [secret-scan.spec.ts](tests/secret-scan.spec.ts)（快层）：录制器写出的字节与旁注、不写文件的情形，以及密钥扫描。录制器的规则见 [tests/README.md](tests/README.md)。

未覆盖：网络文件系统与跨机器的锁语义，崩溃后残留锁的自动恢复，进程重启后的推送恢复只在同一进程内模拟（新插件类、空账本、同一份内存 `ModelCommands`），没有在真实进程重启和 SQL `ModelCommands` 的 `pending` 分页上验证，以及本包以外的宿主能力。经真实厂商或代理的发送只经手动录制器验证。证据是 [`pi-ai-transport/tests/fixtures/recordings/`](../pi-ai-transport/tests/fixtures/README.md) 的四份回放件，门禁回放（[recording-replay.spec.ts](tests/recording-replay.spec.ts)）走同一装配路径。耐久的 `ModelCommands` 不在本包；本包在整装配上跑它的 53 项义务（[runtime-host.spec.ts](tests/runtime-host.spec.ts)），SQL 存储是 node:sqlite 测试提供者，不覆盖真实 sqlite-provider 的 Worker、耐久性与关闭。
