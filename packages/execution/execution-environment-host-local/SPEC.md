# @omne-harness/execution-environment-host-local 行为规格

状态：Service 实现与宿主提供者成员，`draft`。本成员做两件事：把 [execution-environment](../execution-environment/SPEC.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/SPEC.md) 定义的服务 `executionEnvironment`，并在宿主机上提供 `files` 设施。领域行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)，登记表行为归 execution-environment，都不在本页。本页的[宿主文件使用](#宿主文件使用)一节已被接受，其余是草案。

## 范围与依据

本成员有两个入口：

- 根入口与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)），导出 `createHostFiles`、`hostObjectToken` 与 `createHostFilesProvider`。
- `./cordis` 导出 Service 子类 `ExecutionEnvironmentRegistry`、插件工厂 `executionEnvironmentRegistryWith`、插件 `hostFilesPlugin` 与恢复授权的缺省值 `unavailableRecoveryAuthority`。

上层依据：系统页[执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工，领域页[文件使用的交接](../../../docs/domains/execution-environments/architecture.md#文件使用的交接)，契约的[设施协议](../execution-environment-contract/SPEC.md#设施协议)、[INV-EE04](../execution-environment-contract/SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[INV-EE09](../execution-environment-contract/SPEC.md#inv-ee09-资源和秘密以最小必要条件提供)、[INV-EE13](../execution-environment-contract/SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) 与 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)。

两个入口的模板标记写明还没有接受的部分：`files` 的其余八项操作、`command` 与 `terminal` 的提供者、平台前提的探测、Runtime Context 生产者插件、调用方类的核对。本成员不导入任何上层领域的契约。租户、作用域、原调用与恢复授权都随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 结果与不变量

### 宿主提供者的事实

`createHostFilesProvider()` 每次调用造一个提供者，它声明下列事实：

| 事实 | 值 |
| --- | --- |
| 名称与代 | `host-files`；代是每次创建时生成的随机 UUID |
| 绑定层 | 只有 `host_machine` |
| 连续性 | `not_guaranteed` |
| 设施键 | 只有 `files` |
| 隔离断言 | 空。本提供者不确认任何隔离 |
| 宿主事实（`describe`） | 名称、代、`process.platform`、设施键、空隔离断言，前提一律为已满足 |

- `acquire` 在提供者退役后返回 `providerUnavailable`。落点的绑定层不是 `host_machine` 时返回 `noMatchingEnvironment`。其余情况交回一个租约原件：实例身份是 `host` 加提供者的代，`facility('files')` 返回同一个宿主文件设施，释放总是已释放。证据记录提供者名称与代。
- 一个提供者只有一个宿主文件设施实例。这个提供者交出的全部租约共用它。
- 本提供者的文件操作不留下受管资源。它不调用账本，也没有 `listRecoveryResources` 与 `recover`。恢复编排把它记为不支持。
- `retire()` 把提供者标为已退役，使它交出的全部租约原件以 `providerRetired` 失效，然后立即返回已排空，不等在途文件操作。前提：在途的文件操作在自己返回前完成关闭，退役不等待它们；关闭失败而挂起的描述符由实例释放时回收；本提供者没有受管资源。这是对契约排空定义的偏离（契约的排空见 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。

前提一律为已满足，不是探测的结果。平台前提的探测还没有接受。

### 宿主文件使用

本节已由 PanQiWei 接受，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。它落实契约[设施协议](../execution-environment-contract/SPEC.md#设施协议)里文件操作的最小调用事实。请求携带访问身份 `access`（主体加租户）、绑定 `binding`、原调用引用 `origin` 和这次请求身份 `requestId`。设施和租约的定义在[契约对象模型](../execution-environment-contract/docs/object-model.md)。存储编码仍未另定。宿主机上的打开和身份核对在[架构](docs/architecture.md#宿主文件使用)。根入口导出宿主文件使用的 `createHostFiles` 与 `hostObjectToken`，`./cordis` 导出登记它的 `hostFilesPlugin`。路径上没有对象时结果是未解析。（本次补充）跨租户拒绝由登记表的租约视图在调用本设施之前执行，测试在 [execution-environment](../execution-environment/tests/registry.spec.ts)；直接调用 `createHostFiles` 得到的设施不核对租户。授予根限制没有包测试。活句柄还开着时关闭失败现已有包测试；观察记录在架构页。PanQiWei 接受时的包测试只在 Node v26.0.0、darwin 上运行过。（本次补充）2026-10-21 在 Node v24.18.0、linux 上运行了本成员的包测试，记录在[组合与验证](#组合与验证)。

这一次文件使用只包含读取、查看、写入和关闭。编辑、补丁、按名查找、按内容查找和图片附件留在 `Files()`。列表、移动、复制、删除和建目录若以后进入设施，必须复用同一次对象绑定。本节不定它们的产品结果。

宿主机落点上，调用方（执行适配/授权层）负责在使用前按当前授权点名对象的设备号与 inode，并把该点名结果作为 `named` 随请求交给本设施。`hostObjectToken` 仅按路径识别当前对象的设备号与 inode，不授予访问权，也不替调用方重新核对授权是否仍然有效。本设施只核对打开到的对象与 `named` 是否一致。路径落在该对象上。路径含空字节则拒绝，关闭也一样。执行适配确认打开到的对象就是点名对象，才把读取或写入记成完成。完成只挂在这个对象和这次句柄代际上。身份与点名不一致才拒绝。确认不了打开结果时是未知。两种情况都不把这次请求改到别的落点。

声称文件限制的落点使用授予根身份。请求不能另带一个绝对路径充当这个根。路径相对于该根。该落点没有实现时，依赖该限制的文件请求拒绝。

`Files()` 消费这次确认。`Shell()` 不消费它。命令碰到的文件不经过这次确认。要限制命令能碰的文件，由执行环境权限把该次作用放到沙箱。

读取完成不表示写入完成。后一次请求重新确认。关闭是另一次请求。关闭成功只表示该句柄代际已得到成功回执。没有成功回执时，关闭结果是未知，已读到或写到的结果仍留在原来的请求上。调用方丢掉引用不是关闭成功。对已经关闭的描述符再次关闭，不是一次活句柄关闭失败。

授权点名可以用替身核对。文件字节、符号链接和对象替换使用真实文件系统。同一次请求身份只有一种确认。

### 宿主文件设施的其余现行行为

下列行为是本成员源码现在的行为，不在上一节的接受范围内：

- 本设施的结果用契约的设施结果四态表达：完成是 `done`，未解析是 `unresolved`，拒绝是 `rejected` 带原因，未知是 `unknown`。
- 绑定层不是 `host_machine` 的请求返回 `rejected`，原因 `unsupported`，不触碰文件系统。
- 契约的 `files` 设施另有列表、搜索、建目录、删除、移动、复制、提交批次与恢复批次八项操作。本设施对这八项一律返回 `rejected`，原因 `unsupported`，不触碰文件系统。
- 打开失败按错误码映射：`ENOENT`、`ENOTDIR` 为未解析；`ELOOP`、`EMLINK`、`EISDIR` 为 `unsupported`；`EINVAL` 为 `invalidInput`；`EACCES`、`EPERM` 为 `notAuthorized`；其余错误为未知。
- 读取接受起点与上限两个字节数。两者必须是非负安全整数，否则返回 `invalidInput`。读取目录返回 `unsupported`。完成时带字节、下一次读取的起点与是否已到文件末尾。
- 查看完成时带对象类型（文件或目录）、字节数与修改时间。
- 版本是修改时间与字节数的组合。替换写入带预期版本而当前版本不同时返回 `conflict`，文件不变。
- 写入有两种模式。替换模式按上一节写入。路径上没有对象时，替换模式返回未解析。
- 新建模式的 `named` 是父目录。本设施在独占新建前后各核对一次父目录的设备号与 inode。新建模式带预期版本，或路径以斜杠结尾，返回 `invalidInput`。父目录不存在返回 `notFound`。目标已存在返回 `conflict`。新建之后父目录身份变了，返回未知，已建的文件留在原处。
- 本设施在调用时取下请求身份与待写字节的副本。调用方在调用之后改动请求对象，不影响这次操作。

### Service 实现

- `ExecutionEnvironmentRegistry<P>` `extends ExecutionEnvironmentService<P>`，不另写键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。构造时调用 `createEnvironmentRegistry`，把环境面与恢复面六个方法原样转给登记表。
- 构造函数的第三个参数是恢复授权端口。没有给出时用 `unavailableRecoveryAuthority`，它对每次恢复都答复不可用。所以直接装载 `ExecutionEnvironmentRegistry` 时，`recoverOwned` 与 `releaseScope` 一律以 `unavailable` 拒绝。要恢复，装配者装载 `executionEnvironmentRegistryWith(恢复授权)` 返回的插件。
- `registerFacility` 与 `registerProvider` 在方法里用 `this.ctx.effect` 调用登记表的同名方法。登记落在调用方插件的 fiber 上，调用方卸载即撤除（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。返回的撤除函数调用同一个效应撤除。
- 插件配置只接受缺省、`null` 或空对象，其余值以「configuration accepts no fields」校验失败（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。Service 子类、`executionEnvironmentRegistryWith` 返回的插件与 `hostFilesPlugin` 都用这份配置。
- `hostFilesPlugin` 的 `inject` 是服务键常量。装载时它经 `ctx.executionEnvironment` 登记 `files` 设施声明与一个新的宿主文件提供者。
- 本成员不读取调用方类的 intercept 配置，不按调用方类拒绝调用。
- 本成员不登记 Runtime Context 的生产者，不发布 `execution.placement` 与 `execution.host-facts` 两条块。

### 撤除顺序

- `hostFilesPlugin` 卸载时，它的两个效应并发撤除（[effect-disposal-concurrent-not-ordered](../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）：`files` 设施声明从登记表移除，宿主文件提供者开始退役。退役使它交出的租约以 `providerRetired` 失效，之后 `files` 不再有提供者，宿主层的落点解析返回 `noMatchingEnvironment`。
- `ExecutionEnvironmentRegistry` 卸载时，它在构造时登记的效应调用登记表的 `close()`。关闭顺序归 [execution-environment SPEC 的关闭](../execution-environment/SPEC.md#关闭)。本成员只承担一件事：关闭结果是待处置时，撤除函数抛出 `RetirementPending`，不以正常返回报告完成。
- 服务卸载时，`inject` 了本服务的插件随之卸载或重跑，它们的效应与服务的关闭并发运行。提供者退役共用一次 `retire()` 调用，不因两条撤除路径而退役两次。
- 撤除不撤回任何外部效果。已经写入宿主文件的字节留在文件里。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 失败时 | 结束 |
| --- | --- | --- | --- |
| 服务实例与登记表实例 | `ExecutionEnvironmentRegistry` 插件的 fiber | 关闭待处置时撤除函数抛出 `RetirementPending` | 插件卸载 |
| `files` 设施声明与宿主文件提供者的登记 | `hostFilesPlugin` 的 fiber | 重复登记抛出，插件 fiber 进入 `FAILED` | 插件卸载，或服务撤除 |
| 宿主文件设施实例 | 宿主文件提供者 | 关闭失败的描述符留在设施实例里，每次公开操作前重试关闭 | 随提供者实例被丢弃，由运行时回收 |
| 已发出的句柄代际 | 宿主文件设施实例 | 关闭没有成功回执时为未知 | 关闭成功回执 |
| 写入宿主文件的字节 | 宿主文件系统 | 截断后没写完时为未知 | 不随撤除撤回 |

进程失败：本成员没有可恢复的东西。宿主文件提供者没有受管资源。登记表的重建沿 [execution-environment SPEC](../execution-environment/SPEC.md#所有权失败与生命周期)。撤除函数抛出的错误怎样被 Cordis 处置、`fiber.dispose()` 的调用方能否观察到，现在没有 basis 条目，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、登记即效应 | [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) |
| 登记表的匹配、获取、门、退役、恢复与关闭 | [execution-environment SPEC](../execution-environment/SPEC.md) |
| 设施协议、结果四态、文件使用的最小调用事实 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md#设施协议) |

持续验证在 `tests/`，文件字节、符号链接与对象替换都用真实文件系统：

| 测试文件 | 覆盖 |
| --- | --- |
| [host-file-results.spec.ts](tests/host-file-results.spec.ts) | 未点名拒绝、空字节拒绝、未解析、末段符号链接拒绝、中间目录换成链接、经祖先链接读取、查看与写入不带字节、关闭只回句柄、撤权后保留旧字节、对象替换后不复用旧完成、关闭失败的三种路径、代次递增、尾部斜杠、目录读取、请求与字节的快照、错误路径保留无法关闭的描述符 |
| [host-files.spec.ts](tests/host-files.spec.ts) | 读工作区目录之外的点名文件、字节范围、查看、新建与拒绝覆盖、父目录不符拒绝、预期版本不符拒绝 |
| [host-files-unsupported.spec.ts](tests/host-files-unsupported.spec.ts) | 八项未实现操作返回 `unsupported` 且不触碰文件系统 |
| [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | 装载服务与 `hostFilesPlugin` 后经租约读文件；沙箱层没有提供者；`hostFilesPlugin` 卸载后租约以 `providerRetired` 失效、宿主层没有匹配；服务卸载后键上没有服务、租约以 `registryClosed` 失效、新获取返回 `ownerStopped`；没有恢复授权时恢复两操作返回 `unavailable`；注入恢复授权后宿主提供者记为不支持 |
| [public-entry.spec.ts](tests/public-entry.spec.ts) | 根入口只导出三个函数；根入口可达的模块不导入 Cordis 或 `./cordis` |

运行记录：

- PanQiWei 接受时，包测试只在 Node v26.0.0、darwin 上运行过。
- 2026-10-21 在 Node v24.18.0、linux 上，`pnpm --filter @omne-harness/execution-environment-host-local test` 的 5 个测试文件、50 个测试全部通过，退出码 0。本成员 `package.json` 声明的引擎是 `>=24`。

本成员不覆盖：授予根限制、平台前提的探测、`command` 与 `terminal` 提供者、Runtime Context 块的发布、调用方类核对、同一 isolate 标签下重复装载的失败，以及配置校验失败时 fiber 进入 `FAILED`。持久化与真实集成方的端到端组合也不在本成员。
