# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块                                                  | 职责                                                                              | 依赖                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [src/index.ts](../src/index.ts)                       | 公开根：`createDirectorySource` 与 `DirectoryFs` 类型                             | 下面两个模块                                                |
| [src/directory-source.ts](../src/directory-source.ts) | 把定位分派到遍历或读条目；把遍历结果交给 `sealSnapshot`；把快照缺陷映射为来源失败 | `walk.ts`、`fs.ts`、`@omne-harness/skill-contract/provider` |
| [src/walk.ts](../src/walk.ts)                         | 解析根、递归遍历、解析链接、根内判定、四张错误分类表；`collect` 与 `readEntry`    | `fs.ts`、`@omne-harness/skill-contract`                     |
| [src/fs.ts](../src/fs.ts)                             | `DirectoryFs` 接缝、默认接缝 `nodeFs`、按 `code` 收束拒绝的 `attempt`             | `node:fs/promises`、`@omne-harness/operation-result`        |

依赖只向下：`directory-source.ts` → `walk.ts` → `fs.ts`。本包只依赖 Skill 契约与 `operation-result`，不认识 `@omne-harness/skill` 或任何调用方。

本包没有长期状态。一次 `collect` 调用持有一个局部的文件列表与遍历位置，调用返回后丢弃。默认接缝每读一个文件就打开并关闭一个文件句柄。

## 关键机制与理由

- **文件系统接缝。**来源只经四个读操作访问文件系统。理由：容器内测试以 root 运行，`chmod` 造不出 `EACCES`。接缝让权限类失败可以在任何用户下测试。接缝只有读操作，所以注入的实现也不能让来源写文件。
- **按 `code` 分类，一处决定。**四张分类表都在 `walk.ts`：根（`ROOT`）、链接（`LINK`）、包内读（`READ`）与 `open`（`OPEN`）。`fs.ts` 的 `attempt` 把拒绝收束为表中的失败，表外的 `code` 为 `unavailable`。不带 `code` 的错误原样抛出：它说明接缝或来源有缺陷，收束成来源失败会把缺陷变成普通答复（见[防御指导 DP-01](../../../../docs/defensive-patterns.md#dp-01-独立事实分别报告)）。
- **根内判定按整段比较。**`isWithin` 把两个路径按分隔符切开再逐段比较。字符串前缀比较会把根 `/x/pkg` 的兄弟 `/x/pkg-sibling` 当成根内。`snapshot` 与 `open` 共用这一个函数。
- **根先解析。**根自己是链接时，根内判定与根名都以解析后的目录为准。否则包内的绝对链接会因根的写法不同而得到不同答复。
- **成环检测。**每个遍历位置记下从根到它的解析后目录。链接解析到其中之一时答 `entry-unreadable`。实际路径有限，所以无限下降必然重访这条路径上的某个目录，检测因此完整。
- **确定的第一个失败。**每个目录按名字的码元序遍历。文件系统列出名字的次序不固定，排序使多处缺陷的包总是得到同一个答复。
- **非阻塞读。**默认接缝以 `O_NONBLOCK` 打开文件并核对打开的对象。列出之后被换成管道的文件以 `EINVAL` 拒绝，读取不会等待写者。
- **没有类与类型断言。**接缝、来源与遍历位置都是对象字面量与函数。品牌值只经契约的守卫取得：包内路径经 `isPackagePath`，快照经 `sealSnapshot`。

## 验证与维护

保证与测试的对应见 [SPEC「组合与验证」](../SPEC.md#组合与验证)。改分类表时，同步 README 的「Behavior」与「行为」两节和 `tests/permissions.spec.ts`。改根内判定时，`tests/links.spec.ts` 中「兄弟目录名以根名为前缀」一例必须仍然通过。
