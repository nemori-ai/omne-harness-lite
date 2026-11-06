# w3-mcp-call-docs3 交回

# w3-mcp-call-docs3 交回

## 1. 结论
规格里的事都做完了。有两处需要你确认或处置：F8 在 `035ac8fee` 上构造不出来（见第 6 节），F16、F17 两个变异存活（见第 6 节，这是最重要的发现）。我没有推送，没有开 PR，没有改 `src/` 与 `tests/`。

## 2. 提交（作者与提交者都读回为 `PanQiWei <594557445@qq.com>`，trailer 为 `Harness: claude-code`、`Agent-Role: developer`）
- `3bae29870` docs：成员与契约的文档对齐最终 head 的代码。涉及 `SPEC.md`、两份 README、`docs/architecture.md`、`flows.md`、`object-model.md` 和契约 `SPEC.md`。
- `4aae0f5a0` docs：验证说明记 fix3 与 `035ac8fee` 的变异、探索器读数与 TLC 重跑。涉及 `verification/README.md`、`verification/models/README.md` 和 `Calls.tla`（只改一行注释）。
- `a9ddf6742` docs：
  - C36、C55 的行写明现名。
  - 改正 F17 的推断。
  - 契约第 30 条不抢先裁「可加」。

最终 head 是 `a9ddf6742`。

`git diff --name-only 035ac8fee..HEAD` 只含 10 个写范围内的文件。`Calls.tla` 的 diff 只有一行注释（`connectionOf` 改成 `exchange`）。`invoke.spec.ts` 没有 diff。

## 3. 验收逐项

**验收 1（变异）**
- 副本是 `git archive 035ac8fee` 的展开：`/tmp/w3-call-docs3-mut`，在工作树之外。
- 驱动：`tmp/closures/w3-mcp-call/docs3/mutations/mutate.py`（sha256 前 16 位 `943e39e568a9494a`）。
- 每个变异改完都按字节还原，并核对过 `src/` 与工作树一致。
- 日志在同目录 `logs/<编号>.log`，汇总有 `logs/table.json`（`0ee2b3a46f76e240`）、`table-F16-F17-F18.json`（`cc7191750371ea01`）、`table-F19.json`（`4fb0d6804de38233`）。
- 副本不改动时，所跑的 7 个用例文件全绿（193 条，`unmutated-copy.log`，`5da4797fbe997f41`）。

**验收 2（TLC）**
- 命令：`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java FORMAL_WORKERS=4 node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py`
- 29 个配置全部「as expected」，`run.py` 退出码 0。
- 正控的不同状态数、生成状态数与深度，与 models README 两张表逐项相同（我用脚本逐项比对了 11 个正控）。
- 负控与探针的状态数随并行调度略有不同，已在 README 里说明。
- 证据目录 `tmp/closures/w3-mcp-call/docs3/tlc/20261106T063959Z`。
  - `summary.json`：`0ad4ccd39d25004c`
  - `tlc-all.log`：`3a27d5bf96ab5f3c`
- `Calls.tla` 的 SHA-256 前 16 位是 `a7c03505f42412cd`，`ConnectionTable.tla` 不变（`b14f3711fe731cc4`）。29 个 `.cfg` 都没有改动。
- 运行时的树是 `035ac8fee` 加上 `Calls.tla` 的一行注释修改，当时还没提交。

**验收 3（门禁，在最终 head `a9ddf6742` 上重跑，07:03Z；日志在 `tmp/closures/w3-mcp-call/docs3/gates/`）**

