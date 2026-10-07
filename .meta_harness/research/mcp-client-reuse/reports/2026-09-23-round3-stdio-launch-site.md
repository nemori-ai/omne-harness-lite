# 第三轮：同行的 MCP stdio 服务端在哪拉起、能不能交给远端或沙箱执行器、环境与生命周期怎么管（2026-09-23）

**取代状态：** 当前有效，未被取代。首轮报告 [2026-09-23-mcp-client-reuse.md](2026-09-23-mcp-client-reuse.md) 与第二轮报告 [2026-09-23-round2-wrapper-lessons.md](2026-09-23-round2-wrapper-lessons.md) 仍有效，本轮不改写它们。

- 执行者与日期：assets-runtimes 一程的调研执行者（只读），2026-09-23。每条观察的 `路径:行号` 在 [证据记录](../evidence.md) E-29～E-41。
- 调查范围：提案 mcp-client-adoption 的候选假设
  N-11「stdio 服务端进程在哪拉起，不焊死在宿主机上，留出由执行环境落点决定的接口」；产品负责人 2026-09-23 裁定「看看同行们都是怎么做的」再定。
  本轮回答：**每个同行的 stdio 服务端由哪个进程、在哪台机器拉起；能否指定工作目录、环境变量、用户与权限；能否把拉起交给外部执行器或容器；
  stdio 与远端之间用什么桥；子进程谁杀、孤儿怎么处理；自述了什么坑**。
  **不在范围**：推荐 N-11 取哪一值（归提案与决定）；`design_legacy/`；MCP HTTP 服务端的部署形态。
- 对照输入（产品正文，非来源证据）：[PF-005](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md)（rev 5）§5.1 四种执行环境、§5.3 与 §6.1 落点每次执行现算、§6.2 宿主机不提供租户隔离、§6.8 执行环境权限按门授予、§6.9 落点不可用即拒绝。
- 输入与方法：
  - 本机钉住源（主检出 `tmp/sources/extracted/`）：DSH `c291e796`、Codex `5c5308fc`（`rmcp-client`、`core/src`）与 Codex 文档副本 2026-09-20。
  - 远程源，全部记精确 commit 或发布版本（取证日 2026-09-23）：Codex **同一 commit** `5c5308fc` 的 `codex-mcp`、`exec-server`、`config/src`；
    npm `@modelcontextprotocol/sdk` 1.29.0 与 1.30.0、`@modelcontextprotocol/client` 2.0.0、`@anthropic-ai/claude-agent-sdk` 0.3.280；
    Python `modelcontextprotocol/python-sdk` v1.28.1 `777b8d06` 与 v2.0.0 `6f69a375`；OpenAI Agents Python `32edd3c3`；LangChain JS `12626c25` 与 Python `52a4535f`；
    Vercel `vercel/ai` `21b2d6c3`；code.claude.com 文档七页；`docker/mcp-gateway` `a34df45d`；`sparfenyuk/mcp-proxy` `153a96a6`；`supercorp-ai/supergateway` `874951c7`；
    MCP 规范仓库 `modelcontextprotocol/modelcontextprotocol` `c7400a07` 的 2025-11-25 版 transports 与 lifecycle 页。
  - 全部是**源码、发布包、文档阅读，没有运行任何代码或测试**。标「推断」的是读代码推出、未经运行的结论。
  - 远程源的本地副本在本会话 scratchpad，会被清理；复核按上面的 commit / 版本重新取得。
- 处置的既有结论：前两轮全部结论**不改写**。本轮顺带得到首轮「未知与下一项证据」第 1 行（TS SDK 1.29.0 支持的协议版本）的答案，
  并发现首轮对照表第 14 行与首轮「DSH 只覆盖 stdio……」一条里引用的 Codex 文档说法与同 commit 源码不一致，**只记录，不裁决**，见 [changelog](../changelog.md) rev 3。

## 一、取证对象与来源立场

