# 可复核的来源与观察

每条记录一组输入与结论范围。路径相对于解包根：DSH 为主检出 `tmp/sources/extracted/dsh/`，
Codex 为 `tmp/sources/extracted/codex/`，Codex 文档为 `tmp/sources/extracted/codex-docs/`。
三份归档的校验值与取得方式见主检出 `tmp/sources/README.md` 与 `tmp/sources/SHA256SUMS`。
全部为**源码与文档取证，没有执行**任何实验；本轮没有构造反例。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 来源立场 |
|---|---|---|---|
| DSH | `deepseek-ai/deepseek-harness` commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10T14:17:09Z，`@deepseek-ai/dsh-root@0.1.5-rc.2`）；归档 `tmp/sources/dsh-c291e79.tar.gz` → `tmp/dsh-reuse-assessment-20260913/upstream.tar.gz`，提交元数据 `upstream-commit.json` | 2026-09-13 GitHub tarball | 作者自述（README、`.agents/notes/` 决策记录）+ 源码。短板一侧取自它自己的 Known Limitations、Dev Note、Alternatives considered；**未检索 DSH issue tracker**（不上网） |
| Codex | `openai/codex` commit `5c5308fc9a9ee789049d646ef11e5400384b9c6f`；归档 `tmp/sources/codex-5c5308f.tar.gz`，**只含** `codex-rs/{hooks,protocol,rmcp-client,core/src}` 与 `docs` | `git archive` 自本机克隆 | 源码（一手）；不含 `codex_mcp` 等上层 crate 与 workspace `Cargo.toml` / `Cargo.lock` |
| Codex 文档 | learn.chatgpt.com 离线副本，2026-09-20 抓取；归档 `tmp/sources/codex-docs-2026-09-20.tar.gz`，36 个页面 | 目录整体打包 | 厂商自述；**专门的 MCP 页面（`/docs/extend/mcp`）不在副本里**，只有配置参考、权限、审批等页里的 MCP 条目 |

## E-1 DSH mcp-client 的包依赖与 SDK 版本

- 消费对象：research.md「整包直接复用……」「DSH 锁定的官方 SDK 是 1.29.0……」。
- 来源与精确修订：DSH `c291e796`。
- 取得方式与实际观察：
  - `packages/mcp/mcp-client/package.json:29-37` `peerDependencies`：`dsh-attachment`、`dsh-llm`、`dsh-scope`、`dsh-subprocess`、`dsh-timeout`、`dsh-tools`、`cordis`（均 `workspace:^`）。
  - `package.json:38-42` `dependencies`：`"@modelcontextprotocol/sdk": "^1.12.0"`、`@deepseek-ai/schemastery`、`zod ^4.4.3`。
  - `package.json:51-52` devDependencies：`@modelcontextprotocol/server-everything ^2026.7.4`、`server-filesystem ^2026.7.4`（e2e 用）。
  - `src/tools.ts:27` `import type { JsonValue } from '@deepseek-ai/dsh-util-values'`——**该包不在 `package.json` 里**。
  - `pnpm-lock.yaml:7381` importer `packages/mcp/mcp-client`；`:7386-7388` `@modelcontextprotocol/sdk` specifier `^1.12.0` → version `1.29.0(zod@4.4.3)`。
  - `pnpm-lock.yaml:12951-12958` `@modelcontextprotocol/sdk@1.29.0`：`engines node >=18`，peer `zod ^3.25 || ^4.0`，可选 peer `@cfworker/json-schema`。
  - 同一 lockfile：`:9322`/`:9336-9338` `packages/subagent/subagent-claude-code` 声明 `^1.29.0`；`:7102`/`:7115` `packages/llm/llm-pi-ai` 经 `@earendil-works/pi-ai@0.85.1` 间接带入同版本。
  - `docs/module-graph.md:828-833`、`:1406`：mcp-client → attachment、llm、scope、subprocess、timeout、tools；`:910`、`:1420`：`acp` → `mcp-client`。
- 支持范围：该 commit 的声明与锁定。**不支持**「SDK 1.29.0 支持哪些 MCP 协议版本」——`node_modules` 不在归档里。
- 后续核对：DSH 换 commit 或 lockfile 变动时 grep `c291e796`、`1.29.0`。

## E-2 DSH 插件入口：身份、配置、作用域

- 消费对象：对照表第 1、3、4、11、16 行；「两源都以本地配置的名字……」。
- 来源：DSH `c291e796` `packages/mcp/mcp-client/src/index.ts`。
- 实际观察：
  - `:1-11` 头注释：一个插件实例连一个服务端；多个服务端在 `cordis.yml` 装多个实例；生命周期随 effect，卸载即断开、注销全部工具、释放 `serverName` 预留。
  - `:32` `inject = ['tools']`；`:35` 单次调用默认超时 60 000 ms；`:38` `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`。
  - `:40-45` 预留按「注册作用域」分：Agent 作用域的实例可在另一个 Agent 里重用同名，全局实例与同一 Agent 内的重复互斥。
  - `:49-98` 配置联合类型：`stdio`（`command`/`args`/`env`/`cwd`）与 `streamable-http`（`url`/`headers`），都有 `toolCallTimeoutMs`、`failOnStartupError`、`reconnect`。**没有启停、审批、鉴权、落点字段。**
  - `:154-168` 预留在 `ctx.effect` 里做，owner 取 `scopeOf(ctx) ?? ctx.root`，重名抛错。
  - `:184-187` `failOnStartupError` 为真时首连失败让插件激活失败，否则只记日志进入重连。
- 支持范围：包的对外配置面。**不支持**关于 DSH 全局权限系统的结论（见 E-8）。

## E-3 DSH 连接监督：代际、重连、预算、撤销

- 消费对象：对照表第 6、7、8、12 行；「DSH 的动作列举由连接与推送驱动……」「两源都没有同名替换件……」。
- 来源：DSH `c291e796` `src/connection.ts`；`.agents/notes/archived/feature/2026-08-06-mcp-client-auto-reconnect.md`。
- 实际观察（源码）：
  - `:40-45` 默认 `enabled true / initialDelayMs 500 / maxDelayMs 30000 / maxAttempts 10`。
  - `:47-50` 关闭一代的上限 5 000 ms（SDK stdio 传输自带两段 2 秒宽限 + 1 秒）。
  - `:161-170` 所有 `syncTools` 经一条 promise 链串行。
  - `:192-199` 重连关闭时：已建立连接丢失 → 「registered tools will fail until an HMR reload or Host restart」；从未连上 → 「no tools were registered」。
  - `:203` 连接保持超过 `maxDelayMs` 后预算重置；`:206-214` 超出 `maxAttempts` → 排队注销全部工具并记 error，停止。
  - `:238-241` 每代 `new Client({ name: 'dsh-mcp-client', version: '0.0.1' }, { capabilities: {} })`。
  - `:257-270` 注册 `ToolListChangedNotificationSchema` 处理器 → 排队重同步；拉取失败保留上一代。
  - `:288-293` 失败的一代在时限内没关掉 → 停止重连，避免两个服务端进程重叠。
  - `:325-349` `dispose`：取消定时器、关闭当前 client、等在途尝试与同步队列静止，再注销。
- 实际观察（决策记录，作者自述）：
  - 自动重连笔记 `:16` 触发只靠 `client.onclose`；HTTP 传输只在主动关闭时触发，所以 HTTP 服务端实际不在监督器重建范围内。
  - `:24` 断连期间上一代保持登记、调用失败。
  - `:34` 备选「断连立即注销、恢复再登记」被否：每次崩溃让工具清单抖两次、前缀缓存失效两次。
  - `:46` 默认策略约 2.5 分钟后放弃。
