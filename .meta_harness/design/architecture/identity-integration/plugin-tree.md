# 插件树与宿主资源协议

## 边界与形状

本协议落实 IC-15/16。发行层、运维者层只有两层，作用域是一个进程的装配。
它不热更新、不扫描目录、不解释第三层配置，也不接管 Session 动态插件。
重新启动时重新计算树。运行期任意管理行失效或重跑结束整个装配代际。后继代际等真实收尾后再建立，见 [有序收尾](retirement.md)。

`core/cordis-plugin-tree` 根导出以下形状及 `composePluginTree(distribution, operator)`。
输入为 unknown，先验证再返回不可变快照；不通过强制类型转换绕过验证。

```ts
type JsonValue = null | boolean | number | string | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }
interface PluginReference { readonly package: string; readonly export: string }
interface PluginRow {
  readonly id: string
  readonly plugin: PluginReference
  readonly config: JsonValue
}
type OperatorEdit =
  | { readonly op: 'replace'; readonly id: string;
      readonly plugin?: PluginReference; readonly config: JsonValue }
  | { readonly op: 'disable'; readonly id: string }
  | { readonly op: 'insert'; readonly row: PluginRow;
      readonly position: { readonly before: string } | { readonly after: string } }
interface ComposedRow extends PluginRow {
  readonly enabled: boolean
  readonly source: 'distribution' | 'operator'
  readonly editIndex?: number
}
```

发行层是 PluginRow 数组，运维者层是 OperatorEdit 数组，缺省后者为空数组。
id 为非空、大小写敏感的 `[a-z0-9][a-z0-9-]*`，长度不超过 128。
package 为普通或 scoped npm 包名，禁止文件路径、URL、子入口及 `..`。
export 为非空 JavaScript 标识符。加载器固定导入 `<package>/cordis` 的该具名导出。
同一 id 只出现一次。配置接受标准 JSON 值、有限数字、普通数据对象及数组。
拒绝 undefined、函数、bigint、Symbol、非数据访问器、循环引用、非普通原型和非有限数字。
JSON 输入路径使用 JSON.parse，程序化调用也必须执行同一验证，不以 stringify 丢字段。

## 合层确定性

1. 先完整校验发行行与全部编辑的形状。按数组顺序执行编辑。
2. replace 必须命中一个已存在且启用的 id，整份替换 config，绝不深合并。
   plugin 缺席时保留原引用；给出时整份替换引用。这允许同一稳定行更换提供者。
3. disable 必须命中启用行，保留该行的 id、原位置和来源记录，设置 enabled=false。
4. insert 的新 id 不得与任意现存 id 重复，包括已停用行。唯一定位锚点必须已存在且启用。
   按 before/after 插入一行。顺序只依赖输入数组，不作依赖拓扑重排。
5. 同一运维层不能再次修改已经修改过的目标 id，包括刚插入的新 id。
   重复、悬空、停用锚点、同时 before/after、未知字段均失败。
6. 被修改/插入的行 source=operator，editIndex 为零基编辑位置；其余为 distribution。
   合成结果不能反向改变输入对象。

以上失败全部在任何插件 apply 之前暴露，不能跳过坏行继续启动。
返回 `PluginTreeError`，只带封闭 code、行 id（若合法）、层和索引。
code 包括 invalid-tree、duplicate-id、duplicate-edit、missing-target、disabled-target、invalid-reference、invalid-config。
不带原配置、异常 message、cause 或任意输入片段。

打印使用 `describePluginTree(tree)` 的安全 DTO：位置、id、引用、enabled、source、editIndex。
config 总是固定的 `[redacted]`，不输出值、键、散列或长度。
启动失败同样只输出安全 code 和合法行身份。插件自己的诊断继续受原保密承诺约束。
完整配置只在进程内交给校验及插件，树打印不是导出秘密配置的入口。

## 提供者声明与准备

树的行、提供者声明和实际 Service 是三种不同输入。稳定 id 不证明提供者职责。
受管理插件除 `assemblyLifecycle: 1` 外，还导出同步纯函数
`describeAssembly(validatedConfig: unknown): AssemblyDeclaration`。它是所选插件导出的静态成员，
不能从运维 JSON 传入函数。声明的根类型归 core/cordis-plugin-tree：

