# @omne-harness/model-host-local 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包承载两项能力：本地凭据保管（文件保管库及装载它的 Cordis 插件），以及本地发送路径（生产发送资源 `createPiSendResources` 与本地 Model 装配 `assembleLocalModel`）。装配同时接入 model 的计量准备资源。时钟、实例调度、目录装载与托管运行插件不在本包当前范围，没有实现也不由本文件承诺。

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
- `close()` 开始后，`preparation.acquire` 返回 `{ kind: 'unavailable', dependency: 'pi-send-resources', diagnostic: 'send-resources-closed' }`，与关闭后的发送资源相同，不调用 `supplierOf`，不取得绑定。
- `close()` 不释放租约。关闭前取得的租约持有自己的绑定，关闭后仍可计量，直到取得它的调用方调用 `release`。家族计量器是纯函数，不持有网络资源。
- 装配的 `close()` 重复调用返回同一结果。发送资源关闭失败时，网络资源仍然关闭，之后抛出该失败。
- 关闭只改变本进程内的状态。已经发出的请求与上游已经产生的费用不可撤回。

### 资源所有权

保管库文件、临时文件与锁文件归调用者选定的 `path`。disposer 或关闭只改变本进程内的状态，已经写入磁盘的内容和已经交给发送端的值不可撤回。发布路径在成功、失败和异常时都关闭自己打开的临时文件与目录描述符。

## 组合与验证

保管库状态的形状来自 model 的判定函数：本包构造 `CustodianState`，model 不依赖本包。判定对未铸造租户值的处理属于 model，本包不补。

持续验证在 [tests](tests/index.md)：[credential.spec.ts](tests/credential.spec.ts) 覆盖五种结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新、文件锁、保存确认未知与发布路径关闭文件描述符；[custodian-options.spec.ts](tests/custodian-options.spec.ts) 覆盖建库采用已有文件、诊断容量、锁等待上限与超时的 `ELOCKED` 代码、非锁错误、三种不可用原因及其 `cause`、快照字段类型不对判为损坏，以及选项取值的拒绝；[credential-service.spec.ts](tests/credential-service.spec.ts) 在真实 Cordis 4.0.4 下核对服务实例只暴露 `present` 与 `resolve`；[cordis-entry.spec.ts](tests/cordis-entry.spec.ts) 核对插件的发布、空路径建库并服务、撤除、损坏文件上撤除不报错、配置校验与损坏文件上的不可用服务；[deliver-injected.spec.ts](tests/deliver-injected.spec.ts) 在真实 Cordis 4.0.4 下核对注入发送的模块边界、提供者缺席、恢复、重装后结果不变、更替与非服务对象。[send-resources.spec.ts](tests/send-resources.spec.ts) 用观察凭据槽的传输工厂核对：槽只在 `start` 期间有值，正常返回与抛出后都为空，两个资源互不见对方的值，异物与释放后的物化传输被拒绝且不填槽，`release` 与 `close` 幂等；它还用真实 pi 传输核对异物物化传输被拒绝，以及传输拒绝的配置在构造时抛出。[assembly.spec.ts](tests/assembly.spec.ts) 核对装配对路由、网络、尝试容量与准备配置的拒绝，`preparation` 的租约经配置的家族取得绑定并调用配置的 `supplierOf`，`close` 开始后的取得返回与发送资源相同的不可用且不调用 `supplierOf`，关闭前取得的租约在关闭后计量结果不变并能释放，以及 `close` 幂等。[local-model.spec.ts](tests/local-model.spec.ts) 属于慢层：它用本地 HTTPS 服务回放 OpenAI 与 Anthropic 两个家族录制的 SSE 正文（两家各有一条回复含推理续接状态部件），经本地保管库、装配的发送边界、真实 pi 传输、两个家族与 model 运行时驱动调用，核对请求带保管库解析出的 `Bearer` 占位值、事实以唯一的 `ended` 结束、调用收场且发出记录的终局与之相同、物化回执带该家族记录产出的 `replayFormat`、账目带本次调用的 `subject` 与 `receipt: 'received'` 到达内存 `ModelCommands` 并经 `dispatches` 读回、`payableAmount` 得到已知的 `openrouter-credit` 金额，以及占位值不出现在事实与发出记录中。[continuation.spec.ts](tests/continuation.spec.ts) 也属于慢层：两家各让一次带推理状态的调用 X 经装配收场、读取、确认并释放请求材料，再用 `preparation` 的真实租约与真实家族计量器计量延续 X 的下一次请求。它核对锚点命中，金额等于 X 的 `input`、`cache-read` 与 `cache-write` 之和加新增部分的估算，余量只按估算部分计算，方法名以 `+continuation-anchored/1` 结尾，带 X 回复的请求比不带时恰好多 X 的输出 token 数；另一租户声明 X 时，计量结果与声明一个不存在的调用逐字节相同。

未覆盖：网络文件系统与跨机器的锁语义，崩溃后残留锁的自动恢复，以及本包以外的宿主能力。发送路径没有经真实厂商或代理验证。耐久的 `ModelCommands` 不在本包。
