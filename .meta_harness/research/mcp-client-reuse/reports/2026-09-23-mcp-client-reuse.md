# MCP 客户端复用评估：DSH `c291e796` mcp-client 与 Codex `5c5308fc` rmcp-client，2026-09-23

**取代状态：** 当前有效，未被取代

- 执行者与日期：assets-runtimes 一程的调研执行者（只读），2026-09-23。
- 调查范围：MCP 客户端「原则上直接复用」是否可行。以 DSH `@deepseek-ai/dsh-mcp-client` 为主参照、Codex
  `codex-rmcp-client` 及其会话层为第二参照，对照本项目产品正文里 MCP 作为一类资产的要求；回答六个问题
  （对象模型逐条对照、动作怎样变成工具条目、resources/prompts/sampling/通知、凭据、与 DSH 工具管线的耦合、短板与代价）。
  **不在范围**：pi（明确不做 MCP）；上网取证；`design_legacy/`；任何方案推荐。
- 输入与方法：只读主检出 `tmp/sources/extracted/{dsh,codex,codex-docs}`（钉住归档见 `tmp/sources/README.md`）。
  DSH 读全 `packages/mcp/mcp-client/src/*.ts`、`package.json`、`README.md`、两份 `.agents/notes`、测试文件清单与
  `it` 计数、`docs/` 里含 mcp 的页、`pnpm-lock.yaml` 的 SDK 条目、`packages/acp/acp/src/{mcp,session}.ts`、
  `packages/core/tools/src/index.ts` 的 `ToolDefinition`、`packages/subprocess/subprocess/src/index.ts`。
  Codex 读 `rmcp-client/{Cargo.toml,src/lib.rs,rmcp_client.rs,protocol_mode.rs,streamable_http_retry.rs,oauth.rs,
  stdio_server_launcher.rs,logging_client_handler.rs,elicitation_client_service.rs,tool_input.rs}` 的相关段落，
  `core/src/{mcp.rs,mcp_tool_exposure.rs,mcp_tool_call.rs,mcp_skill_dependencies.rs,session/mcp*.rs,session/mod.rs,
  tools/handlers/{mcp,mcp_resource_spec}.rs}` 的相关段落；Codex 文档副本 `grep -il mcp` 命中的 16 页中读
  `config-file_config-reference.md`、`permissions.md`、`agent-approvals-security.md`、`glossary.md` 的 MCP 条目。
  产品正文读 HUB `cdff9e57` 的 PF-002 §4、PF-004 §动作空间与 §6.1、PF-005 §6.9、PF-006 §4–§6、PF-007 §5.6 与 §6.1、
  UL-mcp、UL-model-credential、SYS-KERNEL。
- 处置的既有结论：首次调查。

## 完整报告正文

下面六节对应六个问题。每一格判定用四个词：**可承载**（不改客户端对外行为即成立）、**需改**（要改行为，不必推翻对象划分）、
**不可承载**（对象划分本身与要求相抵）、**未覆盖**（没有这个维度）。

## 一、对象模型逐条对到产品要求

### 两份客户端的对象模型，先各自摆出来

**DSH mcp-client**（E-2～E-5）

| 维度 | 它是什么 |
|---|---|
| 服务身份 | 本地配置 `serverName`，`[A-Za-z0-9_-]{1,32}`，同一 Cordis 注册作用域内唯一 |
| 连接对象 | 一个插件实例 = 一个服务端 = 一个监督器；监督器持有「代」：每次连接新建 SDK `Client` + 传输 |
| 生命周期 | 装载即连，`await` 首连与首次列举后插件才激活；卸载即关连接、等静止、注销工具；HMR 等于卸载再装载 |
| 列举时机 | 连接成功后完整分页列举一次；此后只在 `tools/list_changed` 与重连成功时重做；串行、整代原子替换 |
| 缓存 | 注册表里的那一代就是缓存；拉取失败保留上一代 |
| 调用 | `tools/call` 直发，带 `exec.signal` 与单次超时（默认 60 s） |
| 结果形状 | 规范值 `{ content: JsonValue[], structuredContent? }` + 另一份面向模型的投影（文本、可入库的图片、诊断文本） |
| 错误 | 对端 `isError` → 抛错 → DSH 注册表产出 `isError`；断连 → SDK 抛错；任务式工具 → 抛错 |
| 重连 | 只由传输关闭触发；指数退避 500 ms→30 s，每次故障 10 次预算，稳定 30 s 重置；耗尽则注销全部工具并停 |
| 鉴权 | 无；凭据走 stdio `env` 或 HTTP 静态 `headers` |

