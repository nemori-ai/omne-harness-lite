# Windows 文件后端

本页说明 Windows 文件后端的实现范围。公共形状归[设施接口](../../execution-environment-contract/src/facilities/files.ts)，对象确认归[宿主文件使用](../SPEC.md#宿主文件使用)。Windows 写入采用 [R2-D38](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6579990443) 的新建与替换语义。Linux 原位写不变。

| 操作                              | 未配置根         | 配置根                     |
| --------------------------------- | ---------------- | -------------------------- |
| read、stat、close                 | 既有 Node 实现   | 原生句柄桥及原引擎句柄代次 |
| list、search、mkdir、remove、move | 原生句柄桥       | 原生句柄桥                 |
| write                             | 原生新建或替换   | 原生新建或替换             |
| copy、commitBatch、recoverBatch   | 原生桥与批次记录 | 原生桥与批次记录           |

公共 P2 探测仍未声明 Windows 整体满足。不能根据部分操作成功，宣称整个提供者的平台前提已满足。支持范围限本机盘符绝对路径。UNC、设备命名空间、备用数据流和含歧义尾部字符的名字不在此实现范围。

## 句柄和对象确认

每次原生操作启动系统目录中的 Windows PowerShell。PowerShell 用系统 .NET Framework 编译内嵌 C#，没有额外 SDK 或原生依赖。固定脚本通过标准输入接收 JSON，请求路径不作为脚本执行。

引擎首次使用根时记录设备号和文件索引，之后的获取共用此身份。首次绑定失败可以重试。已绑定的根被替换时拒绝操作。

请求路径的前几段要与配置的根相同，才算在根下。盘符与大小写不同的段按文字比较。写法不同的段（例如 8.3 短名与长名）在根自己的父目录下不跟随链接比较：两个名字是同一目录项（卷序号与文件索引相同）才算相同（R2-D374）。其他名字的联接即使指向根也不算。根以下的段不归一，仍由桥逐段打开。路径越出根、含 `..` 或形式不合格时返回 `notAuthorized`。

每个请求打开根，再通过 `NtCreateFile` 的 `RootDirectory` 逐段打开子项。桥保留全部祖先句柄，并拒绝中间重解析点和跨卷项。`FILE_OPEN_REPARSE_POINT` 使桥检查链接本身。内容操作在实际句柄上核点名对象及硬链接数，之后才读取。对象 token 使用卷序号和 64 位文件索引，与 `hostObjectToken` 的设备号、inode 表示一致。

`list` 通过 `NtQueryDirectoryFile` 枚举已打开目录，条目名来自目录项。`search` 按字节序深度优先遍历，保留配置的条目、字节及单文件预算，不进入重解析目录。

`mkdir` 在持有的父目录句柄下创建。`remove` 用源句柄的删除标记，不重新按绝对路径找到目标。递归删除先预检目录树。`move` 用源句柄和持有的目标父目录句柄改名。目标点名与实际改名之间仍存在目标被替换的窗口，效果限于该父目录的目标名。

## 收尾与未闭合项

桥在返回前关闭原生句柄，调用方等待 PowerShell 进程退出后才消费答复。结果中的句柄代次仍由原引擎签发和核所有者。它不表示仍有原生描述符打开。门面封闭及获取排空继续归共同生命周期。

已产生部分目录效果后的错误返回 unknown。调用方不能据此自动重做。已发生的创建、删除或移动不会因进程退出而回滚。

Windows 不提供原位写。新建以 `NtCreateFile` 的 `FILE_CREATE` 实现排他创建，对应 `CREATE_NEW`。替换先在同目录创建新对象，写入并 `FlushFileBuffers`，再核对目标身份和 `expectedVersion`，最后通过 `NtSetInformationFile(FileRenameInformation)` 发布。发布持有源与父目录句柄，`ReplaceIfExists` 采用原子替换语义。版本是观察条件，不是外部 CAS。结果返回新对象以及 `writeEffect: created` 或 `replaced`。原文件的其他硬链接保留旧字节，替换后与目标名字分离。

桥将未提供的版本传为 JSON null，并另传版本是否存在给原生入口，避免 PowerShell 把 null 转为空字符串后丢失条件。显式空字符串仍参与版本比较。新建、复制和批次预检遇到所需对象缺失时返回 `rejected/notFound`。读取、查看、列表和替换写入仍可返回 `unresolved`。

写入保留路径末尾分隔符的含义。新建路径以 `/` 或 `\` 结束时返回 `invalidInput`。替换普通文件时，末尾分隔符使结果为 `unresolved`，原文件保持不变。

复制读取已点名源，再通过相同写入路径发布新对象。批次先检查全部目标，再记录清单、刷盘全部暂存文件，随后逐项发布并刷盘回执。回执写入失败返回带原批次引用的 unknown。恢复只读原清单及当前目标，不重新发布。当前字节匹配暂存摘要时只列入 `matchingPrepared`，不补造发布回执。后续外部写入列为冲突。批次间没有多路径原子性，也未验证断电耐久性。效果未知时保留尚存暂存文件，供后续调查。

每项发布的异步目标复核结束后，批次再次检查所有者是否封闭。封闭时返回原批次的 `unknown/closed`，保留已确认发布范围，并清理未发布暂存文件。此检查阻止尚未启动的发布，不撤销已经开始的原生操作。

真实 Windows 测试见[根的不同写法](../tests/windows-files/path-alias.spec.ts)、[读取与围栏](../tests/windows-files/read.spec.ts)、[名字操作](../tests/windows-files/tree.spec.ts)、[新建与替换](../tests/windows-files/write.spec.ts)及[复制与批次恢复](../tests/windows-files/batch.spec.ts)。回执故障用例使用真实文件系统，只注入清单写入失败。这些测试不证明 Linux 行为、完整提供者组合或断电恢复。

[边界回归](../tests/windows-files/review-regressions.spec.ts)覆盖空版本、缺失对象映射，以及发布前复核期间封闭的交错。交错测试只暂停真实 stat 的返回，不替换文件系统结果。

排空测试在 Windows 上暂停真实原生进程的输入流，放行后执行实际写入。回执故障测试让 PowerShell 完成原生写入和清理后，在输出答复前以非零码退出。原请求保持 unknown，已写字节仍存在；后续另次 stat 和 close 不改写原请求的结果。此注入不证明系统 CloseHandle 真正失败或进程崩溃的全部行为。
