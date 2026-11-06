# W3 波末的三张小卡（草稿）

来源：卡 #1119 W3 的评审与交回。发卡前按 `docs/engineering/agent-delivery.md` 核对登记方式。

发布结果（2026-11-06，负责人在问题卡片中选「做完关卡」：只发本会话能在 W4 期间做完的两张）：
- 第 1 张 → #1155（integration 线，D-01 已定更正标注，评论 6684623059）。#184 登记 6684604225。
- 第 3 张 → #1156（tool-exec 线）。#184 登记 6684604590。
- 第 2 张（测试运行器）不发：工作量大，不能马上做完。正文草稿留在 `cards/card-2-test-runner-mutation.md`，列入 W3 报告评论的待办。
- 两张都挂在 #1119 下，Project 4 状态 Backlog，标签与正文一致（`labels-cli.ts` 的 add、remove 为空）。正文定稿在 `cards/`。

## 1. RFC-0001 的 MCP SDK 版本与现行实现不一致

- 现象：RFC-0001 第 4 版写 `@modelcontextprotocol/client`、`server` 各 2.3.1。负责人 2026-11-04 定按 2.4.0（参考服务端的依赖要求），catalog 已钉 2.4.0，`mcp-host-local` 按 2.4.0 实现与核对（成员 SPEC「范围与依据」）。MCP 组页与组入口转述 RFC 的行，各加了一句「W3 实际采用 2.4.0」。
- 要做：RFC-0001 的拥有者把版本行改为 2.4.0，并写明 W2 探路结论在 2.4.0 上由 `mcp-host-local` 的测试重新确认；之后组页与组入口删去那一句注。
- 依据：`waves/w3/writeback-triage.md` W-5 与裁定；`compat/README.md`「2026-11-04 更正」与之后各节。

## 2. 测试运行器：差分变异在两个场景下读数无效

- 现象 1：Stryker 对改动行的变异里，有的变异让每条调用口用例都挂住，运行器记「没跑测试」并判整次测量无效，不给分数（`w3-mcp-call` 第 4 轮 D 面：338 个变异体里 4 个）。直接运行同一变异时用例超时，实际是被杀。
- 现象 2：Stryker 的沙箱目录建在 `packages/` 下，变异在跑的时候，别的会话在同一棵树上跑 `lint:deps` 或 `metrics` 会读到沙箱里的文件而失败（`w3-mcp-call` 第 4 轮 A 面第一次读数）。
- 要做：运行器把「挂住」判为超时并计作被杀（或单列，不使整次无效）；沙箱放到 `packages/` 之外，或让依赖与度量工具排除它。
- 依据：`waves/w3/reviews/mcp-call-r4.md` 的 D 面与 A 面记录。

## 3. `mcp-host-local` 测试夹具的 12 ms 静默窗口

- 现象：`tests/fixtures/scripted/stdio.ts` 第 104–112 行的 `received()` 把对端 stderr 静默 12 ms 当作对端已经记完。机器负载高时，计数断言偶发为 0（I01、N01 各出现一次，单独重跑通过）。
- 要做：对端在记完时发出明确的完成信号，夹具等这个信号，不按时间窗判断。只改这一个夹具文件和脚本化对端。
- 依据：`delegate/handbacks/w3-mcp-host-fix4.md` 第 73、213 行；`waves/w3/reviews/mcp-host-r4.md` 第 822 行。
