# @omne-harness/execution-environment-host-local 行为规格

状态：Service 实现与宿主提供者成员，`draft`。本成员做两件事：把 [execution-environment](../execution-environment/SPEC.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/SPEC.md) 定义的服务 `executionEnvironment`，并在宿主机上提供 `files` 与 `command` 设施。领域行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)，登记表行为归 execution-environment，都不在本页。本页的[宿主文件使用](#宿主文件使用)一节已被接受，其余是草案。[宿主文件责任域](#宿主文件责任域)与提供者的获取路径依据[本域目标协议](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6371505744)的 host-files 迁移语义写入，由 [#678 修订决定](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6398383578)具名采用，未经独立技术接受；责任域在真实装配中的保管点、跨进程退出证据与冷恢复结清不在本页兑现（[明确缺项](#明确缺项)）。

## 范围与依据

本成员有两个入口：

- 根入口与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)），导出 `createHostFiles`、`hostObjectToken`、`createHostFilesDomain` 与 `createHostFilesProvider`，以及类型 `HostFilesDomain`、`HostFilesDomainOptions`、`HostFilesQuotaPolicy`、`HostFilesProviderOptions`、`HostFilesDiagnostic`、`HostFilesLimits`（列表与搜索的上界）、`HostCommandOptions`（`command` 的上界）与 `HostCommandPrerequisite`（`command` 的平台前提项名）。
- `./cordis` 导出 Service 子类 `ExecutionEnvironmentRegistry`、登记 `files` 设施声明的插件 `filesFacilityPlugin`、登记 `command` 设施声明的插件 `commandFacilityPlugin`，以及插件工厂 `createHostFilesPlugin(domain)`：它返回登记一代宿主文件提供者的插件。配置类型 `HostFilesConfig` 也从这里导出。

