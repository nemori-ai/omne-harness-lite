## 改变

卡 #1655（会话推进线第 1 程；修复主题 #1611、#1612 名下）。

改前，一轮以失败停下后，Agent 实例的执行槽一直记为 `failed`：同一会话的新一轮 `invoke` 一直答忙，同一 execution 的 `resume` 也答忙，宿主的 `contact` 仍答在跑，只有重启服务端能解。到步数上限时若有排着的输入，这一轮永远不结束。2026-11-25 负责人在桌面端一天里四次卡死，导火索各不相同（取消的时序、收尾提交超过命令上限、步数上限时排着输入），后果都落在这两处。

改后：

- 驱动停下时报告一次并把执行槽交回（`run-lifecycle` 模型的应然 D-31）。execution 在日志里仍未终结，留给之后的挂接。
- 宿主的 `contact` 按运行时自己的报告答：实例空闲或占着别的 execution 时答已失联。
- 以失败为结论的收尾不因待交输入被挡回；循环守卫收尾可以带着已受理未取走的输入终结。输入保留待处理资格。

没有做：让停下的 execution 自己终结；被取消轮次在 Agent 一侧的取消收束；交入回执的证据来源；开轮风暴。范围与理由在卡的 spec 评论。

## 验证

ADMISSION_PLACEHOLDER

- 成员用例（快层与慢层）：`agent-contract` 856；`agent` 1657；`agent-host-local` 145 加慢层 39；`session-contract` 1042 加慢层 1；`session-storage-sql` 797 加慢层 106；`session-adapters` 1677 加慢层 24；`session` 362 加慢层 26；`harness-server` 的 `tests/rows/agent-host` 慢层 36。全部通过。
- 先红后绿：槽位一组与 contact 一组的用例在去掉修复时变红（3 条与 2 条）；步数上限的新用例在旧行为下空转不结束；生成式用例去掉修复时反例缩到 `[["halts"]]`。
- 形式模型（TLC 1.7.4）：`run-is`、`run-ought`、`live-ought` 通过；`bad-driver-swallows-p3` 违反 `P3_StopVisible`；`bad-is-no-terminate-l3` 违反活性。
- 发行组合上的复现（独立装配、替身模型，第二句恰在第 50 步到达）：改前这一轮 4 分钟后仍 `not ended`、停服退出码 5；改后以 `failed` 终结、停服退出码 0。
- 没验的：取消的时序竞争没有在发行组合上复现（两种时机各一次都正常收场）；会话恢复接手一个停下的 execution 的整条路没有在发行组合上跑过；结构读数与差分变异没有跑。

## 审阅重点

- `packages/agent/agent/src/provider.ts` 的 `failRun`：槽位交回之后有没有别的路径还假设「停下的 execution 占着槽位」。
- `packages/agent/agent-host-local/src/contact.ts`：已预留与排空中答在跑，空闲与占着别的 execution 答已失联，这条边界对不对。
- `packages/session/session-contract/src/judgments.ts` 的 `judgeCompletion`：失败的结论放行，完成与取消仍被挡回。

## 所含的卡

- #1655：无

## 契约变化

- packages/session/session-contract：additive。`judgeCompletion` 加可选的第三个参数 `conclusion`，不传时行为不变；两个发行摘要常量随源文件重算。契约工具报 `review`（它证明不了函数加可选参数是可加的），判断见卡评论。
- packages/agent/agent-contract：none。`endsWithUntakenInput` 的签名不变，只多认一种失败种类。