**Codex rmcp-client + 会话层**（E-9～E-16）

| 维度 | 它是什么 |
|---|---|
| 服务身份 | 配置表键 `mcp_servers.<id>`；托管允许列表要求 name 与 identity（command/url）同时匹配 |
| 连接对象 | `RmcpClient`：`Connecting → Ready → Closed` 三态 + 保留的传输配方（可重建传输）；会话持有一份 MCP 运行时与若干客户端 |
| 生命周期 | 会话初始化时装入；`required` 的服务起不来则会话启动失败；`shutdown` 终止自有 stdio 进程组 |
| 列举时机 | 每步前按脏标记重投影（环境、鉴权、能力根变化）；调用前再检查一次；对端 `tools/list_changed` 只写日志 |
| 缓存 | `McpToolCatalogCache`（在 `codex_mcp`，未见源码）；会话层按绑定缓存 handler |
| 调用 | `call_tool(name, arguments, meta, timeout)`；2026-07-28 协议下走多轮工具输入；超时计时在 elicitation 暂停期间停表 |
| 结果形状 | 原样 `CallToolResult` |
| 错误 | 鉴权需要 → `isError` 结果并附 `www_authenticate`；拿不到绑定 → 「not available to the model」普通结果 |
| 重连 | HTTP：初始化与 `tools/list` 瞬态重试（250 ms、1 s），会话过期 404 → 重新初始化并重发；stdio 没有见到自动重启 |
| 鉴权 | bearer 环境变量、环境变量填头、头助手命令、OAuth（钥匙串或 `.credentials.json`）、ChatGPT 会话 |

### 逐条对照与论证

**1. 接入点 name 是身份，连接参数不是**（PF-002 §4 MCP）。
DSH 可承载：`serverName` 由配置给，决策记录明写不跟对端 `serverInfo.name`（不可信、跨部署不唯一、升级会变）。
Codex 可承载：`<id>` 即名。**但 Codex 托管层把 identity（command/url）也拿来判「能不能用」**——名字相同、连接目标不同，
会被当成未获准的另一个服务禁用。产品只说连接参数「不是身份」，没有说它能否参与「能不能用」的判断；
这里两者不矛盾，但 Codex 的做法表明「名字即身份」在准入面上曾被认为不够。

**2. 动作不是资产，随接入点被持有**（同上）。两源都需改：动作在两源里都是注册表里的一等条目，
DSH 的名字 `mcp__<server>__<tool>` 可以被权限规则单独寻址（DSH 决策记录说这正是设计目的），
Codex 可以逐动作启停与逐动作审批。不判「不可承载」，是因为两源的**身份**仍是（服务名, 动作名）的二元组，
服务名一侧已经在；把动作降为接入点的内部结构，改的是登记与寻址，不是对象划分的根。

**3. 设置走层级求值**。两源都需改：DSH 是每个插件实例一份静态配置，没有层；Codex 有 user / project / managed
配置层，但那是**同一个人的**不同配置来源，不是平台 / 组织 / 租户。

**4. 能不能用**。DSH 未覆盖：只有装载/卸载插件实例，没有「持有但禁用」的状态。Codex 可承载形状：`enabled` 与托管允许列表。

**5. 执行权限三档，MCP 动作走接入点那一份**（PF-007 §5.6 rev 16）。DSH 未覆盖（审批不在包内，在 DSH 通用的 ToolGuard，
按工具名匹配）。Codex 需改：四档而非三档，`writes` 依赖对端自报注解；且逐动作覆盖与产品「走接入点那一份」直接相反。