- 支持范围：该 commit 的监督行为。E2E 与单测名称见 `tests/reconnect.spec.ts`（25 个 `it`）、`tests/mcp-client.e2e.ts`（22 个）；**本轮未运行测试**。

## E-4 DSH 工具桥：登记、命名、调用、结果

- 消费对象：对照表第 2、6、9、13、15 行；「两源都把 MCP 的每个动作登记成……」「DSH 把 MCP 的错误与断连都映射成失败……」「整包直接复用……」。
- 来源：DSH `c291e796` `src/tools.ts`。
- 实际观察：
  - `:15-27` 导入：`@modelcontextprotocol/sdk` 的 `Client` 类型与 `ListToolsResultSchema`；`dsh-attachment`、`dsh-llm`（`ContentBlock`）、`dsh-tools`（`ToolDefinition`、`ToolExecution`、`ToolExecutionResult`、`assertSupportedJsonSchema`、`JsonSchemaNode`）、`dsh-util-values`、`cordis`。
  - `:73-78` `tools/list` 用 `client.request` 直发（绕开 SDK 的每页输出校验缓存）；`:81-96` `tools/call` 同样直发，带 `signal: exec.signal` 与 `timeout: opts.toolCallTimeoutMs`。
  - `:112-118` `publicToolName`：`mcp__<server>__<raw>`，非法字符替 `_`，超 64 字符截断并追加 12 位 SHA-256。
  - `:144-203` `syncTools` 两阶段：先完整分页拉取（重复动作名、重复游标即抛错，保留上一代），再注销上一代、登记新一代；登记冲突整代回滚。
  - `:254-282` 每个动作一个 `ToolDefinition`，`name/description/parameters` 直接取对端，另有 `output`、`execute`、`finalizeContent`。
  - `:322-324` 需要任务式执行的工具在调用时抛错。
  - `:353-356` 对端 `isError: true` → `throw new Error(text)`，由 DSH 注册表产出 `isError` 结果。
  - `:409-430` 图片入库前：取 `ctx.get('attachments')`，从 `exec.agent?.session.requestHeader()` 或 `exec.agent?.options` 取 provider/model，`llm.resolveModelInfo` 要求 `inputModalities` 含 `image`。
  - `:519-569` 结果投影：`text` 合并；`image` 视入库结果；`resource_link` → 「Resource link: name (uri)」；`audio`、`resource` 与未知类型 → 诊断文本。
- 支持范围：桥的行为。断连时的调用错误来自 SDK「Not connected」一说出自自动重连笔记 `:10`，**SDK 源码未核**。

## E-5 DSH 传输与子进程环境

- 消费对象：对照表第 14 行；「DSH 只覆盖 stdio 与 Streamable HTTP……」「两源都把 MCP 凭据当作……」。
- 来源：DSH `c291e796` `src/transport.ts`；`packages/subprocess/subprocess/src/index.ts`；`docs/user/guide/network-proxy.md`。
- 实际观察：
  - `transport.ts:21-23` 子进程环境 = `scrubbedParentEnv()` 再覆盖配置的 `env`；`:31-49` 只有 `StdioClientTransport` 与 `StreamableHTTPClientTransport`，后者只传 `requestInit.headers`。
  - `subprocess/src/index.ts:45` `SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i`；`:64-78` 过滤该模式与 `DSH_*` 前缀，再按代理设置补回代理变量。
  - `network-proxy.md:5`、`:60`：HTTP 形态的 MCP 走代理；作为子进程启动的 MCP 服务端继承代理变量。
  - `grep -i 'auth|oauth' src/` 无命中：包内没有 OAuth 或鉴权提供者。
- 支持范围：stdio 子进程由 SDK 拉起（`transport.ts:16-19` 注释「The MCP SDK owns the actual spawn」），DSH 不控制其落点。

## E-6 DSH 自述的范围、局限与取舍

- 消费对象：多条结论的「代价与不适用」。
- 来源：DSH `c291e796` `packages/mcp/mcp-client/README.md`；`.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.md`。来源立场：作者自述。
- 实际观察：
  - README `:12` 只桥接工具，resources 与 prompts 不支持；工具定义给每次请求加 token。
  - README `:74` 公开名稳定，所以会话历史与权限规则跨重启与重载保持；`:92` 断连期间工具仍列出但调用失败，十次后移除。
  - README `:191-196` Known Limitations：只桥接工具；启动与发现超时继承 SDK 60 秒、不可配；重连只由传输关闭触发；图片是唯一持久富结果；不支持的输出 schema 不强制；任务式工具在调用时拒绝。
  - README `:207-210` Dev Note：公开名算法是 v1 契约，改了会破坏会话历史与权限规则；HTTP 的重连归属未定；resources 需要注入决策，prompts 需要本 harness 没有的模板概念；钉住的 SDK 仍在演进。
  - 决策记录 `:17` 单包、不按能力接缝拆三包，理由是没有可预见的第二个实现；`:25` 只做客户端、只桥接工具；`:57` `serverName` 是本地配置而非对端 `serverInfo.name`；`:86` 启动期装载，HMR 热换，**不提供运行时动态 API**；`:97` `mcp__` 前缀让权限规则可写成 `mcp__*`、`mcp__github__*`；`:219` SDK 稳定性风险。
- 支持范围：作者对自己短板的陈述；**独立第三方的批评本轮没有检索**（不上网）。

## E-7 DSH 的 ACP 路径：按会话在 Agent 作用域里装载 MCP 客户端

- 消费对象：对照表第 11、12、16 行；「DSH 的连接宿主是 Cordis 插件作用域……」。
- 来源：DSH `c291e796` `packages/acp/acp/src/mcp.ts`、`packages/acp/acp/src/session.ts`。
- 实际观察：`mcp.ts:1` 「Standard ACP MCP-server declarations translated into Agent-scoped DSH MCP clients」；`:26-32` `mountAcpMcpServers` 对每个配置 `await agentCtx.plugin(McpClient, config)`；`session.ts:121` 「Compose a fresh Agent and all requested MCP clients before publication」，`:126-135`、`:159` 在 `ctx.agents.create({ sessionId, … setup })` 的 setup 里挂载。
- 支持范围：ACP 入口下 MCP 连接的宿主是这个会话新建的 Agent 作用域。**不支持**「DSH 全部入口都这样」——`cordis.yml` 全局装载是另一条路（E-2）。

## E-8 DSH 工具管线契约

- 消费对象：「整包直接复用……」；对照表第 5 行。
- 来源：DSH `c291e796` `packages/core/tools/src/index.ts`；`docs/cookbook/extension-cookbook.md`；`docs/subsystems/tools.md`。
- 实际观察：`index.ts:214-247` `ToolDefinition extends ToolSchema`：`output` 必填、`execute(args, exec)` 须转发 `exec.signal`、`finalizeContent` 同步且不得抛错、`timeoutMs` 由 `dsh-tool-call-timeout-policy` 执行；`extension-cookbook.md:9`、`:124` MCP 工具以原始 JSON Schema `ToolDefinition` 直接 `ctx.tools.register()`；`tools.md:408` MCP 的原始 schema 走线级 schema 词汇。
- 支持范围：mcp-client 产物的契约是 DSH 的 `ToolDefinition`。DSH 的 ToolGuard 权限链见[会话设计调研](../agent-harness-session-design/research.md)，本轮未重读。

