# 闭包规格 w3-mcp-host

## 身份与位置
- 闭包：w3-mcp-host
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：92a8e3cdf66888890b2ccef9402f299a203858da
- 清晰度：界

基线是父分支 `PanQiWei/skill-mcp`，含已合入的 `w3-mcp-contract`（5c26bc3ae）。清晰度为「界」：契约已定线上结论；SDK 复用的边界与契约未封闭项 F4–F8 由本闭包第一段提出、reduce 裁定。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：跨进程故障与授权头、凭据句柄（策略 `cross-process-faults`、`security-sensitive`）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：在 `@omne-harness/mcp-host-local` 实现契约的 `McpTransportFactory`：stdio 与 Streamable HTTP 两种材料，Streamable HTTP 对只会旧 HTTP+SSE 传输的对端回退。用真实 SDK 服务端夹具跑契约的 `mcpTransportConformance()`。之后 `w3-mcp-e2e` 用它连真实服务端。

本闭包分两段，第一段结束时停下交回：

- **第一段：设计（只写 `tmp/closures/w3-mcp-host/design.md`，不写产品代码）**。交回后等 reduce 的裁定，再开第二段。
- **第二段：实现、夹具、用例、SPEC。**

### reduce 已定的事（不重新裁定）
1. **SDK 复用的判据**（负责人 2026-11-04 生态兼容要求，reduce 2026-11-05 写成判据）：协议层优先复用官方 SDK 2.4.0。某一块不复用，必须指出它违反的硬承诺与契约条款，并给出能复现差异的证据（SDK 发布产物的 `文件:行`，或一个探针的输出）。硬承诺只有三条：结局如实分类（T1、T8）；进程归落点（stdio 进程来自 `ProcessHandle`，见 T5、PL）；不代调用方重发（T8 C04、O06、D15、O05 的「不再发」）。指不出的就复用。自写部分的线上解析用契约的 `classifyWireEvent`、SDK 导出的常量与 schema，不另写一套形状判断。
2. **一份规则只有一份实现**：契约定义的纯规则（T2 的 `x-mcp-header` 校验、T8 的决策）不能在脚本化传输与真实传输里各写一份。脚本化传输里已有的实现（例如 `testing-scripted-transport.ts` 的 `withheldOf`）提到契约的根导出，两边都用它。这属于契约的可加改动，本闭包被授权写（见写范围）。
3. **结构**：协议逻辑与线路分开。默认分法是一个与线路无关的协议会话（请求号、每请求 `_meta`、T3 的头信息、在途表、探测计时、`discover` 与 `initialize` 的状态机、D15 与 O05 的一次再发、T5 的取消与关闭、进度路由、对端请求的 `ping` 与 `-32601`），加三种线路：stdio（`ProcessHandle` 的流、按行切帧、`stdio-ended`）、Streamable HTTP（`fetch`、头、会话号、凭据的 `authorize` 与 `reportRejection`、`WWW-Authenticate` 到授权发现、2xx 的 SSE 流、现代修订上按请求中止应答流）、旧 HTTP+SSE。线路只产出契约的 `WireEvent`，会话用 `classifyWireEvent` 与 T8 得出结论。分法可以调，理由写进成员 SPEC。
4. **凭据**：不传 SDK 的 `authProvider`。授权头只经 `HttpCredentialHandle.authorize(headers)`。T4、T9 照做。凭据值不进任何答复、错误、日志与测试快照。
5. **旧 HTTP+SSE**：是 `streamable-http` 材料内的回退，不是新的材料种类（波段 MCP 规格第 28 行）。本闭包在契约 T3 加一句，并在 T8 写明旧传输的事件怎样落到现有的行；需要新行时写新行。第一段先交映射方案。
6. **夹具**（波段 MCP 规格已定事项 38、39，版本按现状改为 2.4.0）：真实服务端用 `@modelcontextprotocol/server` 2.4.0，现代 stdio 用 `serveStdio`，HTTP 用 SDK 的 HTTP 处理器起本机端口；`tasks/*` 与多页清单自写处理器；旧对端用 SDK 的旧修订服务端。旧 HTTP+SSE 对端可用参考服务端 `@modelcontextprotocol/server-everything` 2.1.0 的 `sse` 模式（本机已验证：`SSEClientTransport` 连上，协商 2025-11-25，16 个工具）。测试用 `node:child_process` 起夹具服务端并包成 `ProcessHandle`（测试内的落点替身，不是产品落点），`stop()` 以进程组结束并按实际确认答范围。
7. **不实现**：OAuth 授权流程（只做发现）、`elicitation.url`、`sampling`、`roots`、`list_changed` 订阅、后台重连。

