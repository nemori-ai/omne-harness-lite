# PR #1149 面 E 交付边界评审（r1）

对象：分支 `PanQiWei/skill-mcp-w3-mcp-e2e`，head `71b4b02f3`，基线 `3289bee2f`。只读评审，没有改仓库文件，没有跑测试（只跑了 `vitest list --mode slow` 数用例）。

记号：
- 「交回」指 `delegate/handbacks/w3-mcp-e2e.md`，「日志」指同目录 `w3-mcp-e2e-logs/`，「门禁」指工作树 `tmp/closures/w3-mcp-e2e/owner-gate/`。
- 日志哈希已用 `sha256sum` 复核：交回里列的 13 个哈希（前 16 位）与文件全部相符。
- 门禁日志在 head 上取得，`git rev-parse HEAD` 为 `71b4b02f336c46af0d13cc9860d535b994009fe9`。

## 判定表

| 标准 | 结论 | 证据位置或缺什么 |
| --- | --- | --- |
| 1.1 慢层退出 0，`tests/e2e/` 用例都执行，P 不跳过 | 达到 | 日志 `slow.log`（`exit 0`，`Tests 246 passed \| 8 skipped`，哈希相符）。`vitest list --mode slow` 在 head 上数得 e2e 6 条，合计 198+6+25+3+14=246，所以 6 条 e2e 在这 246 里。P 的执行见 `e2e.log`：P 用例 966 ms 通过，`6 passed (6)`，无跳过。注：`slow.log` 没有逐文件行，e2e 的逐条读数在 `e2e.log`。门禁 `test-slow.log` 复跑同样 `246 passed`。 |
| 1.2 旅程读数表；MC3-12 在 E-stdio 与 E-http 通过 | 达到 | 交回 4.2 的表；`e2e.log` 的 `journey E-stdio/E-http/E-sse/F/P: S1=… S7=…` 行与表逐格相符；MC3-12 用例 `E-stdio and E-http answer the same kind…` ✓。不适用的步都写了理由。 |
| 1.3 三处手工变异，各让指定步变红，写变异、用例与步、head、日志哈希 | 达到 | 交回 4.4 的四行（变异 1、2、2b、3），日志 `m1/m2/m2b/m3.log` 哈希相符。读回：m1 五个目标都在 S3 变红；m2 E-stdio、E-sse 在 S6 变红；m2b E-http 在 S6 变红；m3 E-stdio、F、P 在 S7 变红。注（不改结论）：①变异 2 按规格原样只让 E-http 以外的两个目标变红，E-http 靠 2b 多去掉一处 `abort()`；2b 跑在一个多了诊断 `console.info` 的副本上，不是 head 的逐字内容。②变异 3 只做了「不停进程」，规格写「或报告 `no-process`」，允许二选一。③`m*.log` 里没有 head 与变异补丁，head 只由交回的文字断言，补丁没有归档。④E-http 的 S6 在请求发出 300 ms 后调用仍在 `reserved`（交回 4.4 自述，未核）：HTTP 上 S6 走的是发出前的分支，规格写的是「请求发出之后」。交回已提示，需派发者定。 |
| 1.4 对照矩阵：脚本退出 0；八行读数表；SDK 实际版本；每行一致或不一致；远程行带 `date -u` | 达到 | 日志 `matrix.out`（哈希相符）：SDK `@modelcontextprotocol/client 2.4.0` 读自 `package.json`（脚本第 34 行），八行都 `agree`，行 4–6 带 `date -u`，GitHub MCP 列为排除；`compat/README.md` 第 60 行起新一节，有日期、提交号 `3289bee2f` 与表。脚本从自身位置解析根（`resolve(HERE,'../../..')`），从 `dist` 导入。注：①`matrix.out` 没有退出码行，「退出 0」只由交回文字断言。②脚本的退出码只在「有行崩溃且全部行都出错」时为 1，某行不一致或不可达仍退出 0，所以「退出 0」不能单独证明一致，要读表。③脚本读的是父分支工作树 `.worktrees/skill-mcp` 的 `dist`（`3289bee2f`），不是闭包分支；闭包没有改 `src/`，不影响读数。我没有重跑（远程读数随时间变）。 |
| 1.5 `typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs` 全部退出 0，输出尾部与哈希 | 未达到 | 六条里 `lint:deps` 退出 1（日志 `lint-deps.log`，`✗ 8 处依赖违规`；全是 `no-unresolvable`，位置在 `agent/agent/acceptance`、`assets/settings-local/tests`、`identity/identity-sql/tests`，方向命中 0，与 mcp 三成员无关）。`typecheck` 写者只在 `mcp-host-local` 内跑（退出 0）；派发者在根上跑 `pnpm run typecheck` 为 47/54，`identity-sql#typecheck` 因缺 `dist` 失败（门禁 `typecheck.log`），`mcp-host-local` 单包（门禁 `typecheck-mcp.log`）9/9 成功。门禁目录没有 `lint:deps` 日志。其余四条（`lint:rules`、`lint:oxlint`、`format:check`、`check:docs`）在 head 上退出 0，写者日志与门禁日志都有。缺：`lint:deps` 与根 `typecheck` 退出 0 的日志（要在所有成员都已构建 `dist` 的树上取得），或规格里写明的豁免。追加 1 说它们「与本改动无关」，但没有修改验收 5 的字面。 |
| 1.6 `git diff --name-only 3289bee2f..HEAD` 只含写范围内的仓库文件，无 `src/` | 未达到 | 实测 12 个文件：10 个在写范围内的目录与文件；另外两个 `packages/mcp/mcp-host-local/package.json` 与 `pnpm-lock.yaml` 来自派发者提交 `49f0681f8`，二者不在写范围，并且 `package.json` 与锁文件在「排除的调用方」里。写范围里 `assembly.ts` 之外只许「再拆一个同目录的夹具文件」，实际新增 `targets.ts` 与 `command.ts` 两个，`command.ts` 有追加 1 的授权，`targets.ts` 没有。无 `src/` 文件，这一半达到。缺：规格对 `49f0681f8` 与 `targets.ts` 的改写（见冲突项 1、2）。若按追加 1 把基线读作 `49f0681f8`，则只剩 `targets.ts` 一项超出。 |
| 1.7 交回列每个目标的工具与参数；E-sse 的 S4、S5 由哪些契约用例覆盖 | 达到 | 交回 4.3 的表；覆盖用例的标题我在 head 上逐条核到：`mcp/tests/continue.spec.ts:94`、`mcp/tests/tasks.spec.ts:325、342、370`，以及 `mcp-host-local/tests/conformance.spec.ts:69` 的 `mcpTransportConformance()`。 |
| 写范围：只改列出的文件 | 未达到 | 同 1.6：`targets.ts` 为未列出的新文件。`documentation.json` 未动，`check:docs` 通过，符合「仅当要求才改」。`SPEC.md` 只改「组合与验证」表一行与「未覆盖」两条，符合；`tests/fixtures/README.md` 只改「当前缺口」一句，符合；`tests/README.md`、`tests/index.md`、`tests/e2e/README.md`、`index.md` 已写。 |
| 排除的调用方：不改 `src/`、已有用例与夹具、`package.json`、`pyproject.toml`、锁文件、`mcp/`、`mcp-contract/` | 未达到 | `git diff` 显示 `src/`、已有 `*.spec.ts`、已有夹具代码、`pyproject.toml`、`packages/mcp/mcp/`、`mcp-contract/` 都没有改动（达到）。`package.json` 与 `pnpm-lock.yaml` 被改（派发者 `49f0681f8`），与「排除」字面冲突，见冲突项 1。 |
| 性质及证据义务：每步的断言要能被变异打红，做不到的步写「未验证」与原因；写明差分变异不适用 | 未达到 | 差分变异不适用已在交回 4.7 写明（达到）。变异只覆盖 S3、S6、S7；S1、S2、S4、S5 没有变异，交回「没覆盖到的项」也没有把它们写成「未验证」与原因。缺：S1、S2、S4、S5 的变异读数，或逐步的「未验证」声明。 |
| 2.C4 旅程协商→刷新→调用→取消，两种真实传输，本地服务端五个目标；完成与动作错误 | 达到 | `e2e.log`：五个目标的 S1–S3、S6、S7 读数；`complete` 与 `toolError` 两种结局都有；协商的修订在 S1 同时断言。 |
| 2.C4 多轮输入与任务在服务端支持的形状上跑；形状不一致的由脚本化契约用例覆盖并写进报告 | 达到 | E-stdio、E-http 上 S4、S5 跑通，S5 断言途经 `input_required`（交回 4.3）；E-sse 的不适用与覆盖用例见 1.7。 |
| 2.C4 六个兼容目标与 SDK 2.4.0 客户端结论一致；远程带时刻；GitHub 排除 | 达到 | 同 1.4。 |
| 2.C4 另两条（并发在探索器与 TLA+ 守护内；Skill 目录服务） | 不判 | 不属于本闭包，规格与交回都未承诺。 |
| 2.W3-D 交付边界：测试或脚本成员，不改产品源码；缺陷另开闭包 | 达到 | 无 `src/` 改动；交回没有报告产品缺陷。 |
| 2.W3-D 本地旅程（server-everything 三种模式、filesystem、fetch）；兼容矩阵；读数贴卡 | 未达到 | 前两项达到（`e2e.log`、`matrix.out`）。「读数贴卡」：所给材料里没有卡 #1119 上贴读数的评论。缺：卡评论（命令、退出码、输出尾部、日志哈希）。这可能是派发者后续动作，不是写者的欠账。 |
| 2.W3-D 验收：C4 每一条有命令、退出码、输出尾部、日志哈希 | 未达到 | 交回 4.1–4.6 有命令与哈希；退出码对慢层与 e2e 在日志里（`exit 0`），对 `matrix.out` 不在日志里（1.4 注），对 `lint:deps` 为 1（1.5）。缺：`matrix.out` 的退出码记录；其余同 1.5。 |
| 3.MC3-12 两种传输逐步结局种类一致，由 `e2e/journey.spec.ts` 守 | 达到 | `journey.spec.ts` 末尾 `describe('the two modern transports (MC3-12)')`：两个目标的 `步:种类` 数组用一个 `toEqual` 比较，并断言步序列为 S1–S7；`e2e.log` ✓；m1、m2、m3 三处变异下该用例也变红。 |
| 3.已定 39 进程来源：测试用 `node:child_process` 起服务端，包成 `ProcessHandle`，`stop()` 以进程组结束并按实际确认答范围 | 达到 | `assembly.ts` 的 `ProcessLanding` 用 `fixtures/process.ts` 的 `spawnHandle`（Node）与 `command.ts`（Python，经 `track` 登记）；S7 断言实际范围（stdio 为 `root-only`，HTTP 为 `no-process`），`afterEach` 核对无遗留（`journey.spec.ts:295`）。 |
| 3.已定 40 不实现项（OAuth 流程、`elicitation.url`、`sampling`、`roots`、`list_changed`、SSE 旧传输） | 达到 | 旅程没有用到前五项；旧 SSE 的取向见冲突项 3。 |
| 3.已定 41 旅程表：`refresh` 整份发布 → `invoke` 完成 → `isError` → 输入 → 任务 → 取消得 `unknown` → `release`；两种传输读数一致 | 达到 | 同 1.2 与 MC3-12。规格的适用列把 E-sse 记为 S1、S2、S3、S6、S7，F、P 记为 S1–S3、S7，这是闭包对 41「两种传输各跑同一张表」的细化，见冲突项 4。 |

