# Windows 文件后端

本页说明 Windows 文件后端的机制。它与 SPEC 的对应节同为未接受。行为以 [SPEC 的 Windows 文件后端](../SPEC.md#windows-文件后端未接受)为准，公共形状归[设施接口](../../execution-environment-contract/src/facilities/files.ts)，对象确认归[宿主文件使用](../SPEC.md#宿主文件使用)。Windows 写入采用 [R2-D38](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6579990443) 的新建与替换语义。Linux 是原位写。

| 操作                              | 未配置根                   | 配置根                     |
| --------------------------------- | -------------------------- | -------------------------- |
| read、stat、close                 | 文件辅助进程与引擎句柄代次 | 文件辅助进程与引擎句柄代次 |
| list、search、mkdir、remove、move | 文件辅助进程               | 文件辅助进程               |
| write、copy                       | 文件辅助进程，新建或替换   | 文件辅助进程，新建或替换   |
| commitBatch、recoverBatch         | 逐项操作加批次清单         | 逐项操作加批次清单         |

支持范围限本机盘符绝对路径。UNC、设备命名空间、备用数据流和含歧义尾部字符的名字不在支持范围内。

## 文件辅助进程

文件辅助进程是一个常驻的原生进程，每个 harness 进程一个。各文件引擎与 `hostObjectToken` 共用它。

- 编译：辅助进程的 C# 源码内嵌在 TypeScript 产物里。第一次使用时，后端用 `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 编译它。产物按源码的 SHA-256 缓存在系统临时目录的 `omne-windows-files/<摘要>/files.exe`。编译与缓存和命令后端共用同一个函数。后端不安装 SDK 或原生包，也不使用 PowerShell。
- 帧：请求与答复都是一行 JSON。请求带一个全进程唯一的编号，编号跨辅助进程的重启也不复用。帧的解析只在一个模块里完成。
- 并发：辅助进程在线程池上执行每个请求。答复帧在持锁时写出，所以两帧不会交错。
- 句柄：每个请求在自己的线程里打开所需的句柄，写答复帧之前关闭它们。辅助进程不在请求之间保留句柄或根的身份。
- 化身：辅助进程的每次启动是一个化身。答复帧只在化身、编号都匹配并且请求仍在途时生效。迟到的帧与重复的帧被丢弃。

失败的处理见 SPEC 的「失败」一段。这些规则由形式模型 [FilesHelper.tla](../verification/models/README.md#fileshelper) 检查。

## 句柄和对象确认

文件引擎首次使用根时记录根的对象 token，之后的获取共用此身份。首次绑定失败可以重试。已绑定的根被替换时拒绝操作。

请求路径的前几段要与配置的根相同，才算在根下。盘符与大小写不同的段按文字比较。写法不同的段（例如 8.3 短名与长名）在根自己的父目录下不跟随链接比较：两个名字是同一目录项（卷序号与文件 ID 相同）才算相同（R2-D374）。其他名字的联接即使指向根也不算。根以下的段不归一，仍由辅助进程逐段打开。路径越出根、含 `..` 或形式不合格时返回 `notAuthorized`。这个判断由根入口的 `hostSegmentsBelowRoot` 提供，在后端前面判断路径的守卫用同一个（R2-D376）。

配置的根本身是联接或符号链接时不受支持。后端用 `lstat` 记下根的身份，得到的是链接本身，所以这样的根上 `list` 与 `stat` 返回 `notAuthorized`。其余操作在这样的根上不作保证。根要用真实路径配置；发行在读配置时取工作区的真实路径。

每个请求打开根（未配置根时打开盘符根），再通过 `NtCreateFile` 的 `RootDirectory` 逐段打开子项。辅助进程保留全部祖先句柄，并拒绝中间重解析点和跨卷项。`FILE_OPEN_REPARSE_POINT` 使辅助进程检查链接本身。内容操作在实际句柄上核点名对象及硬链接数，之后才读取。对象 token 是卷序号与 128 位文件 ID，取自 `GetFileInformationByHandleEx(FileIdInfo)`。辅助进程的每次打开都带 `FILE_SHARE_READ`、`FILE_SHARE_WRITE` 与 `FILE_SHARE_DELETE`。

`list` 通过 `NtQueryDirectoryFile` 枚举已打开目录，条目名来自目录项。`search` 按字节序深度优先遍历，保留配置的条目、字节及单文件预算，不进入重解析目录。遇到以不共享读的方式被别的进程打开的文件时跳过它，并把结果标为 `truncated`。

`mkdir` 在持有的父目录句柄下创建。`remove` 在源句柄上设置 `FileDispositionInformationEx`，标志是 `FILE_DISPOSITION_DELETE`、`FILE_DISPOSITION_POSIX_SEMANTICS` 与 `FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE`，不重新按绝对路径找到目标。递归删除先预检目录树。`move` 用源句柄和持有的目标父目录句柄设置 `FileRenameInformationEx`，标志是 `FILE_RENAME_POSIX_SEMANTICS` 与 `FILE_RENAME_IGNORE_READONLY_ATTRIBUTE`，替换时另加 `FILE_RENAME_REPLACE_IF_EXISTS`。目标点名与实际改名之间仍存在目标被替换的窗口，效果限于该父目录的目标名。

## 收尾与未闭合项

辅助进程在写答复帧之前关闭这个请求的原生句柄。结果中的句柄代次仍由原引擎签发和核所有者。它不表示仍有原生句柄打开。门面封闭及获取排空继续归共同生命周期。

已产生部分目录效果后的错误返回 unknown。调用方不能据此自动重做。已发生的创建、删除或移动不会因辅助进程退出而回滚。

Windows 不提供原位写。新建以 `NtCreateFile` 的 `FILE_CREATE` 实现排他创建，对应 `CREATE_NEW`。替换先在同目录创建新对象，写入并 `FlushFileBuffers`，再核对目标身份和 `expectedVersion`，最后按上文 `move` 的标志发布。发布持有源与父目录句柄。版本是观察条件，不是外部 CAS。结果返回新对象以及 `writeEffect: created` 或 `replaced`。原文件的其他硬链接保留旧字节，替换后与目标名字分离。新对象继承父目录的 ACL。

`copy` 在辅助进程里按块流式复制：从源句柄读，写进目标父目录句柄下的临时对象，刷盘之后按替换的规则发布。临时对象写失败时删除它；删除失败时经诊断 `temporaryFileRemains` 报告名字。

写入保留路径末尾分隔符的含义。新建路径以 `/` 或 `\` 结束时返回 `invalidInput`。替换普通文件时，末尾分隔符使结果为 `unresolved`，原文件保持不变。

批次先检查全部目标，再记录清单、刷盘全部暂存文件，随后逐项发布并刷盘回执。回执写入失败返回带原批次引用的 unknown。恢复只读原清单及当前目标，不重新发布。当前字节匹配暂存摘要时只列入 `matchingPrepared`，不补造发布回执。后续外部写入列为冲突，目标是目录或链接的项也列为冲突。批次间没有多路径原子性，也未验证断电耐久性。效果未知时保留尚存暂存文件，供后续调查。

每项发布的异步目标复核结束后，批次再次检查所有者是否封闭。封闭时返回原批次的 `unknown/closed`，保留已确认发布范围，并清理未发布暂存文件。此检查阻止尚未启动的发布，不撤销已经开始的原生操作。

## 延迟的测量

目标见 SPEC。测量在同一台机器上进行：辅助进程已经启动，编译缓存已经存在。`stat`、`read`（4 KiB）、`list`（100 项）与 `write`（4 KiB 替换）各运行 200 次，记录 p50 与 p95。同一组用例在同一台机器的 WSL ext4 上对照运行。第一个请求的启动时间单独记录，不计入 p50。

## 验证

真实 Windows 测试见[根的不同写法](../tests/windows-files/path-alias.spec.ts)、[读取与围栏](../tests/windows-files/read.spec.ts)、[名字操作](../tests/windows-files/tree.spec.ts)、[新建与替换](../tests/windows-files/write.spec.ts)及[复制与批次恢复](../tests/windows-files/batch.spec.ts)。这些测试不证明 Linux 行为、完整提供者组合或断电恢复。

[边界回归](../tests/windows-files/review-regressions.spec.ts)覆盖空版本、缺失对象映射，以及发布前复核期间封闭的交错。交错测试只暂停真实 stat 的返回，不替换文件系统结果。
