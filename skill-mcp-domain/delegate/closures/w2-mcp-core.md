# 闭包规格 w2-mcp-core

## 身份与位置
- 闭包：w2-mcp-core
- 卡与修订：#0 r1（无卡；负责人 2026-11-03 会话内「W2 开工」）
- 工作树：/home/user/omne-harness-lite/.worktrees/w2-mcp-core
- 分支：PanQiWei/skill-mcp-w2-mcp-core
- 基线：b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：连接键隔离与凭据句柄生命周期是安全敏感（策略 `security-sensitive` → 顶档、最低 high）；并发发布边界需要判断；不是内核原语，不用 xhigh。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：把 `@omne-harness/mcp` 做成能在五个契约替身与脚本化传输上跑通「关口 → 连接 → 发现 → 整份发布 → 状态 → 释放」的核心实现：`createMcpCore`、`createInMemoryCatalogStore`、聚合 `Connection` 与 `InFlightCalls`、关口 `admit`。按 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/mcp/plan.md 的切片 01→05 顺序做。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/mcp/spec.md「已定事项」1–17 为准，逐条照做，不重新裁定。
- 条款以 `packages/mcp/mcp-contract/SPEC.md` 为准：K1–K3、C1–C8、R1–R7、S1–S9、AV/UE/CU/PL/CS/T；状态机、不变式 1–6 与 `close()` 次序以组页 `packages/mcp/docs/architecture.md`「MCP 连接」「应用服务」为准。
- 聚合的起点是 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/mcp/{connection,in-flight,gate}.ts（只取分法与不变式；写在 W1 之前，类型以 F 的契约为准）。

不在范围内：`ActionInvoker`（`invoke`、`continueWithInput`、`cancel`、四个任务操作）与任务表；`createMcp`；真实传输、官方 SDK、真实服务端；`list_changed` 订阅；后台重连；改 `mcp-contract`；新依赖；组页。

### 写范围
- `packages/mcp/mcp/` — 本闭包唯一的写入目录；`src/`、`tests/`、`README.md`、`SPEC.md`、`documentation.json`、`acceptance/`、`examples/` 按模板要求；`package.json` 只允许改 `exports`、`files`、`scripts`

