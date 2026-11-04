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
