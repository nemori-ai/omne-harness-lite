# 闭包规格 w3-mcp-lifecycle

## 身份与位置
- 闭包：w3-mcp-lifecycle
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-lifecycle
- 分支：PanQiWei/skill-mcp-w3-mcp-lifecycle
- 基线：12c3300cd（`w3-mcp-lifecycle-model` 的头，含父分支 f79aab4d4ef6959a9e6da64f0a7b88be3ea927d3 与 `w3-mcp-table` 1160e92c8）
- 清晰度：定

## 模型与推理强度
写者是 reduce 本会话（claude-opus-5-5），负责人 2026-11-05 要求「能自己做的自己做」。评审另派独立子代理。

## 目标边界
目标：把 `@omne-harness/mcp` 的连接表改成结构化并发，使性质 P1–P8（SPEC「性质与证据」）在 F（含同步抛出）下成立；P8 T2 从反例变成承诺；A1 维持已知限制。

reduce 裁定（2026-11-05，本会话，从应然出发；记在 `waves/w3/takeover-plan.md`）：

1. **K1 P8 T2 做成承诺**：`ensure` 的时限（临界区一份、建连一份）都到期之后，它不再等任何端口就答复。建连时限改为从建连开始计时（含尝试前对遗留进程的再停）。时限到期时，建连自己的拆除与清单标记交给表的作用域继续，答复不等它们；这时答复里的清单标记是新值 `pending`，`refresh` 把它读成本次连接失败本身（与 `marked` 相同）。
2. **K2 单一端口适配器**：本包对端口的每次调用只经一个函数 `ask(call, whenBreached)`。reject 与被调用时同步抛出是同一种违约，读成该端口契约里的一个答复：采用、资格 `unknown`，存储 `unavailable`，凭据与落点 `unknown`，`open` 为 `not-sent`（`connection-unavailable`），`discover` 与 `listActions` 为 `no-answer`（`abandoned`）（契约 T9），`close()` 已关闭，`stop()` `unconfirmed`，`release()` 已释放。端口违约不再作为异常离开本包（取代 MC-5「端口抛出的错误在收场后原样抛给调用方」）。
3. **K3 关停途中完成的 `ensure` 不答 ok**：建连在协商成功、转 `ready` 之前再核一次关停；已关停则按关停收场，答 `connection-unavailable`。
4. **作用域**：表有一个任务作用域。没有游离的 promise：时限后交来的东西的收口、`ensure` 不再等的拆除与标记，都在作用域里运行。后台任务里本包自己的编程错误记在作用域上，`closeAll` 退出时以 `AggregateError` 抛给调用方；端口违约在作用域里不可能出现（K2）。
5. **A1 维持**：拆除的端口挂起时，`close`、`closeAll`、`lose` 与自动关闭可以一直不答复（它们报告确认的停止范围，必须等端口）。宿主用自己的期限包住 `closeAll`。

### 写范围
- `packages/mcp/mcp/src/` — 新建 `internal/port.ts`、`internal/scope.ts`（新建）；删除 `internal/abort.ts`；改 `internal/table.ts`、`internal/build.ts`、`internal/teardown.ts`、`internal/late.ts`、`internal/entry.ts`、`internal/gate.ts`、`discovery.ts`、`index.ts`
- `packages/mcp/mcp/tests/` — 既有用例按新承诺改写；`tests/model/` 的已知反例从预期失败改为通过
- `packages/mcp/mcp/verification/` — TLA+ 模型改为描述新实现，`cex-*` 配置改为正控，README 与运行记录
- `packages/mcp/mcp/SPEC.md`、`README.md`、`README_ZH.md`、`src/index.md`、`tests/index.md`、`docs/`

### 排除的调用方
- `packages/mcp/mcp-contract/` — 只读；需要改契约时停下
- `packages/mcp/mcp-host-local/` — 只读
- 组页与领域页 — 波末写回

## 验收清单
1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0；慢层（`test:slow`）通过。
2. 探索器：全部场景零违例（含同步抛出与挂起），已知反例 B1、N2、N3、P2、N1 的用例由预期失败转为通过。
3. TLC v1.7.4：正控全部无反例；原 `cex-*` 改为正控后无反例；负控仍报指定性质。
4. 手工变异：去掉 `ask` 对同步抛出的吸收、去掉某处时限、去掉关停复核，各自使对应用例变红。
5. 收尾门禁：`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design`。

## 性质及证据义务
P1–P8 的证据表按新实现重写，六种状态分开写。

## 停止条件
- 某条性质在不改契约就做不到时。
- 同一用例连试三种做法仍红。

## 追加记录

- 2026-11-05 **并入 `w3-mcp-lifecycle-model` 的 L3 处置**（`waves/w3/reviews/mcp-lifecycle-model-r1.md`）：
  - B1（P5）：每个键一个采用视图，`two-keys` 两键只差租户；新场景 `two-accounts` 两键只差对端账号（慢层）。变异 M9、M10 证明会变红。模型的 P5 格改记「键怎样推导：模型未覆盖」。
  - B2（P6）：模型的 `P6_LateNoEffect` 换成 `P6_LateInvisible`：迟到答复及处理它时发起的调用的答复（`lateBorn`）前后，`Visible` 不变。新负控 `bad-forget-open-late`。探索器的 `lateChanged` 同样把迟到答复引起的后续调用算作迟到。
  - N3：P1 加 S9 次序（句柄只在携带它的进程 `stop()` 答复之后释放）：探索器账本 `earlyReleases`，模型 `P1_ReleasedAfterStop`。**这条新检查在实现上立即找到一个真缺陷**：落点迟到交来进程、`stop()` 未答时 `closeAll` 到达，`abandonLandings` 把句柄提前释放。修法：`Landing.landed`，`abandonLandings` 只释放仍在途的落点；新用例 `shutdown.spec.ts`「not for a landing that already handed over its process」；新负控 `bad-abandon-landed`，轨迹与探索器的发现相同。
  - N4：SPEC P6 的陈述按 MC-9 写准（关闭后只为报告 `residual` 保留的条目算作 `none`）。
  - N5：`closeAll` 用 `allSettled` 等全部条目与句柄释放结束，再交出缺陷。
  - N6：`known()` 已删除；每个场景断言零违例。
  - N7、N8：SPEC「性质与证据」写明两种证据共同的前提与未覆盖的承诺。
- 2026-11-05 **K3 的探索器与模型检查**：探索器 `connectedAfterShutdown`（关停后答复的 `ensure` 交出连接即 P4 违例）；模型 `P4_NoOkAfterShut` 与负控 `bad-ok-after-shut`；单测 `shutdown.spec.ts`「shut while negotiating」。
- 2026-11-05 **契约 S5 与成员 MC-5 的差异**：契约 S5 写 `discover` 答 `no-answer` 时转 `degraded`（`discover-failed`）；`Connection.degrade` 只能从 `ready` 转入，本包只在建连中调用 `discover`，所以按 MC-5 转 `lost`。MC-5 写明这一点；契约那一句的措辞并入波末小卡（K7 一并处理）。
- 2026-11-05 **`cex-*` 退出**：同样的上限已由正控覆盖（`valid-throws` 即原 B1、N2、N3 的常量，`valid-rebuild` 覆盖原 P2、N1），删去 6 份 `cex-*` 配置，加 4 个负控。TLC v1.7.4 全部 14 个配置符合判读（`tmp/closures/w3-mcp-lifecycle/tlc/20261105T083609Z/`）。
