# 第二轮：同行在 MCP 客户端之上额外封装了什么、踩过什么坑、带进来哪些依赖（2026-09-23）

**取代状态：** 当前有效，未被取代。首轮报告 [2026-09-23-mcp-client-reuse.md](2026-09-23-mcp-client-reuse.md) 仍有效，本轮不改写它。

- 执行者与日期：assets-runtimes 一程的调研执行者（只读），2026-09-23。远程源由五个只读取证子任务分头取得，笔记由本轮执行者逐条回读后落盘；
  每条观察的 `路径:行号` 在 [证据记录](../evidence.md) E-17～E-28。
- 调查范围：产品负责人 2026-09-23 裁定 MCP 客户端走「官方 SDK 上自写薄桥」（提案
  mcp-client-adoption，候选 C），并要求
  「看 dsh、pi、langchain 等它们自己额外封装的东西里面，有没有哪些是我们可以借鉴的（同样是以避免踩坑、少走弯路为目的，以及它们用的额外的技术栈或者依赖）」。
  本轮回答：**同行在 SDK 之上加了哪些层；每一层他们自己记下了什么坑；带进来什么依赖**。
  **不在范围**：推荐采用哪一种做法（归提案与决定）；`design_legacy/`；官方 SDK 发布包本身的能力取证（提案「最小区分调查」第 1 项，另轮做）。
- 输入与方法：
  - 本机钉住源（主检出 `tmp/sources/extracted/`）：DSH `c291e796`、pi `3390bd9`、Codex `5c5308fc`（只含 `rmcp-client`、`core/src`）。
  - 远程源，全部记精确 commit 或 npm 发布版本：Codex **同一 commit** `5c5308fc` 的 `codex-rs/codex-mcp` 与 workspace 清单（补首轮缺件）；
    LangChain Python `52a4535f`（0.3.2）与 JS（langchainjs `12626c25`，`@langchain/mcp-adapters` 1.1.4）；
    OpenAI Agents Python `32edd3c3`（0.22.3）与 JS `a0b1c6fd`（0.18.0，只作对照）；Vercel `vercel/ai` `21b2d6c3`（`@ai-sdk/mcp` 2.0.56）；
    Claude Agent SDK Python `dce7cdac`（0.2.158）、npm `@anthropic-ai/claude-agent-sdk` 0.3.280（只读 `.d.ts` 与清单）、
    `anthropics/claude-code` `CHANGELOG.md` @ `56f36532`、code.claude.com 文档五页（2026-09-23 抓取）；
    pi 生态第三方扩展 `pi-mcp-adapter@2.37.0`（npm tarball，sha256 `41c281a3a19fb4aec08036a8d91682d77adf1df1c02032dc3221ab739ae1859f`）；
    npm registry 上官方 SDK 各包的版本与发布时间。
  - 全部是**源码、清单、文档与 issue/CHANGELOG 阅读，没有运行任何代码或测试**。标「推断」的是读代码推出、未经运行的结论。
  - 远程源的本地副本在本会话 scratchpad，会被清理；复核请按上面的 commit / 版本重新取得。
- 处置的既有结论：首轮全部结论**不改写**。首轮两项「待核实」本轮拿到了答案（Codex `rmcp` 精确版本；Codex 未就绪服务的动作是否进目录），
  以新增结论的形式写在 research.md 第二轮一节，见 [changelog](../changelog.md) rev 1。

## 一、取证对象与来源立场

| 来源 | 精确对象 | 在 SDK 之上是什么 | 来源立场 |
|---|---|---|---|
| DSH | `c291e796`，`@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` | 官方 TS SDK 1.x 上的 Cordis 插件；首轮已读源码，本轮补读决策记录的取舍与测试清单 | 作者自述 + 源码 |
| pi | `3390bd9`，`pi-coding-agent@0.86.1` | **本体不做 MCP**；只提供扩展点 | 作者自述 + 源码 |
| pi-mcp-adapter | npm `2.37.0`（作者 Nico Bailon，**非 pi 作者**） | 官方 **v2 拆分包** `@modelcontextprotocol/client` 2.0.0 上的 pi 扩展，约 3.2 万行 | 第三方源码 + CHANGELOG + README |
| Codex | `5c5308fc`：本地 `rmcp-client` + 远程同 commit `codex-mcp` 与 `Cargo.lock` | 官方 Rust SDK `rmcp` `=3.2.0` 上的客户端与连接集 | 源码（一手）+ issue |
| LangChain Python | `langchain-mcp-adapters` `52a4535f`（0.3.2）；**仓库已归档**，继任为 `langchain.mcp`（beta，FastMCP） | 官方 Python SDK `mcp` 1.x 上的 LangChain 工具适配 | 源码 + issue（2026-09-16 被批量以 superseded 关闭，关闭 ≠ HEAD 已修） |
| LangChain JS | langchainjs `12626c25`，`@langchain/mcp-adapters` 1.1.4 | 官方 TS SDK `^1.30.0` 上的多服务端客户端与连接池 | 源码 + CHANGELOG + issue |
| OpenAI Agents | Python `32edd3c3`（0.22.3）；JS `a0b1c6fd`（0.18.0，grep 级） | 官方 `mcp` 上的 server 对象、管理器、缓存、过滤、审批 | 源码 + `docs/` + issue |
| Vercel AI SDK | `vercel/ai` `21b2d6c3`，`@ai-sdk/mcp` 2.0.56 | **自写协议层**，不依赖官方 SDK，但接受官方 SDK 的 transport 对象 | 源码 + `content/` 文档 + CHANGELOG + issue |
| Claude Agent SDK | Python `dce7cdac`（0.2.158）；npm 0.3.280 | 宿主侧：进程内 SDK MCP 服务桥与运行时控制；MCP 客户端本体在 Claude Code CLI 里 | 源码（Python）/ 类型声明（TS） |
| Claude Code | 本机 `2.1.280`；`CHANGELOG.md` @ `56f36532`；文档五页 | **闭源**；只有厂商文档与 CHANGELOG | 厂商自述 |

## 二、逐源：在 SDK 之上加了什么、依赖、自述的坑

### DSH（补首轮）

首轮已给出连接监督、登记、投影的源码读数（E-3～E-6）。本轮补作者自己写下的取舍与坑：

- 分页：每次同步拒绝**重复出现的非空续页游标**，保留上一代；空页不能证明进展，所以跨多页的环也靠游标历史识别。
  作者自述「这检测重复游标，不约束一个不停返回新游标的服务端」；动因是一次报告过的失败（作者引 `deepseek-harness/discussions/3660`，本轮未打开）。
- 名字：作者调研了八个多服务端客户端，全部带服务端限定；引微软研究院对 1,470 个服务端的统计，775 个工具名撞名、`search` 出现在 32 个服务端。
  原方案「原名 + 可选前缀」被否，理由是「大多数服务端已自带语义前缀」这一前提为假，且撞名时加前缀会让可用工具集取决于装载顺序。
- 多段文本：DSH 的线路序列化 `flattenText()` 用 `join('')` 拼接，多段文本会**丢掉段间边界**，所以桥把文本段以 `'\n'` 合成一段。
- 规范值与投影分开：程序化调用者要完整 MCP 块与 `structuredContent`，模型端要持久化后的图片而不是 base64，所以保留一份规范值、另出一份投影。
- 断连策略的反转：首版「只连一次」拒绝自动重连（理由：部分可用状态、stdio 崩溃多是配置错重试也修不好），**运维反馈把它推翻**，改为有预算的重连。
- `reconnect.spec.ts` 的 25 个测试名是一份现成的竞态清单：被替换代的通知处理器迟到、连接中途传输关闭、短暂连上又崩的崩溃循环、连接拒绝与自身关闭赛跑、
  退避等待中卸载、卸载时首次同步仍在途、失败代「从未报告关闭」时停止重连等。
- 出站代理：Node 内置 `fetch` 不读 `HTTP_PROXY`，DSH 曾让模型请求、MCP over HTTP 等全部静默直连；修法是启动时装 `undici` 全局 dispatcher（`dsh-http-proxy`，`undici ^8.10.0`），
  每个调用点配一条 egress 测试（其中一条是 MCP Streamable HTTP）。另一个实测坑：子进程在 `NODE_USE_ENV_PROXY` 下遇到 `socks4://` 等非 http(s) 代理值会在第一行之前退出，
  **所有 Node 写的 MCP 服务端随之起不来**（作者在 Node 24.17 上实测）。
