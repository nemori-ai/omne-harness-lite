# 交回 w3-docs-mcp

## 1. 结论

做完。分类表里属于 MCP 一侧的 A 类、B 类（按裁定）条目已写回，第 3 条的取代核对已做，没有遇到需要停下的新语义分歧。三份成员 SPEC 的钉只改了一行。四项门禁退出 0。本闭包没有改代码。

## 2. 提交

分支 `PanQiWei/skill-mcp-w3-docs-mcp`，基线 `3289bee2f`。作者与提交者都读回为 `PanQiWei <594557445@qq.com>`，trailer 为 `Harness: claude-code`、`Agent-Role: developer`，没有 Co-Authored-By。

| 提交 | 内容 |
| --- | --- |
| `26ab418a7` | 组页、同源页 key-flows、组入口、成员 README、领域页状态句（组页提交） |
| `f2fc80ace` | 三份成员 SPEC 的组设计钉改为 `26ab418a7`（钉提交） |

## 3. 改了哪些文件

- `packages/mcp/docs/architecture.md`：第 1、3、5 条。
- `packages/mcp/docs/key-flows.md`：第 2 条，加与组页同类的取代项。
- `packages/mcp/README.md`：W-5、W-6 的状态句、版本句与图注。
- `packages/mcp/mcp/README.md`、`README_ZH.md`：TP-5、W-9、W-11。
- `docs/domains/mcp/architecture.md`：W-6 的状态句。
- `packages/mcp/mcp/SPEC.md` 第 10 行、`packages/mcp/mcp-contract/SPEC.md` 第 11 行、`packages/mcp/mcp-host-local/SPEC.md` 第 10 行：只换钉的哈希（9 字符换 9 字符）。

`git diff --name-only 3289bee2f..HEAD` 共 9 个文件，都在写范围内。三份 SPEC 的 diff 各 1 行。

说明：仓库的 `format:check` 不覆盖 Markdown。我曾对三个 Markdown 文件跑过 `oxfmt`，它把表格列宽重排了。我随后把表格空白还原成原样，所以 diff 里只有有意的改动。

## 4. 条目逐项（验收 1）

行号是 `26ab418a7` 上 `packages/mcp/docs/architecture.md` 的行号（下称「组页」）。

| 编号 | 处置 | 改后的位置 |
| --- | --- | --- |
| TP-4 | 已改 | 组页 l.194（不变式 5）：建连时限从 `attempt()` 之后起计，覆盖对遗留进程的再停、取凭据到协商与失败后的收场；加每次 `ensure` 的临界区时限、加入在途建连的时限；保留刷新取分页另起一个时限。同源页 key-flows「F-MC01」末段同样改（已合并 TP-5 的「README 不再重写起点」，README 里没有起点句）。依据 MC-5、MC-7 |
| GM-5 | 已改 | 组页 l.399–401：删三条已知限制，改写为「端口 reject 按契约固定规则处置」加指向 mcp SPEC 已知限制。`Connections` 行（l.397）加「`closeAll` 之后本实例不再建立连接（S8）」 |
| W-4 | 已改 | 组页 l.19（知道谁）、l.83（协议基线第 2 项）、l.87（第 4 项，旧 HTTP+SSE 回退一次，`WireContext.mode` 是 `sse`）、l.350（`McpTransport` 行）、l.623（Q-MC03）。读口外的 SDK 说法统一为「优先复用，三条硬承诺例外自写，产品源码不导入 SDK」。依据 host-local SPEC「与 SDK 的复用关系」、契约 T3、裁定「真实传输兑现时」第 6 条 |
| W-5（候选一） | 已改 | 组页 l.72 保留 2.3.1 并加「W3 实际采用 2.4.0，见 host-local SPEC，RFC 同步归后续小卡」；l.623、l.693 加同一说明；`packages/mcp/README.md` 的成员表（l.20）与图注同样处理 |
| W-6 | 已改 | 组页 l.3、l.605、l.704–710（承接表前言与三行状态改为「候选，已有实现，尚未取得技术接受」；`endpoint-and-connection` 行写明 mcp-cordis-contract 服务定义除外；第 4 行「总览…」保持「未承接」）；`packages/mcp/README.md` l.3、l.13、l.17–20；`docs/domains/mcp/architecture.md` l.3；key-flows l.3。`createMcpCore`、「第三波」「模板草稿」已无 |
| W-7 | 已改 | 组页 l.393、l.417 加 `signal?`；l.426 删「偏离」一句与偏离表链接，改指契约 S5 |
| W-8 | 已改 | 组页 l.689 去掉「（第三波）」。同类的「第一波」措辞也一并去掉（l.3、l.300、l.346） |
| TP-5 | 已改 | 成员 README 两种语言：「契约」一项删去任务作用域、`AggregateError` 的机制复述，指向 SPEC MC-10、MC-14；删「SPEC MC-14 怎样兑现」整节；「配置与运行」只留字段规则链接；「验证」删逐条测试与变异清单，留命令、范围与 SPEC、verification 链接 |
| W-9（候选二） | 已改 | 口名不动。组页 l.49 每个操作写出所在服务；l.464 起的 `#### 状态口` 首句与应用服务表、契约 R7 一致（标题不变，入向锚点保留）；两份 README l.9 的「连接口」改回「状态口的两个服务 `status` 与 `connections`」 |
| W-10 | 按裁定不写 | 组页没有加 `checkOutput`、`clock` |
| TP-pins-M（候选一） | 已改 | 提交 `f2fc80ace`：三行钉都改为 `26ab418a7` |
| W-11（候选二） | 已改 | 两份 README 删模块清单，「设计」节改指 `docs/architecture.md`、`flows.md`、`object-model.md` |
| G1–G8 | 候选二，登记 | 原文未留存，由 W-4 至 W-9、TP-4、GM-5 与下面第 5 节的核对取代 |

