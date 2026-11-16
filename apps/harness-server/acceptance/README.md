# harness-server 发行验收

本目录保存在发行装配上跑的持续场景，对应产品验收页里[工具执行的 S4、S5](../../../.meta_harness/design/product/tool-execution/acceptance.md)。场景起真实的发行树（真实的 Session、Agent、Tool 与 SQLite 存储），模型换成脚本化网关，命令行用构建后的 `omne`。

从仓库根运行：

```sh
pnpm --workspace-concurrency=1 --filter @omne-harness/harness-server... -r run build
pnpm --filter @omne-harness/harness-server run acceptance
```

| 场景                                                           | 触发与观察                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [S4](PD-tool-execution.background-wakes-session.acceptance.ts) | 模型让一条长命令发起即后台。前台位置得到占位，这一轮结束。命令结束后，历史里有一条来源为后台工具执行、带命令输出的提醒，并自动开始新的一轮。账本里这次调用只启动一次，会话里这次调用的账目与账本一致，不因转后台多出一份。 |
| [S5](PD-tool-execution.stop-one-background-call.acceptance.ts) | 两条长命令都在后台。`omne calls stop` 停其中一条，回执是受理；`omne calls show` 之后读到 `stopped` 与 `interrupted`。被停的那条不产生提醒，另一条照常完成并回到会话。                                                      |

每条场景在标准输出写一行 JSON，`result` 为 `PASS` 或 `FAIL`，`observed` 是判定用到的观察。断言失败时 Vitest 以非零退出码结束。等待只等实际条件，单个条件最多等两分钟。

场景要求宿主能运行 `/bin/sh` 的一次性命令。它们不证明跨进程恢复、真实模型或多租户隔离。
