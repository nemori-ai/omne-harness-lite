# 闭包规格 w3-mcp-table

## 身份与位置
- 闭包：w3-mcp-table
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-mcp-table
- 分支：PanQiWei/skill-mcp-w3-mcp-table
- 基线：05f281394c9179ecb9427fb1d5b97cc2f808a789
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort xhigh。理由：跨模块的资源生命周期与并发拆除（策略 `cross-module-lifecycle`，hardest → 最低 xhigh），凭据句柄（`security-sensitive`）；W2 同类问题三轮未收敛。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：收口 `@omne-harness/mcp` 连接表的已知限制，使「拆除只有一份、每一步都执行、条目只在什么资源也不持有时才被遗忘」成为可单独测的结构，并把 684 行的 `internal/table.ts` 拆成可读的模块。B 段 `w3-mcp-call` 会在这张表上接调用口。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md「已定事项」4（端口 reject 的处置）、5、6、20–26 为准，逐条照做。已定事项 4、5、6 是契约条款，由并行的 `w3-mcp-contract` 写进契约 SPEC；本闭包按同一决定实现，不改契约。
- 现有用例是行为基线：W2 的全部用例原样通过，不改断言。用例里引用的内部模块路径因拆分而变时，只改导入路径，报告逐个列出。
- 成员 SPEC「所有权、失败与生命周期」与「已知限制」两节按实现改写；「已知限制」只剩已定事项 25 一项（改写为端口质量前提）与「在途表、连接表不跨重启」。

不在范围内：`ActionInvoker`、任务表、`createMcp`；删除成员内绕道（`McpDiscovery`、第三参 `{ now }`、`internal/canonical.ts`、`tests/doubles/values.ts`，归 B 段）；契约改动；新依赖。

### 写范围
- `packages/mcp/mcp/` — 本闭包唯一的写入目录：`src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`；`package.json` 只允许改 `scripts`

### 排除的调用方
- `packages/mcp/mcp-contract/` — A 段另一写者在改；只读，以 F0 为准。停止条件：实现需要契约改动时停下交回
- `packages/mcp/mcp-host-local/` — B 段写；不改
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写
- `packages/mcp/docs/`、`docs/domains/mcp/` — 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0；W2 的 254 例全部通过（报告给出前后用例数）。
2. 已定事项 20：遗忘谓词是一个导出于内部模块的纯函数（例如 `holdsNothing(entry)`），条目删除只经它；`tests/entry.spec.ts` 对五种资源（传输、进程句柄、凭据句柄、未确认停止的进程、在途落点）各一例「持有则不删」，全空一例「删」。变异：谓词漏掉在途落点 → 用例变红。
3. 已定事项 21：`tests/teardown.spec.ts` 对「`close()` reject / `stop()` reject / `release()` reject」的每个非空组合（7 种）断言三步都被调用、句柄 `release()` 恰好调用一次、`stop()` reject 记 `unconfirmed` 并反映在 `status.inspect` 的 `residual`；另一例：`transport.close()` reject 后换采用修订，旧进程仍被停、旧句柄仍被释放。变异：任一步去掉 `finally` → 对应组合变红。
4. 已定事项 22：临界区里的采用重读不答复时，后续 `ensure` 在连接时限内答 `connection-unavailable`（用 deferred 与小时限，不用 sleep）。变异：重读不受时限 → 用例超时变红（用 vitest 的用例时限兜住）。
5. 已定事项 5：落点在途时 `release` 与 `closeAll` 报告该连接 `process: 'unconfirmed'`；`closeAll` 之后 `ensure`（经 `discovery.refresh`）答 `connection-unavailable`，传输工厂与落点替身计数不再增加。
6. 已定事项 6：`closeAll` 时落点在途的连接，进程凭据句柄立即 `release()`；之后落点交来进程时，进程被 `stop()` 一次，句柄不再 `release()`。
7. 已定事项 24：`internal/table.ts` 只编排；条目资源与遗忘谓词、拆除、迟到收口各在自己的模块；报告给出拆分后每个模块的行数与最长函数行数。`pnpm run metrics --coverage --base 05f281394c9179ecb9427fb1d5b97cc2f808a789` 输出中本成员改动函数的 CC 与 CRAP 原样附在报告。
8. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`git ls-files --eol | grep -c w/crlf` 为 0。
9. `src/` 里 `class` 只在 `internal/connection.ts`、`internal/in-flight.ts`；无 `as`（`as const` 除外）、`any`。

