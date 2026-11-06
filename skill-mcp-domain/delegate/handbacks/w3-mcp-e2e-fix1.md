# 交回：w3-mcp-e2e-fix1

## 1. 结论

做完。第 1–11 条都已改，验收 1–5 通过。没有改任何 `src/`，没有触发停止条件。日志在 `delegate/handbacks/w3-mcp-e2e-fix1-logs/`（下称「日志目录」），哈希取 sha256 前 16 位。

## 2. 提交

分支 `PanQiWei/skill-mcp-w3-mcp-e2e`，作者与提交者都读回为 `PanQiWei <594557445@qq.com>`。基线 `71b4b02f3`。

- `64e3ef161`：`test(mcp-host-local)` S6 等第一条进度再取消；步号表；读数先发布；`closeAll` 失败时目标仍关闭；删输出校验计数。
- `e50c356a4`：`docs(mcp-host-local)` 当前 HEAD。README、SPEC 与 tests 文档。

仓库之外：`compat/README.md` 追加一段运行记录（第 10 条）。

## 3. 第 1–11 条逐条

| 条 | 状态 | 位置 |
| --- | --- | --- |
| 1 | 已改 | `tests/e2e/targets.ts`：`LONG_CALL` 为 `{duration: 60, steps: 60}`，每秒一条进度。`tests/e2e/journey.spec.ts`：删 `SEND_GRACE_MS`；S6 用 `invoke` 的 `observe` 等第一条 `progress` 再 `cancel`；`firstOf` 有 20 s 上界（`PROGRESS_BOUND_MS`）；超时写「S6: no progress notification was received」，调用先结束写「S6: the call ended before any progress」。三个目标的 S6 都走 `sent` 分支。变异见第 5 节 |
| 2 | 已改 | `targets.ts` 的 `Target.steps` 与 `ALL_STEPS`；E-sse 为 S1、S2、S3、S6、S7，F、P 为 S1、S2、S3、S7。`journey.spec.ts` 的 `journey()` 对 `taken` 的步号断言 `toEqual(target.steps)` |
| 3 | 已改 | `journey.spec.ts`：`readings.set(target.id, taken)` 放在第一步之前，`taken` 随步推入，两个现代目标的比较能报出不同的那一步 |
| 4 | 已改 | `journey.spec.ts`：`closeAll` 放进 `try`，`started.close()` 放进内层 `finally` |
| 5 | 已改 | `assembly.ts`：删 `checks`、`outputChecks`，替身为 `() => ({ kind: 'conforms' })` |
| 6 | 已改 | `README.md`、`README_ZH.md` 第 17、18 行：远程对端一行写「未验证」；真实组合一行写 `tests/e2e/` 在五个本机目标上验证，指向 SPEC「组合与验证」。去掉 `w3-mcp-e2e` |
| 7 | 已改 | `SPEC.md` 组合与验证新行：「卡 #1119」带链接，写「判据 C4」；去掉 MC3-12，改写成「七步各自的结局种类相同」。另清掉 `journey.spec.ts` 的 describe 标题与文件头注释、`tests/index.md`、`tests/e2e/index.md`、`tests/e2e/README.md` 里的 MC3-12 |
| 8 | 已改 | N-1：同第 7 条。N-2：SPEC 未覆盖改成「2026-11-06 与官方 SDK 客户端 2.4.0 做过一次三步对照，两边一致」；`e2e/README.md` 去掉「见任务材料」。N-3：SPEC 新行写 E-sse 的 S4、S5「按修订不适用」，依据契约 T3 的 `legacyInitializeParamsOf`，补充覆盖写出 `mcp/tests/continue.spec.ts`、`mcp/tests/tasks.spec.ts` 与 `tests/conformance.spec.ts` 的标题。N-4：`e2e/README.md` 边界节分成「五个需求端口」与另两个端口。N-5：「每个目标走适用的步」。N-6：`tests/index.md` 改「五个目标」。N-7：`tests/README.md` 慢层列表加 `e2e/journey.spec.ts`，遗留检查按层写清。N-8：SPEC「范围与依据」加 server-filesystem 2.1.0、mcp-server-fetch 2026.10.28（含 `uv sync --locked --group mcp-fixtures`）与调用方 `@omne-harness/mcp` 三行。N-9：`e2e/README.md` 的 S7 行写 `root-only` 与 `no-process`，边界节加「目标 × 适用步」表。N-10：`tests/fixtures/README.md` 改成链接 |
| 9 | 已改 | SPEC「未覆盖」加两条（取消通知不核对：`cancel.spec.ts`、`invoke.spec.ts`、`tests/stdio.spec.ts`；HTTP 的 S7 不核对传输关闭：`release.spec.ts`）。`e2e/README.md` 写明 S5 选的工具途中必经 `input_required`，是该工具的前提 |
| 10 | 已改 | `compat/README.md` 末尾追加运行记录，见第 6 节 |
| 11 | 已改 | 第 5 节 |

