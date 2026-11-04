# w3-mcp-lifecycle-model 写者最终交回（原文）

## 结论

闭包 w3-mcp-lifecycle-model 已完成，全部改动已在本地提交。没有未提交的改动，没有推送。验收第 7 项的门禁都已跑过：第 1–3 个提交在 3ecafb718 上通过，最后一个提交 4a9287296 只加了差距账本副本和一行索引，没有重跑门禁。

## 提交

分支 `PanQiWei/skill-mcp-w3-mcp-lifecycle-model`，基线 1160e92c8。作者和提交者都是 PanQiWei <594557445@qq.com>，trailer 只写 Harness 和 Agent-Role。

| 提交 | 内容 |
|---|---|
| `c4beb9e1e` test(mcp) | 有界穷举探索器，放在 `packages/mcp/mcp/tests/model/`（`ports.ts`、`explore.ts`、`properties.ts`、`scenarios.ts`、`lifecycle.spec.ts`） |
| `097492b97` test(mcp) | TLA+ 模型 `verification/models/ConnectionTable.tla`、16 份 `.cfg` 和 `run.py` |
| `3ecafb718` docs(mcp) | SPEC.md 只追加一节「性质与证据」；`verification/README.md`、`index.md`、`models/README.md`、`models/index.md`；README 和 README_ZH 的验证一段各加一句 |
| `4a9287296` docs(mcp) | 差距账本初稿复制到 `packages/mcp/mcp/verification/gaps-mcp.md`，并加进索引 |

没有改 `src/`。四次变异之后都按字节还原了源码，并重建了 dist。

## 1. 性质账本 P1–P8

定理写在 SPEC「性质与证据」，每条都写了对象与参与者、端口失败模型、公平性前提和结论。

- **失败模型 F**：端口调用可以答复、答复失败、reject、同步抛出、挂起，或在时限到期之后才答复。`stop()` 另可答 `unconfirmed`。
- **公平性前提**：W1 时限最终到期；W2 promise 反应最终全部运行；W3 端口最终答复，只用于 P8 的 T1。
- **P8** 分三条：
  - T1：W3 成立时，每个调用方都会答复。
  - T2：`ensure` 的时限都到期后，它不再等任何端口。
  - A1 是反定理，也就是已知限制：拆除的端口或在途建连的端口挂起时，`release`、`closeAll`、`lose` 和自动关闭可以一直不答复。
- 每条性质分 TLA+、探索器、真实组合三种证据记状态，用词沿 `docs/verification.md` 的六种状态。真实组合全部未验证。

## 2. 1160e92c8 上的反例

| 反例 | 性质 | 内容 | 来源 |
|---|---|---|---|
| B1 | P7 | `closeAll` 期间，在途落点的句柄 `release()` 同步抛出，成为未处理的拒绝 | 已知 |
| N2 | P7 | 迟到路径四条无人等待的链上，端口同步抛出，成为未处理的拒绝 | 已知 |
| P2 | P8 T2 | 建连自己的拆除挂起，调用方在全部时限到期后仍等待 | 已知 |
| N1 | P8 T2 | 失败建连标记清单时存储挂起，调用方在全部时限到期后仍等待 | 已知 |
| N3 | P1、P2、P3 | 拆除的一步同步抛出，拆除中止，后面的步骤不执行。建连的 `catch` 再拆一次时，同一句柄的 `release()` 被调用两次。关停途中中止时，句柄不释放，进程不被要求停止，状态视图却报 `none` | 本闭包新找到 |

B1、N2、N3 是同一根因：端口调用没有单一的适配器，同步抛出不像 reject 那样被吸收。

## 3. TLA+ 模型与 TLC

TLC 已实跑，环境是 `. /etc/profile.d/tlaplus.sh`，TLC2 2.19，tla2tools.jar SHA-256 936a2620…，4 个工作线程。SANY 解析通过。

模型描述 1160e92c8 的连接表本身，不是目标设计。动作覆盖：

- `ensure` 的临界区和建连的各步，含失败收场、关停收场和 `catch`
- 三步拆除、`closeEntry` 与遗忘
- `release`、`closeAll`（含 abandon）、`lose`
- 迟到路径和时限到期
- 端口的答复、失败、reject、同步抛出、挂起和迟到

一次事件循环的一轮对应一个外部动作，之后的内部步运行到静止。不同键之间做偏序约简。

