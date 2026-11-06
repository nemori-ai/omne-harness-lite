# 闭包规格 w3-mcp-e2e

## 身份与位置
- 闭包：w3-mcp-e2e
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e
- 分支：PanQiWei/skill-mcp-w3-mcp-e2e
- 基线：3289bee2ffa4b4711ad473c3d6112573317717f2
- 清晰度：界

基线是父分支 `PanQiWei/skill-mcp` 的 `3289bee2f`：调用口与宿主口都已合入，已推送。

W3 的端到端与兼容矩阵（W3-D）。`createMcp`（`@omne-harness/mcp`）加本地传输工厂 `createLocalTransportFactory`（`@omne-harness/mcp-host-local`），对本机真实 MCP 服务端走旅程；再在八个目标上与官方 SDK 2.4.0 客户端对照。判据是卡 #1119 的 C4（改写版，见方法入口里的 W4 计划第 3 节）与波段规格 MC3-12。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。理由：只写测试与对照脚本，不改产品源码；规格写明了旅程、目标与判据，用策略的经济档起步。同一互通失败出现两次、或 10 分钟没有进展时，派发者升档。

## 目标边界
目标：一组慢层用例证明 `createMcp` 与本地传输对真实服务端端到端走通，两种现代传输逐步结局种类相同；一份对照读数证明八个目标上「发现 → 列工具 → 调一个只读工具」的结论与 SDK 客户端相同。只做下面列的事，不改产品源码，不加别的改进。

### 已定的事（不重新裁定）
1. **位置。** 用例放 `packages/mcp/mcp-host-local/tests/e2e/`，文件开头注释写 `@module-tag slow`，归慢层（`vitest.tiers.mts` 第 9 行的规则）。不用 `acceptance/`：那里归独立验收角色。`mcp-host-local` 已经在 devDependencies 里有 `@omne-harness/mcp`，不改 `package.json`。
2. **装配。** 五个需求端口里，`adoption`、`eligibility`、`credentials`、`store` 用契约 `@omne-harness/mcp-contract/testing` 的内存替身（`createMemoryAdoptionView`、`createMemoryUseEligibility`、`createMemoryCredentialUse`、`createMemoryCatalogStore`）。`landing` 写一个测试内的 `ProcessLanding`，用 `tests/fixtures/process.ts` 的 `spawnHandle` 起真实进程，用 `tests/fixtures/scripted/children.ts` 的 `track` 登记（波段规格已定事项 39）。`transports` 是 `createLocalTransportFactory`。`checkOutput` 是必填端口：在 `tests/e2e/` 写一个测试内的 `OutputValidator`，对任何值答 `conforms` 并计数；不从 `@omne-harness/mcp` 的测试目录导入（那是别的成员的测试代码）。端口与配置的形状以 `packages/mcp/mcp-contract/src/services.ts` 的 `McpPorts`、`McpConfig` 为准。
3. **旅程是一张表（数据），每个目标跑一遍。** 表的每一行是一步，有「适用」列。步骤与期望的结局种类：

   | 步 | 动作 | 期望 |
   | --- | --- | --- |
   | S1 | `discovery.refresh` | `published`；清单含该目标的已知工具名 |
   | S2 | `invoker.invoke` 一个只读工具 | `complete` |
   | S3 | `invoker.invoke` 一个服务端以 `isError: true` 答的调用 | `toolError` |
   | S4 | `invoke` 一个要求输入的工具，再 `continueWithInput` 给出答复 | 先 `inputRequired`，后 `complete` |
   | S5 | `invoke` 一个以任务答的工具；`queryTask` 到终态 `completed`（途中若是 `input_required`，用 `provideTaskInput`）；再 `taskResult` | 先 `task`，终态 `completed`，结果 `complete` |
   | S6 | `invoke` 一个长时工具；请求发出之后 `cancel(correlationKey)` | `cancel` 答 `signalled`；`invoke` 答 `unknown`（`abandoned`） |
   | S7 | `connections.release` | `released`；stdio 的 `process` 是确认的停止范围，HTTP 是 `no-process`；之后子进程登记表里没有遗留 |

   目标与适用：

   | 目标 | 传输与修订 | 适用的步 |
   | --- | --- | --- |
   | E-stdio：server-everything 2.1.0 `stdio` | stdio，2026-07-28 | S1–S7 |
   | E-http：server-everything 2.1.0 `streamableHttp` | Streamable HTTP，2026-07-28 | S1–S7 |
   | E-sse：server-everything 2.1.0 `sse` | 旧 HTTP+SSE，2025-11-25 | S1、S2、S3、S6、S7。S4、S5 按修订不适用：2025-11-25 上没有任务扩展，表单输入是服务端发起的请求，本实现不做（波段规格已定事项 40）。这两步由脚本化传输上的契约用例覆盖，交回里写出用例文件与标题 |
   | F：server-filesystem 2.1.0 | stdio，2026-07-28 | S1、S2、S3、S7 |
   | P：mcp-server-fetch 2026.10.28（Python） | stdio，2026-07-28 | S1、S2、S3、S7 |

   每个目标用哪个工具、给什么参数，由写者在该服务端的源码或 `tools/list` 的结果里找，写进表里，并在交回里列出。已知的线索：server-everything 有 `echo`、`trigger-elicitation-request`、`simulate-research-query`、`trigger-long-running-operation`（`dist/tools/index.js` 的 `registerModernTools`）；任务扩展在 `dist/server/tasks.js`；我们的客户端在现代修订上声明任务扩展与表单输入（契约 `src/envelope.ts`）。server-filesystem 的根目录用测试建的临时目录；S3 读一个不存在的文件。P 的 S2 对一个测试起的 `node:http` 本机服务端取页（同时答 `/robots.txt` 允许全部）；S3 取一个没有监听的本机端口。不为 F、P 做 S6：没有长时工具，不为它造延迟服务端。
