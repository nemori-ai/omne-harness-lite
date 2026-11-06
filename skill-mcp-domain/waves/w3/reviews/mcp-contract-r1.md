# w3-mcp-contract 第 1 轮评审（head 1cbee8026，基线 05f281394）

## reduce 复跑（evidence/w3-mcp-contract/reduce/）

两成员 build/typecheck/test 16/16（424 + 254）；lint:rules、lint:oxlint、lint:deps、format:check 退出 0；`src` 无断言（命中都在字符串里）。写者报告 52 条变异全部变红。

## L3（implementation-reviewer，opus@high，探针在 scratchpad/review-w3-mcp-contract/）

交付边界：验收 1、3、4、6、7、8 满足；MC3-1 满足；MC3-2 部分满足。只做了可加改动；`mcp` 在新契约上 254 例绿；SEP-2663 线上形状与原文一致。
- 阻断 1：T5 stdio 关闭次序用例把管道换成不接进程的流，真实传输必然失败（probe-pipe）。挡住 `w3-mcp-host` 的 MC3-9。
- 阻断 2：`reportRejection` 只在一种形状下核（`tools/list`/`discover` 的 401 不回报、403 带 `invalid_token` 质询也回报，两者都 0 失败）。
- 阻断 3：`-32022` 无共有版本、重试后仍 `-32022`、`-32021` 回退旧一路，0 失败。
- 阻断 4：`tasks/update`、`tasks/cancel` 不带 `_meta`，0 失败；stdio 取消通知只核一个键。
- 非阻断：旧一路 instructions 不截断不红；stdio + `pace` + 探测时限 0 把现代对端判成旧对端；`failed` 缺 `error` 时编造错误；用例数报 54 实为 53；任务提示收负数与非整数。
- 待裁：`tasks/*` 在 HTTP 上 `Mcp-Name` 应为任务号（SEP-2663 MUST），且 `PeerReceived` 记不了 HTTP 头；协商后 `_meta` 版本取值；旧一路 `initialize.params.capabilities`；HTTP 400 正文怎样算旧对端；`failed` 缺 `error` 的 `what`；旧一路协议版本不核支持列表。另：T4 写死 `https://peer.test`；`received()` 同步，真实夹具在中止后才看到。

## 设计与实践 + SPEC 表达

第 2 轮之后一起做（本轮先修阻断，避免两次返工）。

## 第 2 轮（head f06b4e632）

- reduce 复跑：16/16（459 + 254），四项 lint 与格式退出 0；结构性改动 `grep` 核实。
- 增量 L3（opus@high，探针在 scratchpad/review-w3-mcp-contract-r2/）：无阻断。C1–C6、C8、C9 与待裁 1、3 关闭；C7、待裁 2、4、6 部分关闭。第 1 轮全部违约传输（B1–B8 各变体）现在都变红。真管道 stdio 传输 47 过、0 败、20 不适用（全是 HTTP 用例），夹具接口可由真实传输实现（对端须是读脚本的子进程，SDK 服务端做不出的脚本答 `NotApplicable`）。建议：协商版本只在部分方法上核（N2 三变体 0 失败）；旧一路 HTTP 头依赖材料次序（N1d）；非 discover 请求的 400 无用例（N4c/N4d）；`getTask` 收「`error` 不是对象」不核（N5c）；旧版本列表只测低于范围的值（N6b/N6c）；`modernPath` CC 19、`httpAnswer` CC 14 未交代。待裁：旧连接 `_meta` 声明任务扩展与裁定 3 字面冲突；与 SDK 2.4.0 的另两处探测差异（`-32022` 无 `supported`、只列旧版本）；夹具 `protocolVersions` 能否含旧版本；HTTP 上 discover 的 404/405。

## 第 3 轮（head c407fab9d）：SPEC 表达评审（design-reviewer opus@xhigh）

reduce 复跑 16/16、四项 lint 与格式退出 0；51 条变异全部变红。表达评审阻断 B1–B8：T3 总则「两条路都失败才答失败」比已定事项宽、与例外冲突；HTTP 上 JSON-RPC 层的回退规则缺；T 节缺端口 reject 条款；observe 交出什么没写；`error-missing` 与 `error-shape` 重叠；旧一路 `initialize` 读懂的定义缺；非 discover 的 HTTP 状态与旧会话终止无规则（S7 `session-ended` 无法产生）；`nextCursor` 写坏时可能把不完整清单当完整发布。非阻断 N1–N19；组页冲突 G1–G8（波末写回）；待裁 P1–P5。

