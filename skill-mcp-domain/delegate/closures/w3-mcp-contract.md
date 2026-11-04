# 闭包规格 w3-mcp-contract

## 身份与位置
- 闭包：w3-mcp-contract
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-mcp-contract
- 分支：PanQiWei/skill-mcp-w3-mcp-contract
- 基线：05f281394c9179ecb9427fb1d5b97cc2f808a789
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：契约把失败、次序与诊断留给判断（传输套件的用例设计、授权失败处置），策略 `security-sensitive` → 顶档、上限 high；不是内核原语，也不跨进程运行（套件只描述，不起进程）。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：把 2026-07-28 修订与 W2 带回的契约可加调整写回 `@omne-harness/mcp-contract`，并新增传输符合性套件 `mcpTransportConformance()` 与内存脚本化传输 `createScriptedTransportFactory`，使 B 段的 `w3-mcp-call`（服务）与 `w3-mcp-host`（本地传输）不再需要绕道。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md「已定事项」1–16、18、19 为准，逐条照做，不重新裁定。
- 只做可加改动：新字段可选、新导出、新条款；不改已有签名的必填性（已定事项 15 把 `continuation.inputResponses` 从必填改为可选，属于放宽，允许）；不删导出。
- SEP-2663 任务形状按原文核实：https://github.com/modelcontextprotocol/modelcontextprotocol 的 `ext-tasks/specification/2026-07-28/tasks`（或该仓库 2026-07-28 修订的任务扩展页）。SPEC 引用出处。原文与 T6 现有读法冲突时停下交回。

不在范围内：服务实现（`mcp`）、真实传输与 SDK（`mcp-host-local`）、组页、新依赖。

### 写范围
- `packages/mcp/mcp-contract/` — 本闭包唯一的写入目录：`src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`、`acceptance/`、`schema/`；`package.json` 只允许改 `exports`、`files`、`scripts`
- `packages/mcp/mcp-contract/tests/transport-conformance.spec.ts`（新建） — 让脚本化传输与违约脚本跑传输符合性套件

### 排除的调用方
- `packages/mcp/mcp/` — A 段另一写者在改；只读。停止条件：契约改动会让 `mcp` 在 F0 上编译失败时（例如改了它用到的必填形状），停下交回
- `packages/mcp/mcp-host-local/` — B 段写；不改
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/mcp/docs/`、`docs/domains/mcp/` — 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` 退出 0（`mcp` 在 F0 的测试不受影响）。
2. MC3-1：已定事项 1–16 逐条在 `SPEC.md` 有条款（报告列「事项号 → 条款号」对照表），在类型或守卫有落点；`packages/mcp/mcp-contract/tests/closed-sets.spec-d.ts`、`packages/mcp/mcp-contract/tests/spec-closed-sets.spec.ts` 同步；旧测试原样通过（只允许按新增导出改写 `public-entry.spec.ts` 的集合）。
3. 已定事项 15：`args` 非对象的守卫用例；只带 `requestState` 的 `continuation` 类型可构造。变异：守卫接受数组 → 用例变红。
4. 已定事项 16：空串 `requestState` 被 V1 接受（用例）；`inputSchema` 缺 `type: "object"` 的工具使 `completeListing` 答 `action-invalid`（用例）。变异：去掉 `type` 核对 → 用例变红。
5. MC3-2：`mcpTransportConformance()` 用例覆盖 T1–T7 与已定事项 7–12、14，用例名带条款号；`packages/mcp/mcp-contract/tests/transport-conformance.spec.ts` 让 `createScriptedTransportFactory` 跑全部用例，`not-applicable` 计为失败；另用一个违约脚本传输（例如流断开时重发 `tools/call`，或 401 时不调用 `reportRejection()`）证明对应用例变红。
6. `createScriptedTransportFactory` 记录收到的每个请求（方法、参数、`_meta`、`progressToken`、取消），供服务测试断言。
7. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`git ls-files --eol | grep -c w/crlf` 为 0。
8. `src/` 无 `as`（`as const` 除外）、无 `any`；品牌只由守卫授予。

