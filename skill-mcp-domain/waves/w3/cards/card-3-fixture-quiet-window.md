# MCP 本地宿主｜测试夹具用 12 ms 静默窗口判断对端已记完，高负载下计数断言偶发为 0

**接手本卡**

1. 先读当前修订、评论、条件和现存attempt。在本Issue评论声明认卡，写明负责的人、会话/agent实例、权限依据及现存执行核对结果。
2. 已获本卡派发时按该授权接手；尚未派发时向指定调度者请求领取。由授权调度者登记并读回唯一attempt，不能凭Assignee或认卡留言抢占执行。
3. 开工前核对[当前执行与交接](#当前执行与交接)中的分支、基线、写范围和task context。不涉及Git交付时明确不适用，仍须履行认卡和状态更新。
4. 在开工、关键进展、阻塞或范围变化、可审阅候选、暂停/接续和交付时及时交回事实。获授权的正文单写者更新摘要，指定调度者更新Project Stage。已有权限时直接执行并读回，不重复请示。
5. 交付时给出成果、验证和剩余责任，由有权者接受。有效决定读回后完成关闭与看板对账。部分接受不销整卡。

具体规则归[交付操作](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/agent-delivery.md)和[交付协议](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/delivery.md)。

## 身份与责任

- 交付层级：subtask
- 主工作类型：maintenance
- 交付线：tool-exec
- 性质：impl
- 契约变更：none
- 交付修订：1
- 创建操作标识：fixture-quiet-window-20261106-1
- 父交付卡：https://github.com/nemori-ai/omne-harness-lite/issues/1119
- 责任范围：`packages/mcp/mcp-host-local` 的 B 层测试夹具中，脚本化 stdio 对端的“已收到”读取。不含产品源码。
- 卡负责人、主结果接受者及授权依据：PanQiWei。PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。2026-11-06 PanQiWei 在 Claude Code 会话中对开卡问题回答：发卡 1 与卡 3，「做完关卡」，由卡 #1119 的执行会话在 W4 期间做完并关卡。
- 受影响语义拥有者：`mcp-host-local` 成员拥有者 PanQiWei。不涉及产品或契约成员。
- 调度者与执行者：卡 #1119 的执行会话（Claude Code，代 PanQiWei），在 #1119 的 W4 期间实施。
- 正文单写者：同上。

判定理由：

- 交付线取 tool-exec。`packages/mcp` 在线归属表 `docs/engineering/delivery-lines.json` 的 tool-exec 路径内，父卡 #1119 也在该线。
- 主工作类型取 maintenance。结果是让测试夹具不依赖时间窗，属于维护验证。产品行为没有错。本卡没有一条已接受的承诺可作 bug 的“预期依据”，所以不取 bug。
- 性质取 impl，契约变更取 none。只改测试夹具，不改契约成员。

## 目标与范围

`tests/fixtures/scripted/stdio.ts` 的 `received()` 靠“对端 stderr 静默 12 ms”判断对端已经记完收到的内容。机器负载高时，对端的记录晚于这个窗口，`received()` 提前返回，计数断言得到 0。本卡让夹具等对端发出的明确完成信号，不按时间窗判断。

- 本次结果：`received()` 在对端实际记完之后才返回，与机器负载无关。
- 与父卡的关系：本卡是 #1119 W3 波末登记的小卡。父卡的其余范围不变。
- 包含：
  - 改 `packages/mcp/mcp-host-local/tests/fixtures/scripted/stdio.ts` 的 `received()`。
  - 改脚本化对端 `packages/mcp/mcp-host-local/tests/fixtures/scripted/stdio-peer.mjs`，使它在记完时发出完成信号。
  - 为夹具新增一条确定性的用例，见 C2。
- 不含：
  - 改产品源码、契约成员或 `conformance` 套件的公开形状。
  - 改 `tests/fixtures/scripted/http.ts` 第 599 至 607 行的同形 `received()`。它与 stdio 版有相同的 12 ms 循环，但对端在同一进程内。是否同样会受负载影响，推断，未经验证。实施者核对并在交回中报告，需要改时另立小卡。
  - 改任何断言的期望值。
- 类型补充（maintenance）：
  - 应有状态：夹具返回“对端已收到”的完整记录，不靠时间猜测。
  - 受影响消费者：`tests/stdio.spec.ts`（第 195、265 行），`tests/conformance.spec.ts`（第 35、38 行把 `peer.received` 交给 `mcpTransportConformance` 套件）。
  - 风险：低。只改测试夹具。风险点是夹具与对端的信号约定写错，导致 `received()` 永远不返回，须有超时与明确的失败消息。

## 依据与实施输入

- 现行依据或获准问题：I-01 至 I-03。本卡不沿用父卡的全部范围。

| 输入ID | 唯一源或获准问题 | 精确修订/提交及采用状态 | 本次适用条款或范围 |
| --- | --- | --- | --- |
| I-01 | `packages/mcp/mcp-host-local/tests/fixtures/scripted/stdio.ts` 第 104 至 112 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | 现行写法：`async received() {`，注释“The peer records on stderr after it read the pipe: wait until the records stop coming.”，然后 `let seen = spawned.log.length`，`for (;;) { await new Promise(resolve => setTimeout(resolve, 12)); if (spawned.log.length === seen) break; seen = spawned.log.length }`，最后 `return [...spawned.log]`。记录由第 65 至 72 行的 `onStderrLine` 在收到以 `RECORD` 开头的 stderr 行时推入 `log` |
| I-02 | 评审与交回记录：`w3-mcp-host-fix4` 交回第 73 与 213 行，`w3-mcp-host` 第 4 轮评审第 822 行 | 任务过程材料，观察记录，不是规范 | 见下表 |
| I-03 | `packages/mcp/mcp-host-local/tests/fixtures/scripted/http.ts` 第 599 至 607 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | 同形的 12 ms 静默循环，作核对对象，不在本卡范围，见“不含” |

I-02 的关键读数：

| 来源 | 读数 |
| --- | --- |
| `w3-mcp-host-fix4` 验收 2，第一次 turbo 运行，2026-11-06 07:00:45 至 07:03:08 UTC，提交 `1ec708899`，日志 `gates/turbo.log`，`90e42caa19dadfc1` | 退出 1。失败用例 `conformance.spec.ts > stdio first > T8 [N01] … → ignored`，断言 `stdio notification unsent: 0 !== 1`，即 `notifications/initialized` 的计数是 0。当时与仓库级 `pnpm run typecheck` 和 lint 同时运行，机器负载高 |
| 同一验收，第二次 07:08:34 至 07:10:38 UTC，负载 3.9 | 退出 0，`Tasks: 19 successful, 19 total`，host 402 passed |
| 同一交回第 73 行 | 失败归因：`received()` 把 stderr 静默 12 ms 当作对端已记完。同形失败（I01，`0 !== 1`）也出现在第 10 条的变异全量运行里，单独重跑 3 次都通过。这两条用例都不经过本次改动的代码路径 |
| 同一交回第 213 行 | 清理候选：“改法估计要换成由对端发出的明确完成信号，影响一个夹具文件” |
| `w3-mcp-host` 第 4 轮评审第 822 行 | 列在“超出已要求的需求”下：“理由：派发者已经转成波末小卡，不在本轮改动的路径上” |

- 实施输入与约束：
  - 推断，未经验证：一种可行做法是夹具经 stdin 向对端发一条同步请求，对端读到它时（stdin 先进先出，此前的行都已记完）在 stderr 回一条完成记录，夹具等到它再返回。实施者可以选别的做法，但判据是 C1。
  - `received()` 的返回值形状 `readonly PeerReceived[]` 保持不变。`StdioPeer` 类型（`stdio.ts` 第 77 至 81 行）的公开形状不变，除非实施者说明必要。
  - 对端在 `plan === 'unreachable'` 时没有脚本对端（`spawnPeer(['-e', ''])`），此时的 `received()` 行为要保持，或写明新行为。
- 受影响消费者：`tests/stdio.spec.ts`、`tests/conformance.spec.ts`。
- 持续成果落点：`tests/fixtures/scripted/stdio.ts`、`stdio-peer.mjs`。夹具说明 `tests/fixtures/README.md` 与 `tests/fixtures/index.md` 在本卡建立时没有提到静默窗口（grep 无命中），若实施后写法变了再同步。
- 可恢复输入：I-01、I-03 在仓库中可读。I-02 的原件只在 #1119 W3 波的本机任务 tmp，关键读数已写进上表。

## 验收与测试

| 判据ID | 依据ID | 成功及禁止结果 | 验证方法与所需证据 |
| --- | --- | --- | --- |
| C1 | I-01 | `received()` 不再用时间窗判断对端已记完。夹具等对端发出的明确完成信号。禁止：用更长的静默窗口代替。禁止：信号缺失时无限等待，须有超时和明确的失败消息。 | 读 `stdio.ts` 的 `received()`，其中没有 `setTimeout(resolve, 12)` 或同类静默循环。读完成信号的写入与等待位置 |
| C2 | I-01、I-02 | 对端在收到数据后延迟记录超过 12 ms 时，`received()` 仍返回完整记录。 | 新增确定性用例：对端被配置为延迟记录（例如 50 ms），期望 `received()` 包含该记录。修复前该用例必须失败，修复后通过 |
| C3 | I-02 | 高负载下，与 I-02 同类的计数断言不再偶发为 0。 | 在人为负载下重复运行 `conformance.spec.ts` 中 N01 与 I01 对应的用例，全部通过。负载方式和次数由实施者定并写进交回，写明机器与负载读数。次数少时不得写成已证明稳定 |
| C4 | I-01 | 既有行为不变：`tests/stdio.spec.ts` 与 `tests/conformance.spec.ts` 全部通过，用例数与改动前相同（host 402 passed 是 `1ec708899` 上的读数，仅作参考）。 | `pnpm --filter @omne-harness/mcp-host-local test`，快层与慢层 |

| 测试/验证拥有者 | 类型 | 大致覆盖 | 真实依赖或替身及不覆盖 | 执行入口/所需环境 |
| --- | --- | --- | --- | --- |
| `packages/mcp/mcp-host-local` | 单元（夹具） | 完成信号的收发、对端延迟记录、信号缺失的超时 | 真实子进程对端。不覆盖 HTTP 夹具（见“不含”） | `tests/` 下新增夹具用例，命令 `vitest run`（包的 `test`、`test:fast`、`test:slow`） |
| `packages/mcp/mcp-host-local` | 契约（符合性套件） | `mcpTransportConformance` 通过夹具读“已收到” | 同上 | `tests/conformance.spec.ts` |

- 独立复核与接受：按风险做一次交付边界核对（`review-delivery`）。夹具改动不需要差分变异。接受者是 PanQiWei 或其按授权委派者。
- 未覆盖或环境缺口：C3 只能在有负载的机器上观察。负载下的偶发失败本来没有稳定复现，所以 C2 的确定性用例是主要证据，C3 是补充。

## 交付条件

无

## 当前执行与交接

### 认领与派发

- 认卡声明：未认领
- 派发情况：未派发
- 执行实例：未指定
- 工作树：未创建

### 分支、基线与task context

未登记binding。按 PanQiWei 2026-11-06「做完关卡」，本卡随卡 #1119 的父分支 `PanQiWei/skill-mcp` 交付（#1119 按范式 r3 以父分支加 PR 推进，没有 task context），之后随 #1119 进入 `tool-exec` 的线轨道。

| 开工读回项 | 实际值/回执 |
| --- | --- |
| 本次直接合入分支全名 | 未派发 |
| 实际开工HEAD | 未派发 |
| 本次读回的目标HEAD | 未派发 |
| task context路径与核验 | 未生成 |

### 当前进展

- 最近更新：2026-11-06，尚未开工。
- 已完成事实与保存位置：事实已在本卡核对。引用的行号取自父分支 `PanQiWei/skill-mcp` 的提交 `70615269032b96255dbde69dc679dc4637b90248`。
- 阻塞与范围变化：无。
- 下一步及责任：卡 #1119 的执行会话在 W4 期间实施，做完后关卡。
- Project对账：待发布后加入 Project 4，Stage 为 Backlog。Wave 与日期字段由 dev-flow 在开工时写入。

### 成果交回

- 固定成果：未交付
- 判据与证据：未交付
- 集成观察：不适用，尚未交付
- 请求接受及剩余责任：未交付

## 决定与剩余责任

- 有效决定：PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。2026-11-06 PanQiWei 定：发本卡，W4 期间做完关卡。
- 剩余责任：全部实现与验收，由卡 #1119 的执行会话承担。
- 收尾对账：未接受，保持活动。

本子任务接受不自动接受父交付卡。父子关系不自动成为阻塞条件。
