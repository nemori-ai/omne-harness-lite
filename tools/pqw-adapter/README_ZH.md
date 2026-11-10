# pqw-adapter

[English](README.md)

收口读数的适配层。它按 omne 的成员、阈值与测试分层调用 pqw `slice-closeout` 自带的两个脚本，并按改动路径推出风险级别。本成员不发布。

## 命令

在仓库根运行。`<起点>` 是基线提交。基线不是 HEAD 的祖先时，三个命令都改用它与 HEAD 的合并点，与 pqw 的取法一致。改动文件是合并点到工作树的全部改动，含未提交与未跟踪的文件。

```sh
pnpm run closeout:metrics -- --base <起点> [--scope <路径>...] [--full] [--out <目录>] [--workers N]
pnpm run closeout:mutation -- --base <起点> [--scope <路径>...] [--files <路径>...] [--plan-only] [--max-lines N] [--out <目录>]
pnpm run risk -- --base <起点>
```

- `closeout:metrics`：改动文件按成员分组。命令先用 turbo 构建有 `test` 脚本的改动成员及其上游，再在每个成员目录跑一遍 vitest 覆盖率（lcov）。然后它对每个成员调一次 pqw `metrics.mjs`。不归任何成员的改动文件另调一次，只量复杂度，不跑覆盖率。缺省只跑快层；`--full` 快慢两层都跑，pqw 对两份 lcov 取并。圈复杂度与 CRAP 用同一对线，取自 `repo-toolchain.config.json` 的 `metrics.thresholds`。断言模式取自 `loop.sensors.assertions.assertionPattern`。命令打印不超过 12 行的摘要，再列出每个成员的 JSON 路径。
- `closeout:mutation`：命令先对每个改动成员调 `mutation.mjs --plan-only`，列出范围。范围合计超过 `--max-lines`（缺省 600 行）时，命令拒绝运行并退出 2。没给 `--plan-only` 时，命令构建成员的上游，再对每个成员调一次 `mutation.mjs --project`，最多同时跑 3 个成员。变异只跑快层，配置是 [`resources/vitest-fast.config.mts`](resources/vitest-fast.config.mts)。存活不影响退出码。测量无效时退出 1。
- `risk`：按改动路径推出风险级别的下限，并打印命中的路径规则。级别的定义归 [quality.md](../../docs/engineering/quality.md#按风险选择接受实现的看法)。工具链路径从 `origin/github-gate`（没有时读本地 `github-gate`）的 `gate/toolchain-paths.txt` 读，由 git 按 pathspec 匹配。读不到这份清单时，命令照样打印级别并标「不完整」，然后退出 1。

产物缺省写在系统临时目录的 `omne-closeout/<提交>[-dirty]/` 下，在工作树之外。用 `--out` 可以改位置。

## 退出码

| 码  | 含义                                               |
| --- | -------------------------------------------------- |
| 0   | 正常                                               |
| 1   | 构建失败、读数失败、变异测量无效，或风险规则没判全 |
| 2   | 用法错误，或变异范围超过上限                       |

## 不做的事

适配层不计算圈复杂度、CRAP，不做基线配对或 TypeScript 解析，也不拼 Stryker 配置。这些归 pqw。成员预算、重复代码、依赖方向与环归 repo-toolchain 与 `pnpm run lint:deps`。