### 第一段要交的设计（`tmp/closures/w3-mcp-host/design.md`）
1. SDK 2.4.0 事实表：`@modelcontextprotocol/client` 的 `StreamableHTTPClientTransport`、`SSEClientTransport`、`StdioClientTransport`、`Client` 与相关导出，每一项写行为、发布产物的 `文件:行`。从契约 SPEC「与官方 TypeScript SDK 2.4.0 的对照」一节出发，不重复已核对过的行。
2. 复用决定表：每一块写「复用／不复用」；不复用的写违反的硬承诺、契约条款与证据。复用的写怎样接入（例如 `fetch` 钩子、事件回调）以及接入后 T8 的哪些行由谁兑现。
3. 模块分法与每个模块的职责、依赖与对外形状。
4. 契约未封闭项 F4–F8（契约 SPEC「未封闭项」第三项的五个子项）各给一个建议的裁定与理由。默认方向：不比 SDK 与规范更严（生态兼容）；与「结局如实分类」冲突时以后者为准。
5. 旧 HTTP+SSE 的回退条件与事件映射。
6. 契约改动清单（只能是可加改动）：根导出的新纯函数、T2、T3、T8、`classifyWireEvent` 的改动、未封闭项的关闭。
7. 需要的新依赖（如有），每个写理由与替代。依赖由 reduce 加，写者不改依赖段。
8. 第二段的施工次序与用例清单（按 MC3-9、MC3-10、MC3-11 与第 4 项的裁定）。

### 写范围
- `packages/mcp/mcp-host-local/` — 本闭包的成员：`src/`、`tests/`（含 `tests/fixtures/`）、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`、`index.md`、`docs/`、`verification/`；`package.json` 只改 `exports`、`files`、`scripts`
- `packages/mcp/mcp-contract/src/` — 第二段，只做第一段获准的可加改动：新根导出的纯函数、`wire.ts`、`testing-scripted-transport.ts` 改用新根导出
- `packages/mcp/mcp-contract/tests/` — 第二段，对应用例与导出集合
- `packages/mcp/mcp-contract/SPEC.md` — 第二段，T2、T3、T8、未封闭项、导出列表
- `packages/mcp/mcp-host-local/tests/stdio.spec.ts`（新建） — MC3-10 的用例
- `packages/mcp/mcp-host-local/tests/http.spec.ts`（新建） — MC3-11 的用例
- `tmp/closures/w3-mcp-host/`（新建） — 设计、红灯、探针与日志

### 排除的调用方
- `packages/mcp/mcp/`：另一闭包在改（`w3-mcp-lifecycle` PR #1134、之后的 `w3-mcp-call`）。只读。契约改动不能让 `mcp` 在基线上编译失败；会失败时停下交回。
- `pnpm-lock.yaml`、各 `package.json` 的依赖段、`pnpm-workspace.yaml`：只由 reduce 写。需要新依赖时在第一段写进设计，第二段开工前由 reduce 加。
- `packages/mcp/docs/`、`docs/domains/mcp/`：波末写回。
- `packages/mcp/mcp-host-local/tests/e2e/`：`w3-mcp-e2e` 的范围。

## 验收清单
第一段的验收是 `design.md` 覆盖「第一段要交的设计」八项。以下是第二段的验收。每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` 退出 0。
2. MC3-9：两种传输（stdio、Streamable HTTP）各跑一次 `mcpTransportConformance()`。报告「通过、失败、不适用」分开计数；失败为 0；每条不适用有理由。旧 HTTP+SSE 回退另有用例。
3. MC3-10（`packages/mcp/mcp-host-local/tests/stdio.spec.ts`）：读不懂的行按 F4 的裁定处置（断开时是 `stream-broken`）；进程退出 → `process-exited`；旧对端回退；取消通知带 `_meta`；探测时限内无应答回退。
4. MC3-11（`packages/mcp/mcp-host-local/tests/http.spec.ts`）：401 与带 `insufficient_scope` 的 403 → `authorization-required`，且 `reportRejection()` 恰好一次；其余 403 → `connection-unavailable`，且不调用；授权发现的两段 URL；流断开时读类请求再发一次、`tools/call` 不再发；现代修订上 `x-mcp-header` 不合法的工具进 `withheld`；会话号与 404 → `session-ended`；旧 HTTP+SSE 回退。
5. 每一处「不复用 SDK」在成员 SPEC 有一行：违反的硬承诺、契约条款、证据。每一处复用写明接入方式。
6. 凭据：授权头的值不出现在任何答复、错误消息、日志与测试快照里（用例断言）。
7. 契约：新根导出有用例；脚本化传输改用它后，契约原有用例原样通过；导出集合测试按新增改写（不算放宽）。
8. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`git ls-files --eol | grep -c w/crlf` 为 0。
9. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言；SDK 的类型不出现在本成员的公开导出里。

