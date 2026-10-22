# 核对包的公开导出

本工具把一个已构建成员的公开入口与它的机读导出清单比较，再把清单与公开接口页比较。成员的测试以子进程运行它，产品源码不导入它。

## 运行

先构建成员，再在仓库根运行：

```sh
node --experimental-strip-types tools/dev-flow/src/package-exports/cli.ts packages/<组>/<成员> [--inventory <路径>] [--json]
```

清单默认是成员的 `tests/fixtures/exports.json`。退出码：

| 退出码 | 含义 |
| --- | --- |
| 0 | 构建产物、清单与公开接口页一致 |
| 1 | 有差异，每条差异一行；`--json` 时在 `report.problems` |
| 2 | 无法核对：清单读不到或字段不合形状、没有 `package.json` 导出表、入口未构建、清单的 `source` 页不存在 |

## 清单的形状

清单的类型定义在 [inventory.ts](inventory.ts)。工具逐字段解码清单。未知字段与错误取值退出 2，不放宽比较。

- `entries` 的键等于 `package.json` 的 `exports` 子路径，例如 `.`、`./testing`、`./cordis`。每个入口按公开接口页的章节列出名字。
- `kind` 取 `type`、`value`、`class` 或 `both`。`both` 表示同名的值与类型。仅以 `export type` 重导出的值按 `type` 计。
- `sameAs` 表示本入口只重导出该名字。取值是本包的入口子路径，或另一个包的模块说明符。工具核对两处是同一声明。
- `pending` 表示名字已在清单中、实现未进入。`expectedPending` 必须等于标记数。
- `augmentations` 列出 `declare module` 增补。工具读取入口能到达的本包全部声明文件，未登记的增补也报告。

## 核对什么

1. 清单的入口集合等于 `package.json` 的导出子路径。章节不为空，同一入口内名字不重复。
2. 每个入口的构建导出恰好等于清单：没有缺失、没有未登记、种类一致、`sameAs` 指向同一声明。
3. 模块增补的成员恰好等于清单。
4. 公开接口页的每个清单章节链接声明这些名字的 `src/` 文件。页内代码块不再次声明清单里的名字。链接的 `src/`、`tests/` 文件存在。

本工具只核对导出与导航。行为、契约语义和文档正文的接受不由它判断。

仅重导出类型时，使用显式名字（`export type { Name }`）。公共编译器 API 不保留星号重导出的类型专用来源。可达声明使用 `export type *` 时，CLI 返回 `cannot-check` 并退出 2，不把这些名字误报为运行值。