## E-9 Codex rmcp-client 对象模型与生命周期

- 消费对象：对照表第 9、12 行；「Codex rmcp-client 只能作为形状参照……」「DSH 锁定的官方 SDK……」。
- 来源：Codex `5c5308fc` `codex-rs/rmcp-client/`。
- 实际观察：
  - `Cargo.toml:3` `version.workspace = true`；`:35-46` `rmcp = { workspace = true, … features = ["auth","base64","client","macros","schemars","server","transport-async-rw","transport-child-process","transport-streamable-http-client","transport-streamable-http-server"] }`；依赖 `codex-api`、`codex-config`、`codex-exec-server`、`codex-http-client`、`codex-keyring-store`、`codex-network-proxy`、`codex-protocol`、`codex-secrets`、`codex-utils-*`、`keyring`、`oauth2`。**`rmcp` 精确版本不在归档中。**
  - `src/rmcp_client.rs:130-139` `ClientState = Connecting | Ready { service, oauth } | Closed`；`:150-174` `TransportRecipe = InProcess | Stdio | StreamableHttp{…bearer_token, http_headers, env_http_headers, store_mode, auth_provider, oauth_refresh_mode…}`（配方保留以便重建传输）；`:396-405` `RmcpClient` 结构。
  - `:408-420` `with_read_only_tools` 在请求 `_meta` 里加 `openai/readOnly`（`:110`）。
  - `:628-684` `initialize`：状态机只允许 `Connecting → Ready`；`:686-704` `list_tools(params, timeout)`；`:744-802` `list_resources` / `list_resource_templates` / `read_resource`；`:804-917` `call_tool(name, arguments, meta, timeout)`：参数须为 JSON 对象；鉴权需要时返回 `isError` 结果「MCP authentication required. Reconnect to continue using this server.」（`:818`）并附 `mcp/www_authenticate`，不重放被拒调用。
  - `:1035-1057` `is_closed`、`shutdown`（置 `Closed` 并终止自有 stdio 进程）。
  - `:1361-1397` `run_service_operation`：HTTP 会话过期 404 → `reinitialize_after_session_expiry` 后对新服务重跑该操作。
  - `src/streamable_http_retry.rs:24` 重试间隔 `[250, 1000]` ms；`:36-41` 初始化重试只对 HTTP；`rmcp_client.rs:1480-1494` 操作级瞬态重试只对 `tools/list`。
  - `src/protocol_mode.rs:9-24` `McpProtocolMode = Legacy（2025-06-18）| V20260728`。
- 支持范围：客户端单体。连接管理、目录缓存、服务就绪等待在 `codex_mcp`，**不在归档**。

## E-10 Codex MCP 凭据的存与注入

- 消费对象：对照表第 16 行；「两源都把 MCP 凭据当作……」。
- 来源：Codex `5c5308fc` `rmcp-client/src/oauth.rs`；文档 `config-file_config-reference.md`。
- 实际观察：`oauth.rs:1-17` 令牌存 OS 钥匙串（macOS Keychain、Windows Credential Manager、Linux Secret Service/keyutils），不可用时退到 `CODEX_HOME/.credentials.json`；`:92` 钥匙串服务名「Codex MCP Credentials」；`:815` 回退文件名；`:1012-1030` `compute_store_key(server_name, server_url)` 以类型、URL、头（企业身份时另加 `codex_home`）算键。文档 `config-reference.md:559-604` `auth = oauth | chatgpt`、`oauth.client_id / callback_url / callback_port`、`bearer_token_env_var`、`http_headers`、`http_headers_helper`、`env_http_headers`；`:543-547` stdio `env_vars` 白名单；`:663-672` `scopes`、`oauth_resource`；`:1525-1528` `mcp_oauth_credentials_store = auto | file | keyring`。
- 支持范围：凭据归属是本机 OS 用户 + 服务名/URL；**没有租户或组织维度**（读遍上述位置未见）。

## E-11 Codex stdio 服务端进程管理

- 消费对象：对照表第 14 行；「DSH 只覆盖 stdio 与 Streamable HTTP……」。
- 来源：Codex `5c5308fc` `rmcp-client/src/stdio_server_launcher.rs`。
- 实际观察：`:1-12` 两种启动器：`LocalStdioServerLauncher`（编排进程的子进程）与 `ExecutorStdioServerLauncher`（经执行器进程 API）；`:412-428` Unix 下对进程组先 `terminate_process_group`、必要时 `kill_process_group`；`:432-440` Windows 用 Job Object；`:475-530` 终止幂等，远端进程在 drop 时也尝试终止。
- 支持范围：进程归属与终止方式。执行器的隔离性质本轮未查。

## E-12 Codex 会话层：MCP 运行时的宿主与刷新时点

- 消费对象：对照表第 6、7、10、11 行；「DSH 的动作列举由连接与推送驱动……」「DSH 的连接宿主……」。
- 来源：Codex `5c5308fc` `core/src/session/{mcp.rs,mcp_runtime.rs,mcp_refresh.rs,mcp_prewarm.rs,mod.rs}`、`core/src/mcp.rs`、`core/src/mcp_skill_dependencies.rs`。
- 实际观察：
  - `session/mcp_runtime.rs:1-5` 「Thread MCP runtime projection and publication」；`:46-53` `wait_for_mcp_server` 先 `refresh_mcp_if_dirty` 再等该服务启动；`:55-67` `prepare_mcp_call` 为一次调用捕获当前客户端与目录；`:107-149` 会话初始化装入 MCP 运行时，末尾 `validate_required_servers`。
  - `session/mcp.rs:172-…` `refresh_mcp_if_dirty`：比较当前环境选择与鉴权，变了则标脏；`:334-336` `mark_mcp_runtime_dirty`；`:339-382` `mcp_runtime_for_step`：能力根变化或 OAuth 在鉴权失败后恢复则标脏，刷新后按 `required_servers` 取绑定，拿不到则给空绑定。
  - `session/mod.rs:3782-3792` 每一步在发模型请求前 `mcp_runtime_for_step`。
  - `session/mcp_refresh.rs:7-42` 脏标记 + 单许可信号量；`session/mcp_prewarm.rs:1-4` 预热是尽力而为，「exact model steps remain the correctness path」。
  - `core/src/mcp.rs:101-107` `McpManager` 持 `McpToolCatalogCache`（实现在 `codex_mcp`，**未见**）。
  - `mcp_skill_dependencies.rs:40-…` 技能提到的 MCP 依赖缺失时，**提示安装**（选项「Install」「Continue anyway」），仅第一方客户端。
- 支持范围：运行时挂在会话上、每步检查脏标记。**不支持**「对端 `tools/list_changed` 会触发刷新」——见 E-15。

## E-13 Codex 工具暴露、命名与 resources 工具