```ts
interface AssemblyClaim {
  readonly name: string
  readonly version: number
  readonly config: JsonValue
}
interface AssemblyDeclaration {
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  readonly optional: readonly string[]
  readonly claims: readonly AssemblyClaim[]
}
interface PreparationOptions {
  readonly externalServices: readonly string[]
  readonly resolveModule: (reference: PluginReference) => Promise<unknown>
}
```

provides/requires/optional 分别是所供键、必需键、可选键的唯一非空字符串集合，重复键拒绝。
同一键不能同时出现在 requires 和 optional。可选依赖不因关闭顺序变成必需注入。
assemblyLifetime 为 loader 注入的隐含行端口，不由插件声明提供。
声明必须覆盖子作用域和逐调用取得的全部必需/可选资源依赖，允许按配置选择 plain/migrate 等路径。
claims 只携带受信部署代码的协议承诺和 JSON 配置投影，不提供运行对象或资源所有权。
同一行 claim 的 name/version 不重复，version 为正整数。它们不自动成为全局注册表。

`./cordis` 导出异步
`preparePluginTree(tree: readonly ComposedRow[], options: PreparationOptions): Promise<PreparedPluginTree>`。
它重新核对合层结果的运行时形状和 id 唯一性，不能凭 TypeScript 类型信任外部拼出的行。
解析器由装配显式提供，标准实现仅动态 import 已安装包的 `/cordis`。
包/入口不存在、导出不是命名插件对象或 Service 类、Config 缺失，分别以封闭错误拒绝。
prepare 使用该导出的同步 Standard Schema 验证已捕获配置，再把输出交给 describeAssembly。
异步 schema、声明函数返回 Promise/抛错、非法声明或配置，均在任何 apply 前拒绝。
配置与声明函数必须纯且确定，模块顶层不能启动资源；这里不提供不受信代码沙箱。

prepare 检查每个必需键来自更早的启用行或 externalServices；任何缺失、顺序错误、重复提供
或与外部键冲突均拒绝。它不对行拓扑排序。外部键只是宿主对后续装配的声明，此时不创建资源。
可选键缺席允许启动；若本树存在其提供者，也必须排在消费者之前，违反即 service-order。
这条边保护已经捕获的可选实例在整个用例结束前不被关闭，不能只检查必需 inject。
外部服务及其实际资源由宿主保持到整树 closed 后；运行中不能从未登记/更晚拥有者取得依赖。
可选服务更换或新增若改变这个资源拥有关系，必须结束旧代际并重新准备，不能跨代承接旧工作。
load 在任何 apply 前确认这些外部 Service 已可见。可选业务依赖仍按原逐调用规则解析。
声明不能证明代码遵守协议，实际装配及 QA 必须核对；这一真实性边界不能写成预先证明。

PreparedPluginTree 是不可伪造、不可变的进程内准备结果，由实现私有身份核验。
它公开有序 ids、安全 rows DTO 以及各行 declaration 供宿主核政策，私有持有所选导出和原配置。
declaration.claims[*].config 可能含秘密，只供进程内核对，不进入 rows、错误、日志或 JSON 打印。
load 不再次按包字符串解析另一导出，也不接受调用方自行拼出的 prepared。
准备时使用校验输出作声明投影；实际 Cordis 仍接收捕获的原配置，避免转换两次。

prepare 的错误为 `PluginTreePreparationError`，只含 code、合法 rowId 和安全位置。
code 为 invalid-tree、module-unavailable、invalid-export、missing-schema、invalid-config、invalid-declaration、
missing-service、service-order、duplicate-service。模块异常/校验 issues 的任意文本均不外泄。
宿主政策拒绝单独归 HostPluginPolicyError，不伪装成通用树错误。

## 启动控制、失败与完成观察

`loadPluginTree(ctx, prepared, lifetime): PluginTreeHandle` 同步返回控制句柄，
**先交出句柄，再在异步任务里开始任何 apply**。调用前置错误同步抛出 PluginTreeUsageError：
invalid-prepared、lifetime-mismatch、lifetime-used、missing-external-service。
这类拒绝没有开始树内资源，不接管宿主已有资源，也不使尚未使用的 lifetime 停止。
load 先完成不会改变状态的前置检查，最后同步调用 lifetime.tryClaim。
false 时以 lifetime-used 拒绝，不调用 close，不建第二份控制句柄，不影响首个加载。
true 时立即成为该代唯一控制拥有者，然后返回句柄；此后错误都走该句柄的 ready/closed。
同 tick 连续 load 必须只有首个成功，即使首次 apply 和 register 尚未执行。