| 来源 | 精确对象 | 本轮读了什么 | 来源立场 |
|---|---|---|---|
| MCP 规范 | `c7400a07`，2025-11-25 版 | stdio 传输与关闭顺序 | 规范（规范性文字） |
| DSH | `c291e796` | `mcp-client` 的 stdio 传输；`dsh-subprocess` 接缝与 README；E2B 远端执行世界决策记录；`lsp-stdio` 怎样经接缝拉起 | 作者自述 + 源码 |
| Codex | `5c5308fc`：本地 `rmcp-client`、`core/src`；远程 `codex-mcp`、`exec-server`、`config/src`；文档副本 2026-09-20 | 两种 stdio 启动器、执行环境解析、执行器进程 API | 源码（一手）+ 厂商文档 |
| 官方 TS SDK v1 | npm `@modelcontextprotocol/sdk` 1.29.0、1.30.0 | `StdioClientTransport`、`Transport` 接口、导出面、协议版本常量 | 发布包（编译产物） |
| 官方 TS SDK v2 | npm `@modelcontextprotocol/client` 2.0.0 | 同上，外加版本协商的 stdio 旁路探测 | 发布包（编译产物） |
| 官方 Python SDK | v1.28.1、v2.0.0 | `stdio_client` 的进程组与环境 | 源码 |
| OpenAI Agents | Python `32edd3c3`（锁 `mcp` 2.0.0） | `MCPServerStdio`；`SandboxAgent` 文档、示例与 `src/agents/sandbox/` 89 个文件 | 源码 + 仓库内文档 |
| LangChain | JS `12626c25`；Python `52a4535f` | stdio 连接的构造 | 源码 |
| Vercel AI SDK | `21b2d6c3`（`@ai-sdk/mcp` 2.0.56） | 自写的 stdio 传输 | 源码 + 仓库内文档 |
| Claude Code / Agent SDK | code.claude.com 七页（2026-09-23 抓取）；npm `@anthropic-ai/claude-agent-sdk` 0.3.280 `sdk.d.ts` | stdio 服务端与 Bash 沙箱、沙箱运行时、dev container、云会话、Remote Control 的关系；SDK 的进程拉起钩子 | **厂商自述**；本体闭源 |
| Docker MCP Gateway | `docker/mcp-gateway` `a34df45d` | 把每个 stdio 服务端放进容器的拉起参数与生命周期 | 源码 + README |
| mcp-proxy | `sparfenyuk/mcp-proxy` `153a96a6` | stdio ↔ SSE/Streamable HTTP 桥 | 源码 + README |
| supergateway | `supercorp-ai/supergateway` `874951c7` | stdio → SSE / WS / Streamable HTTP 桥 | 源码 + README |

## 二、逐源

### MCP 规范（2025-11-25）

- 拉起位置：规范写死「客户端把 MCP 服务端作为**子进程**拉起」。没有「由第三方拉起」的变体。
- 关闭：客户端**应当**先关服务端的输入流，等退出，不退就 `SIGTERM`，再不退 `SIGKILL`。stderr：服务端**可以**写日志，客户端**可以**捕获、转发或忽略，**不应**把 stderr 当错误信号。
- 撞上会怎样：「子进程」三个字意味着任何把拉起挪到别处的做法（容器、执行器、代理）在规范层面都是**客户端侧的实现细节**——对端看到的仍是 stdin/stdout 两根管道；拉起方换了，关闭顺序的执行者也跟着换。
- 未核：2026-07-28 版的 transports 页本轮未取得（按同路径取回失败），只核了 2025-11-25 版。

### DSH（补首轮 E-5）

- 拉起位置：`mcp-client` 的 stdio 由官方 SDK 的 `StdioClientTransport` 在 **harness 自己的进程里直接 spawn**；DSH 只给它一份环境。
- 可交外部执行器吗：**不能**，且作者自己写明了原因。DSH 有一个把「文件 + 进程」合成一个「执行世界」的接缝（`ctx.fs` + `ctx.subprocess`），
  E2B 远端沙箱就是换一对实现；同仓库的 `lsp-stdio`——同样是 stdio 上跑 JSON-RPC 的长驻服务端——就经 `ctx.subprocess.spawn` 拉起、在 E2B 组合下落进远端沙箱。
  但 `dsh-subprocess` 的 README 明说：**「由 SDK 管理的 spawn 仍在服务之外——拥有内部 spawn 的传输（SDK 客户端、MCP）无法把该调用路由到本服务」**，只能共用环境过滤函数。
  推断：在 E2B 组合下，MCP stdio 服务端仍在宿主机上跑（E2B 决策记录把「prompts and tools」列在宿主一侧，未提 MCP）。
- 工作目录：可配 `cwd`，默认空串（交给 SDK，即继承 harness 的当前目录）。环境：宿主环境**剔除**名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 与 `DSH_*` 的变量，补代理变量，再叠加配置的 `env`（黑名单做法）。用户与权限：无配置项，与 harness 同一用户。
- 生命周期：由 SDK 的 `close()` 杀（见官方 TS SDK v1）；DSH 另加 1 秒等关闭信号，等不到就停止重连以免两代子进程重叠（首轮 E-3）。stderr 不设置，走 SDK 默认 `inherit`，即打到 harness 自己的 stderr。
- 自述的坑：作者自承「不理信号的服务端会卡住卸载」（第二轮 E-17）；代理变量让 Node 子进程在第一行前退出（第二轮 E-17）。

### Codex（补首轮 E-11；远程补读 `codex-mcp`、`exec-server`、`config`）