`run.py` 退出码 0，16 份配置全部符合判读。证据在 `tmp/closures/w3-mcp-lifecycle-model/tlc/final/20261104T144446Z/`，模型 SHA-256 e0d9793b…，就是提交 097492b97 的文件。

| 配置 | 结论 | 不同状态数 | 深度 | 耗时 |
|---|---|---|---|---|
| valid-faults | 无错误 | 68,911 | 55 | 5.4 s |
| valid-rebuild | 无错误 | 725,887 | 88 | 88 s |
| valid-two-keys | 无错误 | 546,811 | 76 | 87 s |
| valid-throws | 无错误（只查 P2 遗忘、P4–P6） | 4,833 | 54 | 2.4 s |
| live（`LiveSpec` 下的 P8 T1） | 无错误 | 62,569 | 55 | 14.8 s |
| cex-b1 | `P7_NoB1` 被违反 | 824 | 31 | 1.7 s |
| cex-n2 | `P7_NoN2` 被违反 | 168 | 24 | 1.5 s |
| cex-n3 | `P1_AtMostOnce` 被违反 | 916 | 31 | 1.6 s |
| cex-n3-shutdown | `P3_EveryProcessAsked` 被违反 | 878 | 31 | 2.9 s |
| cex-p2 | `P8_NoTeardownStall` 被违反 | 167 | 28 | 2.1 s |
| cex-n1 | `P8_NoStoreStall` 被违反 | 177 | 27 | 2.0 s |
| probe-a1 | `P8_BoundedClose` 被违反（A1 见证） | 250 | 27 | 2.4 s |
| probe-live-hang（去掉 W3） | 找到时序反例 | 9,361 | — | 5.3 s |
| bad-no-absorb-close | `P2_NoneHoldsNothing` 被违反 | 1,496 | 31 | 2.0 s |
| bad-forget-open | `P2_ForgetHoldsNothing` 被违反 | 54,776 | 47 | 6.1 s |
| bad-no-shut | `P4_NoConnectAfterShut` 被违反 | 88 | 20 | 1.4 s |

`valid-two-keys` 加了约束「不触发时限」（`CONSTRAINT NoBoundFired`）。不加时 TLC 跑了 17 分钟没有结束，所以迟到路径只在一个键的配置里检查。有限范围的通过不是证明，也不表示实现符合模型。

## 4. 模型、探索器与实现的映射

完整表格在 `verification/README.md` 的「动作映射」和「状态映射」两节。外部动作逐一对应：

| 模型动作 | 探索器的调度选择 | 实现 |
|---|---|---|
| `EnsureCall` | `ensure A` | `table.ts` 的 `ensure`、`begin` |
| `Release` | `release A` | `table.ts` 的 `close` |
| `CloseAll` | `closeAll` | `table.ts` 的 `closeAll`、`teardown.ts` 的 `abandonLandings` |
| `Lose` | `lose eA1` | `table.ts` 的 `lose` |
| `Fire` | 最早的时限到期 | `AbortSignal.timeout` 到期 |
| `Answer(c, a)` | 答复一个待决的端口调用 | 端口 promise 兑现或 reject |
| `CallOutcomes` 的抛出分支 | 一步里第几次调用同步抛出 | 端口方法被调用时抛出 |

模型的内部步对应探索器每一步之后的 `drain()`（一次 `setImmediate`），实现代码是 `build.ts`、`teardown.ts`、`late.ts`、`entry.ts` 的相应函数。

两种证据之间没有精化证明，靠反例轨迹逐条对照：N1、N3、A1 两边的调度相同；B1、P2 只差一次答复和一次时限到期的先后；N2 两边是四条链里不同的两条。

## 5. 探索器

探索器驱动真实的 `createConnectionTable`。端口用可编程替身 `ScriptedPortCall`，宽度优先，状态按可观察投影去重。

- **时限**：`AbortSignal.timeout` 换成由探索器触发的时限，先建的先到期。
- **未处理拒绝**：探索期间把 `unhandledRejection` 的监听换成自己的，记为 P7 违例，结束后恢复。
- **确定性**：每次重放都核对路径与上一状态的投影，1160e92c8 上没有一次偏离。