- 消费对象：对照表第 2、10、15 行；「两源都把 MCP 的每个动作登记成……」「DSH 只桥接 tools……」。
- 来源：Codex `5c5308fc` `core/src/mcp_tool_exposure.rs`、`core/src/tools/handlers/mcp.rs`、`core/src/tools/handlers/mcp_resource_spec.rs`。
- 实际观察：`mcp_tool_exposure.rs:90-94` 开了工具搜索 → `Deferred`，否则 `Direct`；`:19-20`、`:121-141` agent 插件来源的 MCP 单个 spec 超 8 000 字节或累计超 64 000 字节 → `Hidden`；`:142` 逐个 `register_external_with_exposure`。`handlers/mcp.rs:46` 前缀 `mcp__`；`:100-117` 名字 = 命名空间 + `__` + 动作名，钩子名补 `mcp__`；`:504-509` `ToolSpec::Namespace { name: callable_namespace, tools: vec![一个函数] }`。`mcp_resource_spec.rs:24`、`:52`、`:80` 三个内建工具 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`，`server` 参数可省（跨所有服务）。
- 支持范围：暴露形状。「Deferred 走哪扇门」在 `codex_tools`，未查。

## E-14 Codex 调用与审批

- 消费对象：对照表第 5、8、9 行；「两源的授权粒度都比产品细」「两源都没有同名替换件」。
- 来源：Codex `5c5308fc` `core/src/mcp_tool_call.rs`；文档 `config-file_config-reference.md`、`agent-approvals-security.md`。
- 实际观察：`mcp_tool_call.rs:165-181` 拿不到 `prepared_call` → `notify_mcp_tool_call_skip`，文本「MCP tool `{server}/{tool_name}` is not available to the model」，以 `CallToolResult::from_result` 返回；`:225-229` 审批模式：Apps 服务按应用策略，其余按 `prepared_call.tool_approval_mode()`；`:1269-1316` 取值顺序 `tools.<tool>.approval_mode` → `default_tools_approval_mode` → 默认，插件配置同理；`:1453-1454` 「Allow」「Allow for this session」；`:2211-2226` `prompt`/`writes` 模式把「本会话允许」降成单次允许。文档 `config-reference.md:645-656` `default_tools_approval_mode` 与 `tools.<tool>.approval_mode` 取值 `auto | prompt | writes | approve`；`:634-643` `enabled_tools` 允许列表、`disabled_tools` 拒绝列表；`:657-661` 逐动作 `output_token_limit`；`agent-approvals-security.md:64` 带破坏性注解的 app/MCP 调用总要审批，除非有只读注解。
- 支持范围：审批粒度与取值。`AppToolApproval` 枚举定义在 `codex_config`，未见源码，以文档为准。

## E-15 Codex 客户端能力：通知、elicitation、sampling、MRTR

- 消费对象：对照表第 6 行；「DSH 只桥接 tools；Codex 另有……」。
- 来源：Codex `5c5308fc` `rmcp-client/src/{logging_client_handler.rs,elicitation_client_service.rs,tool_input.rs}`。
- 实际观察：`logging_client_handler.rs:41-50` `create_elicitation` 转给注入的 `send_elicitation`；`:74-92` `on_resource_updated`、`on_resource_list_changed`、`on_tool_list_changed`、`on_prompt_list_changed` **只写 info 日志**；`elicitation_client_service.rs:97-133` 按客户端能力扩展开启 OpenAI 表单与用户校验；`:196-295` 处理 `ElicitRequest` 与若干自定义请求，其余交回 `LoggingClientHandler`；`tool_input.rs:1-3` 「Drives modern tool continuations」「Session recovery cannot replay a submitted proof」；`:45` 最多 `DEFAULT_MRTR_MAX_ROUNDS` 轮；`:167-175` 把输入请求解析为 `CreateMessageRequest`（sampling）、`ElicitRequest`、`ListRootsRequest`。
- 支持范围：已检索 `rmcp-client/src` 与 `core/src` 中 `sampling|CreateMessage|prompts/list|list_prompts|get_prompt`，**未找到 sampling 或 prompts 的处理实现**；rmcp 默认 `ClientHandler` 的回应不在归档，未核。这是读数缺口，不是反例验证。

## E-16 Codex 文档：服务配置面与托管允许列表

- 消费对象：对照表第 1、3、4、10、14 行。
- 来源：Codex 文档 2026-09-20 副本 `config-file_config-reference.md`、`permissions.md`。来源立场：厂商自述。
- 实际观察：`config-reference.md:522-526` `mcp_optional_startup_grace_ms` 默认 1000，构建初始工具目录时等可选服务的共享时长；`:528-557` `command`/`args`/`env`/`env_vars`/`cwd`/`url`；`:606-615` `enabled`、`required`（起不来则启动/恢复失败）；`:617-632` `startup_timeout_sec` 默认 10 s、`tool_timeout_sec` 默认 60 s；`:675-678` `experimental_environment = local | remote`（remote 只对 stdio，HTTP 远端未实现）；`:2480-2484` 托管 `mcp_servers` 是允许列表，**name 与 identity 都须匹配**；`:2486-2545` identity 按 `command`（executable、args 匹配式）或 `url`（match/value/expression）；`:1458-1482` 插件自带 MCP 服务同样的启停、允许/拒绝列表与审批项。`permissions.md:481-483` MCP 服务端用各自的进程或传输，受 `mcp_servers` 与托管允许列表控制。
- 支持范围：文档声明。与源码的一致性只在 E-14 的审批取值顺序上核对过。

## 对照输入（产品正文，非来源证据）

均为 HUB `.worktrees/assets-runtimes` 在 commit `cdff9e57f926aa77ec47ec61e625f6d79aef2833` 时的正文：

| 条款 | 位置与 rev |
|---|---|
| MCP 定义、身份、属性、对端漂移 | [PF-002 §4 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 10，`design.md:136-153`） |
| 多命令 tool 一个槽位 | [PF-002 §4 Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 10）；[PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（rev 14） |
| 组合矩阵（Skill 不组合 MCP） | [PF-002 §4 谁能组合谁](../../design/product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)（rev 10） |
| 可用性、替换件、依赖、绑会话、模态、宿主 | [PF-006 §6.2–§6.5、§6.11、§6.12、§5.5](../../design/product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)（rev 14） |
| 放行四步，MCP 走接入点那份执行权限 | [PF-007 §5.6](../../design/product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 16） |
| 落点不可用即拒绝 | [PF-005 §6.9](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)（rev 5） |
| I-3、I-4 | [PF-004 §6.1](../../design/product/PF-004-agent-definition-and-assembly/design.md#61-不变式)（rev 9） |
| MCP 词条；「裸写凭据不作数」 | [UL-mcp](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp)、[UL-model-credential](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) |
| 工具协议归本项目自定 | [SYS-KERNEL](../../design/foundation/cross-system-constraints/requirements.md#sys-kernel) |

上游升级时，grep 本文件里的 `c291e796`、`5c5308fc`、`1.29.0`、`2026-09-20` 找需要重核的记录。

## 第二轮：同行封装的借鉴与依赖（2026-09-23）

消费对象：research.md「[第二轮：同行封装的借鉴与依赖](research.md#第二轮同行封装的借鉴与依赖)」各条；逐源与逐主题论证在
[第二轮报告](reports/2026-09-23-round2-wrapper-lessons.md)。全部为**源码、清单、文档、CHANGELOG 与 issue 阅读，没有运行**任何代码或测试。

### 第二轮取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 来源立场 |
|---|---|---|---|
| DSH | 同首轮 `c291e796` | 主检出 `tmp/sources/extracted/dsh/` | 作者自述（`.agents/notes/`）+ 源码 + 测试名 |
| pi | `earendil-works/pi` `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（`pi-coding-agent@0.86.1`） | 主检出 `tmp/sources/pi-3390bd9.tar.gz` → `extracted/pi/` | 作者自述 + 源码 |
| pi-mcp-adapter | npm `pi-mcp-adapter@2.37.0`，tarball sha256 `41c281a3a19fb4aec08036a8d91682d77adf1df1c02032dc3221ab739ae1859f`；GitHub `nicobailon/pi-mcp-adapter` | `npm pack`；issue 列表经 WebFetch 摘要 | **第三方**（非 pi 作者）源码 + README + CHANGELOG |
| Codex（补件） | `openai/codex` **同一 commit** `5c5308fc9a9ee789049d646ef11e5400384b9c6f`（2026-09-20T03:02:48Z）的 `codex-rs/codex-mcp`、`config`、`protocol`、`utils/output-truncation` 与 workspace `Cargo.toml` / `Cargo.lock` | `git fetch --depth 1 origin <SHA>` + sparse checkout；与主检出归档的 `rmcp-client`、`core/src` 逐文件 diff 无差异 | 源码（一手）+ issue（`gh search issues`） |
| LangChain Python | `langchain-ai/langchain-mcp-adapters` `52a4535f3eb4b98f386836e4d9b8c4cadf99afca`（2026-09-10，0.3.2）；仓库已归档（`isArchived: true`） | `git clone --depth 1` | 源码 + issue；继任 `langchain-ai/langchain` `c36e3f826fb7b66c746b8235ef83ab3910dd32be` 只做轮廓 |
| LangChain JS | `langchain-ai/langchainjs` `12626c25a9acdd72d2c8a68788479440916d38a1`（2026-09-23），包目录最后提交 `b0a0d3f73608674818e4ad6c12adde622c90afa5`；npm `@langchain/mcp-adapters@1.1.4` | GitHub API 按 SHA 取该包 40 个文件 | 源码 + CHANGELOG + issue |
| OpenAI Agents | Python `openai/openai-agents-python` `32edd3c3ecde37a7fb6bf4b082f35f1d8f7f086b`（2026-09-22，0.22.3）；JS `openai/openai-agents-js` `a0b1c6fd8e15703d3fb37c3de6f90f08400c6700`（0.18.0，grep 级） | `git clone --depth 1` | 源码 + 仓库内 `docs/` + issue |
| Vercel AI SDK | `vercel/ai` `21b2d6c3658bb397014bbcac4e7108468ce1f9e4`（2026-09-23T08:29:45Z），`@ai-sdk/mcp` 2.0.56；npm `ai` 7.0.112 | `gh api` 取树，按 SHA 下载 raw 文件（磁盘不足以克隆） | 源码 + 仓库内 `content/` 文档 + CHANGELOG + issue |
| Claude Agent SDK | Python `anthropics/claude-agent-sdk-python` `dce7cdac8276c004e08f4d94acffbf85dfbbd116`（0.2.158）；npm `@anthropic-ai/claude-agent-sdk@0.3.280`（`claudeCodeVersion` 2.1.280）；TS 仓库 `58d2e4b81bdca2c6ce10e6e5db22ad7acdc1d58c`（只有 CHANGELOG） | `git clone --depth 1`；`npm pack`，只读 `.d.ts` 与 `package.json` | 源码（Python）/ 类型声明与 CHANGELOG（TS） |
| Claude Code | 本机 `2.1.280`；`anthropics/claude-code` `56f36532530f88b572854538d685fcf781141e8c` 的 `CHANGELOG.md`；code.claude.com `docs/en/{mcp,agent-sdk/mcp,managed-mcp,permissions,env-vars}.md` | `git clone --depth 1`；`curl` 文档 `.md`，2026-09-23 | **厂商自述**；本体闭源 |
| 官方 SDK 发布事实 | npm registry `@modelcontextprotocol/{sdk,client,core}` | `npm view`，2026-09-23 | 注册表元数据，**不含包内容** |