- 拉起位置：**逐个服务端选择**。配置项在源码里叫 `environment_id`（字符串，缺省 `"local"`）；文档副本写作 `experimental_environment = local | remote`，**同 commit 的 `config/src`、`codex-mcp/src`、`core/src` 里读遍无此字样**，本轮不判哪边是当前用户面。
  - `local`：`LocalStdioServerLauncher`，编排进程（orchestrator）的子进程，**新进程组**；Windows 用 Job Object 容纳，失败则退回无容纳重试。
  - 其他 id：`ExecutorStdioServerLauncher`，经执行环境的 `ExecBackend.start` 在**执行器那一侧**起进程；源码模块注释原话：本模块拥有「服务端进程在哪跑」这一决定，两种启动器都返回同一个传输类型，「`RmcpClient` 不必知道进程住在哪」。
  - 启动器 trait 是**密封的**（`private::Sealed`），第三方不能再加第三种。
- 执行器是什么：`codex exec-server`，一个经 WebSocket 讲 JSON-RPC 的小服务，提供 `process/start|write|read|terminate` 与 `fs/*`；
  远端模式向环境注册中心登记，再经 Noise 中继的会合 WebSocket 与 harness 相连；forward 模式只转发字节。
  桥接方式：**MCP 帧仍在编排进程里做**，执行器只搬 stdin/stdout/stderr 的原始字节（`process/write` 写入、推送的 `process/output` 事件读回，按换行切帧）；stderr 只进日志。
- 工作目录：本地缺省用运行时 cwd；**执行器路径必须显式给 `cwd`，否则启动失败**，且 cwd 以 `file:` URI 传。
- 环境：本地为**白名单**（11 个变量 + `env_vars` 列名 + CA 变量 + 配置的 `env`，再剔除不可继承项）；
  执行器路径**不带编排机的 `PATH`/`HOME`**，改用执行器一侧的 `Core` 继承策略，只把 `env_vars` 里点名的本地变量与字面 `env` 带过去；
  `env_vars` 条目可写 `source = "remote"`，表示**值从执行器环境读**，本地路径遇到它直接报错。argv 与 env 必须是合法 Unicode，远端才能发。
- 用户与权限：两条路径都**不对 MCP 服务端施加 Codex 自己的沙箱**——本地是普通子进程，执行器请求显式带 `sandbox: None`。
  另有一条反方向的机制：服务端若在初始化时声明 `codex/sandbox-state-meta` 能力，每次调用的 `_meta` 里会带上当前的权限配置、Linux 沙箱可执行文件与沙箱 cwd——**由服务端自己去执行沙箱**。
  文档另写明网络代理的域名规则「不限制 MCP 服务端」。
- 落点不可用时：执行环境 id 未知 → 该服务端启动失败（「references unknown environment id」）；`local` 的 stdio 在没有本地环境时也失败；环境处于 Pending / Failed → 权限判为 Unavailable。**没有回退到本地的分支**。
- 生命周期：本地由启动器持有进程组，`terminate` 先 SIGTERM 整组、2 秒后 SIGKILL，stderr 读取器留 250 ms 排空；`Drop` 也会终止。
  执行器路径 `terminate` 发 `process/terminate`，`Drop` 时异步再发一次（无 Tokio 运行时则只记日志）；**执行器侧的 WebSocket 断开时，exec-server 终止该连接下剩余的全部托管进程**；断连时进程事件流报 `Failed`。
  Windows 下执行器拉起的服务端**保留执行器的常规后代生命周期**，注释说 MCP 专属的容纳需要协商进程归属，未做。
- 与其他机制的耦合：执行器拥有的服务端**不许用托管 ChatGPT 鉴权**（要求「配置执行器拥有的凭据」）；`http_headers_helper` 只对本地服务端可用。
  HTTP：源码里非本地环境的 HTTP 服务端走**该环境的 HTTP 客户端**发出——文档副本却说「streamable HTTP 远端落点未实现」，不一致只记录。
- 自述的坑：`codex-mcp` 在选启动器处留 TODO「待执行器路径保留本地启动器语义后再统一」——即两条路径当前**语义不等价**（进程组、Job Object、stderr 排空只在本地一侧）。

### 官方 TS SDK v1（1.29.0 / 1.30.0）

- 拉起位置：`StdioClientTransport.start()` 用 `cross-spawn` 在**调用方进程所在机器**上起子进程，`shell: false`。
- 能否自定义 spawn 或传入已有流：**构造参数只有** `command`、`args`、`env`、`stderr`、`cwd`（1.30.0 起多一个 `maxBufferSize`），没有 spawn 钩子，也不接受外部流。
  要把进程放到别处，只能**自己实现 `Transport` 接口**（`start/send/close` + 三个回调）交给 `Client.connect`；帧工具 `ReadBuffer`、`serializeMessage` 在 `shared/stdio.js`，经包的 `./*` 导出可引用。
- 环境：**总是**以白名单 `HOME/LOGNAME/PATH/SHELL/TERM/USER`（Windows 另一组）打底，再叠加传入的 `env`——类型注释说「未指定时用默认环境」，实现是**指定了也合并**。
  这意味着 DSH 传进来的是「整份宿主环境减黑名单」，白名单打底对它没有收窄作用。用户与权限：无配置项。
