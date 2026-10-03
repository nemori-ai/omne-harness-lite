# 可复核的来源与观察

每条记录的第一项是「取得方式」，只用下面三个词开头：

- **实测原件**：本轮付费探针写下的原始记录（逐请求 JSON 与每轮 `summary.md`），起草时直接读了原件；
- **一手原文**：起草时亲自读的源码、文档或接口返回，写到文件与行号；
- **复跑**：起草时离线重新执行的东西（探针的 dry-run、对账与核价脚本），不联网、不花钱。

本会话前面那份只读调研报告给出的仓库现状，起草时都按文件与行号重新读过，所以本页没有「仅转述」级的记录；报告本身没有入包。

版本 token（对象换版本时 grep 这些）：OpenRouter 实测窗口 `2026-10-02T16:59:56Z`–`2026-10-02T17:09:23Z`；仓库 `73fbfd5ff`（第 1、2 轮记的是 `c731530f9`）；
探针 `probe.mjs` sha256 `02f9ed4f54c7b936d3eea9d37761c8c012d21b778cf96a961e354ba0e0e024ce`；`tools/model-probe/src/network.mjs` sha256 `03c25c3598518b44dcdcf381c16d8793f0f0cfdeaeff4041a325438352d61d33`；
Node `v24.21.0`；pi `3390bd9`（0.86.1）、`a13d35a`（1.0.0）、修复提交 `1b6ddca87ca041e3b02b387d5a321eb77fc39eca`；
OpenRouter 文档抓取 `2026-10-02T17:16:59Z`（sha256 见 [E11](#e11-openrouter-文档对错误体与余额接口的说法)）。

逐请求的状态、用量与费用抽成了一张索引表 [reports/2026-10-02-request-index.md](reports/2026-10-02-request-index.md)（97 行，每行带原记录 sha256 前 16 位）；
三轮 `summary.md` 与六个被拒请求的原记录抹掉组织 id 后存在 [reports/](reports/)，原件与存档的 sha256 都在 [reports/provenance.json](reports/provenance.json)。

## E1 探针怎样构造请求、怎样保管凭据

- 取得方式：一手原文（逐行读 `probe.mjs`、`run-live.sh`、`network.mjs`）＋复跑（`node probe.mjs --dry-run`，2026-10-02 约 17:14，离线）。
- 来源与精确修订：会话临时目录 `issue-50/runner/probe.mjs`（sha256 见页首）、`issue-50/run-live.sh`（sha256 `093f6963c338d1aa25e58204926a7d4946ee199fd8972b887aea299beb87371e`）；
  仓库 `tools/model-probe/src/network.mjs`（sha256 见页首，与三轮 `summary.md` 里记的前 16 位 `03c25c3598518b44` 一致）、`tools/model-probe/src/budget.mjs`（sha256 `e39aeea377336d20fb0806dff36013edac06f36397c55007112d615271098ab4`）。
- 来源立场：本会话自写的探针，不是上游材料。
- 实际观察：
  - 三种请求（`probe.mjs:111-115`）：A1 `content = [image_url, {type:'text', text:''}]`；A2 `[{type:'text', text:''}, image_url]`；B `[image_url]`（对照：同路由、同图、不带空文本段）。
    段的形状照抄 `plan.ts` 的 `parts()`：文本 `{type:'text', text}`，图片 `{type:'image_url', image_url:{url:'data:image/png;base64,…'}}`（`probe.mjs:107-110`）。
  - 请求体（`probe.mjs:116-125`）只有六个成员：`model`、`provider: {order:[唯一供应商], allow_fallbacks:false, require_parameters:true}`、`stream:true`、`usage:{include:true}`、`max_tokens:64`、`messages`（恰一条用户消息）。
    没有 system、tools、reasoning、缓存标记，也没有生产计划体里的 `store:false`。发送前自检（`probe.mjs:143-166`）与 `network.mjs` 的 `sendOnce`（`:33-52`）都拒绝多于一个供应商、开回退、不流式和 `user`、`session_id` 等字段。
  - 图片（`probe.mjs:88-104`）：程序内确定性生成的 32×32 纯色 RGB PNG（颜色 214,69,65），99 字节，sha256 `0d9cc10556d669b8916990512b72f3a0cd3322afd0ec63c7a6ac993cb920b373`，以 base64 内联。
  - 复跑 dry-run 输出：「93 requests; image 99 bytes png, sha256 0d9cc10556d669b8」；A1／A2 请求体 432 字节、B 406 字节（gpt-6-astra）；「conformance (real sendOnce on stubbed transport + own preflight): 93/93 bodies pass」。
  - 发送地址 `https://openrouter.ai/api/v1/chat/completions`，凭据只放在 `Authorization: Bearer` 头（`network.mjs:4`、`:58-66`）。余额读 `GET /api/v1/credits` 的 `total_usage`，按原始数字字面量保留、不经浮点（`probe.mjs:536-552`）。
  - 判定（`probe.mjs:266-301`）：非 200 记 `http_error`；200 但流里有 `error` 帧、`finish_reason:'error'` 或整段是带 `error` 的 JSON，记 `inband_error`；流没收尾记 `incomplete`；其余才是 `accepted`。
  - 停机条件（`probe.mjs:360-391`）：累计预留超上限则其余请求记 `skipped` 不发；任一请求流里报的 `usage.cost` 超过它自己的预留，发完这一条即停；连续三次 401／402／403 即停。
- 凭据仅在运行期间写入受限临时文件：`run-live.sh` 在 `umask 077` 下用 `grep -m1 '^OPENROUTER_API_KEY='` 从主检出 `.env` 取一行，写进会话临时目录的 `openrouter.key`（取不到恰好一行就退出），`trap 'rm -f "$K"' EXIT` 在脚本退出时删除，无论成败；
  `probe.mjs` 在任一响应里发现钥原文就把整条响应换成占位并停机（`:318-322`），余额接口的响应同样检查（`:544`）。起草时核对：`openrouter.key` 已不存在；三轮输出目录（`0700`，文件 `0600`）里检索 `sk-or`、`Bearer`、`api_key` 无命中。
- 支持范围：请求的确切形状与凭据处理。**不支持**：生产计划体的全部字段（生产体另有 `store:false`，可能带 tools、reasoning、缓存标记，图片还会经过预处理，见 [E7](#e7-仓库现状投影与-parts-不滤空串)）；多条消息、历史位置或纯文本数组里的空文本段。
- 消费对象：research.md 全部结论的「适用范围」。

## E2 三轮实测的运行参数、范围与停机原因

- 取得方式：实测原件（三轮 `summary.md` 与逐请求 JSON；存档见 [reports/](reports/)）。
- 来源与精确修订：会话临时目录 `issue-50/live-1/`、`live-2/`、`live-3/`；三轮都记 `network.mjs sha256 03c25c3598518b44; probe.mjs sha256 02f9ed4f54c7b936; node v24.21.0`。
- 来源立场：本轮实测。
- 实际观察：

  | 轮 | 起止（UTC） | 仓库 HEAD | 预留上限／每请求为图片附加的输入额度 | 发出／计划 | 停机 |
  |---|---|---|---|---|---|
  | 1 | 16:59:56.802 – 17:01:57.396 | `c731530f9` | 4.5 USD／2000 输入 token | 17／93 | #17 `gpt-6-luna-pro` A2 实报 0.0002768 超过它的预留 0.0002755 |
  | 2 | 17:02:23.645 – 17:05:44.658 | `c731530f9` | 4.0／6000 | 44／78（从 `gpt-6-luna-pro` 起 26 条路由） | #44 `grok-4.7` A2 实报 0.01073 超过预留 0.0105856 |
  | 3 | 17:06:03.581 – 17:09:23.154 | `73fbfd5ff` | 4.0／20000 | 36／36（从 `grok-4.7` 起 12 条路由） | 无 |

  - 三轮合计实际发出 97 个请求，覆盖 31 条路由 × 3 种请求 = 93 个格子；`gpt-6-luna-pro` 的 A1、A2 与 `grok-4.7` 的 A1、A2 各发了两次（前一轮停机前已发、下一轮从该路由重来），四对重复的结果都是 `accepted`。
  - 两个 HEAD 之间，`git diff --stat c731530f9 73fbfd5ff -- packages/model tools/model-probe` 只改了 `packages/model/model-request-runtime/vitest.config.ts`（删 4 行）；探针与 `network.mjs` 两轮 sha256 相同。
  - 31 条路由与钉住的供应商：OpenAI 12 条（`openai`）、Anthropic 4 条（`anthropic`）、`deepseek/deepseek-v4.1-flash`（`deepinfra/fp8`）、Google 2 条（`google-ai-studio`）、xAI 2 条（`xai`）、Qwen 6 条（`alibaba`）、
    `moonshotai/kimi-k3`（`moonshotai/mxfp4`）、`moonshotai/kimi-k2.7-code`（`moonshotai/int4`）、Z.AI 2 条（`z-ai/fp8`）。这正是本仓库 official 目录里声明图片输入的全部路由
    （`official-models/openai.ts:53-56` 注释「All 12 selected OpenAI endpoints」、各家定义的 `inputModalities`；文本专用的 `deepseek-v4-pro-0813`、`qwen3.8-2.4t-a95b`、`qwen3.7-max`、`glm-5.3`、`glm-5.3-prime`、`glm-5.2` 不在其中）。
- 支持范围：每个格子一次样本（四个格子两次）。不支持时间上的稳定性。
- 消费对象：C-1、C-6、C-7。

## E3 逐路由的结果矩阵

- 取得方式：实测原件（逐请求 JSON 的 `outcome`、`status`、`provider`、`usage`；逐行见 [request-index](reports/2026-10-02-request-index.md)）。
- 实际观察（「轮#序号」，`ok` 为 `accepted`；pt 为上游报的 `prompt_tokens`）：

  | 路由 | A1 `[image, text:'']` | A2 `[text:'', image]` | B `[image]` | 响应里的供应商名 | pt（A1／A2／B） |
  |---|---|---|---|---|---|
  | openai/gpt-6-astra | ok 1#1 | ok 1#2 | ok 1#3 | OpenAI | 8／8／9 |
  | openai/gpt-6-astra-pro | ok 1#4 | ok 1#5 | ok 1#6 | OpenAI | 1558／1559／1566 |
  | openai/gpt-6-sol | ok 1#7 | ok 1#8 | ok 1#9 | OpenAI | 8／8／9 |
  | openai/gpt-6-sol-pro | ok 1#10 | ok 1#11 | ok 1#12 | OpenAI | 1497／1508／1455 |
  | openai/gpt-6-luna | ok 1#13 | ok 1#14 | ok 1#15 | OpenAI | 8／8／9 |
  | openai/gpt-6-luna-pro | ok 1#16、2#1 | ok 1#17、2#2 | ok 2#3 | OpenAI | 1507、1508／1508、1508／1509 |
  | openai/gpt-5.6-sol | ok 2#4 | ok 2#5 | ok 2#6 | OpenAI | 8／8／9 |
  | openai/gpt-5.6-sol-pro | ok 2#7 | ok 2#8 | ok 2#9 | OpenAI | 1688／1667／1691 |
  | openai/gpt-5.6-terra | ok 2#10 | ok 2#11 | ok 2#12 | OpenAI | 8／8／9 |
  | openai/gpt-5.6-terra-pro | ok 2#13 | ok 2#14 | ok 2#15 | OpenAI | 1620／1608／1658 |
  | openai/gpt-5.6-luna | ok 2#16 | ok 2#17 | ok 2#18 | OpenAI | 8／8／9 |
  | openai/gpt-5.6-luna-pro | ok 2#19 | ok 2#20 | ok 2#21 | OpenAI | 1661／1651／1639 |
  | anthropic/claude-opus-5.5 | ok 2#22 | ok 2#23 | ok 2#24 | Anthropic | 14／14／14 |
  | anthropic/claude-opus-5 | ok 2#25 | ok 2#26 | ok 2#27 | Anthropic | 12／12／12 |
  | anthropic/claude-sonnet-5 | ok 2#28 | ok 2#29 | ok 2#30 | Anthropic | 12／12／12 |
  | anthropic/claude-fable-5.1 | ok 2#31 | ok 2#32 | ok 2#33 | Anthropic | 14／14／14 |
  | deepseek/deepseek-v4.1-flash | ok 2#34 | ok 2#35 | ok 2#36 | DeepInfra | 215／215／214 |
  | google/gemini-3.8-flash | ok 2#37 | ok 2#38 | ok 2#39 | Google AI Studio | 1090／1090／1090 |
  | google/gemini-3.7-flash | ok 2#40 | ok 2#41 | ok 2#42 | Google AI Studio | 1090／1090／1090 |
  | x-ai/grok-4.7 | ok 2#43、3#1 | ok 2#44、3#2 | ok 3#3 | xAI | 1282／1282／1282（其中缓存 1152） |
  | x-ai/grok-4.6 | ok 3#4 | ok 3#5 | ok 3#6 | xAI | 246／246／246 |
  | qwen/qwen3.8-max-0902 | ok 3#7 | ok 3#8 | ok 3#9 | Alibaba | 89／89／89 |
  | qwen/qwen3.8-max-prime | ok 3#10 | ok 3#11 | ok 3#12 | Alibaba | 89／89／89 |
  | qwen/qwen3.8-flash | ok 3#13 | ok 3#14 | ok 3#15 | Alibaba | 127／127／127 |
  | qwen/qwen3.8-27b | ok 3#16 | ok 3#17 | ok 3#18 | Alibaba | 114／114／114 |
  | qwen/qwen3.7-plus | ok 3#19 | ok 3#20 | ok 3#21 | Alibaba | 76／76／76 |
  | qwen/qwen3.7-flash | ok 3#22 | ok 3#23 | ok 3#24 | Alibaba | 76／76／76 |
  | moonshotai/kimi-k3 | **HTTP 400** 3#25 | **HTTP 400** 3#26 | ok 3#27 | Moonshot AI | —／—／97 |
  | moonshotai/kimi-k2.7-code | **HTTP 400** 3#28 | **HTTP 400** 3#29 | ok 3#30 | Moonshot AI | —／—／15 |
  | z-ai/glm-5.3-flash | **HTTP 400** 3#31 | **HTTP 400** 3#32 | ok 3#33 | Z.AI | —／—／30 |
  | z-ai/glm-5.3-flashx | ok 3#34 | ok 3#35 | ok 3#36 | Z.AI | 30／30／30 |

  - 97 个请求里没有 `inband_error`、`incomplete`、`parse_error`、`transport_error`；被接受的 91 个都带 `finish_reason`（`stop` 或 `length`）和 `usage.cost`。
  - 「响应里的供应商名」是流里报的展示名，不带 `fp8`／`mxfp4`／`int4` 这类量化后缀；原记录里的 `providerMismatch` 拿展示名与钉住的 slug 直接比，所有被接受的请求都是 `true`，是探针的比较方式造成的，不表示路由跑偏。
  - 被接受只说明协议层面收下了：grok 两条路由三种请求（含对照 B）的输出都在描述图里没有的东西（「screenshot of a social media post」「handwritten note」「math problem」），其余路由描述的是红色方块。
- 支持范围：在 E1 的请求形状下，各格子一次样本的结果。不支持「grok 看到了图」；不支持量化端点的身份（只核到展示名）。
- 消费对象：C-1、C-3、C-8。

## E4 六个被拒请求的原文

- 取得方式：实测原件（`live-3/25`、`26`、`28`、`29`、`31`、`32` 六个 JSON 的 `status`、`errorText`、`rawResponse`；抹掉组织 id 后的全文存在 [reports/](reports/)，原件 sha256 在 [provenance.json](reports/provenance.json)）。
- 实际观察：六个都是 `outcome: http_error`、`status: 400`，`costUsd: null`、`costReported: false`，响应体不是 SSE、没有 `usage`、没有生成 id；耗时 589–1087 ms。响应体原文（`rawTruncated: false`）：
  - Kimi K3 的 A1、A2，Kimi K2.7 Code 的 A1、A2，四个逐字节相同：

    ```json
    {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"message\":\"Invalid request: text content is empty\",\"type\":\"invalid_request_error\"}}","provider_name":"Moonshot AI","is_byok":false}},"user_id":"org_…（已抹）"}
    ```

  - GLM-5.3 Flash 的 A1、A2，两个逐字节相同：

    ```json
    {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"code\":\"1210\",\"message\":\"Invalid API parameter, please check the documentation.\"}}","provider_name":"Z.AI","is_byok":false,"provider_error_code":"1210"}},"user_id":"org_…（已抹）"}
    ```

  - 同一路由的对照 B 都被接受：Kimi K3 #27（0.001251 USD）、Kimi K2.7 Code #30（0.00027025）、GLM-5.3 Flash #33（0.0000365）。
  - 六个错误体的 `metadata` 里都**没有** `error_type` 与 `provider_code` 成员；Z.AI 那两个用的是 `provider_error_code`。
- 支持范围：这三条路由在 E1 形状下的拒收原文。Z.AI 的 1210 是通用的参数错误，不点名空文本；把它归因到空文本段，靠的是同路由、同图、只差空文本段的对照 B 被接受，不靠错误文字。
- 消费对象：C-1、C-2、C-3。

## E5 余额读数与流里报的费用对账

- 取得方式：实测原件（三轮 `summary.md` 的 `credits before/after`、逐请求 `costUsd`）＋复跑（对账脚本 `draft-50-sources/reconcile.py`，十进制精确运算，2026-10-02 约 17:20）。
- 来源立场：余额来自 OpenRouter `/api/v1/credits` 的 `total_usage`（账户累计用量），每轮开跑前读一次、最后一个请求结束 15 秒后读一次（`probe.mjs:363`、`:384-389`；`afterDelayMs` 默认 15000，`:463`）。
- 实际观察（USD）：

  | 轮 | 开跑前 `total_usage` | 收尾后 `total_usage` | 余额差 | 流里报的 `usage.cost` 之和 | 差 − 流报 |
  |---|---|---|---|---|---|
  | 1 | 13340.756369759 | 13340.841079759 | 0.084710000 | 0.0987325 | −0.0140225 |
  | 2 | 13340.855102259 | 13340.924684359 | 0.069582100 | 0.0853241 | −0.015742 |
  | 3 | 13340.940426359 | 13340.986543849 | 0.046117490 | 0.04797（6 个请求没报费用） | −0.00185251 |

  - 三轮余额差之和 0.200409590；三轮流报之和 0.2320266；从第 1 轮开跑前到第 3 轮收尾后的跨度 0.230174090。
  - 每轮缺的那一截，恰好等于该轮**末尾一串**请求流报费用之和，精确到小数点后 9 位以上：第 1 轮缺 #10–#17（0.0140225），第 2 轮缺 #43–#44（0.015742），第 3 轮缺 #23–#36 里被接受的八个（#23、#24、#27、#30、#33–#36，合计 0.00185251）。
  - 轮与轮之间的空档：第 1 轮收尾后到第 2 轮开跑前，`total_usage` 涨了 0.0140225；第 2 轮收尾后到第 3 轮开跑前涨了 0.015742——各自恰等于上一轮缺的那一截。
  - 由此算出的入账滞后（以 `summary.md` 的 `finished` 近似读数时刻）：第 1 轮已入账的最后一个请求在读数前 57.4 秒结束、未入账的第一个在 52.5 秒前结束；第 2 轮为 53.0 秒与 40.0 秒；第 3 轮为 45.7 秒与 42.9 秒。
  - 第 3 轮六个被拒请求（#25、#26、#28、#29、#31、#32）全部落在未入账的那一截（#23 起）里。
  - **补读**（主会话，2026-10-02T17:40:42Z，只读余额的一次 GET，脚本 `scratchpad/issue-50/read-credits.mjs`，钥只在内存）：`total_usage` 13340.988396359，比第 3 轮收尾读数多 0.00185251，恰等于第 3 轮未入账的那八个被接受请求的流报费用；比第 1 轮开跑前多 0.2320266，恰等于三轮流报之和。
- 支持范围：
  - 支持：被接受的请求最终按流里报的 `usage.cost` 精确入账（每一段缺口都在下一次读数时补齐，分毫不差）；第 1 轮开跑前到补读之间，账户上没有其它入账；余额接口在本轮表现为滞后约 40–57 秒、按请求顺序入账。
  - 支持：**被拒请求不计费**——补读恰等于「只有被接受请求入账」时的预期值，六个被拒请求若计费，读数会高出约 0.0006。
  - 滞后的秒数是三次读数推出来的区间，不是接口承诺。
- 消费对象：C-4、C-6。

## E6 两次中途停机的费用构成

- 取得方式：实测原件（`live-1/17-openai_gpt-6-luna-pro-A2.json`、`live-2/44-x-ai_grok-4.7-A2.json` 的 `usage`、`cost_details`、`reservationUsd`）＋复跑（`draft-50-sources/price_check.py`：对 91 个被接受的请求，用 `probe.mjs:33-65` 的登记单价乘上报的 `prompt_tokens`、`completion_tokens`，与流报 `usage.cost` 逐个比较）。
- 实际观察：
  - 91 个里 86 个精确相等；不等的 5 个全是 `grok-4.7`。
  - `gpt-6-luna-pro` A2（第 1 轮 #17）：`prompt_tokens` 1508、`completion_tokens` 252（其中 `reasoning_tokens` 235），`max_tokens` 是 64；`upstream_inference_prompt_cost` 0.0001508、`completions_cost` 0.000126，正好是登记价 1e-7／5e-7 每 token 乘以上报 token 数。
    其余 OpenAI `-pro` 路由同样精确对上（例如 `gpt-6-astra-pro` A1：1558×1e-5＋172×5e-5＝0.02418），`completion_tokens` 143–316，都超过 64。
  - `grok-4.7` 五个请求：`completions_cost` 都等于 `completion_tokens`×6e-6（例如第 2 轮 #44：1649×6e-6＝0.009894），登记价是 4.8e-6；`prompt_cost` 五个都是 0.000836，`prompt_tokens` 1282 里缓存 1152，
    与「未缓存 130×2e-6＋缓存 1152×5e-7」相符（登记价 1.6e-6；这一拆分是拟合，记录里没有分项）。缓存折扣使其中两个（#43、3#1）总价反而低于按登记价算的值。`grok-4.6` 没有缓存 token，三个都按登记价精确对上。
  - 第 2 轮 #44：`completion_tokens` 1649（其中推理 1605），`max_tokens` 64。
  - 其它超过 `max_tokens` 64 的：`grok-4.7` 其余四个（450–1945）、`grok-4.6`（424–896）、`qwen3.8-27b`（526–622）、`qwen3.7-flash`（65）；Anthropic、Google、Kimi、Z.AI、DeepSeek、其余 Qwen 与 OpenAI 非 `-pro` 路由的 `completion_tokens` 都不超过 64。
- 支持范围：两次停机的直接原因都是计费的输出 token 远超 `max_tokens`；`-pro` 路由的单价与登记一致，`grok-4.7` 的输出单价比登记高 25%。不支持对这些路由 `max_tokens` 语义的一般推广（只观察了 `max_tokens:64` 一种取值）。
- 消费对象：C-7。

## E7 仓库现状：投影与 parts() 不滤空串

- 取得方式：一手原文（起草时逐行核对，仓库 `73fbfd5ff`）；调研报告给出的同一批行号经核对一致。
- 实际观察：
  - `packages/model/pi-ai-transport/src/projection.ts:26`：`export const INPUT_PROJECTION_REVISION = 'openrouter-input-projection/3'`。
  - `packages/model/pi-ai-transport/src/plan.ts:95-117`（`parts()`）：可见文本块一律 `result.push({ type: 'text', text: block.text })`（`:99`），不看 `text` 是否为空串；图片在路由声明图片输入且数据内联时投成 `image_url`（`:102-106`）。
  - `plan.ts:215-249`：用户、提醒、压缩三类消息的 `content` 就是 `parts()` 的结果数组（提醒与压缩前面另加一个非空的标记文本段）；工具结果把图片拆成一条只含 `image_url` 段的用户消息（`:230-234`）。
  - `plan.ts:258-265`：生产计划体是 `model`、`provider:{order:[provider], allow_fallbacks:false, require_parameters:true}`、`stream:true`、`store:false`、`messages`、有工具时 `tools`。
  - `packages/model/pi-ai-transport/src` 里检索 `text.length`、`text === ''` 一类的空串判断，只在 Anthropic 缓存选靶（`anthropic-cache.ts:25`）与助手消息投影（`assistant-projection.ts:43`、`:61`）里出现，用户消息路径上没有。
  - 规格允许空串：[content-blocks v3 S-8](../../design/spec/data/content-blocks/v3/contract.md#s-8-文本块与来路标记)（`contract.md:276`）「`text` 是给人和模型看的一段话，可以是空串」；包内 Schema `packages/core/content-blocks/schema/content-blocks.schema.json:164-183` 的 `TextBlock.text` 只有 `type: string`、没有 `minLength`。
- 支持范围：一条含「图片＋空文本块」的用户消息，在不被别处拦下时，会把空文本段原样发上线。不支持「生产里哪些入口真会产出空文本块」——未调查。
- 消费对象：C-5。

## E8 仓库现状：Anthropic 末条的缓存选靶

- 取得方式：一手原文（起草时静态读代码与测试，没有实际调用 `planRequest`）。
- 实际观察：
  - Anthropic 路由的缓存只允许一种配置：`mode:'explicit'`、`breakpointLayouts: [['last_message']]`（`official-models/anthropic.ts:25-32`）；`configuration.ts:80-92` 只接受与路由声明逐项相同的 TTL 与断点布局。
  - `plan.ts:331-352`：`last_message` 断点在 Anthropic 稳定数组路由上调 `attachAnthropicCache`，拿不到靶就 `return { rejected: 'unavailable' }`（`:344-345`）。
  - `anthropic-cache.ts:9-42`：只看最后一条 user／assistant／tool 消息；靶要么是其中最后一个**非空**文本段（`:24-26`），要么整条末尾用户消息全是内联图片段（`:28-40`）；`[image, text:'']` 与 `[text:'', image]` 两样都不是，返回 `undefined`（`:41`），`attachAnthropicCache` 随之返回 `undefined`（`:47`）。
  - `tests/anthropic-cache-target.spec.ts:91-96`：`[]`、`[text('')]`、`[text(''), image]` 三种末条都断言 `{ rejected: 'unavailable' }`。`[image, text('')]` 没有单独的测试，由同一段代码推出。
  - 历史位置：缓存选靶只看最后一条消息；Anthropic 计量器对用户消息的数组内容，`image_url` 段要求能算出图片 token，`text` 段只要是字符串就收、空串也收（`input-meters/anthropic.ts:219-243`）。
    所以非末条的「图片＋空文本」用户消息过得了这两关，与调研报告「历史位置能发」的说法一致。
- 支持范围：末条「图片＋空文本」在 Anthropic 四条路由上发送前即被本地拒为 `unavailable`，零 HTTP；非末条时过得了缓存选靶与计量器两关。其余检查（输入上限、图片预处理）未逐条过。
- 消费对象：C-5。

## E9 仓库现状：哪些路由的计量器在发送前拒收图片，哪些放行

- 取得方式：一手原文（起草时静态读代码与测试，**没有**对任何路由实际调用 `planRequest`）。
- 共同路径：计量器 `measureFull` 返回 `unavailable` → `calibration.ts:382-383` 返回 `undefined` → `plan.ts:393-398` 以 `{ rejected: 'invalidInput', reason: 'input_size_unavailable' }` 拒绝，在发送之前。
- 拒收图片的：
  - Google 两条：`google.ts:163-169` 取 `googleCandidateFeatures`，遇到 `image_url` 即失败（`google-candidate.ts:52`、`:55`）。
  - xAI 两条：`xai.ts:96-107` 要求用户消息的数组内容每段都是 `text`，否则 `supported()` 为假，`:150-151` 返回 `unavailable`。
  - Qwen 商业五条（`qwen3.8-max-0902`、`qwen3.8-max-prime`、`qwen3.8-flash`、`qwen3.7-plus`、`qwen3.7-flash`）：只对 `visualModelId = 'qwen/qwen3.8-27b'`（`qwen.ts:42`）放行图片（`:351`），其余遇到非文本段 `content()` 返回 `undefined`（`:193`）。
    `tests/qwen-commercial-counterexamples.spec.ts:513-524` 把纯图片用户消息列为反例。
  - Z.AI 两条：`official-catalog.ts:111` 把 `glm-5.3-flash` 绑到 `createGlm53InputMeter`、`:113` 把 `glm-5.3-flashx` 绑到 `createZaiCommercialInputMeter`；两者最终都走 `renderGlm53Prompt`（`zai-commercial.ts:129-131`），
    用户消息内容经 `visibleText`（`zai-glm52.ts:58-68`）只收 `{type:'text', text}` 段，图片段使解析失败（`zai-glm53.ts:34-37`）。`tests/zai-glm53-meter.spec.ts:178-191` 对 `glm-5.3` 与 `glm-5.3-flash` 断言纯图片消息得 `unavailable`；`tests/zai-commercial-meter.spec.ts:455-512` 对 `glm-5.3-prime` 与 `glm-5.3-flashx` 逐个断言同样的结果（`:503-512`）。
- 放行「图片＋空文本」的：
  - OpenAI 十二条：`openai.ts:86-97`、`:130-137`，用户消息的每段是任意字符串的 `text` 或 `image_url` 即可。
  - DeepSeek V4.1 Flash：`deepseek-v41-flash.ts:79-92`，`text` 段（不含图片占位符）与 `image_url` 段都收。
  - Kimi K3、K2.7 Code：`moonshot.ts:183-201`（`contentSegments`），`image_url` 段要求内联 png／jpeg／webp（`:22-37`），`text` 段只要是字符串就收，空串也收（`:195-199`）。
  - Qwen3.8-27B：`qwen.ts:182-191` 收图片，`:193-196` 收任意字符串的文本段。
- 支持范围：上面每条只在计量器这一关成立；计划还要过输入上限、图片预处理等其它检查，起草时没有逐条执行。调研报告的同一结论与此一致。
- 消费对象：C-5。

## E10 上游 pi #9797 与修复提交

- 取得方式：一手原文（`gh issue view 9797 -R earendil-works/pi`、`gh api repos/earendil-works/pi/commits/1b6ddca87ca041e3b02b387d5a321eb77fc39eca`，2026-10-02 约 17:12；源码取自主检出 `tmp/sources/` 的钉住归档，`sha256sum -c SHA256SUMS` 通过）。
- 来源与精确修订：[earendil-works/pi#9797](https://github.com/earendil-works/pi/issues/9797)（2026-09-20 开、2026-09-21T19:48:49Z 关）；修复提交 `1b6ddca87ca041e3b02b387d5a321eb77fc39eca`（2026-09-21T19:48:11Z，「fix(ai): omit empty text parts from multimodal user messages」）；
  pi `3390bd9`（`packages/ai` 0.86.1）与 `a13d35a`（1.0.0）的 `packages/ai/src/api/openai-completions.ts`。
- 来源立场：issue 正文是用户报告（作者自述的复现），提交与源码是上游实现。
- 实际观察：
  - issue 的复现只用直连 Z.AI：`pi --mode rpc --model zai-coding-cn/glm-5.3-flash`，错误 `400: {"code":"1210","message":"API 调用参数有误，请检查文档。"}`；正文称「Nothing is billed, so the usage numbers give no hint」，并称该消息会在之后每一轮重放，使会话对 GLM 模型永久失败。没有点名 Moonshot 或其它供应商。
  - 修复只改用户消息的数组分支：pi 1.0 `openai-completions.ts:1253-1281` 里 `.filter((item) => item.type !== "text" || item.text.length > 0)`（`:1261`），过滤后为空就整条跳过（`:1277`）；字符串形式的用户消息不动。pi 0.86.1 同一处（`:1260`）没有这一过滤。
  - pi 1.0 `packages/ai/CHANGELOG.md:92`（0.87.1，2026-09-22）：「Fixed image-only user messages being rejected by some OpenAI-compatible providers because they included an empty text part」。
- 支持范围：上游修法的确切范围与它的触发报告。issue 里「不计费」只是直连 Z.AI 的用户说法，不覆盖经 OpenRouter 的请求。
- 消费对象：C-2、C-4。

## E11 OpenRouter 文档对错误体与余额接口的说法

- 取得方式：一手原文（`curl -sL https://openrouter.ai/docs/api-reference/errors`，被重定向到 `https://openrouter.ai/docs/api_reference/errors-and-debugging`；`curl -sL https://openrouter.ai/docs/faq`；2026-10-02T17:16:59Z）。
- 来源与精确修订：错误页 sha256 `89176d8cbbe213446cf17076a730cb330a82640c32a9a404a01792bc25ddd553`；FAQ 页 sha256 `5db0422783fda6a1e1d24e123929adda5be022b7fe5fd8638699cf1c1cdc6afb`。原件在会话临时目录 `draft-50-sources/`，可能已清理。
- 来源立场：作者自述。
- 实际观察（原文）：
  - 「Pre-stream errors」：「Errors that occur before any tokens are sent follow the standard error format above, with appropriate HTTP status codes」，此时可以「Silently retry with a different provider endpoint if fallback routing is enabled」。
  - 「Provider errors」：「For Chat Completions, a provider error that interrupts generation carries error_type inside error.metadata」；「the upstream provider's own error code is surfaced in error.metadata.provider_code when available」；`metadata.raw` 携带「the provider's verbatim payload」。
  - 「Request validation」表：`invalid_prompt`「A specific message in the messages array is invalid (e.g. unsupported role, empty content)」。
  - 「When no content is generated」：「In some cases, you may still be charged for the prompt processing cost by the upstream provider, even if no content is generated.」——说的是 200 且无内容的情形，不是 4xx。
  - FAQ：「We also provide a credits api that has live information about the balance and remaining credits for the account.」
  - 两页里检索 charged／billed／failed request，没有找到「请求被拒是否计费」的明文。
- 支持范围：文档宣称的错误体形状与余额接口的定位。与本轮观察的分歧见下节。
- 消费对象：C-2、C-4。

## 冲突与不一致

| 事项 | 一方 | 另一方 | 本轮处理 |
|---|---|---|---|
| 错误体是否带 `error_type`、`provider_code` | E11：文档称供应商错误在 `error.metadata` 里带 `error_type`，上游错误码在 `provider_code` | E4：六个 400 的 `metadata` 只有 `raw`、`provider_name`、`is_byok`，Z.AI 另有 `provider_error_code` | 以实测为准照录；文档与实测在同一天，分歧原因未查 |
| 余额接口是不是实时 | E11：FAQ 称「live information」 | E5：三轮读数都滞后约 40–57 秒 | 并列；对账以滞后为前提 |
| 中途停机的原因 | 本会话交给起草的说法：「`-pro` 路由与 grok 的实价高于登记价」 | E6：`-pro` 路由单价与登记价精确一致，超支来自远超 `max_tokens` 的推理 token；只有 `grok-4.7` 的单价确实更高 | 以原记录为准，C-7 照 E6 写 |
| 投影修订号 | 本仓库 issue #50 正文（以 `fda5d0548` 为准）写 `openrouter-input-projection/2` | `git show fda5d0548:…/projection.ts` 第 26 行与 `73fbfd5ff` 都是 `/3`；`/3` 自 `99d8a08af` 起就在 | 以源码为准；issue 正文是笔误 |
| 实测总花费 | 本会话交给起草的说法：三轮余额差合计约 0.2004 美元 | E5：三轮余额差之和漏掉各轮末尾未入账的部分；跨度 0.2302，流报之和 0.2320 | C-6 照 E5 写 |

## 探路件清单与复现命令

全部在会话临时目录，**可能已清理**；目录前缀 `S=/tmp/claude-1001/-data-qiwei-repos-omne-harness-lite/0d12f3b6-aa72-4661-a80c-d0422eb23a91/scratchpad`。

| 位置 | 是什么 | 复现 |
|---|---|---|
| `$S/issue-50/runner/probe.mjs` | 探针（`--dry-run` 默认、`--live`、`--self-test`） | `node probe.mjs --dry-run`（离线）；付费运行经 `run-live.sh` |
| `$S/issue-50/run-live.sh` | 付费运行的包装：钥写进 0600 临时文件、退出即删 | `bash run-live.sh <输出目录名> [--routes …] [--cap-usd …] [--image-token-allowance …]` |
| `$S/issue-50/live-1/`、`live-2/`、`live-3/` | 三轮原始输出（逐请求 JSON 与 `summary.md`，含组织 id，未抹） | — |
| `$S/issue-50/prices.py`、`a.txt` | 31 条路由的登记单价（与 `probe.mjs:33-65` 同一张表） | — |
| `$S/draft-50-sources/reconcile.py` | E5 对账 | `python3 reconcile.py $S/issue-50` |
| `$S/draft-50-sources/price_check.py` | E6 按登记单价逐个核算流报费用 | `python3 price_check.py $S/issue-50` |
| `$S/draft-50-sources/build_reports.py` | 生成本包 `reports/` 的抹 id 存档、索引、`provenance.json` 与 `SHA256SUMS` | `python3 build_reports.py $S/issue-50 <reports 目录>` |
| `$S/draft-50-sources/or-*.html` | E11 的两页文档原件 | `sha256sum` 对上 E11 |

上游 OpenRouter 或任一供应商的行为没有版本号可钉；本页的「版本」就是实测窗口的时间戳。重测时 grep 页首的 token，命中的记录就是要重核的候选。


## 2026-10-03 归档与离线复核入口

上述 `$S` 是原运行位置。现在三轮的全部 97 条逐请求原件及三个汇总已作组织标识脱敏，归档到 `reports/archive/live-{1,2,3}/`；逐文件原 SHA、归档 SHA 与脱敏标志在 [archive/provenance.json](reports/archive/provenance.json)。原有 reports/ 的六个拒收样本与汇总保持原归档字节。

原探针和两页文档在 [reports/sources/](reports/sources/)；`original-probe.mjs` 保留原 SHA，`portable-probe.mjs` 仅新增 URL 路径解析、将仓库定位改为从文件所在位置求值，协议与请求构造不变。仓库根的离线复核命令：

```sh
node .meta_harness/research/empty-text-part-acceptance/reports/sources/portable-probe.mjs --dry-run
python3 .meta_harness/research/empty-text-part-acceptance/reports/sources/reconcile.py .meta_harness/research/empty-text-part-acceptance/reports/archive
python3 .meta_harness/research/empty-text-part-acceptance/reports/sources/price_check.py .meta_harness/research/empty-text-part-acceptance/reports/archive
```

探针仍是原最小协议体，不是当前生产规划／发送证据。修后生产调用须另记运行。本次归档没有联网或付费。


离线复核修复记录：首次核价因原 `a.txt` 未被旧会话保全而退出 1。现在从精确保全的原探针 `ROUTES` 表恢复全部 31 行到 `reports/archive/a.txt`，来源 SHA 与派生 SHA 单列在 archive/provenance.json，未冒充原 `a.txt` 字节。核价脚本第二次退出 0；费用合计由全部 97 原记录独立相加得到 `0.232026600000`。