远程源的本地副本放在取证会话的 scratchpad，会被清理；复核按上表 SHA / 版本重新取得。

## E-17 DSH 决策记录里的取舍与坑（补首轮）

- 消费对象：第二轮「名字」「翻页守卫」「多段文本」「出站代理」各条。
- 来源：DSH `c291e796` `.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.md`；`.agents/notes/implemented/architecture/2026-08-27-outbound-proxy-policy.md`；
  `.agents/notes/implemented/feature/2026-08-22-standard-acp-automation-controls.md`；`packages/mcp/mcp-client/{src/tools.ts,tests/*.ts}`；`packages/util/http-proxy/package.json`；
  `packages/subagent/subagent-claude-code/package.json`；`pnpm-lock.yaml`。来源立场：作者自述 + 源码。
- 实际观察：
  - 插件记录「Tool discovery and registration」：每次同步拒绝重复的非空续页游标并保留上一代，「This detects repeated cursors; it does not bound a server that continually returns distinct cursors」；
    `src/tools.ts:153-182` 以 `seenCursors` 实现。引用的失败报告 `deepseek-harness/discussions/3660` **未打开**。
  - 同记录「Tool discovery and registration」「Name conflict handling」：列八个多服务端客户端的限定名链接；引微软研究院 1,470 个服务端中 775 个撞名、`search` 出现在 32 个；
    「Alternatives considered → Raw model-facing tool names with an optional `toolPrefix`」记原前提为假与装载顺序依赖。
  - 同记录「Preserve multiple TextBlocks」：`flattenText()` 用 `join('')`，多段文本丢边界。
  - 同记录「Replace the canonical MCP result with core ContentBlock[]」：规范值与投影分开的理由。
  - 同记录「Auto-reconnect with exponential backoff」：原先拒绝，「Operational feedback reversed the deferral」。
  - 同记录「Consequences」：「a misbehaving MCP server that ignores signals could wedge dispose」。
  - `tests/reconnect.spec.ts:140-516`：25 个 `it` 名（逐条见第二轮报告 §二 DSH）；`tests/` 各文件 `it(` 计数：`mcp-client.spec.ts` 57、`apply.spec.ts` 23、`mcp-client.e2e.ts` 22。
  - 出站代理记录 `:9`：Node `fetch` 不读 `HTTP_PROXY`，MCP over HTTP 等静默直连；`:47`：`NODE_USE_ENV_PROXY` 下 `socks4://` 等值让 Node 子进程（含 MCP 服务端）在第一行前退出，Node 24.17 实测；
    `:57`：每个调用点一条 egress 测试，含 MCP over HTTP（`tests/egress.spec.ts`）。`packages/util/http-proxy/package.json:32-33` `undici ^8.10.0`。
  - ACP 记录「Standard MCP mapping」：发布前校验与首连失败回滚。
  - `subagent-claude-code/package.json:48` `@modelcontextprotocol/sdk ^1.29.0`；`pnpm-lock.yaml:11587-11590` 为 `@anthropic-ai/claude-agent-sdk@0.3.263` 的 peer；该包 `src/` 无 `modelcontextprotocol` 引用。
- 支持范围：作者自述与源码结构。**测试未运行**。

## E-18 pi 本体：不做 MCP，只有扩展点