- 生命周期：`close()` 先关 stdin，等 2 秒，未退出发 `SIGTERM`，再等 2 秒，仍未退出发 `SIGKILL`——**信号只发给直接子进程**，没有进程组、没有 detached。
  推断：经 `npx`、shell 包装脚本拉起的服务端，其孙进程不在信号范围内（第二轮已记四家出过孤儿，见 E-17、E-19～E-21、E-26、E-27）。
  stderr 缺省 `inherit`。1.29.0 的读缓冲**无上限**，1.30.0 加了 10 MB 上限、超限报错并关传输。
- 协议版本（顺带）：两版的 `LATEST_PROTOCOL_VERSION` 都是 `2025-11-25`，支持列表到 `2024-10-07`，**没有 2026-07-28**。

### 官方 TS SDK v2（`@modelcontextprotocol/client` 2.0.0）

- 拉起、环境、关闭顺序与 v1 相同（同样只杀直接子进程）；帧工具 `ReadBuffer`、`serializeMessage`、`deserializeMessage` 从**包入口**导出，自写传输不必走深路径。
- 新增的一处拉起行为：版本协商为 `'auto'` 或钉版本时，若传输**恰好是 SDK 的基类 `StdioClientTransport`**，客户端先按同一组参数**另起一个一次性的旁路子进程**，
  在它上面发 `server/discover` 探测，探完回收，再启动真正的会话进程——即**同一个服务端命令被拉起两次**。
  源码注释给的理由：「在任何 `initialize` 之前的请求都会让基于某些 SDK 的 stdio 服务端退出」，所以探测不能花掉调用方那一次进程生命。
  子类或自写的 stdio 形传输**就地探测**（按 `stderr`/`pid` 两个访问器结构识别为 stdio）。协商模式缺省是 `'legacy'`，不探测。
- 撞上会怎样：若自写传输把进程放到执行器或容器里，又开了 `'auto'` 协商，就走就地探测，旁路保护不在；若沿用基类，每次连接在本机起两个进程。

### 官方 Python SDK（v1.28.1 / v2.0.0；OpenAI Agents 与 LangChain Python 都经它拉起）

- 拉起位置：调用方进程的子进程；POSIX 下 `start_new_session=True`，**新会话即新进程组**，关闭时按进程组 `killpg` 整树终止；Windows 另有进程树终止。
- 环境：白名单打底叠加传入 `env`（与 TS 同形）。关闭：先关 stdin，等 2 秒，再走进程树终止的 SIGTERM → SIGKILL。
- 与 TS 的差别：**Python SDK 按进程组杀，TS SDK 只杀直接子进程**——同是官方 SDK，孤儿行为不同。

### OpenAI Agents Python（`32edd3c3`）

- 拉起位置：`MCPServerStdio` 把参数原样交给 Python SDK 的 `stdio_client`，即 agent 进程的子进程。参数有 `command/args/env/cwd/encoding`，无用户或权限项。
- 能否交外部执行器：`create_streams()` 是抽象方法，子类可以返回任意一对读写流——**扩展点在「流」这一层，不在「spawn」这一层**。
- 与它自己的沙箱：`SandboxAgent` 保留 `mcp_servers` 参数，文档写「外层运行时仍拥有审批、追踪……；沙箱会话经其后端管理命令与文件变更」；
  官方示例把 stdio MCP 服务端注释为「另一个本地进程」，与沙箱里的 shell 能力并列。读遍 `src/agents/sandbox/` 的 89 个文件，MCP 只作为参数透传与记忆条目类型出现，**没有把 MCP 服务端放进沙箱会话的路径**。
- 生命周期：随 `connect()` / `cleanup()`；`mcp` 锁定 2.0.0，进程组终止由 SDK 负责。

### LangChain（JS `12626c25` / Python `52a4535f`）

- JS：直接构造官方 v1 的 `StdioClientTransport`；给了 `env` 时额外补上宿主 `PATH`；可配 `cwd`、`stderr`；stdio 有 `restart`（是否重启、次数、间隔）。拉起位置同 SDK。
- Python：交给 Python SDK；`env` 的值里 `${VAR}` 用**宿主**环境展开。第二轮已记它在无显式会话时**每次工具调用新建会话**（E-22）——对 stdio 即**每次调用拉起一个新进程**。
- 两者都没有自定义 spawn 或执行器的入口。

### Vercel AI SDK（`@ai-sdk/mcp` 2.0.56）

- 拉起位置：自写的 `StdioMCPTransport`，`cross-spawn` 起子进程，`shell: false`，传入 `AbortSignal`。
- 环境：先放入配置的 `env`，**再用白名单变量覆盖**——读代码：配置里写的 `PATH` 会被宿主的 `PATH` 盖掉。可配 `cwd`、`stderr`。
- 关闭：`close()` 只 `abort()` 信号，由 Node 对直接子进程发终止信号，**不等待、不升级 SIGKILL**（读代码推断）。
- 可交外部执行器：文档说可以「实现 `MCPTransport` 接口自带传输」；文档同时写明「stdio 只用于本地服务端，不能部署到生产环境」，生产推荐 HTTP。
  内建 stdio 传输声明支持 `server/discover` 探测，**就地探测**（不另起旁路进程）。