### 排除的调用方
- `packages/mcp/mcp-contract/` — 契约只读；停止条件：实现需要契约的可加改动（新字段、新导出）时停下交回，写明需要什么与为什么
- `packages/mcp/mcp-host-local/` — W3 写；不改
- `packages/assets/assets`、`packages/common/*` — 只读
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/mcp/docs/`、`docs/domains/mcp/` — reduce 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0。
2. MC2-1：`config.spec.ts`：四个字段各一条非法用例抛 `RangeError`；合法时四个服务存在。
3. MC2-2：`connection.spec.ts` 穷举两种策略下每个合法转移（含代际值）与每个非法转移（抛 `TypeError`）；`isCurrent` 对旧代际为假。变异：`on-attempt` 策略不在失败的尝试上加代际 → 用例变红。
4. MC2-3：`in-flight.spec.ts` 五条性质各一例。变异：`reserve` 查重与占位拆成两步（先查后占） → 并发 `reserve` 用例变红。
5. MC2-4：`gate.spec.ts` 六种答复；`types.spec-d.ts` 证明 `AdmittedEndpoint` 字面量赋不进去；运行时伪造对象传给 `ensure` 抛 `TypeError`。变异：`admit` 未采用时继续问资格 → 「未采用时资格替身不被调用」用例变红。
6. MC2-5：`ensure.spec.ts`：复用（第二次不开新传输）、`lost` 后重建（代际加一）、单飞（两次并发 `ensure` 只开一次传输）、S4 四种配值缺陷、R6 四种连接失败各一例；失败后存储里记录的动作全部不可用且修订加一；进程凭据句柄在准备失败时 `release` 恰好一次；连接时限超时 → `connection-unavailable` 且进程 `stop()` 被调用。变异：`table.ts` 的键漏掉对端账号 → 「两个对端账号不共用连接」用例变红。
7. MC2-6：`refresh.spec.ts`：`published`；`kept(superseded)`（存储冲突、`stale-revision`、代际已换三种来源）；`kept(cancelled)`；`kept(listing-incomplete)`；页失败 → 连接 `degraded(list-failed)`；`discover` 的三种失败按 S5；并发两次用 deferred 排两种次序，都只有一次 `published` 且存储是较新的。变异：发布边界去掉代际核对 → 「迟到结果不发布」用例变红。
8. MC2-7：`current`/`peer` 时传输工厂替身调用计数为 0；`basisCurrent` 三态；`peer` 没有连接答 `not-connected`。
9. MC2-8：`status.spec.ts`：凭据四态、`use` 两态、`lost` 带 `residual`、`not-eligible` 不进 `list`、`list` 任一 `unknown` 整次 `unknown`、无权主体对存在/不存在同答（`deepStrictEqual`）。
10. MC2-9：`release.spec.ts`：替身记录的调用序列是「`transport.close` → `process.stop`」；`stop()` 三种范围对应的状态（`none` / `lost(close-unconfirmed)` 带 `residual`）与报告；HTTP 句柄 `release` 恰好一次；`closeAll` 不调用采用与资格替身；没有连接答 `no-connection`。
11. MC2-10：`memory-store.spec.ts` 跑 `mcpCatalogStoreConformance()`，CS8 `NotApplicable`；跨租户/对端账号/持有三条隔离用例。
12. `src/` 里 `class` 只出现在 `internal/connection.ts`、`internal/in-flight.ts`（与可选的 `store/memory.ts`）；无 `as`（`as const` 除外）、`any`。
13. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run preflight`、`git ls-files --eol | grep -c w/crlf` 为 0。
14. 成员文档：`README.md`（含「给下一波」节：`ensure`、`InFlightCalls`、`admitWithoutEligibility` 签名与约定）、`SPEC.md`（行为契约只引用 mcp-contract SPEC 条款号，不复制）、`documentation.json`、`acceptance/`；`pnpm run check:docs` 通过。

## 实施规格
- `src/index.ts` 导出：`createMcpCore`、`createInMemoryCatalogStore`、`McpCore`。内部模块不从公开根导出。
- `src/config.ts`：`validateConfig(config) → McpConfig`，不合法抛 `RangeError`。
- `src/internal/connection.ts`：`class Connection { constructor(key, policy); state; generation; attempt(); ready(peer); degrade(reason); lose(reason, residual?); close(); isCurrent(g) }`，`GenerationPolicy = 'on-attempt' | 'on-negotiation'`。
- `src/internal/in-flight.ts`：`class InFlightCalls { reserve(key) → 'reserved' | 'in-use'; markSent(key, requestId, generation); markEnded(key); release(key); cancel(key, currentGeneration) → CancelAnswer; requestIdOf(key) }`。
- `src/internal/gate.ts`：`admit(ports, access, ref) → Promise<Outcome<AdmittedEndpoint, Refusal>>`；`admitWithoutEligibility(ports, access, ref)`；`AdmittedEndpoint` 用模块私有 `unique symbol` 品牌 + `WeakSet` 登记，`assertAdmitted(value)` 抛 `TypeError`。
- `src/internal/table.ts`：`createConnectionTable(ports, config)` 返回 `{ ensure(admitted, access, { signal, connectBound? }) → Outcome<{ transport; generation; connection }, ConnectionFailure | Refusal>; close(key) → ReleaseReport; closeAll(); current(key) }`。`ensure` 的次序按 spec 已定事项 6；单飞用 `Map<key, Promise>`；连接时限 `AbortSignal.any([signal, AbortSignal.timeout(bound)])`；S9 的句柄释放在 `finally`。
- `src/discovery.ts`、`src/status.ts`、`src/connections.ts`、`src/inspection.ts`：工厂函数返回对象字面量，共享同一个连接表与 `ports`。
- `src/store/memory.ts`：`createInMemoryCatalogStore()`，键是 `catalogKey` 的规范文本（`${tenant}\u0000${peerAccount}\u0000${holding}` 或用 `JSON.stringify` 按固定字段序）。
- `tests/doubles/scripted-transport.ts`：`scriptedTransports(script: Step[]) → McpTransportFactory & { calls: Call[] }`；`Step` 是 `{ discover: … } | { listActions: … } | { close: … }` 的立即值、`TransportFailure` 或 `deferred<T>()`（`{ promise, resolve, reject }`）。
- 命名账本：`createMcpCore`、`McpCore`、`createInMemoryCatalogStore`、`Connection`、`GenerationPolicy`、`InFlightCalls`、`admit`、`admitWithoutEligibility`、`AdmittedEndpoint`、`createConnectionTable`、`scriptedTransports`、`deferred`。