- 消费对象：第二轮「pi 本体不含 MCP 客户端」。
- 来源：pi `3390bd9`。命令：`grep -rIil 'mcp|modelcontextprotocol' --exclude-dir=node_modules`，逐个命中文件看上下文。
- 实际观察：
  - `packages/coding-agent/README.md:397` 扩展能力清单「MCP server integration」；`:501`「**No MCP.** Build CLI tools with READMEs … or build an extension that adds MCP support」。
  - `packages/coding-agent/docs/usage.md:310`「intentionally does not include built-in MCP」。
  - `packages/coding-agent/test/settings-manager-bug.test.ts:45-53` 夹具包名 `npm:pi-mcp-adapter`；`packages/ai/src/auth/oauth/anthropic.ts:37` OAuth scope 字符串含 `user:mcp_servers`；
    `packages/agent/docs/pico/v3/view-and-events.md:349` 对照 Codex 的 `McpToolCall` 条目。
  - `package-lock.json:1200-1206` 与 `packages/coding-agent/npm-shrinkwrap.json:932-938`：`@google/genai@2.21.0` 对 `@modelcontextprotocol/sdk ^1.25.2` 的**可选 peer**。
  - `packages/coding-agent/src/utils/tool-result-images.ts:11-19` 注释（「tools that produce images themselves (extensions, MCP bridges, screenshot tools) … Oversized images make the provider reject the whole conversation」）；`:40-46` 处理失败保留原块；
    调用点 `src/core/agent-session.ts:544-548`，在扩展 `tool_result` 钩子之后。
  - `docs/extensions.md:1408-1410` `pi.registerTool()` 启动后可调、同会话立即可见；`:1716-1732` `setActiveTools`；`:2404-2406` 工具集增量追加与缓存前缀失效。
- 支持范围：**读遍命中，无 MCP 客户端实现**。`pi-mcp-adapter` 只作为包名出现，其实现见 E-19。

## E-19 pi-mcp-adapter 2.37.0（第三方）

- 消费对象：第二轮「SDK 大版本」「持久清单」「重连」「暴露面」「审批」各条。
- 来源：npm tarball（sha256 见总览）解包后的 `package/`；路径相对之。来源立场：第三方作者源码与自述。
- 实际观察：
  - 依赖：`package.json:170-186` dependencies（`@modelcontextprotocol/client` 2.0.0、`core` 2.0.0、`ext-apps ^1.2.2`、`ext-tasks ^0.1.0`、`@napi-rs/keyring ^1.3.0`、`@typesafe-ai/sdk 0.6.0`、`ajv ^8.17.1`、`ajv-formats ^3.0.1`、`cross-spawn ^7.0.6`、`open ^10.2.0`、`recheck 4.6.0-beta.3`、`smol-toml ^1.6.1`、`strip-json-comments ^5.0.3`、`undici ^6.28.1`、`zod`）；`:187-203` peer（pi-ai、pi-tui、typebox 可选）；`CHANGELOG.md:419`（2.21.0 去掉对旧 `@modelcontextprotocol/sdk` peer 的要求）。
  - 暴露：`README.md:13-17` 代理工具动机；`index.ts:1781-1807` 注册 `mcp`；`direct-tool-surface.ts:195-201` 描述字节稳定；`:72-193` 直接工具取自缓存。
  - 连接：`init.ts:285-332` 首次运行连全部填缓存；`lifecycle.ts:98-153` 30 s 健康检查、空闲 10 min 断开；`failure-backoff.ts:3` 60 s；`server-manager.ts:929-1010`（注释 `:947-949`）替代连接先建后发布、失败候选不拆最后可用路由；
    `session-recovery.ts:5-58`、`:93-157` 会话过期判定与一次重试；`server-manager.ts:1950-1963` 只调 `client.close()`；`README.md:1011` 跨 pi 进程不共享服务端。
  - 缓存：`metadata-cache.ts:37`（7 天）、`:41-43`（位置）、`:59-82`（读合并写、pid 临时文件、rename）、`:84-139`（配置指纹与失效）；`README.md:459`。
  - 名字：`types.ts:825-857`（合法化与前缀）、`:532-556`（命名空间代理名 59 字符截断）、`:869-889`（冲突各方全部丢弃）。
  - 输出：`mcp-output-guard.ts:5-16`、`:104-108`、`:144-176`（50 KiB / 2000 行、临时文件 0600、图片不限）；`tool-registrar.ts:10-14`、`:133-174`、`:236-247`。
  - elicitation / sampling / roots：`elicitation-handler.ts:47-88`、`:311-353`；`sampling-handler.ts:42-88`、`:162-221`；`README.md:367`（roots 未实现）。
  - 鉴权：`mcp-auth.ts:23-42`（凭据库、Windows 分块）；`README.md:435`（不退回明文）；`server-manager.ts:1555-1557`（绑定源的头不交给 SDK `requestInit`）；`mcp-oauth-provider.ts:733-744`（作废只在本 provider 内）。
  - 审批：`session-approvals.ts:40-76`（定义哈希 + 参数哈希）。错误：`error-signal.ts:3-32`、`proxy-modes.ts:1161-1727`。
  - CHANGELOG（行号）：`:875`（2.0.0 孤儿进程）、`:792`（2.2.2）、`:576`、`:584`、`:572`（2.12.0）、`:502`（2.15.0）、`:311`、`:319`（2.27.0）、`:274`（2.28.0）、`:173`（2.33.0，OAuth 请求无超时，#485）、`:124`（2.34.0，`ttlMs: 0`）。
  - issue（WebFetch 列表摘要，未逐条打开）：#485、#561、#569、#577、#641。
- 支持范围：静态阅读；`ext-apps` 运行时用法未核（推测打进 UI bundle）。

## E-20 Codex `codex-mcp` 连接集、目录缓存、名字、投影（补首轮缺件）

- 消费对象：第二轮「未就绪服务端的动作」「持久清单」「分页」「名字」「结果投影」「stdio 无自动重启」「`rmcp` 版本」各条；首轮 research「未知与下一项证据」第 2 行。
- 来源：`openai/codex` `5c5308fc`（远程取回，见总览）。路径相对 `codex-rs/`。
- 实际观察：
  - 版本：`Cargo.toml:434` `rmcp = { version = "=3.2.0", default-features = false }`；`Cargo.lock:13054` rmcp 3.2.0；`:10700` oauth2 5.0.0；`:14765` sse-stream 0.2.5；`:9771` keyring 3.6.3；`:12899`、`:12950` reqwest 0.12.28 与 0.13.4。
  - 启动：`codex-mcp/src/rmcp_client.rs:103-104` `DEFAULT_STARTUP_TIMEOUT = 30s`、`DEFAULT_TOOL_TIMEOUT = 300s`（兜底于 `connection_manager.rs:336-343`）；`connection_manager.rs:254`、`:752-812` 并发启动；
    `connection_manager/required.rs:15-59` 与 `core/src/session/mcp_runtime.rs:148` required 失败会话失败；`connection_manager/tool_catalog.rs:215-281` 可选宽限，截止时间写入缓存条目 `tool_catalog_cache.rs:133-161`。
  - 未就绪服务端：`connection_manager/tool_catalog.rs:285-332`、`:338-371`（三种情形）；`:316-320` 清空只读注解；`core/src/tools/handlers/mcp.rs:285-291` 调用前等就绪；`core/src/mcp_tool_call.rs:165-183`「not available」。
  - 目录缓存：`codex-mcp/src/tool_catalog_cache.rs:32-49`（LRU 32、TTL 30 min）、`:227-403`（键与指纹，含环境变量值哈希）、`:307-320`、`:368-373`（不缓存情形）、`:124-131`、`:184-218`（失效与代次）；
    `rmcp_client.rs:97-98`、`:968-980`（`codex/tool-catalog-cache {cacheable:false}`）。
  - `list_changed`：`rmcp-client/src/logging_client_handler.rs:86-88` 只写日志；在 `codex-mcp`、`rmcp-client`、`core/src` grep `list_changed|ListChanged` 无其他生产代码命中。
  - 分页：`codex-mcp/src/rmcp_client.rs:673-676` Legacy 模式 `next_cursor` 恒为 `None`（本轮执行者复读确认；`rmcp-client` 的 `list_tools_with_connector_ids` 不在内部翻页，`rmcp-client/src/rmcp_client.rs:706-734`）；
    `core/src/config/mod.rs:1836-1842` 默认 Legacy；`codex-mcp/src/pagination.rs:9-80` 翻页守卫。
  - 名字：`codex-mcp/src/mcp/mod.rs:565-580` 合法化；`codex-mcp/src/tools.rs:113-316` 长度 128、SHA1 12 位、冲突处理。
  - 投影：`protocol/src/models.rs:2301-2336`（structuredContent 非空时只输出它）、`:2343-2443`（逐类映射）；`core/src/mcp_tool_call.rs:936-973`（不支持模态换占位）；`utils/output-truncation/src/lib.rs:115-203`（图片不计入预算）。
  - stdio 退出：`rmcp-client/src/rmcp_client.rs:1035-1044` `is_closed`；`connection_manager.rs:105-107` 下次发布才新建；13 处 `mark_mcp_runtime_dirty()` 调用点均非连接关闭；`connection_manager/tool_catalog.rs:295` 不检查已关闭。
  - TODO：`codex-mcp/src/rmcp_client.rs:1144`、`rmcp-client/src/oauth/refresh_transaction.rs:240-243`、`:363-364`、`rmcp-client/src/http_headers.rs:263`。
  - issue（`gh search issues`，2026-09-23）：#10105（及 #33266、#35583、#37417、#43642）、#29321、#22072、#46188、#39990、#39149、#31499、#41133、#45944。