4. **MC3-12 是断言。** E-stdio 与 E-http 的逐步结局种类（S1–S7 各一个种类）收成两个数组，用一个断言比较相等。不靠看日志比对。
5. **P 的环境。** mcp-server-fetch 在仓库根 `pyproject.toml` 的非默认组 `mcp-fixtures`，CI 的 `uv sync --locked` 不装它。P 的用例用 `describe.skipIf(!存在)`，跳过的名字写明「mcp-server-fetch not installed: run uv sync --locked --group mcp-fixtures」。可执行文件位置从工作树根的 `.venv/bin/mcp-server-fetch` 解析，不写死别的工作树。本闭包的交回必须给出 P 实际执行（不是跳过）的那次运行。
6. **对照矩阵。** 写一个脚本 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/mcp-compat-matrix.mjs`。它在同一次运行里，对下面八行各跑两个客户端：官方 SDK 客户端（`@modelcontextprotocol/client`，记下实际加载的版本，读它的 `package.json`），与我们的 `createMcp` 加本地传输。每个客户端做三步：发现、列工具、调一个只读工具。

   | 行 | 目标 | 传输 |
   | --- | --- | --- |
   | 1 | server-everything 2.1.0 | stdio |
   | 2 | server-filesystem 2.1.0 | stdio |
   | 3 | mcp-server-fetch 2026.10.28 | stdio |
   | 4 | DeepWiki `https://mcp.deepwiki.com/mcp` | Streamable HTTP |
   | 5 | Context7 `https://mcp.context7.com/mcp` | Streamable HTTP |
   | 6 | Microsoft Learn `https://learn.microsoft.com/api/mcp` | Streamable HTTP |
   | 7 | server-everything 2.1.0 `streamableHttp`（本机端口） | Streamable HTTP |
   | 8 | server-everything 2.1.0 `sse`（本机端口） | 旧 HTTP+SSE |

   GitHub MCP 要 OAuth，不在范围内，在输出里列为「排除」。每行输出：协商的修订（两边）、工具数与排序后的工具名是否相同、调用的工具与参数、调用结论（SDK 的 `isError` 为 false 对应我们的 `complete`，为 true 对应 `toolError`）、两边是否一致。远程三行各带运行时的 `date -u`。路径从脚本自己的位置解析出仓库根（它在 `.worktrees/skill-mcp` 的 `tmp/` 下），不照抄旧基线脚本写死的路径。脚本从已构建的 `dist` 导入产品包。结果追加到同目录 `README.md` 的 MCP 段，新起一节，写日期、实现的提交号与表。
7. **产品缺陷不在本闭包修。** 某一步失败而原因在 `src/`（任何成员），停下，交回失败的步、目标、命令与输出；修复另开闭包（W4 计划 W3-D 一节）。真实服务端答的种类与第 3 条的期望不同、而原因在服务端的形状时，不改断言去迁就，交回为「形状不一致」，写明服务端的实际答复。

