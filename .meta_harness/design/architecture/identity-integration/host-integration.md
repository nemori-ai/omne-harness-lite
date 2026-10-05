# T4 宿主迁移接缝

状态：补充设计已采用，实际实现与 M05 仍未完成。采用依据见
[限定决定](../../record/decisions/identity-t4-host-coordinates/decision.md)。BASE 为 `cdd05d1050dc9d7857f7eb3569d834ae4291c4d5`。
本页补齐[插件树协议](plugin-tree.md)在 T2/T3 合入后的精确实施坐标。
它不重写领域业务，也不替代原模型。施工和完整接受仍归[交付](delivery.md)的 T4-S1～S3。

## 宿主观察与错误归属

通用加载器的错误继续只含封闭 code、合法行 id 和位置。原异常对象不能进入树错误、
安全 DTO 或日志。宿主仍须保留原 storage-open、preflight、snapshot、migration、restore、
upgrade-confirm、upgrade-unconfirmed、clock-unreadable 等启动分类和快照位置。
以下接缝只保存进程内观察，不另建资源协调器。

1. 宿主创建一个真实 AssemblyLifetime，并把结构代理交给 loadPluginTree。
   ids、closed、isPristine、tryClaim、isCurrent、close 全部委派给该实例。
2. 代理的 port(id).register 先给同一个 OwnedWork.ready 安装拒绝观察，再向真实端口登记。
   观察只将本行第一个原异常存入宿主私有表，不能抛错或改变 ready 结果。
   登记失败时不得把未接管 work 当成已拥有资源。原 setup/close 的执行仍只有真实 lifetime 负责。
3. loader 的 ready 拒绝后，宿主用安全 rowId 定位本行。若表中已有原异常，沿原具名错误分类。
   分类按已核验 claim 的角色，不按稳定 id 或包名猜测。未知 helper 仍归 plugin。
   没有原异常时使用通用安全 code，不能等待 closed 才报告启动失败。
4. 宿主 boot 的公开 Promise 继续按原承诺等待实际失败收场后拒绝。
   loader.ready 的及时失败不表示 boot 可以遗失清理责任。guard.pending 和维护完成核对保持。
   配置拒绝使用安全 code，不能恢复输出任意校验 issues/message 的旧路径。

上述 Promise 观察顺序须用真实 AssemblyLifetime 和管理绑定验证。
反例必须覆盖 setup 拒绝同时前缀 close 不结束：私有表可读、loader.ready 拒绝、closed 仍 pending。
原失败对象只交宿主具名分类，不允许把任意 message/cause 写入诊断。

### 绑定专属检查入口

`core/cordis-plugin-tree/cordis` 增加 `inspectPluginTree(handle)`。
返回不可变数组快照，每项为 `{ readonly id: string; readonly fiber: Fiber }`。
顺序是实际创建顺序，仅包含行 fiber，不包含 loader 的端口 fiber。
保留失败及已撤除行。未开始的后缀不出现。每次调用取得当时的快照。
句柄必须来自本进程的 loadPluginTree，否则同步抛 TypeError，消息固定为 `Invalid plugin tree handle`。

loader 在取得 ctx.plugin 的返回值后立即登记 fiber，先于下一次 await。
该检查入口不增加加载、停止或释放责任，也不包装 fiber。调用者取得的是实际 Fiber，
可用于既有撤除演练；强制撤除仍触发同一代停止。这个入口只在 ./cordis，纯根不引用 Fiber。
它是受信进程内的调试入口，可能间接访问配置，禁止将其结果打印成运维诊断。
公开打印仍只使用 describePluginTree。

宿主删除 ManifestEntry、ManifestRuntime、buildManifest 及 hooks.manifest/observeFiber。
替换入口为 buildDistributionTree(config, data)、BootOptions.operator 和 BootHooks.treeCreated(handle)。
buildDistributionTree 的第二参数为公开 HostTreeData：readonly backupDirectory: string、
readonly sourceBuildId: string | null、readonly migrationNames: readonly string[]。
返回 readonly PluginRow[]。它只使用数据，不接收 guard、回调或 MigrationProvider。
BootHooks.resolveModule 的签名与 PreparationOptions.resolveModule 相同。
operator 接受 unknown 运维编辑数组，缺省为空，仍走完整验证。生产 CLI 先读取 --plugins 的 JSON 再传入。
treeCreated 在 load 返回后、任何树内 apply 前同步调用，只供演练。回调抛错时宿主停止同一树，
等待真实收场，再报告固定的 plugin 失败。它不传秘密配置。调用者可以保存 handle，
在 ready/closed 或自己的有界观察点调用 inspectPluginTree，核对失败前缀。
故障提供者由 BootHooks.resolveModule 替换模块解析器注入，生产只用标准解析器。
替身仍必须通过同一配置、声明和宿主政策校验。原确认/迁移演练钩子保持。
TenancyHost.fibers 改为按最终启用行 id 的只读记录，不再把八个原 id 当成唯一合法名字。
HostDisposal.unfinished 同样使用行 id。确认和维护责任按 claim→rowId 映射处理。