- 支持范围：连接集、缓存、名字与投影的源码。**`rmcp 3.2.0` 源码未取得**；`connection_manager/resources.rs`、elicitation 相关文件与测试未读。
  与首轮 E-16 文档默认值（启动 10 s、调用 60 s，`config-file_config-reference.md:617-632`）不一致，本轮未判哪边是运行时行为。

## E-21 Codex `rmcp-client` 的 stdio 与 HTTP 防护（本地归档补读）

- 消费对象：第二轮「stdio 子进程治理」「鉴权与凭据」。
- 来源：主检出 `tmp/sources/extracted/codex/codex-rs/rmcp-client/src/`（`5c5308fc`）。
- 实际观察：`bounded_stdio_transport.rs:21-22`、`local_stdio_transport.rs:22` `MAX_MCP_STDIO_LINE_BYTES = 8 MiB`，`bounded_stdio_transport.rs:65` 超限关传输；
  `local_stdio_transport.rs:29-34` Legacy 与 2026-07-28 两种帧；`stdio_server_launcher.rs:215-219` 进程组 2 s 宽限与 stderr 250 ms 排空宽限、`:244`（逃逸后代占着 stderr）、`:351-378` stderr 进日志；
  `utils.rs:21-46`、`:163-175` 默认环境变量白名单 11 个；`program_resolver.rs:1-17` Windows 脚本解析；`http_client_redirect.rs:1-5`、`:23` 只跟同源重定向、至多 10 次。
- 支持范围：源码结构，未运行。

## E-22 LangChain Python `langchain-mcp-adapters` 0.3.2

- 消费对象：第二轮「SDK 大版本」「部分失败」「名字」「结果投影」「错误」。
- 来源：`52a4535f`，路径相对仓库根。
- 实际观察：`README.md:3-11` 不再维护、迁往 `langchain.mcp`；`pyproject.toml:10-21` 依赖（`mcp>=1.24.0,<2.0.0`）；`uv.lock:726-727` mcp 1.28.1；
  `client.py:173-175`、`tools.py:460-487` 每次调用新建会话；`client.py:198-216`（`gather` 无 `return_exceptions`）与 `:276-298`（`get_server_info` 带）；`tools.py:458-487` 绕 SDK 吞异常的注释；
  `tools.py:320-354` 分页（上限 1000）；`tools.py:515-518` 前缀；`tools.py:175-283` 投影（`:197-202` audio `NotImplementedError`）；`tools.py:99-158` `isError` 处理；`callbacks.py:28-141` 回调；
  `sessions.py:53-57`、`:344-356` 传输超时。issue：#75、#99、#258、#298、#314、#466、#492、#551、#589（mcp 2.0 导入即失败）、#605。
  继任 `langchain` `c36e3f82` `libs/langchain_v1/pyproject.toml:51` `fastmcp>=4.0.1,<5.0.0`；`libs/langchain_v1/langchain/mcp/adapter.py:146-157` elicitation 用 `interrupt()`。
- 支持范围：源码；大批 issue 于 2026-09-16 以 superseded 批量关闭，**关闭 ≠ HEAD 已修**（#492、#551 对应代码 HEAD 未改）。

## E-23 LangChain JS `@langchain/mcp-adapters` 1.1.4

- 消费对象：第二轮「连接池」「超时」「错误」「schema 简化」。
- 来源：langchainjs `12626c25` 的 `libs/langchain-mcp-adapters/`。
- 实际观察：`package.json` 依赖 `@modelcontextprotocol/sdk ^1.30.0`、`debug ^4.4.3`、`zod`，peer `@langchain/core ^1.0.0`、`@langchain/langgraph ^1.4.13`，可选 `extended-eventsource ^2.1.0`（`src/` 未引用），`node >=20.10.0`；
  `src/connection.ts:83-93`、`:231-238`、`:576-593` 连接池与键；`src/client.ts:247` 串行初始化；`:714-758`、`:924-994`、`:1030-1118` 重连；`src/connection.ts:449-462` SDK 重连选项映射；
  `src/tools.ts:1010-1018` 超时读取；`:1211-1220` 分页；`src/connection.ts:222-229` `list_changed` 只转回调；`src/tools.ts:299-475`、`:1250-1256` schema 简化并用于运行时校验；
  `:837-845`、`:1164-1175` 错误包装丢 cause；`src/connection.ts:127-131` 未声明客户端能力。issue：#10825、#9136、#9560、#11083、#11300、#11302、#10905、#8805。
- 支持范围：源码；下游 LangGraph 对 `ToolException` 的处理未核。

## E-24 OpenAI Agents SDK

- 消费对象：第二轮「SDK 大版本」「超时」「重连（隔离会话重试）」「名字」「结果投影」「错误」「凭据脱敏」。
- 来源：Python `32edd3c3`，路径相对仓库根；JS `a0b1c6fd` 相对 `packages/agents-core/`。
- 实际观察：`pyproject.toml:16-22` `mcp>=1.19.0,<3` 与传递依赖安全下限；`src/agents/mcp/_compat.py:21-31`、`:101-130` 版本分支；
  `src/agents/mcp/server.py:1934`、`:2084`、`:2262` 读超时默认 5、`:137-161` 0 的语义；`:884-891`、`:1254-1274` 重试；`:2430-2628` Streamable HTTP 隔离会话重试调用（`:2525-2528` 计两次预算）；
  `:988-992`、`:2355` 请求串行；`src/agents/mcp/manager.py:192-202`、`:409-441` 失败处理；`server.py:1463-1464`、`:1115-1117` 缓存；`src/agents/run_loop.py:2124`、`:2465` 每轮列举；
  `server.py:1504-1519` 分页失败不留部分结果；`src/agents/mcp/util.py:317-339` 同名抛错、`:425-515` 前缀与截断；`:789-820` 投影；`src/agents/tool.py:1975-1980` 默认失败文本；
  `src/agents/mcp/_logging.py:14-45` 脱敏；`server.py:1843-1878` cancel scope 注释。JS `package.json:130-132` `@modelcontextprotocol/client ^2.0.0` 可选依赖；`src/shims/mcp-server/node.ts:263-278`、`:1297-1531` 自动重连与「listing became stale」。
  issue：#464、#1167、#1024、#4016、#4017、#4334、#5054、#840、#1288、#1404。