- ACP 路径：会话声明的 MCP 在 Agent 发布前逐项校验（名字、命令、URL、环境、头、规范化后重名），首连或发现失败把未发布的 Agent 回滚。
- 额外依赖：官方 SDK（声明 `^1.12.0`，锁 `1.29.0`）、`zod ^4.4.3`、vendored `schemastery`，外加六个 DSH 包（首轮 E-1）。
  DSH 另有 `subagent-claude-code` 依赖 `@modelcontextprotocol/sdk ^1.29.0`，它是 `@anthropic-ai/claude-agent-sdk@0.3.263` 的 peer，**源码不直接用**。

### pi 本体

- 读遍 `3390bd9` 的 MCP 字样命中（`grep -i 'mcp|modelcontextprotocol'`，排除 `node_modules`）：README「**No MCP.** Build CLI tools with READMEs … or build an extension that adds MCP support」、
  `docs/usage.md`「intentionally does not include built-in MCP」、扩展能力清单里的「MCP server integration」、
  一个测试夹具里的包名 `npm:pi-mcp-adapter`、一个 OAuth scope 字符串，以及 `@google/genai` 对 `@modelcontextprotocol/sdk ^1.25.2` 的**可选 peer**。
  **没有 MCP 客户端代码**。
- 与 MCP 相关的只有两个通用扩展点：`pi.registerTool()` 启动后也能调、同会话立即可见；`pi.setActiveTools()` 运行时切换激活集，
  pi 把工具集的变化作为增量追加给模型，提供方表达不了过渡时退回完整重放，会让缓存前缀失效（`docs/extensions.md` Dynamic Tool Loading）。
- 一处专门为「MCP 桥这类自己产出图片的工具」写的防护：工具结果里的图片在进入会话历史前统一过 `normalizeToolResultImages`，
  注释原文：「Oversized images make the provider reject the whole conversation, not just the offending turn」；处理失败保留原块、不静默删除。
  它在扩展的 `tool_result` 钩子**之后**运行，所以扩展替换进来的图片也被处理。

### pi-mcp-adapter（pi 生态第三方）

- 依赖：`@modelcontextprotocol/client` **2.0.0**、`@modelcontextprotocol/core` **2.0.0**（精确钉）、`ext-tasks ^0.1.0`、`ext-apps ^1.2.2`；
  `@napi-rs/keyring`、`ajv`/`ajv-formats`、`recheck`（正则 ReDoS 检查）、`smol-toml`（读 Codex 配置）、`undici ^6.28.1`（自定义 CA）、`cross-spawn`、`open`、
  `strip-json-comments`、`zod`、`@typesafe-ai/sdk`（可选的外部语义搜索）。CHANGELOG 2.21.0 记去掉了对旧 `@modelcontextprotocol/sdk` peer 的依赖。
  附带一个约 295 KB 的 UI bundle（内含 MCP SDK 与 zod）、一个 keyring 子进程脚本、`worker_threads` 脚本执行器。
- 暴露面：**默认只注册一个代理工具 `mcp`**（search / describe / call / connect / auth 等模式），README 的动机：「A single MCP server can burn 10k+ tokens … One proxy tool (~200 tokens)」。
  另可选逐动作直接注册（schema 取自磁盘缓存，启动时不必连接）、「注册但不激活、搜到才激活」、每服务端一个转发工具、`mcpScript`。
  代理工具描述刻意**只取决于配置、字节稳定**，理由是重新注册会改写已缓存的 prompt 前缀。
- 连接：默认懒连接；空闲 10 分钟且无在途请求时断开；失败后 60 秒内不再尝试且该服务端从搜索与列表中隐藏；
  重连**单飞**，替代连接私下建好、握手与元数据都成功后才发布，**失败的候选不拆掉最后一条可用连接**；
  会话过期只在「请求带着 `Mcp-Session-Id` 且收到 404 或 `-32000 Server not initialized`」时判定，重连一次、重试一次——
  注释给的理由是规范规定会话失效时服务端先拒绝、不处理请求，所以这类重试不会重复执行；通用 400、ConnectionClosed、Abort 刻意不匹配。
  stdio 子进程完全交给 SDK 的 `client.close()`，stderr 只留尾部 8 KB 用于报错。多个 pi 进程**不共享**服务端进程。
- 列举缓存：`<agent dir>/mcp-cache.json`，按服务端名作键，失效条件为配置指纹变化、超过 7 天、服务端给的 `ttlMs`（0 视为不可缓存）；
  写法是读旧合并、写 pid 临时文件、rename，**无文件锁**。用途：服务端没连上时仍能搜索、列出、注册直接工具。
- 名字：冲突时**所有冲突方都丢弃**并记为失败，不按先来后到；与内置工具同名的跳过。普通工具名无长度检查，只有命名空间代理名截到 59 字符加哈希。
- 输出防护：文本上限 50 KiB / 2000 行，截掉的全文写进 0600 临时文件且**不自动清理**；图片原样通过、不限大小；
  内嵌二进制资源单个 10 MiB、每会话 100 MiB 以内落临时文件；有 `structuredContent` 时追加在文本后。
- elicitation 要有 UI，URL 模式只在 TUI 且须用户点开；sampling 只做纯文本、**请求与结果各确认一次**、走 pi 自己的模型注册表；roots 未实现。
- 鉴权：OAuth（授权码 + PKCE、client_credentials；clientId > CIMD > DCR）；令牌存 OS 凭据库并按 URL 绑定，Windows 单值上限所以超 1000 字符分块；
  凭据库不可用时失败、**不退回明文**；注释：「Do not give origin-bound headers to SDK requestInit: it reuses those defaults for discovered OAuth endpoints, including other origins」。
- 审批：「本会话允许」的键是（服务端、原工具名、**定义哈希**、**参数哈希**），只放行完全相同的参数。
- 错误：失败以返回值交回，带错误码（`tool_error`、`call_failed`、`auth_required`、`server_backoff`……）；因为 pi 不读结果层的 `isError`，
  扩展用钩子把其中三种翻成 `isError`，鉴权待办、退避中等**不算失败**。
- CHANGELOG 自述的修复（摘）：2.0.0 并发 close 与 connect 导致服务端进程孤儿；2.2.2 缓存刷盘抛错时仍执行优雅关停以免泄漏进程；
  2.12.0 服务端重启后会话 ID 失效的恢复、跨 pi 重载围住运行时所有权以免迟到回调和连接活过会话；2.15.0 初始化失败后清理未发布的运行时以免残留子进程；
  2.27.0 慢而健康的服务端在有界刷新超时时不再被判失败；2.28.0 令牌作废只在本 provider 内生效，免得陈旧刷新删掉另一个进程刚授权的凭据；
  2.33.0 OAuth 发现、注册、换令牌、刷新请求此前**没有超时**会卡死 agent；2.34.0 与 `ttlMs: 0` 相关的缓存冲突（另见 issue #561、#569、#641）。

### Codex（补首轮缺件）

- 依赖：workspace `rmcp = "=3.2.0"`（精确钉，`Cargo.lock` 同），`oauth2 5.0.0`、`sse-stream 0.2.5`、`keyring 3.6.3`、`lru 0.18.2`、`sha1 0.10.6`、`arc-swap 1.9.0`、`regex-lite 0.1.8`；
  `reqwest 0.13.4` 只经 `rmcp` 间接引入，与 workspace 自己的 `0.12.28` 并存。
- 连接集 `McpConnectionSet`（crate 私有；本 commit **没有** `McpConnectionManager` 这个名字）由 `McpRuntime` 以 `ArcSwap` 整体替换发布，已捕获的 binding 继续持有旧连接。
  各服务端并发启动，构造函数不等；默认启动 30 s、调用 300 s（首轮引用文档的 10 s / 60 s 与源码常量不同，见 research.md）；
  `required` 服务端失败则会话创建失败；可选服务端共享一个 1 秒宽限截止时间，截止时间还会**写进缓存条目**跨会话共享。
- 未就绪服务端的动作（首轮悬置）：**有目录缓存 → 进目录**（没有预绑定调用、只读注解被清空），调用时先等启动再重绑，仍不可用返回「not available to the model」；
  **无缓存且过宽限 → 整个服务端不进目录**；**启动已失败 → 不进目录**。
