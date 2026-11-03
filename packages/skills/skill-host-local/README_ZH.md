# @omne-harness/skill-host-local

[English](README.md)

本地 Skill 宿主。它提供 `createDirectorySource`：一个从本地目录读取 Skill 包当前内容的 `SkillPackageSource`。

## 职责与状态

本成员拥有 Skill 包字节的一种来源：目录来源。它读目录的当前内容，不建索引，也不缓存。它把每种文件系统拒绝答成 `@omne-harness/skill-contract` 来源失败集合中的一种。它不检查包、不判定访问，也不比较字节与快照。这些工作归 `@omne-harness/skill`。

状态：行为是候选，尚未取得技术接受。本来源在真实临时目录上通过契约套件 `skillPackageSourceConformance()`（PS7 不适用）。本成员的 Cordis 插件部分不在本版本。

## 使用

建一个来源，交给它目录定位：

```ts
import { createDirectorySource } from '@omne-harness/skill-host-local'

const source = createDirectorySource()
const locator = { kind: 'directory', root: '/path/to/review' } as const
const snapshot = await source.snapshot(locator)
if ('ok' in snapshot)
  for (const entry of snapshot.ok.entries) {
    const bytes = await source.open(locator, snapshot.ok.digest, entry.path)
  }
```

示例 [examples/inspect-directory.ts](examples/inspect-directory.ts) 对 [examples/sample-skill/](examples/sample-skill/) 取快照，读两个控制文件，再交给 `parseSkillPackage`。测试可以给出自己的文件系统接缝：`createDirectorySource({ fs })`。本成员没有 Cordis 入口，需要 Node.js 24 或更高版本。

## 行为

来源只经 `DirectoryFs` 的四个读操作访问文件系统。它按错误的 `code` 字段分类拒绝，不解析错误消息。表中没有列出的 `code` 答 `unavailable`。不带字符串 `code` 的错误不是文件系统的答复：`snapshot` 或 `open` 以这个错误拒绝。

| 情形                                                                                        | `snapshot`          | `open`              |
| ------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| `content-store` 定位                                                                        | `package-not-found` | `package-not-found` |
| 根目录不在或不是目录（`ENOENT`、`ENOTDIR`）                                                 | `package-not-found` | `package-not-found` |
| 根目录解析为文件系统的根 `/`，或解析为不是 UTF-8 的路径                                     | `package-not-found` | `package-not-found` |
| 根目录不可读（`EACCES`、`EIO` 与其他 code）                                                 | `unavailable`       | `unavailable`       |
| 条目是设备、管道或套接字                                                                    | `entry-unreadable`  | —                   |
| 列出的名字或条目解析后的路径不是严格的 UTF-8                                                | `entry-unreadable`  | —                   |
| 文件名连不成合法的包内路径，或接缝把一个名字列出两次                                        | `entry-unreadable`  | —                   |
| 链接悬空：所指对象不在，链接自己还在                                                        | `entry-unreadable`  | —                   |
| 链接成环（`ELOOP`），或指向根目录、指向包内位于它之上的目录                                 | `entry-unreadable`  | —                   |
| 条目无法解析，或读不出解析结果的种类（`ELOOP`、`ENOTDIR`、`EACCES`、`EPERM`、`EIO`）        | `entry-unreadable`  | —                   |
| 目录无法列出，或文件无法打开（`EACCES`、`EPERM`、`EIO`、`ENXIO`）                           | `entry-unreadable`  | —                   |
| 文件在来源核对之后被换成链接（来源打开它时得到 `ELOOP`）                                    | `entry-unreadable`  | —                   |
| 来源打开文件，得到的既不是普通文件也不是目录                                                | `entry-unreadable`  | —                   |
| 一次遍历访问的名字超过 65536 个                                                             | `entry-unreadable`  | —                   |
| 条目、链接或解析结果在列出之后消失（`ENOENT`）                                              | `unavailable`       | —                   |
| 来源打开文件，得到的是目录：遍历期间目录树变了                                              | `unavailable`       | —                   |
| 条目解析后落在解析后的根目录之外                                                            | `outside-package`   | —                   |
| 路径不在或在文件之下（`ENOENT`、`ENOTDIR`），是目录，或解析为不是 UTF-8 的路径              | —                   | `entry-not-found`   |
| 路径解析后落在解析后的根目录之外                                                            | —                   | `outside-package`   |
| 文件无法打开（`EACCES`、`EPERM`、`EIO`、`ELOOP` 与其他 code），或是管道等不是普通文件的对象 | —                   | `unavailable`       |