| 场景 | 状态数 | 重放数 | 最深调度 | 耗时 | 层 |
|---|---|---|---|---|---|
| rebuild（1 键，2 次 `ensure`，`closeAll`） | 3,291 | 8,705 | 23 | 17.6 s | 快 |
| faults（1 键，`ensure`/`release`/`lose`/`closeAll`；失败、reject 或 `unconfirmed` 共 1 次） | 3,028 | 7,888 | 15 | 9.7 s | 快 |
| throws（1 键，`ensure`/`closeAll`；同步抛出 1 次） | 307 | 608 | 12 | 0.4 s | 快 |
| throws 不去重 | 5,669 | 5,669 | 13 | 7.2 s | 快 |
| wide（1 键，2 次 `ensure`，`release`、`lose`、`closeAll`） | 37,466 | 106,132 | 26 | 252 s | 慢 |
| two-keys（2 租户 1 持有，各 1 次 `ensure`） | 13,501 | 36,739 | 22 | 104 s | 慢 |
| wide-faults（深度上限 10，四种偏离共 1 次，只为记录） | 17,852 | 42,604 | 10 | 49 s | 不在用例中 |
| two-keys-shutdown（深度上限 10，同步抛出 1 次，只为记录） | 13,788 | 27,386 | 10 | 34 s | 不在用例中 |

- 耗时是在其他会话造成的高负载下测的（load average 约 10–16），只作参考。
- 每个场景找到的违例都属于 B1、N2、N3、P2、N1，没有新的违例。
- 已知反例用 `it.fails` 记为预期失败。修复后这些用例会反向变红，提示把它们改成通过用例。
- 探索器跑不到闭包规格举例的上限（2 键、每键 2 次 `ensure` 加全部结局），状态会爆炸；上表是实测。

去重是否丢违例：「the projection」用例在 throws 场景上比较去重与不去重找到的违例种类和最短深度，两者一致。实测它能检出把投影粗化到只剩操作与预算，检不出只去掉待决调用这一项。这个局限已写进 README。

最短轨迹（探索器）：

- **B1**：ensure → adoption ok → fire T(eA1) → acquire ok → fire T(bA1) → closeAll，`release` 在 `abandonLandings` 抛出
- **N2**：ensure → adoption ok → fire → fire → acquire ok（迟到），`release` 在 `late.ts` 抛出
- **N3**：ensure → adoption ok → closeAll → acquire ok，`release` 在 `shutDown` 的拆除里抛出，被调用两次
- **P2**：ensure → adoption ok → closeAll → fire → acquire ok → fire，`eA1` 仍等 `release`
- **N1**：ensure → adoption ok → fire → fire，`eA1` 仍等 `store.read`

TLC 一侧的轨迹和全部最短轨迹见 `verification/README.md`「已知反例的最小轨迹」。

## 6. 变异表

在最终的探索器代码上跑。每个变异只改一处，快层运行 `tests/model/lifecycle.spec.ts`，然后按字节还原源码并重建 dist。日志在 `tmp/closures/w3-mcp-lifecycle-model/mutations-final/`。

| 改了什么（文件与位置） | 哪条用例变红 | 退出码 |
|---|---|---|
| M1 `src/internal/teardown.ts` `closeTransport`：`answerOf(transport.close())` 改为直接 `await transport.close()` | faults：「explains every violation」「P1–P7 hold」（A 报 `none` 却仍持有 hA1、pA1；P1、P3） | 1 |
| M2 `src/internal/entry.ts` `forgettable`：去掉「已关闭」条件 | rebuild 和 faults 各两条（准备中的条目被遗忘，hA2、pA2、tA1 无人收口；faults 里是 P6） | 1 |
| M3 `src/internal/table.ts` `closeAll`：去掉 `shut = true` | rebuild、faults、throws 共六条（P4：`closeAll` 之后仍调用 `landing.start`） | 1 |
| M4 `src/internal/late.ts` `landLate`：去掉对迟到进程的 `stopOne` | rebuild 两条、faults 两条、throws 一条（P3：`closeAll` 答复时 pA1 从未被要求停止） | 1 |

TLC 的三个负控与 M1–M3 同义，三个都命中各自的性质。

## 7. 验收逐项