```ts
interface PluginTreeHandle {
  readonly rows: readonly PluginTreeDescription[]
  readonly ready: Promise<void>
  readonly closed: Promise<AssemblyCloseReport>
  dispose(): Promise<AssemblyCloseReport>
}
```

PluginTreeDescription 是 describePluginTree 的安全 DTO，每行只有 position/id/plugin/enabled/source/editIndex
和固定 config='[redacted]'。句柄 closed 与 dispose 返回同一完成 Promise。
closed 在仍运行时保持未完成；dispose 是取消启动和请求停止的唯一树级入口，不另设 AbortSignal。
调用方必须保留句柄到 closed；loader 也必须持有全部行 handle 和任务，不因 ready 拒绝丢弃责任。

loader 按准备后的顺序建行端口、调用 ctx.plugin、登记 handle，再等待实际 fiber 就绪。
每行必须先 register OwnedWork 再产生副作用；未登记、登记失败或 setup 拒绝使 ready 拒绝，
并立即请求本代停止。未开始后缀不再启动。已登记前缀按 lifetime 的实际 close 处理。
loader 在行端口登记时就观察 OwnedWork.ready 的失败，不等 Cordis 完成失败卸载后才交付启动错误。
否则 fiber 的清理等待资源收场，会把 ready 的失败报告错误地拖到 closed 之后。
装配成功须所有行 ACTIVE、声明的 provides 实际可见、必需依赖满足，然后 ready 兑现。
运行状态不能证明任意受信插件没有隐藏副作用；违反声明的提供者不能通过实际验收。

ready 的失败为 PluginTreeStartError，携带安全 rowId 和首个 code：
apply-failed、dependency-unavailable、missing-registration、provided-service-missing 或 stopped。
调用方 dispose 与启动失败竞争时，以 loader 首次观察并固定的终结原因为准。
停止先发生则不再兑现 ready；ready 已成功后停止不改写其历史结果。
后续失败不覆盖首个启动失败；setup/close 的各行结果继续进入 closed 报告。
loader 为 ready/内部任务安装拒绝观察，调用方晚接 ready 不产生未处理拒绝。

启动失败后 ready 立即拒绝，让调用方知道启动没有成功；closed 仍等真正收场。
例如 B setup 失败、A close 失败：ready 为 B 的 apply-failed，closed 报告保留 B setup 和 A close。
A close 永不结束时，ready 已拒绝而 closed 保持未完成，不能在后台丢掉 A 或假称失败已清理。
自动依赖撤除也请求同一 lifetime 停止；loader 观察该停止并继续完成同一 closed 过程。

loader 等全部 OwnedWork 静止，再逆序 await 行 fiber.dispose，最后撤各行端口，才兑现 closed。
Cordis 吞 effect 错误不能替代资源结果；全部实际资源只能由 OwnedWork.close 关闭。
协议外异常分类为 assembly-fiber-dispose-failed 或 assembly-port-dispose-failed，
加入报告且 complete=false；若无法确认资源静止，继续保持未完成并报告诊断。
借入 Context、guard 和外部资源仍由宿主在 closed 后核对并关闭。
主启动失败、资源关闭失败、fiber/端口失败和宿主确认失败分别保留，不能互相覆盖。

## 运行资源的唯一拥有者

运行对象通过正式 Service 交付。表中资源是每次 boot 构造的同一实例，禁止配置克隆、JSON 化或跨 boot 复用。
本代槽位不允许第二次 setup，所以旧 guard 不能在同代重新附着新 SQL 属主。
只移动交付通道，不改变原资源的实际关闭者和持久保证。