### Claude Code 与 Claude Agent SDK（厂商自述，2026-09-23 抓取）

- 拉起位置：「stdio 服务端作为你机器上的本地进程运行」；Claude Code 会在其环境里设置 `CLAUDE_PROJECT_DIR`，并以 `roots/list` 回答启动目录与附加工作目录。
- 与它的沙箱的关系，文档反复写明：Bash 沙箱**只**约束 Bash、PowerShell、Monitor 命令及其子进程；「内建文件工具、MCP 服务端与 hooks 仍直接在宿主机上跑」「MCP 服务端与命令 hook 是在宿主机上**不受约束**的独立进程」。
  沙箱还专门禁止写 `.mcp.json` 等配置文件，理由是「能改这些文件的命令……可以添加一个 Claude Code 在沙箱**之外**运行的 MCP 服务端」。
- 要把 MCP 服务端也关进边界，文档给的是**把整个 Claude Code 进程挪进去**：沙箱运行时 `@anthropic-ai/sandbox-runtime`（「同一条命令也可以单独沙箱化 MCP 服务端或其他辅助进程」）、dev container（stdio 服务端依赖的二进制装进 Dockerfile，服务端定义放项目级 `.mcp.json`）、自建容器、虚拟机、云会话。
  云会话里，仓库 `.mcp.json` 的服务端随 clone 在云端 VM 里拉起，用户级与本地级的服务端不带过去；插件服务端在空闲唤醒后按需再拉起。Remote Control 则让会话留在本机，本地 MCP 服务端照常可用。
- **没有逐服务端的远端落点**：读遍所取七页，没有「这一个 stdio 服务端放到别处」的配置项。
- Agent SDK：`McpStdioServerConfig` 只有 `command/args/env/timeout/alwaysLoad`，**没有 `cwd`**；SDK 提供的是 `spawnClaudeCodeProcess` 钩子——把**整个 Claude Code 进程**起在「VM、容器或远程环境」里，MCP 服务端随之在那边拉起。
- v2 运行时：只对 HTTP 服务端做版本协商，stdio 要设 `MCP_PROTOCOL_NEGOTIATION=auto` 才探测（是否走 SDK 的旁路进程，文档未说）。空闲超时 stdio 为 30 分钟（第二轮 E-27）。

### Docker MCP Gateway（`a34df45d`）

- 拉起位置：网关进程对每个「本地」服务端执行 `docker run --rm -i --init --security-opt no-new-privileges --cpus <n> --memory <m> --pull never … <image> [command]`，
  **stdio 就是 `docker run -i` 这个 CLI 子进程的 stdin/stdout**；网关自己再以 stdio、SSE 或 streaming 对客户端暴露。
- 可配项：CPU（缺省 1）、内存（缺省 2Gb）、`--network none`（服务端声明禁网时）或挂到网关网络、按允许主机起代理并 `--link`、卷（校验防注入）、镜像签名校验（缺省开）、`--block-secrets`（缺省开）。
  环境与凭据：密钥以 `-e NAME` 只把**名字**放进 argv，值放在 `docker` CLI 进程自己的环境里；找不到的密钥**填 `<UNKNOWN>` 继续起**（只记一行警告）。用户与权限：容器隔离 + `no-new-privileges`，无 `--user` 参数。
- 生命周期：**缺省不长驻**——每次工具调用 `AcquireClient` 新起一个容器、调用完 `ReleaseClient` 关会话，`--rm` 清容器；
  服务端声明 `LongLived` 或网关开 `--long-lived` 时按（服务端名, 客户端会话）缓存，文档说「适合有状态的服务端」，直到网关停止或该会话释放。
  静态模式（`--static`）下服务端容器预先起好，网关用 `socat STDIO TCP:mcp-<name>:4444` 接进去。
- 撞上会怎样：「每次调用一个容器」让有状态的 stdio 服务端每次都从零开始，启动开销按调用计；长驻按客户端会话分键，不跨会话共享。

### mcp-proxy（`sparfenyuk/mcp-proxy` `153a96a6`）与 supergateway（`874951c7`）

