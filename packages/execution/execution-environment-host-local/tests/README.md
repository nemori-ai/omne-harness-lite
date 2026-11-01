# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

文件字节、符号链接、硬链接、对象替换与描述符用真实文件系统，测试在系统临时目录下建文件，结束后删除。`vi.mock` 只用来在一次调用之前停住它（竞态）或让一次系统调用失败（未知的答复），其余仍是真实文件系统。批次的崩溃用一个被 `SIGKILL` 杀掉的真实子进程。命令用真实的 `systemd-run`、门进程与 `systemctl`：这些用例只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行，其余情况显示为跳过，跳过不是通过。它们起的单元名以 `omne-host-` 或 `omne-test-gate-` 开头，用例结束时停止，文件结束时核对没有残留。平台前提的测试改变本测试进程的真实环境（`PATH` 与用户管理器的变量），之后恢复。Cordis 装载用真实 Cordis 4.0.4。授权决定、账本与守卫用替身。替身就绪不证明真实授权或数据耐久。测试通过不代替规格或验收。

## 维护

SPEC 的行为变化时，同步对应测试与本目录 `index.md`。宿主文件使用的测试覆盖已接受的行为，改它们之前先确认对应的行为已重新接受。

## 本包事实

现在有十六个测试文件，快层共二百三十八个测试（在 Windows 上，其中六十四个只在 Linux 运行而跳过），另有一个测试辅助：

- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果：点名、空字节、未解析、符号链接、对象替换、关闭失败、代次、尾部斜杠、目录、快照与错误路径的描述符保留。
- [host-files.spec.ts](host-files.spec.ts)：工作区目录外的读取、字节范围、查看、新建、父目录核对、预期版本与相对路径拒绝。
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：没有 `/proc/self/fd` 的宿主上，八项操作返回 `unavailable` 且不触碰文件系统；配置了根时全部操作返回 `unavailable`；没有根时已接受的四项照常。文件名沿用旧名，在 Linux 上把 `process.platform` 换成 `win32`，在 Windows 上是真实平台。
- [host-file-tree.spec.ts](host-file-tree.spec.ts)：列表、搜索、建目录、删除、移动、复制，没有根：成功、各项拒绝、未知；分页与排序、符号链接不跟随、搜索的三个预算、递归删除不进入链接、不覆盖、替换时旧读者仍读到旧字节、跨设备为 `unsupported`。
- [host-file-root.spec.ts](host-file-root.spec.ts)：宿主文件根，只在 Linux：根外路径与同名前缀的邻居、`..`、指向根外的符号链接（中间段与最后一段）、硬链接各一条用例，每条前后比较根与根外的快照；删除或改名硬链接的根内名只让根外对象的链接数减 1；目录被换成链接时新建、移动、建目录仍落在原目录；走到中间段时被换成链接；根被换成另一个目录；根打不开；有根时的四项照常。
- [host-file-batch.spec.ts](host-file-batch.spec.ts)：提交批次与恢复批次：成功与清单；提交前的各项拒绝不写任何东西；第 k 项冲突；发布失败；字节相同但没有回执；运行中为 `pending`；门面封住为 `closed`；没有状态目录；他租户读不到；进程在发布中途被杀之后新进程读到 `interrupted`（慢层）。
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态在写入、读取、查看与新建后的版本一致；根目录查看；显式零起点。
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实（版本、平台、设施键 `files` 与 `command`、前提三态之一、配额域、空资源枚举与对意外资源答不支持）、租约内容、拒绝、经登记表门的账本关闭、无在途操作时的退役、界值核对与退役通知；命令启动的 `terminal` 与 `geometry` 答 `unsupported`、非法输入答 `invalidInput`，都不调用账本；命令选项的界值。
- [host-command.spec.ts](host-command.spec.ts)：真实 systemd 用户 scope 里的命令，慢层，只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行：三行输出的次序与偏移、退出码与单元清理、只给显式环境与标准输入、映像起不来答 `unavailable`、超过缓冲上限的整块丢弃与偏移缺口、门一侧在帧管道写满时暂停命令且恢复后不丢字节、平和停止确认与超时不升级、强制停止清掉进程树、主进程退出后清掉后台进程、单调用中断、释放与配置重载时的强制停止、账本不许可时不起命令、启动超时答未知并在释放时停止、另一个责任域列举并恢复单元、旧启动的单元与别的单元。
- [host-command-frames.spec.ts](host-command-frames.spec.ts)：不起 scope，两个平台：帧按任意字节边界读取、各类非法帧使读取失效、整块丢弃与计数、读者取走后腾出空间、单一读者、读者放弃后的丢弃计数、停止确认只认 `inactive` 或 `not-found`、只读回本提供者写下的单元引用、监督工具的上界带小数时照常运行、起不来的工具答失败（起一个普通的 Node 子进程）。
- [host-probe.spec.ts](host-probe.spec.ts)：平台前提：不是 Linux 时启动答 `unavailable` 而 `files` 照常（只在非 Linux 运行，派发者在 Windows 复跑）；`PATH` 里没有 `systemd-run` 时答 `unavailable` 且诊断写明缺项；用户管理器可达时 `satisfied`；去掉用户管理器的变量时答 `unavailable`，恢复变量并过了重探间隔后可以启动。
- [host-provider-drain.spec.ts](host-provider-drain.spec.ts)：退役等在途文件操作、超界待处置与诊断，含经 Cordis 卸载的日志。用 `vi.mock` 让带标记路径的 `open` 停住，其余是真实文件系统。
- [host-domain.spec.ts](host-domain.spec.ts)：责任域的真实文件与描述符证据。排空一份获取只停止它自己的命令进程，确认之后才结清（这一条只在 Linux 且设了 `OMNE_HOST_COMMAND_LINUX=1` 时运行）。释放时一份获取排空、待处置不返还名额、另一份获取照常；读取后关闭失败与错误路径的描述符归原获取，退役不报已排空，维护重试在租约失效后关闭它；同一文件的两份获取代际不碰撞，一份获取关不了另一份的句柄；同一责任域内提供者重载后共用配额与原记录，新代查询与结清旧获取，旧租约不复活；重建登记表后经恢复路径结清原获取；降低配额不抹旧占用，最后一个名额只一个获取得到，全局上界单独报告；责任域没有签发过的代答未知而不答未分配；未知文件结果下结清容量不改字节。用 `vi.mock` 让带标记路径的 `open` 停住，并让活描述符上的 `close` 按计数失败，其余是真实文件系统。
- [contract-conformance.spec.ts](contract-conformance.spec.ts)：登记表（经两个端口替身）与宿主提供者通过契约套件，套件拒绝五种故障的登记表。
- [ports.ts](ports.ts)：测试辅助，不是测试文件：环境授权与可信绑定两个端口服务的替身。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、`filesFacilityPlugin`、`commandFacilityPlugin` 与宿主文件插件的装载与卸载，两个声明都在时 `files` 加 `command` 落在同一个宿主提供者、`terminal` 仍缺，经租约读文件，恢复授权服务的现取，两个访问端口服务缺席时答不可用、绑定到别的租户时答无权，经服务撤除提供者的重试，待处置时卸载照常完成并记入 `ctx.logger`，作用域释放使宿主租约失效，宿主文件插件的配置（含命令的界值与两个绝对路径），命令声明插件只接受空配置。
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合，根入口可达的模块与门进程脚本不导入 Cordis。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment-host-local test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

运行记录：PanQiWei 接受时只在 Node v26.0.0、darwin 上运行过。当前的运行记录见 SPEC [组合与验证](../SPEC.md#组合与验证)。

当前缺口：契约意义的授予根（宿主提供者不声称它）、根内的挂载点、起点之外设备上的递归搜索与删除、macOS、同一 isolate 标签下重复装载、配置校验失败，都没有测试。真实的 `failed` 单元状态没有构造出来，只有判断函数的测试。具名维护者由负责人指定。