- 目录缓存 `McpToolCatalogCache`：进程级 LRU（32 条、TTL 30 分钟），键 = 服务端名 + 传输配置 SHA1 指纹（**含所引用环境变量当前值的哈希**）+ 执行环境；
  **配了 OAuth、头助手或已存凭据的服务端不缓存**；空列表不算可用；服务端可在 initialize 里声明 `codex/tool-catalog-cache {cacheable:false}` 永久退出；按启动代次只接受更新的快照。
- `tools/list_changed`：全仓唯一处理是打一行 info 日志；相关 issue #10105 等五条 OPEN。
- 分页：**默认的 Legacy 协议模式下忽略 `nextCursor`，只取第一页**（本轮执行者复读 `codex-mcp/src/rmcp_client.rs:673-676` 确认）；开 `Mcp20260728` 才翻页，
  翻页守卫为 100 页、2048 项（Apps 8192）、游标不超过 64 KiB、游标重复即报错、整体 30 s。
- 名字：只留 `[A-Za-z0-9_]`；上限 128 字节，超长截断加 `_` + SHA1 前 12 位；完全相同的重复条目警告后留第一个；合法化后撞名则加哈希、循环直到唯一。
  issue #46188：上限从 64 提到 128 后，经 Amazon Bedrock 超过对方 64 字符限制（OPEN）。
- 结果投影：`structuredContent` 非空时**只输出它的 JSON，content 数组整个丢弃**；否则 text/image/audio 各自映射，其余串成 JSON 文本；
  模型不支持的模态换成占位文本；按单个工具的 `output_token_limit` 截断，**图片不计入预算、总是保留**。
- stdio：新进程组启动，关闭时 SIGTERM、2 秒后 SIGKILL；stderr 按行进日志并有 250 ms 排空宽限（注释：逃逸的后代进程会让 stderr 一直不到 EOF）；
  现代 stdio 传输单行上限 8 MiB，超限关传输；默认环境变量是**白名单**（`HOME`、`PATH`、`USER`、`LANG` 等 11 个）加配置的额外变量；
  Windows 上 `.cmd` 需要带扩展名解析（`program_resolver.rs`）。
- HTTP：重定向只允许**同源**（注释：请求可能带敏感头与调用体，跨源重定向会把它们送到别处或内网服务），至多 10 次。
- **stdio 服务端中途退出后没有自动重启、没有看门狗**：只有 runtime 因配置、环境、鉴权变化或用户手动刷新被标脏后，下一次发布才新建连接（13 处标脏点无一由连接关闭触发）；
  issue #39990「本地服务端重启后不重连」、#39149「rmcp 3.0.0 的 `is_closed()` 看不到自行终止的 task」。
- 注释里的 TODO：启动超时与取消令牌是两套机制；OAuth 刷新后持久化失败时**故意 fail-closed**；缺少原子更新凭据与 scope 的 rmcp API。
  其他 issue：#29321 启动阻塞工具列举、#22072 启动超时不覆盖 initialize 之前的 OAuth 引导、#31499 Windows 重复拉起 stdio 进程池（183 个 node.exe / 13 GB）、
  #41133 关闭时丢失已轮换的 refresh token（均 OPEN）。

### LangChain Python（已归档）

- 依赖：`langchain-core>=1.3.3,<2`、`mcp>=1.24.0,<2.0.0`、`typing-extensions`；`mcp` 的上界是 0.3.2 才加的——**mcp 2.0.0 移除了 `mcp.shared.context.RequestContext`，0.3.1 导入即失败**（#589）。
  直接 import 但未声明 `httpx`、`pydantic`。继任 `langchain.mcp` 改用 `fastmcp>=4.0.1,<5`。
- 连接：默认**每次工具调用新建会话**（stdio 即每次拉起一个子进程）；0.1.0 起去掉长驻会话，理由见 #75「服务端重启后已取得的工具静默失效」。无连接池、无重连。
- 多服务端：`get_tools()` 用 `asyncio.gather` 且**不带 `return_exceptions`**——一个服务端失败丢掉全部工具、其余连接成孤儿（#492、#551，HEAD 仍如此）；
  同文件里 `get_server_info()` 带了，注释说是为了让每个会话正常退出、拆掉子进程。
- 注释：「MCP SDK … may suppress exceptions when the client disconnects」，所以在 `async with` 内先捕获、出上下文再抛。
- 名字：默认无前缀，开启后 `server_tool`；**无冲突检测**，同名静默覆盖（#605，以「开前缀」结案，默认仍关）。
- 投影：`content_and_artifact`；**audio 抛 `NotImplementedError`，且不受 `handle_tool_errors` 兜底**；`structuredContent` 进 artifact。
- 错误：`isError` 默认转成 `status=error` 的消息；传输与内容转换失败一律原样抛出。
- 其他坑：#258 并发调用同一工具请求 ID 相同、其余挂起；#99、#466 关闭时跨 task 退出 cancel scope。

### LangChain JS

- 依赖：`@modelcontextprotocol/sdk ^1.30.0`、`debug`、`zod`；peer `@langchain/core`、`@langchain/langgraph`（非可选）；可选依赖 `extended-eventsource` 源码未引用。
- 连接：长驻 + **连接池**，键 = 服务端名 +（HTTP 时）按键排序序列化的头 + `authProvider` 对象引用；**多服务端串行初始化**（#10825 OPEN）；
  `onConnectionError: throw | ignore | fn`；stdio `restart`、SSE `reconnect` 包 `onclose` 固定间隔重试，Streamable HTTP 交给 SDK 的重连选项；HTTP 4xx 时自动回退 SSE。
  带头的按调用 fork 每次新建连接并入池、不查重。
- 超时：调用级转成 SDK `RequestOptions.timeout`；曾因框架 `ensureConfig()` 删掉数值 `timeout`，SDK 退回 60 秒默认（#9136、#9560，已修）。
- 列举缓存到关闭或重连；`list_changed` 只转给用户回调，**不失效缓存**。
- 名字：可选 `additional__server__tool`，无冲突检测、无合法化。
- schema：为「LLM 兼容」简化输入 schema（去组合子、`anyOf` 的 `required` 取交集），**简化后的 schema 同时用于运行时校验**（#11302 OPEN、#10905）。
- 错误：`isError` 抛异常，只拼 text 段；传输与超时错误统一包成 `ToolException` **不带 cause**，`McpError.code` 丢失，调用方分不出可重试的传输错与参数错（#11300 OPEN）。
- 未声明任何客户端能力：无 elicitation、sampling。

### OpenAI Agents SDK（Python 为主）

- 依赖：`mcp>=1.19.0,<3` 是**必装**依赖，锁 2.0.0；另为传递依赖设安全下限（`httpx2`、`pyjwt`、`python-multipart`、`starlette`、`urllib3`）；
  `_compat.py` 运行时判 mcp 主版本（v2 走 `httpx2`，v1 走 `httpx`）并抹平字段名。JS 把 `@modelcontextprotocol/client ^2` 放在可选依赖。
- 连接：Stdio / SSE / Streamable HTTP 三类，connect 起保持到显式 cleanup，生命周期由调用方管；**只有一个会话读超时 `client_session_timeout_seconds`，默认 5 秒，也作用于工具调用**；
  `max_retry_attempts` 默认 0；Streamable HTTP 的 `call_tool` 遇断连/超时/5xx 时**新开一个一次性隔离会话重试这次调用**；单个 server 无自动重连（JS 有，并发重连合并、列举中途换代抛「listing became stale」）。
  同一 Streamable HTTP 会话上的请求全部串行。`MCPServerManager`：连不上的记入 `failed_servers`，默认 `drop_failed_servers=True`；connect/cleanup 各 10 秒超时。
- 列举：`cache_tools_list` 默认关，**不开则每轮都请求一次 `tools/list`**；只有显式 `invalidate_tools_cache()` 失效；不处理 `list_changed`；
  分页有 `max_list_pages`，重复游标、超页、中途失败都抛错、**不返回也不缓存部分结果**。