## 实施规格
- `services.ts`：ActionDiscovery 的 refresh 请求加 `signal?: AbortSignal`；`McpPorts` 加 `clock?: McpClock`。
- `ports.ts`：`McpClock { now(): Date }`。
- `transport.ts`：`ListingPage.withheld?`；`CallRequest.continuation` 的 `inputResponses` 可选。
- `outcomes.ts`：`TaskReport` 与任务结局加 `pollIntervalMs?`、`ttlMs?`、`statusMessage?: Untrusted<string>`。
- `index.ts`：导出 canonical、sameJson、`McpClock`。
- `testing.ts`：导出 `testing-values.ts` 的样本构造器、`mcpTransportConformance`、`createScriptedTransportFactory` 及其脚本与夹具类型。
- 新文件 `src/testing-transport.ts`（套件与夹具接口）、`src/testing-scripted-transport.ts`（脚本化传输）。夹具接口的最低要求见 spec 已定事项 18；脚本描述「对端在 JSON-RPC 层怎样答」，不描述 SDK。设计成 `w3-mcp-host` 能用真实 SDK 服务端实现同一夹具接口：夹具给出「按脚本配置的对端」与「为它打开传输的材料」，套件经契约的传输工厂打开传输再驱动。
- `SPEC.md`：S1–S9、T1–T7、R4、V1、C1 的改动；新节「与协议的偏离」（已定事项 10）；「组合与验证」加套件一行；「未覆盖」改写（T 条款现由套件覆盖，真实服务端在 `mcp-host-local`）。
- 命名账本：`McpClock`、`mcpTransportConformance`、`TransportFixture`（名可调，写进报告）、`createScriptedTransportFactory`、`TransportScript`（名可调）；新字段名 withheld、header-invalid、pollIntervalMs、ttlMs、statusMessage、clock 见 spec 已定事项。

## 性质及证据义务
- 套件的每个用例能对一个具体违约变红；报告列「用例 → 违约 → 变红证据」。
- 授权：401 与 insufficient_scope 的 403 → authorization-required 且句柄的 reportRejection 恰好一次；其余 403 → connection-unavailable 且不调用。
- 不重发：流断开时 tools/call、tasks/update、tasks/cancel 不重发；读类重发一次。
- 每请求 _meta 三键与任务扩展、elicitation.form 声明；不声明 elicitation.url、sampling、roots。

## 施工计划
1. 先核 SEP-2663 原文，把任务形状与 T6 对照写进 `tmp/closures/w3-mcp-contract/sep-2663.md`。
2. 类型与守卫的可加改动（已定事项 1、2、3、8、12、15、16），先红后绿。
3. SPEC 条款（已定事项 4–7、9–11、13、14 与措辞）。
4. 夹具接口与脚本化传输，再写套件用例，先让脚本化传输过套件，再写违约脚本证明变红。
5. 门禁、文档、交回。红灯输出存 `tmp/closures/w3-mcp-contract/red/`。证明变红时先还原源码并重建 dist 再跑。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、破坏性契约改动。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-mcp-contract。另两位写者并行：`w3-mcp-table` 写 `packages/mcp/mcp/`，`w3-skill-catalog` 写 Skill 三成员。派发者唯一合回。不跑 `admission` 与仓库全量测试；差分变异由 reduce 在最终 head 跑。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-mcp-contract/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md 全文与同目录 plan.md；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/schema-check.md；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/spike/README.md（SDK 实测：线上形状、`-32022`、`-32021`、取消、信封）。
- 契约现状：`packages/mcp/mcp-contract/SPEC.md` 全文；`src/{transport,outcomes,services,ports,values,brands,json}.ts`；现有五个套件 `src/testing-*.ts` 与 `src/testing-case.ts`（套件形状先例）。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100。