- 两者都是「把 stdio 服务端包成网络服务」的独立进程，拉起位置是**代理所在的机器**；客户端再经 SSE / Streamable HTTP（supergateway 另有 WS）连它。常见用法是把代理与服务端一起放进容器（supergateway 自带镜像，文档示例 `docker run … --stdio "npx …"`）。
- mcp-proxy：每个配置的服务端在代理启动时**只拉起一次**，由所有 HTTP 客户端共用；`--cwd`、`--env`、`--pass-environment`（全量继承，缺省否）；服务端一侧的中间件**只有 CORS**，读遍 `mcp_server.py` 无鉴权；缺省只监听 127.0.0.1。
- supergateway：`shell: true`、继承代理的全部环境；**无状态 Streamable HTTP 模式每个 HTTP 请求起一个子进程**，有状态模式每个会话一个（带会话超时），SSE 模式全部客户端共用一个；
  子进程 `detached` 成组，关闭时按组 SIGTERM、5 秒后 SIGKILL（注释：「包装进程退出不代表后代退出」）；README 自述子服务端须处理 SIGTERM、关掉接在 stdin 上的管道也会停掉网关。
- 撞上会怎样：代理层替客户端承担了拉起与杀进程，客户端侧看到的已是 HTTP——**原来 stdio 的「连接断了即进程死了」这一对应关系被拆开**；共享一个进程时，多个客户端（多个会话、多个租户）的调用落进同一个服务端进程。

## 三、按主题的横向对照

### 3.1 拉起的决定权在谁

- **客户端库自己 spawn、无钩子**：官方 TS SDK v1/v2、官方 Python SDK、Vercel、LangChain（两份）、DSH（经 SDK）。
- **客户端库留了「流」层扩展点**：TS SDK 的 `Transport` 接口、OpenAI 的 `create_streams()`、Vercel 的 `MCPTransport`。都要**自己重写帧与生命周期**，不是「换一个 spawn 函数」。
- **逐服务端选落点**：只有 Codex（实验性，启动器 trait 密封，执行器是自家 `exec-server`）。
- **整进程搬家**：Claude Code（沙箱运行时、dev container、云会话、Agent SDK 的 `spawnClaudeCodeProcess`）、Codex 的 SSH 远端主机模式、DSH 否决过的「整个 harness 跑进远端环境」。
- **中间层代拉起**：Docker MCP Gateway（容器）、mcp-proxy、supergateway（网络代理）。

### 3.2 桥接方式

| 桥 | 谁用 | 帧在哪做 | 关闭信号怎么到进程 |
|---|---|---|---|
| 本机管道 | 大多数客户端库 | 客户端进程 | 客户端直接发信号 |
| 执行器进程 API（WebSocket JSON-RPC 搬原始字节） | Codex | **编排进程**；执行器不懂 MCP | `process/terminate`；WebSocket 断即全杀 |
| `docker run -i` 的 CLI 管道 | Docker MCP Gateway | 网关进程 | 关会话 → CLI 退出 → `--rm`（`--init` 在容器内转发信号） |
| `socat STDIO TCP:…` | Docker 静态模式 | 网关进程 | 容器预起，不随连接 |
| stdio → SSE / Streamable HTTP / WS 代理 | mcp-proxy、supergateway | 代理进程 | 代理决定；客户端断开不必然杀进程 |
| 整进程搬家（stdio 仍是本地管道） | Claude Code、Codex SSH 主机 | 搬过去的 agent 进程 | 同本机 |

### 3.3 环境变量：白名单、黑名单、执行器一侧

- 白名单打底：官方 TS / Python SDK（6 个）、Vercel（同 6 个，且覆盖配置值）、Codex 本地（11 个 + 点名）。
- 黑名单：DSH（剔除凭据形名字与 `DSH_*`，其余全带）。
- 全量继承：supergateway、mcp-proxy 开 `--pass-environment` 时。
- **执行器一侧取值**：Codex 远端路径不带编排机环境，`source = "remote"` 从执行器读；Docker 网关把密钥值放在 `docker` CLI 的环境里、argv 只放名字。
- 撞上会怎样：拉起位置一换，「哪一侧的环境是底」就换；Codex 为此专门分了 `local`/`remote` 两种来源，本地路径遇到 `remote` 来源直接报错。

### 3.4 工作目录

- 可配且缺省继承：TS SDK、Python SDK、Vercel、LangChain、DSH、mcp-proxy。
- **远端必须显式**：Codex 执行器路径缺 `cwd` 即失败（远端没有「继承当前目录」可言）。
- 不可配：Claude Agent SDK 的 stdio 配置无 `cwd`；Claude Code 改为注入 `CLAUDE_PROJECT_DIR` 并回答 `roots/list`。
- 容器：Docker 网关由镜像决定，supergateway 文档说服务端在容器根目录 `/` 运行。

### 3.5 用户、权限与沙箱

- 没有一家客户端库提供 uid/gid 之类的参数；所有「降权」都来自外层：容器（Docker 网关）、整进程沙箱（Claude Code 沙箱运行时）、执行器所在环境（Codex）。
- **两家明说自家沙箱不管 MCP 服务端**：Claude Code（Bash 沙箱不含 MCP）、Codex（执行器请求 `sandbox: None`；网络代理规则不限制 MCP）。Codex 另把沙箱状态经 `_meta` 交给声明了能力的服务端自行执行。
- OpenAI `SandboxAgent`：沙箱会话管命令与文件，MCP 服务端在外层。

