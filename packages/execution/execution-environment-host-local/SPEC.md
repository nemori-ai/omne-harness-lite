# @omne-harness/execution-environment-host-local 行为规格

状态：Service 实现与宿主提供者成员，`draft`。本成员做两件事：把 [execution-environment](../execution-environment/SPEC.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/SPEC.md) 定义的服务 `executionEnvironment`，并在宿主机上提供 `files` 设施。领域行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)，登记表行为归 execution-environment，都不在本页。本页的[宿主文件使用](#宿主文件使用)一节已被接受，其余是草案。[宿主文件责任域](#宿主文件责任域)与提供者的获取路径依据[本域目标协议](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6371505744)的 host-files 迁移语义写入，由 [#678 修订决定](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6398383578)具名采用，未经独立技术接受；责任域在真实装配中的保管点、跨进程退出证据与冷恢复结清不在本页兑现（[明确缺项](#明确缺项)）。

## 范围与依据

本成员有两个入口：

- 根入口与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)），导出 `createHostFiles`、`hostObjectToken`、`createHostFilesDomain` 与 `createHostFilesProvider`，以及类型 `HostFilesDomain`、`HostFilesDomainOptions`、`HostFilesQuotaPolicy`、`HostFilesProviderOptions` 与 `HostFilesDiagnostic`。
- `./cordis` 导出 Service 子类 `ExecutionEnvironmentRegistry`、登记 `files` 设施声明的插件 `filesFacilityPlugin` 与插件工厂 `createHostFilesPlugin(domain)`：它返回登记一代宿主文件提供者的插件。

