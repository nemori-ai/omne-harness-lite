# 交回：w3-mcp-e2e

## 1. 结论

做完。五个目标的七步旅程在 `createMcp` 加本地传输上通过，MC3-12 的断言通过，P（Python 的 `mcp-server-fetch`）实际执行；对照矩阵八行全部一致；三处变异都让指定的步变红；门禁通过，`lint:deps` 只剩与本闭包无关的 8 处。没有改任何 `src/`。

第一次交回停在停止条件第 4 条（`mcp-host-local` 没有 `@omne-harness/legal-identity`）。负责人在闭包分支提交了 `49f0681f8` 解除，本次从施工计划第 2 步接着做。基线按负责人通知改为 `49f0681f8`。

日志都在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-e2e-logs/`（下称「日志目录」），哈希取 sha256 前 16 位。

## 2. 提交

闭包分支 `PanQiWei/skill-mcp-w3-mcp-e2e`，作者与提交者都读回为 `PanQiWei <594557445@qq.com>`。

- `49f0681f8`（负责人）：`mcp-host-local` 的 devDependencies 加 `legal-identity`，锁文件更新。
- `b8ae4aa8d`：端到端旅程（`tests/e2e/` 的四个代码文件）。
- `d5eb8d529`：旅程失败时先 `closeAll`，让失败只报一次。三处变异在这个提交上跑。
- `71b4b02f3`：`tests/e2e/` 的 README、index，`tests/` 与 `fixtures/` 的文档行，SPEC 的「组合与验证」一节。当前 HEAD。

## 3. 改了哪些文件

写范围内，`git diff --name-only 49f0681f8..HEAD` 共 10 个文件，没有 `src/`、`package.json`、锁文件：

- `packages/mcp/mcp-host-local/tests/e2e/journey.spec.ts`（新）：七步旅程表 `JOURNEY`（每步有 `applies` 列）、每个目标一条用例、MC3-12 的比较用例。
- `.../tests/e2e/assembly.ts`（新）：测试用租户与 `Access`、`ProcessLanding`（Node 命令走 `fixtures/process.ts` 的 `spawnHandle`，其他命令走 `command.ts`）、计数的 `OutputValidator`、五个端口与 `createMcp` 的装配。
- `.../tests/e2e/targets.ts`（新）：五个目标的启动方式、预期修订、每步的工具与参数。
- `.../tests/e2e/command.ts`（新）：按命令起非 Node 进程的 `ProcessHandle`，用 `fixtures/scripted/children.ts` 的 `track` 登记。`spawnHandle` 只起 Node 进程，P 需要它。写范围允许另拆夹具文件。
- `.../tests/e2e/README.md`、`index.md`（新）。
- `.../tests/README.md`、`index.md`：列出新目录。
- `.../tests/fixtures/README.md`：「当前缺口」一句改写：S5 在 `server-everything` 上跑通，缺口不存在了。
- `.../SPEC.md`：「组合与验证」表加 `tests/e2e/` 一行（C4、MC3-12）；「未覆盖」里远程对端一条与调用方真实组合一条按实际改写。
- `documentation.json` 没有改：`check:docs` 通过，不要求登记。

仓库之外：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/mcp-compat-matrix.mjs`（新）与同目录 `README.md` 新一节「2026-11-06 对照矩阵」。

## 4. 验收逐项

### 4.1 慢层（验收 1）

- 命令：`VITEST_MAX_WORKERS=6 pnpm --filter @omne-harness/mcp-host-local test:slow`，在 HEAD `71b4b02f3` 上，2026-11-06 10:00 UTC 完成，退出 0。
- 尾部：`Test Files 5 passed (5)`、`Tests 246 passed | 8 skipped (254)`。8 个跳过是快层标签的用例（慢层 mode 滤掉）。契约套件两遍：`passed 98, not-applicable 1, failed 0` 与 `passed 97, not-applicable 2, failed 0`。日志 `slow.log`，哈希 `eeb1c3ce652a187e`。
- `tests/e2e/` 的 6 条用例都执行了，没有跳过，包括 P。单独运行的详细日志 `e2e.log`（哈希 `23dcc6c23efb7868`，退出 0）：5 条目标旅程加 1 条 MC3-12，`Tests 6 passed (6)`。
- P 实际执行：`.venv/bin/mcp-server-fetch` 在本树存在（`uv sync --locked --group mcp-fixtures`，2026-11-06 09:38:42 UTC）。P 用例 966 ms 通过，读数见 4.2。