## 实施规格
- 公开根导出一个工厂 `createLocalTransportFactory(options)`，按 `material.kind` 分派。`options`：`clientInfo`（name、version，必填）、`probeTimeoutMs`（stdio 探测时限，正整数，必填，不设缺省）、可选 `fetch`（测试注入，缺省全局 `fetch`）。不合法时抛 `RangeError`（波段 MCP 规格已定事项 35）。
- JSON-RPC 与每请求 `_meta`、MCP 头、取消、再发、授权发现、任务操作、`-32022` 再探测、`instructions` 的界限按契约 T2–T9 与波段规格已定事项 37。
- 模块的默认分法见「reduce 已定的事」第 3 项；第一段的设计获准后按设计施工。
- 命名账本：`createLocalTransportFactory`、`LocalTransportOptions`（名可调，写进报告）；契约新根导出的名字在第一段提出。

## 性质及证据义务
- 每条 MC3-10、MC3-11 的用例能对一个具体缺陷变红：报告列「用例 → 缺陷 → 变红证据」。证明变红时先还原源码并重建 `dist` 再跑。
- 不重发：流断开时 `tools/call`、`tasks/update`、`tasks/cancel` 不再发；读类恰好再发一次。
- 进程归落点：传输不自己起进程，不停止进程；`close()` 先关 stdin 写端，再取消 stdout 读取。
- 每个异步副作用有等待上界或有明确的拥有者：探测计时、应答流、SSE 流、子进程句柄。测试结束时没有遗留的进程与端口（用例断言或 `afterEach` 检查）。

## 施工计划
第一段：
1. 读方法入口，读契约 SPEC 全文与 `src/{transport,wire,outcomes,ports,revisions}.ts`、`testing-transport.ts`、`testing-scripted-transport.ts`。
2. 读 SDK 2.4.0 发布产物与 W2 探路材料；需要时写探针（放 `tmp/closures/w3-mcp-host/probes/`），对本机参考服务端实测。
3. 写 `design.md`，交回，停下。

第二段（reduce 裁定之后）：
1. 契约的可加改动，先红后绿，契约原有用例原样通过。
2. 协议会话与 T8，先用内存线路驱动的单元用例。
3. stdio 线路与夹具；跑套件。
4. Streamable HTTP 线路、凭据与授权发现；跑套件。
5. 旧 HTTP+SSE 回退。
6. MC3-10、MC3-11 用例；成员 SPEC、README 与文档；门禁；交回。
红灯输出存 `tmp/closures/w3-mcp-host/red/`。提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。

## 自主范围与动作授权
允许：写范围内改文件；运行本闭包涉及的三个成员的构建与测试、仓库检查；起本机的参考服务端与夹具进程（测试结束时清理）；访问 SDK 与规范的公开资料；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、破坏性契约改动、连远程 MCP 服务（远程目标归 `w3-mcp-e2e`）。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的还有 reduce 本会话（`w3-skill-fix`、`w3-mcp-lifecycle` 的评审与修复）。派发者唯一合回。不跑 `admission`、不跑仓库全量测试、不跑差分变异；差分变异由 reduce 在最终 head 跑。本机 8 核：成员测试用 `VITEST_MAX_WORKERS=4`。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 波段规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md（「生态兼容」一节、已定事项 35–40、判据 MC3-9–MC3-11）；/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/wave-pack.md「生态兼容」。
- W2 SDK 探路：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/spike/README.md 与同目录的探针。
- 兼容目标与本机实测：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/README.md（MCP 一节与 2026-11-05 一节）。
- 契约：`packages/mcp/mcp-contract/SPEC.md` 全文（T1–T9、「与官方 TypeScript SDK 2.4.0 的对照」、未封闭项）。
- SDK 发布产物：`packages/mcp/mcp-host-local/node_modules/@modelcontextprotocol/client/dist/`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100。