## 当前认知
- 已确认：基线 mcp-contract 298 例通过；mcp 成员用到 McpServices、McpPorts、McpTransport、ListingPage，未用 CallRequest 与 TaskReport；SDK 探路的线上事实见 spike README。
- 假设：SEP-2663 原文的 tasks/get 应答带任务状态与（input_required 时）输入请求，completed 时带结果。不成立时停下交回。
- 未知：SEP-2663 是否另有 tasks/list（核对结论：2026-07-28 没有）。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果；「事项号 → 条款号」对照表；套件「用例 → 违约 → 变红证据」表；自定裁定与理由；写者声称的结构性改动清单（reduce 会逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-contract/`。

## 已知会受影响的现有用例
- `tests/public-entry.spec.ts`：导出集合按新增改写（不算放宽）。
- `tests/closed-sets.spec-d.ts`、`tests/spec-closed-sets.spec.ts`：按新增可选字段同步。

## 停止条件
- SEP-2663 原文与 T6 冲突。
- 某项调整只能用破坏性改动实现。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-04T06:20Z 负责人提出生态兼容要求（社区 Skill、各厂商 MCP 服务必须能用）。reduce 撤回已定事项 16 的「`inputSchema` 必须 `type: "object"`，不符整份拒绝」：不比协议与官方 SDK 更严；C1 的容错方式在 B 段重定。已用 SendMessage 通知写者。
- 2026-11-04T10:45Z **第 2 轮输入**（评审 `waves/w3/reviews/mcp-contract-r1.md`）。reduce 裁定，逐条先写会因预期原因变红的用例（违约传输），证明变红前先还原源码并重建 dist：
  - **C1 夹具能被真实传输实现**（阻断 1 与风险）：`observedProcess` 包住原始流（写入转给原 writer、读取从原 reader 转出），只额外记下 close 与 cancel；`received()` 改为异步（或加 `settle()`），给真实夹具在中止后落账的时间；T4 的 `resource_metadata` 与元数据 URL 从夹具给出的目标派生，不写死 `https://peer.test`，并允许 RFC 9728 的 `resource` 与目标一致；旧对端「拒绝对端请求」用例改成对端在 `notifications/initialized` 之后发请求。用一个最小的「读写真管道」的传输证明 T5 关闭次序用例现在可过。
  - **C2 授权回报**（阻断 2）：每条 401 用例断言 `reportRejection` 恰好一次；补 `listActions` 与 `discover` 的 401 回报用例；补「403 带非 `insufficient_scope` 的 Bearer 质询（如 `invalid_token`）→ `connection-unavailable` 且不回报」。
  - **C3 回退规则**（阻断 3）：三条 `-32022` 用例断言没有发出 `initialize`；补「discover 答 `-32021`、`initialize` 本可成功，仍答 `error-answer`」。
  - **C4 信封**（阻断 4）：T6 的 update/cancel 与 T5 的 stdio 取消通知都用 `assertEnvelopes` 核全部三键与固定能力。
  - **C5** 旧一路 instructions 超限用例。**C6** 探测计时只在等待现代应答时计（`pace` 之后起算），应答先到即清除计时器；stdio + `pace` 用例。**C7** `tasks/get` 答 `failed` 而没有 `error` 对象时答 `answer-malformed`，`what` 新增 `error-missing`（封闭集合可加，同步集合测试与 SPEC T7）；不编造错误。**C8** 用例数改正。**C9** 任务提示只收非负安全整数，其余按「类型不对」省略。
  - **裁定（待裁 1–6）**：(1) 依 SEP-2663，`tasks/get`、`tasks/update`、`tasks/cancel` 在 Streamable HTTP 上 `Mcp-Name` 为 `params.taskId`；`tools/call` 为工具名；其余请求不带。`PeerReceived` 对 HTTP 请求记下 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name`（可选字段），套件核对；线规格已定事项 37 随之更正。(2) 协商之后每个请求 `_meta` 的协议版本取协商出的版本，现代与旧两路相同。(3) 旧一路 `initialize.params.capabilities` 按同一声明规则：只声明 `elicitation.form`，不声明 `elicitation.url`、`sampling`、`roots`；任务扩展只在现代修订声明。(4) HTTP 上 400：正文是 JSON-RPC 错误且码属于现代修订（`-32020`/`-32021`/`-32022`）时按现代一路处理（`-32022` 重试），其余 400 判为旧对端；以 SDK 2.4.0 客户端的同一判断为对照，SPEC 写出处。(5) 同 C7。(6) 旧一路 `initialize` 应答的协议版本须在契约列出的支持修订内（列表按 SDK 2.4.0 `SUPPORTED_PROTOCOL_VERSIONS` 核对后写死在契约常量里，SPEC 写出处），否则答 `answer-malformed`（`discover-shape`）。
  写者：原写者（Fable）续做；Fable 仍受限时改派 claude-opus-5-5@high，记一次降级。轮次记 2。返工原因：评审发现、规格（待裁 1–6 是规格缺口）。
- 2026-11-04T10:50Z Fable 仍受限，第 2 轮改派 claude-opus-5-5@high（记一次降级，以 L3 增量复审补足）；工作树干净，head 1cbee8026。
- 2026-11-04T11:05Z **第 3 轮输入**（增量评审见 `waves/w3/reviews/mcp-contract-r1.md`「第 2 轮」；评审探针 `/tmp/claude-0/-home-user-omne-harness-lite/f1070bb8-fa26-55f8-8bda-04c4ceeaeb27/scratchpad/review-w3-mcp-contract-r2/`）。同一写者续做，范围小。生态兼容优先：探测与回退与官方 SDK 2.4.0 客户端一致，除非与「结局如实分类」「不代调用方重发」冲突。
  - **D1 套件补洞**（建议 1–5）：`-32022` 重试之后对 `call`、`getTask` 与 stdio 取消通知核协商版本；加显式 `streamable-http` 材料的旧一路头用例（不依赖材料次序）；补 `call` 与 `listActions` 收到 400 JSON-RPC 正文的用例；`getTask` 收「`error` 不是对象」答 `error-missing`；旧版本列表加「区间内但不在列表」与「现代版本」两个值。每条用评审者对应的违约变体（N2、N2b、N2c、N1d、N4c、N4d、N5c、N6b、N6c）证明变红。
  - **D2 待裁 1**：旧连接上每个请求的 `_meta.clientCapabilities` 不声明任务扩展，与 `initialize.params.capabilities` 一致（裁定 3 的字面；写者裁定 5 撤回）。
  - **D3 待裁 2**：与 SDK 2.4.0 一致——`-32022` 不带 `data.supported`，或 `supported` 里没有现代版本时，若旧一路可用则回退旧一路；旧一路也失败时按已定的「报旧一路的失败」。SPEC T3 写明，并列出与 SDK 仍然不同的地方（只剩 `-32020`/`-32021`）。
  - **D4 待裁 3**：夹具的 `protocolVersions` 只列现代修订；旧修订由契约的 `LEGACY_PROTOCOL_VERSIONS` 决定。SPEC 夹具段写明；`tests/transport-conformance.spec.ts` 的夹具改为只列现代版本，涉及旧版本的用例改用旧一路表达。
  - **D5 待裁 4**：HTTP 上 `server/discover` 收到 401/403 以外、低于 500 的状态（含 404、405）时，与 SDK 2.4.0 `classifyHttpError` 一致：正文是现代修订的 JSON-RPC 错误则按现代一路处理，否则判为旧对端。SPEC T3 写明出处；用例覆盖 404 与 405。
  - **D6** 报告补交代 `modernPath` CC 19、`httpAnswer` CC 14（测试替身代码；能拆就拆，不能拆写理由）。
  轮次记 3。返工原因：评审发现、规格（D2–D5 是与 SDK 对齐的生态兼容裁定）。之后 reduce 派一次设计与 SPEC 表达评审（第 1 轮推迟的那一面）。
- 2026-11-04T11:05Z+ 第 3 轮交回（head c407fab9d）：D1–D6 做完，M53–M103 共 51 条变异全部变红；套件 72 例。写者自定 1（无共有版本时也按 SDK `classifyResult` 回退旧一路）、2（`FIRST_MODERN_PROTOCOL_VERSION`）、3（测试夹具用虚构的 `2027-01-01`）reduce 认可；4（HTTP 5xx 无条款）转 B 段 `w3-mcp-host` 规格裁定，由该闭包授权写契约 T1 一句。
