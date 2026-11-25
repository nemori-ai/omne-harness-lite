## spec（修订 1）

# 一轮失败时必定收场并让出位置

- 卡：本卡，交付修订 1
- 起点：`integration/mainline`@`02a9e3103d46239ee032117cf942c8085a8065f5`
- PR：未开

## 要解决的问题

2026-11-25 负责人在桌面端一天里四次会话卡死，只有重启服务端能解。按服务端日志与独立装配上的复现，它们是两个互相独立的缺口：

1. **一轮以失败停下后，实例的执行槽永久占用。** `packages/agent/agent/src/provider.ts` 的 `failRun` 把槽位置为 `failed`，全文件没有任何地方清它；它对外报「占用」，新受理答忙，同一 execution 的 `resume` 也答忙；宿主的 `contact` 只要实例对象在就答在跑，所以会话的恢复既发现不了、也接不了手。让一轮「以失败停下」的导火索已见四种：取消的时序（`stale-advance`）、提交答 `changed`（#1319）、强杀后重启（#1404）、收尾提交超过存储的命令上限（`command_limit`）。形式模型 `run-lifecycle` 早已把它登记为已知偏离：应然 D-31 是「节点失败结束 Run 并释放槽位」，实然 R2-D285 是「槽位记为失败、Run 不结束」。
2. **到步数上限时排着输入，这一轮永远不结束。** 到 `maxRunSteps` 时 Agent 把「取输入」改判为以守卫失败收尾，不再取输入；Session 的收尾核对在还有待处理、未交入的输入时不让收场，Agent 契约的 `endsWithUntakenInput` 也不许守卫失败带着未取走的输入终结。Agent 不取，两边都不放。

## 做什么

| 改动 | 位置 | 行为 |
| --- | --- | --- |
| 驱动停下后让出执行槽 | `agent/src/provider.ts` | 报告一次（不变），槽位交回；`failed` 这个槽位状态删除。execution 在日志里仍未终结，留给之后的挂接 |
| contact 按运行时自己的报告答 | `agent-host-local/src/contact.ts`（新）、`host.ts` | 宿主运行着的实例：占着被问的 execution、已预留、排空中答在跑；空闲或占着别的 execution 答已失联，证据是宿主的 `runtime-released`。宿主不运行的实例照旧只认装配的证据 |
| 收尾核对带上结论 | `session-contract/src/judgments.ts`、`session-storage-sql/src/worker/check.ts`、`session-adapters/src/testing/factory.ts` | `judgeCompletion` 多一个可选参数；结论是失败时不因待交输入答被挡回。完成与取消不变 |
| 守卫收尾可带未取走的输入 | `agent-contract/src/finishing.ts` | `endsWithUntakenInput` 在节点故障、拓展件叫停之外加上循环守卫 |

规格同步：`packages/agent/SPEC.md`（AG-15、驱动停下一条、失联判断一条、以失败终结一条）、`packages/session/SPEC.md`（条件终结核对待交输入一句）、`run-lifecycle` 的模型与对照页。

## 不做什么

- 不让停下的 execution 自己终结：收尾提交被确定拒绝时，Agent 写不下终态；本程只保证它不占位、可被接手。
- 不做被取消轮次在 Agent 一侧的取消收束，不改交入回执的证据来源，不查开轮风暴，不动每步读写量与界面显示。
- 不改「失败后等人」的产品规则：失败的一轮结束后，排着的输入保留待处理，等人重试或再发一句。

## 验收标准

见卡正文 C1 到 C7。

## 不能声称的事

- 取消的时序竞争没有在发行组合上复现（两种时机各一次都正常收场，与 #1404 的记录一致）；槽位让出由成员级用例与生成式用例验证。
- 会话恢复接手一个停下的 execution 的整条路（contact 失联 → detach → claim → resume）没有在发行组合上跑过：各段由各自成员的既有用例守着，本程只改了 contact 的答复。
- 收尾提交为什么会超过命令上限没有查，属于后面的程。

## 风险级别

- 级别：L2。取卡上写的与 `pnpm run risk` 推出的两者中高的那个。