### 写范围
- `packages/mcp/mcp-host-local/tests/e2e/journey.spec.ts`（新建） — 第 1、3、4、5 条的旅程表与断言
- `packages/mcp/mcp-host-local/tests/e2e/assembly.ts`（新建） — 第 2 条：测试内的 `ProcessLanding` 与 `OutputValidator`、五个端口与 `createMcp` 的装配；需要时可再拆一个同目录的夹具文件，名字在交回里写明
- `packages/mcp/mcp-host-local/tests/e2e/README.md`（新建） — 新目录的说明
- `packages/mcp/mcp-host-local/tests/e2e/index.md`（新建） — 新目录的索引
- `packages/mcp/mcp-host-local/tests/README.md` — 列出新目录
- `packages/mcp/mcp-host-local/tests/index.md` — 列出新目录
- `packages/mcp/mcp-host-local/tests/fixtures/README.md` — 「当前缺口：B 层没有带任务的对端」一句：S5 在 server-everything 上跑通之后改写
- `packages/mcp/mcp-host-local/documentation.json` — 仅当 `lint:rules` 或 `check:docs` 要求为新目录登记
- `packages/mcp/mcp-host-local/SPEC.md` — 只改「组合与验证」一节：表里加 `tests/e2e/` 一行（C4、MC3-12）；「未覆盖」里「真实远程对端……归 `w3-mcp-e2e`」与「调用方与本包的真实组合没有在本包验证」两条按实际改写

### 仓库之外的任务产物
第 6 条的对照脚本与读数写在父分支工作树的任务 tmp，不进仓库：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/mcp-compat-matrix.mjs`（新）与同目录 `README.md` 的新一节。

### 排除的调用方
- 任何成员的 `src/`：本闭包不改产品行为。
- `packages/mcp/mcp-host-local/tests/` 下已有的用例文件（`stdio.spec.ts`、`http.spec.ts` 等）与 `tests/fixtures/` 下已有的代码文件：只导入，不改。
- `packages/mcp/mcp-host-local/package.json`、仓库根 `pyproject.toml` 与锁文件。
- `packages/mcp/mcp/`、`packages/mcp/mcp-contract/` 的全部文件。
- 简报检查报的 `form`（契约 `elicitation.form` 的字段名）、`SLOW_TEST_TIMEOUT_MS`（`vitest.tiers.mts`）与 `everythingHttp`（`tests/fixtures/sdk/everything.ts`）的调用方：规格只引用它们，本闭包不改它们的定义，所以它们的调用方都不受影响。需要改其中任何一个时停下（停止条件第 4 条）。

## 验收清单
1. `VITEST_MAX_WORKERS=6 pnpm --filter @omne-harness/mcp-host-local test:slow` 退出 0；输出里 `tests/e2e/` 的用例都执行了，P 的用例没有跳过。交回写用例数、输出尾部与日志哈希。
2. 旅程读数表：每个目标、每一步的实际结局种类（适用的步）或「不适用」与理由（不适用的步）。MC3-12 的断言在 E-stdio 与 E-http 上通过。
3. 变红验证：在工作树之外的副本上做三处手工变异，每处让指定的步变红，然后还原：
   - 结局分类：把 `isError: true` 的结果分成 `complete`（契约 `classifyOutcome` 一带） → S3 变红；
   - 取消：让发出后的取消不结束等待（调用口 `cancel` 或传输 `cancelRequest` 一带，写者选点） → S6 变红；
   - 释放：让 `release` 不停进程或报告 `no-process`（写者选点） → S7 变红。
   每处写「变异 → 变红的用例与步 → 运行时的 head → 日志哈希」。
4. 对照矩阵：脚本退出 0；八行的读数表；SDK 实际版本；每行一致或不一致，不一致的写两边的实际值。远程行带 `date -u`。
5. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs` 退出 0；输出尾部与日志哈希。
6. `git diff --name-only 3289bee2f..HEAD` 只含写范围内的仓库文件；没有 `src/` 文件。
7. 交回列出：每个目标用的工具与参数；E-sse 的 S4、S5 由哪些契约用例覆盖（文件与标题）。

## 实施规格
- 等待都有界：每个用例的时限低于慢层的 120 s（`vitest.tiers.mts` 的 `SLOW_TEST_TIMEOUT_MS`）；轮询 `queryTask` 用有上限的次数与间隔。
- `afterEach` 核对子进程登记表没有遗留（照 `tests/fixtures/README.md` 的维护规则）。HTTP 模式的服务端用 `tests/fixtures/sdk/everything.ts` 的 `everythingHttp`，stdio 用同文件的写法起进程。
- 用例标题写成可读的英文句子，写出目标与步号。不写阶段式注释。
- 中文文档按 asd-ste100 的语言无关规则。只写现状与依据，不写过程。

## 性质及证据义务
- 每一步的断言要能被第 3 条的变异打红；做不到的步写「未验证」与原因。
- 差分变异不覆盖本闭包：本闭包不改 `src/`，`pnpm run mutation` 没有改动行可变异。交回写明这一点，以第 3 条代替。