上层依据：系统页[执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工，领域页[文件使用的交接](../../../docs/domains/execution-environments/architecture.md#文件使用的交接)，契约的[设施协议](../execution-environment-contract/SPEC.md#设施协议)、[INV-EE04](../execution-environment-contract/SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[INV-EE09](../execution-environment-contract/SPEC.md#inv-ee09-资源和秘密以最小必要条件提供)、[INV-EE13](../execution-environment-contract/SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) 与 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)。

两个入口的模板标记写明还没有接受的部分：`files` 的其余八项操作、`command` 与 `terminal` 的提供者、平台前提的探测、Runtime Context 生产者插件、调用方类的核对。`command` 与 `terminal` 由宿主提供者承担的部分未实现，见[宿主命令与终端](#宿主命令与终端未实现)。本成员不导入任何上层领域的契约。租户、作用域、原调用与恢复授权都随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 结果与不变量

### 宿主提供者的事实

`createHostFilesProvider(options)` 每次调用造一个提供者，也就是一代。`options.domain` 必填，是本包 `createHostFilesDomain` 创建的责任域；缺少或不是本包的责任域时抛出 `TypeError`。提供者声明下列事实：

| 事实 | 值 |
| --- | --- |
| 名称 | `host-files` |
| 代 | 每次创建时生成的随机 UUID。一个提供者对象只登记一次，所以每次登记都是新的代（一次登记化身）。创建时把代登记进责任域 |
| 版本 | 本包 `package.json` 的 `version`，运行时从包根读取 |
| 配额域 | 责任域的配额域，缺省 `host-files` |
| 绑定层 | 只有 `host_machine` |
| 连续性 | `not_guaranteed` |
| 设施键 | 只有 `files` |
| 隔离断言 | 空。本提供者不确认任何隔离 |
| 宿主事实（`describe`） | 名称、代、版本、平台（`process.platform` 加 `os.release()`）、设施键、空隔离断言，前提为 `unknown` |

- `quota(租户)` 读责任域的配额策略，答已声明（单位是一个未结清的获取）；策略抛出或给出的上界不是非负安全整数（全局上界可以为空）时答未知。它不保留名额。
- `acquire` 在提供者退役后返回 `providerUnavailable`。落点的绑定层不是 `host_machine` 时返回 `noMatchingEnvironment`。其余情况交给责任域接纳（见[宿主文件责任域](#宿主文件责任域)）：新接纳的获取交回一个租约原件，实例身份是 `host` 加提供者的代，`facility('files')` 返回这份获取的门面；证据记录提供者名称、代与版本。同一租户、同一获取键、相同指纹的重复由原记录认回：原租约仍打开时交回同一租约，否则答未知并带原获取键，不造第二个门面。指纹不同为 `acquisitionConflict`。超过按租户上界为 `quotaExceeded`，超过全局上界为 `globalCapacityExceeded`，两者都不留下记录。`acquire` 不分配外部资源，立即返回。
- 租约原件的释放：先撤掉这份租约的失效通知，再排空这份获取（封门面，最多等 `drainBoundMs`，重试失败的关闭）。什么都不剩时答已释放，名额只返还一次；否则答待处置，资源清单为空，名额仍占用。待处置之后可以重试释放。
- `inspectAcquisition(原描述)` 读责任域的原记录：打开的答已获取（带原租约与证据），释放中的答待定（阶段 `releasing`，资源为空），已结清的答已结清，指纹不同的答冲突。没有记录时，原描述的提供者代是本责任域签发过的代则答未分配，否则答未知：新进程的责任域没有证据说明旧容量已经结清。配额域与本责任域不同的原描述按没有记录处理。
- `listAcquisitions(作用域)` 列出请求方作用域是该作用域、尚未结清的全部获取的原描述，包括没有受管资源的获取。
- `settleAcquisition(原描述)` 与查询做同样的定位，然后排空这份获取：封门面、使原租约以来源 `provider`、原因 `released` 失效、等在途操作、重试失败的关闭。什么都不剩时答已结清，否则答待处置（资源为空）。结清不重做文件写入，也不回滚已写入的字节。重复结清答已结清，不再返还名额。
- 本提供者的文件操作不留下受管资源。`listRecoveryResources` 答完整的空列表；`recover` 对任何资源答不支持，证据为空。描述符、在途操作与失败关闭由获取路径（枚举与结清）覆盖，空的资源列表不证明没有这些责任。
- 本提供者不读账本：账本关闭后的拒绝由登记表的门在调用设施之前做（[INV-EE15](../execution-environment-contract/SPEC.md#inv-ee15-准备持有回收与确认保持一致)）。直接调用 `createHostFilesProvider` 得到的租约原件不经过门，不查账本。请求方作用域随 `ProviderAcquireInput.scope` 到达，进入原描述与获取枚举。
- `retire()` 先把提供者标为已退役，之后新的获取返回 `providerUnavailable`。然后它封住这一代全部尚未结清的获取的门面，使它们的租约原件以来源 `provider`、原因 `providerRetired` 失效，再逐份排空。每份都结清时返回已排空，否则返回待处置，资源为空，并给 `diagnose` 一条诊断。原记录与仍打开的描述符留在责任域，新的代经同一责任域查询与结清它们。待处置之后再调用 `retire()` 会再排空一次。
- `drainBoundMs` 的初值是 10000，用于释放、结清与退役。它必须是有限的非负数，否则 `createHostFilesProvider` 抛出 `RangeError`。
- 诊断 `HostFilesDiagnostic` 在结果为待处置时给出：仍有在途操作时 `kind` 为 `drainBoundExceeded`，只剩关闭失败的描述符时为 `closePending`；带提供者名与代、在途操作数、打开的描述符数与上界，释放或结清时另带获取键。`diagnose` 抛出不改变结果。

前提报 `unknown`，因为平台前提的探测还没有接受。提供者事实不携带日期（日期由后续宿主事实块生产者在块级提供，见[契约 INV-EE17](../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。

### 宿主文件责任域

`createHostFilesDomain(options)` 创建一个责任域。进程宿主的单一拥有者创建并保管它，把同一个责任域交给每一代提供者；它比提供者与登记表的重载活得更久。共享同一宿主容量的两个登记必须共享同一个责任域对象。依据：[契约的提供者的进程内证据边界](../execution-environment-contract/SPEC.md#提供者的进程内证据边界)。

- 责任域带配额域（缺省 `host-files`，空串抛出 `RangeError`）、进程实例身份（创建时的随机 UUID）与 `durability: 'process'`。它的记录只在本进程内。
- 配额策略 `quota(租户)` 在每次接纳时读取，给出按租户上界与全局上界；缺省是每租户 64 个、没有全局上界。策略可替换，数值只是配置初值。
- 接纳在一个没有 `await` 的同步段里完成：先核按租户上界，再核全局上界，再写入记录并占一个名额。所以同一配额域里抢最后一个名额的两次获取只有一次得到。占用按记录计数：尚未结清的记录各占一个名额，不论属于哪一代。降低上界不抹去已有占用，只停止新的接纳，直到占用低于新上界。
- 每份获取有一个门面：自己的准入开关与在途操作集合。每个已准入的操作在第一次 `await` 之前登记到这份获取。门面封住之后，新操作答 `closed`，不触碰文件系统。
- 责任域持有一个共用的文件引擎。引擎给每个签发的句柄与每个关闭失败的描述符记上这份获取的所有者标签，请求不能改写它。句柄代际在引擎内唯一，所以同一文件对象上两份获取的句柄不碰撞。一份获取的门面关闭不了另一份获取持有的句柄，答未知。这条边界不限制两份合法获取分别访问同一个已授权的文件对象。
- 排空一份获取：封门面，标为释放中，最多等 `drainBoundMs` 让在途操作结束，然后重试这份获取的全部失败关闭。在途操作已结束且没有打开的描述符时，记录结清，名额恰好返还一次；否则保持释放中，名额仍占用。
- `maintain()` 对全部释放中的获取重试关闭（不再等在途操作），答还剩几份未结清。提供者卸载之后，责任域的拥有者用它继续驱动原记录；结清入口也经同一排空。
- 已结束的操作答未知、但描述符已经关闭且没有在途操作时，容量可以结清；未知的文件结果仍属于原请求，不改写成未写入，不重做写入，也不删除文件。

已发出的未知文件效果、文件字节的保存不占名额，也不由本节定义它们的数据寿命。冷恢复不在本节：新进程创建新的责任域，它不认识旧进程的代，对旧原描述答未知，不答未分配，也不声称旧责任已经结清。

### 宿主文件使用

本节已由 PanQiWei 接受，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。它落实契约[设施协议](../execution-environment-contract/SPEC.md#设施协议)里文件操作的最小调用事实。请求携带访问身份 `access`（主体加租户）、绑定 `binding`、原调用引用 `origin` 和这次请求身份 `requestId`。设施和租约的定义在[契约对象模型](../execution-environment-contract/docs/object-model.md)。存储编码仍未另定。宿主机上的打开和身份核对在[架构](docs/architecture.md#宿主文件使用)。根入口导出宿主文件使用的 `createHostFiles` 与 `hostObjectToken`，`./cordis` 导出登记它的 `hostFilesPlugin`。路径上没有对象时结果是未解析。授予根限制没有包测试。活句柄还开着时关闭失败有包测试；观察记录在架构页。当前包测试在 Node v24.18.0、linux 上运行，记录在[组合与验证](#组合与验证)。

这一次文件使用只包含读取、查看、写入和关闭。编辑、补丁、按名查找、按内容查找和图片附件留在 `Files()`。列表、移动、复制、删除和建目录若以后进入设施，必须复用同一次对象绑定。本节不定它们的产品结果。

宿主机落点上，调用方（执行适配/授权层）负责在使用前按当前授权点名对象的设备号与 inode，并把该点名结果作为 `named` 随请求交给本设施。`hostObjectToken` 仅按路径识别当前对象的设备号与 inode，不授予访问权，也不替调用方重新核对授权是否仍然有效。本设施只核对打开到的对象与 `named` 是否一致。路径落在该对象上。路径含空字节则拒绝，关闭也一样。执行适配确认打开到的对象就是点名对象，才把读取或写入记成完成。完成只挂在这个对象和这次句柄代际上。身份与点名不一致才拒绝。确认不了打开结果时是未知。两种情况都不把这次请求改到别的落点。

声称文件限制的落点使用授予根身份。请求不能另带一个绝对路径充当这个根。路径相对于该根。该落点没有实现时，依赖该限制的文件请求拒绝。

`Files()` 消费这次确认。`Shell()` 不消费它。命令碰到的文件不经过这次确认。要限制命令能碰的文件，由执行环境权限把该次作用放到沙箱。

读取完成不表示写入完成。后一次请求重新确认。关闭是另一次请求。关闭成功只表示该句柄代际已得到成功回执。没有成功回执时，关闭结果是未知，已读到或写到的结果仍留在原来的请求上。调用方丢掉引用不是关闭成功。对已经关闭的描述符再次关闭，不是一次活句柄关闭失败。

授权点名可以用替身核对。文件字节、符号链接和对象替换使用真实文件系统。同一次请求身份只有一种确认。

#### 接受之后的补充（未接受）

下列句子是接受之后补写的现状，不在上面的接受范围内：

- 上面接受段落里的 `hostFilesPlugin` 指插件工厂 `createHostFilesPlugin(domain)` 返回的插件；本设施的已接受行为不变。依据：[#678](https://github.com/nemori-ai/omne-harness-lite/issues/678)。
- 每份获取经自己的门面使用共用的文件引擎；句柄代际的代次在责任域内唯一。直接调用 `createHostFiles` 得到的设施仍从 1 开始。
- 跨租户拒绝由登记表的租约视图在调用本设施之前执行，测试在 [execution-environment](../execution-environment/tests/registry.spec.ts)。直接调用 `createHostFiles` 得到的设施不核对租户。
- PanQiWei 接受时，本成员的包测试只在 Node v26.0.0、darwin 上运行过。

### 宿主文件设施的其余现行行为

下列行为是本成员源码现在的行为，不在上一节的接受范围内：

- 本设施的结果用契约的设施结果四态表达：完成是 `done`，未解析是 `unresolved`，拒绝是 `rejected` 带原因，未知是 `unknown`。
- 绑定层不是 `host_machine` 的请求返回 `rejected`，原因 `unsupported`，不触碰文件系统。
- 读取、查看、两种模式的写入与关闭的路径必须是绝对路径。相对路径返回 `rejected`，原因 `invalidInput`，不触碰文件系统。含空字节的路径同样如此。
- 契约的 `files` 设施另有列表、搜索、建目录、删除、移动、复制、提交批次与恢复批次八项操作。本设施对这八项一律返回 `rejected`，原因 `unsupported`，不触碰文件系统。
- 打开失败按错误码映射：`ENOENT`、`ENOTDIR` 为未解析；`ELOOP`、`EMLINK`、`EISDIR` 为 `unsupported`；`EINVAL` 为 `invalidInput`；`EACCES`、`EPERM` 为 `notAuthorized`；其余错误为未知。
- 读取接受起点与上限两个字节数。两者必须是非负安全整数，否则返回 `invalidInput`。读取目录返回 `unsupported`。完成时带字节、下一次读取的起点与是否已到文件末尾。
- 查看完成时带对象类型（文件或目录）、字节数与修改时间。
- 版本是修改时间与字节数的组合。替换写入带预期版本而当前版本不同时返回 `conflict`，文件不变。
- 写入有两种模式。替换模式按上一节写入。路径上没有对象时，替换模式返回未解析。
- 新建模式的 `named` 是父目录。本设施在独占新建前后各核对一次父目录的设备号与 inode。新建模式带预期版本，或路径以斜杠结尾，返回 `invalidInput`。父目录不存在返回 `notFound`。目标已存在返回 `conflict`。新建之后父目录身份变了，返回未知，已建的文件留在原处。
- 本设施在调用时取下请求身份与待写字节的副本。调用方在调用之后改动请求对象，不影响这次操作。

### Service 实现

- `ExecutionEnvironmentRegistry<P>` `extends ExecutionEnvironmentService<P>`，不另写键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。构造时调用 `createEnvironmentRegistry`，把环境面与恢复面七个方法原样转给登记表。
- 三个端口都不经构造参数进入。登记表的恢复授权、环境授权与可信绑定每次被调用时，Service 用自己装载时的上下文 `ctx.get` 现取 `executionRecoveryAuthority`、`executionEnvironmentAuthority` 与 `executionScopeBinding` 服务并转交（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)、[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。取不到时答不可用：没有装载恢复授权服务时，`recoverOwned` 与 `releaseScope` 以 `unavailable` 拒绝；没有装载环境授权或可信绑定服务时，环境面以 `unavailable` 拒绝，查询答查询不可用，不放行。服务方法里的 `this.ctx` 是调用方的上下文，不从那里取端口。
- `registerFacility` 与 `registerProvider` 在方法里用 `this.ctx.effect` 调用登记表的同名方法。登记落在调用方插件的 fiber 上，调用方卸载即撤除（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。`registerFacility` 返回的撤除函数调用同一个效应撤除。`registerProvider` 返回的撤除函数直接调用登记表的撤除函数：它可以重试，并发调用共用一次退役；效应只在调用方 fiber 卸载时调用一次登记表的撤除函数。
- Service 子类与 `filesFacilityPlugin` 的配置只接受缺省、`null` 或空对象，其余值以「configuration accepts no fields」校验失败（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。
- 宿主文件插件的配置 `HostFilesConfig` 接受缺省、`null`、空对象，或只带 `drainBoundMs` 的对象。`drainBoundMs` 必须是有限的非负数；其他字段或其他值校验失败，插件不装载。缺省时取提供者的初值。
- `filesFacilityPlugin` 与 `createHostFilesPlugin(domain)` 返回的插件，`inject` 都是服务键常量并声明 `caller: provider`。`filesFacilityPlugin` 装载时经 `ctx.executionEnvironment` 登记 `files` 设施声明，不登记提供者。宿主文件插件装载时用工厂收到的责任域与配置的 `drainBoundMs` 登记一代新的宿主文件提供者，不登记声明。待处置的诊断经 `ctx.logger('executionEnvironment.hostFiles')` 以错误级写出。声明的生灭与宿主提供者的生灭分开：只装宿主文件插件时，需要 `files` 的落点解析返回 `missingFacility`。责任域是运行时对象，不进 JSON 配置。
- 本成员不读取调用方类的 intercept 配置，不按调用方类拒绝调用。
- 本成员不登记 Runtime Context 的生产者，不发布 `execution.placement` 与 `execution.host-facts` 两条块。
- 装配规则：Service `ExecutionEnvironmentRegistry` 与宿主文件插件在同一插件树里装载。宿主文件插件可以重载：卸载只退役这一代，责任域由进程宿主保管，新的一代加入同一个责任域，看到原占用与原记录。这条规则现在没有强制执行点，见[明确缺项](#明确缺项)。

### 宿主命令与终端

<a id="宿主命令与终端未实现"></a>

本节写宿主提供者承担的 `command`。`command` 只在 Linux 上实现（Q-9）。`terminal` 未实现，不在 M2（D-05）。机制见[架构的宿主命令机制](docs/architecture.md#宿主命令机制)。依据是 GATE-EE 候选第 3、4 节与 [D1 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。本节没有经过独立技术接受。

提供者与终端：

- `command` 加在已有的宿主提供者上，与 `files` 由同一个提供者声明，不另立宿主提供者。所以需要 `files` 加 `command` 的工具在宿主层不会得到 `missingFacility` 或 `ambiguousEnvironment`。
- 宿主提供者不声明 `terminal`。`outputMode` 为 `terminal` 的启动，以及带 `geometry` 的启动，答 `rejected`，原因 `unsupported`。本成员不引入 node-pty。
- 宿主提供者不声称任何隔离断言。命令能碰到的文件不受宿主文件根限制，也不经过[宿主文件使用](#宿主文件使用)的确认。

启动前的检查不起进程，也不调用账本。检查按下面的顺序：

1. 绑定层不是 `host_machine`，或者请求 `terminal` 模式或 `geometry`，答 `unsupported`。
2. `executable` 或 `cwd` 不是绝对路径或含空字节，参数含空字节，环境变量名为空、含 `=` 或含空字节，或者值含空字节，答 `invalidInput`。
3. 这份获取的命令门面已经封住，答 `closed`。
4. 平台前提不满足，答 `unavailable`。`diagnose` 收到一条 `commandUnavailable` 诊断，写明缺少的前提项与获取键。

平台前提：

| 项 | 探测 | 前提项名 |
| --- | --- | --- |
| P1 | `process.platform` 是 `linux` | `linux` |
| P3 | 在 `PATH` 里解析 `systemd-run` 与 `systemctl` 的绝对路径，并从 `systemctl --help` 读出它支持 `--kill-whom` 还是旧名 `--kill-who` | `systemd-tools` |
| P4 | `systemctl --user is-system-running` 输出 `running` 或 `degraded` | `user-manager` |
| P5 | `/sys/fs/cgroup/cgroup.controllers` 存在 | `cgroup-v2` |
| P6 | 一个探测单元 `omne-host-probe-<uuid>.scope` 运行一个空的 Node 程序并以 0 退出，之后按强制停止序列停止，必须答 `confirmed` | `scope-round-trip` |

- 提供者创建时在后台开始一次探测。第一次启动等这次探测的结果。之后只用探测时解析出的两个绝对路径。
- 满足的结果在这一代内保留。不满足或探测本身出错时，距上次探测达到 `probeRetryMs` 的下一次启动重新探测。所以修好环境不需要重启进程。
- `describe()` 的前提：探测未完成或探测本身出错为 `unknown`，任一项不满足为 `unsatisfied`，全部满足为 `satisfied`。不满足的项名只写进诊断，不进宿主事实。
- 缺前提不影响落点解析与获取。同一份获取的 `files` 照常可用，只有启动答 `unavailable`。
- 真实的 Bash、GNU `env`、`stty` 与 node-pty 不是前提。`files` 的目录描述符前提（P2）不约束 `command`，命令不使用身份目录。
- 运行中 `systemd-run` 失败不改写探测结果，只影响这一次启动。

启动：

1. 资源键是新的 UUID。执行域是 systemd 用户 scope 单元 `omne-host-<资源键>.scope`，单元描述是 `omne-host <请求方作用域的摘要> <资源键>`。受管资源的引用是 `{ unit, bootId }`，`bootId` 是本机当前的启动身份。
2. 调用账本的 `plan`。`conflict`、`closed` 与 `unavailable` 原样作为拒绝原因，不起进程。
3. 用探测解析出的 `systemd-run` 在这个单元里起门进程。请求经私有管道（描述符 3）交给门，不放在命令行参数里，因为环境变量可能带秘密。
4. 门核对 `/proc/self/cgroup` 含有自己的单元，然后报就绪。启动这时调用账本的 `permit`。只有 `confirmed` 才发 GO，GO 只发一次。其余答案使启动强制停止这个单元，记入账本的 `stopped`，然后答 `rejected`（`closed` 或 `unavailable`）。门面在这时已经封住，也这样处理，答 `closed`。
5. 门收到 GO 后起命令。命令的环境只有请求给出的变量，不继承宿主的变量。标准输入写入请求的字节后关闭。标准输出与标准错误分开读。
6. 命令起来后，启动答 `done`，带 `ProcessHandle`。进程身份是 `{ id: 单元名, generation: bootId }`，不用进程号。映像没有起来（例如 `ENOENT`、`EACCES`）时，启动强制停止这个单元，答 `rejected`（`unavailable`）。门在报就绪之前退出时，同样答 `unavailable`。
7. 在 `startBoundMs` 内没有收到就绪时，启动答 `unknown`，之后不再发 GO。发出 GO 之后在上界内没有收到命令起来的消息时，也答 `unknown`。这两种情况都把资源留给释放、结清或退役去停止。

输出与结局：

- 门把两条流的字节按 `maxChunkBytes` 切块，每块编成一行 JSON 帧交给提供者。提供者限制一行的长度。超长的行、不是 JSON 的行、未知的帧、次序不对的帧、超过单块上限的字节，都使这个资源失效：`result` 答 `failed`（`effectUnknown`），提供者强制停止这个单元。
- 两条流共用一个上限为 `maxBufferedBytes` 的缓冲。新块放不下时整块丢弃，按流累加丢弃的字节数。下一个交出的块的 `observedOffset` 与上一块末尾之差就是丢弃量。
- `output` 只有一个读者。第二个迭代器的第一次 `next()` 以 `TypeError` 拒绝。读者的 `return()` 只放弃读取权，不停止进程。读者放弃之后，缓冲里的字节与之后的字节都计入丢弃。
- 门一侧：门写帧的管道写满时（写端返回 false），门暂停读命令的两条管道，`drain` 之后恢复。所以命令在提供者读得慢时被阻塞在自己的输出管道上，字节不丢，门的内存也不随输出增长。提供者总是立刻读帧，所以缓冲满时丢弃，不阻塞命令。
- 命令的主进程退出后，门等两条管道关闭，或者等输出连续 100 毫秒没有新字节，再发退出帧。命令留在后台的进程可能还占着管道，所以不能只等管道关闭。
- 收到退出帧时，`result` 答 `completed`，带退出码或信号、时长与两条流的计数。没有收到退出帧时答 `failed`（`effectUnknown`），带观察到的时长与计数。强制停止时门与命令在同一个单元里被杀，所以强制停止的结局是 `failed`（`effectUnknown`）。
- 主进程退出之后，提供者强制停止这个单元，清掉命令留在后台的进程，并把结果记入账本。这一步不推迟 `result`。

停止两态：

- `stop('forced')`：先 `systemctl --user kill --kill-whom=all --signal=SIGKILL <单元>`（旧版 systemd 用 `--kill-who`），再 `systemctl --user stop <单元>`。`stop` 的退出码 5（单元未加载）按已不在处理，其余失败答 `unconfirmed`。然后等门进程退出，再用 `systemctl --user show -p LoadState -p ActiveState` 读单元。`ActiveState` 为 `inactive` 或 `LoadState` 为 `not-found` 才答 `confirmed`。在 `stopBoundMs` 之内会再读，之后答 `unconfirmed`。
- `failed`、`deactivating` 与其他状态都不算停止。被信号杀掉的单元可能短暂处于 `failed`。WSL 上的用例没有观察到这个状态，这一判断只有纯函数测试。真实的 `failed` 状态未验证。
- `stop('graceful')`：门把 `SIGTERM` 发给命令的主进程，最多等 `graceMs`。命令在这段时间里退出时，接着做强制停止序列来清掉单元，答序列的结果。超时答 `unconfirmed`，不自动升级为强制停止，由调用方决定。
- 每次停止都把结果记入账本的 `stopped`。只有确认的停止已经记入账本，这个进程才离开这份获取的待停止集合。
- 停止只作用于这个进程的单元。同一份获取的另一个进程不受影响（单调用中断）。

释放、结清与退役：

- 排空一份获取时，命令门面与文件门面一起封住，然后在 `drainBoundMs` 之内等在途的启动，再强制停止这份获取里停止尚未确认的每个进程。全部确认才结清。否则答待处置，资源清单列出停止未确认的受管资源，`diagnose` 收到一条 `stopUnconfirmed` 诊断。释放中的原记录查询也列出这些资源。`maintain()` 与之后的结清再试。
- 退役对这一代的每份获取做同样的排空。所以这一代仍在运行的命令被强制停止，结局为 `failed`（`effectUnknown`）。
- 已知限制：配置重载会卸载宿主文件插件，从而以 `effectUnknown` 结束这一代仍在运行的命令（D1 结论第 3 条）。这些命令不交给后继的一代接管。

资源级冷恢复（不含获取的结清）：

- `listRecoveryResources(作用域)`：不是 Linux 的宿主没有运行过命令，答完整的空列表。Linux 上读本用户全部 `omne-host-*.scope` 单元的描述，列出描述里的作用域摘要与这个作用域相同的单元。列举命令失败或找不到 `systemctl` 时答 `unavailable`，不答空列表。上一次启动的单元已随重启消失，所以不在列表里。
- `recover(资源)`：提供者名不是本提供者，或引用不是本提供者写下的 `{ unit, bootId }`（单元名必须是 `omne-host-<uuid>.scope`），答 `unsupported`。所以恢复不能停止别的单元。启动身份已变时答 `confirmedStopped`，证据写明单元与当前的启动身份。否则按强制停止序列停止并核对：确认时答 `confirmedStopped`，证据带单元、`LoadState` 与 `ActiveState`；未确认时答 `pending`。它不重启命令，不接回输出，也不交出原结局。
- 新进程对旧获取的结清仍答未知（见[宿主文件责任域](#宿主文件责任域)）。需要域外可信的进程退出证据的结清是 M2 之后的剩余责任。
- 已知限制：列举依赖单元描述。同一用户的其他进程可以伪造描述。M2 单机、同一操作者，接受这一点。

策略数值都是配置，代码里的数值只是初值。宿主文件插件的配置可以给出这六项：

| 配置 | 初值 | 作用 |
| --- | --- | --- |
| `maxBufferedBytes` | 1 MiB | 一个进程的输出缓冲上限，正整数 |
| `maxChunkBytes` | 64 KiB | 门发出的单块上限，正整数，不大于缓冲上限 |
| `startBoundMs` | 10000 | 启动等就绪与命令起来的上界 |
| `graceMs` | 5000 | 平和停止等命令退出的时间 |
| `stopBoundMs` | 10000 | 一次强制停止序列的上界，也是探测中各条命令的上界 |
| `probeRetryMs` | 60000 | 不满足的探测结果保留多久 |

时间项必须是有限的非负数。值不合法时 `createHostFilesProvider` 抛出 `RangeError`，插件配置校验失败。提供者选项另有 `filesRoot` 与 `stateDirectory` 两个字符串，插件配置要求它们是绝对路径。命令一侧只保存它们，不使用。

### 撤除顺序

- 宿主文件插件卸载时，这一代宿主文件提供者开始退役。退役使它交出的租约以 `providerRetired` 失效，之后 `files` 不再有提供者，宿主层的落点解析返回 `noMatchingEnvironment`。`files` 设施声明与责任域不受影响。退役逐份排空这一代的获取，最多等 `drainBoundMs`；待处置时 `ctx.logger` 先收到诊断，再收到 `RetirementPending`。原记录与仍打开的描述符留在责任域，由新的一代或责任域的维护入口继续结清。
- 退役的排空强制停止这一代仍在运行的命令，它们的结局是 `failed`（`effectUnknown`）。停止未确认的进程作为受管资源列在待处置里，`RetirementPending` 带着它们。配置重载走同一条路径（见[宿主命令与终端](#宿主命令与终端)的已知限制）。
- `commandFacilityPlugin` 卸载时，`command` 设施声明从登记表移除。之后需要 `command` 的落点解析返回 `missingFacility`。宿主提供者与已经起来的进程不受影响。
- `filesFacilityPlugin` 卸载时，`files` 设施声明从登记表移除。之后需要 `files` 的落点解析返回 `missingFacility`，已取到的 `files` 设施对象上的操作返回 `unsupported`。宿主文件提供者仍在场。
- `ExecutionEnvironmentRegistry` 卸载时，它在构造时登记的效应调用登记表的 `close()`。关闭顺序归 [execution-environment SPEC 的关闭](../execution-environment/SPEC.md#关闭)。关闭结果是待处置时，这个效应的撤除函数抛出 `RetirementPending`，带未停的受管资源。
- fiber 卸载本身总是完成。退役或关闭待处置时，撤除函数抛出的 `RetirementPending` 由 Cordis 写入 `ctx.logger` 的错误，卸载不失败，`fiber.dispose()` 正常返回（Cordis 4.0.4 读数，见 [Cordis 说明](docs/cordis.md#机制读数与假设)）。未停的资源经这条错误与登记表的退役、关闭结果可见。只有调用方直接调用 `registerProvider` 返回的撤除函数时，待处置才以抛出报告。
- 服务卸载时，`inject` 了本服务的插件随之卸载或重跑，它们的效应与服务的关闭并发运行。提供者退役共用一次 `retire()` 调用，不因两条撤除路径而退役两次。
- 撤除不撤回任何外部效果。已经写入宿主文件的字节留在文件里。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 失败时 | 结束 |
| --- | --- | --- | --- |
| 服务实例与登记表实例 | `ExecutionEnvironmentRegistry` 插件的 fiber | 关闭待处置时撤除函数抛出 `RetirementPending`，Cordis 记入 `ctx.logger`，卸载照常完成 | 插件卸载 |
| `files` 设施声明的登记 | `filesFacilityPlugin` 的 fiber | 重复登记抛出，插件 fiber 进入 `FAILED` | 插件卸载，或服务撤除 |
| 宿主文件提供者的登记（一代） | 宿主文件插件的 fiber | 重复登记抛出，插件 fiber 进入 `FAILED`；这一代的获取没有全部结清时退役待处置，撤除函数抛出 `RetirementPending` | 插件卸载，或服务撤除 |
| 宿主文件责任域 | 进程宿主的单一拥有者 | 不随插件或服务卸载；记录只在本进程内，进程结束后没有证据说明旧容量已经结清 | 拥有者丢弃它，或进程结束 |
| 获取记录、名额与门面 | 宿主文件责任域 | 排空待处置时名额仍占用，记录仍可查询与结清；`maintain()` 与结清继续驱动 | 排空确认什么都不剩，名额恰好返还一次 |
| 在途文件操作 | 所属获取的门面 | 超过上界仍未结束时，诊断写明它们的数目；它们仍在运行，结果仍交回原请求 | 操作返回 |
| 关闭失败的描述符 | 所属获取（引擎里的所有者标签） | 留在共用文件引擎里，这份获取的操作、排空、结清与 `maintain()` 重试关闭；别的获取关不了它 | 关闭成功 |
| 已发出的句柄代际 | 共用文件引擎，带所属获取 | 关闭没有成功回执时为未知 | 关闭成功回执 |
| 写入宿主文件的字节 | 宿主文件系统 | 截断后没写完时为未知 | 不随撤除撤回 |
| `command` 设施声明的登记 | `commandFacilityPlugin` 的 fiber | 重复登记抛出，插件 fiber 进入 `FAILED` | 插件卸载，或服务撤除 |
| 平台前提的探测结果 | 宿主提供者的一代 | 探测出错为未知；不满足时在 `probeRetryMs` 之后的启动再探测 | 这一代被丢弃 |
| 命令进程与它的 scope 单元 | 所属获取的命令门面；单元由 systemd 用户管理器持有 | 停止未确认时作为受管资源留在这份获取，排空、结清、退役与 `maintain()` 再试；进程结束后由资源恢复按单元坐标列举与停止 | `systemctl --user show` 读到不活动或不存在，且结果已记入账本 |
| 命令的输出缓冲 | 这个进程的句柄 | 放不下的块整块丢弃并计数；读者放弃后全部计入丢弃 | 读者读完或放弃，且进程已有结局 |
| 命令已经产生的外部效果 | 宿主机 | 停止不撤回它们；强制停止的结局是 `effectUnknown` | 不随停止或撤除撤回 |

进程失败：本成员没有可恢复的东西。宿主文件提供者没有受管资源，责任域的记录随进程结束。新进程的责任域对旧进程的原描述答未知，不答未分配；需要域外可信进程退出证据的冷恢复结清交 [#323](https://github.com/nemori-ai/omne-harness-lite/issues/323)。登记表的重建沿 [execution-environment SPEC](../execution-environment/SPEC.md#所有权失败与生命周期)。撤除函数抛出的错误只进 `ctx.logger`，`fiber.dispose()` 的调用方观察不到，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、登记即效应 | [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) |
| 登记表的匹配、获取、门、退役、恢复与关闭 | [execution-environment SPEC](../execution-environment/SPEC.md) |
| 设施协议、结果四态、文件使用的最小调用事实 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md#设施协议) |

持续验证在 `tests/`，文件字节、符号链接、对象替换与描述符都用真实文件系统：

| 测试文件 | 覆盖 |
| --- | --- |
| [host-file-results.spec.ts](tests/host-file-results.spec.ts) | 未点名拒绝、空字节拒绝、未解析、末段符号链接拒绝、中间目录换成链接、经祖先链接读取、查看与写入不带字节、关闭只回句柄、撤权后保留旧字节、对象替换后不复用旧完成、关闭失败的三种路径、代次递增、尾部斜杠、目录读取、请求与字节的快照、错误路径保留无法关闭的描述符 |
| [host-files.spec.ts](tests/host-files.spec.ts) | 读工作区目录之外的点名文件、字节范围、查看、新建与拒绝覆盖、父目录不符拒绝、预期版本不符拒绝；相对路径在读取、查看、两种写入与关闭上返回 `invalidInput` 且不触碰文件 |
| [host-files-unsupported.spec.ts](tests/host-files-unsupported.spec.ts) | 八项未实现操作返回 `unsupported` 且不触碰文件系统 |
| [host-file-edges.spec.ts](tests/host-file-edges.spec.ts) | 查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问为 `notAuthorized`；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态的版本在写入、读取、查看与新建之间一致 |
| [host-provider.spec.ts](tests/host-provider.spec.ts) | 宿主提供者声明的事实（版本等于 `package.json`、平台带 `os.release()`、前提 `unknown`、配额域、完整空资源枚举与对意外资源答不支持）；租约的身份、证据（带版本）与只有 `files`；沙箱落点与退役后的拒绝；经登记表的门，账本关闭后写入返回 `closed` 且文件不变，另一份获取的账本不受影响；没有在途操作时退役立即已排空，之后新操作 `closed`；界值非法抛 `RangeError`；退役只通知尚未释放的租约 |
| [host-provider-drain.spec.ts](tests/host-provider-drain.spec.ts) | 用 `vi.mock` 让带标记路径的 `open` 停住，其余是真实文件系统：在途写入未结束时退役不返回、期间新操作 `closed`，写入结束后已排空；超过上界时待处置、受管资源为空、诊断 `inFlight` 为 1，放行后再退役已排空；经 Cordis 以 `{ drainBoundMs: 20 }` 装载后卸载，`ctx.logger` 先后收到诊断与 `RetirementPending`，卸载完成 |
| [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | 装载两个访问端口服务、服务、`filesFacilityPlugin` 与宿主文件插件后经租约读文件；访问端口服务缺席或只装一个时落点解析为 `unavailable`，可信绑定把作用域绑到别的租户时为 `notAuthorized`；沙箱层没有提供者；宿主文件插件卸载后租约以 `providerRetired` 失效、宿主层没有匹配；只装提供者时落点为 `missingFacility`，卸载声明插件后已取到的设施返回 `unsupported`；服务卸载后键上没有服务、租约以 `registryClosed` 失效、新获取返回 `ownerStopped`；恢复授权服务缺席时恢复两操作返回 `unavailable`，装载后被现取、宿主提供者的资源枚举为完整空列表（不记为不支持），卸载后又返回 `unavailable`；授权后释放作用域使宿主租约以 `scopeReleased` 失效，该作用域的再获取与落点解析为 `referenceExpired`；`describe` 列出该作用域的宿主落点；经服务登记的提供者退役待处置时，返回的撤除函数每次调用都再退役并抛出 `RetirementPending`；退役与关闭待处置时 fiber 卸载照常完成，`ctx.logger` 收到 `RetirementPending`；宿主文件插件只接受合法的 `drainBoundMs`，Service 与声明插件只接受空配置 |
| [host-domain.spec.ts](tests/host-domain.spec.ts) | 用 `vi.mock` 让带标记路径的 `open` 停住，并让活描述符上的 `close` 按计数失败，其余是真实文件系统与真实描述符：一份获取释放时在途写入未结束为待处置、资源为空、名额仍占用，另一份获取照常写入，被释放的门面拒新操作，放行后结果回原请求，再释放才返还名额且只返还一次；读取后关闭失败的活描述符归原获取，退役不报已排空，租约失效后 `maintain()` 关闭它并结清；错误路径的描述符使结清先待处置、关闭后结清；同一文件的两份获取代际不同，一份获取关不了另一份的句柄；同一责任域里提供者重载后新代看到原占用、列出并查询旧获取为释放中、结清它，旧租约不复活；登记表重建后经恢复查询看到已分配、经 `recoverOwned` 的已知列表结清；降低上界不抹旧占用，并发抢最后一个名额只一个得到，全局上界单独报告；新进程的责任域对旧代答未知，自己签发的代答未分配，指纹不同答冲突；未知文件结果下结清不改字节；缺责任域或配额域为空时抛出 |
| [contract-conformance.spec.ts](tests/contract-conformance.spec.ts) | 登记表经两个端口替身通过契约的环境套件，宿主提供者通过提供者套件（在途排空一项不适用）；五种故障的登记表被套件拒绝 |
| [public-entry.spec.ts](tests/public-entry.spec.ts) | 根入口只导出四个函数；根入口可达的模块不导入 Cordis 或 `./cordis` |

运行记录：

- PanQiWei 接受时，包测试只在 Node v26.0.0、darwin 上运行过。
- 2026-10-25 在 Node v26.12.0、linux 上，本成员目录的 `vitest run` 的 10 个测试文件、148 个测试全部通过，退出码 0。本成员 `package.json` 声明的引擎是 `>=24`。

本成员不覆盖：授予根限制、平台前提的探测、`command` 与 `terminal` 提供者、Runtime Context 块的发布、调用方类核对、同一 isolate 标签下重复装载的失败、配置校验失败时 fiber 进入 `FAILED`，以及真实进程退出之后的冷恢复结清。持久化、真实端口适配与真实集成方的端到端组合也不在本成员。独立验收场景尚未形成。

### 明确缺项

- 长期运行的保留与淘汰策略待定（应可配置）：共用文件引擎的已签发句柄表与责任域的已结清记录只增不减，当前随进程结束释放。
- 宿主文件插件可以重载而责任域保留，这一点依据本域目标协议；它与产品正文第 2 版「宿主机提供者随执行环境一起在场，不单独装卸」的关系，以及与 #278 已接受的插件形状谁先谁后，待产品负责人与契约拥有者确认。装配规则现在没有强制执行点。
- 责任域在真实装配中的保管点与唯一分发没有采用：本成员只给出工厂 `createHostFilesDomain` 与插件工厂，进程宿主怎样保管并唯一分发它归应用装配（[#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)）。本成员不新增服务或包。
- 维护驱动的调度没有实现：`maintain()` 与结清是入口，谁在提供者卸载之后定时调用它们归责任域的拥有者与应用装配。
- 冷恢复结清需要域外可信的进程退出证据，以及原提供者代到进程实例的可核验关联；本成员没有，具名剩余责任交 [#323](https://github.com/nemori-ai/omne-harness-lite/issues/323)。在它兑现之前，新进程对旧原描述只答未知。
- 配额、查询、迟到与结清协议的行为模型没有进入本成员的 `verification/models/`，相应机制路径保持未验证。
- 两个插件仍是手写的插件对象，没有经过 kernel-basis 的 `definePlugin`，空配置 Schema 与宿主文件插件的配置 Schema 仍在本成员（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。加依赖需要更新工作区锁文件，待派发者裁定。
