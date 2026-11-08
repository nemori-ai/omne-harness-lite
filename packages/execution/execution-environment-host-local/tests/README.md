# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

文件字节、符号链接、硬链接、对象替换与描述符用真实文件系统，测试在系统临时目录下建文件，结束后删除。`vi.mock` 只用来在一次调用之前停住它（竞态）或让一次系统调用失败（未知的答复），其余仍是真实文件系统。批次的崩溃用一个被 `SIGKILL` 杀掉的真实子进程。命令用真实的 `systemd-run`、门进程与 `systemctl`：这些用例只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，其余情况显示为跳过，跳过不是通过。它们起的单元名以 `omne-host-` 或 `omne-test-gate-` 开头，用例结束时停止，文件结束时核对没有残留。平台前提的测试改变本测试进程的真实环境（`PATH` 与用户管理器的变量），之后恢复。Cordis 装载用真实 Cordis 4.0.4。授权决定、账本与守卫用替身。替身就绪不证明真实授权或数据耐久。测试通过不代替规格或验收。

## 维护

SPEC 的行为变化时，同步对应测试与本目录 `index.md`。宿主文件使用的测试覆盖已接受的行为，改它们之前先确认对应的行为已重新接受。

## 本包事实

各层的测试文件数、测试数与运行环境以 SPEC [组合与验证](../SPEC.md#组合与验证)的运行记录为准。下面的清单没有逐个列出 `windows-execution/`、`windows-files/` 下的文件（`macos-execution/` 下的文件见下文 [macOS 验证](#macos-验证)），也没有列出几个 Windows 与终端的测试文件。在 Windows 上，只在 Linux 运行的用例显示为跳过：

- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果：点名、空字节、未解析、符号链接、对象替换、关闭失败、代次、尾部斜杠、目录、快照与错误路径的描述符保留。
- [host-files.spec.ts](host-files.spec.ts)：工作区目录外的读取、字节范围、查看、新建、父目录核对、预期版本与相对路径拒绝。
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：没有 `/proc/self/fd` 的宿主上，八项操作返回 `unavailable` 且不触碰文件系统；配置了根时全部操作返回 `unavailable`；没有根时已接受的四项照常。文件名沿用旧名，在 Linux 上把 `process.platform` 换成 `win32`，在 Windows 上是真实平台。
- [host-file-tree.spec.ts](host-file-tree.spec.ts)：列表、搜索、建目录、删除、移动、复制，没有根：成功、各项拒绝、未知；分页与排序、符号链接不跟随、搜索的三个预算、递归删除不进入链接、不覆盖、替换时旧读者仍读到旧字节、跨设备为 `unsupported`。
- [host-file-root.spec.ts](host-file-root.spec.ts)：宿主文件根，在 Linux 与 macOS：根外路径与同名前缀的邻居、`..`、指向根外的符号链接（中间段与最后一段）、硬链接各一条用例，每条前后比较根与根外的快照；删除或改名硬链接的根内名只让根外对象的链接数减 1；目录被换成链接时新建、移动、建目录仍落在原目录；走到中间段时被换成链接；根被换成另一个目录；根打不开；有根时的四项照常。
- [host-file-batch.spec.ts](host-file-batch.spec.ts)：提交批次与恢复批次：成功与清单；提交前的各项拒绝不写任何东西；第 k 项冲突；发布失败；字节相同但没有回执；运行中为 `pending`；门面封住为 `closed`；没有状态目录；他租户读不到；进程在发布中途被杀之后新进程读到 `interrupted`（慢层）。
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态在写入、读取、查看与新建后的版本一致；根目录查看；显式零起点。
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实（版本、平台、设施键 `files` 与 `command`、前提三态之一、配额域、资源枚举按平台与用户管理器可达性分支、对意外资源答不支持）、租约内容、拒绝、经登记表门的账本关闭、无在途操作时的退役、界值核对与退役通知；命令启动的 `terminal` 与 `geometry` 答 `unsupported`、非法输入答 `invalidInput`，都不调用账本；命令选项的界值。收敛接线：`filesRoot` 经获取拿到的 `files` 对根外路径答 `notAuthorized`，没有根时照常；配置了根时证据多一个条目；`limits` 的列表上界生效；非绝对路径与非正上界在创建时抛出；批次发布后临时文件删不掉时，提供者的 `diagnose` 收到 `temporaryFileRemains`，同一配置的在场提供者都收到、已排空退役的不再收到；`describe()` 的前提合并状态目录上的 P2。用 `vi.mock` 让带标记的 `unlink` 按开关失败。保留进程：没有状态目录或不是 Linux 时不建索引；索引的监督接到成员读数与停止；恢复列举在标记读不全、监督工具找不到或列举失败时答 `unavailable`，并合并保留终端与保留进程；恢复先认保留终端，再认保留进程。这部分用假 `systemctl` 驱动，不起 scope。macOS（伪装平台）：没有状态目录时恢复列举答 `unavailable`；有状态目录时列出这个作用域的标记与保留终端，标记读不全时答 `unavailable`。Linux、Windows 与 macOS 之外的平台（伪装成 `freebsd`）只列保留终端。
- [host-command.spec.ts](host-command.spec.ts)：真实 systemd 用户 scope 里的命令，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：三行输出的次序与偏移、退出码与单元清理、只给显式环境与标准输入、映像起不来答 `unavailable`、超过缓冲上限的整块丢弃与偏移缺口、门一侧在帧管道写满时暂停命令且恢复后不丢字节、平和停止确认与超时不升级、强制停止清掉进程树、没有保留绑定的获取在主进程退出后清掉后台进程（有保留绑定、能保留时，留下的进程移交保留范围，不停止，见下面的 host-command-residue 与 command-retention-conformance）、单调用中断、释放与配置重载时的强制停止、账本不许可时不起命令、启动超时答未知并在释放时停止、另一个责任域列举并恢复单元、停止任务未完成（`deactivating`）的单元仍被列举、旧启动的单元与别的单元。
- [host-command-frames.spec.ts](host-command-frames.spec.ts)：不起 scope，两个平台：帧按任意字节边界读取、各类非法帧使读取失效、整块丢弃与计数、读者取走后腾出空间、单一读者、读者放弃后的丢弃计数、停止确认只认 `inactive` 或 `not-found`、只读回本提供者写下的单元引用、监督工具的上界带小数时照常运行、起不来的工具答失败（起一个普通的 Node 子进程）。冷恢复列举用替身 `systemctl` 打印 `show` 块，替身只回答列举那一条调用：属性次序不限，结尾的空白块不算单元，略去别的作用域与不带资源键的单元名，列出的引用就是本提供者写下的格式，空输出为空列表；没有键的行、同一块里重复的键、缺属性的块、前缀或后缀不对的单元名、`list-units` 的文本行与列举失败都答 `unavailable`。
- [host-command-residue.spec.ts](host-command-residue.spec.ts)：一次性命令留下的进程，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：真实单元的移交、`list`、范围封闭、满额、重启后按标记找回、范围与租户隔离、自行结清、提交结果未知的再问、各项停止原因、移交之后句柄的停止答 `unconfirmed`。
- [host-command-release-scope.spec.ts](host-command-release-scope.spec.ts)：慢层，只在 Linux：经真实登记表的 `releaseScope` 停止保留进程，调用返回时单元已停、只记一次账、标记已删。答复的 `stopped` 列出它或为空：登记表先发封闭信号再枚举，索引可能在枚举之前就确认了停止。
- [command-retention-conformance.spec.ts](command-retention-conformance.spec.ts)：契约套件 `commandRetentionConformance` 的六条 `V-EE28.` 用例在真实宿主提供者与真实 systemd 用户 scope 上运行，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：不留进程时 `residue` 为 `none`；留下的进程被保留并由 `list` 列出；`list` 不含另一保留范围的进程；移交之后句柄的 `stop` 答 `unconfirmed` 且单元仍在；封闭保留范围后读 `systemctl --user show` 确认单元已停；没有保留进程账本视图时停止，原因 `unbound`。本文件只写命令、封闭钩子与单元读数，用例判据在契约包。
- [host-command-custody.spec.ts](host-command-custody.spec.ts)：一次性命令的归属交错，快层，只在 Linux：用 [fixtures/fake-supervisor.mjs](fixtures/fake-supervisor.mjs) 充当 `systemd-run` 与 `systemctl`，驱动真实的命令门面与保留进程索引。覆盖 adopt 答复之后每个微任务时刻的释放、并发的再问、移交之后的句柄停止、打断的移交归保留范围、读标记的期限。
- [host-command-options.spec.ts](host-command-options.spec.ts)：命令配置的校验，快层，不起进程：字节与计数字段 0 拒、1 收、1.5 拒、超出安全整数拒，时间字段 -1 拒、0 收、无穷与 NaN 拒，报错文本逐字比对；几个字段同时非法时按字节、时间、计数、策略、块与缓冲的次序报第一条；块与缓冲的比较用到默认值；`commandSettings` 给出 SPEC 表里的初值、冻结结果、非法时抛 RangeError。
- [host-command-disposition.spec.ts](host-command-disposition.spec.ts)：一次性命令的处置与归属，快层，只在 Linux：用 [fixtures/fake-supervisor.mjs](fixtures/fake-supervisor.mjs) 充当 `systemd-run` 与 `systemctl`（经 `gate.json` 改写门的脚本），驱动真实的命令设施与保留进程索引。覆盖启动的各种拒绝（门在就绪前退出、许可答关闭或不可用、许可期间门面封住、映像起不来、未就绪、GO 之后没起来）及其强制停止只记一次账；处置的每个停止原因与次序；正常移交时两本账本的参数、成员数未知、两种封闭都停止已保留的进程；未知提交经强制停止、释放与平和停止的再问；句柄的两种停止与宽限超时；释放与前提不满足时的待处置；保留进程的列出。每次等待都有上界，结局不来时用例在上界处失败，不挂住。
- [host-retained-processes.spec.ts](host-retained-processes.spec.ts)：保留进程索引，快层，监督读数用替身：名额、标记的写入、加载与重写、每种无效标记（缺字段、类型不对、版本不对、文件名与键不符）被丢弃并报 `discarded`、单元读不到或标记读不到时索引保持未读、写标记不留打开的描述符、自行结清、`list`、恢复、停止中的移交、账本记不下时保留条目并在下次维护补记、轮询的间隔与启停（假定时器）、作用域与租户互不可见、处置的原因次序。
- [host-containment.spec.ts](host-containment.spec.ts)：封闭收纳，慢层，只在 Linux：命令部分要 `OMNE_HOST_COMMAND_LINUX=1`，终端部分另要 `OMNE_HOST_TERMINAL_LINUX=1`。脚本经 `setsid` 与双重 fork 起两个脱离会话与父进程的进程，进程号由脚本写进文件。用例读 `/proc/<pid>/cgroup` 核对它们仍在执行域的单元里，然后核对三条停止路径：保留范围封闭、没有保留绑定（`unbound`）、终端关闭。每条之后两个进程都不在，单元已停。
- [host-probe.spec.ts](host-probe.spec.ts)：平台前提：没有命令后端的平台上启动答 `unavailable` 而 `files` 照常（把平台伪装成 `freebsd`，在 Linux 与 macOS 上运行，Windows 上跳过）；`PATH` 里没有 `systemd-run` 时答 `unavailable` 且诊断写明缺项；用户管理器可达时 `satisfied`；去掉用户管理器的变量时答 `unavailable`，恢复变量并过了重探间隔后可以启动；探测程序的退出与停止结果对应到哪些前提项（纯函数）。
- [scope-cgroup.spec.ts](scope-cgroup.spec.ts)：用 `/proc/self/cgroup` 与 `/proc/self/mountinfo` 的文本样本，核对统一模式、混合模式、只有 v1、看不到统一层级挂载、挂载只露出子树（含挂载根就是单元自己）、根按整段比较和挂载点带转义时解析出的单元目录，以及进程是否在自己的单元里只按它的 cgroup 路径判断；只认完整的 `cgroup2` 挂载行与以 `/` 开头的 `0::` 路径。Linux 上能看到统一层级时，本测试进程在自己的 cgroup 里，该目录的成员表列出它。慢层另有一条只在 Linux 上运行：探测程序不在自己的单元里时不以 0 退出。
- [host-scope.spec.ts](host-scope.spec.ts)：单元成员的读数，快层，只在 Linux：用 [fixtures/scripted-systemctl.mjs](fixtures/scripted-systemctl.mjs) 充当 `systemctl`。已知目录可读时直读、不问监督工具；`show` 起不来、退出码非 0 或缺状态时不可读且不带 `show`；单元已停时为 `gone`；没有控制组时不可读且带 `show`；控制组映射到可读目录时列出成员（用本测试进程自己的 cgroup，没有 `0::` 路径的宿主上跳过）。
- [command-gate-core.spec.ts](command-gate-core.spec.ts)：命令门进程的纯判断，快层，不起进程：请求解析的每条拒绝理由、控制行的六种动作（`go` 只一次、首条无效即拒绝、不是 JSON 即忽略、请求无效时不读 cgroup）、退出之后的三种判定、数据帧在边界上的切分与字段次序。
- [terminal-gate-core.spec.ts](terminal-gate-core.spec.ts)：终端门进程的纯判断与段归属状态机，快层，不起进程：消息解析的拒绝理由、控制行的分行与上界、驱动脚本与分段源码对固定输入逐字节等于重构前、哨兵次序的每种非法情形报故障、段间缓冲的上界与丢弃计数、观察记录的校验、段只在完成观察与结束哨兵都到时完成；分段源码里 printf 写出的哨兵与 `sentinel()` 的字节相同。
- [terminal-control.spec.ts](terminal-control.spec.ts)：终端控制帧读取器，快层，不起进程：逐种帧、逐个状态的接受与拒绝，每种帧的解码拒绝理由，段间字节上界，`begun` 与 `data` 的次序，跨块与超长行，故障带出同一次读取里先被接受的帧、之后不再接受，以及一段的字节不论在哪里切开，交出的帧与结局都相同。
- [host-terminal-frames.spec.ts](host-terminal-frames.spec.ts)：宿主对门控制帧的处理，快层，只在 Linux：用 [fixtures/fake-terminal-gate.mjs](fixtures/fake-terminal-gate.mjs) 充当 `systemd-run` 起的门，驱动真实的 `createHostTerminals`。覆盖段间字节进入段结果的 between 一节（含丢弃计数）、`begun` 之前与之后的字节归属、没有 `begun` 时的摘要、段结束的结局形状、门违反协议时的故障，以及与故障在同一次读取里的帧照常生效（交出句柄、计入输出、按退出码完成后终端再失效）。
- [host-provider-drain.spec.ts](host-provider-drain.spec.ts)：退役等在途文件操作、超界待处置与诊断，含经 Cordis 卸载的日志。用 `vi.mock` 让带标记路径的 `open` 停住，其余是真实文件系统。
- [host-domain.spec.ts](host-domain.spec.ts)：责任域的真实文件与描述符证据。排空一份获取只停止它自己的命令进程，确认之后才结清（这一条只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行）。释放时一份获取排空、待处置不返还名额、另一份获取照常；读取后关闭失败与错误路径的描述符归原获取，退役不报已排空，维护重试在租约失效后关闭它；释放与退役都封住引擎里这份获取的所有者（经源码模块读责任域内部面，之后引擎的批次答 `closed`）；配置相同的提供者共用一个引擎，根或上界不同的各用一个；同一文件的两份获取代际不碰撞，一份获取关不了另一份的句柄；同一责任域内提供者重载后共用配额与原记录，新代查询与结清旧获取，旧租约不复活；重建登记表后经恢复路径结清原获取；降低配额不抹旧占用，最后一个名额只一个获取得到，全局上界单独报告；责任域没有签发过的代答未知而不答未分配；未知文件结果下结清容量不改字节。同一状态目录的提供者共用一个保留进程索引，另一目录另建一个；维护时累加各索引还持有的数。用 `vi.mock` 让带标记路径的 `open` 停住，并让活描述符上的 `close` 按计数失败，其余是真实文件系统。
- [contract-conformance.spec.ts](contract-conformance.spec.ts)：登记表（经两个端口替身）与宿主提供者通过契约套件，套件拒绝五种故障的登记表。Linux 上每个提供者都用真实 systemd scope 探测前提。探测是提供者的启动代价，所以宿主提供者的 subject 先等探测完成再交给套件，套件默认的 1 秒等待上界只量各项操作；用例本身的时限放宽到容得下探测四步各一个停止上界。
- [ports.ts](ports.ts)：测试辅助，不是测试文件：环境授权与可信绑定两个端口服务的替身。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、`filesFacilityPlugin`、`commandFacilityPlugin` 与宿主文件插件的装载与卸载，两个声明都在时 `files` 加 `command` 落在同一个宿主提供者、`terminal` 仍缺，经租约读文件，恢复授权服务的现取，两个访问端口服务缺席时答不可用、绑定到别的租户时答无权，经服务撤除提供者的重试，待处置时卸载照常完成并记入 `ctx.logger`，作用域释放使宿主租约失效，宿主文件插件的配置（含命令的界值与两个绝对路径），命令声明插件只接受空配置。`residuePolicy` 与保留进程计数字段的校验，以及它们原样落进提供者的命令选项、缺省字段不落键。
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合，根入口可达的模块（含文件树、批次、路径、命令、探测与门进程脚本）不导入 Cordis。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment-host-local test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

运行记录：PanQiWei 接受时只在 Node v26.0.0、darwin 上运行过。当前的运行记录见 SPEC [组合与验证](../SPEC.md#组合与验证)。

当前缺口：契约意义的授予根（宿主提供者不声称它）、同一文件系统上的绑定挂载、起点之外设备上的递归搜索与删除、同一 isolate 标签下重复装载、配置校验失败，都没有测试。`describe()` 看不到是否配置了根（契约没有位置），只测了证据里的条目。真实的 `failed` 单元状态没有构造出来，只有判断函数的测试。具名维护者由负责人指定。

## Linux 终端验证

[host-terminal.spec.ts](host-terminal.spec.ts)运行协议、原始字节和真实 Cordis 声明用例。它不启动 Linux PTY。

[host-terminal-recovery.spec.ts](host-terminal-recovery.spec.ts)使用真实 Bash、node-pty 与 systemd，覆盖持久 cwd、临时覆盖、非 UTF-8 字节、获取归属、并发、单终端强停、伪输出、后台写者、释放及新进程恢复。仅在 Linux 且 `OMNE_HOST_TERMINAL_LINUX=1` 时运行；缺前提会 runtime skip，不能记通过。先 build，再在成员目录运行 `OMNE_HOST_TERMINAL_LINUX=1 OMNE_HOST_COMMAND_LINUX=1 pnpm exec vitest run --mode slow tests/host-terminal-recovery.spec.ts`。

分段回归还核对 `return 0/7/125`、命令失败、提前返回后的状态保留与覆盖恢复，以及 shell 退出和 cwd 恢复失败后的失效。

Windows 运行 `pnpm exec vitest run --mode fast`。单独过滤全 skip 的 Linux 文件按仓库规则退出非零，表示没有实跑用例。

## macOS 验证

`macos-execution/` 下的测试覆盖 macOS 的命令与终端后端。机制见 [macOS 说明](../docs/macos-execution.md)。

快层在各平台都运行，不起真实会话：

- [session.spec.ts](macos-execution/session.spec.ts)：会话读取程序的答复（`members`、`identity`、`stop`）；读取失败、超时或读不懂时按未知处理，不按空处理；记下的执行域只停止仍属于它的会话，首进程号被重用的会话被跳过，别的启动身份的执行域不问读取程序。
- [domain-index.spec.ts](macos-execution/domain-index.spec.ts)：冷索引的资源引用与标记：写入、读取、按作用域列举与删除；新索引读到旧索引写的标记；标记读不出或目录里有别的文件时答 `unavailable`，从不列出一部分。
- [decisions.spec.ts](macos-execution/decisions.spec.ts)：`residue` 的各项原因与次序，成员数未知按有留下的进程处理；启动请求的检查；缺工具与编译失败的前提项名；门的环境只有固定的 `PATH`。

慢层只在 macOS 且设了 `OMNE_HOST_MACOS=1` 时运行，其余情况显示为跳过，跳过不是通过：

- [primitives.spec.ts](macos-execution/primitives.spec.ts)：Π2（会话成员，含作业控制的进程组与 nohup，不含经 setsid 离开的进程）、不停 fork 的会话下的 Π3（停止并确认为空）、执行域身份（进程号重用时只停止执行域自己的会话）、Πt（哨兵经真实 PTY）。
- [commands.spec.ts](macos-execution/commands.spec.ts)：C11 与干净退出；命令只得到请求的环境，门的环境里没有提供者的变量；四种原因下的 StopTruth；`closed`；强制停止与平和停止；释放；提供者被 `SIGKILL` 之后没有进程留下，新的提供者列举并恢复；没有状态目录时列举答 `unavailable`；映像起不来。
- [terminals.spec.ts](macos-execution/terminals.spec.ts)：C7；200 段上的 C8；C9 与它的上界；C10；setsid 的已知偏离；哨兵；释放；提供者被 `SIGKILL` 之后的恢复；Session 保留终端。
- [terminal-conformance.spec.ts](macos-execution/terminal-conformance.spec.ts)：契约的终端套件，7 条用例。
- [fixture.ts](macos-execution/fixture.ts)：测试辅助，不是测试文件：慢层共用的提供者、账本替身、获取、启动请求与按进程号的核对。只有账本是替身，它们是集成方的端口。

[host-provider.spec.ts](host-provider.spec.ts)、[host-domain.spec.ts](host-domain.spec.ts)、[cordis-entry.spec.ts](cordis-entry.spec.ts) 与 [host-probe.spec.ts](host-probe.spec.ts) 的预期按 macOS 改过：macOS 从冷索引列举，没有状态目录时答 `unavailable`；「不支持的平台」用例伪装成 `freebsd` 运行。

在本包目录运行慢层：

```sh
OMNE_HOST_MACOS=1 pnpm run test:slow
```

只运行 macOS 的测试：

```sh
OMNE_HOST_MACOS=1 pnpm exec vitest run --mode slow --typecheck.enabled=false tests/macos-execution/
```

慢层需要 Command Line Tools，以及权限为 0755 的 node-pty `spawn-helper`（由仓库的 `patches/node-pty@1.1.0.patch` 设置）。运行记录见 SPEC [组合与验证](../SPEC.md#组合与验证)。

### macOS 文件验证

`host-file-root`、`host-file-tree` 与 `host-file-batch` 在 Linux 与 macOS 使用同一组行为断言。Linux 在 Node 文件调用前注入，macOS 在仅测试版 C 辅助程序的系统调用前通过独立管道注入。生产辅助程序不含该接缝。跨设备测试在 macOS 使用 `hdiutil` 创建独占 APFS 卷，结束后先卸载再清理。批次崩溃测试在第一项回执写入后杀死主进程，核对后续项未发布，再用新引擎恢复。

`macos-files/protocol.spec.ts` 覆盖坏回复、异常退出与超时。`native-helper.spec.ts` 使用真实 C 编译和文件系统，覆盖目录改名、链接、APFS 别名与批次握手。APFS 不允许构造无效 UTF-8 名字时，该用例跳过，不算通过。