## reduce 处置（2026-11-04T11:30Z）：结构性重写，不再补条款

根因：T3、T5、T7 经三轮逐条加例外而成，不是一个全函数。处置：把传输的读法重写成定义在封闭输入域上的全决策表，套件用例由表的行生成；见闭包规格追加记录 11:30Z。P1：SDK 越过了已接受的 RFC-0001 r4，reduce 已钉回 2.3.1（28ca6aaf8）；契约引用改为 2.3.1。

## 第 5 轮（head 6c18e83fa）：最终表达评审

T8 抽象表与数据表逐行一致，划分无空格无重叠（人工推算，989 组合）；旧阻断 B1–B8 闭合（B7 表内闭合）。新阻断 A1–A5 在表的两个边上：A1 请求离开前失败与域外 HTTP 状态（1xx/3xx、SSE 未结束）无归类；A2「对本请求的 JSON-RPC 应答」「读不懂的错误对象」「纯」没有信封判据；A3 stdio 崩溃时流断开与进程退出两类都适用；A4 S5 与 S7 对同一个 T8 结论给出不同连接状态，S5 缺 `session-ended`；A5 `cancelTask` 新建连接时核不核采用与资格有三种读法。建议 N1–N9。

## 第 6 轮（head aaa8ba492）：增量表达复审（design-reviewer opus@xhigh，本机会话派发）

A1–A3 闭合；A4、A5 大部分闭合，各留残差。N1、N4、N5、N6 已落实；N2、N3、N7、N8、N9 无法核对（第 5 轮原文在云机会话里）。K5 与 SDK 2.4.0 一致（`src-CeKsbNLO.mjs:4377`）。

阻断（评审者判为都适用停止规则）：
- F1 S5 总规则写在「下面各条」之后，管不到它上面的页失败条。
- F2 X02 带「传输不再可用」却没有 `LostReason`；`not-sent`（`connection-unavailable`）在 S7 也没有原因；总规则写在 S5，`invoke` 与任务操作是否适用有两种读法。
- F3 S2 与 S4 对任务操作缺配值的答法冲突。
- F4 `classifyWireEvent` 的 JSON 读法比 SPEC 写出来的严（重复键、空行、BOM、上限；id 按词形比较）。

非阻断：F5 探测在途时 `close()` 按 D13 还是 T5；F6 `stdio-ended` 的组成时机；F7 HTTP「应答头之前失败」指哪个超时；F8 应答头之后的流中断没有 `WireEvent`、1xx 的归法；F9 组合数 989 过时（实为 1007）；F10 组合与验证表缺 `wire.spec.ts`；F11 T2 错误对象判据重复；F12 SDK 只在现代修订、非 stdio 上剔除 `x-mcp-header`，T2 在旧修订上也剔除。

### reduce 处置（2026-11-05，本机会话；不开第 7 轮）

- F1、F2、F3、F9、F10、F11 是指到行的表达修正，派发者自己改（delegate「何时不派」）。F2 的取值从应然定：总规则移进 S7，管每个请求；X02 与已成立连接上页请求的 `not-sent`（`connection-unavailable`）记 `stream-broken`（到对端的通道断了），`discover` 上的仍是 `preparation-failed`。与 `@omne-harness/mcp` 的 `pageNotSent` 和脚本化替身一致。F3：任务操作只在要新建连接时核配值，配值缺陷算「没有可以建连的材料」，答 `effect-unknown`（`no-connection`）。任务的状态在对端，连不上时调用方得到的事实就是效果未知。
- F12 按「本组不比协议与官方 SDK 更严」改：只在说现代修订的 Streamable HTTP 上核。依据：SDK 2.4.0 `public-CvV4ZHkX.mjs:3989` `_excludeInvalidXMcpHeaderTools` 只在 `getProtocolEra() === "modern"` 且非 stdio 时剔除；SEP-2243 属于现代修订，旧修订不发 `Mcp-Param` 头。补套件用例与 M165（变红）。
- F4–F8 属「线上事件的归类」，按停止规则登记为未封闭项，拥有者 `@omne-harness/mcp-host-local`（`w3-mcp-host` 用真实传输兑现）。F4 已核：SDK 2.4.0 `dist/stdio.mjs:136` `processReadBuffer` 对读不懂的行只报错，不断开流，所以「非 JSON 行使流断开」比 SDK 严，由 `w3-mcp-host` 按生态兼容定。
- 门禁：`gates-r7/`（两成员 build、typecheck、test 16/16：契约 538、`mcp` 254；`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0）；`red-r3/`（M165 KILLED）。提交 `5c26bc3ae`。