**6. 对端漂移不是故障**。DSH 部分可承载：`list_changed` 是正常路径，整代原子替换，拉取失败留旧；
但断连超预算后撤销全部登记并以 error 记日志——产品意义上「对端没了」在 DSH 那里会变成动作消失。
Codex 在 rmcp-client 层未覆盖：`on_tool_list_changed` 只有一行 info 日志；会话层的刷新由本地输入变化触发。
**推断**：对端单方面增删动作，Codex 要等下一次别的原因标脏才会重新列举；`codex_mcp` 可能另有机制，未见源码。

**7. 可用性每次 run 开始前重算**（PF-006 §6.2）。DSH 未覆盖：包里没有 run。Codex 可承载形状：
`session/mod.rs:3782-3792` 每一步在发请求前调 `mcp_runtime_for_step`；这比「每次 run」更细（每步）。
注意 Codex 的「重算」只针对它的本地输入，不是向对端重新列举。

**8. 不可用装同名替换件**（PF-006 §6.3）。这一格是全表唯一判「不可承载」的地方，理由要说清：
替换件要求**与原件同形**，而 MCP 动作的形状（名字、参数 schema）只能从对端列举得来。
**一个从未连上的接入点，本系统手里没有任何一个动作的形状**，所以不存在「同形」的对象可以装——
这不是 DSH 行为可以改的，而是信息不存在；除非有一份此前列举结果的持久副本，两源都没有这份副本
（DSH 的「上一代」只在进程内存里）。断连（曾经连上过）的情形下，DSH 留着上一代、调用失败，外形接近替换件，
但说明没换、收场是失败；预算耗尽后撤销登记，恰是 PF-006 §6.3 表里被否定的「不装」。
Codex 需改：拿不到绑定时返回的是普通结果（接近「不可用」收场的形态），但服务没起来时它的动作是否在目录里，
取决于 `codex_mcp` 与 `mcp_optional_startup_grace_ms`（文档：构建初始目录时等可选服务的共享时长，默认 1 s）——
推断为「不在」，未见源码。

**9. 六种收场，只有一种是失败**（PF-006 §5.5）。DSH 需改：对端 `isError`、断连、超时都走抛错 → 失败；
取消走 `exec.signal`，映射到哪个收场取决于 DSH 注册表。Codex 需改：鉴权失效折成 `isError` 结果，
「not available」有文本、无机器可读分类。两源都不区分「接入点当下不可达」与「这次调用失败了」。

**10. 依赖声明与解析**（PF-006 §6.4）。DSH 未覆盖。Codex 需改：技能可以声明 MCP 服务依赖，
缺了**提示用户安装**（仅第一方客户端），不是判技能不可用；`required` 是会话级硬前提，起不来整个会话失败。
产品一侧：[PF-002 组合矩阵](../../../design/product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)
里 Skill **不能组合 MCP**，技能要表达「我需要 GitHub 那个接入点」只能走 PF-006 依赖表里的「某个外部服务」一项，
或经能力标识指 Tool——而 MCP 的动作不是资产、没有能力标识。

**11. 工具执行绑 session**（PF-006 §6.5）。DSH 需改：调用由 agent loop 的 `exec.signal` 驱动，连接归插件作用域；
全局装载时所有会话共用一条连接，ACP 路径下每个会话一个 Agent 作用域、连接随 Agent 卸载关闭。
Codex 可承载形状：运行时是会话服务。

**12. 宿主换手、停机不重来**（PF-006 §6.12）。DSH：重连不重放在途调用（在途调用随旧代失败），与「停了就不重来」同向；
但 ACP 路径下连接宿主是 Agent 作用域（≈ agent runtime），产品规定已转后台的执行宿主是会话——
**执行比它依赖的连接活得长**，agent runtime 被回收时连接先没了。DSH 的 MCP 工具本身不声明后台，所以这在 DSH 里不发生，
但搬进产品的后台语义就会发生。Codex 部分可承载：只在 HTTP 会话过期 404（对端表示不认识这个会话，调用未被执行）时
重建并重发；`tool_input.rs:3` 明写「Session recovery cannot replay a submitted proof」。