上层依据：系统页[执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工，领域页[文件使用的交接](../../../docs/domains/execution-environments/architecture.md#文件使用的交接)，契约的[设施协议](../execution-environment-contract/SPEC.md#设施协议)、[INV-EE04](../execution-environment-contract/SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[INV-EE09](../execution-environment-contract/SPEC.md#inv-ee09-资源和秘密以最小必要条件提供)、[INV-EE13](../execution-environment-contract/SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) 与 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)。

两个入口的模板标记写明还没有接受的部分：`terminal` 的提供者、Runtime Context 生产者插件、调用方类的核对。`files` 的十二项操作、宿主文件根、`command`（只在 Linux 上）与平台前提的探测已经实现，但本页除[宿主文件使用](#宿主文件使用)外都没有经过独立技术接受。`terminal` 未实现，见[宿主命令与终端](#宿主命令与终端未实现)。本成员不导入任何上层领域的契约。租户、作用域、原调用与恢复授权都随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 结果与不变量

### 宿主提供者的事实

`createHostFilesProvider(options)` 每次调用造一个提供者，也就是一代。`options.domain` 必填，是本包 `createHostFilesDomain` 创建的责任域；缺少或不是本包的责任域时抛出 `TypeError`。提供者声明下列事实：

| 事实                   | 值                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 名称                   | `host-files`                                                                                                                                        |
| 代                     | 每次创建时生成的随机 UUID。一个提供者对象只登记一次，所以每次登记都是新的代（一次登记化身）。创建时把代登记进责任域                                 |
| 版本                   | 本包 `package.json` 的 `version`，运行时从包根读取                                                                                                  |
| 配额域                 | 责任域的配额域，缺省 `host-files`                                                                                                                   |
| 绑定层                 | 只有 `host_machine`                                                                                                                                 |
| 连续性                 | `not_guaranteed`                                                                                                                                    |
| 设施键                 | `files` 与 `command`。`terminal` 不在其中                                                                                                           |
| 隔离断言               | 空。本提供者不确认任何隔离                                                                                                                          |
| 宿主文件根             | 提供者选项 `filesRoot`，绝对路径，可选。配置了它，这一代全部 `files` 请求受它限制，见[宿主文件根](#宿主文件根未接受)                                |
| 状态目录               | 提供者选项 `stateDirectory`，绝对路径，可选。批次清单放在其中；前提 P2 的探测在其中建、删临时目录；没有它时批次答 `unavailable`，探测用系统临时目录 |
| 列表与搜索的上界       | 提供者选项 `limits`，`HostFilesLimits` 的部分值：`listPageLimit`、`searchEntryBudget`、`searchByteBudget`、`searchFileBytes`。缺省取初值            |
| 宿主事实（`describe`） | 名称、代、版本、平台（`process.platform` 加 `os.release()`）、设施键、空隔离断言，以及合并后的前提（见下文）                                        |

- `quota(租户)` 读责任域的配额策略，答已声明（单位是一个未结清的获取）；策略抛出或给出的上界不是非负安全整数（全局上界可以为空）时答未知。它不保留名额。
- `acquire` 在提供者退役后返回 `providerUnavailable`。落点的绑定层不是 `host_machine` 时返回 `noMatchingEnvironment`。其余情况交给责任域接纳（见[宿主文件责任域](#宿主文件责任域)）：新接纳的获取交回一个租约原件，实例身份是 `host` 加提供者的代，`facility('files')` 返回这份获取的文件门面，`facility('command')` 返回这份获取的命令门面；证据记录提供者名称、代与版本，配置了宿主文件根时另有一个条目 `filesRoot`，值为字符串 `configured`（不写路径）。同一租户、同一获取键、相同指纹的重复由原记录认回：原租约仍打开时交回同一租约，否则答未知并带原获取键，不造第二个门面。指纹不同为 `acquisitionConflict`。超过按租户上界为 `quotaExceeded`，超过全局上界为 `globalCapacityExceeded`，两者都不留下记录。`acquire` 不分配外部资源，立即返回。
- 租约原件的释放：先撤掉这份租约的失效通知，再排空这份获取（封门面，最多等 `drainBoundMs`，重试失败的关闭）。什么都不剩时答已释放，名额只返还一次；否则答待处置，资源清单列出停止未确认的命令进程（没有命令时为空），名额仍占用。待处置之后可以重试释放。
- `inspectAcquisition(原描述)` 读责任域的原记录：打开的答已获取（带原租约与证据），释放中的答待定（阶段 `releasing`，资源列出停止未确认的命令进程），已结清的答已结清，指纹不同的答冲突。没有记录时，原描述的提供者代是本责任域签发过的代则答未分配，否则答未知：新进程的责任域没有证据说明旧容量已经结清。配额域与本责任域不同的原描述按没有记录处理。
- `listAcquisitions(作用域)` 列出请求方作用域是该作用域、尚未结清的全部获取的原描述，包括没有受管资源的获取。
- `settleAcquisition(原描述)` 与查询做同样的定位，然后排空这份获取：封门面、使原租约以来源 `provider`、原因 `released` 失效、等在途操作、重试失败的关闭。什么都不剩时答已结清，否则答待处置（资源列出停止未确认的命令进程）。结清不重做文件写入，也不回滚已写入的字节。重复结清答已结清，不再返还名额。
- 本提供者的文件操作不留下受管资源；命令的 scope 单元是受管资源。`listRecoveryResources` 与 `recover` 只处理这些单元，见[宿主命令与终端](#宿主命令与终端未实现)的资源级冷恢复。不是 Linux 的宿主答完整的空列表。Linux 上没有可达的用户管理器时答 `unavailable`，不答空列表。描述符、在途操作与失败关闭由获取路径（枚举与结清）覆盖，空的资源列表不证明没有这些责任。
- 本提供者不读账本：账本关闭后的拒绝由登记表的门在调用设施之前做（[INV-EE15](../execution-environment-contract/SPEC.md#inv-ee15-准备持有回收与确认保持一致)）。直接调用 `createHostFilesProvider` 得到的租约原件不经过门，不查账本。请求方作用域随 `ProviderAcquireInput.scope` 到达，进入原描述与获取枚举。
- `retire()` 先把提供者标为已退役，之后新的获取返回 `providerUnavailable`。然后它封住这一代全部尚未结清的获取的门面，使它们的租约原件以来源 `provider`、原因 `providerRetired` 失效，再逐份排空。每份都结清时返回已排空，并结束这一代对引擎诊断的订阅；否则返回待处置，资源列出停止未确认的命令进程，并给 `diagnose` 一条诊断。原记录与仍打开的描述符留在责任域，新的代经同一责任域查询与结清它们。待处置之后再调用 `retire()` 会再排空一次。
- `drainBoundMs` 的初值是 10000，用于释放、结清与退役。它必须是有限的非负数，否则 `createHostFilesProvider` 抛出 `RangeError`。
- 诊断 `HostFilesDiagnostic` 有四类，`diagnose` 抛出都不改变结果。结果为待处置时：仍有在途操作时 `kind` 为 `drainBoundExceeded`，只剩关闭失败的描述符时为 `closePending`；带提供者名与代、在途操作数（文件操作与命令启动）、打开的描述符数与上界，释放或结清时另带获取键。命令进程的停止没有确认时为 `stopUnconfirmed`，缺平台前提而拒绝命令启动时为 `commandUnavailable`，两者见[宿主命令与终端](#宿主命令与终端未实现)。批次发布后删不掉临时文件时为 `temporaryFileRemains`：带提供者名与代、批次 id、已发布的路径、临时文件名与可选的错误码。第四类来自文件引擎，不属于某一份获取，所以不带获取键。
- 文件引擎的配置：提供者向责任域要一个按文件配置共用的引擎，配置是 `filesRoot`、`stateDirectory` 与 `limits`。这些值不合法时 `createHostFilesProvider` 在登记这一代之前抛出：路径不是绝对路径为 `TypeError`，上界不是正安全整数为 `RangeError`。三项都不给时，行为与没有这些选项之前相同。同一责任域里配置相同的提供者共用一个引擎，配置不同的各用一个，见[宿主文件责任域](#宿主文件责任域)。

提供者事实里的前提是下列探测的合并。P2（`files` 的目录描述符前提，`probeHostFilesPrerequisite(stateDirectory)`）由 `describe()` 读取：满足或不满足的结果在这一代内保留，未知的结果下一次 `describe()` 再探。`command` 的 P1、P3～P6 由创建时开始的后台探测给出，见[宿主命令与终端](#宿主命令与终端未实现)。合并规则：任一项不满足为 `unsatisfied`，否则任一项未知为 `unknown`，全部满足为 `satisfied`。不满足的项名不进宿主事实。

契约的提供者事实只有三态的前提，没有放宿主文件根的位置，严格的事实 Schema 也不接受多余的字段。所以配置了宿主文件根这件事不写进 `describe()`，而写进获取的证据（见 `acquire`）。要在 `describe()` 里看见它，需要契约增加一个字段，这归契约的拥有者。提供者事实不携带日期（日期由后续宿主事实块生产者在块级提供，见[契约 INV-EE17](../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。

提供者选项与装配字段的对应（装配页由 Reduce 维护，本页只写提供者一侧）：

| 装配字段（`execution-host` 行）                                              | 提供者选项                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `filesRoot`、`stateDirectory`                                                | `filesRoot`、`stateDirectory`                                                                           |
| `listPageLimit`、`searchEntryBudget`、`searchByteBudget`、`searchFileBytes`  | `limits.listPageLimit`、`limits.searchEntryBudget`、`limits.searchByteBudget`、`limits.searchFileBytes` |
| `startBoundMs`、`graceMs`、`stopBoundMs`、`probeRetryMs`（与命令缓冲的两项） | `command` 里的同名字段                                                                                  |
| `drainBoundMs`                                                               | `drainBoundMs`                                                                                          |

宿主文件插件现在的配置 Schema 只接受表中的路径、命令和 `drainBoundMs` 字段，不接受四项列表与搜索上界；它们只能经直接创建提供者给出。

### 宿主文件责任域

`createHostFilesDomain(options)` 创建一个责任域。进程宿主的单一拥有者创建并保管它，把同一个责任域交给每一代提供者；它比提供者与登记表的重载活得更久。共享同一宿主容量的两个登记必须共享同一个责任域对象。依据：[契约的提供者的进程内证据边界](../execution-environment-contract/SPEC.md#提供者的进程内证据边界)。

- 责任域带配额域（缺省 `host-files`，空串抛出 `RangeError`）、进程实例身份（创建时的随机 UUID）与 `durability: 'process'`。它的记录只在本进程内。
- 配额策略 `quota(租户)` 在每次接纳时读取，给出按租户上界与全局上界；缺省是每租户 64 个、没有全局上界。策略可替换，数值只是配置初值。
- 接纳在一个没有 `await` 的同步段里完成：先核按租户上界，再核全局上界，再写入记录并占一个名额。所以同一配额域里抢最后一个名额的两次获取只有一次得到。占用按记录计数：尚未结清的记录各占一个名额，不论属于哪一代。降低上界不抹去已有占用，只停止新的接纳，直到占用低于新上界。
- 每份获取有一个门面：自己的准入开关与在途操作集合。每个已准入的操作在第一次 `await` 之前登记到这份获取。门面封住之后，新操作答 `closed`，不触碰文件系统。
- 责任域按文件配置（宿主文件根、状态目录、列表与搜索的上界）持有共用的文件引擎：提供者加入时，第一个带某个配置的提供者造出引擎，之后配置相同的提供者共用它，不论属于哪一代。引擎给每个签发的句柄与每个关闭失败的描述符记上这份获取的所有者标签，请求不能改写它。句柄代际在引擎内唯一，所以同一引擎上两份获取对同一文件对象的句柄不碰撞。一份获取的门面关闭不了同一引擎上另一份获取持有的句柄，答未知。这条边界不限制两份合法获取分别访问同一个已授权的文件对象。已知限制：配置不同的两个引擎各自从 1 起计代际。一份获取的句柄交给另一个引擎上的获取的门面时，若那边对同一对象恰有同号的句柄，关闭会落在那边自己的句柄上，而不是答未知。每份获取记着自己的引擎，所以提供者换代后，新的一代仍能排空旧获取。引擎的诊断交给每个仍订阅的提供者：提供者加入时订阅，退役得到已排空时结束订阅。已知限制：同一引擎被几个在场的提供者共用时，每个提供者的 `diagnose` 都收到它的诊断，诊断不区分是哪个提供者的获取造成的。
- 排空一份获取：封门面，同一步封住引擎里这份获取的所有者，标为释放中，最多等 `drainBoundMs` 让在途操作结束，然后重试这份获取的全部失败关闭。在途操作已结束且没有打开的描述符时，记录结清，名额恰好返还一次；否则保持释放中，名额仍占用。
- 封闭有两处，拥有者不同，在同一步发生。门面的封闭是对外的答复：封住之后新操作答 `closed`，不触碰文件系统，这由责任域做。引擎的封闭（`seal(所有者)`）只是一个信号：它使这个所有者正在运行的批次停在下一次发布之前，批次按已发布的项答 `unknown`，原因 `closed`。责任域的门面在封闭时调用引擎的封闭，所以排空和退役两条路径都不会只封一处。
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
- 契约的 `files` 设施另有列表、搜索、建目录、删除、移动、复制、提交批次与恢复批次八项操作。本设施在 Linux 宿主上实现它们，见[八项操作](#八项操作未接受)。其他宿主上，这八项返回 `rejected`，原因 `unavailable`，不触碰文件系统。
- 打开失败按错误码映射：`ENOENT`、`ENOTDIR` 为未解析；`ELOOP`、`EMLINK`、`EISDIR` 为 `unsupported`；`EINVAL` 为 `invalidInput`；`EACCES`、`EPERM` 为 `notAuthorized`；其余错误为未知。
- 读取接受起点与上限两个字节数。两者必须是非负安全整数，否则返回 `invalidInput`。读取目录返回 `unsupported`。完成时带字节、下一次读取的起点与是否已到文件末尾。
- 查看完成时带对象类型（文件或目录）、字节数与修改时间。
- 版本是修改时间与字节数的组合。替换写入带预期版本而当前版本不同时返回 `conflict`，文件不变。
- 写入有两种模式。替换模式按上一节写入。路径上没有对象时，替换模式返回未解析。
- 新建模式的 `named` 是父目录。本设施在独占新建前后各核对一次父目录的设备号与 inode。新建模式带预期版本，或路径以斜杠结尾，返回 `invalidInput`。父目录不存在返回 `notFound`。目标已存在返回 `conflict`。新建之后父目录身份变了，返回未知，已建的文件留在原处。
- 本设施在调用时取下请求身份与待写字节的副本。调用方在调用之后改动请求对象，不影响这次操作。

#### 八项操作（未接受）

状态：未接受，依据 [#421 的 D1 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。契约不带条目名，所以 `list` 的条目读不出名字（[契约的明确缺项](../execution-environment-contract/SPEC.md#明确缺项)）。

共同规则：

1. 平台前提 P2。八项靠 `/proc/self/fd/<描述符>/<名>`：内核按已打开的目录对象解析这条路径，不按目录现在叫什么名字解析。`probeHostFilesPrerequisite(directory?)` 探测它：不是 Linux 为不满足；否则在 `directory`（缺省是系统临时目录，引擎用状态目录）里建临时目录，打开它，经描述符路径独占新建一个文件再删除，成功为满足，没有这种路径为不满足，探测本身出错为未知。引擎保留满足与不满足的结果，未知的结果下一次请求再探。前提不是满足时，八项返回 `rejected`，原因 `unavailable`，不触碰文件系统。
2. 前置检查与已接受的四项相同，先于平台检查，不触碰文件系统：绑定层不是 `host_machine` 为 `unsupported`；路径不是绝对路径或含空字节为 `invalidInput`；没有点名为 `notAuthorized`。`move` 与 `copy` 的目标路径和点名、`commitBatch` 每一项的路径和点名用同一组检查。
3. 落点是目录描述符。每项操作先打开所需的目录，不跟随最后一段链接，核对它的设备号与 inode，之后的建、删、改名都经 `/proc/self/fd/<描述符>/<名>`，名里没有斜杠。目录在操作中被改名或被换成链接，操作仍落在原目录里。
4. 点名不一致为 `conflict`，与读取、写入相同。
5. 路径上没有对象时，只有 `list` 返回未解析；其余各项返回 `rejected`，原因 `notFound`。契约只许读取、查看、列表与替换写入返回未解析。
6. 已经产生部分效果又没有完成整个请求时返回未知，不写成拒绝。
7. 门面封住之后，新操作返回 `closed`，不触碰文件系统；门面由责任域做，引擎的 `seal(所有者)` 提供同样的封闭，并使这个所有者正在运行的批次停在下一次发布之前。操作返回前关闭自己打开的描述符，关闭失败的描述符进入引擎的待关闭集合，归这份获取。
8. 编码之外的限制：目录项名不是合法 UTF-8 时，`list` 与 `search` 略过这一项，不计入分页；`remove` 的递归删除遇到这样的名字时返回 `unsupported`，什么都不删。
9. 列表与搜索的上界是配置：`listPageLimit`（初值 1000）、`searchEntryBudget`（初值 10000 个目录项）、`searchByteBudget`（初值 64 MiB）、`searchFileBytes`（初值 8 MiB）。`createHostFilesEngine` 的第二个参数给出它们，每个必须是正安全整数，否则抛出 `RangeError`。

各项（每项的最后一句写用户能看到的代价）：

- **list**。`named` 是这个目录。读出目录项，按名的字节序排序，从 `offset` 起取至多 `limit` 项（缺省取 `listPageLimit`）。每一项用 `lstat` 取类型、字节数、修改时间与版本，符号链接报 `symlink`，不跟随。有下一页时带 `nextOffset`。结果带目录的身份与版本：调用方比较各页的目录版本判断目录是否变过。路径上没有对象为未解析，不是目录（含符号链接）为 `unsupported`，点名不一致为 `conflict`，`offset` 或 `limit` 不是非负安全整数、`limit` 为 0 或超过 `listPageLimit` 为 `invalidInput`，`offset` 超过项数为完成且没有条目，读目录中途出错为未知。代价：翻页之间目录可以变，提供者不保证跨页的一致快照。
- **search**。`named` 是起点目录。`match: 'name'` 在目录项名的字节里找 `pattern`；`match: 'content'` 在普通文件的字节里找，每个文件只报第一个命中，带 `offsetBytes`。`recursive` 为真时按名的字节序深度优先，经目录描述符逐层打开，不跟随符号链接，不进入设备号与起点不同的目录。每次调用从头遍历，取第 `offset` 起的至多 `limit` 个命中。超过 `searchEntryBudget` 或 `searchByteBudget` 时停止，大于 `searchFileBytes` 的文件不读，两种情况都使 `truncated` 为真，结果为完成。`pattern` 为空、分页参数不合要求为 `invalidInput`，路径上没有对象为 `notFound`，起点不是目录为 `unsupported`，走到一半出错为未知。代价：翻页重复遍历，预算对整次调用计；`truncated` 为真时结果不完整。
- **mkdir**。`parents` 为假时 `named` 是父目录：打开父目录并核对点名，在其中建目录，再不跟随链接地打开新目录，返回它的身份。`parents` 为真时 `named` 是最近的已有祖先：核对点名后，经上一段的目录描述符逐段建缺的段。目标已存在为 `conflict`，父目录不存在为 `notFound`，点名不一致为 `conflict`；`parents` 为真且已建了至少一段之后失败为未知，已建的目录留在原处；建好后核对新目录失败为未知。代价：失败时可能留下已建的上层目录。
- **remove**。`named` 是要删除的对象。打开父目录，`lstat` 目录里的名，核对它就是点名对象，再核预期版本。文件与符号链接用 `unlink`，只删链接本身。目录在 `recursive` 为假时用 `rmdir`；为真时先走一遍子树确认可删（不跟随链接，设备号必须相同），再从叶子起逐项删除。路径上没有对象为 `notFound`，版本不同或点名不一致为 `conflict`，目录非空而 `recursive` 为假为 `conflict`，子树里有别的设备为 `notAuthorized` 且什么都不删，递归删除删了一部分之后失败为未知。代价：核对与删除之间名可以被换成另一个对象，被删的仍是同一目录里的这个名，效果不出这个目录，这个窗口关不上（Node 没有带身份核对的 `unlinkat`）；递归删除失败时子树只删了一部分。
- **move**。`path` 是源，`named` 是源对象。目标不存在时 `target.named` 是目标的父目录，`replace` 为真且目标存在时是目标对象。`replace` 为真用 `rename`。`replace` 为假时，文件与符号链接用 `link` 加 `unlink`：`link` 在目标已存在时失败，所以不覆盖；目录在 `lstat` 目标不存在之后 `rename`。返回源对象与目标的身份。源不存在为 `notFound`，源版本或任一点名不一致为 `conflict`，`replace` 为假而目标存在为 `conflict`，跨设备为 `unsupported`（不改用复制），`link` 成功而 `unlink` 失败时两个名都在，为未知。代价：目录在 `replace` 为假时有检查与改名之间的窗口，此时并发建出的空目录会被换掉；跨设备移动要调用方自己复制再删除。
- **copy**。只复制普通文件，源是目录、符号链接或别的类型为 `unsupported`。打开源（不跟随链接），核对点名与版本，一块一块读。`replace` 为假时在目标父目录里独占新建目标再写入；`replace` 为真时先在目标父目录写临时文件 `.omne-copy-<uuid>`，写完 `fsync` 后 `rename` 到目标名，所以替换后目标是新的 inode，另一个已打开旧文件的读者仍读到旧字节。返回源对象与目标的身份。源不存在为 `notFound`，版本或点名不一致、`replace` 为假而目标存在为 `conflict`，目标是目录为 `unsupported`。写临时文件失败：删除临时文件成功时目标名没有变，按错误映射返回拒绝；删除失败为未知。`replace` 为假时目标已建而写入未完成为未知，文件留在原处。代价：`replace` 为假的写入中途失败会留下不完整的目标文件；临时文件删除失败时留下 `.omne-copy-` 前缀的文件，引擎的 `diagnose` 目前只覆盖批次的残留，不报告复制临时文件的名字。
- **commitBatch**。每一项单独发布，不做多路径原子提交。`entries` 的 `named`：`expectedVersion` 为 `null` 的项是目标的父目录，否则是目标文件。步骤：先核全部项（路径、点名、宿主文件根、预期版本）；任一项不合格返回 `rejected`，什么都不写。再在状态目录写清单 `batches/<租户摘要>/<批次 id>.json`（状态 `staging`，记各项路径、点名、预期版本、待写字节的 SHA-256 与长度，不记字节本身，`fsync`）。再在各目标的父目录里独占新建临时文件 `.omne-batch-<批次 id>-<序号>`，写入并 `fsync`，清单改为 `publishing`。再逐项发布：`expectedVersion` 为 `null` 用 `link` 加 `unlink`，目标已存在时失败，不覆盖；否则紧挨着 `rename` 之前再核一次点名与版本，再 `rename` 覆盖。每发布一项，把路径追加进清单的回执并 `fsync`。全部发布后清单为 `committed`，返回完成，`kind: 'committed'`。某一项版本冲突时停止发布，删除尚未发布的临时文件，清单为 `conflict`，返回完成，`kind: 'unknown'`，`reason: 'conflict'`，`published` 列出已有回执的路径。门面封住时同样停止，`reason: 'closed'`。其余发布错误返回 `reason: 'effectUnknown'`，临时文件留在原处。`link` 成功之后 `unlink` 临时文件失败（`ENOENT` 除外）时，发布已经发生，结果仍是 `committed`，该项照常记回执；残留的临时文件名经引擎选项 `diagnose` 的诊断 `temporaryFileRemains` 报告，带批次 id、已发布的路径、临时文件名与错误码。`diagnose` 抛出不改变结果。批次身份是 `{ id, generation }`：`id` 是 UUID，`generation` 是引擎的进程实例身份。没有配置 `stateDirectory` 时返回 `rejected`，原因 `unavailable`。代价：不是原子的，中途失败时前面的项已经发布；清单只增不减，与句柄表相同；清单目录需要 `stateDirectory`；发布后删不掉临时文件时，目标旁留下 `.omne-batch-` 前缀的文件（与目标是同一个文件的第二个名），只有配置了 `diagnose` 才报告它的名字，没有配置时它静默留下。
- **recoverBatch**。只读：按请求的租户与批次 id 读清单，不发布、不回滚、不覆盖。对每一项：有回执的进 `published`；没有回执、但目标当前字节的摘要等于待写摘要的进 `matchingPrepared`（相等不是回执）；目标既不是预期版本也不是待写字节的进 `conflicting`。状态：全部有回执为 `complete`；清单为 `conflict` 为 `conflict`；批次的 `generation` 不是本引擎为 `interrupted`；是本引擎且批次还在运行为 `pending`；是本引擎、已经停止而没有全部发布为 `partial`。清单不存在、租户不同或 `generation` 不同返回 `rejected`，原因 `notFound`，不区分；批次 id 不是 UUID 为 `invalidInput`；清单读失败或目标读不了为未知。代价：回答只说清单与目标现在是什么，不说下一步；读取的是读取那一刻的目标。

### 宿主文件根（未接受）

状态：未接受，依据同一份 [D1 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。

宿主文件根限制宿主提供者的全部 `files` 请求。它不是契约的授予根：契约把授予根定义为声称 `filesystem-root` 隔离断言的落点的属性，而宿主提供者不声称它，因为同一个提供者还提供 `command`，命令不受文件限制。要求 `filesystem-root` 的工具在落点解析时仍得到 `isolationUnconfirmed`。

- 来源：`createHostFilesEngine(options)` 的 `root`，必须是绝对路径，否则抛出 `TypeError`。`stateDirectory` 同样必须是绝对路径。引擎用 `hasRoot` 报告自己有没有根。提供者选项 `filesRoot` 与 `stateDirectory` 经责任域交给引擎：责任域按配置造引擎，同一配置的提供者共用它（见[宿主文件责任域](#宿主文件责任域)）。一代提供者的全部获取用同一个根，根不按租户区分。配置了根时，获取的证据多一个条目 `filesRoot`，值为 `configured`，这是观察者看到根的位置；`describe()` 看不到它，原因见[宿主提供者的事实](#宿主提供者的事实)。不给 `root` 时，已接受的四项行为不变。
- 绑定：第一次使用时对 `root` 取 `realpath`，打开它，记下设备号与 inode。打不开时全部 `files` 请求（含已接受的四项）返回 `rejected`，原因 `unavailable`，不改成不受限；下一次请求再试。
- 每次请求重新打开根的真实路径，核对设备号与 inode 与记下的相同，不同返回 `notAuthorized`。
- 路径检查先于任何目录的打开，也先于平台前提的探测：路径按段比较必须以根的真实路径为前缀（段边界，不是字符串前缀）；任何一段是 `..` 返回 `notAuthorized`，哪怕它解析后仍在根内。这两项只用记下的根路径，不碰状态目录（探测要在其中建、删临时目录），所以根外或带 `..` 的请求被拒绝时，状态目录的名与修改时间都不变。宿主不是 Linux 时仍先返回 `unavailable`，这一步不触碰文件系统。
- 逐段走：从根的目录描述符起，每一个中间段以 `O_DIRECTORY` 加 `O_NOFOLLOW` 经上一段的描述符打开。中间段是符号链接返回 `notAuthorized`；中间目录的设备号与根不同返回 `notAuthorized`。最后一段以 `O_NOFOLLOW` 打开，是符号链接时按现有映射返回 `unsupported`；删除与改名的最后一段是链接时只作用于链接本身。读取、查看与替换写入经 `openNamed` 打开最后一段，打开之后对描述符做 `fstat`，设备号与持有它的目录不同（根内的挂载点）返回 `notAuthorized`；这次打开不创建、不截断，所以拒绝前文件系统没有变化。
- 内容操作（读取、替换写入、复制的源、搜索读内容的文件）打开后对描述符做 `fstat`，普通文件的链接数大于 1 返回 `notAuthorized`，在任何写字节之前。核对发生在打开之后，所以没有检查与打开之间的窗口。删除、改名与批次发布只改根内的名，不核链接数：被删或被换掉名字的文件若在根外另有名字，根外对象的链接数减 1，字节不变。
- 有根而平台前提 P2 不满足时，全部 `files` 请求返回 `rejected`，原因 `unavailable`，不放宽成无根。
- 有根时，已接受四项里「祖先符号链接本身不构成拒绝」不再适用：中间段是链接一律拒绝。这是对已接受行为的收紧，只在配置了根时生效，须经原接受入口重新接受（[架构页的维护规则](docs/architecture.md#验证与维护)第 1 条）。归层不确定，按 D1 决定记录按第二层处理。
- 创建（新建写入、建目录、复制、批次临时文件）只在已核对的目录描述符下发生，所以创建不会落到根外。

四类逃逸与结果：

| 类                 | 判定                                                                                                                            | 结果                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 解析在根外         | 路径按段不以根的真实路径为前缀；或逐段走时某个中间目录的设备号与根不同；或经 `openNamed` 打开的最后一段设备号与持有它的目录不同 | `notAuthorized`                                             |
| `..`               | 任何一段是 `..`                                                                                                                 | `notAuthorized`                                             |
| 指向根外的符号链接 | 中间段是符号链接，不论指向哪里                                                                                                  | `notAuthorized`；最后一段是链接时按现有映射为 `unsupported` |
| 硬链接             | 内容操作打开后的描述符上，普通文件的链接数大于 1                                                                                | `notAuthorized`                                             |

拒绝后根内与根外的目录无变化：名、类型、字节、链接数与修改时间不变。读取与打开目录可能更新访问时间（取决于挂载选项），不在其内。已知限制：根内的挂载点靠设备号核对挡住，中间段与经 `openNamed` 的最后一段都核；包测试在有挂载权限时把 tmpfs 挂在根内的目录上构造最后一段（`sudo -n mount`），没有权限的环境里该用例报告跳过，不算通过。同一文件系统上的绑定挂载与根内目录设备号相同，核对挡不住。删除与改名的核对和实际调用之间名可以被换成另一个对象，效果仍不出该目录。

### Service 实现

- `ExecutionEnvironmentRegistry<P>` `extends ExecutionEnvironmentService<P>`，不另写键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。构造时调用 `createEnvironmentRegistry`，把环境面与恢复面七个方法原样转给登记表。
- 三个端口都不经构造参数进入。登记表的恢复授权、环境授权与可信绑定每次被调用时，Service 用自己装载时的上下文 `ctx.get` 现取 `executionRecoveryAuthority`、`executionEnvironmentAuthority` 与 `executionScopeBinding` 服务并转交（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)、[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。取不到时答不可用：没有装载恢复授权服务时，`recoverOwned` 与 `releaseScope` 以 `unavailable` 拒绝；没有装载环境授权或可信绑定服务时，环境面以 `unavailable` 拒绝，查询答查询不可用，不放行。服务方法里的 `this.ctx` 是调用方的上下文，不从那里取端口。
- `registerFacility` 与 `registerProvider` 在方法里用 `this.ctx.effect` 调用登记表的同名方法。登记落在调用方插件的 fiber 上，调用方卸载即撤除（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。`registerFacility` 返回的撤除函数调用同一个效应撤除。`registerProvider` 返回的撤除函数直接调用登记表的撤除函数：它可以重试，并发调用共用一次退役；效应只在调用方 fiber 卸载时调用一次登记表的撤除函数。
- Service 子类与 `filesFacilityPlugin` 的配置只接受缺省、`null` 或空对象，其余值以「configuration accepts no fields」校验失败（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。
- 宿主文件插件的配置 `HostFilesConfig` 接受缺省、`null`、空对象，或带下列字段的对象：`drainBoundMs`（有限的非负数）、`filesRoot` 与 `stateDirectory`（绝对路径），以及命令的六项上界（见[宿主命令与终端](#宿主命令与终端未实现)）。其他字段或其他值校验失败，插件不装载。缺省时取提供者的初值。列表与搜索的上界不在配置里，见[宿主提供者的事实](#宿主提供者的事实)。
- `filesFacilityPlugin`、`commandFacilityPlugin` 与 `createHostFilesPlugin(domain)` 返回的插件，`inject` 都是服务键常量并声明 `caller: provider`。`filesFacilityPlugin` 与 `commandFacilityPlugin` 装载时经 `ctx.executionEnvironment` 登记 `files` 或 `command` 设施声明，不登记提供者。宿主文件插件装载时用工厂收到的责任域与配置登记一代新的宿主文件提供者，不登记声明。诊断经 `ctx.logger('executionEnvironment.hostFiles')` 以错误级写出。声明的生灭与宿主提供者的生灭分开：只装宿主文件插件时，需要 `files` 或 `command` 的落点解析返回 `missingFacility`。责任域是运行时对象，不进 JSON 配置。
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

| 项  | 探测                                                                                                                             | 前提项名           |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P1  | `process.platform` 是 `linux`                                                                                                    | `linux`            |
| P3  | 在 `PATH` 里解析 `systemd-run` 与 `systemctl` 的绝对路径，并从 `systemctl --help` 读出它支持 `--kill-whom` 还是旧名 `--kill-who` | `systemd-tools`    |
| P4  | `systemctl --user is-system-running` 输出 `running` 或 `degraded`                                                                | `user-manager`     |
| P5  | `/sys/fs/cgroup/cgroup.controllers` 存在                                                                                         | `cgroup-v2`        |
| P6  | 一个探测单元 `omne-host-probe-<uuid>.scope` 运行一个空的 Node 程序并以 0 退出，之后按强制停止序列停止，必须答 `confirmed`        | `scope-round-trip` |

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

| 配置               | 初值   | 作用                                             |
| ------------------ | ------ | ------------------------------------------------ |
| `maxBufferedBytes` | 1 MiB  | 一个进程的输出缓冲上限，正整数                   |
| `maxChunkBytes`    | 64 KiB | 门发出的单块上限，正整数，不大于缓冲上限         |
| `startBoundMs`     | 10000  | 启动等就绪与命令起来的上界                       |
| `graceMs`          | 5000   | 平和停止等命令退出的时间                         |
| `stopBoundMs`      | 10000  | 一次强制停止序列的上界，也是探测中各条命令的上界 |
| `probeRetryMs`     | 60000  | 不满足的探测结果保留多久                         |

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

| 事物                         | 拥有者                                            | 失败时                                                                                                               | 结束                                                         |
| ---------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 服务实例与登记表实例         | `ExecutionEnvironmentRegistry` 插件的 fiber       | 关闭待处置时撤除函数抛出 `RetirementPending`，Cordis 记入 `ctx.logger`，卸载照常完成                                 | 插件卸载                                                     |
| `files` 设施声明的登记       | `filesFacilityPlugin` 的 fiber                    | 重复登记抛出，插件 fiber 进入 `FAILED`                                                                               | 插件卸载，或服务撤除                                         |
| 宿主文件提供者的登记（一代） | 宿主文件插件的 fiber                              | 重复登记抛出，插件 fiber 进入 `FAILED`；这一代的获取没有全部结清时退役待处置，撤除函数抛出 `RetirementPending`       | 插件卸载，或服务撤除                                         |
| 宿主文件责任域               | 进程宿主的单一拥有者                              | 不随插件或服务卸载；记录只在本进程内，进程结束后没有证据说明旧容量已经结清                                           | 拥有者丢弃它，或进程结束                                     |
| 获取记录、名额与门面         | 宿主文件责任域                                    | 排空待处置时名额仍占用，记录仍可查询与结清；`maintain()` 与结清继续驱动                                              | 排空确认什么都不剩，名额恰好返还一次                         |
| 文件引擎（按文件配置一个）   | 宿主文件责任域                                    | 配置不合法时 `createHostFilesProvider` 在登记之前抛出；引擎封闭只让这个所有者的批次停在下一次发布之前                | 责任域被丢弃，或进程结束                                     |
| 在途文件操作                 | 所属获取的门面                                    | 超过上界仍未结束时，诊断写明它们的数目；它们仍在运行，结果仍交回原请求                                               | 操作返回                                                     |
| 关闭失败的描述符             | 所属获取（引擎里的所有者标签）                    | 留在共用文件引擎里，这份获取的操作、排空、结清与 `maintain()` 重试关闭；别的获取关不了它                             | 关闭成功                                                     |
| 已发出的句柄代际             | 共用文件引擎，带所属获取                          | 关闭没有成功回执时为未知                                                                                             | 关闭成功回执                                                 |
| 写入宿主文件的字节           | 宿主文件系统                                      | 截断后没写完时为未知                                                                                                 | 不随撤除撤回                                                 |
| `command` 设施声明的登记     | `commandFacilityPlugin` 的 fiber                  | 重复登记抛出，插件 fiber 进入 `FAILED`                                                                               | 插件卸载，或服务撤除                                         |
| 平台前提的探测结果           | 宿主提供者的一代                                  | 探测出错为未知；不满足时在 `probeRetryMs` 之后的启动再探测                                                           | 这一代被丢弃                                                 |
| 命令进程与它的 scope 单元    | 所属获取的命令门面；单元由 systemd 用户管理器持有 | 停止未确认时作为受管资源留在这份获取，排空、结清、退役与 `maintain()` 再试；进程结束后由资源恢复按单元坐标列举与停止 | `systemctl --user show` 读到不活动或不存在，且结果已记入账本 |
| 命令的输出缓冲               | 这个进程的句柄                                    | 放不下的块整块丢弃并计数；读者放弃后全部计入丢弃                                                                     | 读者读完或放弃，且进程已有结局                               |
| 命令已经产生的外部效果       | 宿主机                                            | 停止不撤回它们；强制停止的结局是 `effectUnknown`                                                                     | 不随停止或撤除撤回                                           |

进程失败：文件一侧没有可恢复的东西，责任域的记录随进程结束。命令一侧的受管资源是 scope 单元，进程结束后它们仍在 systemd 用户管理器里，由资源级恢复按单元坐标列举与停止（见[宿主命令与终端](#宿主命令与终端未实现)的资源级冷恢复），恢复不重启命令，也不结清获取。新进程的责任域对旧进程的原描述答未知，不答未分配；需要域外可信进程退出证据的冷恢复结清是 M2 之后的剩余责任。登记表的重建沿 [execution-environment SPEC](../execution-environment/SPEC.md#所有权失败与生命周期)。撤除函数抛出的错误只进 `ctx.logger`，`fiber.dispose()` 的调用方观察不到，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

## 组合与验证

| 承诺                                       | 位置                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 服务键、抽象类、登记即效应                 | [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) |
| 登记表的匹配、获取、门、退役、恢复与关闭   | [execution-environment SPEC](../execution-environment/SPEC.md)                                   |
| 设施协议、结果四态、文件使用的最小调用事实 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md#设施协议)        |

持续验证在 `tests/`，文件字节、符号链接、对象替换与描述符都用真实文件系统：

| 测试文件                                                               | 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [host-file-results.spec.ts](tests/host-file-results.spec.ts)           | 未点名拒绝、空字节拒绝、未解析、末段符号链接拒绝、中间目录换成链接、经祖先链接读取、查看与写入不带字节、关闭只回句柄、撤权后保留旧字节、对象替换后不复用旧完成、关闭失败的三种路径、代次递增、尾部斜杠、目录读取、请求与字节的快照、错误路径保留无法关闭的描述符                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [host-files.spec.ts](tests/host-files.spec.ts)                         | 读工作区目录之外的点名文件、字节范围、查看、新建与拒绝覆盖、父目录不符拒绝、预期版本不符拒绝；相对路径在读取、查看、两种写入与关闭上返回 `invalidInput` 且不触碰文件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [host-files-unsupported.spec.ts](tests/host-files-unsupported.spec.ts) | 没有 `/proc/self/fd` 的宿主上，八项操作返回 `unavailable` 且不触碰文件系统；配置了根时全部操作返回 `unavailable`；没有根时已接受的四项照常。文件名沿用旧名；在 Linux 上把 `process.platform` 换成 `win32`，在 Windows 上是真实平台                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [host-file-edges.spec.ts](tests/host-file-edges.spec.ts)               | 查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问为 `notAuthorized`；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态的版本在写入、读取、查看与新建之间一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [host-file-tree.spec.ts](tests/host-file-tree.spec.ts)                 | 没有根时的列表、搜索、建目录、删除、移动、复制：成功、各项拒绝、未知；分页与排序、符号链接不跟随、搜索的三个预算、递归删除不进入链接、不覆盖、替换时旧读者仍读到旧字节、跨设备为 `unsupported`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [host-file-root.spec.ts](tests/host-file-root.spec.ts)                 | 宿主文件根，只在 Linux：根外路径与同名前缀的邻居、`..`、指向根外的符号链接（中间段与最后一段）、硬链接各一条用例，每条前后比较根与根外的快照，E1 与 E2 先于任何系统调用判定；目录被换成链接时新建、移动、建目录仍落在原目录；走到中间段时被换成链接；根被换成另一个目录；根打不开；有根时的四项照常；最后一段是挂载点（有挂载权限时）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [host-file-batch.spec.ts](tests/host-file-batch.spec.ts)               | 提交批次与恢复批次：成功与清单；提交前的各项拒绝不写任何东西；第 k 项冲突；发布失败；字节相同但没有回执；运行中为 `pending`；门面封住为 `closed`；没有状态目录；他租户读不到；发布后删不掉临时文件时仍答 `committed` 并发出 `temporaryFileRemains`；进程在发布中途被杀之后新进程读到 `interrupted`（慢层）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [host-command.spec.ts](tests/host-command.spec.ts)                     | 真实 systemd 用户 scope 里的命令，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：输出次序与偏移、退出码与单元清理、显式环境与标准输入、映像起不来、超过缓冲上限的整块丢弃、门一侧暂停与恢复、平和停止与强制停止、主进程退出后清掉后台进程、单调用中断、释放与配置重载时的强制停止、账本不许可时不起命令、启动超时、另一个责任域列举并恢复单元                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [host-command-frames.spec.ts](tests/host-command-frames.spec.ts)       | 不起 scope，两个平台：帧按任意字节边界读取、各类非法帧使读取失效、整块丢弃与计数、单一读者、停止确认只认 `inactive` 或 `not-found`、只读回本提供者写下的单元引用、起不来的监督工具答失败                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [host-probe.spec.ts](tests/host-probe.spec.ts)                         | 平台前提 P1、P3～P6：不是 Linux 时启动答 `unavailable` 而 `files` 照常（只在非 Linux 运行）；`PATH` 里没有 `systemd-run` 时答 `unavailable` 且诊断写明缺项；用户管理器可达时 `satisfied`；去掉用户管理器的变量时答 `unavailable`，恢复后过了重探间隔可以启动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [host-provider.spec.ts](tests/host-provider.spec.ts)                   | 宿主提供者声明的事实（版本等于 `package.json`、平台带 `os.release()`、设施键 `files` 与 `command`、前提三态之一、配额域、资源枚举按平台与用户管理器可达性分支、对意外资源答不支持）；租约的身份、证据（带版本）与两个设施键；沙箱落点与退役后的拒绝；经登记表的门，账本关闭后写入返回 `closed` 且文件不变，另一份获取的账本不受影响；没有在途操作时退役立即已排空，之后新操作 `closed`；界值非法抛 `RangeError`；退役只通知尚未释放的租约；命令启动的 `terminal` 与 `geometry` 答 `unsupported`、非法输入答 `invalidInput`，都不调用账本；命令选项的界值。收敛接线：配置了 `filesRoot` 的提供者对根外路径答 `notAuthorized`、根内照常，没有根时根外路径照常；配置了根时获取的证据多一个 `filesRoot` 条目；`limits` 的列表上界生效；非绝对路径与非正上界在创建时抛出；批次发布后删不掉临时文件时提供者的 `diagnose` 收到 `temporaryFileRemains`，抛出的 `diagnose` 不改结果；同一配置的两个在场提供者都收到它，退役已排空的不再收到；`describe()` 的前提合并 P2（状态目录不可用时为 `unknown`）                                                        |
| [host-provider-drain.spec.ts](tests/host-provider-drain.spec.ts)       | 用 `vi.mock` 让带标记路径的 `open` 停住，其余是真实文件系统：在途写入未结束时退役不返回、期间新操作 `closed`，写入结束后已排空；超过上界时待处置、受管资源为空、诊断 `inFlight` 为 1，放行后再退役已排空；经 Cordis 以 `{ drainBoundMs: 20 }` 装载后卸载，`ctx.logger` 先后收到诊断与 `RetirementPending`，卸载完成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)                     | 装载两个访问端口服务、服务、`filesFacilityPlugin` 与宿主文件插件后经租约读文件；访问端口服务缺席或只装一个时落点解析为 `unavailable`，可信绑定把作用域绑到别的租户时为 `notAuthorized`；沙箱层没有提供者；宿主文件插件卸载后租约以 `providerRetired` 失效、宿主层没有匹配；只装提供者时落点为 `missingFacility`，卸载声明插件后已取到的设施返回 `unsupported`；服务卸载后键上没有服务、租约以 `registryClosed` 失效、新获取返回 `ownerStopped`；恢复授权服务缺席时恢复两操作返回 `unavailable`，装载后被现取、宿主提供者的资源枚举为完整空列表（不记为不支持），卸载后又返回 `unavailable`；授权后释放作用域使宿主租约以 `scopeReleased` 失效，该作用域的再获取与落点解析为 `referenceExpired`；`describe` 列出该作用域的宿主落点；经服务登记的提供者退役待处置时，返回的撤除函数每次调用都再退役并抛出 `RetirementPending`；退役与关闭待处置时 fiber 卸载照常完成，`ctx.logger` 收到 `RetirementPending`；宿主文件插件只接受合法的 `drainBoundMs`，Service 与声明插件只接受空配置                                                                    |
| [host-domain.spec.ts](tests/host-domain.spec.ts)                       | 用 `vi.mock` 让带标记路径的 `open` 停住，并让活描述符上的 `close` 按计数失败，其余是真实文件系统与真实描述符：一份获取释放时在途写入未结束为待处置、资源为空、名额仍占用，另一份获取照常写入，被释放的门面拒新操作，放行后结果回原请求，再释放才返还名额且只返还一次；读取后关闭失败的活描述符归原获取，退役不报已排空，租约失效后 `maintain()` 关闭它并结清；错误路径的描述符使结清先待处置、关闭后结清；同一文件的两份获取代际不同，一份获取关不了另一份的句柄；同一责任域里提供者重载后新代看到原占用、列出并查询旧获取为释放中、结清它，旧租约不复活；登记表重建后经恢复查询看到已分配、经 `recoverOwned` 的已知列表结清；降低上界不抹旧占用，并发抢最后一个名额只一个得到，全局上界单独报告；新进程的责任域对旧代答未知，自己签发的代答未分配，指纹不同答冲突；未知文件结果下结清不改字节；缺责任域或配额域为空时抛出；排空一份获取只停止它自己的命令进程，确认之后才结清（慢层）。收敛接线（经源码模块读责任域内部面）：释放与退役都封住引擎里这份获取的所有者，之后引擎的批次答 `closed`；配置相同的提供者共用一个引擎，根或上界不同的各用一个 |
| [contract-conformance.spec.ts](tests/contract-conformance.spec.ts)     | 登记表经两个端口替身通过契约的环境套件，宿主提供者通过提供者套件（在途排空一项不适用）；五种故障的登记表被套件拒绝                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [public-entry.spec.ts](tests/public-entry.spec.ts)                     | 根入口的运行导出只有四个函数；根入口可达的模块（含文件树、批次、路径、命令、探测与门脚本）不导入 Cordis 或 `./cordis`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

运行记录：

- PanQiWei 接受时，包测试只在 Node v26.0.0、darwin 上运行过。
- 2026-11-02 在 Node v26.12.0、WSL2（Ubuntu-24.04，内核 6.18.33.2-microsoft-standard-WSL2）上，本成员目录的快层 `vitest run --mode fast`：15 个测试文件、254 个测试，249 个通过、5 个跳过，退出码 0。跳过的 5 个中，4 个属于慢层，1 个只在非 Linux 宿主上运行（host-probe）。同一环境、同一提交上的慢层 `OMNE_HOST_COMMAND_LINUX=1 vitest run --mode slow`：4 个测试文件里的 20 个慢层测试通过，其中 16 个起真实的 systemd 用户 scope，运行后 `systemctl --user list-units 'omne-*'` 没有残留。两层合计 16 个测试文件、270 个测试。`typecheck` 无错误。本成员 `package.json` 声明的引擎是 `>=24`。
- 这次提交没有在 Windows 上运行。只在 Linux 运行的用例在 Windows 上显示为跳过，跳过不是通过。

本成员不覆盖：契约意义的授予根（宿主提供者不声称它）、根内的绑定挂载（同一文件系统上设备号相同，核对挡不住）、Windows 与 macOS 上的 `files` 八项与 `command`（只在 Linux 实现）、真实的 `failed` 单元状态（只有判断函数的测试）、Runtime Context 块的发布、调用方类核对、同一 isolate 标签下重复装载的失败、配置校验失败时 fiber 进入 `FAILED`，以及真实进程退出之后的冷恢复结清。慢层的真实进程用例要设 `OMNE_HOST_COMMAND_LINUX=1` 才运行，准入不设它，所以准入不覆盖它们。持久化、真实端口适配与真实集成方的端到端组合也不在本成员。独立验收场景尚未形成。

### 明确缺项

- 长期运行的保留与淘汰策略待定（应可配置）：共用文件引擎的已签发句柄表与责任域的已结清记录只增不减，当前随进程结束释放。
- 宿主文件插件可以重载而责任域保留，这一点依据本域目标协议；它与产品正文第 2 版「宿主机提供者随执行环境一起在场，不单独装卸」的关系，以及与 #278 已接受的插件形状谁先谁后，待产品负责人与契约拥有者确认。装配规则现在没有强制执行点。
- 责任域在真实装配中的保管点与唯一分发没有采用：本成员只给出工厂 `createHostFilesDomain` 与插件工厂，进程宿主怎样保管并唯一分发它归应用装配（[#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)）。本成员不新增服务或包。
- 契约的提供者事实没有放宿主文件根的位置：`describe()` 看不到是否配置了根，本成员改在获取的证据里写（见[宿主提供者的事实](#宿主提供者的事实)）。要让 `describe()` 与宿主事实块也看见，需要契约增加字段，归契约的拥有者。
- 宿主文件插件的配置还不接受列表与搜索的四项上界，只能经直接创建提供者给出。接受它们要改 `src/cordis.ts` 的配置 Schema，装配字段的名字与对应见[宿主提供者的事实](#宿主提供者的事实)。
- 维护驱动的调度没有实现：`maintain()` 与结清是入口，谁在提供者卸载之后定时调用它们归责任域的拥有者与应用装配。
- 冷恢复结清需要域外可信的进程退出证据，以及原提供者代到进程实例的可核验关联；本成员没有，这是 M2 之后的剩余责任。在它兑现之前，新进程对旧原描述只答未知。
- 配额、查询、迟到与结清协议的行为模型没有进入本成员的 `verification/models/`，相应机制路径保持未验证。
- 两个插件仍是手写的插件对象，没有经过 kernel-basis 的 `definePlugin`，空配置 Schema 与宿主文件插件的配置 Schema 仍在本成员（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。加依赖需要更新工作区锁文件，待派发者裁定。