## 施工计划
1. 读方法入口里的文件；在工作树根运行 `uv sync --locked --group mcp-fixtures`，确认 `.venv/bin/mcp-server-fetch` 存在。
2. 为每个目标确定 S1–S7 用的工具与参数（读服务端源码或先跑一次 `tools/list`）。
3. 写 `tests/e2e/` 的端口、夹具与旅程表；先让 E-stdio 走通，再加其余目标。
4. 第 3 条的三处变异。
5. 对照矩阵脚本与读数。
6. 文档行、门禁、交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp-host-local` 的单个用例文件与本闭包的慢层；运行对照脚本（含访问三个远程目标）；`uv sync --locked --group mcp-fixtures`；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改产品源码。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e，已构建 `mcp-contract`、`mcp`、`mcp-host-local`。没有别的写者。单个用例文件：在 `packages/mcp/mcp-host-local` 下 `VITEST_MAX_WORKERS=4 pnpm exec vitest run tests/e2e/<文件> --mode slow`。成员慢层全量只在交回前跑一次。HTTP 夹具只用 20000–59999 的端口。不跑 `admission`、仓库全量测试与差分变异。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-e2e/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 判据 C4 与 W3-D：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/plan.md 第 3 节「C4（改写）」与第 4 节「W3-D 端到端」
- 波段规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md 已定事项 39–41、判据 MC3-12
- 兼容基线与旧读数：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/README.md，旧脚本 `mcp-stdio-baseline.mjs`、`mcp-http-baseline.mjs`
- 服务与端口：`packages/mcp/mcp-contract/src/services.ts`、`outcomes.ts`、`testing.ts`；`packages/mcp/mcp/src/index.ts`（`createMcp`）；`packages/mcp/mcp-host-local/src/factory.ts`
- 已有的 B 层夹具与用例：`packages/mcp/mcp-host-local/tests/fixtures/`、`tests/stdio.spec.ts` 第 297 行起
- 调用口怎样装配五个端口（只读作参考，不导入）：`packages/mcp/mcp/tests/doubles/world.ts`、`peer.ts`
- 必须加载：asd-ste100

## 当前认知
- 已确认：基线上三包整组测试与慢层退出 0（卡评论 6681699320）。
- 已确认：server-everything 2.1.0 在 2026-07-28 上为声明了任务扩展的客户端提供任务工具，为现代客户端预先登记表单输入工具；我们的客户端在现代修订上声明 `extensions['io.modelcontextprotocol/tasks']` 与 `elicitation.form`。
- 已确认：2026-11-05 在本机用 SDK 2.4.0 客户端跑过八行中的全部（`compat/README.md` 最后一节），当时都通。
- 未知：S5 选哪个任务工具、它是否途经 `input_required`；mcp-server-fetch 是否允许取本机地址；Context7 的只读工具参数。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；旅程读数表；变异表；对照矩阵表；每个目标的工具与参数；形状不一致项；未覆盖项。

## 已知会受影响的现有用例
- 无。本闭包只加文件，`tests/fixtures/README.md` 只改一句。

## 停止条件
- 某一步失败而原因在任何成员的 `src/`（第 7 条）。
- 慢层里已有的用例在本工作树上失败。
- 对照矩阵某个远程目标不可达：记「不可达」与时刻，继续其余行；三个远程目标都不可达时停下交回。
- 需要改 `package.json`、锁文件或写范围外的文件。

## 追加记录
- 2026-11-06 09:38 派发前：工作树由 `prepare-closures` 建好，三包已构建（`ready.json` 各步成功）。简报检查退出 0；470 条 `caller-outside-scope` 都来自规格里引用的 `form`、`SLOW_TEST_TIMEOUT_MS`、`everythingHttp`，理由写在「排除的调用方」。顾问提示的十一处已写进规格（位置、端口装配、旅程表与适用列、MC3-12 断言、P 的环境、对照脚本路径、产品缺陷停下、fixtures README 一句）。按负责人 2026-11-06 的范围原则：只做列出的事。
- 2026-11-06 09:45 追加 1（写者 09:43 按停止条件第 4 条停下，没有提交）：用例要 `Access<P>` 与 `TenantId`，来自 `@omne-harness/legal-identity`，`mcp-host-local` 没声明这个依赖。派发者裁定按写者的 (a)：派发者在闭包分支提交 `49f0681f8`（devDependencies 加 `@omne-harness/legal-identity`，锁文件 +3 行，`Agent-Role: main`）。`lint:deps` 的 8 处 `no-unresolvable` 都是这棵新树里其他成员没构建 `dist`，与本改动无关，方向规则命中 0。写者的另两条发现都在写范围内照做：Python 对端在 `tests/e2e/` 另写一个按命令起进程并用 `track` 登记的小夹具；stdio 的 S7 期望 `process` 为实际确认的停止范围（写者读到 `root-only`），照实断言。续用原写者，基线改为 `49f0681f8`。