- 过滤：静态允许/禁止名单；动态回调 `(run_context, agent, server_name, tool)`，回调抛错时该工具被排除。过滤在缓存之后。
- 名字：默认不加前缀，**跨服务端同名直接抛错**（#464、#1167 之后加的开关）；开关打开为 `mcp_{server}__{tool}`，64 字符上限、sha1 8 位后缀，并避开本地工具与 handoff 名。
- 投影：`use_structured_content` 默认关（docstring：多数服务端在 content 里重复一份结构化数据）；image 转 data URL，其余块转 JSON 文本；多块给列表不拼接；**`isError` 不转异常**。
- 错误：调用失败默认转成给模型的固定文本「An error occurred while running the tool. Please try again.」，不暴露异常内容；设为 None 改为直接抛。
- 审批：`require_approval` 可整服务端或逐工具，回调拿不到 agent 时默认要审批。
- 凭据脱敏：由 URL 派生的服务端名剥掉 userinfo 与 query，用于错误、trace 与模型可见输出（来源 #4016：凭据曾泄漏到模型可见输出）。
- 其他坑：#1024 默认 5 秒让长调用失败（默认值至今仍是 5）；#4017 超时设 0 被悄悄当成不限时；#5054 管理器 worker 吞掉外部取消（OPEN）；
  #4334 并行生命周期操作交叠时竞态或挂死；#840 anyio cancel scope 跨 task 退出。

### Vercel AI SDK

- **协议层自写**：JSON-RPC schema、三种传输（旧式 SSE、Streamable HTTP、stdio）、协议版本常量（最新 `2026-07-28`，旧版最新 `2025-11-25`，支持列表五个）自己维护；
  官方 SDK 的 transport 只要有 `start/send/close` 就能传入。依赖：`@ai-sdk/provider`、`@ai-sdk/provider-utils`（内含 `eventsource-parser ^3.0.8`、`undici ^7.29.0`）、
  `cross-spawn ^7.0.6`、`pkce-challenge ^5.0.1`；peer `zod`；Node ≥ 22。
- 连接：一个服务端一个长驻客户端；挂起请求表在传输 `onclose` 时统一以「Connection closed」失败；**客户端层无重连**；默认无请求超时。
  推断（未运行）：POST 返回 SSE 时流正常结束而无响应，挂起请求不会失败；旧式 SSE 意外断开不调 `onclose`；stdio `send` 忽略取消信号。
- 列举：每次 `tools()` 都现发、不缓存、拉全分页；**不支持 `list_changed`**，任何通知都走 `onError('Unsupported message type')`（#8189 OPEN）。
  另提供 `fingerprintTools` / `detectToolDrift`，文档称为「rug pull」检测，基线由应用自存。
- 名字：**不加前缀**；多客户端合并按对象展开，同名后者覆盖前者（cookbook 原文）。
- 投影：`isError` 原样返回、不抛；只有 `structuredContent` 无 `content` 时补一个 text 块（#20171）；image 转 file，其余 `JSON.stringify` 成文本。
- 错误：只有一个 `MCPClientError`，超时、取消、断连、已关闭都没有子类或区分码，只能看 message；不属于任何请求的错误不配 `onUncaughtError` 就静默丢弃。
- 取消：`abortSignal` 传进调用，但**不发 `notifications/cancelled`**；取消后迟到的响应抛「unknown message ID」。
- 鉴权：`redirect` 默认 `'error'`（文档：防 SSRF）；`authProvider` 做 OAuth，并发 401 共用一次授权流程；CHANGELOG 有 SSRF、凭据外泄、issuer/state 校验等多条 OAuth 安全修复。
- 其他坑：#16580 发出后取消，promise 永不结束且挂起表项泄漏；#18075 无法给初始化限时；#12025 工具返回图片导致流挂起；#19157 Windows 上 `npx` 起不来 stdio 服务端。

### Claude Agent SDK 与 Claude Code

- SDK 依赖：Python `mcp>=1.23.0,<3`（下限两次上调：旧版把 `CallToolResult` 变成校验错误；CVE-2025-66416 DNS rebinding）、`jsonschema`、`anyio`；
  `_mcp_compat.py` 注释「Nothing outside this module may branch on the mcp version」。TS 包无 `dependencies`，peer `@modelcontextprotocol/sdk ^1.29.0`，另带 8 个平台二进制可选依赖；
  `sdk.mjs` 找不到 `@modelcontextprotocol` 字符串（推断为打包内联，未反编译）。
- 进程内 SDK MCP 服务桥（Python）：CLI 是 MCP 客户端，经 stdio 控制通道以 `control_request{subtype:"mcp_message"}` 送原始 JSON-RPC，SDK 用 `mcp` 的内存传输接到真正的 `Server.run`；
  **服务端到客户端的通知被丢弃**，roots / sampling / elicitation 请求一律回 `-32601`；握手成功后死掉的服务端在本次 query 内不再恢复。
  mcp 1.x 下只对 SDK 自建的服务端发取消通知，因为 1.x 在处理函数仍回复时会「stops the whole server」。
  `maxResultSizeChars` 走 `_meta["anthropic/maxResultSizeChars"]`，理由：「MCP clients drop annotation fields they do not know」（#756：大结果被静默截断）。
- TS SDK 运行时控制：`setMcpServers()` 整体替换动态服务集合并返回 `{added, removed, errors}`；`reconnectMcpServer`、`toggleMcpServer`；
  `McpServerStatus.source` 给出来源，类型注释「Key trust on this, not on the name」；`initialize.sdkMcpServerManifests` 让宿主预先握手，省掉首回合前的控制往返。
  `onElicitation` 未提供且无 hook 处理时自动 decline。类型层无 sampling。
- Claude Code（厂商文档）：默认后台非阻塞连接；`MCP_TIMEOUT` 启动 30 秒；`MCP_TOOL_TIMEOUT` 默认约 28 小时；每服务端 `timeout` 是硬墙钟、progress 不续期；
  另有**空闲超时**（无响应且无 progress：远程 5 分钟、stdio 30 分钟）与远程每请求首字节计时；超过 2 分钟的调用转后台任务。
  远程断开指数退避最多 5 次，**stdio 不自动重连**；首连与发现请求对瞬时错误重试 3 次，认证错误、4xx、超时不重试。
  `list_changed` 刷新 tools / prompts / resources，刷新失败保留旧结果；可选**发现缓存**（TTL 900 秒、最大陈旧 4 小时）让远程服务端「connects on first use」。
  命名 `mcp__<server>__<tool>`，`[A-Za-z0-9_-]` 以外换成 `_`；三作用域按名字去重、插件与连接器按端点去重、不跨作用域合并字段；
  输入 schema 根级组合子展平、非法 schema 或属性名的工具被单独剔除；描述截到 2048 字符。
  输出超过 1 万 token 警告、默认上限 2.5 万 token，超限且无图片的结果写盘换成文件引用。状态五值 `connected | failed | needs-auth | pending | disabled`。
  权限规则 `mcp__s`、`mcp__s__*`、`mcp__s__t`；工具 `_meta["anthropic/requiresUserInteraction"]` 让每次调用都弹确认；企业允许/拒绝列表按 URL、命令或名字匹配，**`type:"sdk"` 的进程内服务端跳过这些检查**。
  `headersHelper` 每次连接执行（10 秒超时），调用遇 401/403 重跑并重试一次；OAuth 401 触发刷新并重试一次。roots 返回启动目录与附加工作目录；**公开材料里没有 sampling 一词**。
- Claude Code CHANGELOG 自述的修复（摘）：2.1.9 缓存的连接 promise 永不 resolve 导致重连挂死；2.1.15 stdio 超时不杀子进程；2.1.105 stdio 输出非 JSON 时挂住会话而非「Connection closed」；
  2.1.110 SSE/HTTP 中途断开时调用无限挂起；2.1.113 一个调用的消息会悄悄解除另一个并发调用的看门狗；2.1.136 多服务端并发刷新丢失 refresh token；2.1.206 一次刷新失败就要求手动重新授权；
  2.1.217 截断后的输出仍在内存里保留全文；2.0.31「Tool names must be unique」；2.1.221 名为 `constructor` 的工具导致崩溃；2.1.271 服务端紧循环发 `list_changed` 导致持续高 CPU；
  2.1.214 瞬时错误把服务端的命令与资源清空；2.1.128 同时返回结构化内容与内容块时丢图；另有 stderr 累积到每服务端 64 MB（2.1.208）、HTTP/SSE 重连每小时累积约 50 MB 缓冲（2.1.97）。
  TS SDK CHANGELOG：0.3.257 禁用 `foo` 误删 `foo__bar` 的工具（前缀匹配）；0.2.94 `query()` 结束时 MCP 子进程未清理；0.3.142 改为后台连接（破坏性变更）。

## 三、按主题的横向对照

