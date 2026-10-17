# @omne-harness/model-host-local 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包只承载本地凭据保管：文件保管库及装载它的 Cordis 插件。时钟、实例调度、目录装载与托管运行插件不在本包当前范围，没有实现也不由本文件承诺。

凭据引用、查询、五种结果和 `CredentialPort` 的形状及持有者语义归 [model-contract](../model-contract/SPEC.md)。存在性与解析的判定归 [model 的 SPEC](../model/SPEC.md#凭据引用与解析)：本包把当前状态快照交给判定函数，不自己判定。`modelCredential` 服务定义归 [model-cordis-contract](../model-cordis-contract/SPEC.md)，本包的插件继承它。目标归属见[组架构](../docs/architecture.md#凭据切片的现有装配边界)。

## 结果与不变量

### 保管库文件

保管库文件包含工厂秘密和绑定列表。绑定寿命是 `active`、`revoked` 或 `unreadable`。

- `createLocalCustodian(path, factorySecret)` 在 `path` 处新建保管库，覆盖已有文件，只用于初始化。
- `openLocalCustodian(path)` 打开已有保管库。文件缺失、损坏，或同一持有者出现多行冲突时返回 `{ kind: 'unavailable' }`，不新建、不修改文件。

### 读取与刷新

`present` 和 `resolve` 先按用途和发送资格拒绝：保管已关闭、用途不符，或 `resolve` 的发送未获准时返回 `denied`，此时不读磁盘。通过这道检查后，它们每次从磁盘刷新当前状态，再把快照交给判定。因此保留的句柄和 Cordis 服务都能观察到其他进程或句柄造成的轮换、撤销或文件损坏。刷新失败返回 `unavailable`，不改文件。

诊断留在保管库句柄上，只记录结果种类与租户是否匹配，不含秘密；Cordis 服务不转发诊断。

### 管理操作

`put`、`rotate`、`revoke`、`markUnreadable` 写盘前先持文件锁并刷新，基于当前状态修改后发布。

- `put` 把该持有者写成 `active`，可以盖过已撤销或读不出的行。
- `rotate` 只换秘密，不改寿命；已撤销的行轮换后 `resolve` 仍是 `denied`。
- `revoke` 把该持有者标成 `revoked`。
- `markUnreadable` 只把 `active` 改成 `unreadable`。
- 其他租户持有同一身份时，对它的 `put`、`rotate` 不替换也不改动本租户的行。

文件锁不按时间过期，因此持锁进程活着时其他写者只能等待，超过 30 秒抛出 `ELOCKED`。持锁进程崩溃后残留的 `${path}.lock` 须在所有写者停止后手工删除。

### 发布与确认未知

写入采用唯一临时文件、`fsync` 和重命名，再同步父目录。

- 发布前失败（锁等待超时、临时文件写入失败、`fsync` 失败或重命名失败）时抛出异常，不发布新状态，已确认的旧快照保持不变。短写会重试到整份快照写完；写入没有进展时中止。
- 重命名成功后确认失败（如父目录 `fsync`）时，新状态可能已发布，抛出 `confirmation incomplete; verify state before retry`。调用方必须核实当前文件状态后再决定重试。

### 关闭

`close()` 只把当前进程标成关闭，随后的 `present` 和 `resolve` 返回 `denied`。关闭不删除绑定，不把停止状态写入保管库文件，也不改写已经交给发送端的值。关闭之后的管理操作仍会持久化；下一个进程按文件里的绑定读取。

## 所有权、失败与生命周期

### 插件

`LocalCredentialPlugin` 继承 model-cordis-contract 的 `ModelCredentialService`，不另写键。配置是 `path`（非空字符串）和 `factorySecret`（字符串，空字符串合法）；配置不合格时插件加载失败。回调和已打开的存储对象不进配置。

- 路径上没有文件：用配置里的工厂秘密新建保管库。
- 路径上已有文件：打开并使用文件里的工厂秘密，不用本次配置里的值。
- 文件损坏：插件仍然注册 `modelCredential`，`present` 和 `resolve` 返回 `unavailable`，不改文件；撤除时没有可关闭的保管库。
- 保管库只存在于构造时创建的闭包里，不是实例属性，经 `ctx.modelCredential` 取不到保管库及其管理操作。
- 插件撤除时关闭保管库。关闭挂在装载插件的 fiber 上，没有额外等待在途解析。

插件不从 `ctx`、实例或谁装了它推断租户；租户、用途和发送资格是 `resolve` 的参数，由受信的发送边界提供。

### 注入发送

`deliverInjected` 经静态 `inject` 取得 `modelCredential` 并调用 model 的 `deliver`。它只经服务取得凭据，不打开保管库。

- 没有提供者时不取得任何值，也不发送：`outcome()` 保持 `undefined`，注入的 fiber 继续等待。提供者出现后，这次注入完成一次并给出结果；结果一经产生不再改变。
- 提供者撤除后重新装载，之后新发起的注入发送取得重装后的提供者。已经产生的结果不变。
- 同一 isolate 只有一个 `modelCredential` 提供者：另一个提供者在旧提供者仍存活时注册会被 Cordis 拒绝，旧提供者继续服务。旧提供者撤除后，另一个 `ModelCredentialService` 子类可以接替，之后的发送使用它；对已撤除的旧 fiber 再次撤除不影响接替者。
- 注入到的对象不是 `ModelCredentialService` 时，发送结果是 `{ sent: false }`。

### 资源所有权

保管库文件、临时文件与锁文件归调用者选定的 `path`。disposer 或关闭只改变本进程内的状态，已经写入磁盘的内容和已经交给发送端的值不可撤回。

## 组合与验证

保管库状态的形状来自 model 的判定函数：本包构造 `CustodianState`，model 不依赖本包。判定对未铸造租户值的处理属于 model，本包不补。

持续验证在 [tests](tests/index.md)：[credential.spec.ts](tests/credential.spec.ts) 覆盖五种结果、租户隔离、轮换与撤销、文件损坏、关闭、跨进程更新、文件锁与保存确认未知；[credential-service.spec.ts](tests/credential-service.spec.ts) 在真实 Cordis 4.0.4 下核对服务实例只暴露 `present` 与 `resolve`；[cordis-entry.spec.ts](tests/cordis-entry.spec.ts) 核对插件的发布、撤除与配置校验；[deliver-injected.spec.ts](tests/deliver-injected.spec.ts) 在真实 Cordis 4.0.4 下核对注入发送的模块边界、提供者缺席、恢复、更替与非服务对象。未覆盖：网络文件系统与跨机器的锁语义，崩溃后残留锁的自动恢复，以及本包以外的宿主能力。