### 4.2 旅程读数表（验收 2）

格式：实际结局种类。「不适用」写理由。

| 目标 | 修订 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-stdio | 2026-07-28 | published | complete | toolError | inputRequired>complete | task>completed>complete | signalled>unknown:abandoned | released（`root-only`，登记表无遗留） |
| E-http | 2026-07-28 | published | complete | toolError | inputRequired>complete | task>completed>complete | signalled>unknown:abandoned | released（`no-process`） |
| E-sse | 2025-11-25 | published | complete | toolError | 不适用 | 不适用 | signalled>unknown:abandoned | released（`no-process`） |
| F | 2026-07-28 | published | complete | toolError | 不适用 | 不适用 | 不适用 | released（`root-only`，登记表无遗留） |
| P | 2026-07-28 | published | complete | toolError | 不适用 | 不适用 | 不适用 | released（`root-only`，登记表无遗留） |

不适用的理由：E-sse 的 S4、S5：2025-11-25 没有任务扩展，表单输入是服务端发起的请求，本实现不做（波段规格已定事项 40）。F、P 的 S4 至 S6：没有要求输入、任务或长时的工具，不为它们造服务端。S1 同时断言协商的修订等于表里的修订，以及清单含已知工具名。

MC3-12：用例「E-stdio and E-http answer the same kind of outcome at every step S1 to S7」把两个目标的 `S1:published … S7:released` 序列比较相等，通过。S7 的种类是 `released`，停止范围另在步内断言：stdio 是 `root-only`，HTTP 是 `no-process`，两者本来就不同。

### 4.3 每个目标的工具与参数（验收 7）

| 目标 | S1 已知工具 | S2 | S3 | S4 | S5 | S6 |
| --- | --- | --- | --- | --- | --- | --- |
| server-everything（三种传输） | `echo` | `echo` `{"message":"hi"}`，答复含 `Echo: hi` | `echo` `{}`：服务端以输入校验错误和 `isError: true` 答 | `trigger-elicitation-request` `{}`，再 `continueWithInput`，`inputResponses` 为 `{"form":{"action":"accept","content":{"name":"omne"}}}`，答复含 `- Name: omne` | `simulate-research-query` `{"topic":"python","ambiguous":true}`；任务在第三阶段进入 `input_required`，`provideTaskInput` 给 `{"clarification":{"action":"accept","content":{"interpretation":"programming"}}}`，最终报告含 `Research Report`。用例断言途中确实经过 `input_required` | `trigger-long-running-operation` `{"duration":60,"steps":1}`，请求发出 300 ms 后 `cancel` |
| server-filesystem（根目录是测试建的临时目录，`realpath` 后传入） | `read_text_file` | `read_text_file` `{"path":"<根>/a.txt"}`，内容 `hello` | `read_text_file` `{"path":"<根>/missing.txt"}`（ENOENT，`isError`） | — | — | — |
| mcp-server-fetch（启动参数 `--allow-private-ips --no-readability-js`） | `fetch` | `fetch` `{"url":"http://127.0.0.1:<端口>/page"}`，测试起的 `node:http` 服务端，同时答 `/robots.txt` 允许全部，答复含 `# Hi` | `fetch` `{"url":"http://127.0.0.1:<无监听端口>/"}`（连接失败，`isError`） | — | — | — |