## 实施规格
- 处置端口 reject（已定事项 4）：`close()` reject 当作已关闭继续；`stop()` reject 当作 `unconfirmed`；`release()` reject 当作已释放、不重试；读类端口（采用、资格、存储）reject 当作 `unknown`（W2 已有的 `failed()` 收场保留）。
- 拆除只有一个入口，三步各包在 `try/finally` 里；拆除的结果（确认范围）由它返回，调用方不自己拼。
- 遗忘：条目的状态变化后调用一次「尝试遗忘」，它只在谓词为真时删除。
- 临界区重读：用该次 `ensure` 剩余的连接时限包住（`AbortSignal.any` 或已有的 `Bounded<T>`/`untilAborted`）。
- `closeAll`：表进入「已关停」状态；之后要连接的入口直接答 `connection-unavailable`。
- 命名账本（名可调，写进报告）：`holdsNothing`、`teardown`、`Entry`、`entry.ts`、`teardown.ts`、`late.ts`。

## 性质及证据义务
- L3：凭据句柄每条连接恰好取得一次、释放一次，在每种 reject 组合下成立（S9）；进程至少被请求停止一次；条目不在持有资源时被遗忘。
- 迟到收口：时限之后交来的进程与句柄照旧收口；`closeAll` 后交来的同样。
- 并发用例用 deferred 排次序，不用 `setTimeout`。