每个主题只写「同行怎么做、他们记下了什么坑、撞上会怎样」。「撞上会怎样」对照的是
提案必要性质 N-1～N-11，只说明哪条性质受影响，不说该怎么选。

### 3.1 协议层来源与 SDK 大版本

| 来源 | 协议层 | 版本约束 |
|---|---|---|
| DSH | 官方 TS SDK 1.x | `^1.12.0`，锁 1.29.0 |
| LangChain JS | 官方 TS SDK 1.x | `^1.30.0` |
| Claude Agent SDK TS | 官方 TS SDK 1.x（peer） | `^1.29.0` |
| Claude Code | 官方 TS SDK，v1 / v2 两套运行时可切换（`MCP_SDK_GENERATION`） | 文档：v2 基于 SDK 2.0，带 2026-07-28 协议 |
| pi-mcp-adapter | 官方 **v2 拆分包** `@modelcontextprotocol/client` / `core` | 精确 2.0.0 |
| OpenAI Agents JS | 官方 v2 拆分包 | `^2`，可选依赖 |
| Codex | 官方 Rust SDK `rmcp` | 精确 `=3.2.0` |
| LangChain Python | 官方 `mcp` 1.x | `<2.0.0`（被 2.0 破坏后加的上界） |
| OpenAI Agents Python / Claude Agent SDK Python | 官方 `mcp` 1.x 与 2.x 都接 | `<3`，版本分支关在一个兼容模块里 |
| Vercel `@ai-sdk/mcp` | 自写 | —— |

npm 上（2026-09-23 查）：`@modelcontextprotocol/sdk` 最新 1.30.0（2026-07-27 发布；1.29.0 为 2026-03-30）；
`@modelcontextprotocol/client` 与 `@modelcontextprotocol/core` 最新 2.0.0（client 2.0.0 发布于 2026-07-27T23:55Z），client 2.0.0 依赖 `zod ^4.2.0`、`jose`、`cross-spawn`、`eventsource`、`eventsource-parser`、`pkce-challenge`。
**v2 不是 `sdk` 包的下一个大版本，而是换了包名**；两条线在 2026-07-27 同日发版。

撞上会怎样：提案候选 C 目前以首轮研究的 `1.29.0` 为基线；同行已经分成「钉 v1」「上 v2」「两版并接」三群。
LangChain Python 的 0.3.1 没有上界，mcp 2.0 一发布就**导入即失败**；DSH 的 `^1.12.0` 宽范围是首轮已记的另一面。
Claude Code 文档把 2026-07-28 协议挂在 v2 运行时上；这与 Codex 的 `V20260728` 模式、Vercel 自写的 `server/discover` 探测一起说明新协议已有客户端在用——
TS SDK 1.x 是否支持该协议，本轮仍未取证（没有读 SDK 发布包）。

### 3.2 工具名：限定、合法化、长度、冲突

| 来源 | 形状 | 长度与合法化 | 冲突 |
|---|---|---|---|
| DSH | `mcp__<server>__<raw>`，恒开 | 64，`[A-Za-z0-9_-]`，改动过则加 12 位 SHA-256 | 注册冲突整代回滚；配置重名装载失败 |
| Codex | `mcp__<server>` 命名空间 + 动作名 | 128，`[A-Za-z0-9_]`，SHA1 12 位 | 同身份留第一个；合法化后撞名加哈希循环到唯一 |
| Claude Code | `mcp__<server>__<tool>` | `[A-Za-z0-9_-]`；总长规则未公开 | 作用域按名字去重、连接器重名加 ` (N)` |
| OpenAI Agents | 默认原名；可选 `mcp_{server}__{tool}` | 64，sha1 8 位 | 默认跨服务端同名**抛错**；run 层与本地工具冲突默认留最后一个 |
| pi-mcp-adapter | 默认 server 前缀，可改 short / none / mcp | 非法字符转 `_<hex>_`；普通名不截断 | **冲突各方全部丢弃** |
| LangChain Py / JS | 默认原名；可选前缀 | 无 | 无检测，**静默覆盖** |
| Vercel | 原名 | 无 | 合并时后者覆盖 |

同行记下的坑：DSH 与 OpenAI 都记录了「原名 + 撞名时再处理」被真实撞名推翻（OpenAI #464、#1167；LangChain #605、#174）；
Codex 把上限从 64 提到 128 后撞上 Bedrock 的 64 字符上限（#46188）；Claude Code 的按前缀匹配把 `foo` 与 `foo__bar` 混在一起（TS SDK 0.3.257）、
hook matcher 对带连字符的服务端名做子串误匹配（2.1.195）、名为 `constructor` 的工具导致崩溃（2.1.221）。

撞上会怎样：N-7 要求稳定的逐动作身份。
名字的长度上限取决于最终接收函数名的模型提供方；本系统经 OpenRouter 转发，**OpenRouter 及其后端对函数名的字符集与长度限制本轮未取证**。
「以名字前缀判断归属」在服务端名本身含 `__` 或互为前缀时会误判（Claude Code 已踩）。

### 3.3 上一次清单的持久副本（列举缓存）

三家让「没连上的服务端仍然有条目」：

| 来源 | 存在哪 | 键 | 失效 | 不缓存的情形 |
|---|---|---|---|---|
| Codex | 进程内 LRU（32 条） | 服务端名 + 传输配置指纹（含所引用环境变量值的哈希）+ 执行环境 | TTL 30 分钟；空列表不算；更新的启动代次覆盖 | 配了 OAuth、头助手或已存凭据；服务端声明 `cacheable:false` |
| pi-mcp-adapter | 磁盘 `mcp-cache.json` | 服务端名（值里带配置指纹） | 配置指纹变、7 天、服务端 `ttlMs` | `ttlMs: 0` |
| Claude Code | 未公开（「discovery cache」） | 未公开 | TTL 900 秒、最大陈旧 4 小时；重连或清除鉴权时丢弃 | 未公开 |

细节里的坑：Codex 把缓存条目的**只读注解清空**，调用时先等服务端就绪再重新绑定，拿不到就回「not available」；
pi-mcp-adapter 围绕 `ttlMs` 连出三条 issue（#561 零 TTL 时直接工具永不注册、#569 不回 `ttlMs` 的服务端缓存被永远判失效、#641 零 TTL 让延迟启动整体失效），
且多进程读合并写**无锁**，按服务端粒度后写者胜。其余五家（DSH、LangChain 两份、OpenAI、Vercel）没有跨连接的持久清单。

撞上会怎样：N-3 的持久副本有先例可对照，但**三家的键都不含租户或持有维度**；
Codex 把「凭据类配置」直接排除出缓存，等于这类服务端没有替换件可装；pi-mcp-adapter 的键只有服务端名，同名不同配置靠值里的指纹判失效而不是并存。

### 3.4 `tools/list_changed`

支持并自动刷新：DSH（整代替换，拉取失败留上一代）、Claude Code（刷新失败保留旧结果）、pi-mcp-adapter（热更新，另有 `freezeDirectTools` 冻结以稳定 prompt 缓存）。
只转给用户回调：LangChain JS（不失效缓存）。不支持：Codex（只写日志，五条 OPEN issue）、OpenAI（需自接 `message_handler`）、Vercel（#8189 OPEN）、LangChain Python。

同行记下的坑：Claude Code 2.1.271 服务端紧循环发 `list_changed` 导致持续高 CPU 与重复列举；2.1.214 刷新遇瞬时错误把命令与资源清空。

撞上会怎样：N-2 要求 run 内不变——支持者都是**收到即换**，没有一家按 run 边界延后生效。

### 3.5 分页

Codex 默认 Legacy 模式**只取第一页**；LangChain Python 与 LangChain JS 的资源列举不分页；其余都跟游标拉全。守卫：DSH 拒绝重复游标；
Codex（现代模式）100 页 / 2048 项 / 游标 64 KiB / 30 秒；OpenAI `max_list_pages`，失败不返回也不缓存部分结果；LangChain Python 1000 次；LangChain JS 与 Vercel 无上限。

撞上会怎样：多页的服务端在「只取第一页」的实现下**静默少动作**，agent 不知道自己少了什么；无上限的实现遇到不停给新游标的服务端没有收口（DSH 自述它也只防重复不防无穷）。

### 3.6 超时

