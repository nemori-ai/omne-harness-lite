# Windows 文件后端

本页说明 Windows 文件后端的机制。它与 SPEC 的对应节同为未接受。行为以 [SPEC 的 Windows 文件后端](../SPEC.md#windows-文件后端未接受)为准，公共形状归[设施接口](../../execution-environment-contract/src/facilities/files.ts)，对象确认归[宿主文件使用](../SPEC.md#宿主文件使用)。Windows 写入采用 [R2-D38](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6579990443) 的新建与替换语义。Linux 是原位写。

| 操作                              | 未配置根                   | 配置根                     |
| --------------------------------- | -------------------------- | -------------------------- |
| read、stat、close                 | 文件辅助进程与引擎句柄代次 | 文件辅助进程与引擎句柄代次 |
| list、search、mkdir、remove、move | 文件辅助进程               | 文件辅助进程               |
| write、copy                       | 文件辅助进程，新建或替换   | 文件辅助进程，新建或替换   |
| commitBatch、recoverBatch         | 逐项操作加批次清单         | 逐项操作加批次清单         |

支持范围限本机盘符绝对路径。UNC、设备命名空间、备用数据流和含歧义尾部字符的名字不在支持范围内。含未配对代理项的请求路径也不在支持范围内：辅助进程用 .NET 的 JSON 解析器读帧，它把未配对代理项换成 U+FFFD，这条路径会指向另一个名字。后端在发请求之前答 `unsupported`。

## 文件辅助进程

文件辅助进程是一个常驻的原生进程，每个 harness 进程一个。各文件引擎与 `hostObjectToken` 共用它。

- 编译：辅助进程的 C# 源码内嵌在 TypeScript 产物里。第一次使用时，后端用 `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 编译它。产物按源码的 SHA-256 缓存在系统临时目录的 `omne-windows-files/<摘要>/files.exe`。编译与缓存和命令后端共用同一个函数。后端不安装 SDK 或原生包，也不使用 PowerShell。
- 帧：请求与答复都是一行 JSON。请求带一个全进程唯一的编号，编号跨辅助进程的重启也不复用。帧的解析只在一个模块里完成。
- 并发：辅助进程在线程池上执行每个请求。答复帧在持锁时写出，所以两帧不会交错。
- 句柄：每个请求在自己的线程里打开所需的句柄，写答复帧之前关闭它们。辅助进程不在请求之间保留句柄或根的身份。
- 化身：辅助进程的每次启动是一个化身。答复帧只在化身、编号都匹配并且请求仍在途时生效。重复的帧、编号不在途的帧和损坏的帧使这个化身失效：后端停止它，丢弃之后读到的帧，在途请求在进程退出后答未知。

失败的处理见 SPEC 的「失败」一段。这些规则由形式模型 [FilesHelper.tla](../verification/models/README.md#fileshelper) 检查。

## 句柄和对象确认

文件引擎首次使用根时记录根的对象 token，之后的获取共用此身份。首次绑定失败可以重试。已绑定的根被替换时拒绝操作。

请求路径的前几段要与配置的根相同，才算在根下。盘符与大小写不同的段按文字比较。写法不同的段（例如 8.3 短名与长名）在根自己的父目录下不跟随链接比较：两个名字是同一目录项（卷序号与文件 ID 相同）才算相同（R2-D374）。其他名字的联接即使指向根也不算。根以下的段不归一，仍由辅助进程逐段打开。路径越出根、含 `..` 或形式不合格时返回 `notAuthorized`。这个判断由根入口的 `hostSegmentsBelowRoot` 提供，在后端前面判断路径的守卫用同一个（R2-D376）。

配置的根本身是联接或符号链接时不受支持。后端经文件辅助进程记下根的身份，不跟随最后一段，得到的是链接本身，所以这样的根上 `list` 与 `stat` 返回 `notAuthorized`。其余操作在这样的根上不作保证。根要用真实路径配置；发行在读配置时取工作区的真实路径。

每个请求打开根（未配置根时打开盘符根），再通过 `NtCreateFile` 的 `RootDirectory` 逐段打开子项。辅助进程保留全部祖先句柄。有根时拒绝中间重解析点和跨卷项。无根时中间的链接按路径重新打开以跟随它，与 POSIX 跟随祖先链接相同；最后一段仍不跟随。空段与 `.` 段不进入逐段打开；路径以 `.` 段结尾时，最后一段按中间段打开。`FILE_OPEN_REPARSE_POINT` 使辅助进程检查链接本身。内容操作在实际句柄上核点名对象及硬链接数，之后才读取。对象 token 是卷序号与 128 位文件 ID，取自 `GetFileInformationByHandleEx(FileIdInfo)`。辅助进程的每次打开都带 `FILE_SHARE_READ`、`FILE_SHARE_WRITE` 与 `FILE_SHARE_DELETE`。

`list` 通过 `NtQueryDirectoryFile` 枚举已打开目录，条目名来自目录项。`search` 按字节序深度优先遍历，保留配置的条目、字节及单文件预算，不进入重解析目录。遇到以不共享读的方式被别的进程打开的文件时跳过它，并把结果标为 `truncated`。共享冲突在打开这一项时接住，不结束整次遍历。分页靠每页从头重走：第 n 页要走到第 n 页之后的下一个命中为止，每页的代价随页号增加，仍受条目与字节预算限制。辅助进程不为分页保留缓存。

`mkdir` 在持有的父目录句柄下创建。`remove` 在源句柄上设置 `FileDispositionInformationEx`，标志是 `FILE_DISPOSITION_DELETE`、`FILE_DISPOSITION_POSIX_SEMANTICS` 与 `FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE`，不重新按绝对路径找到目标。递归删除先预检目录树。`move` 用源句柄和持有的目标父目录句柄设置 `FileRenameInformationEx`，标志是 `FILE_RENAME_POSIX_SEMANTICS` 与 `FILE_RENAME_IGNORE_READONLY_ATTRIBUTE`，替换时另加 `FILE_RENAME_REPLACE_IF_EXISTS`。目标点名与实际改名之间仍存在目标被替换的窗口，效果限于该父目录的目标名。

别的进程以不允许删除的方式打开了对象时，打开要删除或改名的对象得到共享冲突，答 `busy`。递归删除的预检也以删除的权限打开每一项，所以这时什么都不删。NTFS 不允许改名子树里有打开文件的目录，并以拒绝访问答复。目录改名得到拒绝访问时，辅助进程以添加子目录的权限重新打开目标父目录：能打开就答 `busy`，打不开就答 `notAuthorized`。替换已有目标时不做这一区分。

错误码到原因的映射只有 `native-source.ts` 里的一张表。表外的错误为未知。可能留下效果的失败不按表映射，答未知。

## 收尾与未闭合项

辅助进程在写答复帧之前关闭这个请求的原生句柄。结果中的句柄代次仍由原引擎签发和核所有者。它不表示仍有原生句柄打开。门面封闭及获取排空继续归共同生命周期：封闭由门面准入守，辅助进程不查所有者的封闭；已经准入的请求照常做完，排空等它们结束。

已产生部分目录效果后的错误返回 unknown。调用方不能据此自动重做。已发生的创建、删除或移动不会因辅助进程退出而回滚。

Windows 不提供原位写。新建与替换都先在同目录以 `NtCreateFile` 的 `FILE_CREATE` 建临时对象 `.omne-write-<guid>`，写入并 `FlushFileBuffers`。新建以不替换的改名发布，目标名已被占用时答 `conflict`。替换再核对目标身份和 `expectedVersion`，最后按上文 `move` 的标志发布。目标名上不会出现写了一半的文件。发布持有临时对象与父目录句柄。发布之前目标没有变化：临时对象删掉之后，失败按错误映射答拒绝，磁盘满（`ERROR_DISK_FULL`、`ERROR_HANDLE_DISK_FULL`）答 `capacity`。临时对象删不掉时答未知。版本是观察条件，不是外部 CAS。结果返回新对象以及 `writeEffect: created` 或 `replaced`。原文件的其他硬链接保留旧字节，替换后与目标名字分离。新对象继承父目录的 ACL。

`copy` 是两个辅助进程请求。第一个请求像读取那样打开并核对源，像 `move` 那样核对目标，再从源句柄按 1 MiB 的块读，写进目标父目录句柄下的临时对象 `.omne-copy-<uuid>`，`FlushFileBuffers` 之后答复。答复带临时对象、源和目标当时的身份，目标不变。第二个请求重新打开目标父目录，按 token 核对临时对象，再按写入的规则发布：目标原来不存在时不替换，原来存在时再核一次目标与它当时的版本。两个请求失败时都先删除临时对象，删掉之后答拒绝，删不掉或找不到它时答未知，它留在目标旁。复制不经 JSON 传字节，辅助进程的内存占用与文件大小无关。

写入保留路径末尾分隔符的含义。新建路径以 `/` 或 `\` 结束时返回 `invalidInput`。替换普通文件时，末尾分隔符使结果为 `unresolved`，原文件保持不变。

批次先检查全部目标，再记录清单、刷盘全部暂存文件，随后逐项发布并刷盘回执。暂存文件是目标旁的 `.omne-batch-<批次 id>-<序号>`，由逐项的新建写入。暂存中途失败时，批次删除已写的暂存文件。全部删掉、失败的那一步又是拒绝时，批次删除清单并答这个拒绝。否则答 `unknown`，与 Linux 相同不带批次引用。发布因冲突或封闭停止时，批次删除未发布的暂存文件。删不掉的暂存文件经诊断 `temporaryFileRemains` 报告：带批次 id、目标路径、暂存文件名，删除被拒绝时 `code` 是拒绝原因。回执写入失败返回带原批次引用的 unknown。恢复只读原清单及当前目标，不重新发布。当前字节匹配暂存摘要时只列入 `matchingPrepared`，不补造发布回执。后续外部写入列为冲突，目标是目录或链接的项也列为冲突。批次间没有多路径原子性，也未验证断电耐久性。效果未知时保留尚存暂存文件，供后续调查。

每项发布的异步目标复核结束后，批次再次检查所有者是否封闭。封闭时返回原批次的 `unknown/closed`，保留已确认发布范围，并清理未发布暂存文件。此检查阻止尚未启动的发布，不撤销已经开始的原生操作。

## 延迟的测量

目标见 SPEC。测量在同一台机器上进行：辅助进程已经启动，编译缓存已经存在。`stat`、`read`（4 KiB）、`list`（100 项）与 `write`（4 KiB 替换）各运行 200 次，记录 p50 与 p95。同一组用例在同一台机器的 WSL ext4 上对照运行。第一个请求的启动时间单独记录，不计入 p50。

## 验证

真实 Windows 测试见[有根与无根同一后端](../tests/windows-files/unified.spec.ts)、[根的不同写法](../tests/windows-files/path-alias.spec.ts)、[读取与围栏](../tests/windows-files/read.spec.ts)、[名字操作](../tests/windows-files/tree.spec.ts)、[别的进程打开着的对象](../tests/windows-files/sharing.spec.ts)、[新建与替换](../tests/windows-files/write.spec.ts)、[复制与批次](../tests/windows-files/batch.spec.ts)、[搜索与不能读的项](../tests/windows-files/search.spec.ts)及[流式复制的内存](../tests/windows-files/copy-stream.spec.ts)（慢层）。磁盘满没有自动测试：不用管理员权限构造不出满的卷。这些测试不证明 Linux 行为、完整提供者组合或断电恢复。

[边界回归](../tests/windows-files/review-regressions.spec.ts)覆盖空版本、缺失对象映射，以及发布前复核期间封闭的交错。交错测试只暂停真实 stat 的返回，或在复制的发布请求写给辅助进程之前暂停它，不替换文件系统结果。
