# @omne-harness/model-host-local 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包承载四项能力：本地凭据保管（settings-local 秘密保管库之上的 Model 凭据适配 `LocalCustodian`，及装载它的 Cordis 插件）；本地发送路径（生产发送资源 `createPiSendResources` 与本地 Model 装配 `assembleLocalModel`），装配同时接入 model 的计量准备资源；单机宿主插件（实例目录、转换目录、宿主驱动、运行门面 `modelRuntime` 与结果推送、请求准备及其计量租约，以及发送阶段）；以及官方档案读取（`ModelProfilesLocalPlugin`，来源构造 `createOfficialProfileSource` 不出本包公开入口）。恢复扫描、重试与目录阶段插件不在本包当前范围，没有实现也不由本文件承诺。

发送资源满足 model 的 `SendResources` 端口，端口形状与发送边界的行为归 [model 的 SPEC](../model/SPEC.md)。传输、家族贡献、网络资源与路由的形状和行为归 [pi-ai-transport](../pi-ai-transport/SPEC.md)。秘密不进入请求、发出记录、失败、扩展或遥测的要求归 [model-contract](../model-contract/SPEC.md)。

凭据引用、查询、五种结果和 `CredentialPort` 的形状及持有者语义归 [model-contract](../model-contract/SPEC.md)。存在性与解析的判定归 [model 的 SPEC](../model/SPEC.md#凭据引用与解析)：本包把当前状态快照交给判定函数，不自己判定。`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/SPEC.md)，本包的插件继承它。保管库文件、文件锁、原子发布、读分类与两个秘密端口归 [settings-local 的秘密保管](../../assets/settings-local/SPEC.md#secret-custody)；本包只决定哪些绑定是 Model 的、它们的绑定键，以及交给判定的状态快照。目标归属见[组架构](../docs/architecture.md#凭据的现有装配边界)。

## 结果与不变量

### 兼容期资格凭据路径

`LocalCustodian` 与 `LocalCredentialPlugin` 实现同步 `presentFor`、`resolveFor`。旧 `present`、`resolve` 保留原行为。新方法只从 `access.tenant` 取租户，复用合法租户、用途、绑定寿命与工厂选择的判定。同一凭据身份由其他租户持有且本租户没有对应绑定时，两个新方法都返回 `denied`；只有官方档案且该租户没有任何绑定时，解析才可返回工厂值。撤销或不可读的绑定不回退工厂。工厂秘密是空字符串时，部署没有提供默认凭据：解析在这个位置返回 `absent`，不返回空值。文件不可用返回 `unavailable`，句柄关闭后返回 `denied`。

只有受信发送边界注入凭据服务，`access` 已在受理点 C 核验。提供者不核主体铸造来源，也不核 `official` 的来源，不读取 `SendFace`。新方法不增加管理能力，保管库与诊断仍只在插件闭包中。

发送阶段的私有端口转发服务已有的资格方法。服务缺少某个新方法时，端口保留该方法缺席，由发送边界报告 `qualified-path-missing`，不调用旧 `resolve`。撤除先切断凭据端口，再等待发送路径关闭；已捕获的新方法在关闭等待期间及之后返回 `unavailable`。这不撤回已发出的外部请求。

### 保管库与绑定键

保管库是 settings-local `./secrets` 的秘密保管库文件（`openSecretVault`、`createSecretVault`）。本包在它之上读写 Model 的绑定，绑定键如下，`MODEL_FACTORY_SECRET_KEY` 与 `modelCredentialBindingKey` 从根入口导出：

- 工厂秘密：（官方范围，目标 `{ owner: 'model', key: 'factory default' }`，用途 `model-send`）。目标键含空格，`decodeCredentialId` 不接受，所以任何凭据 id 都不会与它冲突。工厂秘密为空字符串时没有这一行：部署没有提供默认凭据。
- 租户凭据：（该租户范围，目标 `{ owner: 'model', key: <凭据 id 文本> }`，用途 `model-send`）。

没有 `version` 的旧文件由 settings-local 读成同样的绑定（`factorySecret` 读作工厂秘密，每行读作租户凭据），第一次写入后整份文件是版本 2。保管库里其他拥有者或其他用途的绑定不是 Model 的，判定看不到它们。租户绑定的目标键不是合法凭据 id 时，快照按损坏处理（`unavailable`，原因 `corrupt`），文件不被改写。

- `createLocalCustodian({ path, factorySecret, lock?, diagnosticsCapacity? })`：路径上没有文件时新建保管库，工厂秘密成为官方绑定（空字符串时不写绑定）；已有可读文件时在锁内直接采用它（不覆盖，不用本次的工厂秘密）；文件存在但不可读时抛出异常，信息带 `corrupt` 或 `io`。先检查再创建都在同一把锁内完成，两个进程同时在空路径上启动不会互相抹掉绑定。锁等待超时抛出带 `code: 'ELOCKED'` 的异常。
- `openLocalCustodian({ path, lock?, diagnosticsCapacity? })` 打开已有保管库，返回 `{ kind: 'open', custodian }`。文件缺失返回 `{ kind: 'unavailable', cause: 'missing' }`；损坏、形状不对、同一键多行或租户目标键不是凭据 id 返回 `cause: 'corrupt'`；其他文件系统错误返回 `cause: 'io'`。不新建、不修改文件。
- `lock.waitMs`（默认 30 000）与 `lock.backoffMs`（默认 50）是等待文件锁的上限与重试间隔，交给保管库；`diagnosticsCapacity`（默认 256）是句柄保留的最近诊断条数。只有未给出（`undefined`）的值取默认值。`waitMs` 与 `backoffMs` 须是有限的非负整数，`diagnosticsCapacity` 须是有限的正整数，`lock` 给出时须是对象；其他值（含 `null`、`NaN`、`Infinity`、负数、小数与非数字）让两个函数抛出 `TypeError`，不取锁也不读盘。
- 工厂秘密与经 `put`、`rotate`、`bind` 写入的秘密都经 `parseSecretText` 校验（去首尾空白后非空、无控制字符、不超长）；不合格的值抛出 `TypeError`，不写盘。

### 读取与刷新

`present` 和 `resolve` 先按租户、用途和发送资格拒绝：租户未铸造、保管已关闭、用途不符，或 `resolve` 的发送未获准时返回 `denied`，此时不读磁盘。通过这道检查后，它们每次经保管库的 `snapshot()` 读整份文件，构造 Model 的状态快照，再交给判定。因此保留的句柄和 Cordis 服务都能观察到其他进程、其他句柄或 `setup` 造成的轮换、撤销、替换或文件损坏。刷新失败返回 `unavailable`，不改文件。

诊断留在保管库句柄上，只记录结果种类、租户是否匹配与读不出的原因，不含秘密；Cordis 服务不转发诊断。

### 管理操作

`put`、`rotate`、`revoke`、`markUnreadable`、`replaceFactorySecret` 经保管库的一次锁内修订（`revise`）完成：持锁、重读、修改 Model 的行、原子发布。保管库答 `not-written`、`unconfirmed` 或 `denied` 时抛出异常，信息带该结果，不带秘密；`unconfirmed` 的信息是 `confirmation incomplete; verify state before retry`，调用方须核实当前文件状态后再决定重试。

- 租户未经铸造（例如复制出的对象）时，`put`、`rotate`、`revoke`、`markUnreadable` 都先抛出异常，不取锁、不读盘也不写盘。`put` 若放行，磁盘记录读回时会按文本重新铸造，复制出的租户会变成真实租户的绑定；其余三个操作对这样的租户匹配不到任何行，放行只会空跑一次取锁与发布，并让调用者以为已经生效。
- `put` 把该持有者写成 `active`，没有时刻，可以盖过已撤销或读不出的行。
- `rotate` 只换秘密，不改寿命与时刻；已撤销的行轮换后 `resolve` 仍是 `denied`。没有这一行时不写盘。
- `replaceFactorySecret(secret)` 只换工厂秘密，空字符串删除官方绑定。绑定、它们的秘密与寿命都不变。它不带租户，所以没有铸造检查。运行中的句柄与插件在下一次解析时读到新值。
- `revoke` 把该持有者标成 `revoked`。
- `markUnreadable` 只把 `active` 改成 `unreadable`。
- 其他租户持有同一身份时，对它的 `put`、`rotate` 不替换也不改动本租户的行。

### 绑定管理

`bind`、`unbind` 与 `describe` 是给装配的绑定管理。它们与上一节的操作不同：存储失败是结果，不是异常。结果不带秘密，也不带异常文本。

- `bind({ reference, secret, configuredAt })` 把该持有者写成 `active`，秘密与时刻都换成本次的值（`configuredAt` 须是 utc-instant 接受的时刻文本）。结果是 `written`、`not-written`（旧快照仍在盘上）、`unconfirmed`（新快照可能已发布，重试前先读回）或 `denied`。
- `unbind({ reference })` 删除该持有者的行。之后这个租户按从未绑定处理：`presentFor` 答不存在，工厂选择照常适用。没有这一行时结果是 `absent`，不写盘。其余结果同 `bind`。
- `describe({ reference })` 每次从磁盘读，结果是 `unbound`、`bound`（带寿命与可选的 `configuredAt` 时刻文本）、`denied` 或 `unavailable`。
- 租户未经铸造、保管已关闭，或同一凭据身份由其他租户持有时，三个操作都答 `denied`，不改文件。他租户持有的检查在同一次锁内修订里完成。
- 四态写入、文件锁、唯一临时文件、重命名与残留临时文件的清理都是保管库的行为，见 [settings-local 的秘密保管](../../assets/settings-local/SPEC.md#secret-custody)。

### 关闭

`close()` 只把当前进程的 Model 门标成关闭，随后的 `present` 和 `resolve` 返回 `denied`。关闭不删除绑定，不把停止状态写入保管库文件（版本 2 的文件没有这个标志），也不改写已经交给发送端的值。关闭之后的管理操作仍会持久化；下一个进程按文件里的绑定读取。

### 发送资源

`createPiSendResources({ network, families, routes, limits, materialization })` 返回生产 `SendResources` 与只读的 `materialization` 证据端口。精确形状归 [send-resources.ts](src/send-resources.ts) 与 [materialization-proof.ts](src/materialization-proof.ts)。

- 构造时，发送资源用一个空凭据槽建一个探针传输，检查配置。传输拒绝的配置（路由不是纯 `https:` 地址、限额越界、家族贡献或网络资源不合格）让构造抛出 `RangeError`。探针不发送，构造时即开始关闭，发送资源的 `close` 等待其结果。
- 每次 `acquire` 建一个新的 pi 传输。这个传输的凭据槽是本资源的私有闭包，其他资源读不到它。网络资源与家族贡献由所有资源共享。
- `acquire` 先核当前 execution，再按显式的 `materialization.maxRecords` 预留名额，之后才创建真实传输。每资源捕获原 demand，`prepare` 核原 request、supplier 与空 resent，重复准备复用原 Promise。
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

- 配置项是 `credentials`（`CredentialPort`，如本地保管库）、`commands`（`ModelCommands`）、`coordinator`（`SendCoordinator`）、`families`（组合后的 `PiFamilyContributions`）、`network`（`NetworkConfig`，含代理与 TLS）、`routes`、`transportLimits`、`maxRetainedAttempts`、`materialization` 与 `preparation`。`preparation` 有两项：`maxCitedCalls`（一个 lineage 最多引用的不同调用数）与 `supplierOf`（model 的 `SupplierPort`，为档案供应商补上凭据引用）。
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
- 凭据端口转发 `present`、`resolve` 及注入服务已有的可选 `presentFor`、`resolveFor`，不缓存任何值。新方法缺席时保持缺席，不回退旧方法。
- 退出是一个流程：先撤回凭据端口，此后端口返回 `unavailable`，插件不再持有服务。再撤已安装的物化 reader，然后关闭发送路径：释放发送资源，关闭网络并等待在途交换停止。reader 撤除失败仍继续关闭。流程不抛出，失败只记不含原因的安全警告。卸载等它结束。
- 退出时在两步之间的发送不启动传输，也不解析凭据：它以 `not-started` 收场，失败是 `unavailable`，`dependency` 为 `model-credential`，诊断为 `credential-unavailable`。
- 退出后，仍持有旧服务引用的调用方继续得到原发送边界的答复。没有开始过的 dispatch 得到 `not-started`，`dependency` 为 `pi-send-resources`，诊断为 `send-resources-closed`，此时不取得资源，不解析凭据。
- 卸载不收回已经发出的请求。网络关闭让在途交换停止，该交换的终止仍由传输按自己的映射给出。接替的插件建一个新的发送边界，它对已发出的 dispatch 的答复归 model 的发送边界。本包没有测试这两种情形。

## 所有权、失败与生命周期

### 插件

`LocalCredentialPlugin` 继承 model-cordis-contract 的 `ModelCredentialService`，不另写键。配置是 `path`（非空字符串）、可选的 `factorySecret`（给出时必须是字符串，空字符串合法），以及可选的 `lock`（`waitMs`、`backoffMs`）与 `diagnosticsCapacity`；三个数值的取值规则与保管库相同。配置不合格时插件加载失败：缺项、类型不对与取值不合格都是不合格，不会被静默丢弃后按默认值加载。回调和已打开的存储对象不进配置。

- 路径上没有文件、配置给出 `factorySecret`：用它新建保管库，工厂秘密成为官方绑定。新建等待文件锁，超过 `lock.waitMs` 时插件加载失败。
- 路径上没有文件、配置没有 `factorySecret`：不建文件。插件照常注册 `modelCredential`，四个方法都返回 `unavailable`，与文件读不出时相同。这让由 `harness-server setup` 建好保管库的宿主不在可序列化配置里放秘密（[可序列化配置与秘密材料分开](../../../docs/architecture/cross-cutting-concepts.md)）。
- 路径上已有文件：打开并使用文件里的工厂秘密，不用本次配置里的值。
- 文件损坏或读不出：插件仍然注册 `modelCredential`，`present` 和 `resolve` 返回 `unavailable`，不改文件；撤除时没有可关闭的保管库。打开失败的原因不经插件报告：服务面只有 `present` 与 `resolve`，诊断不转发（见[读取与刷新](#读取与刷新)），本包也没有采用别的观测通道；运维在同一路径上调用 `openLocalCustodian` 即得到 `missing`、`corrupt` 或 `io`。
- 保管库只存在于构造时创建的闭包里，不是实例属性，经 `ctx.modelCredential` 取不到保管库及其管理操作。
- `createLocalCredentialPlugin()` 返回 `{ plugin, custody }`。`plugin` 与 `LocalCredentialPlugin` 提供同样的 `modelCredential`。`custody` 是该插件当前存活的保管库的 `bind`、`unbind` 与 `describe`，留在建它的装配手里，不在服务上。插件未装载、已撤除或保管库打不开时，写操作答 `not-written`，`describe` 答 `unavailable`。`custody` 不核调用者资格，持有它的装配负责准入。
- 插件撤除时关闭保管句柄（本进程的 Model 门）。关闭挂在装载插件的 fiber 上，没有额外等待在途解析。

插件不从 `ctx`、实例或谁装了它推断租户；租户、用途和发送资格是 `resolve` 的参数，由受信的发送边界提供。

### 注入发送

`deliverInjected` 经静态 `inject` 取得 `modelCredential` 并调用 model 的 `deliver`。它只经服务取得凭据，不打开保管库。

- 没有提供者时不取得任何值，也不发送：`outcome()` 保持 `undefined`，注入的 fiber 继续等待。提供者出现后，这次注入完成一次并给出结果；结果一经产生不再改变。
- 提供者撤除后重新装载，之后新发起的注入发送取得重装后的提供者。已经产生的结果不变。
- 同一 isolate 只有一个 `modelCredential` 提供者：另一个提供者在旧提供者仍存活时注册会被 Cordis 拒绝，旧提供者继续服务。旧提供者撤除后，另一个 `ModelCredentialService` 子类可以接替，之后的发送使用它；对已撤除的旧 fiber 再次撤除不影响接替者。
- 注入到的对象不是 `ModelCredentialService` 时，发送结果是 `{ sent: false }`。

### 发送路径的所有权

- 发送资源拥有它为每次 `acquire` 建的 pi 传输，在 `release` 或 `close` 中关闭它们。发送边界拥有每次尝试的资源，在尝试结束时调用 `release`。
- 装配拥有它创建的网络资源。`close()` 先关闭发送资源，再关闭网络资源，并等待在途交换实际停止。网络关闭也让仍在途的交换停止。
- 装配不拥有 `commands`、`coordinator`、`credentials` 与 `families`。`close()` 不关闭它们，调用方负责它们的寿命。
- `close()` 开始后，`preparation.acquire` 返回 `{ kind: 'unavailable', dependency: 'model-host-local', diagnostic: 'assembly-closed' }`。这个名字指向装配，不复用发送资源的名字：发送资源也能单独关闭，`pi-send-resources` 只指它。拒绝时不调用 `supplierOf`，不取得绑定。
- `close()` 不释放租约。关闭前取得的租约持有自己的绑定，关闭后仍可计量，直到取得它的调用方调用 `release`。家族计量器是纯函数，不持有网络资源。
- 装配的 `close()` 重复调用返回同一结果。`close()` 关闭发送资源与网络资源两者，一个失败不跳过另一个。只有一个失败时抛出该失败。两者都失败时抛出 `AggregateError`，含两个失败。
- 关闭只改变本进程内的状态。已经发出的请求与上游已经产生的费用不可撤回。

### 资源所有权

保管库文件、临时文件与锁文件归 settings-local 的秘密保管库，路径由调用者选定。disposer 或关闭只改变本进程内的状态，已经写入磁盘的内容和已经交给发送端的值不可撤回。

## 组合与验证

保管库状态的形状来自 model 的判定函数：本包从保管库快照构造 `CustodianState`，model 不依赖本包。判定对未铸造租户值的处理属于 model，本包不补。文件机制（锁、原子发布、读分类、故障注入）在 settings-local 的 `tests/secrets/` 验证，本包不重复。

持续验证在 [tests](tests/index.md)。各测试覆盖的义务如下：

- [credential.spec.ts](tests/credential.spec.ts)：五种结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新、未铸造租户的拒绝，以及根入口不导入 Cordis。
- [credential-management.spec.ts](tests/credential-management.spec.ts)：`bind` 后发送解析到租户秘密、再绑定替换秘密与时刻、绑定后不再给工厂值、他租户持有与未铸造租户得到 `denied`、读不出的文件不改字节、`unbind` 后按缺失处理、空工厂秘密答 `absent`、不可读绑定不回退工厂、旧快照与损坏的时刻，以及受管插件的 `custody` 只在插件存活时可写。每条都扫描可见结果里的秘密哨兵。
- [custodian-options.spec.ts](tests/custodian-options.spec.ts)：建库采用已有文件、诊断容量、锁等待上限内的 `not-written`、三种不可用原因、旧格式快照字段类型不对判为损坏，以及选项取值的拒绝。
- [credential-service.spec.ts](tests/credential-service.spec.ts)：在真实 Cordis 4.0.4 下，服务实例只暴露 `present` 与 `resolve`。
- [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)：插件的发布、空路径建库并服务、撤除、损坏文件上撤除不报错、配置校验，以及损坏文件上的不可用服务。
- [profile-source.spec.ts](tests/profile-source.spec.ts)：来源构造的身份、adoption、revision 与快照证据，摘要用独立算出的夹具核对，路由重复与非法修订在构造时拒绝。
- [profiles-plugin.spec.ts](tests/profiles-plugin.spec.ts)：在真实 Cordis 4.0.4 下，`ModelProfilesLocalPlugin` 发布 `modelProfiles`，每条路由的档案定义与 `officialOpenAiProfiles` 逐字段相同，`list` 与 `resolve` 的答案，撤除后旧句柄返回 `unavailable`，非法配置使加载失败，并与档案替身对拍。
- [deliver-injected.spec.ts](tests/deliver-injected.spec.ts)：在真实 Cordis 4.0.4 下，注入发送的模块边界、提供者缺席、恢复、重装后结果不变、更替与非服务对象。
- [send-resources.spec.ts](tests/send-resources.spec.ts)：用观察凭据槽的传输工厂核对，槽只在 `start` 期间有值，正常返回与抛出后都为空，两个资源互不见对方的值，异物与释放后的物化传输被拒绝且不填槽，`release` 与 `close` 幂等。它还核对连接重试的报告带出每次发送各自的 `call` 与 `dispatch`、探针传输没有观察者；并用真实 pi 传输核对异物物化传输被拒绝，以及传输拒绝的配置在构造时抛出。
- [assembly.spec.ts](tests/assembly.spec.ts)：装配对路由、网络、尝试容量与准备配置的拒绝。`preparation` 的租约经配置的家族取得绑定，并调用配置的 `supplierOf`。`close` 开始后的取得返回具名为 `model-host-local`、`assembly-closed` 的不可用，且不调用 `supplierOf`。关闭前取得的租约在关闭后计量结果不变并能释放。`close` 幂等。
- [plugins-instances.spec.ts](tests/plugins-instances.spec.ts)：真实 Cordis 4.0.4 下两个目录插件的等待、发布、登记与释放、非解析器租户、授权方拒绝、后继目录、失去权威与转换目录的独立。
- [plugins-host.spec.ts](tests/plugins-host.spec.ts)：真实 Cordis 4.0.4 下宿主部分的绑定后发布、四项配置的拒绝、并发上限、唤醒容量满、重复唤醒、调用方 fiber 退出、无可信输入时不驱动、有序关闭的次序与未派发唤醒、后继宿主不接管旧引用、失去依赖、启动窗口卸载时宿主关闭、观察资格与换代路由。
- [runtime-push-bounds.spec.ts](tests/runtime-push-bounds.spec.ts)：同一推送场景。核对每次唤醒的推送上限（R2-D273）：接收方一直答 unavailable 或 backpressured 时一次唤醒只推一次，一直答 outcome-unknown 时推 `1 + maxRedeliveries` 次。性质见 model-contract 的 [formal-mapping.md](../model-contract/verification/models/formal-mapping.md)。
- [runtime-push.spec.ts](tests/runtime-push.spec.ts)：真实 Cordis 4.0.4、真实 model 运行时与内存 `ModelCommands`、脚本传输与脚本接收方（代 agent-host-local 的接收方）。核对：冻结的结果交付与 retained ACK；saved 的四项事实各缺一项时不 ACK；键或证据 owner 不符的回执不算 saved；未知时用原键原载荷重投；ACK 未知时以原操作认回；清理失败保持确认、后继完成清理；没有接收方时等待、登记后推送；正文释放后每个晚到修订一个账目交付；账目在结果 saved 之后；晚到账目超界被拒并可观察、有名额后接受；未知后被拒的重投保持未知；晚到账目接受未知时不归还名额、同一操作重交不另占；卸载等正在接纳的晚到账目并交给后继、停后拒收；两个存活 fiber 争同一 owner；因别的依赖重跑后重新登记；撤除时未完成推送交给后继。启动扫描（模拟重启：新插件类与空账本，同一份内存 `ModelCommands`）：saved 未 ACK 的结果以原键原载荷再推、ACK 并归还份额；已提交而回包丢失的 ACK 只续做清理、不再推送；已结清的调用下次启动不唤醒；未收场的调用不唤醒；扫描被拒时报告警告、custody 不变。
- [runtime-cancel.spec.ts](tests/runtime-cancel.spec.ts)（慢层）：本地 HTTPS 流进行中的 `calls.cancel`。核对：终止在传输报告物理停止之后，已交付内容保留，费用不写零；同租户另一调用照常完成；取消与自然完成同时到达时只有一个终止。
- [runtime-host.spec.ts](tests/runtime-host.spec.ts)（慢层）：真实 Cordis 4.0.4 上的整装配（运行时插件、发送阶段插件、真实 model 运行时、model-storage-sql 的耐久 `ModelCommands` 与协调器）跑 model-contract 的 53 项提供者义务；每项出现一次，失败只允许显式的已知失败表，not-applicable 只允许显式允许表（两张表目前都为空）；`assembly.json` 的实现描述取自实际装出的后端。见[53 项提供者义务](#53-项提供者义务)。
- [line-e2e.spec.ts](tests/line-e2e.spec.ts)（慢层）：线内贯通。一个进程、一个真实 Cordis 4.0.4 根 Context 装出保管库、官方档案、请求准备、发送阶段、运行门面与推送，耐久 `ModelCommands` 用 model-storage-sql 的 `createSqlModelCommands`（命令与发送协调器共核）；走完 准备 → 发送（回放 `openai-tool-call` 合成件，请求摘要等于旁注）→ 持久（关掉并重开 SQLite 文件后新命令读出终态与结果页）→ 推送（接收方替身先 saved，生产方才 ACK，之后清理 released）→ 取消（`exchange-stopped` 先于 settle，终止为该取消的 interrupted）。SQL 提供者是 node:sqlite 文件替身，不覆盖 sqlite-provider 的 Worker、队列与耐久；接收方是脚本替身。设 `OMNE_EVIDENCE_OUT` 时写脱敏 `line-e2e.json`。
- [plugins-preparation.spec.ts](tests/plugins-preparation.spec.ts)：真实 Cordis 4.0.4 下无运行面与网络时的 `prepare`、档案拒绝、租约交还、卸载后查询仍可用、同一命令上的第 2 轮锚点与另一份命令的读不到、卸载后的租约、命令换代。`modelPreparationResources`：经键取得的租约读到注入命令里的调用，键随插件撤除，旧引用拒绝新租约，重装后键恢复；真实插件跑契约成员的两条符合性用例。
- [local-model.spec.ts](tests/local-model.spec.ts)（慢层）：本地 HTTPS 服务回放 OpenAI 与 Anthropic 两个家族录制的 SSE 正文，两家各有一条回复含推理续接状态部件。调用经本地保管库、装配的发送边界、真实 pi 传输、两个家族与 model 运行时。测试核对：请求带保管库解析出的 `Bearer` 占位值；事实以唯一的 `ended` 结束；调用收场，发出记录的终局与之相同；物化回执带该家族记录产出的 `replayFormat`；账目带本次调用的 `subject` 与 `receipt: 'received'` 到达内存 `ModelCommands`，并经 `dispatches` 读回；`payableAmount` 得到已知的 `openrouter-credit` 金额；占位值不出现在事实与发出记录中。
- [continuation.spec.ts](tests/continuation.spec.ts)（慢层）：两家各让一次带推理状态的调用 X 经装配收场、读取、确认并释放请求材料，再用 `preparation` 的真实租约与真实家族计量器计量延续 X 的下一次请求。测试核对：锚点命中；金额等于 X 的 `input`、`cache-read` 与 `cache-write` 之和加新增部分的估算；余量只按估算部分计算；方法名以 `+continuation-anchored/1` 结尾；带 X 回复的请求比不带时恰好多 X 的输出 token 数。另一租户声明 X 时，计量结果与声明一个不存在的调用逐字节相同。
- [send-stage.spec.ts](tests/send-stage.spec.ts)：真实 Cordis 4.0.4 下发送阶段插件的装载与卸载（服务发布与撤回，缺凭据服务时等待，随凭据服务卸载，配置与装配被拒时什么都不建）、凭据槽、退出后的发送、退出时在途的发送，以及卸载等发送路径关闭。慢层用例把四份真实回放件经插件的 `modelSendBoundary` 回放，并与装配路径在同一用例里对比事实、请求与发出记录。另有一条慢层用例：本地前置 TCP 端口丢弃第一条连接（请求字节未发出），经插件重试后调用 completed，Cordis logger 恰好收到一条含调用标识、重试序号、延迟与原因的 `warn`。
- [recording-replay.spec.ts](tests/recording-replay.spec.ts)（慢层，门禁）：把 pi-ai-transport 的四份真实回放件逐一经装配路径回放，核对收场、唯一终止、推理状态与回放格式、请求摘要可复现、账目经真实路径到达，以及占位凭据只出现在 `Authorization` 头里。它还回放两个工具调用用例的合成回放件：请求带 function 形状的工具、`tool_choice` 为 `auto`、推理档位为 `medium`，首轮以工具建议收场；延续轮带首轮回复里的工具调用与推理状态，再带工具结果；录制器把合成流原样写出，旁注摘要等于发出请求体的摘要，密钥模式命中时不写文件，回复没有工具调用时不写文件。合成回放件是手写数据，不证明真实模型的输出。
- [recording-c9.spec.ts](tests/recording-c9.spec.ts)（慢层）：两家各计量一次延续真实首轮的请求，再回放延续轮，记录发送前计量与真实输入合计之差。差值只记录，不是门槛。
- [recorder.spec.ts](tests/recorder.spec.ts)（慢层）与 [secret-scan.spec.ts](tests/secret-scan.spec.ts)（快层）：录制器写出的字节与旁注、不写文件的情形，以及密钥扫描。录制器的规则见 [tests/README.md](tests/README.md)。

未覆盖：网络文件系统与跨机器的锁语义，崩溃后残留锁的自动恢复，进程重启后的推送恢复只在同一进程内模拟（新插件类、空账本、同一份内存 `ModelCommands`），没有在真实进程重启和 SQL `ModelCommands` 的 `pending` 分页上验证，以及本包以外的宿主能力。经真实厂商或代理的发送只经手动录制器验证。证据是 [`pi-ai-transport/tests/fixtures/recordings/`](../pi-ai-transport/tests/fixtures/README.md) 的四份回放件，门禁回放（[recording-replay.spec.ts](tests/recording-replay.spec.ts)）走同一装配路径。耐久的 `ModelCommands` 不在本包；本包在整装配上跑它的 53 项义务（[runtime-host.spec.ts](tests/runtime-host.spec.ts)），SQL 存储是 node:sqlite 测试提供者，不覆盖真实 sqlite-provider 的 Worker、耐久性与关闭。