| 检查 | 结果 | 日志哈希 |
|---|---|---|
| `pnpm run check:docs` | exit 0，`PASS: 2736 Markdown files; local links and skill mirrors.` | `370623577405c36b` |
| `pnpm run check:design` | exit 0，`PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `07b0af04fe75d967` |
| `pnpm run format:check` | exit 0，`All matched files use the correct format.` | `9cb9d4ff0f1570ec` |
| `pnpm run lint:rules` | exit 0，`PASS: product-checks 27 包规则 + 9 仓库路径规则` | `15750fec7e62e241` |

- 另查：改过的文件无 `w/crlf`。
- `git status` 干净。

**验收 4**：见第 2 节。

**验收 5**：见第 7 节。

## 4. 变异表（运行的 head 都是 `035ac8fee`，F8 除外；「日志哈希」是日志文件 sha256 前 16 位）

| 变异 | 变红的用例（标题截断） | 退出码 | 日志哈希 |
|---|---|---|---|
| F1 `answerAtExit` 不读 `isShut()`，只认哨兵 `SHUT` | continue「closeAll while the continuation waits on the store…」；invoke 三条 step 3 | 1（4 条） | `5431be4d14a5f31b` |
| F2 `under` 等待前不核关停 | continue「…waits on the gate…」；invoke「step 3: after closeAll nothing is asked…」「step 3: closeAll while the call waits on the gate…」 | 1（3 条） | `90c60e7190a73a0a` |
| F3 第 8 步不核关停 | invoke「step 8: at whichever microtask closeAll lands…」与「step 3: …a continuation that is not sent…」 | 1（2 条） | `33f08fe871b67c4f` |
| F4 关停之后仍派 `cancelRequest` | invoke「step 11: the signal after the send, once closeAll began…」 | 1（1 条） | `c6834e597fc8c685` |
| F5 出口先读关停、后读停止信号 | cancel「that races the send, followed by closeAll, which the transport then refuses: cancelled…」 | 1（1 条） | `03354d7c63aa7c4d` |
| F6 任务发请求前不核关停 | tasks「at whichever microtask closeAll lands, a task operation on a connection built through the gate…」 | 1（1 条） | `0806936c2784f3e6` |
| F7 任务出口不读关停 | tasks 四条（「closeAll while the operation waits on the gate…」等） | 1（4 条） | `9cf0548df49d6ec4` |
| F8 任务关口之后不再核关停 | 没有用例变红（等价变异）。在 `9747068b9` 上运行，不是 `035ac8fee`；该核对随后已删 | 0 | `143468a1a2468d5d` |
| F9 `settings` 阶段 `connection-unavailable` 答 `no-connection` | tasks「a critical section bound that fires first, with no shutdown…」 | 1（1 条） | `1422bf52f5477ff6` |
| F10 复用连接改回经 `Promise.resolve` 让出一次 | 存活，等价变异 | 0 | `73210e723740b002` |
| F11 取页前不核关停 | refresh「closeAll while the refresh waits on the store before the listing…」 | 1（1 条） | `3f91c17657e53010` |
| F12 refresh 出口不读关停 | refresh「closeAll while a page is asked…」 | 1（1 条） | `c1d91f000ed933ff` |
| F13 出口把已发布也改答 | refresh「closeAll while the store writes the listing…」 | 1（1 条） | `51e25cf7b4dac9cd` |
| F14 `recordSent` 不看阶段 | in-flight「records a send only on a place still reserved…」 | 1（1 条） | `0b2b4a0562a186a9` |
| **F15（035ac8fee 的新变异）** 删掉 refresh 出口的 `stop?.aborted` 一行 | refresh「the caller aborts and closeAll begins while a page is asked: kept (cancelled)…」 | 1（1 条） | `c06ff445923c4b1f` |
| F16（我加）`publish` 读存储前不核关停 | 无 | 0，**存活** | `82f7af44cfdb5a05` |
| F17（我加）发布边界前不核关停 | 无 | 0，**存活** | `647c893753565e8b` |
| F18（我加）`exchange` 入口不核关停 | tasks「after closeAll: the initiator check first…」等 | 1（2 条） | `dbe82341ed15b9af` |
| F19（我加）refresh 入口不核关停 | refresh「after closeAll: connection-unavailable before the gate…」 | 1（1 条） | `808095148f799d7d` |
| C79（N5）`checkOutput` 不交给 `classifyOutcome` | invoke「step 12: complete with a declared output schema…」「step 13: a checkOutput that throws is absorbed…」 | 1（2 条） | `f50062a5359cc7fa` |
| C80（N5）同 F9 的改动，各自运行 | tasks「a critical section bound that fires first…」 | 1（1 条） | `0d19979622ec4902` |

- F11、F12、F13 的变异原文在 `035ac8fee` 上仍能原样构造，我都重跑了一次。
- F15–F19 的编号是我加的。F16–F19 在首次运行之后加入，原因见第 6 节第 3 条。

**探索器负控 N1–N10**（`035ac8fee` 上重跑，2026-11-06 06:29:59Z 起）
- 日志 `tmp/closures/w3-mcp-call/docs3/model/controls-run.log`（`020b1fafbaed2219`），表 `controls/table.json`（`a684d089adb66fa7`）。
- 签名与 `deb5a977e` 上 fix3 的运行完全相同。
- N9：`continue-shutdown` 报 `P13-answer-after-closeAll`；`call-shutdown` 不变红（预期）。
- N10：`task` 报 `P13-answer-after-closeAll`。

## 5. TLC 读数
见验收 2。运行记录已写进 `verification/models/README.md`「运行记录」。

## 6. 需要你知道的事
1. **`invoke.spec.ts` 没有 diff。** N10 要改的那个标题（原 `:809`，现 `:1018`）在 fix3 的 `ffb989c7d` 里已经是 `step 10`。我逐条核对了其余带步号的标题，没有发现过时的。验收 4 因此是空成立。
2. **F8 构造不出来，我没有把它当停止条件，请你确认。** F8 是「任务关口之后不再核关停」，fix3 证明它等价，并在 `0bf12ad34` 删掉了这次核对。变异体就是现在的代码，这在 `deb5a977e` 上就已经是这样，`035ac8fee` 上没有对应文本可变异。我把 F8 记作「在 `9747068b9` 上运行，等价，核对已删」。这不是新缺口，所以没当作停止条件。
3. **F16、F17 存活，这是最重要的发现。** 它们是 `discovery.ts` 里 SPEC MC-7 声称的两处关停读取，没有任何用例守住。
   - F16：`publish` 读存储之前。
   - F17：`published` 发布边界之前。
   - 去掉它们之后：
     - F16 会让存储在关停之后仍被读。
     - F17 会让 `stillAdmitted` 在关停之后仍问关口的端口；随后 `isCurrent` 为假，答复不变，所以只多一次端口调用。
   - 我没有把它们判为等价变异。这两条推断没有用例验证。
   - 要守住它们，需要像 `invoke.spec.ts` 那样对 `refresh` 逐个微任务落下 `closeAll` 的扫描用例。`tests/` 在我的写范围外，我没有补。
   - 文档已如实记录：`verification/README.md`「关停与停止的判定点」与 SPEC MC-7 的变异列表都写「存活，没有变异证据」，没有写成已守住。
   - 增加 F16–F19 的原因：spec 要求每个点写守住它的用例与变异，而 F1–F14、N9、N10 和 F15 没有覆盖 `refresh` 的入口、读存储前、发布边界前，也没有覆盖任务入口。
4. **没有在最终 head 上重跑的证据：**
   - C01–C78，C79、C80 除外。
   - C63、C68（停止信号两点）。它们在 `0b84a0bec` 上运行，`calls.ts` 其后改写，文档里标「现结构上未验证」。
   - 生命周期探索器：head 未记录，状态数未在 `035ac8fee` 上重测。
   - 调用口探索器读数：取自 fix3 的 `deb5a977e`。`035ac8fee` 与它的 `src/` 只差 `discovery.ts` 的 refresh 出口，而探索器不驱动 `refresh`，所以没有重测。
   - 各证据的 head 关系已写进 `verification/README.md` 证据状态一节的「读数的 head」。
5. **验证说明里的新增内容**（均已写进 `verification/README.md`）：
   - 动作映射里的实现名按现代码更新。
   - 调用口探索器表换成 fix3 的读数，并新增场景 `continue-shutdown`。
   - 说明 P13 新加了答复一侧的断言。
6. **`verification/README.md` 的发现 F2 标题仍写「没有人读」。** 那是一个旧缺陷的名字（应答没有被 `ask` 读取，造成未处理的拒绝），不是 SPEC 所指的措辞，我没有动。
7. **副本 `/tmp/w3-call-docs3-mut` 和 `/tmp/docs3-edit/` 留着，可以删。** 工作树外的旧副本 `/tmp/w3-call-fix3-*` 也还在，fix3 已说过可以删。
8. 契约第 30 条只写了行为改动和前后答复（`not-available-to-you` 变为 `connection-unavailable`）。是否「可加」没有裁，留给卡拥有者在波末写回。

## 7. 逐条位置（B N3、N5–N11 与规格第 1、2 条）
- **第 1 条（出口一处判定）**，已改：
  - 成员 SPEC「组合与验证·未覆盖」的决定点句（原 `:221`）和「性质与证据」的前提句（原 `:246`）。两处都改成出口与途中各点的写法，并链接到新节。
  - `verification/README.md` 新增「## 关停与停止的判定点」一节：三出口次序表加 15 点逐点表，每点写用例与变异。
  - SPEC MC-16 第 2 步的「下一个决定点」改为「下一个读它的点」。
- **第 2 条（fix3 交回第 10 节）**，已改：
  - `verification/README.md`：C07、C44、C65、C22、C31、C55 引的标题；C36 与 C55 的行内标出现名；N 序列表 N1、N2 的变异原文；关停读取点一段；调用口读数；新场景；N9、N10；F1–F14。
  - `verification/models/README.md`：「可观察结果相同」只对端口成立。
  - `docs/object-model.md`：`recordSent`。
  - `docs/flows.md`：第 8 步与出口。
  - `docs/architecture.md`：`publish` 三段、出口、TaskTable「有歧义」。
  - 两份 README 维护段：S8 的承载模块。
- **第 3 条**：F15 记入 `verification/README.md` F 序列表，并写进 SPEC MC-7 的变异列表；F11–F13 重跑；SPEC MC-7 测试表一行补用例名「the caller aborts and closeAll begins while a page is asked」。
- **第 4 条**：`Calls.tla` 的注释已改；TLC 29 个配置重跑，读数在 models README。
- **N3**：已改。我扫描了 mcp 与 contract 的所有 md，没有残留未转义的代码跨度 `|`。涉及 `verification/README.md` 动作映射的 `Ask call`、`Ask answer`、`Abandon`、`TaskOp` 四行。
- **N5**：已改。C79、C80 两行加在 C 表末，SPEC MC-16 与 MC-17 的变异句各补 C79、C80。
- **N7**：已改。
  - `docs/architecture.md` 模块表补 `internal/classification.ts`。
  - SPEC「未覆盖」的 `failureOfEnsure` 改为 `connectionFailureOfBuild`。
  - TaskTable 一行补「有歧义」。
- **N8**：已改，SPEC 两处改为「它的值没有人使用」。
- **N9**：已改。
  - 生命周期读数写「head 未记录，状态数未在 `035ac8fee` 上重测」。
  - `verification/README.md` 证据状态一节的「读数的 head」交代了各证据的 head 与 PR head 的关系。
- **N10**：已改。
  - SPEC 读法段补「调用口第 N 轮裁定 <面> <号>」。
  - SPEC 内相关引用（MC-7、MC-12、MC-16、MC-17）都加了「调用口」。
  - 「本闭包」已全部换成闭包名。
  - 契约第 26、27 条的出处改为「「reduce 已定的事」第 7、4 条」。
  - `invoke.spec.ts` 无需改（见第 6 节第 1 条）。
- **N11**：已改。契约新节为第 28、30 条各写一句性质；第 30 条写明 `closeAll` 之后对未采用接入点，`refresh` 由 `not-available-to-you` 变为 `connection-unavailable`。

## 8. 没覆盖到的项
见第 6 节第 3、4 条。另外 B N4 本闭包没有动（fix3 已处理）。
