# @omne-harness/skill-host-local 行为规格

本规格拥有 `@omne-harness/skill-host-local` 公开类型以外的行为：目录来源怎样取快照、怎样读条目字节、怎样判定链接是否在包根之内，以及文件系统接缝的错误怎样分类。数据形状的唯一来源是 `src/` 的公开类型。来源端口的公共要求归 `@omne-harness/skill-contract` 的[需求端口](../skill-contract/SPEC.md#ports)，本规格不重写它们，只写本来源自己承担的部分。失败映射表的唯一正文是 [README「Behavior」](README.md#behavior)（[中文](README_ZH.md#行为)）。

## 范围与依据

本规格是候选，尚未取得技术接受。下文「本版本」指成员版本 0.0.0。

| 依据                                        | 修订        | 本规格采用的范围                                                                                                                                                                                              |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [组工程设计](../docs/architecture.md)       | `b0f2ec7fb` | 「端口」中的 `DirectorySource` 段与映射表                                                                                                                                                                     |
| [Skill 契约规格](../skill-contract/SPEC.md) | `b0f2ec7fb` | [需求端口](../skill-contract/SPEC.md#ports)、[快照](../skill-contract/SPEC.md#snapshot)、[来源失败的集合](../skill-contract/SPEC.md#set-source-failures)、[符合性套件](../skill-contract/SPEC.md#conformance) |
| W2 领域设计裁定                             | 2026-11-03  | 工厂与文件系统接缝的形状；定位的种类；失败映射；快照的条目集合；取快照后改文件时 `open` 交出新字节；无类、无类型断言                                                                                          |
| W3 Skill 线实施规格已定事项 12 与第 2 轮裁定 R6 | 2026-11-04 | 真实目录示例 `examples/directory-journey.ts` 与它的测试；示例不是产品装配 |

各裁定的内容写在下文对应的条款里。

## 结果与不变量

<a id="locator"></a>

### 定位

- 本来源只认 `{ kind: 'directory', root }`。`root` 是本机文件系统的路径，相对路径按进程当前目录解析。
- 本来源不按内容摘要存放包。`snapshot` 与 `open` 收到 `content-store` 定位时答 `package-not-found`，不读文件系统。

<a id="root"></a>

### 包根

- 来源先用 `realpath` 解析 `root`，并核对解析结果是目录。下文的「根」指解析后的路径。`root` 自己是链接时，以它所指的目录为根。
- 根名是根的最后一段。根是文件系统的根目录（`/`）时没有根名，这时答 `package-not-found`，不遍历文件系统。这是根名唯一的核对处：`sealSnapshot` 因此不会答 `invalid-root-name`，它若答了，来源以错误拒绝，因为这是来源的缺陷。
- 根不是目录（包括根是普通文件），或解析后的根不是严格的 UTF-8，答 `package-not-found`。

<a id="snapshot"></a>

### 快照

`snapshot` 每次调用都读当前目录，按下列规则交出 `sealSnapshot` 造出的快照：

1. 来源递归读根下的全部目录。条目是普通文件。目录不是条目，空目录不产生条目。
2. 隐藏文件与 `.omne` 目录都是普通内容，照常进入快照。
3. 名字在文件系统上是字节。来源把列出的每个名字按严格的 UTF-8 解码，名字开头的 BOM 留在名字里。一次列出中有名字不是 UTF-8 时，来源在访问这次列出的任何名字之前答 `entry-unreadable`。
4. 条目的包内路径是从根起的各段名字，用 `/` 连接。连成的路径不是合法的 `PackagePath`（例如含反斜杠或控制字符）时，答 `entry-unreadable`。
5. 每个条目都走同样的步骤，与列出时报告的种类无关：
   1. 用 `realpath` 解析条目，并把结果按严格的 UTF-8 解码。解码失败答 `entry-unreadable`。
   2. 解析找不到对象（`ENOENT`）时，来源用 `lstat` 看条目自己：条目还在，它是悬空的链接，答 `entry-unreadable`。条目已不在，它在列出之后消失，答 `unavailable`。
   3. 按[根内判定](#inside)核对解析结果。
   4. 用 `lstat` 读解析结果的种类。目录就遍历它，普通文件就读它，其他对象（设备、管道、套接字）答 `entry-unreadable`。
6. 链接指向根内的文件时，条目路径是链接自己的路径，字节是所指文件的字节。链接指向根内的目录时，来源以链接的路径为前缀继续遍历那个目录。
7. 解析结果是根本身，或是从根到当前位置路径上的某个目录时，遍历会成环，答 `entry-unreadable`。
8. 来源读文件时不跟随最后一段的链接。文件在第 5 步之后被换成链接时，打开得到 `ELOOP`，答 `entry-unreadable`。打开的对象是目录时，遍历期间目录树变了，答 `unavailable`。打开的对象是其他非普通文件时，答 `entry-unreadable`。
9. <a id="budget"></a>一次遍历最多访问 65536 个名字。每次列出的每个名字计一次访问，链接多次到达同一目录时也计入。第 65537 次访问答 `entry-unreadable`。理由：不成环的链接也能使访问次数倍增，每层两个链接指向下一层时，深度 n 访问 2^n 次。字节总量不设上限，因为契约本来就把整个包读进内存。
10. 遍历是深度优先的。在每个目录内，来源按名字的 UTF-16 码元序访问，遇到第一个失败就停止，答这个失败。所以一个包有多处缺陷时，答复不随文件系统列出名字的次序而变。
11. 来源把根名与全部条目交给 `sealSnapshot`。目录遍历不会产生重复路径或前缀冲突。接缝列出重名时，`sealSnapshot` 答 `duplicate-path` 或 `prefix-conflict`，来源答 `entry-unreadable`。

<a id="open"></a>

### 读条目

- `open` 读 `根/path` 此刻的字节。它不使用快照，也不比较字节与快照中的条目内容摘要。这一核对由调用方做。
- `open` 不读 `digest` 参数：本来源不按内容摘要存放字节。所以符合性套件的 PS7 对本来源不适用。
- `open` 先用 `realpath` 解析 `根/path`，按严格的 UTF-8 解码，再按[根内判定](#inside)核对，然后不跟随最后一段的链接打开解析结果。解析结果不是 UTF-8 时答 `entry-not-found`。
- 打开的对象是目录时答 `entry-not-found`：目录不是条目。是管道等其他对象时答 `unavailable`。

<a id="inside"></a>

### 根内判定

- 一个解析后的路径在根内，当且仅当它等于根，或者它按路径分隔符切开的各段以根的各段开头。来源比较整段，不比较字符串前缀。所以 `/x/pkg-sibling/a` 不在根 `/x/pkg` 内。
- `snapshot` 对每个条目的解析结果做这一判定。判定失败答 `outside-package`，整个包不可读。
- `open` 对 `根/path` 的解析结果做这一判定。判定失败答 `outside-package`。

<a id="seam"></a>

### 文件系统接缝

- 来源只经 `DirectoryFs` 的四个读操作访问文件系统。没有给出接缝时，来源使用 `node:fs/promises`。
- 接缝只做读取。`readdir` 以字节交出名字，`realpath` 以字节交出解析后的路径。`readFile` 不跟随最后一段的链接、以不等待写者的方式打开路径：打开的是普通文件时交出字节，否则只报告种类（目录或其他）。所以列出之后被换成管道的文件不会使读取一直等待。
- 接缝以带字符串 `code` 字段的错误表示文件系统拒绝。来源只按 `code` 分类，不解析错误消息。全部分类表在 `src/walk.ts` 一处，映射见 [README「Behavior」](README.md#behavior)。表中没有列出的 `code` 答 `unavailable`。
- 不带字符串 `code` 的错误不是文件系统的答复。来源不把它收束成来源失败，而是让 `snapshot` 或 `open` 以这个错误拒绝。

## 所有权、失败与生命周期

- 来源没有状态：没有索引、没有缓存，两次调用之间不保留任何内容。所以进程重启不改变判定，同一实例两次快照之间的修改在第二次快照中可见。
- 一次 `collect` 调用持有一份遍历状态（已读文件与访问计数），只在这次调用内可见。
- 每次读文件时，默认接缝打开一个文件句柄，并在返回前关闭它。调用之间来源不持有文件句柄或其他资源，没有需要撤除的资源。
- 来源只读文件系统，没有外部效果。
- 端口没有取消参数。`snapshot` 与 `open` 运行到结束。
- 快照不是原子的。遍历期间有别的写者修改目录时，快照可能混合修改前后的内容。来源不检测这种情况。调用方在读取时用条目内容摘要核对字节，见[组工程设计「读取」](../docs/architecture.md#读取)。
- <a id="residual-window"></a>来源不保护包免受读取期间修改包目录的写者影响。条目在核对之后被换成指向根外的链接时，来源拒绝它（第 5、8 步）。仍有一个窗口：写者在核对之后、打开之前，把解析后路径上的某个目录换成链接，打开会跟随这个链接，因为 Node.js 打开一个路径时无法不跟随中间各段的链接。

## 组合与验证

本来源满足 `@omne-harness/skill-contract` 修订 `b0f2ec7fb` 的 `skillPackageSourceConformance()`，PS7 不适用。

命令：在成员目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试经包名导入 `dist`，所以先构建再测试。证明一条用例会变红时，先改源码、重新构建 `dist`，再运行用例。

每条判据写明使它变红的反例，也就是实现中的一个具体缺陷。下表每个反例都曾实际改进源码、重新构建并运行，对应的用例变红。

| 判据                                                                                       | 反例：使用例变红的缺陷                                                                         | 用例                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 快照来自 `sealSnapshot`，包不变时两次快照相等，`open` 交出的字节与条目相符（PS1–PS6、PS8） | 把目录当作条目推入快照：PS1、PS2 变红                                                          | `tests/conformance.spec.ts`                                                                        |
| 根内判定按整段比较                                                                         | 改成字符串前缀比较：「兄弟目录名以根名为前缀」变红                                             | `tests/links.spec.ts`                                                                              |
| 每个条目先解析、核对在根内，再读                                                           | 去掉条目的根内判定：根外链接与「列出之后被换成根外链接」变红                                   | `tests/links.spec.ts`、`tests/swap.spec.ts`                                                        |
| 文件打开时不跟随最后一段的链接                                                             | 去掉 `O_NOFOLLOW`：「核对种类之后被换成链接」与 `open`「解析之后被换成链接」交出根外字节，变红 | `tests/swap.spec.ts`                                                                               |
| 名字与解析后的路径按严格的 UTF-8 解码，BOM 留在名字里                                      | 有损解码：非 UTF-8 文件名变红；有损解码解析后的路径：链接一例变红；去掉 BOM：BOM 一例变红      | `tests/encoding.spec.ts`                                                                           |
| 访问预算 65536                                                                             | 去掉预算：65537 与扇出各例变红；把 `>` 写成 `>=`：「恰好 65536」变红                           | `tests/budget.spec.ts`                                                                             |
| 解析得到 `ENOENT` 时分开悬空与消失                                                         | 都答 `entry-unreadable`：「链接在列出之后消失」变红；不看条目自己：悬空各例变红                | `tests/permissions.spec.ts`、`tests/links.spec.ts`                                                 |
| 每张分类表的每个 code                                                                      | 从表中删去任一 code：对应的 `it.each` 行变红                                                   | `tests/permissions.spec.ts`、`tests/open.spec.ts`、`tests/conformance.spec.ts`                     |
| 打开的对象不是普通文件时的答复                                                             | 改动任一种类的映射：对应用例变红                                                               | `tests/permissions.spec.ts`、`tests/open.spec.ts`、`tests/links.spec.ts`                           |
| 成环、非常规对象、非法包内路径、重名、根为 `/`、根是文件、根名用解析后的根                 | 改动对应分支：对应用例变红                                                                     | `tests/links.spec.ts`、`tests/snapshot.spec.ts`、`tests/open.spec.ts`、`tests/permissions.spec.ts` |
| 多处缺陷的答复与列出次序无关                                                               | 去掉排序：注入倒序列出的一例变红                                                               | `tests/links.spec.ts`                                                                              |
| 不缓存                                                                                     | 缓存第一次的遍历：`tests/race.spec.ts` 两例变红                                                | `tests/race.spec.ts`                                                                               |
| 不带 `code` 的错误原样抛出                                                                 | 把它收束成一个 code：对应用例变红                                                              | `tests/permissions.spec.ts`                                                                        |
| 读管道不等待写者                                                                           | 去掉 `O_NONBLOCK`：`open` 读管道一例超时                                                       | `tests/open.spec.ts`                                                                               |
| 失败类型封闭在六种来源失败；入口的运行时导出                                               | 类型或导出改变时类型用例失败                                                                   | `tests/types.spec-d.ts`、`tests/public-entry.spec.ts`                                              |
| 真实目录示例 `examples/directory-journey.ts`：两个合法包与一个读不了的包（没有 `SKILL.md`），`inspect` 两过一拒，拒绝原因是 `manifest-missing`；name 与目录名不同的包被接受，带兼容提示 `name-differs-from-root`；`summaries` 只列读取判定准许的那一个合法包，被检查拒绝的包不出现；`search` 按说明找到它；`read` 在 `describe` 钉下的材料上读正文第一页，与 `SKILL.md` 正文一致；`describe` 与 `read` 之间包被改动时 `read` 答 `basis-unavailable`。读取判定与对应端口由测试经 `standIns` 交给示例，是 `skill-contract/testing` 的内存替身；示例自己不造替身，也不是产品装配 | 示例不记下检查的拒绝，把被拒的包当作空目录跳过：「inspects two legal packages…」变红（W3-M16）；读取不带 `describe` 钉下的依据：「answers basis-unavailable when the package changes between describe and read」变红（W3-M15） | `tests/examples.spec.ts` |

未覆盖：

- 真实文件权限位造成的 `EACCES`。测试以 root 运行时 `chmod` 造不出它，所以权限类失败只经注入的接缝验证。
- 并发写者。只有注入接缝在确定步骤上替换条目的用例，没有并发修改同一目录的压力测试。[残余窗口](#residual-window)没有用例。
- 单个文件的大小与字节总量没有上限。
- Windows 路径。`O_NOFOLLOW` 在 Windows 上不存在。