| 来源 | 连接/启动 | 单次调用 | 其他 |
|---|---|---|---|
| Codex | 30 s（源码常量） | 300 s | 可选服务端共享 1 s 宽限 |
| Claude Code | `MCP_TIMEOUT` 30 s | 约 28 h；每服务端 `timeout` 为硬墙钟 | 空闲超时（远程 5 min / stdio 30 min，progress 续期）；远程每请求首字节计时 |
| OpenAI Agents Python | 管理器 connect 10 s | **与读超时同一个值，默认 5 s** | cleanup 10 s |
| LangChain JS | —— | SDK 默认 60 s | —— |
| Vercel | 初始化可限时（2.0.20 起） | 默认**无** | 服务端发现探测固定 1 s |
| DSH | 继承 SDK 60 s，不可配 | 60 s | —— |

同行记下的坑：OpenAI #1024（5 秒让长调用失败）与 #4017（0 被悄悄当成不限时）；LangChain JS #9560（框架把超时数值删掉，退回 SDK 60 秒）；
Claude Code 2.1.142（工具超时没抬高远程每请求 fetch 超时，封顶 60 秒）、2.1.162（小于 1000 ms 的超时被当成 1 秒看门狗）、2.1.113（看门狗被并发调用解除）；
Codex #22072 与 pi-mcp-adapter 2.33.0：**OAuth 引导与令牌请求不在启动超时里**，卡住整个 agent。

撞上会怎样：N-6 的两项超时之外，同行还分出了「空闲超时」与「OAuth 请求超时」两个量；
「0 的含义」「单位下限」两处是同行真实出过错的边界值。

### 3.7 挂起请求的收尾

同行记下的挂死类坑是本轮数量最多的一类：Claude Code 五条（缓存的连接 promise 永不 resolve、stdio 非 JSON 输出挂住会话、SSE/HTTP 中途断开调用无限挂起、远程调用 5 分钟无响应、看门狗被解除）；
Vercel #16580（发出后取消，promise 永不结束、挂起表项泄漏）与两条读代码推断（POST-SSE 正常结束无响应不失败、旧式 SSE 意外断开不触发 `onclose`）；
Codex #39149（`is_closed()` 看不到自行终止的 task，死连接显示为打开）与「已关闭的客户端仍可能被放进 binding」；
LangChain Python #258（并发调用同一工具请求 ID 相同，其余挂起）与「SDK 在断连时可能吞异常」；OpenAI #1404（initialize 失败后流式输出挂住）；
Claude Agent SDK 2.1.251 前 SDK MCP 握手 ack 丢失导致会话无限挂起（改为 70 秒超时，只把该服务端标失败）。

撞上会怎样：N-4 把断连与超时都归「失败」，前提是**每一个在途请求都会收场**；
上面每一条都是「既不失败也不成功」的第七种状态，agent 会一直等。

### 3.8 重连与会话过期

| 来源 | stdio | Streamable HTTP | 重放调用 |
|---|---|---|---|
| DSH | 有预算的重连（只由传输关闭触发） | 不在监督器重建范围 | 不重放 |
| Codex | **无**自动重启 | 会话过期 404 重新握手后重跑该操作；`tools/list` 与 initialize 瞬态重试 | 鉴权失败不重放 |
| Claude Code | **不**自动重连 | 最多 5 次指数退避 | 401/403 刷新后重试一次 |
| pi-mcp-adapter | 下次调用懒连接；keep-alive 模式指数退避重连 | 会话过期（带 session id 的 404 / `-32000`）重连一次、重试一次；替代连接先建好再发布 | 只重试会话过期那一种 |
| LangChain JS | `restart` 固定间隔 | 交给 SDK 重连选项 | —— |
| OpenAI Python | 无 | 无 | **Streamable HTTP 的调用在断连、超时、5xx 时开隔离会话重试** |
| Vercel | 无 | 旧协议 GET SSE 最多 2 次 | `maxRetries`（默认 0）只对 `tools/call`，文档警告非幂等工具会重复副作用 |

撞上会怎样：N-8 要求**不重放**已发出的调用。
OpenAI Python 的隔离重试与 Vercel 的 `maxRetries` 都是重放；pi-mcp-adapter 的会话过期重试依赖「服务端拒绝时未执行」这一规范保证，它自己把适用面收得很窄。
自己写恢复逻辑、两种传输都覆盖的只有 LangChain JS（HTTP 一半交给 SDK 的重连选项）与 pi-mcp-adapter；Codex 与 Claude Code 都把「stdio 服务端崩了」留给下一次显式动作。

### 3.9 stdio 子进程治理

- 终止：Codex 进程组 SIGTERM → 2 秒 → SIGKILL，Windows 用 Job Object；DSH、pi-mcp-adapter、LangChain 交给 SDK 的关闭。
- 泄漏与孤儿，四家记过：pi-mcp-adapter 2.0.0（并发 close + connect）、2.2.2、2.15.0；Claude Code 2.1.15（超时不杀子进程）与 TS SDK 0.2.94；
  LangChain Python #551（gather 失败留下 FD 与僵尸进程）；Codex #31499（Windows 重复拉起进程池 183 个 node.exe）。DSH 决策记录另写了「不理信号的服务端会卡住卸载」的风险。
- stderr：必须持续读走——Codex 250 ms 排空宽限（逃逸的后代进程占着管道）；Claude Code 2.1.208 每服务端 stderr 累积到 64 MB；Claude Agent SDK Python 自述「MCP server 向 stderr 打日志导致挂起」；pi-mcp-adapter 只留尾部 8 KB。
- 帧：Codex 单行 8 MiB 上限，超限关传输；Claude Code 2.1.105 非 JSON 输出曾挂住会话。
- 环境：**白名单**（Codex 11 个变量，Vercel `HOME/LOGNAME/PATH/SHELL/TERM/USER`，LangChain Python 交 SDK 的默认子集）与**黑名单**（DSH 剔除名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 与 `DSH_*` 的变量）两种；
  LangChain Python #298 曾把 `env=None` 转成 `{}` 导致子进程拿不到环境。DSH 的代理变量坑见第二节。
- Windows：`npx` / `.cmd` 需要解析（Codex `program_resolver`、Vercel #19157、pi-mcp-adapter 的 npx 解析与 24 小时缓存、LangChain JS 靠 `cross-spawn`）。

撞上会怎样：N-11（候选假设）把拉起位置交给执行环境时，上述终止、stderr、帧上限与环境过滤随拉起方一起换主；
N-5 的「不跨租户身份共用凭据」在黑名单做法下取决于名字模式覆盖面，在白名单做法下取决于显式传入的那份。

### 3.10 结果投影

- `structuredContent` 与 `content` 并存时：Codex **只给结构化、丢 content**；OpenAI 默认只给 content（理由：多数服务端两边重复）；
  pi-mcp-adapter 把结构化追加在文本后；LangChain 放进 artifact 不给模型；Vercel 只在没有 content 时补一段文本；Claude Code 2.1.128 曾在两者并存时丢图。
- 图片：Codex 不计入截断预算、总是保留；Claude Code 带图的结果不写盘、受 token 上限；pi 本体在图片进入历史前统一缩放（超大图让提供方拒绝**整段对话**）；
  pi-mcp-adapter 图片不限大小；Vercel #12025 图片导致流挂起；DSH 只在模型声明图像输入时入库。
- 音频、`resource_link`、内嵌资源：Codex / OpenAI / Vercel 串成 JSON 文本；LangChain JS 映射成标准块，内嵌资源只有 uri 时**再发一次 `readResource`**；
  LangChain Python 音频抛 `NotImplementedError` 且不受错误兜底；Claude Agent SDK 进程内服务丢弃二进制资源。
- 大输出：Claude Code 超 2.5 万 token 写盘换引用、2.1.217 截断后内存仍留全文；pi-mcp-adapter 截到 50 KiB 写临时文件不清理；Codex 按工具配置 token 预算 × 1.2。
- 多段文本：DSH 因线路序列化 `join('')` 改为 `'\n'` 合并。

撞上会怎样：这些决定落在工具产出与两端模态的契约上（提案「本版桥到哪一步」表里「按工具产出处理，不丢」一行）；同行在「结构化优先还是内容优先」上方向相反，各自给了理由。

### 3.11 错误与收场的分类