## 4. 验收逐项

1. 慢层：`VITEST_MAX_WORKERS=6 pnpm --filter @omne-harness/mcp-host-local test:slow`，HEAD `e50c356a4`，退出 0，`Test Files 5 passed (5)`、`Tests 246 passed | 8 skipped (254)`。日志 `slow.log` `5f7aaafaf48d23a6`（2026-11-06 10:38 UTC）。`e2e/journey.spec.ts` 单独运行：`vitest run tests/e2e/journey.spec.ts --mode slow`，退出 0，`Tests 6 passed (6)`，P 用例 924 ms 通过，没有跳过。日志 `e2e.log` `fe02531d8bf98a59`。读数：E-stdio S1–S7 为 `published, complete, toolError, inputRequired>complete, task>completed>complete, signalled>unknown:abandoned, released`；E-http 相同；E-sse 为 S1、S2、S3、S6、S7，F、P 为 S1、S2、S3、S7，种类与上一轮相同。
2. 变异：见第 5 节第 1 行，三个目标的 S6 都变红。
3. 门禁，HEAD `e50c356a4`，2026-11-06 10:35 UTC 前后，全部退出 0：
   - `pnpm turbo run typecheck --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp --filter=@omne-harness/mcp-contract`：`Tasks: 9 successful, 9 total`，`typecheck.log` `b99abbc18dbf3c8f`。
   - `pnpm run lint:rules`：`PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6202 个提交的署名，无违反`，`lint-rules.log` `770a08a516cf992b`。
   - `pnpm run lint:oxlint`：无告警，`lint-oxlint.log` `f75be85110d5a0a5`。
   - `pnpm run format:check`：`Finished … on 4373 files`，`format-check.log` `8f6864e6eeb5dec6`。
   - `pnpm run check:docs`：`PASS: 2753 Markdown files`，`check-docs.log` `56c3b5fd77c1615e`。
   - `pnpm run check:design`：`PASS: 354 个词条、69 条对象条目 … 对账一致`，`check-design.log` `029bd08cc40d76df`。
   - 仓库级 `typecheck` 与 `lint:deps` 按规格不作本轮验收，没有运行。
4. `git diff --name-only 71b4b02f3..HEAD` 共 11 个文件，都在写范围内：`tests/e2e/` 的 `journey.spec.ts`、`targets.ts`、`assembly.ts`、`README.md`、`index.md`；`tests/README.md`、`tests/index.md`、`tests/fixtures/README.md`；包的 `README.md`、`README_ZH.md`、`SPEC.md`（只改「范围与依据」与「组合与验证」）。没有 `src/`。工作树干净。
5. 逐条见第 3 节。

## 5. 变异表

副本 `/tmp/w3-e2e-fix1-mut/`（`rsync` 自工作树，根 `node_modules` 软链），改 `src` 后重建 `mcp` 再跑 `tests/e2e/journey.spec.ts`。跑完用 `cp` 按字节还原并 `cmp` 核对，再重建。

