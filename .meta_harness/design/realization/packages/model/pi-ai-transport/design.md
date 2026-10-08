# pi-ai-transport 实现设计

> 本批设计已接受（2026-09-26，D-062／D-065）。此状态不表示实现或实际验证完成。

契约：[`capability.model-request-runtime` v2](../../../../spec/capabilities/model-request-runtime/v2/contract.md)（下文「契约 S-n」「契约 G-n」都指它；引别的契约写全坐标）。
本页的导出名、服务键、插件名、日志事件名、配置项名一律是**候选**；源码不存在。契约的九件事不复述，只写本节点上的兑现点与缺口。

## 实现路径与来源

**定向 fork pi 的传输一层，放进本 monorepo 一个包；HTTP 用 Node 内置 `node:https` 直发，不带 pi 的 SDK 依赖。**

- **方向与基线已接受**：D-019（以 pi-ai 的 OpenRouter 协议请求与流／工具解析为基线，定向 fork；目录估价不得冒充实际费用；拒绝整包服务层）；D-063 R-5 与 D-019 追加 2026-09-25（基线 `earendil-works/pi` 提交 `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，即 `@earendil-works/pi-ai@0.86.1`；**只取传输一层**：请求发出、流片段接收、供应商错误映射；其余 pi 代码不进来）。2026-10-02 按 R-5「按需同步」改锚到 1.0.0 发布提交 `a13d35a`，代码未改（D-019 追加 2026-10-02）。R-5 比 D-019 原文窄：**pi 的模型目录不进来**——本系统的档案归 `capability.model-profile-directory`，目录费率本来就不许用。
- **流片段语法**：D-035——pi 只在传输适配处被翻译进来；保留前提 1（fork 禁止中间解析、唯一解析点在装配器）与 2（custom grammar 分支会构造 JSON 增量）由本节点的 [fork 边界](#fork-边界)兑现：普通 function 分支去掉 `parseStreamingJson`，custom grammar 分支整个不取。
- **上游语义的来源**：pi 0.86.1 的行为读数全部来自研究 `model-request-transport-sources`（`.meta_harness/research/` 下，证据记录 E2、E3；OpenRouter 用量文档 E11）——**离线读数，未升 basis，一律是待核对主张**。fork 之后这些行为变成本包自己的代码，证据改为本包的符合性测试（[verification](verification.md#证据义务)），不再需要以「上游缺省行为」立 basis；契约 [G-10](../../../../spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口) 已按 D-060 §八 N-40 ④ 采用本包 T-1～T-11 为验证路径；测试尚未执行，不能据此称 G-10 已兑现。**Node `node:https` 的三条行为**（不跟随重定向、请求没有缺省总超时、`signal` 中止在途请求）是**假设，须按 source-check 取证**；本包的符合性测试恰好会在它们变了时失败（[verification](verification.md#证据义务) T-9、T-1、T-10）。
- **Cordis 采用版本** `@deepseek-ai/cordis` 4.0.4（D-025），只在插件子入口里用；插件层共用件取 [kernel-basis](../../../../../../packages/core/kernel-basis/README.md)（`definePlugin`）。
- **同批 core 纯模块**（接口由那边定，本页只写用法）：[arrival-events](../../core/arrival-events/README.md)（事件类型）、[content-blocks](../../core/content-blocks/README.md)（块类型、`readJsonStrict` 严格无损 JSON 读）、[call-accounts](../../core/call-accounts/README.md)（`Usage`、`Cost`、`ExactDecimal`）、[messages](../../core/messages/README.md)、[model-profile](../../core/model-profile/README.md)、[model-response](../../core/model-response/README.md)、[tool-definition](../../core/tool-definition/README.md)（`ModelToolEntry`）、[loop-extension](../../core/loop-extension/README.md)（`FailureCause`，只供候选状态码表的类型）。传输接口的类型 `TransportAdapter` 由 [model-request-runtime](../model-request-runtime/design.md#公开面) 的函数面导出，本包**只作类型依赖**（消费方定端口；它不 import 本包）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| **HTTP 用 `node:https` 直发，SSE 分帧取 pi 自己的 `parseSSE`**（选）；落选一：照 pi 用 `openai` SDK 6.40.0 的 `chat.completions.create().withResponse()`；落选二：用全局 `fetch` | 一：fork 的差分最小，SDK 的 SSE 解析与错误对象久经使用，升级时整段照搬即可。二：`fetch` 是 Web 标准，pi 的 `parseSSE` 原本就吃 `Response` | 自己握请求：状态码、重定向、分帧、缓冲上界都要本包测；与 pi 的 `stream()` 外壳分叉更大，同步上游要手工对 | 中高：SDK 路径**拿不到结构化状态码**（研究 E2：`formatProviderError` 只拼文本，契约 S-38 第 2 条要从实际响应取）、有自带的请求超时与重试参数要逐个压住、**读不到原始字节**——而 `cost` 要按精确十进制读（`data.call-accounts/v2` [S-5](../../../../spec/data/call-accounts/v2/contract.md#s-5-金额美元十进制不截断)，`JSON.parse` 会把它读成二进制浮点）；全局 `fetch` 的调度器带缺省的首部与正文超时（假设，须按 source-check 取证），要改就得引 npm `undici`——那是一个未经决定的新依赖，而且它会悄悄给 MRR S-21 的两个时限设项封顶 |

## fork 边界

**来源**：`earendil-works/pi` 1.0.0 发布提交 `a13d35a`，`packages/ai/src/`（下表路径都相对它）。下表初稿按 0.86.1 之后的 `3390bd9` 写成，那份来源归档的 SHA-256 记在研究 `model-request-transport-sources` 证据记录的「取证条件总览」里（`29b35ae6…`）；两版之间下表所涉两个文件的改动逐处处置与新归档的哈希见 D-019 追加 2026-10-02。**取的是函数与片段，不是整文件照搬**；每个取来的片段在本包里保留原作者的 MIT 许可声明与「来自哪个文件、哪个提交、改了什么」的头注。

| 上游位置 | 取不取 | 在本包里改了什么／为什么不取 |
| --- | --- | --- |
| `api/openai-completions.ts` 流循环（`for await (const chunk …)` 那一段与 `finishBlock`） | **取，重写输出口** | 直接产出 `data.arrival-events` 的增量（[下节](#上游的流怎样译成到达事件)），不再推 pi 的 `AssistantMessageEvent`、不带 `partial`；**去掉每个增量上的 `parseStreamingJson` 与封口时的解析**（D-035 前提 1）；`chunk.model` 不论与请求是否相同都记（`data.model-response/v2` [S-9](../../../../spec/data/model-response/v2/contract.md#s-9-路由留痕) 的 `upstreamModel` 是原样回报）；另读顶层 `chunk.provider` 与 `usage.cost`／`is_byok`／`cost_details`（D-019 两处丢失的来源）；`finish_reason = length` 时**不替开着的块封口**（`data.arrival-events/v2` [S-13](../../../../spec/data/arrival-events/v2/contract.md#s-13-封口)：被写到上限截断的块不得由生产者封口） |
| 同文件 `convertMessages` 的 user／assistant／toolResult 三支、`normalizeToolCallId` | **取，删去调用 `transformMessages`** | 输入改为本系统的 `data.messages` 消息（[线上请求怎样组](#线上请求怎样组)）；system 一支自写（pi 0.86 的 transcript 折叠不取）；**「工具结果只有图 ⇒ `(see attached image)`」与「模型不收图 ⇒ 丢图」两条静默路径改为规划拒绝**（契约 S-38 第 7 条） |
| 同文件 reasoning_details 的几个辅助函数（`isOpenAIReasoningDetail`、`parseOpenAIReasoningDetails`、`appendOpenAIReasoningDetail` 等） | **取** | 结果写进思考块的 `opaque`（`data.content-blocks/v2` [S-9](../../../../spec/data/content-blocks/v2/contract.md#s-9-思考块与不透明数据)），不再塞进 `thinkingSignature` 字符串 |
| 同文件 cache_control 的几个辅助函数（`getCompatCacheControl`、`applyAnthropicCacheControl`、`addCacheControlTo*`） | **取** | 哪些路由打断点、保留多长改由配置项 `routeWireHints` 与 `promptCacheRetention` 给（[策略配置项](#策略配置项)）；**不读环境变量 `PI_CACHE_RETENTION`**，**不按路由名前缀认 `anthropic/`**（`data.model-profile/v2` [S-2](../../../../spec/data/model-profile/v2/contract.md#s-2-routename)：本系统不解析路由名） |
| 同文件 `convertTools` | **取，只留键名映射** | 按 `data.tool-definition/v2` [S-6](../../../../spec/data/tool-definition/v2/contract.md#s-6-模型面只有一个条目) 纯键名映射，**不改写 schema、不加 `strict`**；`getJsonSchemaToolParameters` 与 grammar 一支不取 |
| 同文件 `mapStopReason`、`detectCompat` 的 OpenRouter 取值 | **取，化成常量** | 不再按 provider 名、base URL 与路由名前缀推断（pi 按 `anthropic/`、`openai/` 前缀定 developer 角色与缓存格式，与 `data.model-profile` S-2 相反）；只留一份 OpenRouter 的线上约定，逐项列在[线上请求怎样组](#线上请求怎样组)，逐路由的差别改由配置 `routeWireHints` 按路由名精确匹配给出 |
| 同文件 `stream`／`streamSimple`／`createClient`、`buildParams` 里其余供应商的分支 | 不取 | OpenAI SDK 客户端与 `retryProviderRequest`；zai、qwen、deepseek、together、baseten、kimi、Copilot 等与 OpenRouter 无关；`prompt_cache_key` 与 `x-session-id` 取自会话标识（契约 S-38 第 6 条禁止） |
| `api/openai-codex-responses.ts` 的 `parseSSE` | **取，改口** | 输入由 Web `Response` 改为 `node:https` 的响应流；`JSON.parse` 换成 `readJsonStrict`（精确十进制、重复成员即读不出）；统一换行；单事件缓冲设上界（`maxSseEventBytes`） |
| `api/transform-messages.ts` | 不取 | 它做的四件事三件与本系统契约相反：模型不收图时换占位文本（S-38 第 7 条）、给没有结果的工具调用补一条「No result provided」（凭空造内容）、跳过出错或中断的助手消息（本系统里用户中断的回复是一条要进上下文的消息，`data.messages` S-10）；第四件（跨模型把思考改成正文）归本包的回放规则 |
| `api/anthropic-messages.ts` | 不取 | 只走 chat-completions 一条线（[下表](#线上请求怎样组)的选择） |
| `api/constrained-sampling.ts` | 不取 | 会改写工具的参数 schema；custom grammar 分支就是 D-035 前提 2 点名的那一支 |
| `utils/json-parse.ts`（连同依赖 `partial-json`） | 不取 | 中间解析（D-035 前提 1） |
| `utils/provider-retry.ts` | 不取 | 一次发出之内不重试（契约 S-38 第 1 条） |
| `utils/error-body.ts` | 不取 | 它探的是各家 SDK 错误对象的字段；直发之后状态码与响应体就在手上。它把响应体截到 4000 字符，与「原样」相反（`data.model-response/v2` [S-15](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码)） |
| `utils/sanitize-unicode.ts` | 不取 | 会静默删掉孤立代理项；不删，序列化照 JSON 转义发出，上游若拒收即以状态码收场 |
| `models.ts`（`calculateCost`、`applyAuth`）、`providers/openrouter.ts`、`providers/openrouter.models.ts`、`auth/*`、`utils/provider-env.ts` | 不取 | 目录估价不得冒充实际费用（D-019）；`envApiKeyAuth` 在没给 key 时回落到环境变量 `OPENROUTER_API_KEY`（研究 E2，S-38 第 5 条禁止）；模型目录 R-5 排除 |
| `types.ts` | 只取用到的几个内容类型的形状作注释对照 | 本包的类型一律来自同批 core 包，不另立 pi 的类型 |

**依赖**：运行时只有同批 core 包、`node:https`／`node:stream`／`node:crypto`；插件子入口另加 `@deepseek-ai/cordis` 4.0.4 与 kernel-basis。**不带 pi 的任何 npm 依赖**（`openai`、`partial-json`、`@anthropic-ai/sdk` 等都不进来）。

**许可随包记**：pi 以 MIT 发布（仓库根 `LICENSE`，版权人 Mario Zechner，SHA-256 `0457f5bc…3c48`）。本包根放一份逐字副本（候选文件名 `LICENSE.pi`），每个取来的片段头注保留版权行；包的 `UPSTREAM.md`（候选）与机读的 `provenance.json`（候选）记：上游仓库与提交、归档 SHA-256、每个取来片段的上游路径与该文件在基线提交上的 SHA-256（如 `api/openai-completions.ts` 为 `b06508ab…ac51`、`api/openai-codex-responses.ts` 为 `ea1860ea…ddc8`）、本包对它做了什么改动。

**上游追踪只按需要同步**（R-5）：不跟版本号走。触发只有三种——上游修了本包取来的某一段（流循环、reasoning_details、cache_control、`parseSSE`）；OpenRouter 的线上约定变了；本包的符合性测试或比较门发现与 OpenRouter 实际行为不符。同步时对上游新提交与基线提交就上表「取」的那几个文件做差分，手工移植，重跑本包全部符合性测试与比较门里受影响的项，更新 `provenance.json` 的基线提交；**不整文件覆盖**。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：传输适配是可单独取用、可替换的构件（D-063 R-2、R-5）。包入口 `.` 是**公开函数面**，不 import Cordis、不读日志与存储、不带会话与租户身份；子入口 `./plugin` 是 **Cordis 服务面**。

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
| --- | --- | --- |
| `planRequest(input) → { planned } \| { rejected }` | **纯函数**：把一次发出要发的东西组成冻结的线上请求体，同时定下 `parameterAdjustments` 与 `droppedParameters`；不开连接、不读环境。输入：`target`（`{ callId: ModelCallId, dispatch }`，只用来登记 `CallId`）、`routeName`、`provider`（这一次的那一家）、`snapshot`、合并后的 `parameters`、`messages`、`tools`（`ModelToolEntry[]`） | 线上形状见[线上请求怎样组](#线上请求怎样组)；改值与丢项的形状 `data.model-response/v2` [S-11](../../../../spec/data/model-response/v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项)，处置规则 `data.model-profile/v2` [S-21](../../../../spec/data/model-profile/v2/contract.md#s-21-不静默丢也不静默改)；契约 S-38 第 10 条 |
| `sendRequest(planned, credential, signal, deps) → Promise<{ response } \| { failed }>` | **发一次**：`POST <base>/chat/completions`，`Authorization` 只放交进来的那一把；不重试、不回退、不跟随重定向、不读环境变量；非 2xx 读回响应体（有上界）并交回原样状态码与响应头 | 契约 S-38 第 1、2、5、6、9 条 |
| `readStream(response, signal, deps) → AsyncGenerator<ArrivalEvent, StreamEnd>` | 把 SSE 逐帧译成到达增量（`open`／`fill`／`close`／`account`），生成器的返回值是收尾事实 `StreamEnd`（[下节](#上游的流怎样译成到达事件)）；**不发 `finish`**——`finish` 由宿主按收尾事实交（契约 S-51 第 6 条） | `data.arrival-events/v2` S-7～S-16、S-20；契约 S-38 第 3、4、8、11 条 |
| `createPiAiTransport(options) → TransportAdapter` | 把上面三件与一个本实例拥有的连接池组成 model-request-runtime 要的传输接口；`options` 就是[策略配置项](#策略配置项)加 `baseUrl` 与可选的 `onDiagnostic` | 端口形状归 [model-request-runtime 的公开面](../model-request-runtime/design.md#公开面)（那边的 `TransportAdapter` 行已按三段对齐；工具条目由 P-2 经资产注册表 lookup 解析，PAT-N14 已由契约闭合） |
| `OPENROUTER_BASE_URL`、`PI_AI_CARRIABLE_MODALITIES`（`{ text, image }`） | 常量：固定的 base URL；本传输能送出的输入模态 | SYS-LLM；契约 [S-11](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-11-合法目标集合) 末段「本据点传输能承载的模态」 |
| `openRouterStatusCauseTable` | 候选的 `status_cause_table` 取值（[状态码与八个上交成因](#状态码与八个上交成因)）；**只是数据**，分类仍由 model-request-runtime 的 `classifyCause` 做 | 契约 S-18、[G-5](../../../../spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口) |

**Cordis 服务面**：插件 `pi-ai-transport` 以 `modelTransport` 登记 `createPiAiTransport` 造出的那一个对象（[投影](#契约到-cordis-的投影)）。插件自己不加任何行为——函数面与服务面是同一份实现。

**只在运行时层成立、函数层不承诺**（外面另包本包的人拿不到，要就自己补）：「已出门」先于出网（契约 S-15：P-2 在写下「已出门」之后才调 `sendRequest`；本包只保证请求的字节只在 `sendRequest` 里离开进程）；首 token 与「已开口」（S-16，P-2 看装配状态判）；成因分类（S-18，P-2 用表）；凭据每次现取、来源如实（S-19，P-2 取了交进来）；两个时限（S-21，P-2 计时、以中止信号到达本包）；脱敏（S-20，P-2 在写入前做；本包只保证不把凭据放进它自己交出的任何值）；**所有请求经 OpenRouter**（SYS-LLM）由装配兑现——插件恒用 `OPENROUTER_BASE_URL`，函数面用调用方交来的 `baseUrl`。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| **P-2 必需 inject 服务 `modelTransport`，本插件登记它**（选）；落选一：构造参数级的内部依赖（装配草图 N-2，model-request-runtime 节点现写法）；落选二：一个传输登记表服务，P-2 每次发出时从表里取 | 一：草图 N-2 的理由——消费者只有 P-2，做成服务则换一次传输就连带重跑 P-2 与全部 agent runtime；构造参数就能注入脚本化实现。二：换传输不必重跑 P-2 | 换传输（含改本插件配置）会让 P-2 与 inject `modelRuntime` 的 agent runtime 重跑，在途调用按契约 S-36 收成 `interrupted{run_cancelled}` | 中：D-063 R-2、R-5 把传输定为可替换的公开构件，草图 N-2 自己写的改选条件（出现第二个消费者）已经出现——函数面 `invokeModel` 让外部调用方直接拿传输；本插件拥有连接池，池要有生命周期拥有者，构造参数那一路要 P-2 替它开关。二的登记表同一时刻只会有一个实现（SYS-LLM 唯一出口），多一层没有收益；换传输是装配级事件，重跑的代价可接受 |

## 契约责任到兑现点

| 契约责任 | 插件、服务或公开操作 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| S-38 第 1 条：每一次只指定一家、禁止上游回退、一次发出之内不重试 | `planRequest` 写 `provider: { order: [provider], allow_fallbacks: false, require_parameters: true }`；`sendRequest` 恰一次出站；`extra` 里能改路由的键（`models`、`route`、`provider`）一律不发 | 尚未实现；不取 pi 的 `retryProviderRequest` | T-1（出站计数恒为 1）；`require_parameters` 的效果属比较门（PAT-N2） |
| S-38 第 2 条：状态码按来处分两种、原样交回——HTTP 层失败取 HTTP 状态；流开始之后的带内错误取带内 `code`、标 `inBand` | `sendRequest` 非 2xx ⇒ `{ failed: { source: "http_status", statusCode, headers, upstreamError? } }`；`readStream` 遇带内错误 ⇒ `{ failed: { source: "in_band", statusCode: 带内 code, inBand: true, httpStatus, upstreamError } }`（[下节](#上游的流怎样译成到达事件)） | 同上 | T-2、T-19；`inBand` 由本包交出，P-2 原样落进 `failure`（`data.model-response/v2` [S-15](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码)）与收尾的 `error`（`data.arrival-events/v2` [S-16](../../../../spec/data/arrival-events/v2/contract.md#s-16-收尾)） |
| S-38 第 3 条：不在中途解析工具参数 | 流循环只拼原串，`fill` 交原样片段；工具调用块封口不带块 | 同上；`parseStreamingJson` 不取 | T-3（片段相接逐字节等于上游原文）；静态检查 SC-1 |
| S-38 第 4 条：首 token 按 S-16，库的「开始」事件不算 | 响应首部到达不产出任何到达事件；第一个事件就是 `open` | 同上 | T-4；首 token 的判定本身在 P-2（装配状态的 `firstContentAt`） |
| S-38 第 5 条：只用交来的那一把凭据 | `sendRequest` 只读参数；凭据为空或全空白 ⇒ 本地失败、不开连接；包内不读 `process.env` | 同上 | T-5（环境里放一把 `OPENROUTER_API_KEY`、交空凭据 ⇒ 零出站）；静态检查 SC-2 |
| S-38 第 6 条：不向上游送本系统的会话标识 | 不发 `x-session-id`、`session_id`、`user`、`prompt_cache_key`；`planRequest` 的输入里没有会话 | 同上 | T-6（抓请求断言这几项都不在） |
| S-38 第 7 条：收不下的模态不静默换成占位 | `planRequest`：消息里有图而快照 `inputModalities` 不含 `image`，或出现本传输送不出的模态（语音、视频） ⇒ `{ rejected: "modality_not_carried" }` | 同上 | T-7；与出门前检查第 3 行是同一判定，收场见本表下的[规划拒绝](#规划拒绝的三种值与收场) |
| S-38 第 8 条：交回实际执行方、实际费用与费用来源 | `StreamEnd.serving`（`upstreamRequestId`、`upstreamModel`、`servingProvider`）；`account` 增量（[落点表](#费用与用量的落点)） | 同上 | T-8；执行方与指定的一家不一致时没有成员可记（`data.model-response/v2` G-8，PAT-N8） |
| S-38 第 9 条：固定 base URL，拒绝重定向 | 插件恒用 `OPENROUTER_BASE_URL`；3xx ⇒ `http_status` 失败、不跟 `Location` | 同上；`node:https` 本来不跟随（假设，须按 source-check 取证） | T-9 |
| S-38 第 10 条：改值与丢项在出网之前定下 | `planRequest` 纯、先于 `sendRequest`；`planned` 冻结，`sendRequest` 原样序列化它 | 同上 | T-10a（计划的参数三项 = 实际发出的） |
| S-38 第 11 条：不做逆转写 | 工具条目名原样进 `function.name`；回来的 `tool_calls[].function.name` 原样进块头 `tool` | 同上 | T-11 |
| S-11 末段：本据点传输能承载的模态 | 常量 `PI_AI_CARRIABLE_MODALITIES = { text, image }` | 同上 | pi 的内容类型只有文本、思考、图、工具调用（研究 E2，待核对主张） |
| S-15：「已出门」先于出网 | 请求的字节只在 `sendRequest` 里离开进程；`planRequest`、`createPiAiTransport` 不开连接、不预热 | 同上 | 次序本身归 P-2；本包的义务由 SC-3（只有 `sendRequest` 调网络 API）承担 |
| S-18：成因按来源分类；`status_cause_table` 的内容（G-5） | 本包交**来源事实**（`StreamEnd` 与 `sendRequest` 的失败），分类在 P-2；另导出候选表 | 同上 | 表的行全是待核对主张（PAT-N3）；402、403 两行已由契约 S-18 末条按成因定义定下 |
| S-19：凭据取值只交给传输适配 | 值只进这一次请求的 `Authorization` 首部；不进 `StreamEnd`、失败值、诊断事件 | 同上 | T-5b（哨兵凭据串不出现在本包交出的任何值里） |
| S-21：两个时限是运行时设置项 | **本包不自设任何在途时限**：界由调用方的中止信号给；只有建连上界是可选配置（初值不设） | 同上 | 选择见[策略配置项](#策略配置项) |
| S-22、`data.model-response/v2` [S-24](../../../../spec/data/model-response/v2/contract.md#s-24-一条响应体对应上游的一次请求)：一次发出 = 上游一次请求 | 同 S-38 第 1 条 | 同上 | T-1 |
| S-51：生产者是传输适配 | `readStream` 只交 `open`／`fill`／`close`／`account`，按次序、不重不漏；**不交 `trim`**（本包不合并、不截短、不限额） | 同上 | T-12（交出的序列逐个 `accept` 不被拒）；`finish` 与 `rejected` 的 `trim` 由 P-2 交 |
| `data.arrival-events/v2` [S-8](../../../../spec/data/arrival-events/v2/contract.md#s-8-开块)、[S-9](../../../../spec/data/arrival-events/v2/contract.md#s-9-块头)：生产者给 `BlockId`、`visibility`、`CallId`、`tool` | [下节](#上游的流怎样译成到达事件)的铸号与标注规则 | 同上 | T-13 |
| `data.arrival-events/v2` [S-20](../../../../spec/data/arrival-events/v2/contract.md#s-20-封口块等于归约)：封口块等于归约 | 封口块由累积的同一串片段拼出 | 同上 | T-14（性质测试；那份契约写明这条的证据只能落在生产者一侧） |
| `data.arrival-events/v2` [S-15](../../../../spec/data/arrival-events/v2/contract.md#s-15-记账)：账至多一次、在收尾之前 | 流里见过 `usage` 就在交回收尾事实之前交恰一个 `account`；没见过就不交 | 同上 | T-15 |
| `data.content-blocks/v2` [S-9](../../../../spec/data/content-blocks/v2/contract.md#s-9-思考块与不透明数据)：`opaque` 只由传输适配写读、原样回传 | 写：思考块封口时 `opaque = { format: "openrouter.reasoning_details/1", routeName, details }`（候选形状）；读：[回放规则](#线上请求怎样组) | 同上 | T-16；回放规则是比较门的「私有 replay」项（PAT-N13） |
| `data.content-blocks/v2` [S-14](../../../../spec/data/content-blocks/v2/contract.md#s-14-callid)：`CallId` 在一份会话日志里两两不同，由登记的一方保证 | `CallId = "call_" ＋ base64url(SHA-256(精确三元组编码))` 的前 32 位字符；编码由 D-070 承接的 I-B 固定 | 同上 | T-13；选择见[下节](#上游的流怎样译成到达事件) |
| `data.messages/v2` [S-35](../../../../spec/data/messages/v2/contract.md#s-35-我们自己那两种必须在发出前译掉)、[S-36](../../../../spec/data/messages/v2/contract.md#s-36-toolinternalmessage-不进请求)：我们自己那两种在发出前译掉；`ToolInternalMessage` 不进请求 | `planRequest` 的落点表；遇到 `ToolInternalMessage` ⇒ `{ rejected: "tool_internal_in_request" }` | 同上 | T-17；契约留给提供者设计的「翻译在适配之内还是之前」本节点答**之内**（落点随线上形式变，PF-009 把映射表归 adapter 那一层）；model-request-runtime 节点已按此对齐（它的 `TransportAdapter` 行） |
| `data.model-profile/v2` [S-17](../../../../spec/data/model-profile/v2/contract.md#s-17-缺席即不带没有人补值)、[S-21](../../../../spec/data/model-profile/v2/contract.md#s-21-不静默丢也不静默改)：缺席不补、不静默丢也不静默改 | [参数处置表](#线上请求怎样组) | 同上 | T-10b；pi 对推理模型在没给努力度时补发 `reasoning.effort`（研究 E2），本包不取 |
| `data.call-accounts/v2` [S-4](../../../../spec/data/call-accounts/v2/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-8](../../../../spec/data/call-accounts/v2/contract.md#s-8-cost一次发出的费用)：未知不是零、金额精确十进制、`cost_usd` 绝不是估算 | [落点表](#费用与用量的落点) | 同上 | T-18（一个超过 17 位有效数字的 `cost` 原样回来）；单位与换算是待核对主张（PAT-N5、N6） |

### 规划拒绝的三种值与收场

`planRequest` 在「已出门」之前运行，只交拒绝值、不开连接；**收场在 P-2**，按契约 [S-28](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-28-opencall) 末条与 [S-29](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-29-dispatch) ④（D-060 §八 N-40 ④、N-41 ①）。这次发出**不算已出门**，没有响应体。

| 拒绝值（候选名） | 与出门前检查的哪一行是同一判定 | P-2 的收场（契约 S-29 ④） |
| --- | --- | --- |
| `modality_not_carried` | S-28 表第 3 行 | `undispatched{modality_mismatch}` |
| `orphan_tool_call`、`tool_internal_in_request` | S-28 表第 6 行 | `invalidInput{reason}`，不写记录、调用停在原状态（契约 G-21 已闭合） |

三种都只看这次调用绑定的消息与档案快照、不看那一家，P-2 在 `openCall` 已经判过同一件事。**`openCall` 已过而 `planRequest` 仍拒，是两处判定不一致的缺陷**（本包与 P-2 的出门前检查对同一份输入答得不同），不是一种正常的运行情形；收场仍照上表，不另造一种。

## 上游的流怎样译成到达事件

**流循环直接产出本系统的增量，不经 pi 的事件层**（选择表见本节末）。一次发出一个 `readStream`，状态只在这个生成器里，不跨发出共享。

| 上游那一帧里的东西（chat-completions SSE，经 OpenRouter） | 交出的到达增量或记下的事实 |
| --- | --- |
| 响应首部（2xx） | **什么都不交**（S-38 第 4 条）；首部留给 `StreamEnd.headers` 供 P-2 脱敏后留存 |
| `id`（第一次出现） | `serving.upstreamRequestId`（OpenRouter 的 generation id；事后补账的来路，`data.model-response/v2` S-19 第 3 条） |
| `model`（第一次出现） | `serving.upstreamModel`，原样；上游从没报就缺席，不以路由名填 |
| 顶层 `provider`（第一次出现；OpenRouter 的扩展，研究 E1 转述的 2026-09-16 真实短请求里出现过，未复跑） | `serving.servingProvider`；后来的帧里变了 ⇒ 记诊断 `model_transport.serving_provider_changed`（error 级），不改已记的值 |
| `choices[0].delta.content` 非空 | 文本块：第一次先 `open { kind: text, fill: append }`，再 `fill`（片段原样） |
| `delta.reasoning`／`reasoning_content`／`reasoning_text`（取第一个非空的，同 pi） | 思考块：同上 |
| `delta.reasoning_details[]` | 并入当前思考块待写的 `opaque`（没有思考块就先开一个，文本为空）；**不产出 `fill`**——那是回放数据，不是内容，也就不会被当成开口（`data.arrival-events/v2` S-21） |
| `delta.tool_calls[]`（function 分支） | 按上游的流内序号认块：**名字到了才 `open { kind: tool_call, fill: append, head: { callId, tool } }`**（块头必带这两样，S-9）；名字到之前的参数片段先缓在本块，开块后按原次序交 `fill`；此后每个非空 `function.arguments` 原样一个 `fill`；空片段不交（S-11） |
| `delta.tool_calls[]` 的 custom 分支；`delta.images`、`delta.audio`、`delta.refusal` 非空 | 本传输不承载 ⇒ 这次发出以 `protocol` 收场（认不出来），**不静默丢** |
| `delta` 里内容成员闭集之外的成员（`role`、`annotations` 等）；闭集内成员为 `null`、空串或空数组（首帧常见的 `content: ""`、`refusal: null`） | **忽略**，不交任何增量、不算认不出来（闭集见表下） |
| `finish_reason ∈ { stop, tool_calls }` | 流读完时对每个开着的块交 `close`：文本、思考带封口块（内容 = 片段相接，思考块另带 `opaque`），工具调用不带块（S-13）；收尾事实 `{ ended: "end" }` |
| `finish_reason = length` | **不封口**；`{ ended: "max_tokens" }` |
| `finish_reason` 其余取值（`content_filter`、`error` 等）或帧里带 `error: { code, message, metadata }` | 不封口；`{ failed: { source: "in_band", statusCode, inBand: true, httpStatus, upstreamError: { code, message, raw } } }`：**`statusCode` 取带内 `code`、标 `inBand: true`**，流开始时的实际 HTTP 状态另放 `httpStatus`（契约 S-38 第 2 条）。带内错误没有整数 `code`（只有异常的 `finish_reason`，或 `code` 不是整数）⇒ `statusCode` 与 `inBand` 都缺席（`inBand` 只能与 `statusCode` 同在），`upstreamError` 原样带着 |
| `usage`（OpenRouter 只在最后一帧给一次） | 暂存（`cost` 按精确十进制读）；在交回收尾事实之前交恰一个 `account`（[落点表](#费用与用量的落点)）。收到第二个 ⇒ 取后一个、记诊断 `model_transport.usage_repeated`（info 级）——不合并 |
| `finish_reason` 之后又来内容增量 | `{ failed: { source: "protocol" } }`；D-019 比较门「流终态与无尾随事件」一项 |
| `[DONE]` 之前连接断了、没有 `finish_reason` | 不封口；`{ failed: { source: "stream_broken", localError } }` |
| 单个 SSE 事件超过 `maxSseEventBytes`、一帧的 JSON 读不出（语法错或重复成员） | `{ failed: { source: "protocol", localError } }` |
| 调用方的中止信号 | 停读、销毁这条连接；`{ aborted: true }`，不再交任何增量 |

- **`BlockId`**：`"b" ＋ 块索引`。索引就是开块的次序号，从 0 起严格递增、终身只开一次（S-7）；`BlockId` 只须在这条流装出的那条消息里唯一（S-8）。
- **`visibility`**：本传输开的块一律 `{ toHuman: true, toModel: true }`（`data.messages` 对助手消息「多数两位皆真」的那一格；`data.content-blocks/v2` [S-4](../../../../spec/data/content-blocks/v2/contract.md#s-4-两个标注)）。
- **`delta` 的内容成员是闭集**：`content`、`reasoning`／`reasoning_content`／`reasoning_text`、`reasoning_details`、`tool_calls`、`images`、`audio`、`refusal`。前四样本传输承载（上表各行）；后三样与 `tool_calls` 的 custom 分支不承载，非空即 `protocol`——`refusal` 是上游替模型给的拒答文本，忽略它就是静默丢掉一段回复。**闭集之外一律是非内容字段、忽略**（原样留在原始响应里，PAT-N15），所以一家供应商在首帧多带几个字段不会被当成认不出来。闭集本身与各家首帧的实际形状列入比较门（[verification](verification.md#证据义务) G 系列）。
- **`StreamEnd`**（候选形状）= 收尾事实（`ended` ／ `aborted` ／ `failed{ source ∈ local · connect · http_status · in_band · stream_broken · protocol, statusCode?, inBand?, httpStatus?, upstreamError?, localError? }`）＋ `serving` ＋ `headers`。**本包不判首 token、不判成因**；P-2 拿它加上装配状态里的 `firstContentAt`，按契约 S-18 定成因并交 `finish`。`statusCode` 与 `inBand` 由 P-2 原样落进 `failure` 与收尾的 `error`；`httpStatus` **不是契约成员**，P-2 不把它写进 `failure.statusCode`（那正是 S-38 第 2 条右列点名的误读），用不用它（例如进诊断）归 model-request-runtime 节点。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| **流循环直接产出到达增量**（选）；落选：保留 pi 的 `AssistantMessageEvent` 作中间层，另写一层翻译（D-035 选择表的字面写法「适配层把 pi 的事件翻成本项目语法」） | 流循环的推事件处与上游逐行对得上，同步上游时差分最小；翻译层是一个清楚的边界 | 流循环里十几处推事件的地方都改了口，同步上游时要逐处手工对 | 中：中间层要么带着 pi 的 `partial`（每个增量携带整份累积输出，D-035 要丢）、要么先改流循环再翻一次——两处都在改同一段代码，多出的一层没有独立的行为或契约；整个包就是 D-035 说的「传输适配处」 |
| **`CallId` 由（`ModelCallId`，第几次发出，块索引）哈希得出**（选）；落选一：原样登记上游给的调用 id；落选二：每个调用块铸一个随机数 | 一：保留上游 id，排查时一眼对得上。二：最简单，不必把发出身份交进规划 | 唯一性建在 SHA-256 的抗碰撞上，不是硬保证；`planRequest` 的输入因此多一个 `target` | 中：上游的 id 在一份会话日志里可能重复（`data.content-blocks/v2` S-14 点名），原样登记违约；三元组在一个会话里本来唯一（`ModelCallId` 会话内唯一），哈希只是把长度收进上游的词法（`[A-Za-z0-9_-]`、≤ 40 字符，待核对主张）；确定性让同一份流重放得到同一个 `CallId`。上游原 id 留在原始响应留存里 |

## 线上请求怎样组

**只走 OpenRouter 的 chat-completions 一条线**（`POST /api/v1/chat/completions`，`stream: true`）。`anthropic/*` 路由同样走这条线，不取 pi 的 `anthropic-messages` 路径（下表末）。

**消息的落点**（`data.messages` 的类型 → 线上角色；PF-009 把逐家映射表归 adapter 那一层）：

| 本系统的消息 | 线上落点 | 依据或待核对 |
| --- | --- | --- |
| system 消息 | 原位置一条 `role: system`，文本块拼接 | 会话中途的 system 在 `anthropic/*` 上会不会被折到开头，属比较门（PAT-N12） |
| 用户消息 | `role: user`；文本 → `text` 片段，图 → `image_url` 的 data URL | 同 pi `convertMessages` |
| `SystemReminderMessage` | `role: user`，内容前后由本包按类型加系统标识；路由在 `routeWireHints` 里写了 `reminderRole: developer` 的落 `role: developer` | PF-009 §5.2 的示意（openai → Developer，anthropic → User）只说各家可以不同，落点由 adapter 定；**不按路由名认家族**，所以缺省取各家都支持的 `user`；**标识防冒充的做法未定**（PF-009 §5.3，PAT-N12） |
| `CompactionMessage` | `role: user`，同样加系统标识 | 同上 |
| 助手消息：文本、工具调用 | `role: assistant`，文本拼成字符串；工具调用 `tool_calls[{ id: CallId, type: function, function: { name, arguments: 原文 } }]` | 同 pi；`CallId` 不合上游词法时按 pi 的 `normalizeToolCallId` 在同一个请求里确定性地改写，调用与结果一起改 |
| 助手消息：思考块 | 同一路由名且带着本传输写的 `opaque` ⇒ `reasoning_details` 原样带回；带 `opaque` 但路由名不同 ⇒ **规划拒绝** `unavailable`，原块不剥离、不降级为明文；不带 `opaque` 的思考文本放进 `reasoning` 字段、**不折进正文** | `data.content-blocks/v2` S-9 把「换了模型带不带」交给传输适配；本包选拒绝：签名／密文降级为明文会改线上语义与计量基准，`reasoning.encrypted` 亦无文本可降级；跨模型切换时对外来 opaque 思考块的处置归运行时上下文组装（GG-11）；比较门「私有 replay」项（PAT-N13） |
| 工具消息（结果） | `role: tool`，文本块拼接；结果里的图 ⇒ 紧跟一条 `role: user` 装图（chat-completions 的工具消息不收图，同 pi） | 模型不收图 ⇒ 规划拒绝（S-38 第 7 条）；结果为空时 pi 写「(no tool output)」——本包照写，列入比较门 |
| `ToolInternalMessage` | **规划拒绝**（它根本不该到这里，`data.messages/v2` S-36） | — |
| 有调用、无结果的工具调用 | **规划拒绝** `orphan_tool_call`（pi 会补一条「No result provided」，那是凭空造内容） | 组装一侧的缺陷应当暴露 |

**参数处置**（`data.model-profile/v2` [S-16](../../../../spec/data/model-profile/v2/contract.md#s-16-各项的取值域) 的八项与 `extra`；「译成上游的字段名不是改值」，S-21）：

| 本系统的项 | 线上字段 | 处置 |
| --- | --- | --- |
| `temperature`、`topP`、`seed`、`stopSequences`、`frequencyPenalty`、`presencePenalty` | `temperature`、`top_p`、`seed`、`stop`、`frequency_penalty`、`presence_penalty` | 按原值发出 |
| `maxOutputTokens` | `max_tokens`（OpenRouter API 参考页列的是它；pi 发 `max_completion_tokens`——D-019 点名的请求差异，假设，须按 source-check 取证） | 按原值发出。`data.model-profile/v2` [S-18](../../../../spec/data/model-profile/v2/contract.md#s-18-档案参数的输出上限) 的「上游此刻的上限更低时改值再发」**有前提**（那一事实有来源）；本程没有来源，契约 G-22 闭合之前**不改值、按参数原样发**，上游因此拒收时照状态码收场（PAT-N11） |
| `reasoningEffort` | `reasoning: { effort }` | `none`／`low`／`medium`／`high` 按原值（取值集待核对）；`max` 在 OpenRouter 的取值集核实之前 **不发出、记进 `droppedParameters`**（PAT-N10）；**缺席即不发**——不取 pi 的「推理模型不给就补 `none`」 |
| `extra.<键>` | 原样放进请求体顶层 | 键落在本包握着的字段（`model`、`messages`、`stream`、`stream_options`、`provider`、`models`、`route`、`tools`、`tool_choice`、`user`、`session_id`、`transforms`）或是统一项的上游拼法（`max_tokens`、`max_completion_tokens`、`top_p`、`reasoning`、`reasoning_effort` 等） ⇒ **不发出、记进 `droppedParameters`**（S-21 的第三种处置；这类键该拒还是该丢是 `data.model-profile` [G-9](../../../../spec/data/model-profile/v2/contract.md#十已知缺口)，闭合前取不发） |

**本包握着的线上字段**（不来自参数，也不开放给 `extra`）：`model = 路由名`（`data.model-profile/v2` [S-2](../../../../spec/data/model-profile/v2/contract.md#s-2-routename)：路由名就是上游认的名字，本包原样放、不解析）；`stream: true`；`store: false`（同 pi；与上游缺省是否相同待核对）；`provider` 路由三项（[投影表](#契约责任到兑现点)第一行），其中供应商标识原样放——`data.model-profile` [G-2](../../../../spec/data/model-profile/v2/contract.md#十已知缺口) 把 `ProviderName` 的词法交给传输适配，本包**不另立词法**，上游不认即以状态码收场；`tools`（非空时）；`routeWireHints` 标了 `cacheControl: anthropic` 的路由上按 `promptCacheRetention` 加 `cache_control`（系统消息、最后一个工具、最后一条会话消息，同 pi）。**不发**：`stream_options`（OpenRouter 用量文档写明它已弃用、无效，研究 E11）、`strict`、`user`、会话标识类首部、`HTTP-Referer`／`X-Title`。`transforms` 的缺省（上游是否对小上下文模型默认压缩中段）待核对，列入比较门。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| **只走 chat-completions**（选）；落选：连同 pi 的 `anthropic-messages` 一起取，`anthropic/*` 走 Anthropic 形状 | pi 让 OpenRouter 上 15 条 `anthropic/*` 目录条目走 `anthropic-messages`（研究 E4），思考块与缓存断点在原生形状上最贴 | `anthropic/*` 的思考回放、缓存与中途 system 在 chat-completions 上是否等价没有核实 | 中：两条线就是两份请求构造、两份流解析、两份比较门；OpenRouter 对所有模型都开 chat-completions，D-019 的补丁也只覆盖了这一条线；等价性交比较门逐项核，核不过再加线 |

## 费用与用量的落点

**只读 OpenRouter 随最后一帧报回的 `usage`**（研究 E11：现行文档写明用量在流式响应的最后一个 SSE 消息里、不需要任何参数）。**目录费率在本包里不存在**，没有任何路径能算出一个估价。

| OpenRouter 字段 | 本系统的位置（`account` 增量的 `usage`／`cost`，形状归 `data.call-accounts` v2） | 规则 |
| --- | --- | --- |
| `usage.cost` | `Cost.cost_usd`，`source: upstream_usage` | 从原始 JSON 文本按精确十进制读（`readJsonStrict` ＋ `ExactDecimal`），不经二进制浮点；缺席、不是数、为负 ⇒ `cost_usd: "unknown"`、`source: none`。**单位**：文档写的是 credits——本包按「1 credit = 1 USD」直接记，这是**待核对主张**（PAT-N5）；核实不成立时改记 `"unknown"` 或引入换算，不在此之前自造系数 |
| `usage.cost_details.upstream_inference_cost` | `Cost.upstream_inference_cost_usd` | 报了才有；缺席不补零；与 `cost_usd` 之间不推算（`data.call-accounts/v2` S-8） |
| `usage.is_byok` | **无成员可放**；留在原始响应里 | 它改变 `cost` 的口径，语义待核实（`data.call-accounts` G-6，PAT-N7） |
| `usage.prompt_tokens`、`prompt_tokens_details.cached_tokens`、`prompt_tokens_details.cache_write_tokens` | `input_tokens = prompt − cached − cache_write`（不小于 0 时）、`cache_read_tokens = cached`、`cache_write_tokens = cache_write` | 同 pi 的换算，前提是 `prompt_tokens` 含缓存读与缓存写两部分——**待核对主张**（研究 E11 写明原文未说清；`data.call-accounts/v2` [S-6](../../../../spec/data/call-accounts/v2/contract.md#s-6-usage四项-token-与来源) 要求三项两两不相交，PAT-N6）；相减为负 ⇒ 三项都记 `"unknown"` 并记诊断，不夹到 0 |
| `usage.completion_tokens`、`completion_tokens_details.reasoning_tokens` | `output_tokens`（含推理）、`reasoning_tokens`（报了才有） | 缺席的数记 `"unknown"`，不记 0（pi 的 `|| 0` 不取） |
| 整个 `usage` 没来（出错、断流、被中断） | **不交 `account`** | P-2 按「来源 = 无」写全未知（`data.call-accounts` S-20）；事后按 `upstreamRequestId` 查 `/generation` 补账不在本包（范围外，D-063 R-5 只到传输一层） |

## 状态码与八个上交成因

**八个成因各从哪来**（名字与类归 `data.loop-extension` v2 S-17；分类在 P-2，契约 [S-18](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现)）。本包交的是右列的来源事实；中列里带「表」的行是候选的 `openRouterStatusCauseTable`。

| 成因 | 从哪来 | 本包交出的事实 |
| --- | --- | --- |
| `withdrawn` | 出门前检查第 1 行（P-2） | — |
| `scope_disallowed` | 出门前检查第 2 行（P-2；本版不出现） | — |
| `modality_mismatch` | 出门前检查第 3 行，含「本据点传输能承载」：P-2 拿 `PI_AI_CARRIABLE_MODALITIES` 判 | 规划拒绝 `modality_not_carried` 与它是同一判定（[规划拒绝](#规划拒绝的三种值与收场)） |
| `credential_unavailable` | 出门前（没配、保管方解不出，P-2）；**表**：`401`（配了而上游拒绝）；`402` 余额不足（契约 S-18 末条已定，码的含义待取证） | `{ failed: { source: "http_status", statusCode } }`；或 `in_band` 的带内 `code` |
| `request_rejected` | **表**：`400`；`403` 输入被审核拦下（契约 S-18 末条已定，码的含义待取证）；`404`、`413`（候选，是否出现待核对） | 同上 |
| `upstream_unavailable` | 连不上（`connect`）；首 token 之前断流（`stream_broken`）；上游正常收尾却一样内容都没有（P-2 从装配状态判）；**表**：`408`、`429`、`500`、`502`、`503`、`504` | `connect` ／ `stream_broken` ／ `http_status` ／ `in_band` |
| `interrupted_mid_reply` | 首 token 之后的任何故障，优先于上面各行（P-2 按 `firstContentAt` 判） | 与首 token 之前同样的失败事实；本包不判首 token |
| `unrecognized` | 传输本地（`local`：本包自身错误、序列化失败、**连接池排队中被中止**）；认不出来的上游行为（`protocol`）；**表外的状态码**，含被拒的 `3xx` | `local` ／ `protocol` ／ 表外 `http_status`；`localError` 或状态码至少其一（`data.model-response` S-15「必带留痕」） |

- **表的每一行都是待核对主张**：OpenRouter 的错误页不在研究 `model-request-transport-sources` 里，状态码的含义出自上游文档的通行说法，**未取证**（PAT-N3）。表只映射到契约允许的三个成因、不映射只在出门前判出的那三个（S-18 末条）。
- **带内错误查同一张表**：`in_band` 的 `statusCode` 是带内 `code`（标 `inBand`），首 token 之前 P-2 拿它查这张表（契约 S-18 表第四行）；**前提**是上游带内 `code` 与 HTTP 状态是同一套码（未取证，契约 G-5）。没有整数 `code` 的带内错误不带状态码，P-2 那一侧只凭 `upstreamError` 留痕。
- **本包与 P-2 的配置之间的关系**：P-2 的 `statusCauseTable` 没有值就不启动（[model-request-runtime 的配置政策](../model-request-runtime/design.md#插件服务键与配置)）；产品装配可以把本包导出的这张表交给它——那是装配的选择，本节点不替它填。

## 策略配置项

**默认值只是配置的初值**。配置缺席取初值；给了不合形状的值 ⇒ `definePlugin` 的校验不过 ⇒ 插件 `FAILED`、不 provide、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)；与 model-request-runtime、tenancy 各节点同一条政策）。

| 项（候选名） | 管什么 | 初值 | 为什么是配置而不是常量 |
| --- | --- | --- | --- |
| `connectTimeoutMs` | 建连（TCP＋TLS）的上界；超了即「连不上」 | `null`：不设，由调用方的中止信号定界 | 时限的权威是契约 S-21 的两个设置项；给了值就是一个比首 token 等待更早的判定，由装配按需要开 |
| `maxConnections` | 本实例同时打开的上游连接数上界；超出的请求在本机排队，排队时间计入调用方的等首 token 时限。**排队超界**——还没拿到连接、一个字节都没发出就收到调用方的中止——以 **`local`** 失败交回、带 `queued` 留痕（`localError` 里记排队时长），**不交 `aborted`**：上游从未被触达，不能让 P-2 把本机饱和读成「超时」折成 `upstream_unavailable`、让重试件换家再排（契约 S-18「本地故障不报成上游给不出」；那一行点名的「本地资源耗尽」） | `32` | 并发须有边界；初值**无测量依据，实施程测** |
| `idleConnectionTimeoutMs` | 空闲连接保留多久再关 | `30000` | 同上 |
| `maxErrorBodyBytes` | 非 2xx 响应体读进内存的上界；超了停读、只交状态码与首部，记诊断 | `1048576` | 缓冲须有边界；完整字节的留存另走原始响应留存（PAT-N15） |
| `maxSseEventBytes` | 单个 SSE 事件的缓冲上界；超了这次发出以 `protocol` 收场 | `8388608` | 同上；它不截短内容，只拒绝 |
| `routeWireHints` | 逐路由的线上差别，**按路由名逐码点精确匹配**：`{ [路由名]: { cacheControl?: "anthropic", reminderRole?: "developer" } }` | `{}`：不打缓存断点，提醒一律落 `user` | 各家线上形状不同（PF-009 §5.2），而档案上没有「哪一家」这一项、路由名又不许解析（`data.model-profile` S-2）——本版由装配给（D-060 §八 N-40 ④）；长期归属是契约 G-23（PAT-N17） |
| `promptCacheRetention` | 上一项标了 `cacheControl` 的路由上断点保留多长：`none` ／ `short` ／ `long`（`long` 带 1 小时 TTL） | `short` | 同 pi 的缺省；它影响成本，不影响内容 |

**不是配置项的**（都是契约义务，改了就违约）：一次发出之内的重试次数（恒 0，S-38 第 1 条）；上游回退（恒关）；跟不跟随重定向（恒不跟，第 9 条）；插件的 base URL（恒 `OPENROUTER_BASE_URL`，SYS-LLM；[apps/cli](../../../apps/cli/design.md) 把它写成构建内常量）。**重连**：OpenRouter 的流式响应没有续传，一条流断了就是这次发出以 `stream_broken` 收场；「再来一次」是下一次发出，由重试件与守卫决定（契约 S-30、S-35），不在本包。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
| --- | --- | --- | --- |
| **本包不自设在途时限**（选）；落选：本包带一个总超时作兜底 | 函数面被外部单独使用时，调用方可能不给中止信号，一次发出就没有上界 | 外部调用方不给信号时确实无界 | 中高：任何本包自带的在途时限都会**悄悄给**契约 S-21 的两个设置项封顶（比设置值早触发，判出同样的成因），「策略不写死」要的是一个权威来源；函数层本来就不承诺运行时不变量（SYS-OPEN），无界这件事写进公开面，由包装的人补 |

## 契约到 Cordis 的投影

| 单元 | 插件与服务键（候选） | 必需 inject | 调用时取用 | 配置 |
| --- | --- | --- | --- | --- |
| 插件 `pi-ai-transport`（子入口 `./plugin`） | provide `modelTransport`，值是 `createPiAiTransport(config)` 造出的对象 | **无** | 无；诊断事件经 `ctx.logger` | [策略配置项](#策略配置项)；**不含** base URL |

- **一个插件、一条 fiber、一个 effect**：effect 里依次建连接池（`https.Agent`）→ 造传输对象（持有池与「接纳中」标记）→ `ctx.provide('modelTransport', …)`（provide 由 effect 纳管：kernel-basis 的 probe `provide-is-effect-managed`，**未升格为 basis 条目**，待核对主张）。撤除见[下节](#成对的装载与撤除)。
- **inject 边**：本插件不 inject 任何服务。**被谁 inject**：model-request-runtime 的 P-2 必需 inject `modelTransport`（本节点的选择，[公开面](#公开面)表；D-060 §八 N-40 ④ 采纳，model-request-runtime 节点已对齐：它的[关键差异之四](../model-request-runtime/design.md#与装配草图不同的四处)）。inject 的含义是「提供者换代或不可用，我就卸载重跑」（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；没有可选形式，basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）：本插件换代（含改配置）⇒ P-2 重跑 ⇒ 在途调用按契约 S-36 末条结算。**验收装配**以脚本化传输（model-request-runtime 的函数面导出）登记同一个 `modelTransport` 键，两者不同时装。
- **事件**：不发、不听任何 Cordis 事件。**没有一条外送通道能越过租户或会话边界**：本包不持有会话与租户；诊断事件进 JSONL 运行日志，只带 `target`（`callId`、`dispatch`）与事件名、计数，**不带内容、不带凭据**，级别只用 error 与 info（basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)：缺省导出不到 warn）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
| --- | --- | --- | --- |
| `data.arrival-events/v2`、`data.content-blocks/v2`、`data.call-accounts/v2`、`data.messages/v2`、`data.model-profile/v2`、`data.model-response/v2`、`data.tool-definition/v2`、`data.loop-extension/v2`（均 candidate） | 包依赖同批 core 纯模块（尚未建包） | 随包版本 | — |
| `capability.model-request-runtime/v2` 的传输端口 | 类型依赖 model-request-runtime 的函数面（尚未建包） | 随包版本 | 端口形状已对齐；工具条目由 P-2 经注册表解析（PAT-N14 已闭合） |
| 上游 OpenRouter chat-completions | `node:https` 直连 `OPENROUTER_BASE_URL` | 每次发出一次请求 | 连不上 ⇒ `connect` 失败事实 |
| Cordis 4.0.4、kernel-basis | 仅插件子入口 | 装配启动时 | 配置不合形状 ⇒ 装配启动失败 |

## 状态、并发与失败映射

- **本包没有耐久状态、不写任何存储，也就没有跨 owner 的「同一提交」**：它的每一次发出都是一次无状态的函数调用，只留下交出的增量与收尾事实，写日志、写响应体都是 P-2 的事。与 P-2 之间唯一的次序义务是「已出门」先于出网：P-2 等「已出门」追加确认之后才调 `sendRequest`，本包保证请求的字节不在别处离开进程（SC-3）——两者在同一进程、同一次调用链上，不经存储对象排序；跨进程时怎样重新兑现见[装配给 vs 协议给](#装配给-vs-协议给)。
- **并发**：各次发出互不共享状态，只共享连接池；池上界 `maxConnections`。同一个 `planned` 发两次就是两次出站——**防重不在本包**（P-2 的状态机与「已出门」的判重键挡住，契约 S-29 ⑦）。
- **两条交错的反证**（本包没有共同存储对象可排序，所以只核「次序不影响结果」）：
  - **X-1 两边同时撤除**：P-2 撤除（中止在途、写 `interrupted{run_cancelled}`）‖ 本插件撤除。本插件先撤：接纳关了，在途流不断，随后 P-2 的中止到达 ⇒ `aborted` ⇒ P-2 照 S-36 收场。P-2 先撤：中止先到 ⇒ 同上；本插件随后撤、池里已无在途。**若本插件撤除时关池**，前一种次序下在途流会以 `stream_broken` 断在 P-2 的中止之前，被读成一次上游故障——所以撤除不关在途连接（[下节](#成对的装载与撤除)）。
  - **X-2 撤除与新发出**：本插件撤除 ‖ 一个已经拿到旧对象的 P-2 实例正要调 `sendRequest`。关接纳在先 ⇒ `local` 失败、零出站；`sendRequest` 在先 ⇒ 它是一次在途请求，照 X-1 跑完。两种都不会出现「出了网却没有收尾事实」。进程内的「接纳中」标记在这里**不是正确性机制**：它只决定这次请求出不出网，出了网的一定有收尾事实，没出网的一定没有字节离开进程——P-2 那一侧据此收场（`local` 失败时「已出门」已写，按契约 S-18 传输本地一行结算）。
- **失败映射**：`sendRequest` 与 `readStream` 的失败一律以值交回（`failed{ source … }`），**不抛异常**；抛出只留给本包自身的缺陷。没有 catch-all 把未知异常折成某个成因：本地异常原样进 `localError`、来源标 `local`。

| 发生了什么 | 交出的来源 | 备注 |
| --- | --- | --- |
| 凭据为空、请求体序列化失败、本包内部错误 | `local` | 不开连接 |
| 在连接池里排队、还没拿到连接就被调用方中止 | `local`，带 `queued` 留痕 | 零字节出网；不交 `aborted`（[策略配置项](#策略配置项) `maxConnections` 行） |
| DNS 失败、拒绝连接、TLS 握手失败、建连超过 `connectTimeoutMs` | `connect` | 契约 S-18「连不上」 |
| 非 2xx（含 3xx） | `http_status` | 读回的响应体截在 `maxErrorBodyBytes` |
| 2xx 之后连接断了、没有 `finish_reason` | `stream_broken` | — |
| 带内错误、异常的 `finish_reason` | `in_band` | `statusCode` = 带内 `code`、`inBand: true`、`httpStatus` 另带；没有整数 `code` 时前两者缺席 |
| 帧读不出、事件超界、终态后又来内容、本传输不承载的内容成员、名字没到的工具调用 | `protocol` | 认不出来，不静默丢 |
| 调用方中止（已拿到连接之后） | `aborted`（不是失败） | 收场由 P-2 按中断定 |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
| --- | --- | --- | --- |
| config 校验 | 内核在插件体之前校验（kernel-basis `definePlugin`） | 不过 ⇒ `FAILED`、不 provide、装配启动失败 | — |
| 连接池（`https.Agent`）与传输对象 | 本插件 fiber；effect 里建成之后才 `provide` | 池或对象构造抛出 ⇒ 插件体抛出 ⇒ `FAILED`，没有半个服务 | 撤除函数：**先关接纳**（此后 `sendRequest` 立即以 `local` 收场、不开连接）→ 空闲连接立即关 → **在途的请求不打断**：它们的连接在各自那一次发出收场时释放，最后一个收场时销毁池，撤除函数到这时才返回（池的生命期不越出拥有它的 fiber）。**内核不取消在途调用，本包也不替调用方取消**：在途请求跑完，或由它们的调用方（P-2 按契约 S-36 撤除时先中止）停下，各自按那一次的收尾事实收场。**不把「关池」当成停下在途请求的手段**——那会让在途的流以传输错误断掉，P-2 把它读成一次上游故障，而契约 S-36 要的撤除收场是 `interrupted{run_cancelled}` |
| `ctx.provide('modelTransport')` | 本插件 fiber；`ACTIVE` 后可解析 | provide 由 effect 纳管（待核对主张，见上） | 服务消失，inject 它的 P-2 重跑；已拿到旧对象的在途发出照上一行跑完 |

- **与 P-2 的撤除之间不依赖次序**：两条 fiber 的撤除谁先谁后、内核会不会等旧 fiber 的异步撤除完成，都未核实（同 fiber 内各 effect 并发驱动、不保证次序，basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）。本设计在两种次序下结果相同：在途的流只会因 P-2 的中止信号或自然收尾而结束。
- **撤除的等待上界**：若内核先等本插件的撤除函数完成、再卸 inject 它的 P-2（未核实），这段等待里 P-2 的中止不会到来，**上界等于在途流的自然收尾，受 P-2 的时限约束**（契约 S-21：首 token 之前是 `first_token_wait_limit`，之后是 `post_first_token_stall_limit`——后者只限两次内容之间的空档，一条持续出字的流要跑到自然收尾）。结局不变，只是撤除可能耗时。内核在跨 fiber 撤除时的次序与等待登为 kernel-basis 的 probe 候选（[verification](verification.md#覆盖缺口)）。
- **撤除之后仍为真**：已经出网的请求是外部效应，**不可回滚**，上游可能已经计费；本包不留任何记录，账与收场全在 P-2 写下的那些记录里。

## 装配给 vs 协议给

契约 S-38 左列里落在本节点的两行（右列不在本版）：

| 契约 S-38 的保证 | 本版单机的兑现 | 传输挪到另一个进程时要由协议重新兑现什么 |
| --- | --- | --- |
| 「已出门」先于出网 | 同进程、同一调用链：P-2 等追加确认之后才调 `sendRequest`；本包不在别处发字节 | 出网那一方须在出网前确认锚点已落（契约原文）；本包的 `planRequest` 纯、可留在 P-2 一侧，只把 `sendRequest` 与 `readStream` 挪过去 |
| 凭据值只在发出时出现 | 进程内作 `sendRequest` 的实参，只进这一次请求的首部 | 值怎样送到传输进程、是否落地（契约 G-12） |

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；下面是本节点的缺口。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
| --- | --- | --- | --- | --- |
| PAT-N1 | **尚未建包**，没有任何实现与测试 | 实施程 | 全部真实发出 | 包按本页建起，[verification](verification.md#证据义务) 的 T 系列跑通 |
| PAT-N2 | **D-019 比较门一项都没有在真实 OpenRouter 上过**：十五项（请求路由、原始工具参数与结果回传 ID、流终态与无尾随事件、实际执行方与响应 ID、`usage.cost` 质量、私有 replay、重定向、错误、断流、abort、无隐藏重试……）与四项请求差异（最大生成长度字段、`store`、`reasoning`、`strict`），外加本页新增的几项（`transforms` 缺省、`require_parameters`、`anthropic/*` 走 chat-completions、我们自己那两种消息的落点、中途 system）。2026-09-23 的现状表（D-019 追加）是另一条实施线的样本，**不是本节点的证据** | 主线 → 实施程；D-064 ⑲ 已授权用本机 `.env` 密钥做少量真实小请求，密钥不进入会话、日志或证据；尚未实测 | 产品装配的每一次真实发出 | 每一项有测试或实测记录，执行结果留本工作树 tmp，可复跑资源及范围回填 verification；任何费用或身份丢失先报反例 |
| PAT-N3 | **候选状态码表的每一行未取证**。`402`（余额不足）⇒ `credential_unavailable`、`403`（输入被审核拦下）⇒ `request_rejected` 两行的归属**已由契约定下**（S-18 末条，D-060 §八 N-41 ③），前提——两个码的含义如此——同样待取证；带内 `code` 与 HTTP 状态是同一套码也待取证（契约 G-5） | 本节点（取证） | P-2 的 `statusCauseTable`（契约 G-5）；场景 S-46 | OpenRouter 错误页入研究并逐行对上；带内 `code` 的码空间核实 |
| PAT-N4 | **已由契约闭合**：契约 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配第 2 条改为「HTTP 层失败取 HTTP 状态；流开始之后的带内错误取带内 `code` 并标 `inBand`」，`data.model-response/v2` [S-15](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码) 加 `inBand`，场景 S-46 第 6 支同步（D-060 §八 N-40 ④、N-41 ②）。本节点的落点：`in_band` 失败事实 = `statusCode` 取带内 `code` ＋ `inBand: true` ＋ `httpStatus` 另带，由 P-2 原样落（[流翻译表](#上游的流怎样译成到达事件)）；T-19 带内一支改为断言 | — | — | — |
| PAT-N5 | **`cost` 的单位是 credits**（研究 E11）；本包按 1 credit = 1 USD 记进 `cost_usd`，未核实 | 本节点（取证） | 成本明细（`data.call-accounts` S-8） | 官方文档或按 generation id 查账对上；不成立时改记 `"unknown"` 或给出换算来源 |
| PAT-N6 | **三项输入 token 的换算**依赖「`prompt_tokens` 含缓存读与缓存写」这一待核对主张 | 本节点 ＋ `data.call-accounts` [G-6](../../../../spec/data/call-accounts/v2/contract.md#十已知缺口) | 用量明细、`total_tokens` 派生 | 实测对上，映射写进模型调用一侧的契约 |
| PAT-N7 | **`is_byok` 无处可放、语义未核实**（`cost` 在它为真时指什么） | `data.call-accounts` G-6 的 owner | 成本口径 | 核实后决定要不要一个成员 |
| PAT-N8 | **实际执行方与指定的那一家不一致时没有成员可记**；本包交 `servingProvider`，P-2 怎么用未定 | `data.model-response` [G-8](../../../../spec/data/model-response/v2/contract.md#七已知缺口) 的 owner ＋ model-request-runtime 节点 | 路由留痕 | 查清「只指定一家、禁回退」时上游是否仍会换家 |
| PAT-N9 | **已由契约闭合**：规划拒绝归出门前检查、不算已出门——契约 [S-28](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-28-opencall) 末条与表第 3、6 行、[S-29](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-29-dispatch) ④、S-18 表前两行（D-060 §八 N-40 ④、N-41 ①；G-21 已闭合）。三种拒绝值的映射与「`openCall` 已过而仍拒」的定性见[规划拒绝](#规划拒绝的三种值与收场) | — | — | — |
| PAT-N10 | **`reasoningEffort` 的上游取值集未核实**；`max` 本版不发、记丢项 | 本节点（取证） | 带 `max` 的档案 | OpenRouter `reasoning.effort` 的取值集入研究，`max` 的译法定下 |
| PAT-N11 | **「上游此刻的输出上限」没有来源**：本包不取模型目录，手里没有这一事实。契约已承接为 G-22、`data.model-profile` S-18 标「有前提」；闭合之前不改值、按参数原样发（D-060 §八 N-40 ④） | 主线 → `data.model-profile` 新版本（契约 G-22） | `maxOutputTokens` 的改值一支 | 这一事实有家并交进 `planRequest` |
| PAT-N12 | **我们自己那两种消息的系统标识怎样防冒充未定**（PF-009 §5.3：工具返回里带一个闭合标签就能冒充）；中途 system 在 `anthropic/*` 上的落点未核实 | 本节点 ＋ PF-009 owner | agent 分辨系统在说话 | 标识方案定下（含对其余消息里同形文本的处置），比较门核落点 |
| PAT-N13 | **私有 replay 规则未验证**（同一路由名才带回 `reasoning_details`，跨路由只给思考文本） | 本节点 | 推理模型的多轮与工具调用 | 比较门「私有 replay」项有实测 |
| PAT-N14 | **已由契约闭合**：MRR v2 S-28 ①③④⑧、G-24（D-060 §八 N-42 ④、N-43、N-44 ⑤）规定 P-2 经 `assetRegistry.lookup` 将模型面名字解析为条目，Run 内读 `report` 所依快照、Run 外读当前快照，续接重取；未知名字与不可用分开收场。本包仍接收 `ModelToolEntry[]`，不自行读注册表。MRR-N14 同步；调用方提供 report 及真实注册表实现仍属各 owner | — | — | — |
| PAT-N15 | **原始响应留存**（`data.model-response` [S-20](../../../../spec/data/model-response/v2/contract.md#s-20-上游原始响应留存)）：本包只交响应首部，正文字节的旁路留存没有做——附件存储未定义（model-request-runtime 的 MRR-N8） | 附件存储的 owner；本节点届时加旁路 | 排查 | 附件存储有定义 |
| PAT-N16 | **已闭合**：`data.model-response` 验证入口已登按研究 E11 改写（`usage: { include: true }` 已弃用、请求不必带参数，D-060 §八 N-40 ④） | — | — | — |
| PAT-N17 | **逐路由的线上差别没有契约来源**：打不打 Anthropic 式缓存断点、提醒落 `developer` 还是 `user`，取决于路由背后是哪一家；档案上没有这一项，路由名又不许解析（`data.model-profile` S-2）。契约已承接为 G-23：本版由装配经 `routeWireHints` 按路由名逐码点精确给出，初值为空（D-060 §八 N-40 ④）——**初值下 `anthropic/*` 路由没有缓存断点，成本高于 pi 的缺省** | 主线 → `data.model-profile` 新版本（契约 G-23）；apps/cli（装配时给不给） | 缓存成本；提醒的落点 | wire hints 成为档案属性，装配的那份逐路由配置随之撤掉 |
| PAT-N18 | **已由契约闭合**：MRR v2 S-18 第 2、5 行、S-21、S-36（D-060 §八 N-43 ②、N-44 ④）规定排队中被首 token 时限中止且对上游零请求的 `local{queued}` 收 `unrecognized`、留 `localError`；首 token 前无码带内错误收 `unrecognized`、留 `upstreamError`；撤除仍按 `interrupted{run_cancelled}`。本包只交来源事实，最终分类与验证归 P-2 | — | — | — |

**不改契约**：以上凡涉及契约的都只登缺口、报主线；PAT-N4、N9、N11、N16、N17 与 N14 的大半由契约与别的节点改写承接（D-060 §八 N-40 ④、N-41），本页据此对齐，没有一处「实际按 X 做」替契约下结论。


## D-070：铸号接缝与仍未闭合的入口

普通生产者统一随机生成的旧概括不适用于本节点；BlockId 的 b 加连续索引保留，从 0 起属于本提供者选择，AE 只要求非负严格递增。CallId 的三元组哈希输入精确采用 R2 铸号及数字表示；三个元素是字符串，ECMAScript JSON.stringify 无 replacer/space 后 UTF8，数字成功域为原无上界 JsonNumber 整数，以去尾零系数 e 非负指数规范化，不经有损 Number。

此精化由 D-070 I-B采用，但**非法 target 的 planRequest 收口仍阻断完整入口实施**；CallId 登记判重／恢复与 D-019 比较门仍未闭合。上游 core 已交付通用数值桥及其消费者，本支旧“其他 core 数值映射一概缺失”的阻断概括已由 D-070 取代；这不自动迁移本节点的 v2 依赖，也不代表正式 pi 调用链的每跳无损已经验证。确定性哈希不提供会话唯一性保证，不以 session-log opaque dedupeKey 代替载荷判重。

## 共享 reader 与承载边界

本期线上交付范围为 text/image。其他已声明模态的定义不缩减；音视频仍返回 modality_not_carried。

无 id 的相邻 reasoning.text 只有 type、format、index 及其余未知成员逐值相等时才合并。签名允许从缺席/null 到一次非空值，此后仅允许重复同值。签名到达后再来的无签名片段是新条目。同一响应内相邻同 index 属于同一内容块是此规则的前提，不推广到任意事件流。

换路由的 opaque 思考块规划返回 unavailable，不剥离或降级为明文。reasoning.encrypted.data 为 [REDACTED] 时不可解释，下一轮 unavailable 且零 HTTP。上下文组装的外来 opaque 处理、截断 completeness 和 encrypted 工具身份投影仍须各自拥有者闭合；不能凭本页规则声称实际认证已完成。
