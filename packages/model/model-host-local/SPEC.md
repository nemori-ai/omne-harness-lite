# @omne-harness/model-host-local 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包承载四项能力：本地凭据保管（文件保管库及装载它的 Cordis 插件）；本地发送路径（生产发送资源 `createPiSendResources` 与本地 Model 装配 `assembleLocalModel`），装配同时接入 model 的计量准备资源；单机宿主插件（实例目录、转换目录、宿主驱动、运行门面 `modelRuntime` 与结果推送、请求准备及其计量租约，以及发送阶段）；以及官方档案读取（`ModelProfilesLocalPlugin`，来源构造 `createOfficialProfileSource` 不出本包公开入口）。恢复扫描、重试与目录阶段插件不在本包当前范围，没有实现也不由本文件承诺。

发送资源满足 model 的 `SendResources` 端口，端口形状与发送边界的行为归 [model 的 SPEC](../model/SPEC.md)。传输、家族贡献、网络资源与路由的形状和行为归 [pi-ai-transport](../pi-ai-transport/SPEC.md)。秘密不进入请求、发出记录、失败、扩展或遥测的要求归 [model-contract](../model-contract/SPEC.md)。

凭据引用、查询、五种结果和 `CredentialPort` 的形状及持有者语义归 [model-contract](../model-contract/SPEC.md)。存在性与解析的判定归 [model 的 SPEC](../model/SPEC.md#凭据引用与解析)：本包把当前状态快照交给判定函数，不自己判定。`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/SPEC.md)，本包的插件继承它。目标归属见[组架构](../docs/architecture.md#凭据的现有装配边界)。

## 结果与不变量

### 保管库文件

保管库文件包含工厂秘密和绑定列表。绑定寿命是 `active`、`revoked` 或 `unreadable`。

- `createLocalCustodian({ path, factorySecret, lock?, diagnosticsCapacity? })`：路径上没有文件时新建保管库；已有可读文件时在锁内直接采用它（不覆盖，不用本次的工厂秘密）；文件存在但不可读时抛出异常，异常的 `cause` 是读不出的原因（文件系统错误、解析错误或形状错误）。先检查再创建都在同一把锁内完成，两个进程同时在空路径上启动不会互相抹掉绑定。
- `openLocalCustodian({ path, lock?, diagnosticsCapacity? })` 打开已有保管库，返回 `{ kind: 'open', custodian }`。文件缺失返回 `{ kind: 'unavailable', cause: 'missing' }`；损坏、形状不对或同一持有者多行冲突返回 `cause: 'corrupt'`；其他文件系统错误返回 `cause: 'io'`。不新建、不修改文件。
- `lock.waitMs`（默认 30 000）与 `lock.backoffMs`（默认 50）是等待文件锁的上限与重试间隔；每次重试前的停顿不超过剩余的等待时间，所以 `backoffMs` 大于 `waitMs` 时总等待仍以 `waitMs` 为上限。`diagnosticsCapacity`（默认 256）是句柄保留的最近诊断条数。只有未给出（`undefined`）的值取默认值。`waitMs` 与 `backoffMs` 须是有限的非负整数，`diagnosticsCapacity` 须是有限的正整数，`lock` 给出时须是对象；其他值（含 `null`、`NaN`、`Infinity`、负数、小数与非数字，以及不是对象的 `lock`）让 `createLocalCustodian` 与 `openLocalCustodian` 抛出 `TypeError`，不取锁也不读盘。

### 读取与刷新

`present` 和 `resolve` 先按租户、用途和发送资格拒绝：租户未铸造、保管已关闭、用途不符，或 `resolve` 的发送未获准时返回 `denied`，此时不读磁盘。通过这道检查后，它们每次从磁盘刷新当前状态，再把快照交给判定。因此保留的句柄和 Cordis 服务都能观察到其他进程或句柄造成的轮换、撤销或文件损坏。刷新失败返回 `unavailable`，不改文件。

诊断留在保管库句柄上，只记录结果种类与租户是否匹配，不含秘密；Cordis 服务不转发诊断。

### 管理操作

`put`、`rotate`、`revoke`、`markUnreadable` 写盘前先持文件锁并刷新，基于当前状态修改后发布。刷新失败时抛出异常，不改文件；异常信息带 `missing`、`corrupt` 或 `io`，`cause` 是读不出的原因。

- 租户未经铸造（例如复制出的对象）时，`put`、`rotate`、`revoke`、`markUnreadable` 都先抛出异常，不取锁、不读盘也不写盘。`put` 若放行，磁盘记录读回时会按文本重新铸造，复制出的租户会变成真实租户的绑定；其余三个操作对这样的租户匹配不到任何行，放行只会空跑一次取锁与发布，并让调用者以为已经生效。
- `put` 把该持有者写成 `active`，可以盖过已撤销或读不出的行。
- `rotate` 只换秘密，不改寿命；已撤销的行轮换后 `resolve` 仍是 `denied`。
- `revoke` 把该持有者标成 `revoked`。
- `markUnreadable` 只把 `active` 改成 `unreadable`。
- 其他租户持有同一身份时，对它的 `put`、`rotate` 不替换也不改动本租户的行。

文件锁不按时间过期，因此持锁进程活着时其他写者只能等待，等满 `lock.waitMs` 仍未取得锁时抛出 `ELOCKED`；`waitMs` 为 0 时第一次取不到锁就抛出。持锁进程崩溃后残留的 `${path}.lock` 须在所有写者停止后手工删除。

### 发布与确认未知

写入采用唯一临时文件、`fsync` 和重命名，再同步父目录。

- 发布前失败（锁等待超时、临时文件写入失败、`fsync` 失败或重命名失败）时抛出异常，异常的 `cause` 是原始错误，不发布新状态，已确认的旧快照保持不变。短写会重试到整份快照写完；写入没有进展时中止。
- 重命名成功后确认失败（如父目录 `fsync`）时，新状态可能已发布，抛出 `confirmation incomplete; verify state before retry`。调用方必须核实当前文件状态后再决定重试。

### 保管库初始化命令

`src/vault-init.ts` 的核心 `initVault(path, deps)` 与 `src/vault-init-cli.ts` 的命令行外壳，让人在宿主上从终端把一个密钥写成保管库的工厂秘密。命令不是插件，不属于 `LocalCredentialPlugin`，不从根入口导出。它只经 `createLocalCustodian` 建库，所以沿用文件锁与原子发布；只建工厂秘密，不写任何租户绑定，也不在别处另存密钥。保管库记录格式与 `store.ts` 的行为不变。

运行责任在人：密钥由 PanQiWei 或该宿主的操作人在自己的终端输入，每台要发真实请求的宿主运行一次。Reduce、写者与其他 agent 不取密钥值，也不代为运行。

`initVault` 按下面的顺序执行，任一步失败即停止并返回失败原因代码：

1. 路径必须非空且不含 NUL（`path-invalid`）。
2. 路径必须位于当前用户目录之下。命令取 `os.homedir()` 的真实路径，再取路径中最近一个已存在的父目录的真实路径，加上尚不存在的名字；结果不在用户目录之下时拒绝（`path-outside-home`）。因此目录外路径、`..` 越出、名字只以用户目录名开头的同级目录，以及经符号链接（含 Windows 目录联接）指向目录外的路径，都被拒绝。用户目录本身也被拒绝。父目录不可检查或不是目录时返回 `path-check-failed`。
3. 路径上不能有任何对象：有效保管库、损坏文件、空文件、目录、符号链接（含悬空链接）一律拒绝（`path-occupied`），不读、不改其字节与权限，也不调用读密钥函数与 `createLocalCustodian`。`createLocalCustodian` 会采用路径上已有的可读文件，所以这个预检由命令自己做。
4. 调用注入的读密钥函数一次。去首尾空白后为空时拒绝（`secret-empty`）；含控制字符时拒绝（`secret-malformed`）；读取器放弃时给出 `input-not-terminal`、`input-cancelled` 或 `input-failed`。
5. 再检查一次路径上无对象，因为人输入密钥可能花很长时间。
6. 在权限护栏内建库：先建缺失的父目录，再经 `createLocalCustodian` 新建文件，随后确认文件确实以这个密钥为工厂秘密（用 `openLocalCustodian` 读回并解析工厂凭据）。读回的工厂秘密不是这个密钥时返回 `write-unconfirmed`：这表示库函数采用了别人写的文件，命令不删除、不改动它。
7. 收窄并读回权限（见下）。失败时删除刚建的文件（只删读回为本次密钥的文件）与本次新建的空目录，返回 `permission-failed`。

文件锁等待沿用库函数默认值，超过时返回 `lock-timeout`；其他写入失败返回 `write-failed`，并删除本次新建的文件和空目录。命令不覆盖也不删除已有目录。

#### 失败原因表

| 原因代码                                                     | 含义                                                        | 文件系统结果                     |
| ------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------- |
| `path-invalid`                                               | 路径为空或含 NUL                                            | 不变                             |
| `path-outside-home`                                          | 真实路径不在当前用户目录之下                                | 不变                             |
| `path-check-failed`                                          | 父目录不可检查或不是目录                                    | 不变                             |
| `path-occupied`                                              | 路径上已有对象（含输入密钥期间出现的对象）                  | 不变，对象字节与权限不动         |
| `input-not-terminal`                                         | 标准输入不是终端                                            | 不变                             |
| `input-cancelled`                                            | 人取消（Ctrl-C、空行上的 Ctrl-D）、流结束或进程收到中断信号 | 不变                             |
| `input-failed`                                               | 读取失败                                                    | 不变                             |
| `secret-empty`                                               | 去首尾空白后为空                                            | 不变                             |
| `secret-malformed`                                           | 含控制字符                                                  | 不变                             |
| `lock-timeout`                                               | 等满锁等待仍未取得文件锁                                    | 删除本次新建的空目录             |
| `write-failed`                                               | 建库或建目录失败                                            | 删除本次新建的文件与空目录       |
| `write-unconfirmed`                                          | 建库返回，但文件的工厂秘密不是本次密钥                      | 不动该文件；删除本次新建的空目录 |
| `permission-failed`                                          | 权限收窄或读回失败                                          | 删除本次新建的文件与空目录       |
| `argument-missing`、`argument-duplicate`、`argument-unknown` | 命令行参数不对（仅外壳，退出码 2）                          | 不变                             |
| `secret-in-argv`                                             | 参数的名字像在携带密钥（仅外壳，退出码 2）                  | 不变                             |

#### 输入

外壳只在标准输入是终端时读密钥：先关闭回显（原始模式），读到回车、换行或放弃为止，再还原进入前的原始模式。终端在读完、取消、流结束或出错、收到中断信号、进程退出时都还原；非终端在设置原始模式、打印提示与挂监听之前就被拒绝。读取时忽略方向键等控制序列，退格删除前一个字符，输入不回显。还原发生在写盘之前。进程被 SIGKILL 结束、终端断开或断电时，还原代码不能执行，这不在承诺内。

密钥不经命令行参数或环境变量传入。参数名含 `secret`、`key`、`token`、`passw` 或 `credential` 的参数以 `secret-in-argv` 拒绝，其他未知参数以 `argument-unknown` 拒绝，两者都不回显参数内容。

#### 输出

成功时标准输出一行 `已建立：<保管库路径>`，退出码 0。失败时标准错误一行 `失败：<原因代码>`，参数不对时退出码 2，其他失败退出码 1。标准错误在读密钥前还有一行提示。密钥、其哈希或前缀不出现在任何输出、错误信息、`cause` 链、命令行参数或命令设置的环境变量里：失败结果只有原因代码，读取器与库函数抛出的异常不转抄进结果。`--help` 打印用法，退出码 0。

#### 权限

- POSIX：命令在文件创建掩码 `077` 下建目录与文件，随后把新建目录设为 `0700`、文件设为 `0600`，并读回模式，不符即失败。已有的父目录不改模式。掩码在创建结束后还原，包括创建抛出异常时。
- Windows：没有 POSIX 模式位，命令不改访问控制列表，也不调用 `icacls`。保护来自新建目录与文件从其父目录继承的访问控制，而用户目录默认只授予该用户、管理员与系统账户。这个保护的前提有三点：路径位于当前用户目录之下（命令强制）；该用户目录的访问控制没有被改成对其他账户开放；父目录在命令运行前已存在的部分，其访问控制由运行者负责。命令无法读回访问控制列表，所以 Windows 上的权限校验只是路径规则，不是读回断言。

#### 已知限制

- 第 5 步的预检与 `createLocalCustodian` 取得文件锁之间有一个竞态窗口：本机的另一个进程恰好在这时写入同一路径，库函数会采用它。命令用读回比对（第 6 步）发现采用，报告 `write-unconfirmed`，但不能阻止窗口的存在。本命令由本机单人运行，这个窗口被接受。
- 第 2 步校验之后，路径上的目录若被换成指向目录外的符号链接，命令不再发现。同样是本机单人运行下接受的窗口。
- Windows 的访问控制只靠继承（见上），不读回。
- 命令自己刚建的文件在第 6 步读回时若碰上瞬时 I/O 故障（例如 Windows 上杀毒软件临时占用文件，读回抛 `EBUSY`），`openLocalCustodian` 返回读不出，命令报告 `write-unconfirmed` 并保留那份带密钥的文件。原因代码分不出「采用了别人的文件」与「自己的文件暂时读不了」，两者的处置都落在文件内容上：操作者先打开该文件检查它的工厂秘密是不是自己刚输入的密钥，再决定保留还是手工删除后重跑。命令自身此时不删文件，因为删掉可能是别人的库。
- 命令只建新库，不提供轮换、撤销与租户绑定。

### 关闭

`close()` 只把当前进程标成关闭，随后的 `present` 和 `resolve` 返回 `denied`。关闭不删除绑定，不把停止状态写入保管库文件，也不改写已经交给发送端的值。关闭之后的管理操作仍会持久化；下一个进程按文件里的绑定读取。

### 发送资源

`createPiSendResources({ network, families, routes, limits })` 返回生产 `SendResources`。

- 构造时，发送资源用一个空凭据槽建一个探针传输，检查配置。传输拒绝的配置（路由不是纯 `https:` 地址、限额越界、家族贡献或网络资源不合格）让构造抛出 `RangeError`。探针不发送，在 `close` 中关闭。
- 每次 `acquire` 建一个新的 pi 传输。这个传输的凭据槽是本资源的私有闭包，其他资源读不到它。网络资源与家族贡献由所有资源共享。
- 资源的 `transport.prepare` 委托给本资源的 pi 传输，并记下它交出的每个物化传输。
- `startWithCredential(materialized, value, signal)` 先核对 `materialized` 出自本资源。不是本资源交出的物化传输让调用抛出 `SendResourceDefect`，`reason` 为 `foreign-materialization`；资源释放后调用抛出 `SendResourceDefect`，`reason` 为 `resource-released`。这两种情形都不填槽，也不发送。
- 核对通过后，资源填入凭据，同步调用 `materialized.start(signal)`，在 `finally` 中清空凭据槽。`start` 正常返回或抛出时，槽都在 `startWithCredential` 返回前清空。pi 传输在 `start` 的同步调用内读槽一次，所以凭据只在这次调用期间存在。
- `SendResourceDefect` 的消息只含原因。凭据值不得出现在事实、诊断、失败、异常消息或日志中。
- `release()` 关闭本资源的 pi 传输，并等待关闭完成。重复调用返回同一结果，传输只关闭一次。
- `close()` 拒绝之后的 `acquire`，后者返回 `{ kind: 'unavailable', dependency: 'pi-send-resources', diagnostic: 'send-resources-closed' }`。`close()` 释放仍打开的资源，关闭探针，等待它们完成；第一个失败在全部完成后抛出。重复调用返回同一结果。`close()` 不关闭网络资源。

### 本地 Model 装配

`assembleLocalModel(config)` 组合本地发送路径与计量准备资源，返回 `{ send, preparation, close }`。

- 配置项是 `credentials`（`CredentialPort`，如本地保管库）、`commands`（`ModelCommands`）、`coordinator`（`SendCoordinator`）、`families`（组合后的 `PiFamilyContributions`）、`network`（`NetworkConfig`，含代理与 TLS）、`routes`、`transportLimits`、`maxRetainedAttempts` 与 `preparation`。`preparation` 有两项：`maxCitedCalls`（一个 lineage 最多引用的不同调用数）与 `supplierOf`（model 的 `SupplierPort`，为档案供应商补上凭据引用）。
- 本包不写任何路由地址、代理、限额或余量的默认值。OpenRouter 的地址必须由配置的 `routes` 给出。计量余量是家族配置的一部分，由调用方组合家族时给出。
- 装配从 `network` 创建网络资源，用它们与 `families`、`routes`、`transportLimits` 建发送资源，再用 `commands`、`coordinator`、`credentials`、发送资源与 `maxRetainedAttempts` 建 model 的发送边界 `send`。
- 装配用 model 的 `createModelPreparationResources` 建 `preparation`：绑定来源是 `families`，调用事实经同一个 `commands` 的 `dispatches` 读取，`supplierOf` 与 `maxCitedCalls` 取自 `preparation` 配置。租约的取得、读取、判决与释放归 [model 的 SPEC](../model/SPEC.md)。
- 网络、传输、发送边界或准备资源拒绝配置时（`preparation` 不是对象也算），装配抛出 `RangeError`，并关闭它已创建的网络资源。
- 发送边界在发送围栏内同步解析凭据，经 `startWithCredential` 交给本次发送的私有槽。传输交出的事实原样经发送边界交给调用方；账目事实经 model 运行时的接收路径到达 `commands.preserve`，由 `commands` 补全、去重与替换修订。
- 生产代码不导入任何 `testing` 模块。`commands` 与 `coordinator` 由调用方注入；内存版 `ModelCommands` 只用于装配测试，不是生产保管。

### 宿主插件

四个插件从 `./cordis` 导出。名称、注入键与责任以 [model 的装配设计](../model/docs/cordis.md#单机提供者的插件划分)为准，本包实现它。

- `ModelInstancesLocalPlugin` 与 `ModelConvertersLocalPlugin` 分别继承契约包的目录服务，静态注入 `modelPublicationAuthority` 与 `modelConverterAuthority`。权威缺席时 fiber 停在等待，不发布服务。权威换代或撤除时 Cordis 连同目录一起卸载再装载，后继目录从空开始，旧目录登记的 handle 不由它服务。非解析器租户的 `connect` 返回 `invalid`，字段为 `tenant`。
- 宿主部分由 `createModelRuntimeLocalPlugin(options)` 造出的类装载，静态注入 `modelCommands`、`modelClock`、`modelHostAuthority`，发布 `modelInstanceHost`；提供者带 `runtime` 时同时发布 `modelRuntime`，见[运行门面与结果推送](#运行门面与结果推送)。配置是 `concurrencyLimit`、`wakeCapacity`、`scanBatchSize` 与 `scanIntervalMs`，四项必需，正整数（`scanIntervalMs` 为非负整数），其余取值让加载失败，不取默认值。`scanBatchSize` 与 `scanIntervalMs` 由恢复扫描消费，宿主本身不用。
- `bind` 是插件与本域执行宿主之间的装配操作，不在服务面上。同一宿主只认一个 driver：同一对象重复绑定认回原 binding，其他对象返回 `conflict`，已关闭的宿主拒绝新绑定。未绑定或已关闭时 `schedule` 返回 `unavailable`。
- `schedule` 只置唤醒位：同一 tenant/call 已有位时不再入队；等待中的不同调用最多 `wakeCapacity` 个，满了返回 `unavailable`、诊断 `queue-full`，不为它建 Promise。最多 `concurrencyLimit` 个 drive 同时运行，由宿主自己的闭包启动，不挂在调用方 fiber 上。一个正在运行的调用被再次唤醒时保留其位，drive 交还后重跑一次。成功只表示本地唤醒被接受，不是耐久入队。
- drive 输入由 `modelHostAuthority.resolve` 取得。它答失败时（例如取不到旧进程终止证据）宿主不驱动该调用，报告一条诊断；原待办仍在 `ModelCommands` 里，查询与保管由别的服务继续，宿主不把它们算作完成。
- `publish` 只接受当前绑定的代次：同一发布认回原回执，旧代次返回 `stale-instance` 且不夺回路由，较晚代次取代旧路由。`withdraw` 只撤除登记匹配的发布。`directory.connect` 先经装配给的 `qualifyObservation` 核当前观察资格，失败（含 `denied`）原样返回，命中路由不当作授权。
- 有序关闭是一个流程：先 quiesce（`provider.quiesce`，拒绝或抛出只报告），再停派发、发停止信号并等待每个 drive 交还，最后撤发布服务的贡献（Cordis 撤除子插件）。未派发的唤醒明确留给后继，计数写进诊断，不报告为完成。shutdown 不抛出：它之后的撤除若被跳过，服务就撤不掉。
- 发布服务的子插件在 bind 之后、同一个 `try` 里创建。启动窗口里 fiber 被卸载、子插件创建失败时，已绑定的宿主关闭，此后 `schedule` 返回 `unavailable`、诊断 `host-closed`，服务不发布。

### 运行门面与结果推送

运行门面与结果推送是 `ModelRuntimeLocalPlugin` 的运行部分，在 [src/plugins/runtime.ts](src/plugins/runtime.ts)。协议归 model-contract 的[结果推送与保存](../model-contract/SPEC.md#结果推送与保存)与 [ACK 的前提与效果](../model-contract/SPEC.md#ack-的前提与效果)，登记规则归 model-cordis-contract 的[结果接收登记](../model-cordis-contract/SPEC.md#结果接收登记)。本节只写本包的实现。

- **发布。** 提供者带 `runtime` 时，插件在发布 `modelInstanceHost` 的同一个子插件里发布 `modelRuntime`，同样在 bind 之后。`modelRuntime` 是 `ModelRuntimeService` 的子类，四个调用、四个消费方法与 `connect` 转给提供者的 runtime，runtime 只在闭包里。带 `runtime` 而缺 `results` 选项，或有 `results` 而提供者不带 `runtime`，插件加载失败。
- **推送从哪里知道结果。** 插件把自己的命令端口交给提供者。提供者的 `settle` 提交成功后，推送唤醒该调用。推送不从读取推断提交。每个调用有一个唤醒位，同时处理的调用最多 `maxConcurrentCalls` 个，等待的调用不建 Promise。
- **冻结。** 推送以 `modelHostAuthority` 给出的主体读取该调用一次：受理事实、全部发出记录与全部结果页。结果交付的键是规范调用引用与 `Settlement.version`，载荷是冻结的 consumer、真实 Settlement、全部有序结果项与冻结时每个发出的账目快照（没有账目的写 `null`）。冻结后的交付深冻结，此后每次推送与重投都发送同一个值。读取用记录里固定的读操作，ACK 用记录里固定的 ACK 操作。
- **推送与回执。** 接收方按冻结的 `consumer.owner` 从本插件的登记表解析，不重新选择 owner。没有登记时交付保持等待，诊断 `no-receiver`，该 owner 登记时重推。回执的键必须与原键相同，证据的 owner 必须是冻结的 consumer owner，否则不算 saved，交付记为失败并报告 `receipt-mismatch`。`outcome-unknown` 与抛出都算结果未知：用原键与原载荷立即重投，最多 `maxRedeliveries` 次，之后保持未知，下一次唤醒再重投。`unavailable`、`backpressured` 与 `cancelled-before-accept` 使交付等待下一次唤醒。`denied`、`invalid` 与 `conflict` 使交付失败，不自动重推。已经 saved 的交付不被后来的回答改写；未知只被 saved 取代。
- **ACK。** ACK 只接受推送接受过的 saved 回执，这是唯一能到达交接的路径：以固定的 ACK 操作和回执证据调用 `ModelCommands.handoff`，证据种类为 retained。`commit-unknown` 时用同一操作与同一输入重发，最多 `maxRedeliveries` 次，之后记为未知，下一次唤醒继续认回，不换操作，不清理。
- **清理。** ACK 成立后推送推进清理，每轮最多 `maxCleanupSteps` 步。清理失败或受阻时保持已确认，报告 `cleanup-pending`，下一次唤醒或后继插件继续，不撤回确认，不再 ACK。清理释放后推送只留结果键与回执，丢掉正文。
- **晚到账目。** 晚到账目经插件交给提供者的同一个命令端口进入。账目被接受之前先占一个名额：租户待交付账目达到 `maxPendingAccountsPerTenant`，或全部租户达到 `maxPendingAccounts` 时，`recordLateFact` 不提交，返回 `unavailable`（dependency `model-result-push`，诊断 `late-account-capacity`），并报告一条警告。来源仍持有它的报告，有名额后用同一操作重交。同一操作重交不另占名额。接受后推送立即读回这次提交的修订并冻结一个账目交付：键是调用引用、发出与修订，载荷是冻结的 consumer 与账目。同一调用的晚到账目一个接一个接受，每个修订一个交付，不合并。结果冻结时已在快照里的修订不另推。账目交付只在结果 saved 之后推送，正文释放后照常推送，名额在交付 saved 后归还。账目的未知项保持未知，不写零。
- **登记。** 登记规则由契约包的登记表实现：两个存活 fiber 争同一 owner 时后来者 `FAILED`；旧登记属于已卸载或正在卸载的 fiber 时被直接取代，所以插件因别的依赖重跑后重新登记不失败。本插件在每次登记成功后唤醒该 owner 的未完成交付。
- **推送状态的存放。** 推送记录放在装配给出的 `ResultPushLedger` 里，记录里有冻结交付、回执、ACK 与清理状态和待交付账目。账本同一时刻只有一个写者：`claim` 拒绝第二个。`createMemoryResultPushLedger` 是进程内的实现。耐久账本从这个端口接入，本包尚未提供。
- **生命周期。** 撤除时的次序是：quiesce，停派发并等待 drive 交还，停推送（中止在途推送并等待它们结束，未接收的账目写入账本，释放账本），最后撤发布服务的子插件。未完成的推送、ACK、清理与晚到账目留在账本里。拿同一账本装载的后继插件用原键与原载荷继续。启动窗口里插件被卸载时，已绑定的宿主关闭，服务不发布。

已知限制：

- 推送的界从插件选项 `results.limits` 读取，在插件启动时校验，不在插件配置 `Config` 里：`Config` 目前只校验宿主的四项上限。
- 进程内账本随进程消失。进程重启后，已收场而未确认的调用由恢复扫描接续，恢复扫描尚未实现。插件不在时收场的调用不在账本里，也由恢复扫描接续。
- 账本为每个调用留一条小记录（调用引用、consumer 与已交付的账目修订），不逐出。
- 推送不发出 `model-cordis-contract/call-changed` 事件。
- model 运行时的 `quiesce` 尚未实现，撤除时它返回的不可用只写进诊断。
- 模型发送没有重试策略（M2 范围）。

#### 宿主插件的已知限制

- 同一服务键同时只有一个提供者（Cordis 不允许两个）。旧宿主在有序关闭里等 drive 交还时，服务键仍被它占着，此时装载的后继 fiber 失败（`FAILED`），旧宿主退出后没有宿主。失败是响亮的，不静默。需要换宿主时，先等旧宿主退出再装载。`tests/plugins-host.spec.ts` 固定这个行为。
- 关闭时的排空没有上界：`closeNow` 等所有在途 drive 交还，不设超时。忽略停止信号的 driver 会让卸载一直不返回。driver 必须响应传给它的停止信号。上界数值属装配配置，M2 不加这个机制。
- 收到响应头之前的流停顿经本地装配与 Model 运行时调用时，属首内容之前的可重试失败。M2 没有重试策略，调用停在 `retry-not-decided`，仍为 `running`，不形成 Settlement，见 [Model 已实现的调用收场](../model/SPEC.md#已实现的调用收场)。本包的 C4 用例只在首内容之后的一支要求 Settlement 可读。这是 M2 无重试的限制，不是宿主或停顿上界的缺陷。

### 请求准备插件与计量租约

`createModelRequestPreparationPlugin(options)` 交出插件类与该插件的租约来源 `resources`。静态注入只有 `modelCommands`；不依赖 `modelRuntime` 或供应商网络，传输缺席时 `prepare` 照常工作。配置是 `maxCitedCalls`（正整数，必需）。

- `prepare` 先核租户、档案范围、可用性与模态，再经与装配入口相同的 `createModelPreparationResources` 取一份不带 lineage 的租约，按每个绑定的 `rules.plan` 形成参数采用，按次序用 `judgeReplayDeclaration` 与 `judgeFixedModelRequest` 校验，交还租约后返回固定请求。它不计量、不发送。释放失败使这次调用失败，不报告为成功。
- 租约与宿主读同一份 `ModelCommands`：装配与插件都经 `modelCommands` 注入它。所以延续计量读得到同一存储里的调用事实；换一份命令时读不到（`call-unreadable`）。
- 插件卸载时租约来源拒绝新租约（`unavailable`，诊断 `preparation-plugin-unloaded`），`prepare` 同样拒绝。卸载前取得的租约持有自己的调用事实视图，继续可用到释放；释放幂等，释放后的 meter 答 `preparation-lease-released`。
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
- 凭据端口只转发 `present` 与 `resolve` 给注入的服务，不缓存任何值。
- 退出是一个流程：先撤回凭据端口，此后端口返回 `unavailable`，插件不再持有服务。再关闭发送路径：释放发送资源，关闭网络并等待在途交换停止。流程不抛出，关闭失败只记一条不含原因的警告。卸载等它结束。
- 退出时在两步之间的发送不启动传输，也不解析凭据：它以 `not-started` 收场，失败是 `unavailable`，`dependency` 为 `model-credential`，诊断为 `credential-unavailable`。
- 退出后，仍持有旧服务引用的调用方继续得到原发送边界的答复。没有开始过的 dispatch 得到 `not-started`，`dependency` 为 `pi-send-resources`，诊断为 `send-resources-closed`，此时不取得资源，不解析凭据。
- 卸载不收回已经发出的请求。网络关闭让在途交换停止，该交换的终止仍由传输按自己的映射给出。接替的插件建一个新的发送边界，它对已发出的 dispatch 的答复归 model 的发送边界。本包没有测试这两种情形。

## 所有权、失败与生命周期

### 插件

`LocalCredentialPlugin` 继承 model-cordis-contract 的 `ModelCredentialService`，不另写键。配置是 `path`（非空字符串）、`factorySecret`（字符串，空字符串合法），以及可选的 `lock`（`waitMs`、`backoffMs`）与 `diagnosticsCapacity`；三个数值的取值规则与保管库相同。配置不合格时插件加载失败：缺项、类型不对与取值不合格都是不合格，不会被静默丢弃后按默认值加载。回调和已打开的存储对象不进配置。

- 路径上没有文件：用配置里的工厂秘密新建保管库。新建等待文件锁，超过 `lock.waitMs` 时插件加载失败。
- 路径上已有文件：打开并使用文件里的工厂秘密，不用本次配置里的值。
- 文件损坏或读不出：插件仍然注册 `modelCredential`，`present` 和 `resolve` 返回 `unavailable`，不改文件；撤除时没有可关闭的保管库。打开失败的原因不经插件报告：服务面只有 `present` 与 `resolve`，诊断不转发（见[读取与刷新](#读取与刷新)），本包也没有采用别的观测通道；运维在同一路径上调用 `openLocalCustodian` 即得到 `missing`、`corrupt` 或 `io`。
- 保管库只存在于构造时创建的闭包里，不是实例属性，经 `ctx.modelCredential` 取不到保管库及其管理操作。
- 插件撤除时关闭保管库。关闭挂在装载插件的 fiber 上，没有额外等待在途解析。

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

保管库文件、临时文件与锁文件归调用者选定的 `path`。disposer 或关闭只改变本进程内的状态，已经写入磁盘的内容和已经交给发送端的值不可撤回。发布路径在成功、失败和异常时都关闭自己打开的临时文件与目录描述符。

## 组合与验证

保管库状态的形状来自 model 的判定函数：本包构造 `CustodianState`，model 不依赖本包。判定对未铸造租户值的处理属于 model，本包不补。

持续验证在 [tests](tests/index.md)。各测试覆盖的义务如下：

- [credential.spec.ts](tests/credential.spec.ts)：五种结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新、文件锁、保存确认未知，以及发布路径关闭文件描述符。
- [custodian-options.spec.ts](tests/custodian-options.spec.ts)：建库采用已有文件、诊断容量、锁等待上限与超时的 `ELOCKED` 代码、非锁错误、三种不可用原因及其 `cause`、快照字段类型不对判为损坏，以及选项取值的拒绝。
- [credential-service.spec.ts](tests/credential-service.spec.ts)：在真实 Cordis 4.0.4 下，服务实例只暴露 `present` 与 `resolve`。
- [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)：插件的发布、空路径建库并服务、撤除、损坏文件上撤除不报错、配置校验，以及损坏文件上的不可用服务。
- [profile-source.spec.ts](tests/profile-source.spec.ts)：来源构造的身份、adoption、revision 与快照证据，摘要用独立算出的夹具核对，路由重复与非法修订在构造时拒绝。
- [profiles-plugin.spec.ts](tests/profiles-plugin.spec.ts)：在真实 Cordis 4.0.4 下，`ModelProfilesLocalPlugin` 发布 `modelProfiles`，每条路由的档案定义与 `officialOpenAiProfiles` 逐字段相同，`list` 与 `resolve` 的答案，撤除后旧句柄返回 `unavailable`，非法配置使加载失败，并与档案替身对拍。
- [deliver-injected.spec.ts](tests/deliver-injected.spec.ts)：在真实 Cordis 4.0.4 下，注入发送的模块边界、提供者缺席、恢复、重装后结果不变、更替与非服务对象。
- [vault-init.spec.ts](tests/vault-init.spec.ts)：保管库初始化命令：新建与读回、五种已有对象的拒绝、密钥不外泄的各失败点、输入规则、用户目录规则、POSIX 权限与失败时清理、终端回显关闭与还原、命令行参数与退出码。
- [send-resources.spec.ts](tests/send-resources.spec.ts)：用观察凭据槽的传输工厂核对，槽只在 `start` 期间有值，正常返回与抛出后都为空，两个资源互不见对方的值，异物与释放后的物化传输被拒绝且不填槽，`release` 与 `close` 幂等。它还用真实 pi 传输核对异物物化传输被拒绝，以及传输拒绝的配置在构造时抛出。
- [assembly.spec.ts](tests/assembly.spec.ts)：装配对路由、网络、尝试容量与准备配置的拒绝。`preparation` 的租约经配置的家族取得绑定，并调用配置的 `supplierOf`。`close` 开始后的取得返回具名为 `model-host-local`、`assembly-closed` 的不可用，且不调用 `supplierOf`。关闭前取得的租约在关闭后计量结果不变并能释放。`close` 幂等。
- [plugins-instances.spec.ts](tests/plugins-instances.spec.ts)：真实 Cordis 4.0.4 下两个目录插件的等待、发布、登记与释放、非解析器租户、授权方拒绝、后继目录、失去权威与转换目录的独立。
- [plugins-host.spec.ts](tests/plugins-host.spec.ts)：真实 Cordis 4.0.4 下宿主部分的绑定后发布、四项配置的拒绝、并发上限、唤醒容量满、重复唤醒、调用方 fiber 退出、无可信输入时不驱动、有序关闭的次序与未派发唤醒、后继宿主不接管旧引用、失去依赖、启动窗口卸载时宿主关闭、观察资格与换代路由。
- [runtime-push.spec.ts](tests/runtime-push.spec.ts)：真实 Cordis 4.0.4、真实 model 运行时与内存 `ModelCommands`、脚本传输与脚本接收方（代 agent-host-local 的接收方）。核对：冻结的结果交付与 retained ACK；saved 的四项事实各缺一项时不 ACK；键或证据 owner 不符的回执不算 saved；未知时用原键原载荷重投；ACK 未知时以原操作认回；清理失败保持确认、后继完成清理；没有接收方时等待、登记后推送；正文释放后每个晚到修订一个账目交付；账目在结果 saved 之后；晚到账目超界被拒并可观察、有名额后接受；两个存活 fiber 争同一 owner；因别的依赖重跑后重新登记；撤除时未完成推送交给后继。
- [runtime-cancel.spec.ts](tests/runtime-cancel.spec.ts)（慢层）：本地 HTTPS 流进行中的 `calls.cancel`。核对：终止在传输报告物理停止之后，已交付内容保留，费用不写零；同租户另一调用照常完成；取消与自然完成同时到达时只有一个终止。
- [plugins-preparation.spec.ts](tests/plugins-preparation.spec.ts)：真实 Cordis 4.0.4 下无运行面与网络时的 `prepare`、档案拒绝、租约交还、卸载后查询仍可用、同一命令上的第 2 轮锚点与另一份命令的读不到、卸载后的租约、命令换代。
- [local-model.spec.ts](tests/local-model.spec.ts)（慢层）：本地 HTTPS 服务回放 OpenAI 与 Anthropic 两个家族录制的 SSE 正文，两家各有一条回复含推理续接状态部件。调用经本地保管库、装配的发送边界、真实 pi 传输、两个家族与 model 运行时。测试核对：请求带保管库解析出的 `Bearer` 占位值；事实以唯一的 `ended` 结束；调用收场，发出记录的终局与之相同；物化回执带该家族记录产出的 `replayFormat`；账目带本次调用的 `subject` 与 `receipt: 'received'` 到达内存 `ModelCommands`，并经 `dispatches` 读回；`payableAmount` 得到已知的 `openrouter-credit` 金额；占位值不出现在事实与发出记录中。
- [continuation.spec.ts](tests/continuation.spec.ts)（慢层）：两家各让一次带推理状态的调用 X 经装配收场、读取、确认并释放请求材料，再用 `preparation` 的真实租约与真实家族计量器计量延续 X 的下一次请求。测试核对：锚点命中；金额等于 X 的 `input`、`cache-read` 与 `cache-write` 之和加新增部分的估算；余量只按估算部分计算；方法名以 `+continuation-anchored/1` 结尾；带 X 回复的请求比不带时恰好多 X 的输出 token 数。另一租户声明 X 时，计量结果与声明一个不存在的调用逐字节相同。
- [send-stage.spec.ts](tests/send-stage.spec.ts)：真实 Cordis 4.0.4 下发送阶段插件的装载与卸载（服务发布与撤回，缺凭据服务时等待，随凭据服务卸载，配置与装配被拒时什么都不建）、凭据槽、退出后的发送、退出时在途的发送，以及卸载等发送路径关闭。慢层用例把四份真实回放件经插件的 `modelSendBoundary` 回放，并与装配路径在同一用例里对比事实、请求与发出记录。
- [recording-replay.spec.ts](tests/recording-replay.spec.ts)（慢层，门禁）：把 pi-ai-transport 的四份真实回放件逐一经装配路径回放，核对收场、唯一终止、推理状态与回放格式、请求摘要可复现、账目经真实路径到达，以及占位凭据只出现在 `Authorization` 头里。它还回放两个工具调用用例的合成回放件：请求带 function 形状的工具、`tool_choice` 为 `auto`、推理档位为 `medium`，首轮以工具建议收场；延续轮带首轮回复里的工具调用与推理状态，再带工具结果；录制器把合成流原样写出，旁注摘要等于发出请求体的摘要，密钥模式命中时不写文件，回复没有工具调用时不写文件。合成回放件是手写数据，不证明真实模型的输出。
- [recording-c9.spec.ts](tests/recording-c9.spec.ts)（慢层）：两家各计量一次延续真实首轮的请求，再回放延续轮，记录发送前计量与真实输入合计之差。差值只记录，不是门槛。
- [recorder.spec.ts](tests/recorder.spec.ts)（慢层）与 [secret-scan.spec.ts](tests/secret-scan.spec.ts)（快层）：录制器写出的字节与旁注、不写文件的情形，以及密钥扫描。录制器的规则见 [tests/README.md](tests/README.md)。

未覆盖：网络文件系统与跨机器的锁语义，崩溃后残留锁的自动恢复，耐久推送账本与进程重启后的推送恢复，以及本包以外的宿主能力。经真实厂商或代理的发送只经手动录制器验证。证据是 [`pi-ai-transport/tests/fixtures/recordings/`](../pi-ai-transport/tests/fixtures/README.md) 的四份回放件，门禁回放（[recording-replay.spec.ts](tests/recording-replay.spec.ts)）走同一装配路径。耐久的 `ModelCommands` 不在本包。