| 变异 | 变红的用例与步 | 运行者 | head | 日志哈希 |
| --- | --- | --- | --- | --- |
| 本轮重做：`packages/mcp/mcp/src/internal/in-flight.ts` 的 `cancel()`，只去掉 `sent` 分支的 `place.cancel.abort()`（`reserved` 分支不动），diff 在 `m1-sent.diff` | E-stdio、E-http、E-sse 都在 S6 变红：`expected 'signalled>complete' to be 'signalled>unknown:abandoned'`，约 60 s 后长时工具答完；F、P 绿（无 S6）；两个现代目标的比较用例也变红（步序列缺 S7） | 本闭包写者 | `64e3ef161`（`tests/e2e/` 代码与最终 HEAD 相同，之后只有文档提交和一处 describe 标题） | `m1-sent.log` `dd505c2a00916959`，`m1-sent.diff` `060c68a93339a87a` |
| A 面 mD2：`mcp-host-local/src/session.ts` `discover()` 开头走旧一路 | E-stdio、E-http、F、P 在 S1 变红（修订不符、`kept` 不是 `published`）；E-sse 绿 | 评审 A | `71b4b02f3` | `f962dfce24ce323a`（`mcp-e2e-r1-a-logs/`） |
| A 面 mE2：`mcp/src/discovery.ts` 每页去掉第一个工具 | E-stdio、E-http、E-sse、P 在 S1 变红；F 绿 | 评审 A | `71b4b02f3` | `bf37130dcb26b95a` |
| A 面 mF：`mcp-contract/src/classify.ts` `completed()` 清空 `complete` 的内容 | 五个目标在 S2 变红 | 评审 A | `71b4b02f3` | `fb24e8bbbfa254b2` |
| A 面 mB：`mcp/src/calls.ts` `continuationOf` 不带 `inputResponses` | E-stdio、E-http 在 S4 变红 | 评审 A | `71b4b02f3` | `70cd2e69c6670e39` |
| A 面 mC2：`mcp-contract/src/composition.ts` `updateTaskRequest` 传 `values: {}` | E-stdio、E-http 在 S5 变红 | 评审 A | `71b4b02f3` | `dd34634656114462` |
| A 面 mA2：`mcp/src/internal/table.ts` `close` 固定报告 `no-process`（S7 的 `no-process` 一支） | E-stdio、F、P 在 S7 变红；E-http、E-sse 绿 | 评审 A | `71b4b02f3` | `54000206f94899d3` |
| 上一轮 m1：`classify.ts` `isError` 答 `complete` | 五个目标在 S3 变红 | 上一轮写者 | `d5eb8d529` | `f0a3c871cf749693` |
| 上一轮 m3：`teardown.ts` `stopOne()` 不调 `stop()` | E-stdio、F、P 在 S7 变红 | 上一轮写者 | `d5eb8d529` | `5250b8a3fcac19dd` |

上一轮的 m2 与 m2b（S6 在 E-http 要改两处才红）被本轮第一行取代：现在只改 `sent` 分支，E-http 也变红，说明 E-http 的取消走 `sent` 分支。评审 A 的 mG（停止之后不再发取消通知）与 mH（`release` 不调 `transport.close()`）全绿，已写进 SPEC「未覆盖」，不在本轮补用例。

## 6. 对照矩阵（第 10 条）

- 命令：`node mcp-compat-matrix.mjs`（在 `compat/` 目录运行），退出码 0，2026-11-06 10:39:10 至 10:39:26 UTC。
- 输出 `matrix.out` `8628b91ca5013079`。读数与 09:57 的表相同：八行修订、工具数、工具名、调用结论一致，全部 agree。远程行 `date -u` 为 10:39:14、10:39:15、10:39:16。SDK 2.4.0，实现提交 `3289bee2f`。
- 已追加到 `compat/README.md` 末尾，一段运行记录；09:57 的读数表没有改，读数与上次相同，没有另起表。

## 7. 没覆盖到的项与决定

- 变异只在副本上做，没有改 `src/`。差分变异不适用（本闭包不改 `src/`）。
- S6 的 20 s 进度上界：长时工具每秒一条进度，本机三次运行第一条在约 1 s 到达。上界选 20 s 是留给负载下的余量。用例时限 100 s，低于慢层的 120 s。
- 评审 A 的 N7（用例超时后旅程仍在后台）与 N10（落点替身忽略 env 与 cwd）按规格不做。N11 的端口先探测后使用只会误红，不处理。
- B 的 N-11（`packages/mcp/README.md`）属 `w3-docs-mcp`，未改。
- 能自己定，依据是……：`tests/README.md` 里 e2e 的遗留检查写成「子进程」，依据是 `afterEach` 只核对子进程（`leftover()`），HTTP 目标由旅程里的 `started.close()` 关。
- 只有负责人能定：无。
