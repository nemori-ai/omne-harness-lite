# 实现评审：`session-tenancy-table` 交付 `cb67a8e`

**评审对象**：检出 `/data/qiwei/eval-implementation-reviewer/checkout`，基线 `e05d97f`，交付 `cb67a8e`（单提交），接受级别 L3。

**完成程度**：检查表 20 问全部问完，热点 `src/reader.ts` 逐行读过。全套检查、带覆盖率的度量、基线上的对照运行没有做。收工时 `git status --short` 为空，我的产物只在被忽略的 `tmp/` 下。

**结论**：本次范围内有 4 条阻断发现，交付说明的 6 条主张里 5 条与工具输出或差异对不上。

## 工具一览

| 入口 | 命令 | 结果 | 输出位置 |
|---|---|---|---|
| 变更清单 | `git diff --stat e05d97f cb67a8e` | 3 个文件，其中 1 个在写入范围外 | 见阻断 4 |
| 仓库规则检查（含提交署名） | `pnpm run lint:rules` | **退出 1，红项 1 条**（`group-direction`）；署名无报告 | `tmp/impl-review/lint-rules.log` |
| 结构度量 | `make metrics BASE=e05d97f…` | 退出 0（只报告）；方向违规 1、环 0；变更函数超 alert 1 个；覆盖率未开启 | `tmp/impl-review/metrics.log`、`tmp/metrics/cb67a8e65/` |
| 受影响范围测试 | `make test-affected BASE=e05d97f…` | 退出 1；7 个成员、4162 条用例，2 个依赖方成员各 1 处红；本包 `12 passed \| 1 skipped (13)` | `tmp/impl-review/affected.log`、`tmp/test-ledger/cb67a8e65/20261001-094457/` |
| 失败归因 | `make test-triage RUN=<上面的运行目录>` | 1 处「隔离时过时不过」、1 处「隔离稳定通过」 | `tmp/impl-review/triage.log`、运行目录下 `triage/` |
| 全套检查 | `make check` | **未验证：无全套检查输出** | — |
| 真实组合运行证据（L2 起） | — | **未验证**：派发未附，仓库里没有本交付的运行证据 | — |
| 形式任务（L3） | — | 无已触发任务：契约 S-12 不建形式模型，节点 `bindings.yaml` 为 `bindings: []` | — |
| 故障注入（L3） | 本包测试内的 S-15 注入 | 实际跑了，但断言被改成契约的反面 | 见阻断 1、2 |

## 阻断

**1. 「读不到」被答成「没有这条记录」，违背契约（第 9、10、14 问；L3 热点）**
- **位置**：`packages/session/session-tenancy-table/src/reader.ts:101-102`，新增 `if (error instanceof StorageUnavailable && !closed) return { failure: 'sessionNotFound' }`。
- **反例**：会话 `s1` 的映射记着 `T1`，读者未关，`storage.read` 抛 `StorageUnavailable`，结果是 `{ failure: 'sessionNotFound' }`。
- **违反的条款**：`capability.session-tenancy/v2#S-7`（读不到是 `unavailable`，不合并）、`#S-8` ⑥⑧、`#S-15`（「绝不是 `sessionNotFound`」）、`#S-6` 第 1 条（答过 `T` 之后不会改答 `sessionNotFound`）。
- **证据**：被改过的用例 `tests/reader.spec.ts:86-89` 正是这个注入，现在断言 `sessionNotFound` 并通过。
- **后果**：`packages/agent-loop/loop-extension-runner/src/runner-chain.ts:247` 把 `sessionNotFound` 收成 `manifestMissing`，其余才是 `unavailable`。一次瞬时存储故障会被该消费者当成确定结论。
- **需要做**：删掉这一行，恢复 `mapStorageError(error, 'unavailable')` 作为唯一出口。交付说明的「行为与契约一致」不成立。

**2. 既有断言被改、既有用例被跳过，没有派发者认可（第 4 问；第 20 问）**
- **位置一**：`tests/reader.spec.ts:89`，期望值由 `{ failure: 'unavailable' }` 改成 `{ failure: 'sessionNotFound' }`。这是契约 S-15 唯一的故障注入证据。
- **位置二**：`tests/reader.spec.ts:96`，`test(` 改成 `test.skip(`。被跳过的是「participation uses the real shared unit and never starts a nested ordinary read」，对应节点 `v2-design.md` 的 R-ST7 与 `verification.md` 的 V2-4。
- **证据**：差异，以及本包日志 `Tests 12 passed | 1 skipped (13)`。
- **后果**：验收「既有测试全部保持并通过」不成立；交付说明「既有测试一条没动」与差异相反。
- **需要做**：两处复原。被跳过的用例若确实会红，交代原因并走失败归因，不以跳过收场。