两条事实来自探查，不在规格里：`mcp-server-fetch` 默认拒绝取回环地址，要加 `--allow-private-ips`；它默认在 PATH 上有 Node 时起 Readability.js，加 `--no-readability-js` 让它只用纯 Python 抽取。

E-sse 的 S4、S5 由下列用例覆盖。它们跑在脚本化传输上，与修订无关，不是 2025-11-25 对端上的读数：

- `packages/mcp/mcp/tests/continue.spec.ts`：「completes on the same generation, sending the request state and the input responses」。
- `packages/mcp/mcp/tests/tasks.spec.ts`：「queryTask reports the status with the input requests and hints; a -32602 is expired」、「taskResult: not finished, cancelled, expired, and a finished result classified on the task's output schema」、「provideTaskInput hands the responses to the peer and answers accepted; cancelTask answers requested」。
- 传输层的任务与输入请求形状：`packages/mcp/mcp-host-local/tests/conformance.spec.ts` 里契约 `mcpTransportConformance()` 的 A 层用例。

### 4.4 变异（验收 3）

在 `/tmp/w3-e2e-mut/` 的副本上做（`rsync` 复制工作树，根 `node_modules` 软链），每次先重建被改成员再跑 `tests/e2e/journey.spec.ts`，运行时的 head 都是 `d5eb8d529`（`tests/e2e/` 的代码与最终 HEAD 相同，之后只有文档提交）。每处用 `cp` 从工作树按字节还原，`cmp` 核对，并重建。副本对照未变异的工作树：基线 6 条全绿。

| 变异 | 变红的用例与步 | head | 日志哈希 |
| --- | --- | --- | --- |
| 1. `packages/mcp/mcp-contract/src/classify.ts` 的 `completed()`：`isError` 为 true 的结果也答 `complete`（条件末尾加 `&& false`） | 五条目标用例都在 S3 变红：`expected 'complete' to be 'toolError'`（E-stdio、E-http、E-sse、F、P）；MC3-12 用例随之变红 | d5eb8d529 | `m1.log` `f0a3c871cf749693` |
| 2. `packages/mcp/mcp/src/internal/in-flight.ts` 的 `cancel()`：`sent` 分支答 `signalled` 但不再 `abort()` | E-stdio、E-sse 在 S6 变红：`expected 'signalled>complete' to be 'signalled>unknown:abandoned'`（各等 60 s 的长时工具答完）。E-http 不变红，见下 | d5eb8d529 | `m2.log` `031542056e74b9f1` |
| 2b. 同上，再去掉 `reserved` 分支的 `abort()` | E-http 在 S6 变红，同样的断言，59.7 s 后 `complete` | d5eb8d529（这一次的副本里，`journey.spec.ts` 的 S6 多一行诊断 `console.info`，断言不变；跑完后按字节换回） | `m2b.log` `dd3b3e8cf89487ff` |
| 3. `packages/mcp/mcp/src/internal/teardown.ts` 的 `stopOne()`：不调 `handle.stop()`，直接当作 `root-only` | E-stdio、F、P 在 S7 变红：`S7: processes left alive after release: expected [ <pid> ] to deeply equal []`；E-http、E-sse 没有进程，不受影响 | d5eb8d529 | `m3.log` `5250b8a3fcac19dd` |

变异 2 的 E-http 为什么不红：`cancel` 在 `reserved` 与 `sent` 两个分支各 `abort()` 一次。E-http 的 S6 读数在 `cancel` 返回 1 ms 之后 `invoke` 就答 `unknown:abandoned`；去掉 `reserved` 分支的 `abort()` 后它才变红（变异 2b）。所以在 Streamable HTTP 上，请求发出 300 ms 后调用在表里仍是 `reserved`。我没有读 `calls.ts` 去确认 `reserved` 何时转为 `sent`，这一点只由变异读数支持。它不影响 S6 的期望：两个分支的 `cancel` 都答 `signalled`，`invoke` 都答 `unknown`（`abandoned`），请求都已发出。不过这说明 HTTP 上「请求发出之后」的 `cancel` 走的是 `reserved` 分支，派发者可以核对这是否符合 `in-flight.ts` 的阶段定义。