**13. 两端模态**（PF-006 §6.11）。DSH 需改：结果端的判断——模型声明了图像输入才入库，否则转诊断文本——
写在桥里、每次调用时现查，与产品「作为依赖声明、run 前算」的位置不同；调用端 MCP 参数是 JSON，只要文本，天然满足。
Codex 本轮未核（`tools/handlers/mcp.rs` 引了 `PromptImageMode`，未展开）。

**14. 落点不可用即拒绝**（PF-005 §6.9）。DSH 未覆盖：stdio 子进程由 SDK 在宿主机拉起。
Codex 需改（形状）：`experimental_environment = local | remote`，远端只对 stdio；这是本项目「执行环境」概念在 MCP 上的最近参照，
但为实验性。

**15. 动作空间只由构成决定**（PF-004 I-4）。两源都需改——但这一格的判定依赖产品怎么读「MCP 在动作空间里是一个条目还是一批」，
见第二节。

**16. 租户隔离**。DSH 需改：全局实例跨会话、跨租户共享一条连接与一份凭据；Agent 作用域能分开，但分开的依据是 Agent，不是租户。
Codex 未覆盖：凭据键是服务名 + URL，存本机。

## 二、MCP 动作怎样变成工具条目

**两源的做法一致：逐动作一个条目。**

- DSH：每个动作一个 `ToolDefinition`，名字 `mcp__<serverName>__<rawName>`，经 64 字符 / 字符集规范化；
  线上只发原始名，不从公开名反解。决策记录列了八个同类产品都按服务限定名字（Claude Code、Codex、Gemini CLI、VS Code、
  Cline、Roo Code、Goose、OpenCode——**这是 DSH 的转述，本轮未核这些原文**）。
- Codex：每个动作一个 `ToolSpec::Namespace { name: 服务命名空间, tools: [这一个函数] }`；暴露方式
  `Direct` / `Deferred`（开工具搜索时）/ `Hidden`（agent 插件来源超预算时）。

**占槽位吗**：DSH 是全部直接占（README 自述「工具描述与 schema 进入每一次请求」）。Codex 视工具搜索开关——
开了就 `Deferred`，不直接出现在请求里，经搜索够得着；这与 PF-007 `Tools()` 的「不占槽位、经取用入口够得着」同构。

**产品有没有说死**：没有。PF-002 §4 MCP 说 MCP 与 Tool 的关系跟「多命令 tool 与它的子命令」同形，
表里的落点是「它带来的动作不是资产，随接入点一起被持有、配置与授权，正如子命令随 tool」——这是**持有与授权**的同形。
「多命令工具整套只占一个槽位」写在 PF-002 §4 Tool 与 PF-006 §5.3，主语是 Tool。
MCP 是否占一个槽位、能否标常驻、它的动作在 `Tools().search` / `inspect` 里怎样出现，产品正文里都没有。

**这件事为什么不只是呈现问题**：它决定 PF-004 I-4 的读法。
- 若一个接入点在动作空间里是一个条目（多命令形状），对端增删动作只改这个条目的内部命令集，
  「动作空间只由构成决定」不受影响，对端漂移自然「不是故障」。
- 若逐动作是条目（两源的做法），对端增删动作直接改变 agent 面前的条目集合——构成没变，动作空间变了，
  这正是 I-4 那句「拿构成之外的东西去改动作空间」。

两种读法各自的代价（事实层面）：逐动作条目下，参数格式随动作数线性进入预算（DSH 自述），权限可以细到动作（与 PF-007 §5.6 相反）；
单条目下，动作的参数格式要么进条目定义（预算同样随动作数涨），要么靠 `inspect` 另取一次（PF-006 §5.3 讲过这个权衡）。

## 三、resources、prompts、sampling 与通知