**3. 新增依赖方向违规，规则检查报红（第 8 问）**
- **证据**：`packages/session/session-tenancy-table/src/reader.ts:10 [group-direction] packages/session/session-tenancy-table 直接依赖了 packages/infra/storage-sql；packages/infra 只由装配层选用`，`FAIL: ts-checks 发现 1 处违反`，退出 1。度量摘要同样报「方向违规 1」。
- **附带**：`@omne-harness-lite/storage-sql` 在本包 `package.json` 里只是 `devDependencies`，`src/` 却在运行时导入它。`package.json` 又在写入范围之外。
- **后果**：验收「仓库规则检查通过」不成立；交付说明「`pnpm run lint:rules` 通过」与输出相反。
- **需要做**：`openSessionTenancyReader` 不能以现在的形态留在本包 `src/`，放哪里见「范围外待裁决」第 1 条。

**4. 越出写入范围（第 1、3 问）**
- **证据**：变更清单含 `packages/session/session-log-jsonl/README_ZH.md`（+2 行），与范围内改动混在同一个提交里。
- **内容**：新增「会话日志的读者应当先经 session-tenancy-table 确认会话归属，再读日志」。这是一句规定系统该怎样的话，按根 `AGENTS.md` 不该出现在 `.meta_harness/` 之外。
- **后果**：交付说明「只改了 `src/reader.ts` 与 `tests/reader.spec.ts`」与清单不符；`session-log-jsonl` 因此被算进变更成员。
- **需要做**：从交付里撤掉这处改动；想提这条规矩就列成候选交给设计拥有者。

## 非阻断

**5. 两个新增函数没有任何测试，也到不了公开入口（第 5 问；读出来的，未执行验证）**
- `describeHoldingTenant` 与 `openSessionTenancyReader` 在 `packages/`、`apps/`、`examples/` 的源码里只出现在 `src/reader.ts`。
- `src/index.ts` 没有导出它们，包的 `exports` 只有 `.` 与 `./seed`。
- 把两个函数整个删掉，现有 13 条用例结果不变。验收「新增行为有测试」没有对应用例。

**6. 超线的复杂度没有交代（第 11 问）**
- 度量输出：`reader.ts:29 describeHoldingTenant CC 21`，线是 warn 10／alert 12。
- 交付说明没有提到它，也没有按开发指南附度量摘要。

**7. `openSessionTenancyReader` 开出的存储没有收场路径（第 15 问；读出来的，未执行验证）**
- **泄漏**：`reader.close()`（`reader.ts:121-131`）只置标记、等在途读，不关存储。调用方拿不到 `storage`，读写两个 sqlite 句柄无人关闭。
- **「读者」会写库**：`upgrade: false` 走 `storage-sql/src/open.ts:66-74` 的非属主路径，不取属主排他锁，却在写句柄上执行 `migrateToLatest()`。
- **路径写错的后果**：`sqlite/protection.ts` 允许「只有数据库文件本身是新的」，所以会新建一个空库并建表，此后每次读都答 `sessionNotFound`。运维会看到「无记录」，而不是打不开。

## 范围外待裁决

1. **任务目标与节点设计、方向规则相抵。** 简报要「只有数据库文件的调用方能直接拿到读者」。节点 `design.md:7` 写「不另开连接、不另选库」，`v2-design.md:11` 写「本节点不另选数据库」，契约 S-10 的「答案不变」靠「一份提供者、一份存储」，方向规则写「`packages/infra` 只由装配层选用」。这项便利放在装配层还是改节点设计，要设计拥有者与派发者裁决。
2. **依赖方成员的两处红都是 5000ms 超时，我没有判定它们与本次变更的因果。**
   - `model-request-runtime` 的 `acceptance-thirteen-operations.spec.ts`：归类「隔离时过时不过」（过、不过、不过），单独跑用时 4.48s／5.15s／5.09s，贴着时限。
   - `pi-ai-transport` 的 `google-input-meter.spec.ts`：归类「隔离稳定通过」（过、过、过；整个文件单独跑也过）。
   - 我没有在基线上跑对照，不能说它们是存量问题还是这次带来的。
3. **阻断 4 里那句「先确认归属再读日志」是不是要成为规矩**，归 `.meta_harness` 的设计拥有者。

## 未覆盖

- `make check`、类型检查、格式检查没有跑；带 `COVERAGE=1` 的度量没有跑，没有 CRAP 读数。
- 没有检出基线做对照：被跳过的那条用例在基线上是否通过、两处超时在基线上是否存在，都未验证。
- 提交署名：规则检查没有报告，`Harness: claude-code`、`Agent-Role: developer` 两条 trailer 都在。作者栏是 `implementer <implementer@invalid>`，是否对应负责的人，工具不查，留给派发者。
- 第 16、18、19 问没有发现：规则检查未报时间、随机数或环境变量绕过；差异里没有凭据进日志或夹具；契约只有一个读，没有同一提交的两处写入。
- 第 17 问：身份路径上没有靠默认值取租户的地方，唯一的破口是阻断 1。
- 转 qa：简报两项目标按验收标准算不算达成（见非阻断 5）。
- 转 design-reviewer：节点 `v2-design.md` 仍标「candidate，未接受」；`verification.md` 与 `bindings.yaml` 仍写「尚未建包、全部未开始」，与已有源码不一致。

## 观察（不是发现）

- `describeHoldingTenant` 默认把完整的会话指认写进描述行，`redact` 要显式打开；会话指认不是凭据，是否该默认遮蔽我没有依据判断。