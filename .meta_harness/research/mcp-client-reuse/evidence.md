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