## 当前认知
- 已确认：本机官方 SDK 2.4.0 客户端连通 server-everything（stdio 22 工具、`streamableHttp` 模式 22、`sse` 模式 16）、server-filesystem（14）、Python mcp-server-fetch（1，需 `uv sync --group mcp-fixtures`，已装）。SDK 公开导出有 `StreamableHTTPClientTransport`、`SSEClientTransport`、`parseJSONRPCMessage`、`LATEST_PROTOCOL_VERSION`、`SUPPORTED_PROTOCOL_VERSIONS`、`specTypeSchemas`；`x-mcp-header` 的校验（`_excludeInvalidXMcpHeaderTools`，`dist/public-CvV4ZHkX.mjs:3989`）不是公开导出。SDK 的 stdio 读法对读不懂的行只经 `onerror` 报告，不断开流（`dist/stdio.mjs:136`）。
- 假设：`StreamableHTTPClientTransport` 的发送路径只读 400 的正文且要求 `id` 相同（契约对照表），不能区分请求离开之前与之后的网络错误；若属实，HTTP 的请求与应答由本成员经 `fetch` 自写。第一段核实。
- 未知：SDK 的旧修订服务端在 2.4.0 的入口；旧 HTTP+SSE 回退的触发信号在 SDK 里的确切写法。

## 返回与恢复
第一段：内联交回 `design.md` 的路径与摘要，以及待 reduce 裁定的问题清单。第二段：每个提交号；每条验收的命令与结果；套件计数表；「用例 → 缺陷 → 变红证据」表；自定裁定与理由；写者声称的结构性改动清单（reduce 会逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host/`。

## 已知会受影响的现有用例
- `packages/mcp/mcp-host-local/tests/public-entry.spec.ts`：导出集合按新增改写。
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts` 与封闭集合用例：按新增的根导出改写。

## 停止条件
- 第一段结束（必停）。
- 某项契约要求只能用破坏性改动实现。
- 某个硬承诺在任何实现下都兑现不了（例如 SDK 与 `fetch` 都拿不到需要的事件）。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。余下的 `caller-outside-scope` 警告全部来自正文里的通用词（`id`、`kind`、`options`、`instructions`、`sse`）与全仓库同名标识符的匹配，不是本闭包的调用方，不处理。
- 2026-11-05 第一段交回（`tmp/closures/w3-mcp-host/design.md`，探针在同目录 `probes/`）。reduce 裁定如下，第二段按设计与本条施工：
  - Q1 F4–F8 按设计第 4 节采纳。F4 取代已定事项 36「stdout 出现一行非 JSON 视为流损坏」一句，依据是波包「生态兼容」（优先于本闭包其余条目）、SDK 的行为与探针 `p5`；契约 T2 写新规则并关闭未封闭项。唯一的断流条件是一行超过 16 MiB 的行缓冲上界。
  - Q2 采纳：HTTP 线路自写，不用 `StreamableHTTPClientTransport` 与 `SSEClientTransport`；`Client`/`Protocol` 只在测试里做对照客户端。每处不复用在成员 SPEC 写明违反的硬承诺与 `文件:行`（设计第 2 节的表原样进成员 SPEC）。
  - Q3 采纳：夹具分 A、B 两层。
  - Q4 选 (a)：正文段落加 `WireContext.mode`，`TRANSPORT_TABLE` 不加行；SSE 模式的用例按「另有用例」手写，套件计数里单列。
  - Q5 采纳设计第 6.1 节的根导出集合与名字；「规则归契约」成立。
  - Q6 采纳：`eventsource-parser@3.1.1` 进 `mcp-host-local` 的 dependencies，`@modelcontextprotocol/node@2.1.2` 进 devDependencies。reduce 已在第二段开工前加好（见下一条）。
  - Q7 采纳：契约 T3 加「`Mcp-Name` 的值按 SEP-2243 编码」，由 `mcpRequestHeadersOf` 实现，加一条非 ASCII 工具名的用例。
  - Q8 接受：stdio 上 X02 的 `discover-retry`、`initialize` 两格不适用，理由写进套件计数表，`stdio.spec.ts` 补可实现的形状。
  - Q9 采纳：stdio 线路读出并丢弃 stderr（与已定事项 36 一致）。
  - Q10 采纳：不发 DELETE。成员 SPEC 把它写成与规范 SHOULD 的差异，带理由。
  - Q11 采纳：A 层 stdio 对端自写。
  - 另加一条义务（`w3-mcp-lifecycle` 第 1 轮评审 L3 R3 的去向）：传输只在发请求时调用凭据句柄，`open` 不发请求；`open` 在答复之前再核一次 `signal`，已中止就关闭线路、答 `not-sent`，不交出传输。所以表在时限到期后释放句柄时，没有它授权过的传输还会调用它。契约 T9 加这一句，成员 SPEC 写怎样兑现，加一条用例（`open` 的 `signal` 在答复之前中止：不交出传输，`authorize` 0 次）。
  - 设计第 9 节的自定事项照准。