| 公共接口及 Service | 形状与拥有者 | 消费和撤除 |
|---|---|---|
| core/storage：StorageStartupResources；StorageStartup/storageStartup | readonly migrations: Kysely MigrationProvider；readonly upgrade: false 或 { checks: readonly PreflightCheck[]; guard: UpgradeGuardHandle }。guard 接口只有原 confirm/pending 及原结果形状。宿主创建，SQL 保留私有真实实例核验 | SQL owning 插件必需 inject，独立 openStorage 仍接受显式对象；borrowed SqlStorageService 不需要它 |
| core/storage：StorageCompletionPort；StorageCompletion/storageCompletion | closed(status: 'clean'|'error'): void；宿主 MaintenanceFinalization 拥有回调目标 | 启用维护的 SQL owning 路径通知一次，实际数据库/锁收场后才通知；回调不替代完成 Promise |
| core/governance-center-entry：EntryOpeningSignal；EntryOpening/entryOpening | wait(): Promise<void> 与 isOpen(): boolean，只读本代开放资格；由宿主确认状态及同一 lifetime.isCurrent 共同决定 | 客户端面和运维面都必需 inject；两面不 await wait 才返回就绪；新请求直接核 isOpen，维护操作核共同开放前置；stopping 后恒 false，未兑现 wait 拒绝 |
| core/governance-center-entry：EntryMaintenanceResources；EntryMaintenance/entryMaintenance | readonly snapshotChecks: readonly SnapshotCheck[]；closed(status):void | ops 必需 inject；宿主提供原 hostSnapshotChecks 与 controllerClosed，维护已开始则等真实收场 |

UpgradeGuardHandle 的结构定义不会授权随意伪造 SQL guard。
storage-sql 原 createUpgradeGuard 返回的对象实现该接口，attachGuard 的私有身份校验保留。
原 upgrade.confirm、pending、快照删除/恢复与“已确认不回滚”的语义保持。
MigrationProvider 是既有 core/storage 已消费的 Kysely 迁移形状，本批不抽象另一套迁移引擎。

SQL 插件序列化 Config 删除 migrations、upgrade 对象和 onClosed。
保留 dialect/file/synchronous、维护 workDirectory，加入 `startup: 'plain' | 'migrate'`。
plain 的插件子作用域不要求 storageStartup；migrate 的子作用域必需 inject storageStartup。
维护启用的子作用域同时必需 inject storageCompletion，资源缺失不能静默关闭维护。
storageStartup.upgrade=false 保持原显式无守卫模式；真实 tenancy-host 必须拒绝它。
独立函数 openStorage 的纯 options 可以含运行对象，因为它不是树配置。

入口 Config 删除 openSignal，ops Config 删除 snapshotChecks/onClosed，其余数据字段保持。
backupDirectory/sourceBuildId/migrationNames 仍为序列化数据，宿主核对其与真实资源一致。
密钥仍是原 PEM 数据输入；只保密打印，不悄悄新增 secret store 或改变来源政策。
AI credentialPolicy 未提供时，在树中省略字段；Config 必须把缺席解析为原 undefined 语义。
这修复原 schema 对 missing/undefined 的实现差异，不改变 AI3 的政策拒绝规则。

## 宿主如何核对声明与实际提供者

apps/tenancy-host 拥有八项 claim 的版本 1 形状和校验器，名称为
`tenancy-host/storage`、`tenancy-host/clock`、`tenancy-host/credentials`、`tenancy-host/accounts`、
`tenancy-host/organizations`、`tenancy-host/registration`、`tenancy-host/ops`、`tenancy-host/entry`。
通用 loader 只校验 claim 的数据形状，不解释这些名称。提供者返回普通数据声明，不能反向 import 应用。
宿主在 prepare 完成后、创建 guard 和打开数据前，读取 prepared 的声明执行下表。

| claim | 必需 provides | config 投影与宿主检查 |
|---|---|---|
| storage | storage | dialect='sqlite'、file、synchronous='full'、startup='migrate'、maintenance.workDirectory；与 HostConfig 及宿主路径投影一致 |
| clock | clock | 原 clock Config 的全部数据字段；保持原 storage/lease/readiness 参数关系，不降低原边界 |
| credentials | credentials | 原 credentials Config 数据形状；可替代算法，但仍兑现 AI3 凭据接缝，算法参数由自身 Config 校验 |
| accounts | accounts、logins | 原账号 Config 的公钥、有效期和 policy 数据；与宿主配对检查及部署参数一致 |
| organizations | organizations、offers、memberships、organizationPurge | 原组织 Config 的密钥及有效期数据；与宿主原投影一致 |
| registration | registration | 原注册 Config 的 activation 私钥数据；与已核验的密钥对一致 |
| ops | 无业务 Service | 原 ops Config 的 socket/部署状态及维护数据字段，移除资源回调后的形状；路径、版本、migrationNames 与宿主资源一致 |
| entry | 无业务 Service | 原 entry Config 的 TLS/listen/version/超时数据字段，移除 openSignal 后的形状；与 HostConfig 和宿主确定的边界一致 |

