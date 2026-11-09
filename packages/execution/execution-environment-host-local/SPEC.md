# @omne-harness/execution-environment-host-local 行为规格

状态：Service 实现与宿主提供者成员，`draft`。本成员做两件事：把 [execution-environment](../execution-environment/SPEC.md) 的登记表装进 [execution-environment-cordis-contract](../execution-environment-cordis-contract/SPEC.md) 定义的服务 `executionEnvironment`，并在宿主机上提供 `files`、`command` 与 `terminal` 设施。领域行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)，登记表行为归 execution-environment，都不在本页。本页的[宿主文件使用](#宿主文件使用)一节已被接受，其余是草案。[宿主文件责任域](#宿主文件责任域)与提供者的获取路径依据[本域目标协议](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6371505744)的 host-files 迁移语义写入，由 [#678 修订决定](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6398383578)具名采用，未经独立技术接受；责任域在真实装配中的保管点、跨进程退出证据与冷恢复结清不在本页兑现（[明确缺项](#明确缺项)）。

## 范围与依据

本成员有两个入口：

- 根入口与 Cordis 无关（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)），导出 `createHostFiles`、`hostObjectToken`、`hostSegmentsBelowRoot`（宿主路径在宿主文件根下的位置，R2-D376）、`createHostFilesDomain` 与 `createHostFilesProvider`，以及类型 `HostFilesDomain`、`HostFilesDomainOptions`、`HostFilesQuotaPolicy`、`HostFilesProviderOptions`、`HostFilesDiagnostic`、`HostFilesLimits`（列表与搜索的上界）、`HostCommandOptions`（`command` 的上界）、`HostTerminalOptions`（`terminal` 的上界）、`HostCommandPrerequisite`、`HostTerminalPrerequisite` 与 `MacosPrerequisite`（平台前提项名），以及 `CommandPrerequisite`（`HostCommandPrerequisite` 与 `MacosPrerequisite` 的并集）。
- `./cordis` 导出 Service 子类 `ExecutionEnvironmentRegistry`、登记 `files` 设施声明的插件 `filesFacilityPlugin`、登记 `command` 设施声明的插件 `commandFacilityPlugin`、登记 `terminal` 设施声明的插件 `terminalFacilityPlugin`，以及插件工厂 `createHostFilesPlugin(domain)`：它返回登记一代宿主文件提供者的插件。配置类型 `HostFilesConfig` 也从这里导出。