- 支持范围：Python 通读 MCP 模块；JS grep 级。官方 `mcp` 包在未设回调时的默认行为未核。

## E-25 Vercel `@ai-sdk/mcp` 2.0.56

- 消费对象：第二轮「协议层自写」「挂起请求」「取消」「错误」「重定向」。
- 来源：`vercel/ai` `21b2d6c3`，路径相对 `packages/mcp/`（文档相对仓库根）。
- 实际观察：`package.json:44-65` 依赖与 Node ≥ 22，无官方 SDK；`src/tool/json-rpc-message.ts:7-62` 自写 JSON-RPC；`src/tool/types.ts:5-13` 协议版本常量；
  `src/tool/mcp-transport.ts:197-208` 鸭子类型接受外部 transport、`:127-133` `redirect:'error'`；`src/tool/mcp-client.ts:1510-1523` 断连收掉挂起请求、`:812-845` 取消与超时清理、`:1546-1552` 迟到响应抛错、
  `:467-478` 通知一律 `Unsupported message type`、`:1164-1182` 每次列举拉全、`:1297` 原名作键、`:1251-1271` `isError` 原样返回、`:209-239` 模型投影、`:1440-1449` sampling/roots `-32601`；
  `src/error/mcp-client-error.ts` 单一错误类；`src/tool/mcp-stdio/get-environment.ts` 环境白名单；`src/tool/mcp-http-transport.ts:414-419`、`src/tool/mcp-sse-transport.ts:192-247`、`src/tool/mcp-stdio/mcp-stdio-transport.ts:101-122`（三条推断的出处）。
  文档 `content/docs/03-ai-sdk-core/16-mcp-tools.mdx:20`、`:170-179`、`:292-296`、`:361-364`、`:648-690`；cookbook `content/cookbook/05-node/54-mcp-tools.mdx:74-80`。
  `packages/mcp/CHANGELOG.md:299`、`:398`、`:1246`、`:1264`。issue：#16580、#18075、#8189、#14693、#12025、#20171、#19157。
- 支持范围：源码与仓库内文档；测试未读、未运行；三条标「推断」。

## E-26 Claude Agent SDK

- 消费对象：第二轮「SDK 大版本」「取消」「elicitation」「运行时控制」。
- 来源：Python `dce7cdac`（路径相对仓库根）；npm 0.3.280 解包 `package/`。
- 实际观察：Python `pyproject.toml:28-34` 依赖（`mcp>=1.23.0,<3.0.0`、`jsonschema`、`anyio`、`sniffio`）与 `CHANGELOG.md:118`、`:451`、`:560`、`:678` 的 mcp 范围演变；
  `src/claude_agent_sdk/_internal/_mcp_compat.py:17`（版本分支只在本模块）、`:98-109`（1.x 只对自建服务端发取消）；`_internal/sdk_mcp_bridge.py:15-21`、`:198-245`（通知丢弃、反向请求 `-32601`、握手后死亡不恢复）；
  `_internal/query.py:573-591` 控制通道路由；`src/claude_agent_sdk/__init__.py:433-442` `maxResultSizeChars` 走 `_meta`、`:451-488` 投影。
  TS：`package.json` 无 dependencies、peer `@modelcontextprotocol/sdk ^1.29.0`；`sdk.d.ts:1165-1210` `McpServerStatus.source`、`:3051` `setMcpServers`、`:4274-4300` `sdkMcpServerManifests`、`:1664-1672` elicitation 默认 decline；
  TS CHANGELOG（仓库 `58d2e4b8`）`:168-169`（`foo` / `foo__bar`）、`:733`（后台连接破坏性变更）、`:944`（子进程未清理）。
- 支持范围：Python 源码；TS 只到类型与清单，`sdk.mjs` 未反编译。

## E-27 Claude Code 文档与 CHANGELOG

- 消费对象：第二轮「超时」「挂起」「重连」「list_changed」「发现缓存」「结果投影」「权限」「鉴权」各条。
- 来源：code.claude.com 文档 `.md`（2026-09-23 抓取，自称到 2.1.280）；`anthropics/claude-code` `56f36532` `CHANGELOG.md`。来源立场：**厂商自述**，实现闭源。
- 实际观察：`mcp.md:321-342` v1/v2 两套运行时；`:344-357` `list_changed`；`:359-388` 重连与重试分类；`:264-275` 发现缓存；`:411-435` 超时、空闲超时、转后台；
  `:498` 插件命名与字符替换；`:594-606` 作用域去重；`:1254-1291` 输出上限与写盘；`:1293-1319` schema 合法化；`:1321-1347` `requiresUserInteraction`；`:938-1027` `headersHelper`；`:730-936` OAuth；`:117` roots；
  `env-vars.md:456-468` 连接批量与超时变量；`permissions.md:183-199`、`:478-486` 规则形状；`managed-mcp.md:238-330` 允许/拒绝列表与 `type:"sdk"` 例外。
  CHANGELOG 行：`:5880`（2.1.9）、`:5832`（2.1.15）、`:4329`（2.1.105）、`:4244`（2.1.110）、`:2735`（2.1.187）、`:4164`（2.1.113）、`:3690`（2.1.136）、`:2438`（2.1.206）、`:2103`（2.1.217）、
  `:4425`（2.1.98）、`:6398`（2.0.31）、`:1998`（2.1.221）、`:525`（2.1.271）、`:2212`（2.1.214）、`:3845`（2.1.128）、`:2381`（2.1.208）、`:4462`（2.1.97）、`:3523`（2.1.142）、`:3088`（2.1.162）、`:2671`（2.1.195）。
  文档、SDK MCP 页、env-vars 页与 CHANGELOG 全文 grep `sampling` 均 0 命中。
- 支持范围：厂商对自身行为的陈述；与实现一致性无法核对。

## E-28 官方 SDK 各包的注册表事实

- 消费对象：第二轮「SDK 大版本」。
- 来源：npm registry，`npm view`，2026-09-23。
- 实际观察：`@modelcontextprotocol/sdk` latest `1.30.0`，`time["1.29.0"] = 2026-03-30T16:50:42Z`，`time["1.30.0"] = 2026-07-27T17:56:01Z`；
  `@modelcontextprotocol/client` latest `2.0.0`，包创建于 2026-04-01，`time["2.0.0"] = 2026-07-27T23:55:22Z`，dependencies `@modelcontextprotocol/core 2.0.0`、`zod ^4.2.0`、`jose ^6.1.3`、`cross-spawn ^7.0.5`、`eventsource ^3.0.2`、`eventsource-parser ^3.0.0`、`pkce-challenge ^5.0.0`；
  `@modelcontextprotocol/core` latest `2.0.0`，包创建于 2026-06-25。
- 支持范围：版本与发布时间。**不支持**任何关于包内能力（协议版本、自定义传输、elicitation 处理器）的结论——包内容未取。

第二轮上游升级时，grep 本文件里的 `52a4535f`、`12626c25`、`32edd3c3`、`21b2d6c3`、`dce7cdac`、`56f36532`、`2.37.0`、`=3.2.0`、`2.0.0` 找需要重核的记录。