## SQL 的纯调用与绑定配置

`storage-sql` 根继续导出原 StorageSqlConfig 值/类型、openStorage、OpenStorageOptions、
SqlStorage、驱动、错误及独立快照能力。StorageSqlConfig 是独立调用的输入，仍允许原运行对象。
新 `StorageSqlPluginConfig` 值/类型只从 ./cordis 导出，作为两种 owning plugin 的 Config。
它按插件树协议使用 startup=plain|migrate，缺省 plain，并严格拒绝未知字段。
plain 禁止 maintenance。migrate 从 storageStartup 取原 migrations/upgrade。
maintenance 从 storageCompletion 取 closed，其他数据字段保持。PostgreSQL 的独立路径继续保留，
本批不宣称 PostgreSQL 恢复验收通过。

StorageStartupResources、StorageCompletionPort、UpgradeGuardHandle、UpgradeConfirmation、
UpgradePending 的形状唯一归 core/storage 根。StorageStartup/storageStartup、
StorageCompletion/storageCompletion 及对应 *_SERVICE 常量归 core/storage/cordis。
storage-sql 不再重导出两个迁出的结果类型，全部消费者改接 core/storage。
createUpgradeGuard、UpgradeGuard 运行类及私有附着校验仍在 storage-sql，不能用结构类型替换私有身份。
Config 转换必须把同一真实 guard、检查函数和完成目标交给原 openStorage。
缺资源使受管行启动失败，不能退回 plain 或静默关闭维护。

条件依赖通过子作用域 inject 实现。管理行仍先同步登记 OwnedWork，再启动条件子作用域。
缺条件服务不能使 ready 永久 pending，必须以缺依赖失败并停止整代。
声明列出全部条件键；host 先装好这些外部 Service 并保留到树 closed 及守卫/维护核对之后。
独立 storageSqlPlugin 也使用同一 JSON 配置和资源服务。borrowed SqlStorageService 不增加资源要求。

## 服务端独立工厂

`governance-center-entry-node` 根增加两个纯工厂：

```ts
createGovernanceCenterEntry(config: GovernanceCenterEntryConfig,
  dependencies: GovernanceCenterEntryDependencies): GovernanceCenterWork
createGovernanceCenterOps(config: GovernanceCenterOpsConfig,
  dependencies: GovernanceCenterOpsDependencies): GovernanceCenterWork
interface GovernanceCenterWork {
  setup(): Promise<void>
  close(): Promise<void>
}
```

工厂构造本身不打开端口、socket、数据库或订阅通知。setup 第一次调用才开始，重复调用返回同一 Promise。
close 同步废止本实例继续启动及接受工作的资格，重复调用返回同一 Promise。
close 等已开始 setup 结算，再关闭取得的全部资源和真实在途工作。
setup 失败不以 close 成功覆盖，也不等 close 才交付失败。
close 在 setup 前调用时不启动资源；随后 setup 拒绝 GovernanceCenterWorkStopped。
该具名错误只表示本工厂停止，不替代业务失败。工厂给内部 Promise 安装拒绝观察。
调用方必须调用并等待 close；管理绑定由同一 AssemblyLifetime 承担该义务。

| 依赖类型 | 精确成员与来源 |
|---|---|
| GovernanceCenterEntryDependencies | storage: AtomicStorage；clock: Clock；services: EntryServices；opening: EntryOpeningSignal；logger: GovernanceCenterLogger；notifications: EntryNotifications；isCurrent(): boolean；isReadyToOpen(): boolean |
| GovernanceCenterOpsDependencies | storage: Storage & { readonly maintenance: SnapshotMaintenance }；clock: Clock；opening: EntryOpeningSignal；maintenance: EntryMaintenanceResources；logger: GovernanceCenterLogger；notifications: OpsNotifications；isCurrent(): boolean |
| GovernanceCenterLogger | debug/info/error(message: string, ...values: unknown[]): void；只表达现有日志用法，不引用 Cordis Logger |
| EntryNotifications | serving(notice: ServingNotice): void；stopped(): void；defect(): void；onListening(listener: () => void): () => void |
| OpsNotifications | listening(): void；onServing(listener: (notice: ServingNotice) => void): () => void；onStopped(listener: () => void): () => void；onDefect(listener: () => void): () => void |