“原 Config”精确指 BASE 各提供者公开 Config 和 buildManifest 的字段投影，按本页已声明的数据/资源拆分迁移。
实现时此宿主校验只定义一次。它不复制所有提供者算法或凭据参数校验。
投影中带 PEM 的字段只在内存核对，错误只返回角色和封闭 code，不打印值、差分或散列。

八个 claim 各恰一次，必需 provides 与通用声明相符；任一缺席、重复、不支持的版本、
字段/参数不一致均以 HostPluginPolicyError 拒绝，code 为 missing-role、duplicate-role、
unsupported-role-version、role-service-mismatch、incompatible-role-config 或 unknown-role。
未知 tenancy-host/ 名称以 unknown-role 拒绝；其他命名空间不由宿主解释。helper 可以无宿主 claim。
因此原行停用后，可以由插入的新行承担同一角色；只保留原稳定 id 而换成普通 helper 必须失败。
替代提供者可以有不同实际 Config，describeAssembly 必须投影为上述相同宿主语义形状。
不能用包名或 id 白名单代替这个核对，也不能让声明自行放宽宿主政策。

这些是对受信提供者声明的检查，不证明实际代码行为。load 在 ACTIVE 后检查声明服务实际可见；
宿主继续检查真实 readiness/serving、升级确认及完成回调，独立 QA 核对角色行为与声明一致。
声明虚假、暗用未声明依赖或绕过登记的副作用属于提供者违反协议，不属于可接受替换。
所有必需依赖（包括配置条件下启用的子作用域）必须先声明，loader 不负责静态证明任意插件代码。

## tenancy-host 的发行树和启动顺序

首版稳定 id 沿原八项名字：storage-sql、clock-lease、credential-verification、account-identity、
organization-governance、account-registration、governance-center-ops、governance-center-entry。
id 与新 provider 包名分开，替换提供者不得强迫运维者改 id。
发行行删除或改 id 必须写宿主变更记录和发行说明。

宿主读取一个可选 operator tree JSON 文件，CLI 参数 `--plugins <file>`。
`--print-plugins` 完成配置/密钥与树准备后打印安全树并退出，不打开数据库、端口或 socket。
原 host config 仍是发行配置的数据来源。没有另外隐含环境覆盖层。

实际 boot 顺序保持：

1. 解析 host 配置、operator JSON，校验密钥配对、路径及全部静态插件配置。
2. 核对宿主要求：原八职责都由启用行承载，恰一 storage/clock，SQLite、完整迁移/核对/维护资源及原 clock 参数关系成立。
   普通 helper 插件可以插入。禁用必需职责且未提供满足同一职责的替代项时失败。
3. 创建 guard、开闸信号、完成跟踪和具名资源服务，按最终树加载。
4. 等全部必需行 ACTIVE，执行原 beforeConfirm 观察，await guard.confirm，并核对 snapshotTaken⇒snapshotRemoved。
5. 兑现开闸信号，入口重验 clock 后发 serving；原超时和已确认故障分类保持。
6. 停机先废止开放资格，由协调器逆序关闭资源，包括入口业务和 ops 维护真实完成，再撤 fiber。
   30 秒仍只报 still-stopping；完成后检查 guard.pending 及 MaintenanceFinalization，再释放资源服务。

替代提供者必须兑现同一公共面、原 host 的 readiness/serving 和资源完成协议。
只改包引用却不兑现这些责任，应在宿主准备/组合验收失败。
不能因运维者可改树就移除 SQLite、租户或升级保护要求。

## 机制事实与待验证项

复用已采用 basis：Service 同 fiber 多键、依赖换代重跑、可选 get、plugin 失败、
effect 撤除并发、emit 抛错及 isolate 只隔实例。
新增探针须覆盖 Standard Schema 预验证与实际加载、handle 就绪返回值、协调器排空与双清理失败。
有限状态模型覆盖 loaded 前缀、确认前/后失败、开闸条件和逆序释放，保留破坏顺序的负控。
这些证据未获得前，本候选不能释放 T4 实现。
