# mcp-e2e 第 2 轮复核（只读）

对象：PR #1149，工作树 `.worktrees/w3-mcp-e2e`，`71b4b02f3..e50c356a4`（`64e3ef161` 测试，`e50c356a4` 文档）。复核人只读；未改仓库文件。

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| B-1 两份 README 不再写「未验证，归 `w3-mcp-e2e`」 | 成立 | `grep -rn "w3-mcp-e2e\|MC3-12"` 在 `README.md`、`README_ZH.md`、`SPEC.md`、`tests/` 下无命中。`README.md:18`、`README_ZH.md:18` 写「`tests/e2e/` 在本机五个目标上验证」并指向 `SPEC.md#组合与验证`；远程对端、TLS 一行单列为未验证 |
| B-2 SPEC 条款格的「C4」与 `MC3-12` | 成立 | `SPEC.md` 新行条款格为「调用方与本传输的真实组合……，[卡 #1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119) 判据 C4」；「MC3-12」改写成「七步各自的结局种类相同」。`journey.spec.ts` 文件头与 describe 标题的编号也已去掉 |
| 规格 1：S6 取消发生在请求交回 `SentCall` 之后 | 成立 | `journey.spec.ts` S6 经 `invoke` 的 `observe` 等第一条 `progress` 再 `cancel`；`SEND_GRACE_MS` 已删。`calls.ts:387-399`：`transport.call` 交回 `SentCall` 后才 `place.recordSent`，在途表由 `reserved` 变 `sent`（`in-flight.ts` 的 `recordSent`、`cancel` 两分支）。进度通知由对端发出，证明请求已到对端。三个目标的 `LONG_CALL` 为 `{duration:60, steps:60}` |
| 规格 1：等待有上界 | 成立 | `firstOf` 对 progress、调用结束、`PROGRESS_BOUND_MS`（20 s）三者竞争，`finally` 清定时器。超时仍先 `cancel` 再 `await invoking`，之后抛「S6: no progress notification was received」；调用先结束抛「S6: the call ended before any progress」。用例时限 100 s，低于慢层 120 s |
| 规格 1：只去掉 `sent` 分支 abort，三目标 S6 变红；哈希 | 成立 | 交回的 `m1-sent.diff` 为 `109d108 < place.cancel.abort()`；对工作树的 `in-flight.ts` 核对，第 109 行是 `case 'sent'` 里的 abort，`reserved` 分支（第 105 行）未动。`m1-sent.log` 中 E-stdio、E-http、E-sse 都是 `S6 … expected 'signalled>complete' to be 'signalled>unknown:abandoned'`；另有比较用例变红。`sha256sum` 前 16 位复算：`m1-sent.log` dd505c2a00916959、`m1-sent.diff` 060c68a93339a87a、`e2e.log` fe02531d8bf98a59、`slow.log` 5f7aaafaf48d23a6，与交回一致 |
| 规格 2：每目标期望步号表并断言相等 | 成立 | `targets.ts` 的 `Target.steps`：E-stdio、E-http 为 S1–S7（`ALL_STEPS`），E-sse 为 S1、S2、S3、S6、S7，F、P 为 S1、S2、S3、S7。`journey()` 循环后 `expect(taken.map(step), …).toEqual(target.steps)`。该表与 `JOURNEY` 的 `applies` 各自独立写出，一方漂移即红；交回日志里变异时的「步序列缺 S7」断言红也印证它起作用 |
| 规格 3：读数先于逐步断言 | 成立 | `readings.set(target.id, taken)` 移到第一步之前，`taken` 逐步推入，现代两目标比较用例可报出出现差异的那一步 |
| 规格 4：内层 `finally` 关闭目标 | 成立 | `try { await closeAll() } finally { await started.close() }`，外层 `finally` 包住 |
| 规格 5：计数已删 | 成立 | `assembly.ts` 删 `checks`、`outputChecks`；替身为 `() => ({ kind: 'conforms' })`，对任何值答 `conforms` |
| 复跑 | 成立 | 本轮在 `packages/mcp/mcp-host-local` 跑 `VITEST_MAX_WORKERS=4 pnpm exec vitest run tests/e2e/journey.spec.ts --mode slow`：6 passed，无类型错误，13.5 s；S6 三目标读数 `signalled>unknown:abandoned`，E-sse 为 S1、S2、S3、S6、S7，F、P 为 S1、S2、S3、S7 |
| 改动文件范围 | 成立 | `git diff --name-only 71b4b02f3..HEAD` 共 11 个，全在 `packages/mcp/mcp-host-local/` 的规格写范围内；无 `src/`；工作树干净 |
| 新文档陈述与契约、依据一致、无断链 | 成立 | 抽查：契约锚点 `mcp-contract/SPEC.md#port-transport` 存在；`mcp/tests/continue.spec.ts` 的用例标题、`tasks.spec.ts` 的 `queryTask/taskResult/provideTaskInput`、`cancel.spec.ts`、`invoke.spec.ts`、`release.spec.ts`、`stdio.spec.ts`、`conformance.spec.ts` 都在；E-sse 的 S4、S5 不适用的依据（T3 `legacyInitializeParamsOf`）与 `targets.ts` 注释一致；S5「途中必经 `input_required`」有 `expect(answered)` 在代码里守住 |

## 新阻断

无。

## 非阻断观察（不要求处理）

- S6 的「进度先到」与 `recordSent` 之间在理论上没有同步屏障（`observe` 与 `call` 交回各自异步）。变异读数证明三个目标实际都走 `sent` 分支，没有反例，不构成阻断。
- 本轮未复跑门禁（`typecheck`、`lint`、`check:docs` 等）与变异，只核对交回日志的哈希与变异 diff 的位置；规格条目 10（对照矩阵运行记录写入任务 tmp）在仓库之外，不在本轮复核范围。