变异 3 只做了「不停进程」。规格允许二选一，「报告 `no-process`」没有另做；S7 对 `process` 取值有 `toBe` 断言，我没有变异验证它。

### 4.5 对照矩阵（验收 4）

- 命令：`node .../compat/mcp-compat-matrix.mjs`，退出 0，2026-11-06 09:57 UTC。输出 `matrix.out`，哈希 `121caf8172b52a5c`；已追加到 `compat/README.md` 的新一节。
- SDK：`@modelcontextprotocol/client` 2.4.0（读 `package.json`）。实现的提交号：父分支 `3289bee2f`。Node v26.12.0。
- 排除：GitHub MCP（要 OAuth，不在范围内）。

| 行 | 目标 | 传输 | 修订（SDK / 我们） | 工具数（SDK / 我们），名字 | 调用 | 结论（SDK / 我们） | 一致 | `date -u` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | server-everything 2.1.0 | stdio | 2026-07-28 / 2026-07-28 | 22 / 22，相同 | `echo` `{"message":"hi"}` | complete / complete | 是 | |
| 2 | server-filesystem 2.1.0 | stdio | 2026-07-28 / 2026-07-28 | 14 / 14，相同 | `read_text_file` 临时文件 | complete / complete | 是 | |
| 3 | mcp-server-fetch 2026.10.28 | stdio | 2026-07-28 / 2026-07-28 | 1 / 1，相同 | `fetch` 本机页面 | complete / complete | 是 | |
| 4 | DeepWiki | Streamable HTTP | 2026-07-28 / 2026-07-28 | 3 / 3，相同 | `read_wiki_structure` `{"repoName":"modelcontextprotocol/typescript-sdk"}` | complete / complete | 是 | Fri 06 Nov 2026 09:57:04 AM UTC |
| 5 | Context7 | Streamable HTTP | 2026-07-28 / 2026-07-28 | 2 / 2，相同 | `resolve-library-id` `{"libraryName":"React","query":"hooks"}` | complete / complete | 是 | Fri 06 Nov 2026 09:57:05 AM UTC |
| 6 | Microsoft Learn | Streamable HTTP | 2025-06-18 / 2025-06-18 | 3 / 3，相同 | `microsoft_docs_search` `{"query":"azure functions timer trigger"}` | complete / complete | 是 | Fri 06 Nov 2026 09:57:07 AM UTC |
| 7 | server-everything 2.1.0 `streamableHttp`（本机端口） | Streamable HTTP | 2026-07-28 / 2026-07-28 | 22 / 22，相同 | `echo` | complete / complete | 是 | |
| 8 | server-everything 2.1.0 `sse`（本机端口） | 旧 HTTP+SSE | 2025-11-25 / 2025-11-25 | 16 / 16，相同 | `echo` | complete / complete | 是 | |

八行都一致，没有不一致项，三个远程目标都可达。脚本跑完没有遗留子进程。这是一次运行的读数：远程服务端的行为会变。

### 4.6 门禁（验收 5）

在 HEAD `71b4b02f3` 上跑，时间 2026-11-06 09:58 至 09:59 UTC。日志在日志目录。