## 5. 第 3 条核对表（验收 2）

范围：组页没有逐行核对的各节。命中位置是 `26ab418a7` 的行号。分类：照改 = 同一类陈旧文字（组页的说法被契约条款取代）；无冲突；新分歧 = 停下不改。结果：没有新分歧。

### 5.1 照改（组页的说法被契约条款取代）

| 契约裁定与条款 | 组页命中 | 处置 |
| --- | --- | --- |
| 裁定 7、18 与 T3（客户端能力：现代修订声明任务扩展与 `elicitation.form`，旧修订为空对象） | l.89 第 6 项写「只声明 elicitation」 | 照改，指向 T3 |
| 裁定 13 与 C2（不订阅，`changedNotified` 保持为假） | l.317、l.416 写「清单变化通知更新新鲜度」「取得后是否收到通知」 | 照改 |
| 裁定 25 与 S2（`cancelTask` 的建连规则与其他三个任务操作相同；复用连接时不核采用与资格，新建时才核） | l.469、l.474（含「`cancelTask` 不为取消启动新进程」）、l.493、l.505；key-flows l.150–151 | 照改。该句与 S2 不符，已删 |
| 裁定 29 与 R2（占位后发出前，调用方 `signal` 已触发也答 `cancelled`） | l.459 只写 `cancel` | 照改，加一句 |
| 裁定 30 与 S8（`closeAll` 之后要连接的操作先判关停，先于采用核对） | l.496「读口与调用口一律返回 `not-available-to-you`」 | 照改：加例外条目（l.498），第一条加「下一条的关停与中止两种情形除外」 |
| 裁定 31 与 S5（没有发布时，调用方已中止答 `kept`（`cancelled`），先于关停的答复） | 同上 l.496 | 同上 |
| 裁定 1 与 S5（`refresh` 请求带 `signal?`） | l.393、l.417 签名 | 照改（W-7） |
| 裁定 27 与 S2（`inputResponses` 可选，两项至少有一项） | l.435、key-flows l.145 | 照改 |
| S5（读取或写入不可用都答 `unknown`） | l.417 只写写入 | 照改 |
| 裁定 17、`./testing` 入口（六个套件，`mcpTransportConformance` 已导出）；入口表（公开根给调用方与实现方） | l.609、l.689；`packages/mcp/README.md` 的 mcp-contract 行写「传输契约测试…还不在本成员」 | 照改 |
| V3（地址不含反斜杠） | l.325 | 照改，加「反斜杠」 |
| T5、裁定 9、21（取消按传输与修订分：现代修订 HTTP 中止应答流，stdio 与旧修订发通知） | key-flows l.145 写「Streamable HTTP 关闭响应流，stdio 发 `notifications/cancelled`」 | 照改（同源页） |
| 裁定 4、5、6、30（reject 的处置、`unconfirmed`、`closeAll` 之后不再建连） | l.399–403 | 见 GM-5 |
| 裁定 1（`refresh` 的 `signal` 不再是偏离） | l.426 | 见 W-7 |
| 裁定 17（`mcpTransportConformance` 已导出） | l.689 | 见 W-8 |

### 5.2 grep 过的其余裁定与条款，无冲突

| 契约裁定与条款 | 组页命中 | 结论 |
| --- | --- | --- |
| 裁定 2（`McpClock`）、26（`checkOutput`） | 组页不写 | 无冲突；W-10 按裁定不写 |
| 裁定 3（导出 `canonical`、`sameJson`、`isActionArgs`） | 组页不写 | 无冲突 |
| 裁定 8、T2（`withheld`） | l.279 写「每一项合法才算完整」 | 无冲突：传输在页之前剔除，C1 不变 |
| 裁定 10（HTTP 流断开只重发读类请求一次）；T8 | l.660–666 偏离记录写「`discover`、`tools/list`、`tasks/get` 仍按协议重发」 | 无冲突 |
| 裁定 11、R4（well-known 次序、两种 403） | l.380 | 无冲突，组页是子集，链到 R4 |
| 裁定 12、O2（任务提示） | l.528 | 无冲突，提示是可选的加项 |
| 裁定 14、S6（`progressToken`，通知不可信） | l.460 | 无冲突 |
| 裁定 15、R2（`args` 必须是 JSON 对象，否则 `TypeError` reject） | l.438 | 无冲突，组页没写前提违反；契约 R2 是唯一源 |
| 裁定 16、V1（空 `requestState` 合法） | l.527、l.439 | 无冲突 |
| 裁定 19、20、22、23、24、T7–T9（决策表、失败码、传输处置） | l.350–351、l.559–560 | 无冲突，组页链到 T1、T6 |
| 裁定 28、O1、O3（`classifyOutcome` 吸收校验函数的抛出） | l.492、l.525 | 无冲突 |
| K1–K3、C1–C8（键、清单、权限项） | l.170、l.266–301、l.334–340 | 无冲突 |
| O2–O6（结局分类）、D1–D5（内容交付） | l.519–541 | 无冲突 |
| R1–R3、R5–R7、S1、S3、S4、S7、S9 | l.186、l.195、l.323–330、l.396、l.552 | 无冲突 |
| E1–E6（正文、设置声明次序） | l.168、l.321–330 | 无冲突 |
| UE、CU、PL、CS、AV（端口） | l.37–41、l.352–365 | 无冲突 |