| 能力 | DSH | Codex | 产品 |
|---|---|---|---|
| tools | 桥接 | 桥接 | 「动作」 |
| resources | 不桥接；结果里的 `resource_link` 转文本，内嵌 `resource` 转诊断 | `list_resources` / `list_resource_templates` / `read_resource`，暴露成三个跨服务的内建工具 | 未提 |
| prompts | 不支持（DSH：需要本 harness 没有的模板概念） | 只有 `on_prompt_list_changed` 写日志 | 未提 |
| sampling | 不声明（客户端能力 `{}`） | MRTR 输入会解析 `CreateMessage`，未见处理实现 | 未提 |
| elicitation | 不声明 | 支持，转审批/提问界面；另有 OpenAI 扩展表单与用户校验 | 未提（与 PF-006 等待态、PF-008 相邻） |
| roots | 不声明 | MRTR 输入会解析 `ListRoots`，未见处理实现 | 未提 |
| 通知 | 只处理 `tools/list_changed` | 进度、取消、资源更新、三种 list_changed、日志：除 elicitation 外都只写日志 | 未提 |

**不支持的部分要不要显式排除**：这是产品与架构的选择，本研究不答。只报告与之相关的事实：
- DSH 客户端能力声明为空，对端按协议不应向它发 sampling / elicitation / roots 请求——**不声明本身就是一种显式排除**，
  在协议层可观察。
- Codex 的 resources 工具不隶属于任何一个接入点（`server` 参数可省），它们在产品模型里是什么（哪类资产、由谁持有），
  没有现成位置；按 PF-002 的组合矩阵，这类「跨接入点的动作」不存在。
- sampling 若被接受，对端会借本系统的模型发请求：要走 OpenRouter（全局约束），用量与模型凭据的归属要有着落；
  两源都没有做，所以没有可借的形状。
- elicitation 是**一次工具调用中途**向人要输入；它与 PF-006 的等待态、PF-007 `Ask()`、PF-008 的关系，两源的映射都是各自产品的，
  不能直接对上。Codex 的一个细节值得记下：elicitation 期间调用超时**停表**（`rmcp_client.rs` 的 `active_time_timeout`）。

## 四、鉴权与凭据

**存**：DSH 不存，凭据是配置里的字符串（示例用 `!!js process.env.X` 在装载时从宿主环境插值）；
Codex 的静态凭据来自环境变量，OAuth 令牌存 OS 钥匙串，失败退到 `CODEX_HOME/.credentials.json`，键由服务名与 URL 算出。

**注入**：DSH——stdio 走子进程 `env`（先按 `KEY|PASSWORD|SECRET|TOKEN` 滤掉宿主环境里的同类变量，再合并配置值），
HTTP 走每请求静态头。Codex——stdio 走 `env` 与 `env_vars` 白名单；HTTP 走 bearer（`bearer_token_env_var` 或已解析令牌）、
静态头、环境变量填头、头助手命令；OAuth 在每次操作前按需刷新、操作后持久化。

**归属**：两源都是「这台机器上的这个用户」。没有组织、租户维度。

**本项目缺名字**：统一语言里「裸写『凭据』不作数」，已有**账号的登录凭据**、**模型凭据**（挂范围，不是设置）、
**连接件的接入凭据**三种叫法。MCP 接入点连对端用的那一份，**没有词条**。
PF-002 §4 MCP 的「自带属性」只列连接目标与超时。它是接入点的设置（跟资产走、层级求值、可被同名替代）还是范围的属性
（像模型凭据，一范围一把），产品没定——这决定了「组织替换一个同名 MCP 接入点时凭据跟不跟着换」。
两源的做法对应「连接参数里的一个字段」；本研究不取名，只报缺口。

## 五、与 DSH 工具管线的耦合

**清单层**：`peerDependencies` 六个 DSH 包 + `cordis`；`dependencies` 有 vendored `schemastery`；
`tools.ts:27` 纯类型引用了**未声明**的 `dsh-util-values`（fork 时会以构建失败的形式暴露）。
`docs/module-graph.md` 给出同样的六条出边，另有 `acp → mcp-client` 一条入边。