### 3.6 生命周期与孤儿

| 做法 | 谁 |
|---|---|
| 新进程组 / 会话，按组终止 | Codex 本地、官方 Python SDK、supergateway |
| 只杀直接子进程 | 官方 TS SDK v1/v2（DSH、LangChain JS、Claude Agent SDK 的 peer 同此） |
| 只 abort，不等待不升级 | Vercel（推断） |
| 远端连接断开即全杀 | Codex exec-server |
| 容器 `--rm` + `--init` | Docker MCP Gateway |
| 每次调用一个进程 | Docker 网关缺省、supergateway 无状态模式、LangChain Python 无显式会话时 |
| 一个进程服务所有客户端 | mcp-proxy、supergateway SSE 模式、DSH 全局装载实例（首轮 E-2） |

## 四、摘要：源 × 拉起位置 × 可交外部执行器 × 桥接 × 生命周期

| 源 | 拉起位置 | 可交外部执行器或容器 | 桥接方式 | 谁杀、怎么杀 |
|---|---|---|---|---|
| MCP 规范 | 客户端的子进程 | 未定义 | stdin/stdout | 客户端：关 stdin → SIGTERM → SIGKILL（SHOULD） |
| DSH | harness 进程（SDK spawn） | **否**；执行世界接缝存在但 SDK spawn 绕过它（作者自述） | 本机管道 | SDK `close()` + 1 秒等关闭 |
| Codex | 逐服务端：编排进程或执行器 | **是**（实验性，`environment_id`，密封 trait） | 本地管道 / exec-server 搬字节，帧在编排进程 | 本地进程组 2 s 升级；远端 `process/terminate`、断连全杀；无回退 |
| 官方 TS SDK v1 | 调用方进程 | 仅能自写 `Transport` | 本机管道 | 直接子进程：stdin → 2 s → SIGTERM → 2 s → SIGKILL |
| 官方 TS SDK v2 | 同上；`auto` 协商时另起旁路探测进程 | 同上（自写则就地探测） | 本机管道 | 同 v1；旁路进程先 SIGTERM 1 s 后 SIGKILL |
| 官方 Python SDK | 调用方进程，新会话 | 否（上层可换流） | 本机管道 | 进程组 killpg |
| OpenAI Agents | agent 进程（经 Python SDK） | 子类改 `create_streams()`；SandboxAgent 不含 MCP | 本机管道 | SDK 进程组 |
| LangChain JS / Py | 调用方进程 | 否 | 本机管道 | SDK；JS 有 `restart`；Py 可能每调用一进程 |
| Vercel | 调用方进程 | 自写 `MCPTransport` | 本机管道 | abort 直接子进程 |
| Claude Code | Claude Code 进程所在处 | 只能**整进程**搬（沙箱运行时、容器、VM、云会话、`spawnClaudeCodeProcess`） | 本机管道 | CLI 自管（闭源） |
| Docker MCP Gateway | 网关经 `docker run` 起容器 | **是**（就是容器） | `docker run -i` 管道 / `socat` | 缺省每调用一容器；长驻按会话 |
| mcp-proxy | 代理进程 | 代理可整体进容器 | stdio → SSE / Streamable HTTP | 随代理进程；所有客户端共用 |
| supergateway | 代理进程 | 同上（自带镜像） | stdio → SSE / WS / Streamable HTTP | 进程组，5 s 升级；按请求 / 会话 / 共用 |

## 五、N-11 两种取值各自撞上会怎样（只列事实与后果，不给推荐）

### 取值甲：拉起位置受执行环境落点约束