其他规则：

- 根目录自己是链接时，来源以它所指的目录为根。根名是那个目录的最后一段。
- 名字在文件系统上是字节。来源把每个名字和每个解析后的路径按严格的 UTF-8 解码。名字开头的 BOM 留在名字里。
- 每个条目都走同样的步骤，与列出时报告的种类无关：来源先解析它，核对解析结果在根内，再读解析结果的种类，然后遍历或读取。
- 一个路径等于根，或它的各段以根的各段开头时，它在根内。来源比较整段，不比较字符串前缀。
- 来源打开文件时不跟随最后一段的链接，也不等待写者。文件在核对之后被别的写者换成链接时，来源拒绝它。
- 一次遍历最多访问 65536 个名字。计数包括每次列出的每个名字，链接多次到达同一目录时也计入。不成环的链接也能使访问次数倍增：每层两个链接指向下一层，深度 n 时访问 2^n 次。字节总量不设上限，因为契约本来就把整个包读进内存。
- 隐藏文件与 `.omne` 目录是普通内容。目录（包括空目录）不是条目。
- 遍历是深度优先的。在每个目录内，来源按名字的 UTF-16 码元序访问，遇到第一个失败就停止。列出的名字中有不是 UTF-8 的，这次列出在访问任何名字之前就失败。所以有两处缺陷的包总是得到同一个答复。
- `open` 读此刻的字节。本来源不按内容摘要存放字节，所以它不使用 `digest` 参数。调用方用条目内容摘要核对字节。文件在取快照之后被改时，`open` 交出新字节。

来源不保护包免受读取期间修改包目录的写者影响。仍有一个窗口：写者在核对之后、打开之前，把解析后路径上的某个目录换成链接，打开会跟随这个链接，因为 Node.js 打开一个路径时无法不跟随中间各段的链接。目录在列出之前变成链接时，来源只得到名字，并在读取任何内容之前逐个核对名字是否在根内。

本行为的其他规则归 [SPEC.md](SPEC.md)。

## 契约

`src/` 的公开类型拥有数据形状。端口要求归 [Skill 契约的需求端口](../skill-contract/SPEC.md#ports)。[SPEC.md](SPEC.md) 拥有本来源在端口之外的行为，上面的[行为](#行为)一节拥有失败映射。[docs/public-api.md](docs/public-api.md) 导航公开定义。来源在调用之间不持有资源，所以没有需要撤除的东西。

## 设计

三个模块完成工作。`fs.ts` 提供文件系统接缝及其基于 `node:fs/promises` 的默认实现。接缝只做读取：它以字节交出名字与路径，并报告打开的对象是什么种类。`walk.ts` 读根目录、遍历目录、解析每个条目、做根内判定、计数访问，并分类每种答复与拒绝。`directory-source.ts` 把遍历接到 `sealSnapshot` 与两个端口操作上。见 [docs/architecture.md](docs/architecture.md)。

## 配置与运行

唯一的选项是文件系统接缝 `fs`，默认读真实文件系统。来源只读，没有状态，所以进程重启不改变答复。快照不是原子的：遍历期间别的写者修改目录时，快照可能混合新旧内容。调用方用条目内容摘要发现之后的修改。一次遍历最多访问 65536 个名字。来源不限制单个文件的大小或字节总量。

## 验证

在本目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试经包名导入，包名解析到 `dist`，所以先构建。测试使用 `mkdtemp` 建的真实临时目录。root 进程用 `chmod` 造不出 `EACCES`，所以权限测试使用注入的接缝。见 [tests/README.md](tests/README.md) 与 [SPEC.md](SPEC.md) 的验证一节。

## 维护

`@omne-harness/skill-contract` 的端口要求变化时，重跑符合性套件，同步 SPEC.md 与「行为」一节。失败映射变化时，同步两份 README 的「行为」一节、权限测试与组工程设计 [../docs/architecture.md](../docs/architecture.md)。消费者是 `@omne-harness/skill`，经 `SkillPackageSource` 端口。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态、行为与本地图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义导航
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义与实现
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema（本成员没有）
verification/             models/ 与 proofs/（本成员没有）
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源（本成员没有）
acceptance/               独立验收；fixtures/ 放验收输入
```

每个目录有说明职责的 README.md 与导航用的 index.md。阅读路径见 [index.md](index.md)。`acceptance/` 由独立验收者维护。