**源码层**，按文件切：

| 文件 | 行数 | 依赖 | 与 DSH 工具管线的关系 |
|---|---|---|---|
| `transport.ts` | 50 | SDK 两个传输；`dsh-subprocess.scrubbedParentEnv` | 与工具管线无关 |
| `connection.ts` | 351 | SDK `Client`、`ToolListChangedNotificationSchema`；`cordis` `Context`（只用 `ctx.logger`，并把 `ctx` 传给 `syncTools`）；`dsh-timeout` 一个常量 | 通过 `syncTools(generation, ctx, opts, disposers)` 与 `ToolDisposers` 间接相连 |
| `tools.ts` | 569 | SDK；`dsh-tools`（`ToolDefinition`、`ToolExecution`、`ToolExecutionResult`、schema 断言）；`dsh-llm`（`ContentBlock`、`resolveModelInfo`）；`dsh-attachment`（入库）；`dsh-util-values`；`exec.agent?.session` | **全部**建立在 DSH 工具契约上：`output.render`、`finalizeContent`、注册表的 `isError` 路径、PTC 模式的规范值 |
| `index.ts` | 188 | `cordis`、`schemastery`、`dsh-scope.scopeOf`、`dsh-timeout`、`dsh-tools`（声明合并 `ctx.tools`） | `inject: ['tools']`；预留按 DSH scope 分 |