| 命令 | 退出码 | 输出尾部 | 日志哈希 |
| --- | --- | --- | --- |
| `pnpm run typecheck`（在 `mcp-host-local`） | 0 | `tsc -p tsconfig.test.json` 无输出 | `typecheck.log` `3b698e221b33c77f` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6200 个提交的署名，无违反。` | `lint-rules.log` `736f982c6f9d0439` |
| `pnpm run lint:oxlint` | 0 | 无告警 | `lint-oxlint.log` `f75be85110d5a0a5` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `format-check.log` `1bd179af5168bf6d` |
| `pnpm run check:docs` | 0 | `PASS: 2753 Markdown files; local links and skill mirrors.` | `check-docs.log` `56c3b5fd77c1615e` |
| `pnpm run lint:deps` | 1 | `✗ 8 处依赖违规、方向命中或环；1 个组环按具名例外放行` | `lint-deps.log` `6b76bc0d1282e59f` |

`lint:deps` 的 8 处都是 `no-unresolvable`，位置是 `agent/agent/acceptance/fixtures/executor.mjs`、`assets/settings-local/tests/after.mjs` 与 `guard.mjs`、`identity/identity-sql/tests/` 的三个用例文件（共 5 处）。与 `mcp` 相关的违规为 0 处：`mcp-host-local`、`mcp`、`mcp-contract` 都不在其中，新增的 `legal-identity` 依赖也没有触发方向命中。这与负责人通知一致，我没有去构建或修那些成员。

### 4.7 范围核对（验收 6）

`git diff --name-only 49f0681f8..HEAD` 只含第 3 节列出的 10 个文件。`git diff --name-only 3289bee2f..HEAD` 另含 `packages/mcp/mcp-host-local/package.json` 与 `pnpm-lock.yaml`，是负责人的 `49f0681f8`。没有 `src/` 文件。工作树干净。

差分变异：本闭包不改 `src/`，`pnpm run mutation` 没有改动行可变异，没有运行。以 4.4 的三处手工变异代替。

## 5. 没覆盖到的项与自己的决定

没覆盖：

- E-sse 的 S4、S5 在 2025-11-25 的真实对端上没有读数：该修订上没有任务扩展，表单输入本实现不做。覆盖用例见 4.3，它们是脚本化传输上的用例。
- F、P 没有 S4 至 S6，规格已定。
- P 缺失时的跳过路径（`describe.skipIf` 与跳过的名字）没有被触发过：本树里 `mcp-server-fetch` 一直存在。
- 变异 3 的「报告 `no-process`」一支没有做。
- 旅程用例没有 OAuth 目标，也没有多租户或并发交错：这些归调用方与宿主口各自的用例。
- S6 的「请求发出之后」用 300 ms 等待，不是对线上事件的同步。三个目标和三次运行都稳定（每次 `signalled`，`unknown:abandoned`），但这是时间上的假设，不是确定的因果顺序。

能自己定，依据是……：

- 每个目标一条用例走完 S1 至 S7，不是一步一条：S1 的目录、S4 的 `issuedAt` 与 S5 的任务编号都要在同一条连接上沿用，`afterEach` 核对遗留进程也只有这样才合乎规格「S7 之后登记表里没有遗留」。依据：规格的旅程表是一条旅程，不是七个独立场景。每步的断言消息带步号与目标，失败时能定位。
- 在 `finally` 里先 `connections.closeAll()` 再关目标：一步失败时连接还开着，不先关会让遗留进程检查再报第二个失败，把变异读数混淆。`d5eb8d529` 单独提交。
- 同目录新增了两个代码文件，规格只写「可再拆一个同目录的夹具文件」：`command.ts`（起 Python 进程，理由如下）和 `targets.ts`（目标表，规格把它放在 `journey.spec.ts` 里，我拆出来是因为数据表与旅程表各占一屏）。`targets.ts` 并回 `journey.spec.ts` 是机械搬移，负责人认为越出写范围时可以要求合并。
- `command.ts` 另拆一个夹具文件起 Python 进程：`fixtures/process.ts` 的 `spawnHandle` 只起 `process.execPath`，规格不许改它。写范围允许拆夹具。
- `assembly.ts` 里的租户与 `Access` 取自 `@omne-harness/legal-identity` 的 `access`、`tenant` 与两个 codec，与 `mcp/tests/doubles/identities.ts` 同一方法，但没有导入那份文件。

只有负责人能定：无。

## 6. 提醒

对照脚本在 `3289bee2f` 上读 `dist`。父分支的 `dist` 在合入 `49f0681f8` 与本闭包的测试之后不变（本闭包没有改产品源码），重跑结果不受影响。
