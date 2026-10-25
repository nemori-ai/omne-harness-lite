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

### 宿主命令与终端（未实现）

本节写 `command` 与 `terminal` 由宿主提供者承担的部分。这些部分都没有实现。机制设计见[架构的宿主命令与终端机制](docs/architecture.md#宿主命令与终端机制设计未实现)，机制级流程见[流程](docs/flows.md)。

- 提供者：`command` 与 `terminal` 加在已有的宿主提供者上，与 `files` 由同一个提供者声明，不另立宿主提供者。这样宿主层仍由一个提供者提供全部所需设施，需要 `files` 加 `command` 的工具不会得到 `missingFacility` 或 `ambiguousEnvironment`。
- 平台前提：Linux 的用户 systemd 与可用的用户管理器、真实的 Bash、GNU `env`、`stty` 与 node-pty。缺任一项时，宿主提供者对 `command` 与 `terminal` 的操作报 `unavailable`，不改用猜测的进程号或假的后端。宿主事实块报告前提满足、不满足或未知；探测被接受之前报未知。
- 隔离：宿主提供者只能确认进程隔离，不能确认文件系统根或无网络。
- 策略数值：输出的缓冲上限与单块上限、等待的上界与终端的缺省尺寸都是配置，代码里的数值只是配置初值。
- 停止确认：宿主提供者先强制结束执行域里的全部进程，再停止执行域，之后查询执行域的状态。状态为不活动或已不存在时才报 `confirmed`。宿主机重启过（启动身份变了）时直接视为不活动。原启动尚未隔离或尚未排空时不确认缺席。其余情况报 `unconfirmed`，保留处置责任。
- 冷恢复：受管资源的恢复引用是执行域的坐标。`recover` 按坐标查询执行域的状态，再按停止确认的条件停止与确认，不重启命令，不重建 shell。

### 撤除顺序

- 宿主文件插件卸载时，这一代宿主文件提供者开始退役。退役使它交出的租约以 `providerRetired` 失效，之后 `files` 不再有提供者，宿主层的落点解析返回 `noMatchingEnvironment`。`files` 设施声明与责任域不受影响。退役逐份排空这一代的获取，最多等 `drainBoundMs`；待处置时 `ctx.logger` 先收到诊断，再收到 `RetirementPending`。原记录与仍打开的描述符留在责任域，由新的一代或责任域的维护入口继续结清。
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
- 2026-10-25 在 Node v26.12.0、linux 上，本成员目录的 `vitest run` 的 10 个测试文件、146 个测试全部通过，退出码 0。本成员 `package.json` 声明的引擎是 `>=24`。

本成员不覆盖：授予根限制、平台前提的探测、`command` 与 `terminal` 提供者、Runtime Context 块的发布、调用方类核对、同一 isolate 标签下重复装载的失败、配置校验失败时 fiber 进入 `FAILED`，以及真实进程退出之后的冷恢复结清。持久化、真实端口适配与真实集成方的端到端组合也不在本成员。独立验收场景尚未形成。

### 明确缺项

- 长期运行的保留与淘汰策略待定（应可配置）：共用文件引擎的已签发句柄表与责任域的已结清记录只增不减，当前随进程结束释放。
- 宿主文件插件可以重载而责任域保留，这一点依据本域目标协议；它与产品正文第 2 版「宿主机提供者随执行环境一起在场，不单独装卸」的关系，以及与 #278 已接受的插件形状谁先谁后，待产品负责人与契约拥有者确认。装配规则现在没有强制执行点。
- 责任域在真实装配中的保管点与唯一分发没有采用：本成员只给出工厂 `createHostFilesDomain` 与插件工厂，进程宿主怎样保管并唯一分发它归应用装配（[#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)）。本成员不新增服务或包。
- 维护驱动的调度没有实现：`maintain()` 与结清是入口，谁在提供者卸载之后定时调用它们归责任域的拥有者与应用装配。
- 冷恢复结清需要域外可信的进程退出证据，以及原提供者代到进程实例的可核验关联；本成员没有，具名剩余责任交 [#323](https://github.com/nemori-ai/omne-harness-lite/issues/323)。在它兑现之前，新进程对旧原描述只答未知。
- 配额、查询、迟到与结清协议的行为模型没有进入本成员的 `verification/models/`，相应机制路径保持未验证。
- 两个插件仍是手写的插件对象，没有经过 kernel-basis 的 `definePlugin`，空配置 Schema 与宿主文件插件的配置 Schema 仍在本成员（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。加依赖需要更新工作区锁文件，待派发者裁定。
