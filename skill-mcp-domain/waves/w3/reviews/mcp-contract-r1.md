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