| 来源 | `isError` | 传输 / 超时 / 断连 | 能否区分 |
|---|---|---|---|
| DSH | 抛错 → 注册表产出失败 | SDK 抛错 | 都是「失败」 |
| Codex | 原样给模型 | 调用错误变 `isError` 文本；鉴权失败带 `mcp/www_authenticate` | 鉴权单列；启动错误分 Cancelled / Failed / 需重新授权 |
| OpenAI Python | 原样给模型 | 默认转固定文本「An error occurred…」 | 模型端不能 |
| Vercel | 原样返回 | 单一 `MCPClientError`，无子类无码 | 只能看 message |
| LangChain Python | 默认转 error 状态消息 | 原样抛出 | 按异常类型 |
| LangChain JS | 抛 `ToolException` | 统一包成 `ToolException` 且**丢 cause** | 不能（#11300） |
| pi-mcp-adapter | `tool_error` 码 | `call_failed`、`server_backoff`、`auth_required`… | 能；只有三种码算失败 |
| Claude Code | —— | 状态五值；瞬时错误重试、4xx 与认证不重试 | 能 |

撞上会怎样：N-4 要区分「失败」「被中断」「等待态」，并且都以正常工具返回到达 agent；
LangChain JS 与 Vercel 的做法到了桥这一层已经无法区分可重试的传输错误与参数错误，这是他们自己在 issue 里记下的。

### 3.12 取消

Vercel 取消只作用于本地、**不发 `notifications/cancelled`**，迟到响应抛「unknown message ID」；Claude Agent SDK Python 在 mcp 1.x 下只对自建服务端发取消，
理由是 1.x 在处理函数仍回复时会停掉整个服务端；LangChain Python #314 客户端中途取消时 `UnboundLocalError`；pi-mcp-adapter 在 task 路径发 `tasks/cancel`。

撞上会怎样：提案表里「取消（`notifications/cancelled`）：桥」依赖对端正确处理取消；同行里至少一家因对端 SDK 行为而**有选择地不发**。

### 3.13 elicitation、sampling、roots

| 来源 | elicitation | sampling | roots |
|---|---|---|---|
| Claude Code / Agent SDK | form 与 URL；SDK 无回调时自动 decline | 公开材料无 | 启动目录 + 附加工作目录，变化时发通知 |
| Codex | 有，转审批/提问界面 | 未见实现 | —— |
| Vercel | 须先声明能力再注册处理函数 | `-32601` | `-32601` |
| pi-mcp-adapter | 须有 UI；URL 模式须用户点开 | 仅纯文本，请求与结果**各确认一次** | 未实现 |
| LangChain Python | 回调；继任版用 LangGraph `interrupt()` 交给人 | 无封装 | 无封装 |
| LangChain JS / OpenAI / DSH | 不声明 | 不声明 | 不声明 |

撞上会怎样：N-9 要人作答；同行里把 elicitation 交给人的都另建了确认界面，
且在「无界面时」一律拒绝（decline 或错误码），没有一家代填。

### 3.14 鉴权与凭据

- 重定向：Codex 只允许同源；Vercel `redirect:'error'`；OpenAI `follow_redirects=False`；pi-mcp-adapter 不把绑定源的头交给 SDK 的 `requestInit`（SDK 会拿它去请求别源的 OAuth 端点）。
- OAuth 刷新的并发：Claude Code 2.1.136（多服务端并发刷新丢 refresh token）、Codex #41133 / #45944（关闭时或并发刷新丢已轮换令牌）、pi-mcp-adapter 2.28.0（跨进程误删）——
  三家各自踩过一次「轮换令牌被旧值覆盖」。Codex 的应对是持久化失败时故意 fail-closed。
- 凭据泄漏到模型可见输出：OpenAI #4016（URL 派生的服务端名带凭据与 query token）。
- 头助手：Claude Code 每次连接执行；pi-mcp-adapter 的 `requestHeadersCommand` 每个请求执行、产出的头不限定源。
- 存储：Codex 与 pi-mcp-adapter 用 OS 凭据库（后者按 URL 绑定、Windows 分块、不可用即失败）；Codex 不可用时退到 `CODEX_HOME` 文件（首轮 E-10）。

撞上会怎样：提案本版不桥 OAuth；静态头与环境变量这一格同样受重定向与脱敏两处影响。
N-5 按持有分凭据时，所有同行的存储键都是本机用户 + 服务端名/URL，**没有租户维度**（与首轮结论一致）。

### 3.15 暴露面与 token 预算

pi-mcp-adapter 默认一个代理工具；Claude Code 默认 Tool Search（只加载名字与服务端说明）；Codex 开了工具搜索时 `Deferred`（首轮 E-13；是否默认开启本轮未核）；DSH、LangChain、OpenAI、Vercel 逐动作直接给。
两家（pi 本体、pi-mcp-adapter）明确记录了「工具描述或工具集变化会让缓存的 prompt 前缀失效」并为此做了字节稳定或增量追加。

撞上会怎样：N-1 已定「不常驻、经 `Tools()` 发现」，与 Claude Code、pi-mcp-adapter 的默认及 Codex 开工具搜索时的做法同类；
直接工具从缓存注册（pi-mcp-adapter）是 N-3 持久清单的另一个消费者。

### 3.16 审批与对端自报信息的信任

Vercel 文档：注解不可信，「rug pull」（定义被偷换）要应用自己检测，提供 `fingerprintTools` / `detectToolDrift`；Codex 清空缓存条目的只读注解、剥掉普通 MCP 工具 `_meta` 里的 connector 键（防冒充 Apps）；
pi-mcp-adapter 的会话级放行以**定义哈希 + 参数哈希**为键，定义一变就重新询问；Claude Code 提供 `requiresUserInteraction` 强制每次确认，`McpServerStatus.source` 注释「Key trust on this, not on the name」；
OpenAI 逐工具 `require_approval`，拿不到上下文时默认要审批。

撞上会怎样：N-7 把放行留给接入点的持有；「对端漂移不是故障」（首轮对照表第 6 行）与「定义漂移要重新询问」在同行里是两种都存在的处理。

### 3.17 多服务端的启动与部分失败

Codex 并发启动、可选服务端 1 秒宽限、`required` 失败整个会话失败，#29321 未就绪服务端曾阻塞首轮工具路由；
Claude Code 后台非阻塞，stdio 每批 3、远程每批 20，开 Tool Search 时把失败的服务端与错误告诉模型；
OpenAI 管理器默认丢弃失败者；LangChain JS 串行（#10825）；LangChain Python 一个失败丢全部（#492）。

撞上会怎样：提案把列举放在 run 开始前「每个装进来的 MCP 持有各走一遍」；同行里一个服务端的失败拖垮或拖慢全部的例子有三家。

### 3.18 只在 Python 生态出现的坑

OpenAI（#840、#4334、#5054）、LangChain Python（#99、#466）、Claude Agent SDK Python 都记录了 anyio cancel scope 必须在同一 task 进出，
OpenAI 为此给每个服务端配专属 worker task。本项目实现语言是 TypeScript，这一类**不直接适用**，只作为「生命周期所有权要在同一执行单元里闭合」的旁证。

## 四、同行做法 × 来源 × 撞上会怎样（摘要）

列出不等于推荐；选不选、怎么选归提案与决定。「撞上」指**不做这件事**时同行实际遇到的后果。