1. **成员门禁**：`pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0。19 个测试文件，310 通过、5 预期失败，含慢层，15 个 turbo 任务全部成功。
2. **性质账本**：P1–P8 的定理、前提、证据类型与状态都在 SPEC「性质与证据」。
3. **TLA+ 模型**：SANY 解析通过，TLC 实跑 16 份配置，全部符合判读。
4. **探索器**：范围、状态数、耗时、核对点和三个已知反例 B1、N2、P2 的最小轨迹齐全；另有 N1 与新找到的 N3。
5. **变异**：四个变异都被抓住，每个之后都已还原源码并重建 dist。
6. **差距账本初稿**：覆盖组页不变式 1–6、契约 S1–S9、端口条款 AV–T 和成员 SPEC 的相关陈述。
7. **收尾门禁**：`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs` 全部退出 0。

## 8. 门禁日志

都在提交 `3ecafb718` 上跑，日志在 `tmp/closures/w3-mcp-lifecycle-model/gates/`：

- turbo：开始于 2026-11-04T14:50:03Z
- lint:rules：14:54:11Z
- lint:oxlint：14:54:37Z
- lint:deps：14:54:40Z
- format:check：14:55:26Z
- check:docs：14:55:29Z

六项都退出 0。改过的文件里没有 CRLF。

`lint:deps` 起初失败，原因是 `@omne-harness/agent` 的 dist 不存在，与本闭包无关。我用 `pnpm turbo run build --filter=@omne-harness/agent` 从 turbo 缓存恢复了它；dist 被 gitignore，不进提交。

## 9. 差距账本初稿

- 仓库内：`packages/mcp/mcp/verification/gaps-mcp.md`，已提交。规格原本要求它不进仓库，这次是按你的要求收进来的，由 reduce 决定去留。
- 任务 tmp 里的原件：`tmp/closures/w3-mcp-lifecycle-model/gaps-mcp.md`。

## 10. 未覆盖

- 真实传输、真实进程、真实对端和耐久存储：真实组合未验证。
- HTTP 端点、`degraded` 与 `settle`、换采用修订（不变式 6）、资格、`refresh` 的发布（P6 的「不发布」）：两种证据都不覆盖。
- 上限之外的调度。模型与实现之间没有精化证明。
- 写范围之外：`tests/index.md` 和 `tests/README.md` 还没有列出 `tests/model/`，需要它们的拥有者补上。

## 11. 我自己定的事和理由

- **失败模型含同步抛出**：闭包规格要 P7 覆盖 B1、N2，而它们都由同步抛出触发。SPEC 的 MC-14、MC-15 只承诺吸收 reject，这个差距记进了差距账本。
- **模型描述 1160e92c8 的实现，不是目标设计**：修法归下一个闭包 `w3-mcp-lifecycle`。修好之后，把相应的 `cex-*` 配置改为正控，`it.fails` 用例改为通过用例。
- **P2 在探索器里用可观察形式检查**：条目对外不可见，所以检查「状态视图报 `none` 且没有在途调用时，什么都不持有」。模型里两种形式都查。
- **P8 T1 在探索器里只查静止状态**：「没有待决调用、没有时限时无人等待」。活性本身由 TLC 的 `LiveSpec` 检查。
- **探索器直接驱动 `createConnectionTable`**：规格允许这样做。代价是 `refresh` 不在范围内。
- **新反例命名为 N3**：放在已知的 B1、N2 之后。
- **TLA+ 做跨键偏序约简，两键配置加约束**：为了让两个键的配置在预算内跑完。

## 12. 待定项

只有负责人能定，因为它们改变的是已有的承诺与限制的边界：

- **P8 的 T2**：做成承诺，还是维持 SPEC 已知限制「拆除的端口挂起」。它与 P2、N1 直接冲突。
- **同步抛出**：是否把 MC-14、MC-15 的吸收范围扩到同步抛出。结构性处置「单一适配器」的方向是扩大。
- **`discover` 途中关停**：`ensure` 仍答 ok，这是 W3 评审第 2 轮的待裁 P3。P4 在两种证据里都成立，所以这只是取舍，不是性质违例。

## 13. 过程材料

都在 `/home/user/omne-harness-lite/.worktrees/w3-mcp-lifecycle-model/tmp/closures/w3-mcp-lifecycle-model/`：

- `explorer-final/`：每个场景的 `.txt` 与 `.json`，含最短调度；`evidence.spec.ts.txt` 是记录用的临时运行器，没有提交
- `tlc/final/20261104T144446Z/`：TLC 原始输出与 `summary.json`
- `tlc/sany.txt`：SANY 解析记录（解析的是加约束之前的那版模型，只差 `NoBoundFired` 这一处）
- `mutations-final/`：四个变异的 diff 与日志
- `gates/`：门禁日志
- `gaps-mcp.md`：差距账本原件