### 5.3 观察到但没有改（不属于「同一类陈旧文字」，或在写范围外）

- 组页 l.180 的 `Connection` 候选操作名 `open()`、`markLost()`、`close()` 与 mcp SPEC MC-5 的 `attempt()`、`ready(peer)` 不同。组页 l.7 已声明代码样式的英文名是候选标识，所以不算冲突，未改。
- 契约 S7 把「协商」「会话」限定在旧对端，组页 l.194、l.211 用「协商」泛指 `discover` 与 `initialize`。这是用词差别，契约这条限定只约束 S7 自己的措辞，未改。
- `packages/mcp/README.md` 的「允许依赖」列与「依赖方向」句写 mcp-host-local → mcp，而 `mcp-host-local/package.json` 里 `@omne-harness/mcp` 只是 devDependency。这是组入口的依赖规则，不是第 3 条的组页范围，可能是新的语义分歧。未改，请派发者裁定它是设计意图（允许依赖）还是需要改的陈述。
- `packages/mcp/mcp-host-local/SPEC.md` l.12 的依据行写「本成员的位置：…官方 SDK 只出现在本成员」。它转述组页旧说法，在写范围外，只改了钉。交给 `w3-mcp-e2e` 或后续 SPEC 维护者。
- `packages/mcp/mcp/README*.md` 的「维护」一节仍是契约条款到模块文件的对照（S2 是 `calls.ts`…）。triage 没有点名，它是条款到文件的映射，不是机制复述，保留。如要删，由派发者另定。
- 清单容错（单个不合法工具剔除并报告）还没进契约 C1。组页「每一项都合法」与现行契约一致，没有改。

没有「只有负责人能定」的待定项。

## 6. 验收命令与结果（验收 3、4、5、6）

门禁运行在提交 `f2fc80ace`（工作树干净）。日志在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/logs/`，时间为 2026-11-06 的 UTC 或本机时间 10:15–10:16。

| 命令 | 退出码 | 输出尾部 | 日志与 sha256 前 16 位 |
| --- | --- | --- | --- |
| `pnpm run check:docs` | 0 | `PASS: 2751 Markdown files; local links and skill mirrors.` | `w3-docs-mcp-check-docs.log`，`b3e07335068702a3` |
| `pnpm run check:design` | 0 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `w3-docs-mcp-check-design.log`，`5030066a0ee9344c` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `w3-docs-mcp-format.log`，`fb50edafcdd4688e` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6198 个提交的署名，无违反。` | `w3-docs-mcp-lint-rules.log`，`d6b754c16c0dcdf7` |

另：组页提交 `26ab418a7` 之后单独跑过一次 `check:docs`，也是 PASS。

grep 证明旧说法已不在目标页（组页、key-flows、组入口、领域页、成员 README 两种语言）：
- `createMcpCore`：0 处。
- `第三波`、`模板草稿`、`对契约的偏离`、`只出现在 mcp-host-local`、`不支持…HTTP+SSE`、`取凭据开始计时`、`进程与句柄的归宿不保证`、`closeAll 不阻止`：0 处。
- 「连接口」「connections port」：0 处。
- 成员 README：没有「模块：」清单，没有「MC-14 怎样兑现」，没有 `AggregateError`。

`git diff --name-only 3289bee2f..HEAD`：9 个文件，全在写范围内。三份 SPEC 各 1 行。`git ls-files --eol` 对这 9 个文件没有 CRLF。

## 7. 没覆盖到的项

- 这是文档写回。证据只有文档检查与 grep，没有行为验证，也没有变异。「导航与链接一致」不证明语义正确。
- 第 5 节的核对是逐条契约 grep 加读组页，没有逐行把组页与契约对读。第 5.2 的「无冲突」是在已读区域内的结论。
- 评审、技能写回（`w3-docs-skill`）和 `w3-mcp-e2e` 的 SPEC「组合与验证」不在本闭包。
- 门禁日志的时间：10:15–10:16，所跑提交是 `f2fc80ace`，此后没有再改文件。