- 2026-11-05 随 F4 改验收：判据 MC3-10 的第一项「非 JSON 行 → `stream-broken`」改为「非 JSON 行丢弃，之后的应答照常到达；一行超过 16 MiB 行缓冲上界 → `stream-broken`，传输不再可用」。其余判据不变。波段规格 `waves/w3/mcp/spec.md` 的 MC3-10 一行在波末写回时同步。
- 2026-11-05 第二段交回（头 `a7b86e13b`，10 个提交）。reduce 读 diff 与核对：62 个文件全在 `mcp-host-local` 与 `mcp-contract` 写范围内；工作树干净；与父分支 `b2ba7dc89` 合并无冲突。写者自裁的处置：
  - 自裁 1 采纳：复用表里协议常量与 `serializeMessage` 改为不复用（契约根已导出同名常量，序列化只是 `JSON.stringify` 加换行），产品源码不导入 `@modelcontextprotocol/*`。这修订了 Q2「原样进 SPEC」的输入：表以成员 SPEC 现文为准。`@modelcontextprotocol/client` 移到 `devDependencies`，reduce 提交 `8f9016fd8`（锁文件离线重算）。
  - 自裁 2 采纳：B 层 SDK 对端的探测时限 5 s。300 ms 在三包并行时被 `server-everything` 冷启动超过，传输按 T8 D13 走旧一路，产品行为正确，是用例前提在负载下不成立。A 层保持 300 ms。
  - 自裁 3–11 采纳，都在 Q1–Q11 与 T9 义务的范围内；第 10 条「应答到达后应答流在后台读完」交实现评审核对它的等待上界与拥有者。
  - 未覆盖登记：远程对端、TLS、代理、DNS 失败（归 `w3-mcp-e2e`）；`x-mcp-header` 剔除只在 A 层；H12 没有能变红的用例。
- 2026-11-05 第 1 轮交付边界评审后，卡拥有者裁定（全文 `waves/w3/reviews/mcp-host-r1.md`「卡拥有者裁定」）：
  - 验收 7 改为「新根导出有用例；脚本化传输改用它后，契约原有用例原样通过，Q1 关闭 F4 改写的一条（`wire.spec.ts` 非 JSON 行由断流改为丢弃）除外；导出集合测试按新增改写」。本卡的「可加」指公开形状。
  - 目标边界的「用真实 SDK 服务端夹具跑契约的 `mcpTransportConformance()`」改为「契约套件在真实线路上的 A 层对端跑；与 SDK 真实服务端的互通由 B 层用例证明」（Q3、Q11）。
  - 已定事项 1 与 2 一起读：契约根已实现的规则不再复用 SDK 的那份；复用判据只管带协议行为的块。
  - `mcp-contract/docs/public-api.md` 事后纳入写范围（根导出的消费者同步）。