## 冲突项

下列不是达到或未达到的结论，交卡的拥有者处理。

1. 追加 1 把基线改为 `49f0681f8`，并在闭包分支加了 `package.json`（devDependencies 加 `@omne-harness/legal-identity`）与 `pnpm-lock.yaml`（+3 行）。与下列原句冲突：
   - 已定事项 1：「`mcp-host-local` 已经在 devDependencies 里有 `@omne-harness/mcp`，不改 `package.json`。」
   - 排除的调用方：「`packages/mcp/mcp-host-local/package.json`、仓库根 `pyproject.toml` 与锁文件：」。
   - 停止条件：「需要改 `package.json`、锁文件或写范围外的文件。」（写者按此停下，符合；改动由派发者做，没有走规格改写。）
   - 验收 6：「`git diff --name-only 3289bee2f..HEAD` 只含写范围内的仓库文件」，追加 1 没有同步改成 `49f0681f8..HEAD`，身份与位置里的「基线：3289bee2f…」也没有改。
   - 工作树与协调：「没有别的写者。」，已知会受影响的现有用例：「无。本闭包只加文件」（派发者提交 `Agent-Role: main` 进了闭包分支）。
2. 追加 1 允许「Python 对端在 `tests/e2e/` 另写一个…小夹具」，写者另拆了 `targets.ts`（规格把目标表放在 `journey.spec.ts` 里）。与写范围原句冲突：「需要时可再拆一个同目录的夹具文件，名字在交回里写明」（只许一个，且 `command.ts` 已占用）。交回第 5 节自认并请派发者定是否并回。
3. 规格已定事项 40 原文仍写「不实现：…SSE 旧传输（HTTP+SSE 2024-11-05）」（`waves/w3/mcp/spec.md` 第 106 行），而同文件第 28 行写「已定事项 40 的『SSE 旧传输不做』撤回」。闭包的 E-sse 目标跑旧 HTTP+SSE（2025-11-25）。另外闭包引已定事项 40 作为「表单输入本实现不做」的依据，但 40 列的是 `elicitation.url`，没有列表单输入（`elicitation.form`）。
4. 已定事项 41 原句：「两种传输各跑同一张旅程表…两种传输读数一致（结局种类逐步相同）」。闭包的目标表对 E-sse、F、P 登记了不同的适用步。C4 的「两种真实传输」与闭包的五个目标、三种传输口径不同。MC3-12 只比较 E-stdio 与 E-http，符合 41。
5. 追加 1 称 `lint:deps` 的 8 处 `no-unresolvable`「与本改动无关」，但验收 5 的原句仍是「`lint:deps`…退出 0」，没有对应的豁免或改写。