## 性质及证据义务
- L3：连接键含租户与对端账号（不变式 1）；凭据句柄恰好取一次释放一次（S9）；迟到结果不发布（不变式 2）。各有用例、变红证据，reduce 逐行读 `gate.ts`、`table.ts`、`discovery.ts` 的发布边界。
- `close()` 只报告确认范围，不声称进程已停（不变式 4）。
- 失败不压成空：存储 `unavailable` → `unknown`；页失败 → `kept(listing-incomplete)` 保留原采用。
- 并发用例不用 `setTimeout` 排序，用 deferred。

## 施工计划
1. 切片 01：先写 `connection.spec.ts`、`in-flight.spec.ts`、`gate.spec.ts`、`config.spec.ts`（红），再实现（绿）。红灯输出存 `tmp/closures/w2-mcp-core/red/01.txt`。
2. 切片 02：先写 `scripted-transport.ts` 与 `ensure.spec.ts`、`memory-store.spec.ts`（红），再写 `table.ts`、`store/memory.ts`。
3. 切片 03：`refresh.spec.ts`（含并发）先红；`discovery.ts`。
4. 切片 04：`status.spec.ts`、`release.spec.ts` 先红；`status.ts`、`connections.ts`。
5. 切片 05：`inspection.ts`、`index.ts`、`public-entry.spec.ts`、文档、门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、改契约。规格不够时在授权范围内自定并在交回逐条列理由（不能向派发者提问）。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w2-mcp-core。另两位写者并行写 `packages/skills/*`。派发者唯一合回。不跑 `admission` 与仓库全量测试；变异由 reduce 在最终 head 跑。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w2-mcp-core/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/mcp/spec.md 全文；同目录 plan.md；`packages/mcp/mcp-contract/SPEC.md` 的 K、C、R、S、AV–T 各节；组页「MCP 连接」「MCP 动作清单与 MCP 已知动作」「应用服务」。
- 契约源码：`packages/mcp/mcp-contract/src/{services,ports,transport,catalog,listing,keys,outcomes,values,brands}.ts` 与 `testing*.ts`（五个替身与 `conformanceCase`）。
- 2026-07-28 核对结论 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/schema-check.md：本波只影响 `serverInfo` 可选（已在基线）。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。
- 模板：typescript-package@3.0.0 骨架；`docs/member-documentation.md`。

## 当前认知
- 已确认：基线上成员是模板草稿，依赖已声明（assets、json-text、legal-identity、mcp-contract、operation-result），build/typecheck 通过；`mcp-contract` 298 例通过，`PeerIdentity.serverInfo` 可选。
- 假设：`AbortSignal.any` 与 `AbortSignal.timeout` 在 Node ≥24 可用；`CatalogKey` 的字段足以组成稳定文本。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果；自定裁定清单；变红证据路径；「给下一波」三处签名；未覆盖项。过程输出留工作树 `tmp/closures/w2-mcp-core/`。

## 已知会受影响的现有用例
- `tests/public-entry.spec.ts`：导出集合按新增改写（不算放宽）。

## 停止条件
- 契约缺字段或导出（例如 `ConnectionFailure` 某项无法构造、`StdioLaunch` 取不到）时停下交回，写明需要的可加改动。
- 同一用例连试三种做法仍红时停下。

## 追加记录
（无）