上述接口从提供者根导出。EntryServices 的形状沿原 routing/routes.ts，唯一声明迁到独立依赖模块，
路由消费同一声明。它仍只授予原参加事务及业务方法，不扩大原原子提交例外。
配置和时钟超时错误移到纯文件。OpsConfig 删除 snapshotChecks/onClosed，资源只从 dependencies.maintenance 来。

工厂持有通知订阅的取消函数。Ops 的三条订阅必须在第一次异步等待之前安装，保持原装载握手。
close 先关闭本实例准入，待资源和在途结算后再撤订阅。setup 部分失败也执行已取得的取消函数。
通知发出抛错沿原路径记录，不能改变开闸/关闭结果；订阅安装失败归 setup 失败。
Entry 在启动期间用 isCurrent 判资格，在开闸轮询时另用 isReadyToOpen，保持独立绑定 LOADING 不能开门。
运行期每次准入仍核 opening.isOpen；以上两个回调不能替代租户授权或持久事实。
原 clockReadyTimeoutMs、100ms 轮询、网络 drain 上界和真实业务等待保持。
业务 Promise 必须先登记再调用外部服务，避免同步重入 close 丢失已交出工作。

四种插件绑定仅负责配置、inject、logger、通知适配、资格投影和登记/关闭：
独立绑定先安装 effect，再 setup；管理绑定把工厂 setup/close 交给原 startAssemblyWork。
managed apply 同步返回，metadata 和 describeAssembly 完整。两种入口共享同一工厂业务实现。
ops 对治理业务包的限制保持。精确事件白名单迁到新公共事件名，不放宽成整个 core 包通配。

## 事件与宿主静态准备

ServingNotice 和四个事件常量迁到 core/governance-center-entry 根。
常量仍名为 SERVING_EVENT、STOPPED_EVENT、DEFECT_EVENT、LISTENING_EVENT，值分别为
governance-center-entry/serving-started、governance-center-entry/serving-stopped、
governance-center-entry/defect-observed、governance-center-entry/ops-listening-started。
对应 Events 增补只在 ./cordis。提供者旧 events.ts/ops/notice.ts 和旧根重导出删除，消费者一次迁完。
EntryMaintenanceResources 根定义与 EntryMaintenance/entryMaintenance 绑定按插件树协议建立。

backup 路径准备拆成只读解析/验证和实际 durable mkdir/sync 两步。
发行树和政策先消费只读解析出的规范路径、版本和迁移名字。--print-plugins 只执行只读步骤，
不创建 backup 目录、guard、数据库、端口或 socket。它仍核配置、密钥、安装模块和八职责。
实际 boot 在准备/政策通过后才 durable 创建目录，并重验同一规范路径及原 owner/mode/symlink 条件。
资源服务使用同一 migrationNames、检查集合和路径投影，不能另算一份或从运维 JSON 注入函数。
原数据文件、表、迁移片段、Schema URI、中心身份与 wire 版本不变。

## 释放前和实现后的验证

- 释放前：真实 lifetime/管理绑定探针验证原错误观察顺序及未结算 close。
  独立 Choice 审阅本页选择，Expression 核对接口/失败/拥有者表达，完成限定接受。
- BASE 冻结：QA 保存现有 host、entry、SQL、双面和部署驱动及原断言/阈值，实际运行 BASE。
  新树能力在 BASE 标为不存在，不能以预期失败当成已有能力通过。
- 实现后：QA 独立验证坏树零 apply、八职责替换、真实错误阶段、部分前缀 inspection、
  early close/setup、通知重入、原 guard 交错、打印无数据副作用、SQLite/TLS/Unix/CLI 和维护恢复。
- 比较原公开符号、函数/断言、Schema/SQL 及生成/部署消费者。每项差异给出迁移去向或已接受变更。
  四层纯入口和实际 tarball 检查同时覆盖新 loader、资源类型和服务端工厂。

本页不接受任何生产实现。完整 T4-Q1～Q4 和 L3 仍未完成。