- **同行先例只有一家**：Codex 的逐服务端 `environment_id`，且为实验性。它的形状：启动器二选一、执行器只搬字节、帧留在编排进程；远端必须显式 cwd；环境从执行器一侧取；**不对服务端施加沙箱**；落点解析失败即该服务端启动失败、**不回退本地**——最后一点与 [PF-005 §6.9](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) 同向。
- **官方 TS SDK 的 stdio 传输用不上**：v1/v2 都没有 spawn 钩子，只能自写 `Transport`；v2 在 `'auto'` 协商下对自写传输就地探测，SDK 为「pre-initialize 请求即退出」的服务端准备的旁路保护不在。DSH 的教训同源：它有执行世界接缝，但 MCP 因 SDK 自持 spawn 而绕过了它。
- **两条路径语义不等价**：Codex 自留 TODO，本地的进程组、Job Object、stderr 排空在执行器路径上没有；Windows 下执行器拉起的服务端保留执行器的常规后代生命周期。取甲意味着终止、孤儿与 stderr 的保证**随落点变**（第二轮已记这些由拉起方负责）。
- **与「落点每次执行现算」的时间尺度不同**：[PF-005 §5.3](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#53-换执行环境是换一个值不是开关一套机制)、[§6.1](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配) 的落点是**每次工具执行**算一次；stdio 服务端是跨多次调用的长驻进程。同行里把两者对齐的办法只有两种——
  每次调用一个进程（Docker 网关缺省、supergateway 无状态、LangChain Python），代价是有状态服务端每次从零开始、启动开销按调用计；
  或连接随环境选择变化而重建（Codex 在每步前按环境选择标脏，首轮 E-12）。按 [PF-005 §5.1](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境) 的四种环境看：无状态沙箱「活一次工具调用」对应前者；会话级沙箱到点销毁时进程随之死，走断连与替换件那条路（[PF-006 §6.3](../../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)）；租户级沙箱让一个进程被该租户的多个会话共用。
- **凭据的来路随落点换**：Codex 为此分了本地 / 执行器两种环境来源，执行器服务端不许用托管鉴权、头助手只限本地；Docker 网关把密钥值放在 CLI 环境里。取甲时 N-5「不跨租户身份共用凭据」的承载点要按落点分别给出。
- **沙箱对 MCP 服务端的约束不是自动的**：Codex 把服务端送到执行器，却显式不套沙箱；Claude Code 与 OpenAI 的沙箱都不含 MCP。「落在沙箱所在的环境」与「受沙箱约束」在同行里是两件事。

### 取值乙：一律在据点机上拉起

- **这是同行的主流**：DSH、官方 TS / Python SDK、OpenAI Agents（包括 `SandboxAgent`）、LangChain、Vercel、Claude Code（未整体搬家时）全部如此。官方 SDK 的 stdio 传输可直接用。
- **服务端进程的一切副作用落在据点机上**：Claude Code 文档原话「MCP 服务端……是在宿主机上不受约束的独立进程」。按 [PF-005 §6.2](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)，宿主机不提供租户隔离、必须显式允许；
  一个 stdio 服务端在据点机上写下的东西，其他租户的执行同样看得见。
- **与执行环境权限的对账**：[PF-005 §6.8](../../../design/product/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的) 说「没声明要用执行环境的工具，这一维对它不适用」。
  取乙时，MCP 带来的动作要么声明不用执行环境（服务端进程仍在宿主机上做事），要么声明要用——那么 `never-allow` 之下它无处可落，按 §6.9 只能拒绝。同行里没有一家处理这个组合：它们的沙箱本来就不管 MCP。
- **同行为这条路付过的代价**：Claude Code 专门禁止沙箱内命令写 `.mcp.json` 等配置，因为那等于「添加一个在沙箱之外运行的 MCP 服务端」；要把 MCP 也关进去，它们的答案是整进程搬家——在 D-022「会话与 Run 与工具执行在用户本机」的形态下，这对应把整个据点进程放进隔离环境，而不是某一个服务端。
- **想要隔离又不改拉起位置的中间做法**：据点机上起的是容器或代理（Docker 网关的 `docker run -i`、沙箱运行时包一层命令），拉起进程仍在据点机，副作用落在容器里。这时「拉起位置」与「副作用落点」是两个量；N-11 的现有表述只说了前者。

## 六、失败的推断、未取得与局限

- 起初按首轮对照表以为 Codex 的配置项叫 `experimental_environment = local | remote`；**同 commit 源码里只有 `environment_id`（任意字符串，缺省 `local`）**。首轮那一格引的是文档副本，本轮不改写，只在 changelog 记为不一致。
  同理，文档副本说「streamable HTTP 远端落点未实现」，源码里非本地环境的 HTTP 服务端走该环境的 HTTP 客户端；是否另有开关挡着，本轮未查。
- 起初以为官方 TS SDK v2 只是改了包名；读发布包后发现它在 `'auto'` 协商下对基类 stdio 传输**另起旁路进程**——不读包看不出来。
- **未取得**：MCP 规范 2026-07-28 版 transports 页（按路径取回失败）；Claude Code 本体（闭源，stdio 服务端的进程组与环境继承无从核对）；`rmcp 3.2.0` 源码；Docker MCP Gateway 的 `--long-lived` 以外的回收时点（只读了 `clientpool.go`、`handlers.go`、`stdio.go` 与参数参考）；
  Python SDK v1.19～v1.27 的进程组行为（只核了 1.28.1 与 2.0.0）；Codex 执行器所在环境自身的隔离性质（`exec-server` 的 `process_sandbox` 未读）。
- **读遍无**（在所列范围内）：DSH `mcp-client` 与 `sandbox`、`e2b` 包里对 MCP 的处理；OpenAI `src/agents/sandbox/` 里把 MCP 服务端放进沙箱的路径；Claude Code 七页文档里逐服务端的远端落点；mcp-proxy 服务端一侧的鉴权；Codex 源码中的 `experimental_environment` 字样。
- 没有运行任何代码；Vercel 的关闭行为与 TS SDK 孙进程不在信号范围内两条为读代码推断。