**解耦成本（事实层面）**：协议相关的逻辑——连接代际、串行同步队列、重连预算、关闭屏障、分页与游标检查、`tools/call`
的直发与取消——集中在 `connection.ts` 全部与 `tools.ts` 的 `listToolsUncached` / `callToolUncached` / `syncTools` 第一阶段。
`tools.ts` 的其余部分（定义构造、结果投影、图片入库、`finalizeContent` 握手）是 DSH 工具契约的适配层，
换一套工具契约即整段不适用。DSH 决策记录明说不预先按「接口 / 实现 / 消费者」拆包，所以没有现成的切面。
[SYS-KERNEL](../../../design/foundation/cross-system-constraints/requirements.md#sys-kernel) 规定工具协议由本项目自定，
复用的是 Cordis 与 DSH `agent` 原语——`dsh-tools` 不在这个清单里（是否会被选为 fork 组件，SYS-KERNEL 说「仍需逐项确定」）。

**附带观察**：DSH 为了绕开 SDK 对 `outputSchema` 的预校验缓存，没有用 SDK 的高层 `listTools` / `callTool`，
而是 `client.request` 直发。也就是说，**DSH 对 SDK 的依赖面是 `Client` 的连接、`request`、通知处理与两种传输**，
比「整个 SDK」窄。

## 六、短板与代价

**SDK 版本漂移**：DSH 声明 `^1.12.0`、锁 `1.29.0`；同仓另两个包声明 `^1.29.0` 或间接带入同版本。
范围宽到 1.x 全段；DSH 自承 SDK 在演进、破坏性变更要改桥，并已绕开 SDK 高层 API 一次。
Codex 侧已有 `McpProtocolMode::V20260728`（2026-07-28 协议：新的发现与请求生命周期、多轮工具输入），
而 TS SDK `1.29.0` 是否支持这一版，钉住的源里没有答案。**这是本轮最大的读数缺口之一。**

**传输覆盖**：DSH 只有 stdio 与 Streamable HTTP，没有旧式 SSE；Codex 另有进程内传输与经执行器的远端 stdio。
DSH 的重连只对 stdio 生效（HTTP 失败按单次请求暴露，不重建）；Codex 的恢复只对 HTTP 生效（瞬态重试、会话过期重建），
stdio 崩溃的自动重启在可见代码里没有找到（`codex_mcp` 未见，可能在那里）。**两源各覆盖了对方没覆盖的那一半。**

**进程管理**：DSH 的 stdio 子进程由 SDK 拉起，DSH 只控制环境与关闭屏障（两段 2 秒 + 1 秒，超时则停重连防重叠）；
DSH 决策记录自承「忽略信号的服务端可能卡住卸载」。Codex 把子进程放进独立进程组，终止时先 TERM 后 KILL 整组，
Windows 用 Job Object。**对应 PF-006 §6.12 的宿主换手**：产品定义的是工具执行的宿主（前台归 agent runtime、后台归会话），
**没有定义 MCP 服务端连接与 stdio 子进程本身的宿主**。两源给出两种事实形状：DSH 归 Cordis 插件作用域（全局或 Agent），
Codex 归会话。前者在 ACP 路径下比会话短、比「全局」又太长（跨租户）。

**Rust 参照只能对形状**：`codex-rmcp-client` 依赖十余个 `codex-*` 内部 crate 与 `rmcp`；上层 `codex_mcp` 不在归档。
能借的只有对象划分与生命周期规则。

**启动与超时**：DSH 连接与发现超时不可配（SDK 60 s），`failOnStartupError` 默认假——首连失败不阻断宿主启动、
该服务一个动作都没有；Codex 启动超时默认 10 s、可选服务共享等待默认 1 s、`required` 可让会话失败。
产品只说接入点自带「超时等」设置，没有区分连接超时与调用超时。

## 本轮结论

1. DSH mcp-client 的协议层（连接代际、重连、列举、调用、取消、传输）与 DSH 工具契约之间没有现成切面；整包复用即引入 `dsh-tools` 契约，
   而 SYS-KERNEL 把工具协议留给本项目。
2. 两源的服务身份都是本地配置名，与 PF-002 同向；Codex 的托管准入额外绑定连接目标。
3. 两源都把每个 MCP 动作做成独立条目；产品没有说死 MCP 的呈现，而这一点决定 PF-004 I-4 在 MCP 上是否成立。
4. 列举时机：DSH 推送驱动、无 run 时点；Codex 每步按本地脏标记重投影、不跟对端推送。
5. 两源都没有同名替换件；「从未连上的接入点」没有形状可同形，这是信息缺失，不是行为缺陷。DSH 默认策略终局是「不装」。
6. 两源都分不出「不可用」与「失败」。
7. 两源的授权粒度都细于 PF-007 §5.6 规定的「走接入点那一份」。
8. 连接宿主：DSH 是插件作用域，Codex 是会话；两源都没有租户维度。
9. DSH 只做 tools；Codex 另做 resources 与 elicitation；两源都没有 prompts、sampling 的消费路径。
10. MCP 接入点的对端凭据在本项目没有名字，也没定是设置还是范围属性。
11. SDK：DSH 锁 1.29.0（声明 ^1.12.0）；Codex 已支持 2026-07-28 协议；TS SDK 对该版本的支持未知。

## 本轮局限

- **未上网**：DSH issue tracker、MCP 规范原文、DSH 决策记录里引用的八个同类产品原文、TS SDK 源码都没有核。
- **Codex 上层缺席**：`codex_mcp`（连接管理、目录缓存、服务就绪等待、stdio 崩溃处理）与 workspace 清单不在归档，
  尝试在本机寻找 `codex-rs/Cargo.lock` 的其他克隆，没有找到。凡依赖它的 Codex 判定都标了「推断」。
- **Codex 文档**：离线副本没有 `/docs/extend/mcp` 专页，只能用配置参考与散见条目。
- **没有运行任何测试或探针**。DSH 的测试覆盖只按文件与 `it` 计数记录；两源的行为都是读源码得出。
- **产品正文是对照输入**：本轮对产品的「没说」「没定」都是在 PF-002/004/005/006/007 与 UL 相关段落里检索未见，
  没有通读全部产品 topic；PF-008（人机交互）与 PF-015（会话）未读，elicitation 与会话宿主的对照因此只到「相邻」。
- 被本轮修正的一个中间说法：起初把 DSH 依赖数记作「七个 DSH 包」，核对 `package.json` 后改为「六个 DSH 包 + cordis，
  外加未声明的 `dsh-util-values` 与 vendored `schemastery`」。