上层依据：系统页[执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工，领域页[文件使用的交接](../../../docs/domains/execution-environments/architecture.md#文件使用的交接)，契约的[设施协议](../execution-environment-contract/SPEC.md#设施协议)、[INV-EE04](../execution-environment-contract/SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[INV-EE09](../execution-environment-contract/SPEC.md#inv-ee09-资源和秘密以最小必要条件提供)、[INV-EE13](../execution-environment-contract/SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) 与 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)。

两个入口的模板标记写明还没有接受的部分：Runtime Context 生产者插件、调用方类的核对。`files` 的十二项操作、宿主文件根、`command`（处置与保留在 Linux 上兑现，Windows 的兑现见未接受的 [Windows 的兑现](#windows-的兑现未接受)，macOS 只停止不保留）、`terminal` 与平台前提的探测已经实现，但本页除[宿主文件使用](#宿主文件使用)外都没有经过独立技术接受。`terminal` 的实现与验证前提见[持久终端](#持久终端)。实现与独立接受分别报告。本成员不导入任何上层领域的契约。租户、作用域、原调用与恢复授权都随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 结果与不变量

### 宿主层性质与平台对照（未接受）

状态：未接受。本节是契约 [INV-EE01～18](../execution-environment-contract/SPEC.md#结果与不变量) 在宿主平台层的细化。下列性质在 Linux、macOS 与 Windows 上都成立。平台之间的差异只经声明的事实体现：命令设施的 `containment`、保留扩展的有无、提供者事实的前提三态、结局里 `exit.signal` 的有无，以及终端字节的归属方式。提供者不用同一个形状虚构平台做不到的能力（[INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。

| 编号 | 性质                                                                                                                                                  | 违反时的后果                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| H-1  | 能力如实声明：`containment`、保留扩展与前提三态与实际执行域一致。证明不了 `sealed` 就不声明 `sealed`，探测没有完成就不报 `satisfied`                  | 消费者按不存在的保证行事                             |
| H-2  | 先许可后执行：用户代码的第一条指令在账本 `permit` 确认之后才执行。许可没有确认时，提供者停止资源并记入账本                                            | 没有记账的进程跨进程存活，无人承接                   |
| H-3  | 停止的确认只来自域外对原资源身份与代的观察。找不到、超时与请求被受理都不算已停止                                                                      | 仍在运行的进程被报告为已停止                         |
| H-4  | 结局如实：命令的退出码或信号只在 OS 给出时为已知。终端调用的退出码按该平台 shell 的规则求得，规则见各平台的终端一节。被强制停止的结局不报告为自然完成 | 消费者把被杀的命令当作成功或普通失败                 |
| H-5  | 残留有归属：主进程退出时，执行域里的其余进程或被停止并确认，或移交保留并可被列出，或报告为未知                                                        | 后台进程失控，无人可停                               |
| H-6  | 冷恢复如实：列举不完整时答 `unavailable`，不答空列表。`recover` 只作用于本提供者写下、带代的引用                                                      | 漏停旧进程，或误停别人的资源                         |
| H-7  | 子进程只得到请求给出的环境变量。参数、环境与输入不出现在别的进程能读到的命令行上                                                                      | 秘密泄露，或越权继承宿主环境                         |
| H-8  | 文件操作的完成只挂在点名对象与句柄代次上。打开到的对象与点名不一致时拒绝，确认不了时答未知                                                            | 写到别的对象上                                       |
| H-9  | 有宿主文件根时，任何文件效果不越出根。拒绝之前根内与根外都没有变化                                                                                    | 越权读写根外文件                                     |
| H-10 | 已经产生部分外部效果之后的失败答未知，不写成拒绝，也不自动重做                                                                                        | 重复执行，或掩盖已经发生的效果                       |
| H-11 | 同一种 OS 情况在各平台映射到同一个结果与原因                                                                                                          | 工具与模型在不同平台上看到不同含义                   |
| H-12 | 门面封住之后，新操作答 `closed`，不起进程，不触碰文件系统                                                                                             | 释放之后仍产生外部效果                               |
| H-13 | 模型从结局能读出成功还是失败。失败时，模型除了码之外还能看到原因：错误输出、错误记录、拒绝原因或诊断                                                  | 模型把失败当作成功继续推进，或只看到一个码而无法定位 |

平台的目标按下面的次序确定：

1. 平台能做到比 Linux 更强的保证时，做到更强的保证，并且不再降低它。
2. 否则与 Linux 对齐。
3. OS 层确实做不到 Linux 的保证时，按 macOS 已有的做法如实声明差异，并写出 OS 层的原因。

下表的等级是：「超出」指强于 Linux，「对齐」，「声明差异」指按第 3 条声明，「不适用」。

| 能力                           | Linux                                                                   | macOS                                                                                                  | Windows                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 命令收纳                       | `sealed`：systemd scope                                                 | `none`：POSIX 会话，`setsid` 的进程会离开                                                              | 对齐：`sealed`，Job 加锚进程，见 [Windows 的兑现](#windows-的兑现未接受)                                                                                                                                                                                                |
| 残留处置与保留                 | 停止或移交保留，`residue` 有四种取值                                    | 只停止，`residue` 只有 `none` 与 `stopping`                                                            | 对齐：停止或移交保留，`residue` 有四种取值                                                                                                                                                                                                                              |
| 提供者进程退出后的命令         | 继续运行                                                                | 门停止会话，命令随之停止                                                                               | 对齐：桥是独立进程，继续持有 Job，命令继续运行。桥进程退出时，提供者停止运行中的命令；已移交的保留进程由锚持有，继续运行                                                                                                                                                |
| 冷恢复列举                     | `systemctl` 列举单元                                                    | 状态目录里的标记                                                                                       | 对齐：状态目录里的标记；没有状态目录时答 `unavailable`                                                                                                                                                                                                                  |
| 冷恢复的停止证据               | 启动身份与单元状态                                                      | 启动身份与会话                                                                                         | 对齐：启动身份、登录会话与 Job 名；别的登录会话里打不开 Job 时答 `pending`                                                                                                                                                                                              |
| 优雅停止                       | `SIGTERM` 加 `graceMs`                                                  | 同 Linux                                                                                               | 声明差异：只对控制台程序发 `CTRL_BREAK_EVENT`；其他程序答 `unconfirmed`（Windows 没有通用的终止请求）。消费者从 `stop('graceful')` 的答复看见这一差异                                                                                                                   |
| 批处理文件作为 `executable`    | 不适用                                                                  | 不适用                                                                                                 | 超出：拒绝 `.bat` 与 `.cmd`，避免 `cmd.exe` 的二次解析                                                                                                                                                                                                                  |
| 文件写入                       | 原位写                                                                  | 有根时原位写，结果报 `writeEffect: 'replaced'`。文档与实现的这一处不一致交 macOS 后端的拥有者裁定      | 超出：新建加替换（[R2-D38](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6579990443)），读者看到旧字节或新字节，不会看到写了一半的文件。声明差异：替换后的新对象继承父目录的 ACL，不保留旧对象的属性与备用数据流，旧对象的其他硬链接保留旧字节 |
| 对象身份                       | 设备号加 inode                                                          | 设备号加 inode                                                                                         | 对齐：卷序号加 128 位文件 ID，在 ReFS 上也唯一                                                                                                                                                                                                                          |
| 不覆盖的 `move`                | 目录有检查与改名之间的窗口                                              | `fstatat` 加 `renameat`。文档写的是 `renameatx_np(RENAME_EXCL)`，这一处不一致交 macOS 后端的拥有者裁定 | 超出：由内核保证不覆盖，没有窗口                                                                                                                                                                                                                                        |
| 删除与替换别的进程打开着的文件 | 总能成功，名字立即消失                                                  | 同 Linux                                                                                               | 对齐：用 POSIX 语义的删除与改名，名字立即消失或被替换。声明差异：对方以不共享删除的方式打开时答 `rejected(busy)`；目录的子树里有打开的文件时，目录不能改名，答 `rejected(busy)`（NTFS 的限制）                                                                          |
| 越根防护                       | 逐段 `openat`，核设备号与链接数                                         | 原生辅助程序逐段 `openat`                                                                              | 对齐：从根句柄起逐段 `NtCreateFile`，拒绝中间的重解析点与跨卷项                                                                                                                                                                                                         |
| 文件操作延迟                   | 毫秒级系统调用                                                          | 每次请求起一个辅助进程                                                                                 | 对齐：常驻文件辅助进程，热态单次操作 p50 不超过 20 ms                                                                                                                                                                                                                   |
| 终端 shell                     | Bash                                                                    | `/bin/bash` 3.2.57                                                                                     | 不适用：Windows 的终端 shell 是 Windows PowerShell 5.1，嵌在 ConPTY 里的 Runspace。对齐的是性质，不是 shell 语言                                                                                                                                                        |
| 终端调用的退出码               | Bash 的 `$?`                                                            | 同 Linux                                                                                               | 对齐：见 [Windows 终端](#windows-终端未接受)                                                                                                                                                                                                                            |
| 终端字节归属                   | 哨兵按段归属，段间字节单列                                              | 同 Linux                                                                                               | 系统 ConPTY 上是声明差异：按观察窗口归属，结局不带 `between`（ConPTY 重绘输出，未知 OSC 与文本不保序）。随包的 `conpty.dll` 通过保序验证时对齐。见 [Windows 终端](#windows-终端未接受)                                                                                  |
| 信号退出                       | 有                                                                      | 有                                                                                                     | 声明差异：Windows 没有信号，结局的 `exit` 只有 `code` 一种，消费者从 `exit` 的形状看见这一差异                                                                                                                                                                          |
| 磁盘已满且没有效果             | `ENOSPC` 映射为未知                                                     | 同 Linux                                                                                               | 超出：临时对象已删除且目标未变时答 `rejected(capacity)`。Linux 原位写在磁盘满时可能已写了一部分，所以答未知。Linux 能否区分「没有效果」交 Linux 后端的拥有者                                                                                                            |
| 失效终端的引用                 | 答 `closed`，与契约写的 `unavailable` 不一致，交 Linux 后端的拥有者裁定 | 同 Linux                                                                                               | 对齐契约：答 `unavailable`                                                                                                                                                                                                                                              |

### 宿主提供者的事实

`createHostFilesProvider(options)` 每次调用造一个提供者，也就是一代。`options.domain` 必填，是本包 `createHostFilesDomain` 创建的责任域；缺少或不是本包的责任域时抛出 `TypeError`。提供者声明下列事实：

| 事实                   | 值                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 名称                   | `host-files`                                                                                                                                                                  |
| 代                     | 每次创建时生成的随机 UUID。一个提供者对象只登记一次，所以每次登记都是新的代（一次登记化身）。创建时把代登记进责任域                                                           |
| 版本                   | 本包 `package.json` 的 `version`，运行时从包根读取                                                                                                                            |
| 配额域                 | 责任域的配额域，缺省 `host-files`                                                                                                                                             |
| 绑定层                 | 只有 `host_machine`                                                                                                                                                           |
| 连续性                 | `not_guaranteed`                                                                                                                                                              |
| 设施键                 | `files`、`command` 与 `terminal`                                                                                                                                              |
| 隔离断言               | 空。本提供者不确认任何隔离                                                                                                                                                    |
| 宿主文件根             | 提供者选项 `filesRoot`，绝对路径，可选。配置了它，这一代全部 `files` 请求受它限制，见[宿主文件根](#宿主文件根未接受)                                                          |
| 状态目录               | 提供者选项 `stateDirectory`，绝对路径，可选。批次清单放在其中；前提 P2 的探测在其中建、删临时目录；没有它时批次答 `unavailable`，探测用系统临时目录。macOS 的冷索引也放在其中 |
| 列表与搜索的上界       | 提供者选项 `limits`，`HostFilesLimits` 的部分值：`listPageLimit`、`searchEntryBudget`、`searchByteBudget`、`searchFileBytes`。缺省取初值                                      |
| 宿主事实（`describe`） | 名称、代、版本、平台（`process.platform` 加 `os.release()`）、设施键、空隔离断言，以及合并后的前提（见下文）                                                                  |

- `quota(租户)` 读责任域的配额策略，答已声明（单位是一个未结清的获取）；策略抛出或给出的上界不是非负安全整数（全局上界可以为空）时答未知。它不保留名额。
- `acquire` 在提供者退役后返回 `providerUnavailable`。落点的绑定层不是 `host_machine` 时返回 `noMatchingEnvironment`。其余情况交给责任域接纳（见[宿主文件责任域](#宿主文件责任域)）：新接纳的获取交回一个租约原件，实例身份是 `host` 加提供者的代，`facility('files')` 返回这份获取的文件门面，`facility('command')` 返回这份获取的命令门面，`facility('terminal')` 返回这份获取的终端门面；证据记录提供者名称、代与版本，配置了宿主文件根时另有一个条目 `filesRoot`，值为字符串 `configured`（不写路径）。同一租户、同一获取键、相同指纹的重复由原记录认回：原租约仍打开时交回同一租约，否则答未知并带原获取键，不造第二个门面。指纹不同为 `acquisitionConflict`。超过按租户上界为 `quotaExceeded`，超过全局上界为 `globalCapacityExceeded`，两者都不留下记录。`acquire` 不分配外部资源，立即返回。
- 租约原件的释放：先撤掉这份租约的失效通知，再排空这份获取（封门面，最多等 `drainBoundMs`，重试失败的关闭）。什么都不剩时答已释放，名额只返还一次；否则答待处置，资源清单列出停止未确认的命令进程（没有命令时为空），名额仍占用。待处置之后可以重试释放。
- `inspectAcquisition(原描述)` 读责任域的原记录：打开的答已获取（带原租约与证据），释放中的答待定（阶段 `releasing`，资源列出停止未确认的命令进程），已结清的答已结清，指纹不同的答冲突。没有记录时，原描述的提供者代是本责任域签发过的代则答未分配，否则答未知：新进程的责任域没有证据说明旧容量已经结清。配额域与本责任域不同的原描述按没有记录处理。
- `listAcquisitions(作用域)` 列出请求方作用域是该作用域、尚未结清的全部获取的原描述，包括没有受管资源的获取。
- `settleAcquisition(原描述)` 与查询做同样的定位，然后排空这份获取：封门面、使原租约以来源 `provider`、原因 `released` 失效、等在途操作、重试失败的关闭。什么都不剩时答已结清，否则答待处置（资源列出停止未确认的命令进程）。结清不重做文件写入，也不回滚已写入的字节。重复结清答已结清，不再返还名额。
- 本提供者的文件操作不留下受管资源；命令与终端的执行域是受管资源：Linux 上是 scope 单元，Windows 上是 Job，macOS 上是 POSIX 会话。`listRecoveryResources` 与 `recover` 只处理这些执行域，见[宿主命令与终端](#宿主命令与终端)的资源级冷恢复。Windows 与 macOS 从状态目录里的冷索引作答，并合并责任域已知的保留终端资源。Windows 与 macOS 上没有状态目录时答 `unavailable`。Linux、Windows 与 macOS 之外的宿主答责任域已知的保留终端资源，没有时为空列表。Linux 上没有可达的用户管理器时答 `unavailable`，不答空列表。描述符、在途操作与失败关闭由获取路径（枚举与结清）覆盖，空的资源列表不证明没有这些责任。
- 本提供者不读账本：账本关闭后的拒绝由登记表的门在调用设施之前做（[INV-EE15](../execution-environment-contract/SPEC.md#inv-ee15-准备持有回收与确认保持一致)）。直接调用 `createHostFilesProvider` 得到的租约原件不经过门。终端额外读取原账本的关闭信号，阻止关闭之后的创建与执行。请求方作用域随 `ProviderAcquireInput.scope` 到达，进入原描述与获取枚举。
- `retire()` 先把提供者标为已退役，之后新的获取返回 `providerUnavailable`。然后它封住这一代全部尚未结清的获取的门面，使它们的租约原件以来源 `provider`、原因 `providerRetired` 失效，再逐份排空。每份都结清时返回已排空，并结束这一代对引擎诊断的订阅；否则返回待处置，资源列出停止未确认的命令进程，并给 `diagnose` 一条诊断。原记录与仍打开的描述符留在责任域，新的代经同一责任域查询与结清它们。待处置之后再调用 `retire()` 会再排空一次。
- `drainBoundMs` 的初值是 10000，用于释放、结清与退役。它必须是有限的非负数，否则 `createHostFilesProvider` 抛出 `RangeError`。
- 诊断 `HostFilesDiagnostic` 的 `kind` 有七种，`diagnose` 抛出都不改变结果。结果为待处置时：仍有在途操作时 `kind` 为 `drainBoundExceeded`，只剩关闭失败的描述符时为 `closePending`；带提供者名与代、在途操作数（文件操作与命令启动）、打开的描述符数与上界，释放或结清时另带获取键。命令进程的停止没有确认时为 `stopUnconfirmed`，缺平台前提而拒绝命令启动时为 `commandUnavailable`，缺终端前提时为 `terminalUnavailable`，三者见[宿主命令与终端](#宿主命令与终端)。保留进程的标记文件与单元不一致时为 `retainedMarker`，见[一次性命令留下的进程的兑现](#一次性命令留下的进程的兑现)。批次发布后删不掉临时文件时为 `temporaryFileRemains`：带提供者名与代、批次 id、已发布的路径、临时文件名与可选的错误码。`temporaryFileRemains` 来自文件引擎，不属于某一份获取，所以不带获取键。
- 文件引擎的配置：提供者向责任域要一个按文件配置共用的引擎，配置是 `filesRoot`、`stateDirectory` 与 `limits`。这些值不合法时 `createHostFilesProvider` 在登记这一代之前抛出：路径不是绝对路径为 `TypeError`，上界不是正安全整数为 `RangeError`。三项都不给时，行为与没有这些选项之前相同。同一责任域里配置相同的提供者共用一个引擎，配置不同的各用一个，见[宿主文件责任域](#宿主文件责任域)。

提供者事实里的前提是下列探测的合并。P2（`files` 的目录描述符前提，`probeHostFilesPrerequisite(stateDirectory)`）由 `describe()` 读取：满足或不满足的结果在这一代内保留，未知的结果下一次 `describe()` 再探。`command` 的 P1、P3～P6 由创建时开始的后台探测给出，见[宿主命令与终端](#宿主命令与终端)。macOS 不做这几项探测，它的前提项见同一节的「macOS 的平台前提」。合并规则：任一项不满足为 `unsatisfied`，否则任一项未知为 `unknown`，全部满足为 `satisfied`。不满足的项名不进宿主事实。

契约的提供者事实只有三态的前提，没有放宿主文件根的位置，严格的事实 Schema 也不接受多余的字段。所以配置了宿主文件根这件事不写进 `describe()`，而写进获取的证据（见 `acquire`）。要在 `describe()` 里看见它，需要契约增加一个字段，这归契约的拥有者。提供者事实不携带日期（日期由后续宿主事实块生产者在块级提供，见[契约 INV-EE17](../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。

提供者选项与装配字段的对应（装配页由 Reduce 维护，本页只写提供者一侧）：

| 装配字段（`execution-host` 行）                                              | 提供者选项                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `filesRoot`、`stateDirectory`                                                | `filesRoot`、`stateDirectory`                                                                           |
| `listPageLimit`、`searchEntryBudget`、`searchByteBudget`、`searchFileBytes`  | `limits.listPageLimit`、`limits.searchEntryBudget`、`limits.searchByteBudget`、`limits.searchFileBytes` |
| `startBoundMs`、`graceMs`、`stopBoundMs`、`probeRetryMs`（与命令缓冲的两项） | `command` 里的同名字段                                                                                  |
| `residuePolicy`、`retainedPerScope`、`retainedPollMs`、`retainedOutputBytes` | `command` 里的同名字段                                                                                  |
| `terminal`                                                                   | `terminal`（见[持久终端](#持久终端)）                                                                   |
| `drainBoundMs`                                                               | `drainBoundMs`                                                                                          |

宿主文件插件现在的配置 Schema 只接受表中的字段，即路径、命令（含留下的进程的四项）、`terminal` 与 `drainBoundMs`，不接受四项列表与搜索上界；它们只能经直接创建提供者给出。

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
- 契约的 `files` 设施另有列表、搜索、建目录、删除、移动、复制、提交批次与恢复批次八项操作。本设施在 Linux、macOS 与 Windows 宿主上实现它们，见[八项操作](#八项操作未接受)及各平台说明。其他宿主上，这八项返回 `rejected`，原因 `unavailable`，不触碰文件系统。
- 打开失败按错误码映射：`ENOENT`、`ENOTDIR` 为未解析；`ELOOP`、`EMLINK`、`EISDIR` 为 `unsupported`；`EINVAL` 为 `invalidInput`；`EACCES`、`EPERM` 为 `notAuthorized`；其余错误为未知。
- 读取接受起点与上限两个字节数。两者必须是非负安全整数，否则返回 `invalidInput`。读取目录返回 `unsupported`。完成时带字节、下一次读取的起点与是否已到文件末尾。
- 查看完成时带对象类型（文件或目录）、字节数与修改时间。
- 版本是修改时间与字节数的组合。替换写入带预期版本而当前版本不同时返回 `conflict`，文件不变。
- 写入有两种模式。替换模式按上一节写入。路径上没有对象时，替换模式返回未解析。
- 新建模式的 `named` 是父目录。本设施在独占新建前后各核对一次父目录的设备号与 inode。新建模式带预期版本，或路径以斜杠结尾，返回 `invalidInput`。父目录不存在返回 `notFound`。目标已存在返回 `conflict`。新建之后父目录身份变了，返回未知，已建的文件留在原处。新建的文件以 `0666` 为权限请求，最终权限由进程的 umask 决定；批次里新建的文件相同，Linux 与 macOS 一致。
- 本设施在调用时取下请求身份与待写字节的副本。调用方在调用之后改动请求对象，不影响这次操作。

#### 八项操作（未接受）

状态：未接受，依据 [#421 的 D1 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。契约未规定条目名字段（[契约的明确缺项](../execution-environment-contract/SPEC.md#明确缺项)）。macOS 后端在实际条目上附带 `name`，供现有 Files 工具读取，未改变契约类型；没有该字段的后端仍不能供工具显示名字。

共同规则：

1. 平台前提 P2。Linux 后端靠 `/proc/self/fd/<描述符>/<名>`：内核按已打开的目录对象解析这条路径，不按目录现在叫什么名字解析。`probeHostFilesPrerequisite(directory?)` 探测它：Linux 上在 `directory`（缺省是系统临时目录，引擎用状态目录）里建临时目录，打开它，经描述符路径独占新建一个文件再删除，成功为满足，没有这种路径为不满足，探测本身出错为未知。macOS 使用公开 POSIX `*at` 接口的原生辅助程序，在临时目录中实际创建并删除文件来探测 P2；缺少编译工具为不满足。Windows 的前提见 [Windows 文件后端](#windows-文件后端未接受)末段。没有后端的平台为不满足。引擎保留满足与不满足的结果，未知的结果下一次请求再探。前提不是满足时，八项返回 `rejected`，原因 `unavailable`，不触碰文件系统。
2. 前置检查与已接受的四项相同，先于平台检查，不触碰文件系统：绑定层不是 `host_machine` 为 `unsupported`；路径不是绝对路径或含空字节为 `invalidInput`；没有点名为 `notAuthorized`。`move` 与 `copy` 的目标路径和点名、`commitBatch` 每一项的路径和点名用同一组检查。
3. 落点是目录描述符。每项操作先打开所需的目录，不跟随最后一段链接，核对它的设备号与 inode，之后的建、删、改名在 Linux 经 `/proc/self/fd/<描述符>/<名>`，在 macOS 经同一辅助进程持有的目录描述符和 `*at` 系统调用；名里没有斜杠。目录在操作中被改名或被换成链接，操作仍落在原目录里。
4. 点名不一致为 `conflict`，与读取、写入相同。
5. 路径上没有对象时，只有 `list` 返回未解析；其余各项返回 `rejected`，原因 `notFound`。契约只许读取、查看、列表与替换写入返回未解析。
6. 已经产生部分效果又没有完成整个请求时返回未知，不写成拒绝。
7. 门面封住之后，新操作返回 `closed`，不触碰文件系统；门面由责任域做，引擎的 `seal(所有者)` 提供同样的封闭，并使这个所有者正在运行的批次停在下一次发布之前。操作返回前关闭自己打开的描述符，Linux 关闭失败的描述符进入引擎的待关闭集合，归这份获取。macOS 等待辅助进程退出，进程退出关闭它持有的全部描述符；异常退出或协议损坏答未知，不撤销外部效果。
8. 编码之外的限制：目录项名不是合法 UTF-8 时，`list` 与 `search` 略过这一项，不计入分页；`remove` 的递归删除遇到这样的名字时返回 `unsupported`，什么都不删。
9. 列表与搜索的上界是配置：`listPageLimit`（初值 1000）、`searchEntryBudget`（初值 10000 个目录项）、`searchByteBudget`（初值 64 MiB）、`searchFileBytes`（初值 8 MiB）。`createHostFilesEngine` 的第二个参数给出它们，每个必须是正安全整数，否则抛出 `RangeError`。

各项（每项的最后一句写用户能看到的代价）：

- **list**。`named` 是这个目录。读出目录项，按名的字节序排序，从 `offset` 起取至多 `limit` 项（缺省取 `listPageLimit`）。每一项用 `lstat` 取类型、字节数、修改时间与版本，符号链接报 `symlink`，不跟随。有下一页时带 `nextOffset`。结果带目录的身份与版本：调用方比较各页的目录版本判断目录是否变过。路径上没有对象为未解析，不是目录（含符号链接）为 `unsupported`，点名不一致为 `conflict`，`offset` 或 `limit` 不是非负安全整数、`limit` 为 0 或超过 `listPageLimit` 为 `invalidInput`，`offset` 超过项数为完成且没有条目，读目录中途出错为未知。代价：翻页之间目录可以变，提供者不保证跨页的一致快照。
- **search**。`named` 是起点目录。`match: 'name'` 在目录项名的字节里找 `pattern`；`match: 'content'` 在普通文件的字节里找，每个文件只报第一个命中，带 `offsetBytes`。`recursive` 为真时按名的字节序深度优先，经目录描述符逐层打开，不跟随符号链接，不进入设备号与起点不同的目录。每次调用从头遍历，取第 `offset` 起的至多 `limit` 个命中。超过 `searchEntryBudget` 或 `searchByteBudget` 时停止，大于 `searchFileBytes` 的文件不读，两种情况都使 `truncated` 为真，结果为完成。`pattern` 为空、分页参数不合要求为 `invalidInput`，路径上没有对象为 `notFound`，起点不是目录为 `unsupported`，走到一半出错为未知。代价：翻页重复遍历，预算对整次调用计；`truncated` 为真时结果不完整。
- **mkdir**。`parents` 为假时 `named` 是父目录：打开父目录并核对点名，在其中建目录，再不跟随链接地打开新目录，返回它的身份。`parents` 为真时 `named` 是最近的已有祖先：核对点名后，经上一段的目录描述符逐段建缺的段。目标已存在为 `conflict`，父目录不存在为 `notFound`，点名不一致为 `conflict`；`parents` 为真且已建了至少一段之后失败为未知，已建的目录留在原处；建好后核对新目录失败为未知。代价：失败时可能留下已建的上层目录。
- **remove**。`named` 是要删除的对象。打开父目录，`lstat` 目录里的名，核对它就是点名对象，再核预期版本。文件与符号链接用 `unlink`，只删链接本身。目录在 `recursive` 为假时用 `rmdir`；为真时先走一遍子树确认可删（不跟随链接，设备号必须相同），再从叶子起逐项删除。路径上没有对象为 `notFound`，版本不同或点名不一致为 `conflict`，目录非空而 `recursive` 为假为 `conflict`，子树里有别的设备为 `notAuthorized` 且什么都不删，递归删除删了一部分之后失败为未知。代价：核对与删除之间名可以被换成另一个对象，被删的仍是同一目录里的这个名，效果不出这个目录，这个窗口关不上（Node 没有带身份核对的 `unlinkat`）；递归删除失败时子树只删了一部分。
- **move**。`path` 是源，`named` 是源对象。目标不存在时 `target.named` 是目标的父目录，`replace` 为真且目标存在时是目标对象。`replace` 为真用 `rename`。`replace` 为假时，文件与符号链接用 `link` 加 `unlink`：`link` 在目标已存在时失败，所以不覆盖；Linux 目录在 `lstat` 目标不存在之后 `rename`；macOS 目录使用 `renameatx_np(RENAME_EXCL)`，目标存在时不覆盖。返回源对象与目标的身份。源不存在为 `notFound`，源版本或任一点名不一致为 `conflict`，`replace` 为假而目标存在为 `conflict`，跨设备为 `unsupported`（不改用复制），`link` 成功而 `unlink` 失败时两个名都在，为未知。代价：Linux 目录在 `replace` 为假时有检查与改名之间的窗口，此时并发建出的空目录会被换掉；跨设备移动要调用方自己复制再删除。
- **copy**。只复制普通文件，源是目录、符号链接或别的类型为 `unsupported`。打开源（不跟随链接），核对点名与版本，一块一块读。`replace` 为假时在目标父目录里独占新建目标再写入；`replace` 为真时先在目标父目录写临时文件 `.omne-copy-<uuid>`，写完 `fsync` 后 `rename` 到目标名，所以替换后目标是新的 inode，另一个已打开旧文件的读者仍读到旧字节。返回源对象与目标的身份。源不存在为 `notFound`，版本或点名不一致、`replace` 为假而目标存在为 `conflict`，目标是目录为 `unsupported`。写临时文件失败：删除临时文件成功时目标名没有变，按错误映射返回拒绝；删除失败为未知。`replace` 为假时目标已建而写入未完成为未知，文件留在原处。代价：`replace` 为假的写入中途失败会留下不完整的目标文件；临时文件删除失败时留下 `.omne-copy-` 前缀的文件，引擎的 `diagnose` 目前只覆盖批次的残留，不报告复制临时文件的名字。
- **commitBatch**。每一项单独发布，不做多路径原子提交。`entries` 的 `named`：`expectedVersion` 为 `null` 的项是目标的父目录，否则是目标文件。步骤：先核全部项（路径、点名、宿主文件根、预期版本）；任一项不合格返回 `rejected`，什么都不写。再在状态目录写清单 `batches/<租户摘要>/<批次 id>.json`（状态 `staging`，记各项路径、点名、预期版本、待写字节的 SHA-256 与长度，不记字节本身，`fsync`）。再在各目标的父目录里独占新建临时文件 `.omne-batch-<批次 id>-<序号>`，写入并 `fsync`，清单改为 `publishing`。再逐项发布：`expectedVersion` 为 `null` 用 `link` 加 `unlink`，目标已存在时失败，不覆盖；否则紧挨着 `rename` 之前再核一次点名与版本，再 `rename` 覆盖。每发布一项，把路径追加进清单的回执并 `fsync`。全部发布后清单为 `committed`，返回完成，`kind: 'committed'`。某一项版本冲突时停止发布，删除尚未发布的临时文件，清单为 `conflict`，返回完成，`kind: 'unknown'`，`reason: 'conflict'`，`published` 列出已有回执的路径。门面封住时同样停止，`reason: 'closed'`。其余发布错误返回 `reason: 'effectUnknown'`，临时文件留在原处。`link` 成功之后 `unlink` 临时文件失败（`ENOENT` 除外）时，发布已经发生，结果仍是 `committed`，该项照常记回执；残留的临时文件名经引擎选项 `diagnose` 的诊断 `temporaryFileRemains` 报告，带批次 id、已发布的路径、临时文件名与错误码。`diagnose` 抛出不改变结果。批次身份是 `{ id, generation }`：`id` 是 UUID，`generation` 是引擎的进程实例身份。没有配置 `stateDirectory` 时返回 `rejected`，原因 `unavailable`。代价：不是原子的，中途失败时前面的项已经发布；清单只增不减，与句柄表相同；清单目录需要 `stateDirectory`；发布后删不掉临时文件时，目标旁留下 `.omne-batch-` 前缀的文件（与目标是同一个文件的第二个名），只有配置了 `diagnose` 才报告它的名字，没有配置时它静默留下。
- **recoverBatch**。只读：按请求的租户与批次 id 读清单，不发布、不回滚、不覆盖。对每一项：有回执的进 `published`；没有回执、但目标当前字节的摘要等于待写摘要的进 `matchingPrepared`（相等不是回执）；目标既不是预期版本也不是待写字节的进 `conflicting`。状态：全部有回执为 `complete`；清单为 `conflict` 为 `conflict`；批次的 `generation` 不是本引擎为 `interrupted`；是本引擎且批次还在运行为 `pending`；是本引擎、已经停止而没有全部发布为 `partial`。清单不存在、租户不同或 `generation` 不同返回 `rejected`，原因 `notFound`，不区分；批次 id 不是 UUID 为 `invalidInput`；清单读失败或目标读不了为未知。代价：回答只说清单与目标现在是什么，不说下一步；读取的是读取那一刻的目标。

### 宿主文件根（未接受）

状态：未接受，依据同一份 [D1 决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。

宿主文件根限制宿主提供者的全部 `files` 请求。它不是契约的授予根：契约把授予根定义为声称 `filesystem-root` 隔离断言的落点的属性，而宿主提供者不声称它，因为同一个提供者还提供 `command`，命令不受文件限制。要求 `filesystem-root` 的工具在落点解析时仍得到 `isolationUnconfirmed`。

- 来源：`createHostFilesEngine(options)` 的 `root`，必须是绝对路径，否则抛出 `TypeError`。`stateDirectory` 同样必须是绝对路径。引擎用 `hasRoot` 报告自己有没有根。提供者选项 `filesRoot` 与 `stateDirectory` 经责任域交给引擎：责任域按配置造引擎，同一配置的提供者共用它（见[宿主文件责任域](#宿主文件责任域)）。一代提供者的全部获取用同一个根，根不按租户区分。配置了根时，获取的证据多一个条目 `filesRoot`，值为 `configured`，这是观察者看到根的位置；`describe()` 看不到它，原因见[宿主提供者的事实](#宿主提供者的事实)。不给 `root` 时，已接受的四项行为不变。
- 绑定：第一次使用时对 `root` 取 `realpath`，打开它，记下设备号与 inode。打不开时全部 `files` 请求（含已接受的四项）返回 `rejected`，原因 `unavailable`，不改成不受限；下一次请求再试。
- 每次请求重新打开根的真实路径，核对设备号与 inode 与记下的相同，不同返回 `notAuthorized`。
- 路径检查先于任何目录的打开，也先于平台前提的探测：路径按段比较必须以根的真实路径为前缀（段边界，不是字符串前缀）；任何一段是 `..` 返回 `notAuthorized`，哪怕它解析后仍在根内。这两项只用记下的根路径，不碰状态目录（探测要在其中建、删临时目录），所以根外或带 `..` 的请求被拒绝时，状态目录的名与修改时间都不变。Linux、macOS 与 Windows 以外的宿主仍先返回 `unavailable`，这一步不触碰文件系统。
- 逐段走：从根的目录描述符起，每一个中间段以 `O_DIRECTORY` 加 `O_NOFOLLOW` 经上一段的描述符打开。中间段是符号链接返回 `notAuthorized`；中间目录的设备号与根不同返回 `notAuthorized`。最后一段以 `O_NOFOLLOW` 打开，是符号链接时按现有映射返回 `unsupported`；删除与改名的最后一段是链接时只作用于链接本身。读取、查看与替换写入经 `openNamed` 打开最后一段，打开之后对描述符做 `fstat`，设备号与持有它的目录不同（根内的挂载点）返回 `notAuthorized`；这次打开不创建、不截断，所以拒绝前文件系统没有变化。删除在核对点名与版本之后，比较要删的对象与持有它的目录的设备号，不同（根内的挂载点）返回 `notAuthorized`，递归与非递归都什么都不删。
- 内容操作（读取、替换写入、复制的源、搜索读内容的文件）打开后对描述符做 `fstat`，普通文件的链接数大于 1 返回 `notAuthorized`，在任何写字节之前。核对发生在打开之后，所以没有检查与打开之间的窗口。删除、改名与批次发布只改根内的名，不核链接数：被删或被换掉名字的文件若在根外另有名字，根外对象的链接数减 1，字节不变。
- 有根而平台前提 P2 不满足时，全部 `files` 请求返回 `rejected`，原因 `unavailable`，不放宽成无根。
- 位置判断 `hostSegmentsBelowRoot(root, path, platform?)`（`src/root-segments.ts`，R2-D376）：输入宿主文件根、绝对宿主路径与可选平台，平台缺省取本进程的平台。输出 `Promise`，值是路径在根下的各段，原样返回、不归一，路径就是根时为空数组；路径不在根下，或写法在 IO 之前就被拒绝时，值是 `undefined`。它只判断位置：不跟随任何链接，不授予访问，也不判断路径经过的链接是否把对象带出根。经由根外的链接进入根内的路径不在根下；在根下的路径仍可能经链接通向根外，这由文件后端逐段再核。POSIX 按文字逐段比较，大小写敏感，忽略空段与 `.`，任何 `..` 或 NUL 都不在根下。Windows 上同样忽略空段与 `.`；不带盘符的写法（UNC、`\\?\`、`\\.\`）、NUL、`..`、备用数据流、末尾为点或空格的名字与设备名都不在根下。盘符按文字比较，同一卷的另一盘符（`subst`）不在根下。根的某一段与路径里的同位置段只差大小写时，不做 IO 就相同。写法不同的段（例如 8.3 短名与长名）只在两个名字是根自己写法所到的父目录下的同一目录项（卷序号与文件索引相同）时才相同，比较不跟随链接，所以别的名字的联接不算根的一段。Windows 文件后端与应用的路径守卫都用这一个判断，两处对位置不会有分歧。
- 有根时，已接受四项里「祖先符号链接本身不构成拒绝」不再适用：中间段是链接一律拒绝。这是对已接受行为的收紧，只在配置了根时生效，须经原接受入口重新接受（[架构页的维护规则](docs/architecture.md#验证与维护)第 1 条）。归层不确定，按 D1 决定记录按第二层处理。
- 创建（新建写入、建目录、复制、批次临时文件）只在已核对的目录描述符下发生，所以创建不会落到根外。

四类逃逸与结果：

| 类                 | 判定                                                                                                                                            | 结果                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 解析在根外         | 路径按段不以根的真实路径为前缀；或逐段走时某个中间目录的设备号与根不同；或经 `openNamed` 打开的最后一段、删除的最后一段设备号与持有它的目录不同 | `notAuthorized`                                             |
| `..`               | 任何一段是 `..`                                                                                                                                 | `notAuthorized`                                             |
| 指向根外的符号链接 | 中间段是符号链接，不论指向哪里                                                                                                                  | `notAuthorized`；最后一段是链接时按现有映射为 `unsupported` |
| 硬链接             | 内容操作打开后的描述符上，普通文件的链接数大于 1                                                                                                | `notAuthorized`                                             |

拒绝后根内与根外的目录无变化：名、类型、字节、链接数与修改时间不变。读取与打开目录可能更新访问时间（取决于挂载选项），不在其内。已知限制：根内的挂载点靠设备号核对挡住，中间段、经 `openNamed` 的最后一段与删除的最后一段都核；Linux 包测试在有挂载权限时把 tmpfs 挂在根内的目录上构造最后一段（`sudo -n mount`）；macOS 测试用 `hdiutil` 挂载独占临时 APFS 卷。两个平台都核对查看与递归删除被拒绝，且卷中内容不变。没有权限的环境里该用例报告跳过，不算通过。同一文件系统上的绑定挂载与根内目录设备号相同，核对挡不住。删除与改名的核对和实际调用之间名可以被换成另一个对象，效果仍不出该目录。

### Windows 文件后端（未接受）

状态：未接受。本节写 Windows 后端怎样兑现上文的十二项操作与宿主文件根。机制见 [Windows 文件说明](docs/windows-files.md)。

辅助进程：

- 十二项操作在 Windows 上全部经文件辅助进程执行。有根与无根用同一个后端，区别只在起点：有根时从根的句柄起逐段打开，无根时从盘符根的句柄起逐段打开。
- 文件辅助进程是常驻进程，每个 harness 进程一个，各引擎与 `hostObjectToken` 共用。它由内嵌的 C# 源码用系统的 .NET Framework 编译器 `csc.exe` 编译，按源码摘要缓存。它不依赖 PowerShell。
- 辅助进程不持有跨请求的状态。每个请求的句柄在这个请求里打开，返回之前关闭。根的身份随每个请求传入。
- 延迟目标：同一台机器上，热态（辅助进程已经启动，编译缓存已经存在）的单次 `stat`、`read`、`list` 与 `write` 的 p50 不超过 20 ms。第一个请求的启动时间不计入。

路径与身份：

- 只接受本机盘符的绝对路径。无根时，UNC、`\\?\`、`\\.\`、备用数据流、末尾是点或空格的名字与设备名答 `rejected(unsupported)`。有根时，这些写法不在根下，答 `notAuthorized`（见 `hostSegmentsBelowRoot`）。
- 空段与 `.` 段按 POSIX 的规则忽略。任何 `..` 段都答 `notAuthorized`，有根与无根相同。路径以 `.` 段结尾时，最后一段按目录解析（无根时跟随链接，与 POSIX 的 `name/.` 相同），它不是目录时为未解析。路径以分隔符结尾时，最后一段必须是目录，不跟随链接。
- 对象 token 的形式是 `<卷序号十进制>:<128 位文件 ID 十六进制>`，取自 `GetFileInformationByHandleEx(FileIdInfo)`。`hostObjectToken` 在 Windows 上经同一个辅助进程取 token，所以调用方的点名与后端的核对使用同一种形式。
- 名字是 UTF-16。含未配对代理项的名字按[八项操作](#八项操作未接受)共同规则第 8 条处理：`list` 与 `search` 略过这一项，递归删除答 `unsupported`。

删除、改名与写入：

- 删除使用 POSIX 语义并忽略只读属性：名字立即消失，别的进程已经打开的句柄仍然可用。
- 改名与替换发布使用 POSIX 语义并忽略只读属性。替换时，目标被别的进程打开着也能被替换。
- 辅助进程自己的每次打开都允许别的进程读、写与删除。
- 别的进程以不允许删除的方式打开了对象时，删除、改名与替换答 `rejected(busy)`。目录的子树里有打开的文件时，NTFS 不允许改名这个目录，`move` 答 `rejected(busy)`。
- 写入是新建加替换，规则见 [Windows 文件说明](docs/windows-files.md#收尾与未闭合项)。新对象继承父目录的 ACL。旧对象的属性、备用数据流与其他硬链接不转到新对象。
- `copy` 在辅助进程里按块流式复制：从源句柄读，写进目标父目录句柄下的临时对象，刷盘之后按替换发布的规则发布。复制的内存占用与文件大小无关。
- 磁盘已满时，如果临时对象已经删除且目标没有变化，答 `rejected(capacity)`。否则答未知。

搜索与批次：

- `search` 遇到别的进程以不共享读的方式打开的文件时，跳过这个文件，结果的 `truncated` 为真，结果仍为完成。
- 批次由逐项操作组成，不使用原生握手。暂存阶段失败时，如果全部临时对象都已删除，答 `rejected`。否则答未知。
- `recoverBatch` 遇到目标是目录或链接时，把这一项列入 `conflicting`，不把整个回答改为未知。
- 批次与 `copy` 留下的临时对象经诊断 `temporaryFileRemains` 报告。

失败：

- 辅助进程退出（包括崩溃）时，已经写给这个进程、还没有答复的请求答未知。还在队列里的请求等下一个进程，这不是重做。
- 单个请求超过 `requestBoundMs`（初值 30000）时，这个辅助进程整体失效并被停止，它的在途请求答未知。
- 辅助进程起不来或超过启动上界时，等待中的请求答 `unavailable`。
- 封闭由门面准入守：门面封住之后，新操作答 `closed`，不发给辅助进程。已经准入的请求照常做完，排空等它们结束。辅助进程不在入队与发送时核对封闭。H-12 由门面准入与排空守住。
- 已知限制：一个辅助进程由全部引擎共用。它崩溃、送出损坏的帧或超时时，同一时刻其他获取与其他租户的在途请求也答未知。每个请求的结果仍然如实，数据不越界。依据：宿主机部署归一个自然人（R2-D204）。

前提 P2 在 Windows 上：`csc.exe` 存在，辅助进程能启动，并且能在状态目录（没有状态目录时用系统临时目录）里经句柄相对的方式建一个文件、读、列出、删除。不满足时为 `unsatisfied`，探测本身出错时为 `unknown`。

### Service 实现

- `ExecutionEnvironmentRegistry<P>` `extends ExecutionEnvironmentService<P>`，不另写键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。构造时调用 `createEnvironmentRegistry`，把环境面与恢复面八个方法原样转给登记表。
- 三个端口都不经构造参数进入。登记表的恢复授权、环境授权与可信绑定每次被调用时，Service 用自己装载时的上下文 `ctx.get` 现取 `executionRecoveryAuthority`、`executionEnvironmentAuthority` 与 `executionScopeBinding` 服务并转交（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)、[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。取不到时答不可用：没有装载恢复授权服务时，`recoverOwned` 与 `releaseScope` 以 `unavailable` 拒绝；没有装载环境授权或可信绑定服务时，环境面以 `unavailable` 拒绝，查询答查询不可用，不放行。服务方法里的 `this.ctx` 是调用方的上下文，不从那里取端口。
- `registerFacility` 与 `registerProvider` 在方法里用 `this.ctx.effect` 调用登记表的同名方法。登记落在调用方插件的 fiber 上，调用方卸载即撤除（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。`registerFacility` 返回的撤除函数调用同一个效应撤除。`registerProvider` 返回的撤除函数直接调用登记表的撤除函数：它可以重试，并发调用共用一次退役；效应只在调用方 fiber 卸载时调用一次登记表的撤除函数。
- Service 子类与 `filesFacilityPlugin` 的配置只接受缺省、`null` 或空对象，其余值以「configuration accepts no fields」校验失败（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。
- 宿主文件插件的配置 `HostFilesConfig` 接受缺省、`null`、空对象，或带下列字段的对象：`drainBoundMs`（有限的非负数）、`filesRoot` 与 `stateDirectory`（绝对路径），命令的六项上界与留下的进程的四项（`residuePolicy`、`retainedPerScope`、`retainedPollMs`、`retainedOutputBytes`，见[宿主命令与终端](#宿主命令与终端)），以及 `terminal`（见[持久终端](#持久终端)）。其他字段或其他值校验失败，插件不装载。缺省时取提供者的初值。列表与搜索的上界不在配置里，见[宿主提供者的事实](#宿主提供者的事实)。
- `filesFacilityPlugin`、`commandFacilityPlugin` 与 `createHostFilesPlugin(domain)` 返回的插件，`inject` 都是服务键常量并声明 `caller: provider`。`filesFacilityPlugin` 与 `commandFacilityPlugin` 装载时经 `ctx.executionEnvironment` 登记 `files` 或 `command` 设施声明，不登记提供者。宿主文件插件装载时用工厂收到的责任域与配置登记一代新的宿主文件提供者，不登记声明。诊断经 `ctx.logger('executionEnvironment.hostFiles')` 以错误级写出。声明的生灭与宿主提供者的生灭分开：只装宿主文件插件时，需要 `files` 或 `command` 的落点解析返回 `missingFacility`。责任域是运行时对象，不进 JSON 配置。
- 本成员不读取调用方类的 intercept 配置，不按调用方类拒绝调用。
- 本成员不登记 Runtime Context 的生产者，不发布 `execution.placement` 与 `execution.host-facts` 两条块。
- 装配规则：Service `ExecutionEnvironmentRegistry` 与宿主文件插件在同一插件树里装载。宿主文件插件可以重载：卸载只退役这一代，责任域由进程宿主保管，新的一代加入同一个责任域，看到原占用与原记录。这条规则现在没有强制执行点，见[明确缺项](#明确缺项)。

### 宿主命令与终端

本节写宿主提供者承担的 `command`。平台范围（Q-9）：Linux 兑现一次性命令的处置与保留，见[一次性命令留下的进程的兑现](#一次性命令留下的进程的兑现)。Windows 按 Job 封闭收纳并兑现处置与保留，见 [Windows 的兑现](#windows-的兑现未接受)。macOS（`darwin`）有一次性命令后端与持久终端后端。macOS 的执行域是 POSIX 会话，不满足封闭收纳，所以不保留进程：主进程退出之后整个会话被停止，结局的 `residue` 只有 `none` 与 `stopping` 两种，见 [macOS 的兑现](#macos-的兑现)。macOS 上的 `files` 提供十二项操作与宿主文件根，机制见 [macOS 文件说明](docs/macos-files.md)。macOS 的机制见 [macOS 说明](docs/macos-execution.md)。普通每获取的 `terminal` 见下文[持久终端](#持久终端)。机制见[架构的宿主命令机制](docs/architecture.md#宿主命令机制)。依据是 GATE-EE 候选第 3、4 节与 [D1 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6561322330)。本节没有经过独立技术接受。

提供者与终端：

- `command` 加在已有的宿主提供者上，与 `files` 由同一个提供者声明，不另立宿主提供者。所以需要 `files` 加 `command` 的工具在宿主层不会得到 `missingFacility` 或 `ambiguousEnvironment`。
- `command.start` 的 `outputMode` 为 `terminal`，或带 `geometry` 时仍答 `rejected`，原因 `unsupported`。持久 PTY 由独立的 `terminal` 设施提供，使用已采用的 node-pty 1.1.0。
- 宿主提供者不声称任何隔离断言。命令能碰到的文件不受宿主文件根限制，也不经过[宿主文件使用](#宿主文件使用)的确认。

启动前的检查不起进程，也不调用账本。检查按下面的顺序：

1. 绑定层不是 `host_machine`，或者请求 `terminal` 模式或 `geometry`，答 `unsupported`。
2. `executable` 或 `cwd` 不是绝对路径或含空字节，参数含空字节，环境变量名为空、含 `=` 或含空字节，或者值含空字节，答 `invalidInput`。
3. 平台前提不满足，答 `unavailable`。`diagnose` 收到一条 `commandUnavailable` 诊断，写明缺少的前提项与获取键。
4. 这份获取的命令门面已经封住，答 `closed`。

所以请求本身有错时，已封住的门面也答 `unsupported` 或 `invalidInput`；平台前提缺失时，已封住的门面答 `unavailable`。次序依 GATE-EE 候选第 3.1 节。Windows 用同一个次序。

平台前提：

| 项  | 探测                                                                                                                                                                                          | 前提项名           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P1  | `process.platform` 是 `linux`                                                                                                                                                                 | `linux`            |
| P3  | 在 `PATH` 里解析 `systemd-run` 与 `systemctl` 的绝对路径，并从 `systemctl --help` 读出它支持 `--kill-whom` 还是旧名 `--kill-who`                                                              | `systemd-tools`    |
| P4  | `systemctl --user is-system-running` 输出 `running` 或 `degraded`                                                                                                                             | `user-manager`     |
| P5  | 探测单元 `omne-host-probe-<uuid>.scope` 里的探测程序看得到 cgroup v2 统一层级：它的 `/proc/self/cgroup` 有 `0::` 行，并且它的 `/proc/self/mountinfo` 里有一个 `cgroup2` 挂载包含该行的路径    | `cgroup-v2`        |
| P6  | 探测单元 `omne-host-probe-<uuid>.scope` 里的探测程序在统一层级里找到自己单元的目录，该目录的 `cgroup.procs` 列出它，它以 0 退出。之后提供者按强制停止序列停止这个单元，结果必须是 `confirmed` | `scope-round-trip` |

- P5 与 P6 在同一个探测单元里判定。统一层级的位置只取单元里的进程从内核读到的报告，不假定挂载点。systemd 的统一模式把层级挂在 `/sys/fs/cgroup`，混合模式挂在 `/sys/fs/cgroup/unified`，两种布局都可以满足 P5。当宿主只有 cgroup v1 层级，或单元里的进程看不到包含自己路径的 `cgroup2` 挂载时，P5 不满足。
- 探测按 P1、P3、P4、P5 与 P6 的次序进行。P1、P3、P4 中有一项不满足时，探测停在这一项，诊断只写这一项。P5 与 P6 的报告规则：
  - 探测程序看不到统一层级时以 3 退出，诊断写 `cgroup-v2`。
  - 以下情况诊断写 `scope-round-trip`：探测程序以 0 与 3 以外的码退出（它读不到自己的 `/proc/self/cgroup` 或 `/proc/self/mountinfo` 时以 1 退出）、被信号终止或没有在上界内退出；启动器本身起不来；读不到本机的启动身份，这时不起探测单元。
  - 强制停止没有确认时，诊断另写 `scope-round-trip`。所以一次探测可以同时写出 `cgroup-v2` 与 `scope-round-trip`。
- 提供者创建时在后台开始一次探测。第一次启动等这次探测的结果。之后只用探测时解析出的两个绝对路径。
- 满足的结果在这一代内保留。不满足或探测本身出错时，距上次探测达到 `probeRetryMs` 的下一次启动重新探测。所以修好环境不需要重启进程。
- `describe()` 的前提：探测未完成或探测本身出错为 `unknown`，任一项不满足为 `unsatisfied`，全部满足为 `satisfied`。不满足的项名只写进诊断，不进宿主事实。
  - 已知偏离：Linux 上的 `describe()` 先等这一代的命令与终端探测结束再答，所以探测进行中时不答 `unknown`。等待最多是探测四步各一个停止上界。
- 缺前提不影响落点解析与获取。同一份获取的 `files` 照常可用，只有启动答 `unavailable`。
- 真实的 Bash、GNU `env`、`stty` 与 node-pty 不是前提。`files` 的目录描述符前提（P2）不约束 `command`，命令不使用身份目录。
- 运行中 `systemd-run` 失败不改写探测结果，只影响这一次启动。

macOS 的平台前提（类型 `MacosPrerequisite`）。macOS 不做 P1、P3～P6 的探测，改核对下列项：

| 前提项名             | 核对                                                                                                     | 约束       |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `command-line-tools` | `xcode-select -p` 成功。不成功时不调用 `/usr/bin/cc`，所以没有 Command Line Tools 的宿主不弹出安装对话框 | 命令与终端 |
| `session-reader`     | 会话读取程序用 `/usr/bin/cc` 编译成功                                                                    | 命令与终端 |
| `bash`               | `/bin/bash` 可执行                                                                                       | 终端       |
| `node-pty`           | node-pty 与它的原生模块可以加载                                                                          | 终端       |
| `spawn-helper`       | node-pty 的 `spawn-helper` 可执行                                                                        | 终端       |

- 命令启动缺会话读取程序时答 `unavailable`，`commandUnavailable` 诊断写明 `command-line-tools` 或 `session-reader`。终端缺任一项时 `create` 答 `unavailable`，`terminalUnavailable` 诊断写明缺项。
- `describe()` 的前提在 macOS 上合并文件 P2、会话读取程序可用与终端前提齐全三项读数。任一项缺少为 `unsatisfied`。
- 缺工具或编译不成功的结果不保留。下一次用到会话读取程序时再试，所以装好 Command Line Tools 之后不需要重启进程。

Windows 的平台前提（未接受）。Windows 不做 P1、P3～P6 的探测，改核对下列项：

| 前提项名              | 核对                                                                            | 约束             |
| --------------------- | ------------------------------------------------------------------------------- | ---------------- |
| `windows-version`     | 64 位 Windows 10 1809 或 Windows Server 2019 及以后                             | 命令与终端       |
| `dotnet-csc`          | `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 存在，桥能编译成功  | 命令、终端与文件 |
| `job-round-trip`      | 在一个探测 Job 里起锚与一个探测进程，按名字打开 Job、读到成员数，强制停止并确认 | 命令             |
| `powershell-assembly` | 系统的 Windows PowerShell `System.Management.Automation` 3.0 程序集可以加载     | 终端             |

- 缺项时，命令启动答 `unavailable`，`commandUnavailable` 诊断写明缺项；终端缺项时 `create` 答 `unavailable`，`terminalUnavailable` 诊断写明缺项。
- 满足的结果在这一代内保留。不满足或探测出错时，距上次探测达到 `probeRetryMs` 的下一次启动重新探测。`graceMs` 用于上文 Windows 的优雅停止。

启动：

1. 资源键是新的 UUID。执行域是 systemd 用户 scope 单元 `omne-host-<资源键>.scope`，单元描述是 `omne-host <请求方作用域的摘要> <资源键>`。受管资源的引用是 `{ unit, bootId }`，`bootId` 是本机当前的启动身份。
2. 调用账本的 `plan`。`conflict`、`closed` 与 `unavailable` 原样作为拒绝原因，不起进程。
3. 用探测解析出的 `systemd-run` 在这个单元里起门进程。请求经私有管道（描述符 3）交给门，不放在命令行参数里，因为环境变量可能带秘密。
4. 门核对 `/proc/self/cgroup` 含有自己的单元，然后报就绪。启动这时调用账本的 `permit`。只有 `confirmed` 才发 GO，GO 只发一次。其余答案使启动强制停止这个单元，记入账本的 `stopped`，然后答 `rejected`（`closed` 或 `unavailable`）。门面在这时已经封住，也这样处理，答 `closed`。
5. 门收到 GO 后起命令。命令的环境只有请求给出的变量，不继承宿主的变量。标准输入写入请求的字节后关闭。标准输出与标准错误分开读。
6. 命令起来后，启动答 `done`，带 `ProcessHandle`。进程身份是 `{ id: 单元名, generation: bootId }`，不用进程号。映像没有起来（例如 `ENOENT`、`EACCES`）时，启动强制停止这个单元，答 `rejected`（`unavailable`）。门在报就绪之前退出时，同样答 `unavailable`。
7. 在 `startBoundMs` 内没有收到就绪时，启动答 `unknown`，之后不再发 GO。发出 GO 之后在上界内没有收到命令起来的消息时，也答 `unknown`。这两种情况都把资源留给释放、结清或退役去停止。

输出与结局：

- 门把两条流的字节按 `maxChunkBytes` 切块，每块编成一行 JSON 帧交给提供者。提供者限制一行的长度。超长的行、不是 JSON 的行、未知的帧、次序不对的帧、超过单块上限的字节，都使这个资源失效：`result` 答 `failed`（`effectUnknown`），提供者强制停止这个单元。失效之前已经读到并被接受的帧照常生效，即使它们与被拒的行在同一次读取里；被拒的行之后的帧不再交出。所以同一串帧不论怎样分次读到，结局都等于逐帧分别读到时的结局。
- 两条流共用一个上限为 `maxBufferedBytes` 的缓冲。新块放不下时整块丢弃，按流累加丢弃的字节数。下一个交出的块的 `observedOffset` 与上一块末尾之差就是丢弃量。
- `output` 只有一个读者。第二个迭代器的第一次 `next()` 以 `TypeError` 拒绝。读者的 `return()` 只放弃读取权，不停止进程。读者放弃之后，缓冲里的字节与之后的字节都计入丢弃。
- 门一侧：门写帧的管道写满时（写端返回 false），门暂停读命令的两条管道，`drain` 之后恢复。所以命令在提供者读得慢时被阻塞在自己的输出管道上，字节不丢，门的内存也不随输出增长。提供者总是立刻读帧，所以缓冲满时丢弃，不阻塞命令。
- 命令的主进程退出后，门等两条管道关闭，或者等输出连续 100 毫秒没有新字节，再发退出帧。命令留在后台的进程可能还占着管道，所以不能只等管道关闭。退出帧带单元里除门以外的进程数，门从单元 cgroup 的 `cgroup.procs` 读出它，读不到时写未知。
- 收到退出帧时，`result` 答 `completed`，带退出码或信号、时长、两条流的计数与处置报告 `residue`。没有收到退出帧时答 `failed`（`effectUnknown`），带观察到的时长与计数。强制停止时门与命令在同一个单元里被杀，所以强制停止的结局是 `failed`（`effectUnknown`）。
- 主进程退出之后，提供者处置这个单元：停止它，或者把它移交保留范围。处置在 `result` 交出之前完成，停止的确认不推迟 `result`。规则见下文[一次性命令留下的进程的兑现](#留下的进程的兑现)。

停止两态：

- `stop('forced')`：先 `systemctl --user kill --kill-whom=all --signal=SIGKILL <单元>`（旧版 systemd 用 `--kill-who`），再 `systemctl --user stop <单元>`。`stop` 的退出码 5（单元未加载）按已不在处理，其余失败答 `unconfirmed`。然后等门进程退出，再用 `systemctl --user show -p LoadState -p ActiveState` 读单元。`ActiveState` 为 `inactive` 或 `LoadState` 为 `not-found` 才答 `confirmed`。在 `stopBoundMs` 之内会再读，之后答 `unconfirmed`。
- `failed`、`deactivating` 与其他状态都不算停止。被信号杀掉的单元可能短暂处于 `failed`。WSL 上的用例没有观察到这个状态，这一判断只有纯函数测试。真实的 `failed` 状态未验证。
- `stop('graceful')`：门把 `SIGTERM` 发给命令的主进程，最多等 `graceMs`。命令在这段时间里退出时，接着做强制停止序列来清掉单元，答序列的结果。超时答 `unconfirmed`，不自动升级为强制停止，由调用方决定。
- 每次停止都把结果记入账本的 `stopped`。只有确认的停止已经记入账本，这个进程才离开这份获取的待停止集合。
- 停止只作用于这个进程的单元。同一份获取的另一个进程不受影响（单调用中断）。

释放、结清与退役：

- 排空一份获取时，命令门面与文件门面一起封住，然后在 `drainBoundMs` 之内等在途的启动，再强制停止这份获取里停止尚未确认的每个进程。全部确认才结清。否则答待处置，资源清单列出停止未确认的受管资源，`diagnose` 收到一条 `stopUnconfirmed` 诊断。释放中的原记录查询也列出这些资源。`maintain()` 与之后的结清再试。
- 退役对这一代的每份获取做同样的排空。所以这一代仍在运行的命令被强制停止，结局为 `failed`（`effectUnknown`）。
- 已经移交保留范围的单元不归获取。获取的排空与结清不等它，也不停止它。退役也不停止它，这一代只停止读取它的成员。
- 已知限制：配置重载会卸载宿主文件插件，从而以 `effectUnknown` 结束这一代仍在运行的命令（D1 结论第 3 条）。这些命令不交给后继的一代接管。

资源级冷恢复（不含获取的结清）：

- `listRecoveryResources(作用域)`：Windows 读状态目录里的标记，见 [Windows 的兑现](#windows-的兑现未接受)。Linux 上用 `systemctl --user show -p Id -p Description 'omne-host-*.scope'` 读本用户全部 `omne-host-*.scope` 单元的 `Id` 与 `Description`，列出描述里的作用域摘要与这个作用域相同的单元。正在停止的单元也在列表里。以下情况答 `unavailable`，不答空列表：列举命令失败；找不到 `systemctl`；输出里有一块含有不是 key=value 的行，或同一个键出现两次；有一块缺 `Id` 或 `Description`；有一块的 `Id` 不是 `omne-host-*.scope`。列表只略去格式正确、但不属于这个作用域的块：描述里的作用域摘要不同，或单元名不是 `omne-host-<uuid>.scope`（例如探测单元）。上一次启动的单元已随重启消失，所以不在列表里。列表另带保留进程索引里这个作用域的单元。索引的标记文件读不全时答 `unavailable`。macOS 的列举读冷索引，见 [macOS 的兑现](#macos-的兑现)。Linux、Windows 与 macOS 之外的平台没有命令后端，返回责任域已知的保留资源。
- Linux 的 `recover(资源)`：提供者名不是本提供者，或引用不是本提供者写下的 `{ unit, bootId }`（单元名必须是 `omne-host-<uuid>.scope`），答 `unsupported`。所以恢复不能停止别的单元。启动身份已变时答 `confirmedStopped`，证据写明单元与当前的启动身份。否则按强制停止序列停止并核对：确认时答 `confirmedStopped`，证据带单元、`LoadState` 与 `ActiveState`；未确认时答 `pending`。它不重启命令，不接回输出，也不交出原结局。资源在保留进程索引里时，由索引停止它，并在确认之后删去它的标记文件。Windows 按标记里的 Job 名、启动身份与登录会话恢复，见 [Windows 的兑现](#windows-的兑现未接受)。macOS 按冷索引里的标记恢复，见 [macOS 的兑现](#macos-的兑现)。
- 新进程对旧获取的结清仍答未知（见[宿主文件责任域](#宿主文件责任域)）。需要域外可信的进程退出证据的结清是 M2 之后的剩余责任。
- 已知限制：列举依赖单元描述。同一用户的其他进程可以伪造描述。M2 单机、同一操作者，接受这一点。

内部机制常量：下面两个数值不进配置，也不是策略。它们是门与监督者读数的内部机制，调用方没有理由改它们。

- 门在命令主进程退出后等输出安静 100 毫秒（`quietAfterExitMs`）。命令留在后台的进程可能还占着管道，只等管道关闭会无限等下去；100 毫秒内没有新字节就当输出已完整。已知限制：一个在主进程退出后隔了超过 100 毫秒才写出的后台进程，其输出落在退出帧之后，不进这次结局的计数。
- 强制停止序列在两次 `systemctl show` 读数之间等 50 毫秒（`showPollMs`）。它只决定读数的频度，上界仍是 `stopBoundMs`。

策略数值都是配置，代码里的数值只是初值。宿主文件插件的配置可以给出这十项：

| 配置                  | 初值     | 作用                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `maxBufferedBytes`    | 1 MiB    | 一个进程的输出缓冲上限，正整数                                                              |
| `maxChunkBytes`       | 64 KiB   | 门发出的单块上限，正整数，不大于缓冲上限                                                    |
| `startBoundMs`        | 10000    | 启动等就绪与命令起来的上界                                                                  |
| `graceMs`             | 5000     | 平和停止等命令退出的时间                                                                    |
| `stopBoundMs`         | 10000    | 一次强制停止序列的上界，也是探测中各条命令的上界                                            |
| `probeRetryMs`        | 60000    | 不满足的探测结果保留多久                                                                    |
| `residuePolicy`       | `retain` | `retain` 或 `stop`。`stop` 使处置一律走停止，原因 `policy`                                  |
| `retainedPerScope`    | 8        | 一个保留范围的保留进程上界，含预留与停止中的项，正整数                                      |
| `retainedPollMs`      | 1000     | 两次读保留单元成员之间的间隔，正整数                                                        |
| `retainedOutputBytes` | 65536    | 每个保留进程每条流在移交之后保存的输出字节数，非负整数；0 不保存，`output` 答 `unsupported` |

时间项必须是有限的非负数。`residuePolicy`、`retainedPerScope`、`retainedPollMs` 与 `retainedOutputBytes` 只约束一次性命令，终端的配置不接受它们。`retainedOutputBytes` 的初值依据一次测定。读一次尾部的代价随容量线性增长。每条流的保存字节占一块容量大小的缓冲，在第一个字节到达时分配，之后不随写入的块数变化。值不合法时 `createHostFilesProvider` 抛出 `RangeError`，插件配置校验失败。提供者选项另有 `filesRoot` 与 `stateDirectory` 两个字符串，插件配置要求它们是绝对路径。命令一侧只保存它们，不使用。

### 持久终端

采用范围是 #421 修订 6 的 TerminalFacility，包括普通每获取终端，以及 [R2-D37](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6579990443) 批准的 Session 保留终端。Linux 上，终端只在满足[平台前提](#宿主命令与终端)的 P1、P3～P6 时启动（终端有自己的一次探测，项目与命令的相同），另需 `/bin/bash`、`/usr/bin/mkfifo` 和可加载的 node-pty 1.1.0。前提缺少时 `create` 返回 `unavailable`，`terminalUnavailable` 诊断给出具体项。`describe` 合并这些前提与原文件、命令前提。macOS 的终端前提见[宿主命令与终端](#宿主命令与终端)的「macOS 的平台前提」，终端怎样运行见下文 [macOS 终端](#macos-终端)。

每次获取有独立的终端表。`create` 在账本 `plan` 记录后准备 scope 与 gate，在 `permit` 确认后才发送 GO 创建 shell。创建结果丢失或超时保持 `unknown`，原 scope 仍由原获取承担。引用包含随机身份与代。其他获取的引用或错误代返回 `notFound`。

一个终端只有一段运行中。同终端的重叠 `execute` 返回 `busy`，另一个终端仍可运行。普通 `cd` 留在持久 shell 中。临时 `cwd` 执行后恢复原物理目录，恢复失败使终端失效。临时环境变量在 shell 函数内局部导出，函数返回后恢复。环境变量名采用 Bash 标识符，`__omne_` 前缀留给驱动。路径、脚本与环境变量值不能含空字节。单次输入字节写进 PTY，按该终端当前的行规处理。

控制观察走独立 FIFO，带终端代与执行段身份。段的完成只看控制 FIFO 上本段的完成观察。用户 PTY 输出与静默时长都不判完成。Linux 上，本提供者这样兑现契约的[终端段的完成与字节归属](../execution-environment-contract/SPEC.md#终端段的完成与字节归属)：

- 每段开始时，gate 取一个 128 位随机数，只经命令 FIFO 交给驱动，不经 PTY 输入，所以不被回显。
- 驱动在段首、段尾用 Bash 内建 `printf` 向 `/dev/tty` 写 OSC 私有序列 `ESC ] 7770 ; omne-b|omne-e ; <随机数> BEL`。哨兵与脚本的字节共用 PTY 的一个有序缓冲。脚本重定向了 shell 的标准输出，也挡不住哨兵。
- gate 只认本段随机数的哨兵，并从输出里删去它们。段首与段尾之间的字节是段输出。哨兵可以跨两次读取，gate 暂存可能是哨兵开头的流尾。
- 交出段结果要同时有两样：本段的完成观察，以及读到本段段尾哨兵。读到暂时无数据（`EAGAIN`）不交出。
- 终端里的后台进程不使终端失效。段进行期间它们写出的字节属于这一段。
- 没有段运行时，gate 也持续读 PTY。段间字节进有界缓冲，上界是 `betweenSegmentBytes`。下一段的结局在 `OutputSummary.between` 里带上保留的字节与计数，超出上界的字节只计入丢弃数。段间字节不混入段输出。

控制格式错误、错误代、失联、哨兵顺序不可能（重复的段首、段首之前的段尾、段尾之后又有段内字节）都使结果为 `failed(effectUnknown)`，终端转为 `invalid`。不自动重放脚本或重建 shell。失效之前已经读到并被接受的帧照常生效，即使它们与失效在同一次读取里：先到的 `started` 使执行交出句柄，句柄的结果为 `failed(effectUnknown)`；先到的段内字节进入这一段的输出；先到的 `finished` 使这一段按退出码完成，之后终端才转为 `invalid`。所以同一串帧不论怎样分次读到，结局相同。输出处理 `onlcr` 不改写 OSC 序列，这一点由真实 PTY 用例确认。

已知限制：脚本可以读到本段的随机数（例如 `declare -f` 显示驱动函数），从而伪造哨兵。后果只限这个终端：字节归属错乱，或因顺序不可能而失效。随机数防的是无意的字节冲突，不防同一脚本破坏自己的终端。

node-pty 只提供 PTY fork 和原始描述符。门采用 1.1.0 的原生接口，运行时核验接口与返回形状。这一接口没有公共 TypeScript 声明，升级 node-pty 时必须复跑真实 PTY 用例。字节不经过文本解码，保留内核交出的 ANSI、CRLF 和任意非 UTF-8 字节。输出只允许一个读者，缓冲溢出与读者放弃都计入丢弃数。

`stop('forced')` 停止该终端的原 scope，不影响其他终端或命令。该 shell 随之失效，列表状态为 `invalid`，后续执行返回 `closed`。`stop('graceful')` 请求 shell 接收 SIGTERM，在 `graceMs` 内没有退出则返回 `unconfirmed`，不自动升级。关闭成功的状态为 `closed`。旧执行段的停止不能终止后续执行段。

Linux 上，停止确认仍只来自 systemd 原 scope 的监督读数。调用 `node-pty.kill`、取得进程集合或控制回执都不等于停止。确认且原账本已记录 `stopped` 后，资源才离开待清理集合。原获取的释放、结清与提供者退役同时封终端门面，等待在途创建和执行接纳，再停止原 scope。未确认资源留在待处置结果。

Linux 上，资源级冷恢复复用命令的 `{ unit, bootId }` 坐标与作用域描述。新进程只枚举、停止和结清原 scope，不执行旧脚本，不恢复交互 shell。监督者确认停止后尝试清除 gate 的两个私有 FIFO。清理不会递归遍历用户目录。

提供者选项 `terminal` 与插件配置 `terminal` 同形。命令已有的六个界值也适用于终端，初值相同。另有 `maxControlBytes`，初值 1 MiB，约束控制帧大小；`betweenSegmentBytes`，初值 256 KiB，是段间字节缓冲的上界；`columns` 与 `rows` 的初值为 80 和 24。请求的 `geometry` 覆盖尺寸初值。控制上界必须容纳一块 base64 输出及 256 字节帧头。所有数值为可覆盖的实现配置，不是工具结果的产品上限。

本实现是有权限的 `host_machine`，不承诺同 UID 恶意程序隔离。Bash 驱动与 scope 观察的真实覆盖见[终端测试](tests/host-terminal-recovery.spec.ts)。段的字节归属在真实 PTY 上的覆盖见[段测试](tests/host-terminal-segments.spec.ts)，哨兵扫描的快层覆盖见 [terminal-sentinels.spec.ts](tests/terminal-sentinels.spec.ts)。段测试不能区分「读到 `EAGAIN` 即交出」：驱动先向 PTY 写段尾哨兵，再向 FIFO 写完成观察，本机上交出时段尾哨兵总已可读。这条规则的反例由形式模型的负控 N7 给出。Windows 的协议测试通过不能证明此 Linux 路径。

#### macOS 终端

macOS 上，上文的 scope 指终端的执行域。执行域是两个 POSIX 会话：gate 的会话与 shell 的会话。

- 提供者以 `detached: true` 起 gate，所以 gate 调用 setsid，领一个新会话。node-pty 经 `spawn-helper` 以 `POSIX_SPAWN_SETSID` 起 shell，所以 shell 领第二个会话。
- gate 在报就绪之前核对自己领着自己的会话。提供者核对 gate 的身份之后，在发 GO 之前把 gate 的会话写进冷索引的标记。shell 起来之后，提供者把 shell 的会话也写进同一个标记。
- `spawn-helper` 的路径取自 node-pty 自己的 `loadNativeModule`。两个 FIFO 在 `$TMPDIR/omne-terminal-<资源键>.terminal` 里，用 `mkfifo -m 600` 创建。
- Linux 的 Bash 驱动与分段源码不改动，在系统的 `/bin/bash` 3.2.57 上运行。所以上文段的完成与字节归属的规则在 macOS 上同样兑现，由真实 PTY 用例确认。
- 停止与 `close` 停止两个会话。两个会话都空时才答 `confirmed`。确认之后删去 FIFO 目录与标记。
- 提供者走掉时（GO 之后 gate 的控制通道结束），gate 停止两个会话，然后退出。
- Session 保留终端在 macOS 上照常可用。
- 段的停止与冷恢复的规则见 [macOS 的兑现](#macos-的兑现)。

`host-terminal.ts` 接受可注入的 `TerminalPlatform`。没有注入时，它是不变的 Linux scope 实现。macOS 注入的实现在 `src/macos-execution/terminals.ts`。

#### Windows 终端（未接受）

状态：未接受。Windows 的终端是嵌在 ConPTY 子进程里的 Windows PowerShell 5.1 Runspace。机制见 [Windows 命令与终端说明](docs/windows-execution.md#persistent-terminals)。

调用的退出码。每次调用结束时，宿主按下面的规则给出已知的退出码：

1. 调用开始之前，宿主把 `$global:LASTEXITCODE` 置空，并记下 `$Error` 的长度。
2. 脚本执行了 `exit N` 时，退出码是 N。
3. 否则，脚本结束时 `$?` 为真，退出码是 0。
4. 否则，如果这次调用新增的错误记录全部来自原生程序的标准错误（`NativeCommandError`），并且 `$LASTEXITCODE` 是 0，退出码是 0。Windows PowerShell 5.1 在 `2>&1` 合并原生程序的标准错误时会把 `$?` 置为假，这一条防止把成功的原生程序判为失败。
5. 否则，如果 `$LASTEXITCODE` 在这次调用里被设为非 0，退出码是这个值。
6. 否则（包括终止错误），退出码是 1。

- 除第 4 条之外，成功与失败的判定与 PowerShell 官方的 `-Command` 规则相同。第 4 条修正 Windows PowerShell 5.1 把成功的原生程序判为失败的情况。第 5 条在失败时带出原生程序的码，与 Bash 一致。
- 已知限制：同一次调用里，一个原生程序以非 0 退出之后，又有一个 cmdlet 失败时，退出码是那个原生程序的码。这次调用仍然判为失败。
- 已知限制：上一次调用留下的 `$LASTEXITCODE` 在这次调用开始时已经被置空。
- 失败的原因在调用的输出里：错误流与警告流经 `Out-Default` 写到控制台。结局只带退出码。
- `exit N` 结束持久 shell。这次调用以 N 完成，之后终端失效，后续调用答 `unavailable`。宿主实现 `PSHost.SetShouldExit` 记下 N，不调用 `Environment.Exit`。
- 运行中被强制停止，或控制通道丢失时，结局为 `failed(effectUnknown)`。

字节归属：

- 系统自带的 ConPTY 会重新渲染子进程的输出，未知的 OSC 序列与渲染出的文本没有先后保证。所以 Linux 的哨兵规则在系统 ConPTY 上不成立。
- Windows 终端随包使用 Windows Terminal 1.22 或以后版本的 `conpty.dll`，并且它通过保序验证时，按 Linux 的哨兵规则归属字节，段间字节进 `OutputSummary.between`。这时 `conpty.dll` 是终端的前提。
- 否则，Windows 终端按观察窗口归属字节，这是声明的差异，规则与限制见 [Windows 命令与终端说明](docs/windows-execution.md#persistent-terminals)。

上限：终端数、窗口数、保留的输出字节数与排队的块数由 `terminal` 配置给出。代码里的 64 个终端、256 个窗口、64 MiB 与 65536 块只是初值。

失效：失效终端的引用答 `unavailable`。

终端不加锚进程。终端的 Job 由 ConPTY 的宿主进程持有，宿主进程退出时终端失效，与 Linux 的门进程退出时相同。Session 保留终端的跨获取附着不在 WindowsCustody 模型的范围内。

#### Session 保留终端

`create({ retain: 'session' })` 要求获取时已经给出真实的 retention scope、独立 retention ledger 与封闭信号。缺绑定时答 `unsupported`，不使用普通获取账本替代。可信 Session 绑定与耐久账本由装配方供给，本成员不合成这些事实。

责任域保存保留索引。索引区分租户、完整保留范围、配额域、提供者名称/代/版本与宿主进程实例。创建在首个异步之前保留恢复坐标和容量。Linux 在 retention ledger 的 plan/permit 确认后才启动 scope gate，启动准备、GO 及完成后都复核封闭状态。零附着、启动未知和停止未确认的资源继续可枚举。`terminal.retainedCapacity` 显式配置该责任域的保留容量，初值 64，必须是正安全整数。未确认的预留仍占容量，满额答 `busy`。

创建获取自动附着。两平台的提供者通过可选 `retention` 扩展提供 `attach` 和 `detach`，不改变终端原四操作集合。另一次获取通过 `retention.attach` 使用同一 shell，逐次操作仍经登记表当前授权与原 origin 门。附着不授予后续许可。普通终端继续只归原获取。跨范围、跨环境代和错误终端代统一答 `notFound`。`retention.detach` 永久封闭当前获取与该终端的关系，重复 attach 答 `closed`。列表只包含当前获取创建或仍附着的终端。

同一保留终端一次只接纳一段执行。占位发生在首个 await 前，竞争答 `busy`。每段用当前获取账本 plan/permit，在许可前不发送脚本。段完成后的 stopped 记账失败仍是当前获取的清理责任。detach 与获取释放只收尾自己的段，不能停止别的获取的段。强停需要结束 shell 时保留其 invalid 状态，不重建 shell。

获取释放永久封住原门面，并解除本获取附着。空闲保留 shell 继续由 retention ledger 持有。scope 回收与提供者退役封住整个终端并停止所有所属资源。监督停止与 stopped 记账均确认后才移除待处置责任；否则资源继续枚举，返回 pending。跨进程恢复只停止原资源，不恢复附着、输出或执行权。

共享索引与交错验证见 [host-terminal-retention.spec.ts](tests/host-terminal-retention.spec.ts)。Linux 真件验证见 [host-terminal-recovery.spec.ts](tests/host-terminal-recovery.spec.ts)。两种证据分别报告，Windows 平台接口接线不代表真实 ConPTY 已验证。

<a id="留下的进程的兑现"></a>

### 一次性命令留下的进程的兑现

本节是宿主提供者在 Linux 上对契约[一次性命令留下的进程](../execution-environment-contract/SPEC.md#一次性命令留下的进程)的兑现，实现由 [#1137](https://github.com/nemori-ai/omne-harness-lite/issues/1137) 交付。macOS 只兑现处置的停止一侧，不保留进程，见 [macOS 的兑现](#macos-的兑现)。本提供者实现保留进程扩展的 `list`、`stop` 与 `output`，以及提供者一侧的保留进程观察。契约的[终端段的完成与字节归属](../execution-environment-contract/SPEC.md#终端段的完成与字节归属)见[持久终端](#持久终端)。

本节的采用依据是 #1137 卡正文的「总体设计」，未经技术接受。目标：调用方与人一样能让自己起的进程活下去，同时每个活着的进程都恰好有一个归属方，能被列出，能被确认停止，宿主崩溃后能被找回。

收纳：Linux 上，一次性命令的执行域是它的 systemd 用户 scope 单元。命令的子进程继承单元的 cgroup，`setsid` 与双重 fork 不能使进程离开单元，所以本提供者满足契约的封闭收纳，命令设施声明 `containment: 'sealed'`。慢层用例 [host-containment.spec.ts](tests/host-containment.spec.ts) 在真实单元里核对这一点，命令与终端各一份。

门在退出帧之后：

- 门留在单元里，继续读命令的两条管道，从不暂停它们。留下的进程因此不会阻塞在管道上，也不会因管道关闭而收到 `SIGPIPE`。
- 帧通道可写时，门把读出的字节照常编成数据帧交给提供者。帧通道写满时，门丢弃读出的字节并按流累计；通道恢复可写后，先发一条丢弃帧报告累计的字节数，再发后面的数据帧。门的内存因此不随输出增长。管理者断开之后，门丢弃全部字节。
- 单元被停止时，门与单元里的其他进程一起被杀。提供者进程意外退出时，门照常留在单元里，单元由冷恢复处理。

移交之后的输出（契约[输出](../execution-environment-contract/SPEC.md#输出)）：

- 移交提交之后，提供者不关闭与门的帧通道，把之后的数据帧与丢弃帧交给索引里这一项的尾部。每条流一个尾部：一块容量大小的环形缓冲，容量是配置 `retainedOutputBytes`，在这条流的第一个字节到达时分配；配成 0 时不保存输出，`output` 答 `unsupported`。
- 退出帧之后，提供者照常读帧：帧的次序是就绪、启动或启动失败、数据、一个退出帧，之后只能有数据帧与丢弃帧（`{"t":"x","s":流,"n":字节数}`，`n` 是正整数）。退出帧之前的丢弃帧、启动失败之后的数据帧都是故障。
- `savedFrom` 是移交时这条流已经观察到的字节数，含退出帧之前的输出与退出帧之后、提交之前到达的字节；后者只计数，不保存。尾部按字节保留最新的内容。丢弃帧使尾部从缺口之后重新开始，所以 `data` 总是连续的字节。
- 读输出时把已保存的字节复制一次并按 UTF-8 解码，代价与容量成正比；`text.replaced` 用严格解码判断，源字节里原有的替换字符不算替换。
- 移交之后帧流故障（非 JSON、未知帧、次序不对、超长）或帧通道关闭时，提供者不再观察这条流，尾部关闭：`output` 答 `rejected/unavailable`，与重启后加载的项相同，直到这一项离开索引（之后答 `rejected/notFound`）。门在退出帧之前故障的处理不变：结局 `failed`（`effectUnknown`），执行域被强制停止，此时还没有尾部。
- 停止已确认或自行结清后，这一项离开索引，尾部随之释放。

处置的次序（`src/command-custody.ts` 的 `decideDisposition`；保管状态怎样随处置转移在 `src/command-custody-steps.ts`。两者 Linux 与 Windows 共用）。前一项成立时，后面的不再判定：

1. 退出帧报告门以外没有进程：停止单元，`residue` 是 `none`。读数未知时按有留下的进程处理。
2. 配置 `residuePolicy` 是 `stop`：停止，原因 `policy`。
3. 获取没有保留进程账本视图（`retention.processes`）：停止，原因 `unbound`。
4. 获取的保留范围与请求方的作用域不同，或提供者没有状态目录：停止，原因 `policy`。本提供者只把执行域移交给发起请求的作用域。
5. 保留范围已封闭，获取已释放，或这个进程已被要求停止：停止，原因 `closed`。
6. 在保留进程索引里同步占一个名额。满额时停止，原因 `capacity`。索引的标记文件还没有读全，或者在处置期限内读不完时，停止，原因 `policy`。
7. 保留进程账本 `plan`。答 `closed` 时作废预留，原因 `closed`。其余不是 `recorded` 的答案（含抛出与超时），作废预留，原因 `unbound`。
8. 再判定第 5 项。成立时作废预留，原因 `closed`。
9. 保留进程账本 `adopt`，按下一段处理答案。

读标记文件、`plan` 与 `adopt` 共用一个等待上界 `startBoundMs`，从收到退出帧算起。

`adopt` 的答案：

- `confirmed`，并且第 5 项仍不成立：复核与归属改变在同一个同步步骤里完成，执行域同时离开本次获取的待停止集合。提供者给门发 `retain`，关闭控制通道，把帧通道交给这一项的尾部（见上文「移交之后的输出」），然后在索引里写标记文件。`residue` 是 `retained`，带保留进程引用与退出帧报告的进程数。引用的 `id` 是资源键，`generation` 是移交时生成的随机身份。
- `confirmed`，但等待期间第 5 项成立了：执行域归保留范围，提供者立即停止它。确认停止之前，它作为停止中的项留在索引里，占名额，`list` 把它列为停止中。停止只记一次，记入保留进程账本。`residue` 是 `stopping`，原因 `closed`。
- `closed`：作废预留，停止，原因 `closed`。
- 抛出、超时或其他答案：`residue` 是 `unknown`，预留保留，归属记为未知。之后这个进程的停止与获取的排空，先用同一个键再问 `adopt`。同一进程上进行中的再问只有一个，并发的停止与排空并入它，移交不会提交两次。答 `confirmed` 时执行域归保留范围，答 `closed` 时停止。查清之前不停止这个执行域：句柄的停止答 `unconfirmed`，排空答待处置。

停止的记账去当前承担责任的账本：提交之前是获取账本，提交之后是保留进程账本。归属未知时不记账。

移交之后，原句柄的 `stop` 不作用于执行域，不记账，答 `unconfirmed`。依据是契约「设施协议」：普通进程的停止只作用于本次获取创建的对象。执行域已不归本次获取，本次获取无从确认它已停，所以不答 `confirmed`。归属改变之前已经发出的停止照旧打断移交，执行域按上面第二种答案停止。要停止保留进程，用保留进程扩展的 `stop` 或保留范围的封闭。获取的排空同样只停仍归本次获取的执行域。

保留进程索引（`src/host-retained-processes.ts`）：

- 一个状态目录一个索引，同一状态目录的各代提供者共用它。没有状态目录时不保留。
- 标记文件是 `<stateDirectory>/retained-processes/<资源键>.json`。它记下保留范围的摘要、租户、单元、启动身份、原调用、移交时间与门的进程号。写法是先写临时文件并刷盘，再改名，再刷盘目录。标记文件在 `adopt` 确认之后写，运行中与停止中的移交都写。它一直留到这一项离开索引（停止确认并记账）才删。在这之后才落地的写入会自己删掉。
- 名额按保留范围计数，预留与停止中的项都占名额，上界是 `retainedPerScope`。满额不驱逐已保留的项。
- 变空检测：每 `retainedPollMs` 读一次每个保留单元的成员。先读已知目录下的 `cgroup.procs`。读不到时用 `systemctl --user show -p ControlGroup` 取单元的 cgroup 路径，在本进程看到的统一层级挂载下换算成目录，再读 `cgroup.procs`。成员计数按进程号除去门。不用 `TasksCurrent`，因为它数的是线程，而门是带线程池的 Node 进程。
- 门以外没有进程，或者监督者报告单元已不活动时，索引停止单元，在保留进程账本记 `stopped`，确认并记账之后删去标记文件。读不到成员时不当作空，下一次再读。
- 只有在有提供者代加入、索引里有项时才读。退役的代退出读取，不停止保留进程。
- `list`：先读全标记文件，读不全时答 `unavailable`。只列请求的保留范围与租户的项，不列预留。进程数是这次现读的读数，读不到时为「未知」。
- 观察（契约[按保留范围观察](../execution-environment-contract/SPEC.md#按保留范围观察)）：提供者的 `retainedProcesses(保留范围, 租户)` 答索引的 `list`，规则同上一条。没有索引（不是 Linux，或者没有状态目录）时答空表。退役的代照样答索引的读数：索引随状态目录留存，退役只停止这一代的轮询，不停止保留进程，所以全部代退役之后，索引里仍有的项照常列出（标记读不出时答 `unavailable`），不答空表。同一状态目录的两代同时在册时，两代列出同一批保留进程，登记表合并时按引用去重。
- `stop`（契约[停止](../execution-environment-contract/SPEC.md#停止)）：
  - 先核载荷形状：`process` 是对象，`id` 与 `generation` 是非空字符串；`mode` 是 `graceful` 或 `forced`。不成立时答 `rejected/invalidInput`，不碰索引。
  - 命令设施封闭之后答 `rejected/closed`。
  - 先读全标记文件。读不全时答 `rejected/unavailable`，不问账本。
  - 索引里有这一项，并且保留范围、租户、引用的 `id` 与 `generation` 都相同、不是预留时，停止它的单元。
  - 停止记在移交那次获取给出的保留进程账本视图上。重启后加载回来的项还没有视图，停止记入这次调用给出的视图。
  - 同一项上进行中的停止只有一个，重复的 `stop` 并入它。
  - `mode` 的两态都走上文 `stop('forced')` 的强制停止序列（偏离见下文）。
  - 索引里没有四项都相同的项时，问这次调用给出的账本视图的 `ended(id)`：`confirmed` 答 `confirmed`，`none` 答 `rejected/notFound`，没有 `ended`、抛出或答 `unavailable` 答 `rejected/unavailable`。
- `output`（契约[输出](../execution-environment-contract/SPEC.md#输出)）：
  - 先核载荷形状：`process` 同 `stop`；`from`（有时）是对象，键只能是 `stdout`、`stderr`、`terminal`，值是非负安全整数。不成立时答 `rejected/invalidInput`，不碰索引。
  - 命令设施封闭之后答 `rejected/closed`。
  - 先读全标记文件。读不全时答 `rejected/unavailable`。
  - 按 `stop` 的四项匹配找这一项。索引里没有匹配的项时答 `rejected/notFound`，已经离开索引的保留进程也是这样。
  - 重启后加载回来的项没有尾部，答 `rejected/unavailable`。尾部已关闭（移交之后帧流故障或帧通道关闭，见上文「移交之后的输出」）时也答 `rejected/unavailable`。
  - `retainedOutputBytes` 为 0 时答 `unsupported`。
  - 移交时已经作为停止中的项进入索引的保留进程没有尾部，也答 `unsupported`。
  - 其余情况读这一项的尾部，见上文「移交之后的输出」。
- 封闭：保留范围的释放信号或保留进程账本的 `closed` 信号触发封闭，索引停止这个范围的全部保留进程。确认并记账的项删去标记文件。未确认的项留在索引里，`maintain()` 再试。
- 提供者重启之后，第一次用到索引时读全部标记文件。启动身份不同、单元已不在、格式不是本版本的标记文件被删去，并发出 `retainedMarker` 诊断（`discarded`）。有一个标记文件读不出时，这次加载不完整：预留答不可用，`list` 与冷恢复的列举答 `unavailable`，下一次用到时再加载。
- 标记文件写不成时，执行域仍归保留范围，并发出 `retainedMarker` 诊断（`notWritten`）。只要这一项还在索引里，不论运行中还是停止中，`maintain()` 每次都重写它，写成之后不再重写。确认停止之后标记文件删不掉时，诊断是 `notRemoved`。

Windows 按 Job 封闭收纳，处置与保留的规则见 [Windows 的兑现](#windows-的兑现未接受)。

macOS 按 POSIX 会话收纳。进程可以用 `setsid` 离开会话，所以 macOS 不满足封闭收纳，不提供保留进程。主进程退出之后，提供者停止整个会话，见 [macOS 的兑现](#macos-的兑现)。

已知偏离，每条带收敛条件，或写明接受为本期范围：

- 只移交给请求方自己的作用域。保留范围与请求方作用域不同的获取，处置原因是 `policy`，不是契约所列的任何一项不成立。接受为本期范围。收敛条件：出现保留范围与请求方作用域不同的装配时，扩展处置与冷恢复按保留范围列出。
- 契约的原因里没有「不可用」一类。标记文件读不全时，本提供者用 `policy`。`plan` 答 `unavailable` 或超时时用 `unbound`。收敛条件：契约的原因集合加入「不可用」一类之后，这两处映射改用该类。
- 标记窗口：`adopt` 确认之后、标记文件写完之前提供者崩溃时，重启后的索引里没有这个单元。契约把它记为[保留进程的恢复](../execution-environment-contract/SPEC.md#保留进程的恢复)的已知限制，本条引用它。本提供者的现状：冷恢复的列举仍按单元描述列出这个单元，但它不被列为保留进程，也不自行结清，只有该作用域的冷恢复会停止它。标记文件写不成、`maintain()` 还没有重写成功时也是这样。重启之后，对它的 `stop` 答 `rejected/notFound`，与契约[停止](../execution-environment-contract/SPEC.md#停止)第 3、7 项不符：索引里没有它，账本里也没有它的收场事实，`ended` 答 `none`。`output` 也答 `rejected/notFound`。收敛条件：保留进程账本端口提供读取之后，加载时用账本补全索引。
- 标记文件不记停止意图。停止还没有确认时提供者崩溃，重启后这一项按运行中加载：列出、占名额，直到它变空、被再次停止或保留范围再次封闭。显式 `stop` 的调用方按契约[停止](../execution-environment-contract/SPEC.md#停止)第 8 项用原身份再问，会重新发出停止。收敛条件：需要崩溃后自动续停时（例如会话归档的作用域释放接上之后，见 [harness-server 的 `releaseScope` 接线](../../../apps/harness-server/SPEC.md#releasescope-wiring)），把停止意图写进标记文件。
- 提供者重启之后，加载的保留进程要等有获取给出该范围的保留进程账本视图才有账本可记。集成方接受同一保留范围任一视图为已移交的键记 `stopped`，所以任一获取给出该范围的视图之后，自行结清、封闭与显式停止都记在该范围最近给出的视图上。偏离只剩还没有任何获取给出该范围视图的窗口：这段时间里它们自行结清时，索引删去标记文件，但没有记 `stopped`。没有记 `stopped` 的项自行结清之后，对它的 `stop` 答 `rejected/notFound`，与契约[停止](../execution-environment-contract/SPEC.md#停止)第 3、7 项不符：索引里没有它，账本里也没有它的收场事实，`ended` 答 `none`。`output` 也答 `rejected/notFound`。收敛条件：同标记窗口一条，保留进程账本端口提供读取之后，加载时用账本补全索引。
- 保留进程扩展的 `stop('graceful')` 与 `stop('forced')` 相同，都是强制停止序列。句柄的优雅停止把 `SIGTERM` 发给主进程，而保留进程的主进程已经退出。给单元里全部进程发 `SIGTERM` 再等，超时后要保持停止中而不自动升级，这与索引的维护循环（停止中的项会被再次停止）冲突。收敛条件：需要优雅停止保留进程时（例如后台任务要让服务自行收尾），监督者加「`SIGTERM` 后等宽限期」一步，索引为超时的项记下不升级。
- 收场事实按键记：项离开索引之后，`stop` 只凭 `id` 问账本，所以 `id` 相同、`generation` 不同的引用也答 `confirmed`。资源键在一次移交里唯一，这个答复不披露别的保留进程。接受为本期范围。收敛条件：账本的收场事实带上代之后，`ended` 按引用回答。
- 移交之后的输出尾部只在提供者进程的内存里。提供者进程重启后，加载回来的保留进程没有尾部，`output` 答 `unavailable`；移交之后帧流故障或帧通道关闭时尾部关闭，`output` 同样答 `unavailable`，不恢复读取；门在管理者断开后继续排空管道并丢弃字节。收敛条件：需要跨重启或跨故障读输出时，尾部移进门进程或写入状态目录。
- 尾部的内存是确定的：每条流一块容量大小的缓冲，在第一个字节到达时分配；上界是容量乘以流数再乘以存活的保留进程数。每个保留范围最多 `retainedPerScope` 个，但保留范围的个数不设上限；应用没有接 `releaseScope` 时，保留进程不随会话结束而停止，这个上界随会话数增长。收敛条件：同 `releaseScope` 接线一条。
- 保留进程索引的配置（`retainedPerScope`、`retainedPollMs`）、监督者与诊断去向，取自第一次建立该状态目录索引的那一代提供者。配置重载不改变它们，直到该状态目录的各代都退役。收敛条件：需要重载这几项时，索引按代登记它们，取最近加入的一代。
- macOS 的偏离。收敛条件尚未确定，归 #1137 的负责人：
  - 调用 `setsid` 的进程离开执行域。它不被停止，也不被列出，终端的 `close` 仍答 `confirmed`。`tests/macos-execution/terminals.spec.ts` 的用例「known deviation」断言这一点。
  - Shell 工具的帮助文本说留下的进程被保留，这在 macOS 上不成立。模型看到的是 `residue=stopping reason=uncontained`、`retained_processes=unavailable` 与 `process_containment=none`。
  - 提供者死去时，门停止自己的会话。所以提供者死去之后，命令不继续运行。
  - 提供者与门在 GO 之后、终端的 shell 会话记入标记之前一起死去时，标记里没有 shell 的会话，冷恢复不停止它。
  - 读到一个成员与向它发信号之间，进程号在理论上可以被重用。这个窗口很窄，与按进程号 `kill` 的窗口同类。
- Windows 终端的字节归属见 [Windows 终端](#windows-终端未接受)：系统 ConPTY 上按观察窗口归属，结局不带 `between`。收敛条件：随包的 `conpty.dll` 通过保序验证。

预期行为：句柄已确认停止之后再调用 `stop`，提供者再发一次停止，并再记一条 `confirmed`。集成方按已确认保持原事实，不改变结论。

这些偏离的负责人是本成员 `execution-environment-host-local` 的拥有者。

#### macOS 的兑现

本节写宿主提供者在 macOS（`darwin`）上的一次性命令与终端的执行域。实现由 #1137 交付，代码在 `src/macos-execution/`。采用依据同本节首段，未经技术接受。机制与平台实验见 [macOS 说明](docs/macos-execution.md)。

收纳：

- 一次性命令的执行域是它的门领的 POSIX 会话。提供者以 `detached: true` 起门，所以门调用 setsid，领一个新会话。终端的执行域见 [macOS 终端](#macos-终端)。
- 进程可以用 `setsid` 离开会话，所以 macOS 不满足契约的封闭收纳（形式映射的前提 P4，原语 Π1）。命令设施声明 `containment: 'none'`，没有 `retention` 扩展，登记表也不给保留扩展。

会话读取程序：

- 会话读取程序是一个 C 程序，只用公开接口：`proc_listpids`（全部进程号与 `PROC_PPID_ONLY`）、`getsid`、`getpgid`、`kill`、`killpg`，以及带 `PROC_PIDT_SHORTBSDINFO` 与 `PROC_PIDTBSDINFO` 的 `proc_pidinfo`。源码在 `src/macos-execution/native-source.ts`。
- 提供者在运行时用 `/usr/bin/cc` 把它编译到 `$TMPDIR/omne-macos-execution/<源码的 sha256>/omne-session`。Windows 后端的 bridge 用同样的做法。编译之前先运行 `xcode-select -p`，所以没有 Command Line Tools 的宿主不弹出安装对话框。缺工具时前提项是 `command-line-tools`，编译失败时是 `session-reader`。
- 子命令是 `members`、`identity`、`children` 与 `stop`。读取程序从不把自己算作成员。僵尸进程不是成员。读取失败、超时或输出读不懂时，提供者按未知处理，不按空处理。
- macOS 的 `pgrep` 没有 `-s`，`ps` 的 `sess` 列显示 0，所以系统自带的工具读不出会话成员。

门：

- 门的环境只有 `PATH=/usr/bin:/bin:/usr/sbin:/sbin`。所以提供者的环境变量（包括其中的秘密）不进入门的会话。命令的环境只有请求给出的变量。
- 门的协议与 Linux 的门相同，命令门复用 `command-gate-core.ts`，终端门复用 `terminal-gate-core.ts`。
- 门在读第一条控制行之前核对自己领着自己的会话。
- 命令的主进程退出时，门用读取程序读会话里除门以外的成员数，写进退出帧。
- GO 之后控制通道结束时，提供者已经走掉。门停止自己会话里的其他全部成员，然后退出。终端的门停止两个会话。

启动：

1. 账本 `plan`。资源引用是 `{ macosDomain, bootId, scope }`：`macosDomain` 是资源键，`bootId` 是 `kern.bootsessionuuid`，`scope` 是请求方作用域。
2. 提供者起门，门报就绪。
3. 提供者用读取程序核对门的身份：门活着，并且它的会话号等于它的进程号。不成立时停止门，答 `unavailable`。
4. 有状态目录时，提供者在冷索引里写这个执行域的标记，记下门的会话号与会话首进程的启动时间。写不成时停止门，答 `unavailable`。
5. 账本 `permit`。只有 `confirmed` 才发 GO。其余答案使启动停止执行域并记入账本，然后答 `rejected`。
6. 门收到 GO 后起命令。命令起来时启动答 `done`。映像没有起来时答 `unavailable`。

处置：主进程退出后，`residue` 按下面的次序判定。前一项成立时，后面的不再判定。不论哪一种，提供者都停止整个会话。停止的确认不推迟 `result`。

1. 会话里除门以外没有成员：`none`。成员数读不出时按有留下的进程处理，不按空处理。
2. 配置 `residuePolicy` 是 `stop`：`stopping`，原因 `policy`。
3. 获取没有保留进程账本视图：`stopping`，原因 `unbound`。
4. 获取的保留范围与请求方的作用域不同：`stopping`，原因 `policy`。
5. 保留范围已封闭，获取已释放这个执行域，或这个执行域已被要求停止：`stopping`，原因 `closed`。
6. 以上都不成立：`stopping`，原因 `uncontained`。

停止与确认：

- 强制停止向每个成员的进程组与每个成员发 `SIGKILL`，然后再读。连续两次读到空时答 `confirmed`。到 `stopBoundMs` 时答 `unconfirmed`。
- 平和停止经门向命令的主进程发 `SIGTERM`，最多等 `graceMs`。主进程在这段时间里退出时，接着做强制停止并答它的结果。超时答 `unconfirmed`，不自动升级。
- 停止一个记下的执行域之前，提供者核对每个会话首进程的身份。首进程号活着而启动时间不同时，这个进程号已被重用，跳过这个会话。首进程已不在时，仍带这个会话号的成员属于这个执行域。
- 启动身份是 `kern.bootsessionuuid`。标记的启动身份与当前的不同时，执行域按已停止处理。
- 每次停止都记入账本。确认的停止记入账本之后，提供者删去标记。

冷索引：

- 每个执行域一个标记，路径是 `<stateDirectory>/macos-domains/<资源键>.json`。标记在门就绪、身份核对之后，GO 之前写。终端的标记在 shell 起来之后带上 shell 的会话重写一次。
- 列举要么完整，要么答 `unavailable`。有一个标记读不出时答 `unavailable`。没有状态目录时答 `unavailable`，不答空列表。
- `recover(资源)`：提供者名不是本提供者，或引用不是 macOS 执行域的引用时答 `unsupported`。标记的启动身份不是当前的时答 `confirmedStopped`，并删去标记。没有标记时答 `confirmedStopped`：这个执行域没有发过 GO，或者已经被停止。标记读不出时答 `pending`。其余情况停止标记里的会话，确认时删去标记并答 `confirmedStopped`，否则答 `pending`。

#### Windows 的兑现（未接受）

状态：未接受。Windows 的执行域是 Job Object。机制见 [Windows 命令与终端说明](docs/windows-execution.md)。形式模型见 [WindowsCustody](verification/models/README.md#windowscustody)。

收纳：

- 每个命令有自己的 Job。成员在创建时就进入 Job（`PROC_THREAD_ATTRIBUTE_JOB_LIST`），Job 不允许 breakaway，并设置 `KILL_ON_JOB_CLOSE`。
- 每个 Job 里有一个锚进程。桥用同一个原生可执行文件以锚模式在 Job 里第一个启动它。锚打开本 Job 的句柄后只等待，不读写任何数据。所以 Job 与它的名字只随停止而结束，不随桥进程或 harness 进程的退出而结束。
- 命令设施声明 `containment: 'sealed'`。
- 「执行域里没有其他进程」的判定不计锚，也不计 Windows 为控制台成员在 Job 里启动的控制台宿主（`conhost.exe`）：控制台宿主随它服务的最后一个进程结束。锚以 `DETACHED_PROCESS` 启动，没有控制台。停止的确认要求活动进程数（含锚）为 0。

启动的次序：

1. 账本 `plan`。
2. 有状态目录时，在冷索引里写这个资源的标记并刷盘。没有状态目录时不写标记，命令照常运行，冷恢复的列举答 `unavailable`。标记记下资源、请求方作用域、启动身份与登录会话号；Job 名由资源引用给出。启动身份是系统的启动时刻（`NtQuerySystemInformation` 的 `SystemTimeOfDayInformation`），会话号来自 `ProcessIdToSessionId`。
3. 桥创建 Job，启动锚，再以挂起状态创建用户进程。
4. 桥报就绪之后，调用账本的 `permit`。只有 `confirmed` 才发 GO。其余答案使提供者先终止 Job 并确认停止，再记 `stopped`，然后答 `rejected`。

主进程退出之后的处置：

- 桥不自己终止 Job。它报告主进程的退出码与除锚以外的成员数，处置由提供者决定。
- 没有其他成员时，提供者停止 Job（含锚）并确认，结局的 `residue` 是 `none`。
- 可以保留时（规则与 Linux 相同：策略、`retainedPerScope` 与保留范围未封闭），提供者把 Job 交给保留进程索引，索引写下它自己的标记，`residue` 是 `retained`。索引的标记写成之后，提供者删去这个 Job 的冷索引标记；写不成时冷索引标记留下，重启之后的提供者仍能找到这个 Job。移交不清除 `KILL_ON_JOB_CLOSE`。
- 不能保留时，提供者停止 Job 并确认，`residue` 是 `stopping`，带原因。读不到成员数时，按有留下的进程处理，不按空处理。
- 处置确认之后（停止已确认并记入账本，或移交已提交），这个资源离开获取的待停止集合。停止确认之后桥退出；移交之后桥继续排空管道，见下面的「桥与保留」。

桥与保留：

- 桥进程退出（提供者读到控制管道关闭）时，提供者立即按 Job 名强制停止这个命令。已经移交的 Job 不受影响，因为锚仍持有它。
- 提供者进程意外退出时，桥是独立进程，仍持有 Job，命令继续运行，由冷恢复处理。这与 Linux 的门留在单元里相同。
- 移交之后，桥继续读成员的输出管道，把尾部交给保留进程索引（`retainedOutputBytes`）。桥退出时，这个保留进程的 `output` 答 `rejected`，原因 `unavailable`。它的存活与停止不受影响。
- 保留进程索引按 `retainedPollMs` 按 Job 名读除锚以外的成员数。成员数为 0 时，索引停止 Job（含锚）并确认，删除标记，这一项结清。
- 索引里保留 Job 的坐标是「登录会话号:Job 名」，锚的进程号记作索引的门进程号，不计入成员。`Local\` 下的名字按登录会话隔离，所以别的登录会话里的保留 Job 读成员答读不出，停止答 `unconfirmed`，不当作已消失；同一会话里名字不存在时，最后一个句柄已经关闭，`KILL_ON_JOB_CLOSE` 已经停止全部成员，读成员答已消失，停止答 `confirmed`。
- 保留扩展的 `list`、`stop` 与 `output` 与 Linux 同形。`stop` 按 Job 名执行强制停止序列。

冷恢复：

- `listRecoveryResources(作用域)` 读状态目录里这个作用域的标记。没有状态目录，或有标记读不全时，答 `unavailable`。
- `recover(资源)`：
  1. 引用不是本提供者写下的格式时，答 `unsupported`。
  2. 启动身份与当前不同时，答 `confirmedStopped`。
  3. 同一次启动、登录会话不同时，答 `pending`。`Local\` 命名空间按登录会话隔离，在别的会话里打不开 Job 不说明它不存在。
  4. 同一次启动、同一会话、能按名字打开 Job 时，执行强制停止序列。确认时答 `confirmedStopped`，否则答 `pending`。
  5. 同一次启动、同一会话、名字不存在时，答 `confirmedStopped`。名字不存在说明最后一个句柄已经关闭，`KILL_ON_JOB_CLOSE` 已经停止了全部成员。
  6. 确认之后删除标记。

  保留进程索引持有的资源由索引停止，不经以上各步。资源已没有冷索引标记时，停止已经确认，或者保留进程索引持有这个 Job。这时按名字读成员：名字不存在答 `confirmedStopped`，名字存在答 `pending`。

已知限制：

- 普通终端的 Job 没有冷索引标记，`listRecoveryResources` 列出的是命令 Job、保留进程与保留终端，不含普通终端。提供者进程意外退出之后，终端宿主仍持有它的 Job，列举因此不完整，与 H-6 不符。收敛条件：终端宿主在控制端消失时停止自己的 Job，或者终端 Job 也写冷索引标记（本程切片 10）。
- 锚进程自身崩溃不在形式模型里。锚崩溃并且桥已经退出时，最后一个句柄关闭，`KILL_ON_JOB_CLOSE` 停止全部成员，保留进程因此意外结束。冷恢复按上面第 5 条答 `confirmedStopped`，这个结论仍然如实。
- Windows 没有信号，结局的 `exit` 只有退出码。强制停止的结局是 `failed(effectUnknown)`。
- 优雅停止：命令以新进程组加隐藏的独立控制台创建。`stop('graceful')` 向它发 `CTRL_BREAK_EVENT`，在 `graceMs` 内主进程退出时，接着执行强制停止序列清理 Job，答该序列的结果。超时答 `unconfirmed`，不自动升级。主进程不是控制台程序时，直接答 `unconfirmed`。
- `executable` 以 `.bat` 或 `.cmd` 结尾（不区分大小写）时，启动答 `rejected(unsupported)`。`CreateProcessW` 对批处理文件会隐式经 `cmd.exe` 再解析一次参数，转义规则不兼容。要运行批处理文件，调用方显式执行 `cmd.exe /d /c`。

### 撤除顺序

- 宿主文件插件卸载时，这一代宿主文件提供者开始退役。退役使它交出的租约以 `providerRetired` 失效，之后 `files` 不再有提供者，宿主层的落点解析返回 `noMatchingEnvironment`。`files` 设施声明与责任域不受影响。退役逐份排空这一代的获取，最多等 `drainBoundMs`；待处置时 `ctx.logger` 先收到诊断，再收到 `RetirementPending`。原记录与仍打开的描述符留在责任域，由新的一代或责任域的维护入口继续结清。
- 退役的排空强制停止这一代仍在运行的命令，它们的结局是 `failed`（`effectUnknown`）。已经移交保留范围的单元不在其中，它们留给保留范围，同一状态目录的后继一代接着读它们的成员。停止未确认的进程作为受管资源列在待处置里，`RetirementPending` 带着它们。配置重载走同一条路径（见[宿主命令与终端](#宿主命令与终端)的已知限制）。
- `commandFacilityPlugin` 卸载时，`command` 设施声明从登记表移除。之后需要 `command` 的落点解析返回 `missingFacility`。宿主提供者与已经起来的进程不受影响。
- `filesFacilityPlugin` 卸载时，`files` 设施声明从登记表移除。之后需要 `files` 的落点解析返回 `missingFacility`，已取到的 `files` 设施对象上的操作返回 `unsupported`。宿主文件提供者仍在场。
- `ExecutionEnvironmentRegistry` 卸载时，它在构造时登记的效应调用登记表的 `close()`。关闭顺序归 [execution-environment SPEC 的关闭](../execution-environment/SPEC.md#关闭)。关闭结果是待处置时，这个效应的撤除函数抛出 `RetirementPending`，带未停的受管资源。
- fiber 卸载本身总是完成。退役或关闭待处置时，撤除函数抛出的 `RetirementPending` 由 Cordis 写入 `ctx.logger` 的错误，卸载不失败，`fiber.dispose()` 正常返回（Cordis 4.0.4 读数，见 [Cordis 说明](docs/cordis.md#机制读数与假设)）。未停的资源经这条错误与登记表的退役、关闭结果可见。只有调用方直接调用 `registerProvider` 返回的撤除函数时，待处置才以抛出报告。
- 服务卸载时，`inject` 了本服务的插件随之卸载或重跑，它们的效应与服务的关闭并发运行。提供者退役共用一次 `retire()` 调用，不因两条撤除路径而退役两次。
- 撤除不撤回任何外部效果。已经写入宿主文件的字节留在文件里。

## 所有权、失败与生命周期

| 事物                                   | 拥有者                                                       | 失败时                                                                                                                 | 结束                                                                             |
| -------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 服务实例与登记表实例                   | `ExecutionEnvironmentRegistry` 插件的 fiber                  | 关闭待处置时撤除函数抛出 `RetirementPending`，Cordis 记入 `ctx.logger`，卸载照常完成                                   | 插件卸载                                                                         |
| `files` 设施声明的登记                 | `filesFacilityPlugin` 的 fiber                               | 重复登记抛出，插件 fiber 进入 `FAILED`                                                                                 | 插件卸载，或服务撤除                                                             |
| 宿主文件提供者的登记（一代）           | 宿主文件插件的 fiber                                         | 重复登记抛出，插件 fiber 进入 `FAILED`；这一代的获取没有全部结清时退役待处置，撤除函数抛出 `RetirementPending`         | 插件卸载，或服务撤除                                                             |
| 宿主文件责任域                         | 进程宿主的单一拥有者                                         | 不随插件或服务卸载；记录只在本进程内，进程结束后没有证据说明旧容量已经结清                                             | 拥有者丢弃它，或进程结束                                                         |
| 获取记录、名额与门面                   | 宿主文件责任域                                               | 排空待处置时名额仍占用，记录仍可查询与结清；`maintain()` 与结清继续驱动                                                | 排空确认什么都不剩，名额恰好返还一次                                             |
| 文件引擎（按文件配置一个）             | 宿主文件责任域                                               | 配置不合法时 `createHostFilesProvider` 在登记之前抛出；引擎封闭只让这个所有者的批次停在下一次发布之前                  | 责任域被丢弃，或进程结束                                                         |
| 在途文件操作                           | 所属获取的门面                                               | 超过上界仍未结束时，诊断写明它们的数目；它们仍在运行，结果仍交回原请求                                                 | 操作返回                                                                         |
| 关闭失败的描述符                       | 所属获取（引擎里的所有者标签）                               | 留在共用文件引擎里，这份获取的操作、排空、结清与 `maintain()` 重试关闭；别的获取关不了它                               | 关闭成功                                                                         |
| 已发出的句柄代际                       | 共用文件引擎，带所属获取                                     | 关闭没有成功回执时为未知                                                                                               | 关闭成功回执                                                                     |
| 写入宿主文件的字节                     | 宿主文件系统                                                 | 截断后没写完时为未知                                                                                                   | 不随撤除撤回                                                                     |
| `command` 设施声明的登记               | `commandFacilityPlugin` 的 fiber                             | 重复登记抛出，插件 fiber 进入 `FAILED`                                                                                 | 插件卸载，或服务撤除                                                             |
| 平台前提的探测结果                     | 宿主提供者的一代                                             | 探测出错为未知；不满足时在 `probeRetryMs` 之后的启动再探测                                                             | 这一代被丢弃                                                                     |
| 命令进程与它的 scope 单元              | 所属获取的命令门面；单元由 systemd 用户管理器持有            | 停止未确认时作为受管资源留在这份获取，排空、结清、退役与 `maintain()` 再试；进程结束后由资源恢复按单元坐标列举与停止   | `systemctl --user show` 读到不活动或不存在，且结果已记入账本                     |
| macOS 的执行域（POSIX 会话）与它的标记 | 所属获取的命令或终端门面；标记在状态目录的冷索引里           | 停止未确认时作为受管资源留在这份获取，排空、结清与退役再试；提供者走掉时门停止自己的会话；进程结束后由冷恢复按标记停止 | 会话读取程序连续两次读到空，且结果已记入账本；之后删去标记                       |
| 移交保留范围的 scope 单元              | 保留范围，经保留进程账本；本进程里由保留进程索引读成员与停止 | 停止未确认时留在索引里，`maintain()` 再试；进程结束后由标记文件找回                                                    | 进程全部自行退出、保留范围封闭或冷恢复停止，监督者确认，且结果已记入保留进程账本 |
| 保留进程索引与标记文件                 | 宿主文件责任域，按状态目录一个；标记文件在状态目录           | 写不成或删不掉时发出 `retainedMarker` 诊断；读不全时预留、列表与冷恢复列举答不可用                                     | 标记随保留进程的确认停止删去；索引随责任域丢弃                                   |
| 命令的输出缓冲                         | 这个进程的句柄                                               | 放不下的块整块丢弃并计数；读者放弃后全部计入丢弃                                                                       | 读者读完或放弃，且进程已有结局                                                   |
| 命令已经产生的外部效果                 | 宿主机                                                       | 停止不撤回它们；强制停止的结局是 `effectUnknown`                                                                       | 不随停止或撤除撤回                                                               |

进程失败：文件一侧没有可恢复的东西，责任域的记录随进程结束。命令一侧的受管资源是 scope 单元，进程结束后它们仍在 systemd 用户管理器里，由资源级恢复按单元坐标列举与停止（见[宿主命令与终端](#宿主命令与终端)的资源级冷恢复），恢复不重启命令，也不结清获取。移交保留范围的单元由新进程从标记文件找回，照常读成员、在范围封闭时停止（见[一次性命令留下的进程的兑现](#留下的进程的兑现)）。新进程的责任域对旧进程的原描述答未知，不答未分配；需要域外可信进程退出证据的冷恢复结清是 M2 之后的剩余责任。登记表的重建沿 [execution-environment SPEC](../execution-environment/SPEC.md#所有权失败与生命周期)。撤除函数抛出的错误只进 `ctx.logger`，`fiber.dispose()` 的调用方观察不到，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

## 组合与验证

| 承诺                                       | 位置                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 服务键、抽象类、登记即效应                 | [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) |
| 登记表的匹配、获取、门、退役、恢复与关闭   | [execution-environment SPEC](../execution-environment/SPEC.md)                                   |
| 设施协议、结果四态、文件使用的最小调用事实 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md#设施协议)        |

持续验证在 `tests/`，文件字节、符号链接、对象替换与描述符都用真实文件系统：

| 测试文件                                                                                           | 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [host-file-results.spec.ts](tests/host-file-results.spec.ts)                                       | 未点名拒绝、空字节拒绝、未解析、末段符号链接拒绝、中间目录换成链接、经祖先链接读取、查看与写入不带字节、关闭只回句柄、撤权后保留旧字节、对象替换后不复用旧完成、关闭失败的三种路径、代次递增、尾部斜杠、目录读取、请求与字节的快照、错误路径保留无法关闭的描述符                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [host-files.spec.ts](tests/host-files.spec.ts)                                                     | 读工作区目录之外的点名文件、字节范围、查看、新建与拒绝覆盖、父目录不符拒绝、预期版本不符拒绝；相对路径在读取、查看、两种写入与关闭上返回 `invalidInput` 且不触碰文件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [host-files-unsupported.spec.ts](tests/host-files-unsupported.spec.ts)                             | 没有 `/proc/self/fd` 的宿主上，八项操作返回 `unavailable` 且不触碰文件系统；配置了根时全部操作返回 `unavailable`；没有根时已接受的四项照常。文件名沿用旧名；在 Linux 上把 `process.platform` 换成 `win32`，在 Windows 上是真实平台                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [host-file-edges.spec.ts](tests/host-file-edges.spec.ts)                                           | 查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问为 `notAuthorized`；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态的版本在写入、读取、查看与新建之间一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [host-file-tree.spec.ts](tests/host-file-tree.spec.ts)                                             | 没有根时的列表、搜索、建目录、删除、移动、复制：成功、各项拒绝、未知；分页与排序、符号链接不跟随、搜索的三个预算、递归删除不进入链接、不覆盖、替换时旧读者仍读到旧字节、跨设备为 `unsupported`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [host-file-root.spec.ts](tests/host-file-root.spec.ts)                                             | 宿主文件根，在 Linux 与 macOS：根外路径与同名前缀的邻居、`..`、指向根外的符号链接（中间段与最后一段）、硬链接各一条用例，每条前后比较根与根外的快照，E1 与 E2 先于任何系统调用判定；目录被换成链接时新建、移动、建目录仍落在原目录；走到中间段时被换成链接；根被换成另一个目录；根打不开；有根时的四项照常；最后一段是挂载点（有挂载权限时）；写入新建与批次新建的文件权限与同一进程普通新建的文件相同                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [host-file-batch.spec.ts](tests/host-file-batch.spec.ts)                                           | 提交批次与恢复批次：成功与清单；提交前的各项拒绝不写任何东西；第 k 项冲突；发布失败；字节相同但没有回执；运行中为 `pending`；门面封住为 `closed`；没有状态目录；他租户读不到；发布后删不掉临时文件时仍答 `committed` 并发出 `temporaryFileRemains`；进程在发布中途被杀之后新进程读到 `interrupted`（慢层）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [host-command.spec.ts](tests/host-command.spec.ts)                                                 | 真实 systemd 用户 scope 里的命令，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：输出次序与偏移、退出码与单元清理、显式环境与标准输入、映像起不来、超过缓冲上限的整块丢弃、门一侧暂停与恢复、平和停止与强制停止、没有保留绑定时主进程退出后清掉后台进程且 `residue` 为 `stopping`（`unbound`）、单调用中断、释放与配置重载时的强制停止、账本不许可时不起命令、启动超时、另一个责任域列举并恢复单元、停止任务未完成的单元仍被列举                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [host-command-residue.spec.ts](tests/host-command-residue.spec.ts)                                 | 真实 systemd 用户 scope，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：整个单元移交，后台服务活过这次调用与获取的释放；`list` 列出保留进程，范围封闭停止并确认、记账；满额时新的停止、旧的保留；范围封闭之后新留下的进程以 `closed` 停止；新责任域里的新提供者按标记找回保留进程并在封闭时停止；别的保留范围与租户看不到它；全部自行退出后自行结清（记账、删标记、还名额）；提交结果未知时释放答待处置并再问；未知结果查明为封闭时在获取下停止；`unbound`、`policy`、别的保留范围、没有状态目录各自的原因，空单元为 `none`；移交之后句柄的两态停止答 `unconfirmed`，服务仍可访问                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [host-command-release-scope.spec.ts](tests/host-command-release-scope.spec.ts)                     | 真实执行环境登记表、真实宿主提供者与真实 systemd 用户 scope，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：保留进程移交之后，登记表的 `releaseScope` 答 `recovered`，没有待处置项；`stopped` 列出它，或者为空（登记表先发封闭信号再枚举，索引可能在枚举之前就确认了停止，这时停止的记录在保留进程账本里）；调用一返回单元就已不活动；保留进程账本恰好一条 `confirmed`，获取账本没有；标记文件已删                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [command-retention-conformance.spec.ts](tests/command-retention-conformance.spec.ts)               | 真实宿主提供者与真实 systemd 用户 scope，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：契约命令保留套件的六条 `V-EE28.` 用例（处置结果的形状、`list` 不跨保留范围、移交之后句柄停止答 `unconfirmed`、范围封闭停止保留进程、没有账本视图时以 `unbound` 停止），以及 `V-EE30.` 的五条停止用例（确认即单元已停、不跨保留范围、重复停止合流、收场事实之后答 `confirmed`、没有 `ended` 答 `unavailable`），`V-EE31.` 的三条输出用例（留下的进程在移交之后写的字节经真实的门进入尾部、字节关系与 `from` 成立，不跨保留范围，停止之后答 `notFound`）。两条守卫用例（`V-EE30.guard-refuses-stop`、`V-EE31.guard-refuses-output`）在裸提供者上不适用：守卫由登记表的门调用，登记表的用例覆盖它们。另一获取只用「另一保留范围」形状，「另一租户」在契约自测里覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [host-command-frames.spec.ts](tests/host-command-frames.spec.ts)                                   | 不起 scope，两个平台：帧按任意字节边界读取、各类非法帧使读取失效、被拒的行之前的帧照常生效而之后的帧不再交出（结局与分块方式无关）、退出帧之后的数据帧与丢弃帧、每种帧在五个阶段里的接受与故障原因、退出帧之后的输出在移交之前只计数而移交之后进尾部且通道结束后尾部关闭、每种故障的原因、行长上界（恰为上界的行收下，多一个字节即拒，未读完的行也按长度判定）、整块丢弃与计数、单一读者、停止确认只认 `inactive` 或 `not-found`、只读回本提供者写下的单元引用、起不来的监督工具答失败；冷恢复列举读 `systemctl show` 块（属性次序不限，略去别的作用域与不带资源键的单元名，空输出为空列表），没有键的行、重复的键、缺属性的块、不是 `omne-host-*.scope` 的单元与列举失败都答 `unavailable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [host-retained-processes.spec.ts](tests/host-retained-processes.spec.ts)                           | 不起 scope，监督读数用替身：名额含预留与停止中的项且不驱逐；标记读全之前预留答不可用；提交写标记，`list` 只按范围与租户列出；只剩门的单元被停止、记账并删标记，读不到的单元不动；重启后删去别的启动身份与已不在的单元的标记，其余现读成员后列出；标记读不全时答不可用且不占名额；按资源恢复；提交在途时的停止或释放；提交结果未知时保留预留，再问后两种结果；处置按契约次序取第一项不成立的原因；停止中的移交占名额、`list` 列为停止中、并入已发出的停止且只记一次账；写不成的标记由 `maintain()` 重写，停止中的项也重写；停止未确认时标记保留（含停止与标记写入重叠），新索引在同一状态目录上仍列出它并计入名额；按引用停止只认保留范围、租户、`id` 与 `generation` 都相同的项，重复停止并入一次，出索引之后按账本 `ended` 作答，读不到收场事实或标记时答不可用，重启加载回来的项记入调用方的账本；按引用读输出同样四项匹配，不保存时答 `unsupported`，重启加载回来的项与尾部已关闭的项答不可用，停止之后答 `notFound`；重启加载回来的项自行结清时记在该范围最近给出的视图上，之后按引用停止答 `confirmed`                                                                                                                                                                                                                                                                                        |
| [retained-tail.spec.ts](tests/retained-tail.spec.ts)                                               | 尾部对参照模型的生成输入对拍（200 轮，固定种子）：保存的是最新一段连续字节且不超过容量、偏移与丢弃数、任意 `from`、多字节起点跳过的续字节、尾部变化时版本号增加而没有变化时不变；逐字节追加三倍容量后保存的是最后一个容量；关闭之后读数不变、追加与丢弃被忽略；追加的字节被复制；严格解码判断替换；容量必须是正整数                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [host-command-custody.spec.ts](tests/host-command-custody.spec.ts)                                 | 快层，只在 Linux，用 [假监督工具](tests/fixtures/fake-supervisor.mjs) 驱动真实的命令门面与保留进程索引：adopt 答复之后第 0 到 14 个微任务时刻的释放，结果只有「停止并记一次账」或「保留且单元不被停」两种；并发与先后到达的再问只提交一次移交；移交之后句柄的两态停止答 `unconfirmed`，adopt 等待期间的停止照旧打断移交；打断的移交归保留范围、占名额、只记一次账；读标记超过处置期限时以 `policy` 停止；移交之前观察到的字节（退出之前与退出帧之后的）计入尾部的保留起点，移交之后的数据帧进尾部、丢弃帧记成缺口；容量 0 时输出答 `unsupported`；移交之后帧通道关闭或帧流故障时 `output` 答 `unavailable`，索引结清之后答 `notFound`；`stop` 与 `output` 的载荷形状不成立时答 `invalidInput` 且不碰索引、不发停止；终端的选项 `HostTerminalOptions` 不带留下的进程的四项（含 `retainedOutputBytes`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [host-containment.spec.ts](tests/host-containment.spec.ts)                                         | 慢层，只在 Linux（命令部分要 `OMNE_HOST_COMMAND_LINUX=1`，终端部分另要 `OMNE_HOST_TERMINAL_LINUX=1`）：脚本经 `setsid` 与双重 fork 起两个脱离会话与父进程的进程；`/proc/<pid>/cgroup` 的统一层级路径以执行域的单元名结尾；命令留下它们时 `residue` 为 `retained`、进程数不小于 2，保留范围封闭后两者都不在、单元已停；没有保留绑定时以 `unbound` 停止；终端段照常完成，关闭终端答 `confirmed` 之后两者都不在                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [host-scope.spec.ts](tests/host-scope.spec.ts)                                                     | 快层，只在 Linux，用 [假 systemctl](tests/fixtures/scripted-systemctl.mjs)：单元成员读数的每个结果，读失败从不成为空单元，`show` 的参数逐项核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [command-gate-core.spec.ts](tests/command-gate-core.spec.ts)                                       | 快层，不起进程：命令门进程的纯判断，请求解析、控制行的动作与 cgroup 读取的短路、数据帧的切分、输出块的去向（退出帧之前发帧、之后走中继、管理者断开后丢弃）、退出之后的静默判定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [host-probe.spec.ts](tests/host-probe.spec.ts)                                                     | 平台前提 P1、P3～P6：没有命令后端的平台上启动答 `unavailable` 而 `files` 照常（把平台伪装成 `freebsd`，在 Linux 与 macOS 上运行）；`PATH` 里没有 `systemd-run` 时答 `unavailable` 且诊断写明缺项；用户管理器可达时 `satisfied`；去掉用户管理器的变量时答 `unavailable`，恢复后过了重探间隔可以启动；探测程序的退出与停止结果对应到哪些前提项                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [scope-cgroup.spec.ts](tests/scope-cgroup.spec.ts)                                                 | P5 与 P6 的解析：统一模式、混合模式、只有 v1、看不到统一层级挂载、挂载只露出子树（含挂载根就是单元自己）、根按整段比较、挂载点带转义时解析出的单元目录；进程是否在自己的单元里只按它的 cgroup 路径判断；只认完整的 `cgroup2` 行与以 `/` 开头的 `0::` 路径；Linux 上本测试进程的成员表列出它；探测程序不在自己的单元里时不以 0 退出（慢层，只在 Linux）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [host-provider.spec.ts](tests/host-provider.spec.ts)                                               | 宿主提供者声明的事实（版本等于 `package.json`、平台带 `os.release()`、设施键 `files` 与 `command`、前提三态之一、配额域、资源枚举按平台与用户管理器可达性分支、对意外资源答不支持；macOS 上没有状态目录时资源枚举答 `unavailable`，有状态目录时列出这个作用域的标记与保留终端，标记读不全时答 `unavailable`）；租约的身份、证据（带版本）与两个设施键，命令设施的收纳声明按平台（Linux `sealed`、macOS `none`、其余不声明）；提供者的保留进程观察只列请求的保留范围与租户，索引读不出时答 `unavailable`，退役后照样答索引的读数；沙箱落点与退役后的拒绝；经登记表的门，账本关闭后写入返回 `closed` 且文件不变，另一份获取的账本不受影响；没有在途操作时退役立即已排空，之后新操作 `closed`；界值非法抛 `RangeError`；退役只通知尚未释放的租约；命令启动的 `terminal` 与 `geometry` 答 `unsupported`、非法输入答 `invalidInput`，都不调用账本；命令选项的界值。收敛接线：配置了 `filesRoot` 的提供者对根外路径答 `notAuthorized`、根内照常，没有根时根外路径照常；配置了根时获取的证据多一个 `filesRoot` 条目；`limits` 的列表上界生效；非绝对路径与非正上界在创建时抛出；批次发布后删不掉临时文件时提供者的 `diagnose` 收到 `temporaryFileRemains`，抛出的 `diagnose` 不改结果；同一配置的两个在场提供者都收到它，退役已排空的不再收到；`describe()` 的前提合并 P2（状态目录不可用时为 `unknown`） |
| [host-provider-drain.spec.ts](tests/host-provider-drain.spec.ts)                                   | 用 `vi.mock` 让带标记路径的 `open` 停住，其余是真实文件系统：在途写入未结束时退役不返回、期间新操作 `closed`，写入结束后已排空；超过上界时待处置、受管资源为空、诊断 `inFlight` 为 1，放行后再退役已排空；经 Cordis 以 `{ drainBoundMs: 20 }` 装载后卸载，`ctx.logger` 先后收到诊断与 `RetirementPending`，卸载完成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)                                                 | 装载两个访问端口服务、服务、`filesFacilityPlugin` 与宿主文件插件后经租约读文件；访问端口服务缺席或只装一个时落点解析为 `unavailable`，可信绑定把作用域绑到别的租户时为 `notAuthorized`；沙箱层没有提供者；宿主文件插件卸载后租约以 `providerRetired` 失效、宿主层没有匹配；只装提供者时落点为 `missingFacility`，卸载声明插件后已取到的设施返回 `unsupported`；服务卸载后键上没有服务、租约以 `registryClosed` 失效、新获取返回 `ownerStopped`；恢复授权服务缺席时恢复两操作返回 `unavailable`，装载后被现取、Windows 与没有状态目录的 macOS 的完整冷资源枚举为 unavailable，其他平台沿各自列举前提判断（不记为不支持），卸载后又返回 `unavailable`；授权后释放作用域使宿主租约以 `scopeReleased` 失效，该作用域的再获取与落点解析为 `referenceExpired`；`describe` 列出该作用域的宿主落点；经服务登记的提供者退役待处置时，返回的撤除函数每次调用都再退役并抛出 `RetirementPending`；退役与关闭待处置时 fiber 卸载照常完成，`ctx.logger` 收到 `RetirementPending`；宿主文件插件只接受合法的 `drainBoundMs`，Service 与声明插件只接受空配置                                                                                                                                                                                                                                                        |
| [host-domain.spec.ts](tests/host-domain.spec.ts)                                                   | 用 `vi.mock` 让带标记路径的 `open` 停住，并让活描述符上的 `close` 按计数失败，其余是真实文件系统与真实描述符：一份获取释放时在途写入未结束为待处置、资源为空、名额仍占用，另一份获取照常写入，被释放的门面拒新操作，放行后结果回原请求，再释放才返还名额且只返还一次；读取后关闭失败的活描述符归原获取，退役不报已排空，租约失效后 `maintain()` 关闭它并结清；错误路径的描述符使结清先待处置、关闭后结清；同一文件的两份获取代际不同，一份获取关不了另一份的句柄；同一责任域里提供者重载后新代看到原占用、列出并查询旧获取为释放中、结清它，旧租约不复活；登记表重建后经恢复查询看到已分配、经 `recoverOwned` 的已知列表结清（Windows 与没有状态目录的 macOS 上，这个提供者列在 `unavailable` 里）；降低上界不抹旧占用，并发抢最后一个名额只一个得到，全局上界单独报告；新进程的责任域对旧代答未知，自己签发的代答未分配，指纹不同答冲突；未知文件结果下结清不改字节；缺责任域或配额域为空时抛出；排空一份获取只停止它自己的命令进程，确认之后才结清（慢层）。收敛接线（经源码模块读责任域内部面）：释放与退役都封住引擎里这份获取的所有者，之后引擎的批次答 `closed`；配置相同的提供者共用一个引擎，根或上界不同的各用一个                                                                                                                                                                        |
| [contract-conformance.spec.ts](tests/contract-conformance.spec.ts)                                 | 登记表经两个端口替身通过契约的环境套件，宿主提供者通过提供者套件（在途排空一项不适用）；五种故障的登记表被套件拒绝。Linux 上宿主提供者的启动探测在每项开始前完成，套件的等待上界只量各项操作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [root-segments.spec.ts](tests/root-segments.spec.ts)                                               | 位置判断在 POSIX 上的行为：根下各段与根本身、同名前缀的邻居、父目录、`..`、相对路径与 NUL 不在根下、大小写敏感。Windows 分支由 `tests/windows-files/path-alias.spec.ts` 在真实 Windows 文件系统上覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [public-entry.spec.ts](tests/public-entry.spec.ts)                                                 | 根入口的运行导出只有五个函数；根入口可达的模块（含文件树、批次、路径、命令、保留尾部、保留进程索引、探测与门脚本）不导入 Cordis 或 `./cordis`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [macos-execution/session.spec.ts](tests/macos-execution/session.spec.ts)                           | 快层，各平台都运行，读取程序用替身：会话读取程序的各种答复；读取失败、超时或读不懂时按未知处理，不按空处理；记下的执行域只停止仍属于它的会话，首进程号被重用的会话被跳过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [macos-execution/domain-index.spec.ts](tests/macos-execution/domain-index.spec.ts)                 | 快层，各平台都运行，真实临时状态目录：资源引用的读写；标记的写入、读取、按作用域列举与删除；列举要么完整，要么答 `unavailable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [macos-execution/decisions.spec.ts](tests/macos-execution/decisions.spec.ts)                       | 快层，各平台都运行，不起进程：`residue` 的各项原因与次序，成员数未知按有留下的进程处理；启动请求的检查；前提项名；门的环境                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [macos-execution/primitives.spec.ts](tests/macos-execution/primitives.spec.ts)                     | 慢层，只在 macOS 且设了 `OMNE_HOST_MACOS=1` 时运行：Π2（会话成员）、不停 fork 的会话下的 Π3（停止与确认）、执行域身份、Πt（哨兵经真实 PTY）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [macos-execution/commands.spec.ts](tests/macos-execution/commands.spec.ts)                         | 慢层，只在 macOS 且设了 `OMNE_HOST_MACOS=1` 时运行：C11、干净退出（没有保留扩展，收纳声明为 `none`）、命令环境与门的环境、四种原因下的 StopTruth、`closed`、强制停止与平和停止、释放、提供者被 `SIGKILL` 之后的冷恢复、没有状态目录时的列举、起不来的映像                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [macos-execution/terminals.spec.ts](tests/macos-execution/terminals.spec.ts)                       | 慢层，只在 macOS 且设了 `OMNE_HOST_MACOS=1` 时运行：C7、200 段上的 C8、C9 与它的上界、C10、setsid 的已知偏离、哨兵、释放、提供者被 `SIGKILL` 之后的恢复、Session 保留终端                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [macos-execution/terminal-conformance.spec.ts](tests/macos-execution/terminal-conformance.spec.ts) | 慢层，只在 macOS 且设了 `OMNE_HOST_MACOS=1` 时运行：契约的终端套件，7 条用例                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

运行记录：

- PanQiWei 接受时，包测试只在 Node v26.0.0、darwin 上运行过。
- 2026-11-02 在 Node v26.12.0、WSL2（Ubuntu-24.04，内核 6.18.33.2-microsoft-standard-WSL2）上，本成员目录的快层 `vitest run --mode fast`：15 个测试文件、254 个测试，249 个通过、5 个跳过，退出码 0。跳过的 5 个中，4 个属于慢层，1 个只在非 Linux 宿主上运行（host-probe）。同一环境、同一提交上的慢层 `OMNE_HOST_COMMAND_LINUX=1 vitest run --mode slow`：4 个测试文件里的 20 个慢层测试通过，其中 16 个起真实的 systemd 用户 scope，运行后 `systemctl --user list-units 'omne-*'` 没有残留。两层合计 16 个测试文件、270 个测试。`typecheck` 无错误。本成员 `package.json` 声明的引擎是 `>=24`。
- 2026-11-05 在 Node v26.12.0、Ubuntu 20.04（systemd 245，cgroup 混合模式，统一层级挂在 `/sys/fs/cgroup/unified`，内核 5.15.0-1084-aws，node-pty 用 g++-10 在本机编译），代码与提交 `005cb80e3` 相同：快层 30 个测试文件，311 个通过、36 个跳过，连续 3 次退出码 0。慢层设 `OMNE_HOST_COMMAND_LINUX=1 OMNE_HOST_TERMINAL_LINUX=1`：24 个测试文件，45 个测试通过，运行后 `systemctl --user list-units 'omne-*'` 没有残留。
- 2026-11-05 同一环境，代码与提交 `02158d8c7` 相同：快层 33 个测试文件，365 个通过、36 个跳过，退出码 0。慢层设 `OMNE_HOST_COMMAND_LINUX=1 OMNE_HOST_TERMINAL_LINUX=1`：28 个测试文件，70 个测试通过、67 个跳过（其中 29 个是只在 Windows 上运行的用例），退出码 0，含 `host-command-residue`、`host-command-custody`、`host-retained-processes`、`host-command-release-scope`、`command-retention-conformance` 与 `host-terminal-segments`。之后的提交 `35ab21429` 只去掉一个未用的解构变量并整理格式，在它上面复跑了类型检查、`lint:oxlint` 与 `format:check`。
- 2026-11-06 同一环境，代码与提交 `c6e971012` 相同：快层（`vitest run --mode fast`）40 个测试文件，981 个通过、36 个跳过，类型测试无错，退出码 0。慢层设 `OMNE_HOST_COMMAND_LINUX=1 OMNE_HOST_TERMINAL_LINUX=1`：29 个测试文件，73 个测试通过、70 个跳过，退出码 0，新增的 `host-containment` 用例证明经 `setsid` 与双重 fork 脱离的进程仍在执行域里并随之停止；运行后 `systemctl --user list-units 'omne-host-*'` 没有残留。差分变异（只跑快层，基线 `1b017574b`）本成员 2256 个变异体，得分 84.7%。第一遍有 19 个不计分（5 个没跑测试、14 个超时未复核），用新起的运行器逐个复跑后全部被杀。没有覆盖的 238 个变异体中，224 个在门进程外壳 `terminal-gate.ts` 与 `command-gate.ts`，外壳只由慢层覆盖。
- 2026-11-06 同一环境，终端控制读取器的故障改为带出同次读取里先被接受的帧之后，代码与提交 `884a715fc` 相同：快层 40 个测试文件，986 个通过、36 个跳过；慢层 29 个测试文件，73 个通过、70 个跳过，运行后没有残留单元。改动行的差分变异 19 个变异体全部被杀。
- 2026-11-06 在 macOS 15.8（24H23）、Apple arm64、Node v26.13.0 上，代码与提交 `f25d74286` 相同：快层 858 个通过、238 个跳过、0 个失败。macOS 慢层设 `OMNE_HOST_MACOS=1`：primitives 5 个、commands 14 个、terminals 11 个、终端一致性 7 个，全部通过。这台宿主上没有运行 Linux 慢层。
- 2026-11-08 在 macOS 26.5.1（25F80）、arm64、Node v26.0.0 上，新增文件后端后的宿主快层单 worker 运行：1066 通过、179 跳过，类型测试无错；`OMNE_HOST_MACOS=1` 慢层：48 通过、145 跳过。其中文件根、树与批次定向用例 67 条通过，原生辅助程序 10 条通过、1 条因 APFS 拒绝无效 UTF-8 文件名而跳过。原先的并发快层出现 Shell 时序失败，保留失败记录后单 worker 整包复跑通过，未改断言或时限。契约快层 248 条通过。真实服务端的 coding agent 经 Files 完成创建、读取、列表、搜索、编辑、双文件补丁、复制、移动与递归删除；旧版本、复制冲突、补丁预检与越界拒绝由外部文件系统核对。模型标识取装配配置 `openai/gpt-6.1-sol`，history 不提供该标识。本轮没有 Linux 或 Windows 实机结果。
- 2026-11-08 在 2026-11-05 那条记录的 Linux 环境上，有根删除改为拒绝根内的挂载点、macOS 新建文件改为 `0666` 加 umask 之后，代码与提交 `a9d116a3d` 相同：快层 51 个测试文件，1210 个通过、35 个跳过，挂载点用例在有挂载权限时运行并通过（修复前在同一环境失败）；慢层设 `OMNE_HOST_COMMAND_LINUX=1` 与 `OMNE_HOST_TERMINAL_LINUX=1`，34 个测试文件，73 个通过、120 个跳过。改动行的差分变异：1372 个变异体，被杀 127、存活 61、无覆盖 1175、超时未复核 9，测量无效。无覆盖几乎都在 macOS 专用的文件适配，它们的用例只在 macOS 运行；Linux 能测到的删除修复 8 个变异体与 `compile.ts` 4 个变异体全部被杀。macOS 文件代码的变异读数没有取得。之后加上新建文件权限的用例（把 Linux 的新建权限改成 `0o600` 时它变红），快层 1211 个通过、35 个跳过。
- 2026-11-08 在 macOS 26.5.1（25F80）、arm64、Node v26.0.0 上复核 `e254c8e65`，并修复 APFS 测试卷清理：文件根、树与批次 68 条通过，新建权限和挂载点拒绝用例均实际运行；原生慢层 10 条通过、1 条因 APFS 拒绝无效 UTF-8 文件名而跳过。宿主快层单 worker 为 1067 通过、179 跳过；`OMNE_HOST_MACOS=1` 慢层为 48 通过、145 跳过；契约快层 248 条通过。直接调用设施新建文件，在 umask `022` 下权限为 `0644`。差分变异范围为 20 个文件、1372 个变异体，正式运行在预检失败，未取得得分。相同插桩副本在未设置 `VITEST_MAX_WORKERS` 时全套快层通过；设为 `6` 时，Vitest 4.1.11 将预检命令的 `--maxWorkers 1` 覆盖为 6，重现 Shell 时序失败。变异工具未修改，质量关仍未通过。
- 以上运行都不在 Windows 上。只在 Linux 运行的用例在 Windows 上显示为跳过，跳过不是通过。

本成员不覆盖：契约意义的授予根（宿主提供者不声称它）、cgroup v2 纯统一模式宿主上的真实运行（P5 与 P6 的解析只由文本样本覆盖）、systemd 245 以外版本上 `systemctl show` 的列举输出（glob 无匹配时输出为空、退出码为 0，只在 245 上核实）、根内的绑定挂载（同一文件系统上设备号相同，核对挡不住）、真实的 `failed` 单元状态（只有判断函数的测试）、Runtime Context 块的发布、调用方类核对、同一 isolate 标签下重复装载的失败、配置校验失败时 fiber 进入 `FAILED`，以及真实进程退出之后的冷恢复结清。留下的进程另不覆盖：标记文件写完之前提供者崩溃的窗口、标记文件写不成与删不掉的真实故障、真实的提供者进程崩溃（慢层用新的责任域与提供者代替重启）。慢层的真实进程用例要设 `OMNE_HOST_COMMAND_LINUX=1` 才运行，准入不设它，所以准入不覆盖它们。macOS 的慢层用例要设 `OMNE_HOST_MACOS=1` 才运行，准入也不设它。持久化、真实端口适配与真实集成方的端到端组合也不在本成员。独立验收场景尚未形成。

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