## 施工计划
1. 先写 `entry.spec.ts`、`teardown.spec.ts` 与验收 4–6 的用例（红），红灯输出存 `tmp/closures/w3-mcp-table/red/`。
2. 拆模块（行为不变，W2 用例保持绿），再按谓词与拆除入口改实现（新用例变绿）。
3. 改写成员 SPEC 两节；README「给下一波」更新签名。
4. 门禁、读数、交回。证明变红时先还原源码并重建 dist 再跑。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、改契约、改 W2 用例断言。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-mcp-table。另两位写者并行：`w3-mcp-contract` 写 `packages/mcp/mcp-contract/`，`w3-skill-catalog` 写 Skill 三成员。派发者唯一合回。不跑 `admission` 与仓库全量测试；差分变异由 reduce 在最终 head 跑。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-mcp-table/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md 全文；`packages/mcp/mcp/SPEC.md`、`README.md`「给下一波」；W2 评审的并发裁定 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/reviews/mcp-core-r1.md（理解每条用例为什么存在）；W2 闭包规格的追加记录 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w2-mcp-core.md。
- 源码：`src/internal/{table,connection,in-flight,gate,abort,settings,guard}.ts`；`tests/{ensure,races,release,status,refresh}.spec.ts`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：基线 254 例通过；`internal/table.ts` 684 行；W2 已有 `teardown`、`lingering`、`Bounded<T>`/`afterwards`、`inTurn` 临界区。
- 假设：Node ≥24 的 `AbortSignal.any` 可用。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果；拆分前后模块与行数；自定裁定与理由；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-table/`。

## 已知会受影响的现有用例
- 引用 `internal/table.ts` 内部导出的用例：只改导入路径。

## 停止条件
- 某条已定事项与 W2 用例断言矛盾（不能同时成立）时停下交回，写明用例与条款。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-04T10:20Z **第 2 轮输入**（评审 `waves/w3/reviews/mcp-table-r1.md`：设计面阻断 B1–B3 与建议 F1–F6；L3 阻断 B1、N1、N2、待裁 S1、S2）。reduce 裁定，逐条先写会因预期原因变红的用例，证明变红前先还原源码并重建 dist：
  - **T1 每个进程都被要求停止**（两面 B1；写者裁定 4 撤回）：违约只在端口调用处吸收——`close()` reject 当作已关闭、`stop()` reject 当作 `unconfirmed`、`release()` reject 当作已释放——每步函数本身不 reject；循环问完每个进程。删掉 `teardown()` 的 `.then(confirmed, confirmed)`：本包的编程错误照常抛出，不被吞掉。`Stopped` 累加器与 `landLate` 的哑参随之去掉。加多进程用例（一个 reject、一个 root-only 在 lingering）在 `release` 与 `closeAll` 两条路径上证明每个进程都被问到；变异「去掉 stop 的吸收」与「循环在 reject 处中止」各让它变红。「每步都执行」的变异改为针对新形状（去掉某一步的吸收 → 后续步不执行 → 用例变红）。
  - **T2 `closeAll` 立即释放**（设计 B2）：置已关停之后，先对全部条目同步发起在途落点句柄的释放，再并发关闭各条目（`Promise.all`）。用例：两个条目，第一个的 `close()` 挂起，第二个的在途落点句柄在 `closeAll` 发起后同一轮事件循环内已释放。
  - **T3 建连途中关停**（L3 N1）：`build` 在取凭据之后、落点启动之前、打开传输之前各核一次已关停，命中则按准备失败收场（句柄释放、已起进程停止），答 `connection-unavailable`。探针 d2 的场景写成用例。
  - **T4 拆除端口挂起**（设计 B3、L3 S1）：临界区里等待其他修订关闭、同键关闭或拆除时，用该次 `ensure` 剩余的连接时限包住；超时答 `connection-unavailable`，拆除继续由条目自己收口。`closeAll` 等待全部拆除结束，端口挂起时它也挂起——写进「已知限制」（宿主应以自己的期限包住 `closeAll`）。用例：旧修订 `transport.close()` 挂起，换修订后两个 `ensure` 在时限内答复。
  - **T5 视图不一致**（L3 S2、设计 F6-1）：状态视图不新增落点在途的报告（`Residual` 归契约，本波不改）；「已知限制」写明：落点在途时 `release`/`closeAll` 报 `unconfirmed` 而 `inspect` 报 `none`（`release` 与 `closeAll` 都如此）；落点永不答复又没有 `closeAll` 时句柄一直持有到关停。
  - **T6 结构建议照做**：F1-1 注释改成事实；F1-2 两次搬移做成 `entry.ts` 的具名操作（如 `handOverToLanding`、`adoptLingering`）；F1-3 JSDoc 归位；F1-4 `readAgain` 复用 `gate.ts` 的 `adopted()`；F2-1 加纯函数 `forgettable(entry)`（`closed ∧ holdsNothing`），`forget` 只调它，`entry.spec` 补 `closed` 用例；F2-2 写明「字段在端口答复之后清空」并加「拆除途中落点答复，条目不被删除」用例；F4-1 去掉 `Late<T>`（回调收 `T | undefined`）；F4-2 复用 `Scope`、合并两个 `CONNECTION_UNAVAILABLE`；F5-1 能经 `refresh`/`status` 观察的用例改走公开面；F5-2 替身去重（抽共用的句柄包装与「前 N 次正常」辅助）。
  - **T7 SPEC**（设计 F6-2、F6-3）：MC-14 只写承诺（每步都执行；每个进程都被要求停止；端口 reject 的处置；拆除不因端口 reject 而 reject；删除条件「已关闭且五项都不持有」），模块与函数名移到 README「设计」与 `src/index.md`；所有权节删掉与 MC-14 重复的一条；五项资源只写一处。
  - **T8 写范围扩大**：成员 `docs/`（`architecture.md`、`object-model.md`、`flows.md`）按写者第 1 轮列出的过时句子同步。
  换写者：原写者用 Fable，Fable 用量已达上限，改派 claude-opus-5-5@xhigh（hardest：cross-module-lifecycle，策略最低 xhigh；降一档模型记一次降级，以 L3 增量复审补足）。轮次记 2。返工原因：评审发现、规格（T3、T4 是规格缺口）。