| 同行做法 | 来源 | 不做时同行撞上了什么 |
|---|---|---|
| 服务端限定名默认开，名字是 (服务端, 原名) 的纯函数，超长或改字符时加身份哈希 | DSH、Codex、Claude Code | 原名加可选前缀：撞名抛错或静默覆盖（OpenAI #464、LangChain #605） |
| 名字长度上限按下游提供方取 | Codex（反例） | 提到 128 后超过 Bedrock 64（Codex #46188） |
| 按名字前缀判断归属时防互为前缀 | Claude Code（反例） | 禁用 `foo` 误删 `foo__bar` |
| 跨连接的清单缓存，键含连接配置指纹，凭据类服务端与声明不可缓存的服务端排除 | Codex、pi-mcp-adapter、Claude Code | 没连上的服务端整个消失（Codex 无缓存分支）；TTL 语义错误导致缓存永远失效或直接工具永不注册（pi-mcp-adapter #561、#569、#641） |
| 刷新失败保留上一份 | DSH、Claude Code | 瞬时错误清空命令与资源（Claude Code 2.1.214） |
| `list_changed` 限流或合并 | Claude Code（反例） | 紧循环通知导致持续高 CPU（2.1.271） |
| 翻页守卫：拒绝重复游标、页数与项数上限、失败不留部分结果 | DSH、Codex、OpenAI | 只取第一页静默少动作（Codex Legacy）；游标成环（DSH 引用的失败报告） |
| 连接超时与调用超时分开，另设空闲超时与 OAuth 请求超时 | Claude Code、Codex、pi-mcp-adapter | 一个 5 秒值误伤长调用（OpenAI #1024）；OAuth 请求卡死 agent（pi-mcp-adapter #485、Codex #22072） |
| 传输关闭时统一收掉全部挂起请求，取消时清理挂起表项 | Vercel（修复后） | promise 永不结束且泄漏（Vercel #16580）；调用无限挂起（Claude Code 2.1.110） |
| 失败的替代连接不拆掉最后一条可用连接；重连单飞 | pi-mcp-adapter | 并发 close 与 connect 留下孤儿进程（pi-mcp-adapter 2.0.0） |
| 会话过期只在「带 session id 的 404 / `-32000`」时重试一次 | pi-mcp-adapter、Codex | 服务端重启后工具静默失效（LangChain #75） |
| 不自动重放已发出的调用 | DSH、Codex | 重放：非幂等工具重复副作用（Vercel 文档自述） |
| 部分失败不拖垮全部，失败者单独记录 | OpenAI、Codex、Claude Code | 一个服务端失败丢全部工具并留孤儿进程（LangChain #492、#551） |
| stdio 进程组终止、stderr 持续排空、单行上限、环境白名单 | Codex | 超时不杀子进程（Claude Code 2.1.15）；stderr 累积 64 MB（Claude Code 2.1.208）；非 JSON 输出挂住会话（Claude Code 2.1.105） |
| Windows 下解析 `npx` / `.cmd` | Codex、Vercel、pi-mcp-adapter | stdio 服务端起不来（Vercel #19157） |
| 图片进入历史前统一规范尺寸 | pi | 超大图让提供方拒绝整段对话（pi 注释） |
| 多段文本以分隔符合并 | DSH | 段间边界丢失（DSH 线路序列化） |
| 错误保留分类与原始码 | Codex、pi-mcp-adapter、Claude Code | 分不出可重试的传输错与参数错（LangChain JS #11300、Vercel 单一错误类） |
| 重定向限同源或拒绝；URL 派生名脱敏 | Codex、Vercel、OpenAI | 凭据进入模型可见输出（OpenAI #4016） |
| 令牌轮换写回的并发保护 | Codex（fail-closed）、pi-mcp-adapter | 并发刷新丢 refresh token（Claude Code 2.1.136、Codex #41133） |
| SDK 大版本分支关在一个模块里 | OpenAI Python、Claude Agent SDK Python | 无上界依赖在 SDK 大版本发布时导入即失败（LangChain #589） |
| 工具描述字节稳定、工具集变化增量追加 | pi-mcp-adapter、pi | 重新注册改写缓存的 prompt 前缀 |
| 以定义哈希为放行键 | pi-mcp-adapter | 定义被偷换后沿用旧放行（Vercel 文档「rug pull」） |

## 五、额外依赖总表

| 来源 | MCP 协议层 | 为 MCP 额外引入的依赖 | 运行环境 |
|---|---|---|---|
| DSH | `@modelcontextprotocol/sdk ^1.12.0`（锁 1.29.0） | `zod ^4.4.3`、vendored `schemastery`；出站代理 `undici ^8.10.0`（经 `dsh-http-proxy`）；六个 DSH 内部包 | Node |
| pi | —— | ——（`@google/genai` 对 SDK 的可选 peer） | Node |
| pi-mcp-adapter | `@modelcontextprotocol/client` 2.0.0、`core` 2.0.0、`ext-tasks ^0.1.0`、`ext-apps ^1.2.2` | `@napi-rs/keyring ^1.3.0`、`ajv ^8.17.1`、`ajv-formats`、`recheck 4.6.0-beta.3`、`smol-toml`、`undici ^6.28.1`、`cross-spawn ^7.0.6`、`open`、`strip-json-comments`、`zod`、`@typesafe-ai/sdk 0.6.0` | Node ≥ 20 |
| Codex | `rmcp =3.2.0` | `oauth2 5.0.0`、`sse-stream 0.2.5`、`keyring 3.6.3`、`lru 0.18.2`、`sha1 0.10.6`、`arc-swap 1.9.0`、`regex-lite 0.1.8`、`axum`、`tiny_http`、`webbrowser`、`which`；十余个 codex 内部 crate | Rust |
| LangChain Python | `mcp>=1.24.0,<2.0.0`（锁 1.28.1） | `langchain-core>=1.3.3,<2`、`typing-extensions`；未声明直用 `httpx`、`pydantic`；可选 `langgraph`、`websockets` | Python ≥ 3.10 |
| LangChain JS | `@modelcontextprotocol/sdk ^1.30.0` | `debug ^4.4.3`、`zod`；peer `@langchain/core ^1`、`@langchain/langgraph ^1.4.13`；可选 `extended-eventsource`（未引用） | Node ≥ 20.10 |
| OpenAI Agents Python | `mcp>=1.19.0,<3`（锁 2.0.0，必装） | 传递依赖安全下限：`httpx2`、`pyjwt`、`python-multipart`、`starlette`、`urllib3`；`anyio` | Python ≥ 3.10 |
| OpenAI Agents JS | `@modelcontextprotocol/client ^2`（可选依赖） | —— | Node |
| Vercel | 自写 | `@ai-sdk/provider 4.0.18`、`@ai-sdk/provider-utils 5.0.46`（含 `eventsource-parser ^3.0.8`、`undici ^7.29.0`）、`cross-spawn ^7.0.6`、`pkce-challenge ^5.0.1`；peer `zod` | Node ≥ 22 |
| Claude Agent SDK Python | `mcp>=1.23.0,<3` | `jsonschema>=4.20`、`anyio>=4`、`sniffio`；内置 Claude Code CLI 二进制 | Python |
| Claude Agent SDK TS | peer `@modelcontextprotocol/sdk ^1.29.0` | peer `@anthropic-ai/sdk >=0.93.0`、`zod ^4`；8 个平台二进制可选依赖 | Node ≥ 18 |
| 官方 v2 client（参照） | —— | `@modelcontextprotocol/core 2.0.0`、`zod ^4.2.0`、`jose ^6.1.3`、`cross-spawn ^7.0.5`、`eventsource ^3.0.2`、`eventsource-parser ^3.0.0`、`pkce-challenge ^5.0.0` | —— |

## 六、失败的推断、未取得与局限

- 起初按任务描述以为 pi-mcp-adapter 依赖 `@modelcontextprotocol/sdk`；读清单后**推翻**：它依赖 v2 拆分包，`sdk` 既不是依赖也不是 peer。
- 首轮对照表与本轮 Codex 超时数字不一致：首轮引的是 Codex 文档副本（启动 10 s、调用 60 s），本轮 `codex-mcp` 源码常量是 30 s / 300 s。本轮只记录不一致，**不判哪边是当前行为**（文档可能指另一层的默认值）。
- **未取得**：Claude Code 本体源码（闭源）；Claude Agent SDK TS 实现（`sdk.mjs` 压缩，未反编译）；`rmcp 3.2.0` 源码（#39149 是否已在 3.2.0 修复未核）；
  官方 TS SDK 1.29/1.30 与 2.0.0 发布包（协议版本、自定义传输、elicitation 处理器仍是提案的待核项）；OpenRouter 对函数名的限制；
  官方 Python `mcp` 在未设各回调时的默认行为；docs.langchain.com 迁移指南；ai-sdk.dev 线上页（以仓库 `content/` 为准）；Codex `connection_manager/resources.rs` 与 elicitation 相关文件。
- **读遍无**（在所列文件范围内）：OpenAI Python、LangChain JS、Vercel 的 `list_changed` 处理；Vercel 的 `notifications/cancelled`；pi 本体的 MCP 客户端代码；
  Codex 中由连接关闭触发的重建；pi-mcp-adapter 的 roots 与文件锁；Claude Code 公开材料中的 sampling。
- GitHub issue 检索多数只按标题关键词，两次触发限流（LangChain JS、Vercel 各有关键词组未取得）；pi-mcp-adapter 的 issue 列表来自 WebFetch 摘要未逐条打开；
  LangChain Python 大批 issue 于 2026-09-16 以「superseded」批量关闭，**关闭状态不代表 HEAD 已修**。
- 没有运行任何代码；Vercel 三条「推断」、Codex「已关闭客户端仍可能被放进 binding」均为读代码所得。
