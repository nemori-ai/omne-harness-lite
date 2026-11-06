# 闭包规格 w3-mcp-host-docs

## 身份与位置
- 闭包：w3-mcp-host-docs
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：9893bebead64555dea4572c621be79087b0b9c14
- 清晰度：定

`w3-mcp-host` 第 1 轮评审之后的文档轮（PR #1138）。基线是代码修复轮 `w3-mcp-host-fix1` 交回的 head：决策层已进契约根，会话已重写。本闭包让两个成员的规格与文档说出现在的行为，并按第 1 轮表达评审 B 与卡拥有者的裁定改正。评审与裁定全文在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md`（B 一节的 N1–N16、P1–P5 裁定；A 的 P7 裁定；C 的根因与裁定），代码修复轮的交回在下面「当前认知」。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。理由：规格与文档的改写，判断量在「哪句是契约、哪句是本包、哪句该删」，不改代码 → 默认档；条款多、跨两个成员与契约，取 high。

## 目标边界
目标：(1) 成员 SPEC、README 两种语言、`docs/` 与实现一致，一份承诺只有一份现行源；(2) 契约 SPEC 按裁定补句与改正；(3) SDK 复用表引用的探针收进成员的 `verification/sdk/`。

### 已定的事（不重新裁定）
1. **一份现行源**（B 的 N1）：成员 SPEC「本页的决定」拆成「兑现的契约条款」（只给指针）与「本包自定」（只留会话与线路分开、stderr 读出丢弃、HTTP 线路的选择、`fetch` 错误码集合、应答到达后应答流的去向这一类）；H 条目只写怎样兑现、反例与变异，不复述契约条款。README 两种语言与 `docs/` 只写用法、装配、公开入口与指向 SPEC 条目的链接，不复述机制、次序与映射。
2. **按代码修复轮之后的行为改写**：决策层（契约根导出，见「当前认知」的名单）；线路端口 `openGet`/`GetOpened`（线路只交事实，回退是否成立由会话判定）；计时端口 `Scheduler` 与 `SessionOptions.schedule`；`versions` 是非空元组；`body.ts` 的有界读体；删掉的 `message.ts`；请求的三相与关闭的去向（授权中 → `not-sent`，已发出 → `abandoned`，授权发现中 → 结束发现后答 `authorization-required`，`metadata` 按 R4 为 `unavailable`）；`signal` 释放交换；关闭之后不碰凭据；答复对端请求也经 `authorize`；出站消息按原词形写出。
3. **契约 SPEC 的补句**（只改这些条款的句子，不改其他含义）：
   - T2 或 T3：调用方写的值（`arguments`、`inputResponses`）与回显的对端请求 id 按原词形写出（RFC-0010）。
   - T5：`signal` 触发后传输释放这次交换；现代 Streamable HTTP 上释放就是中止应答流，对端可能读成取消；stdio 与旧修订上对端看不到（P3）。「不发 DELETE」归 T5，`:620` 改为「T5 不要求 DELETE，套件不核」，并列入「表外条款没有手写用例」（P2）。
   - T9：传输只在发出 HTTP 请求（含答复对端请求的 POST）与处理它的应答（`reportRejection`）时调用凭据句柄；与 T4 `:468` 的字面冲突随之消除（P7、B 的 N16）。
   - B 的 N5（「唯一的断流条件」改为「由行内容引起的断流只有一种」）、N6（「读不懂的一行」改为「解析不了的一行（见 T2）」）、N7（1xx 两处统一）、N14（「表外条款没有手写用例」补 T3 回退、T8 SSE 模式、T5 不发 DELETE；`:698` 的已关闭说明移出「未封闭项」）、N15（SDK 引用改为 client 的 `dist/src-CeKsbNLO.mjs`）、N16 的契约部分（`:501` 的开放列举与 SSE 模式下不出现的 D16、S07 在 SSE 模式下的条件）。
   - P1：「真实传输兑现时的裁定」第 10 条放回原列表第 25 条，新节只留本闭包的 9 条；成员 SPEC 的「裁定 1–9」与之一致（N13）。
   - 「三个入口」表与契约 `docs/public-api.md`：根入口加决策层与 `readPeerMessage` 等新导出；T8 的 I07 行写明套件的对端不提供旧一路（表上是不成立的一支）。
4. **成员 SPEC 的其余改正**：B 的 N2（不发 DELETE 只指向契约 T5）、N3（只有 2xx 的正文越界是流断开，错误状态的正文越界按「纯」归类，`docs/flows.md:50` 同步）、N4（H11 写明 `fetch` 自带的头与体超时按 H10 归为流断开；授权元数据取回受请求的 `signal`、关闭与正文上界约束）、N8（`:133` 写 `signal` 触发后对 HTTP 交换做什么，指向契约 T5）、N9（bad ports 移到「与契约的已知偏离」，写明受影响的行 X01 → D15、O05、C04、偏离方向与拥有者；不在发送前另判端口）、N10（F4 改指 T2、F5 改指 T5，MC3-x 改为条款号，「已定事项 N」改指本页的决定或契约裁定，`:11` 只作出处）、N11（复用表表头写明三类理由：违反三条硬承诺之一、规则归契约（已定事项 2：契约已实现的规则不再复用 SDK 的那份）、没有协议行为；每行标出类别；常量行补 T3 `_meta` 与 `LEGACY_PROTOCOL_VERSIONS`）、N12（删手填计数与施工过程，保留「不适用集合已钉死」与理由，定义「stdio 优先」或删去这个说法）、N16（README 与 `docs/public-api.md` 不把 H1–H13 叫「决定」；`docs/architecture.md:33` 补「2xx 而没有应答」，`:34` 与 D14、I05、O04 一致；`:117` 与 `src/README.md:19` 关于 `@modelcontextprotocol/client` 的陈旧句改为它在 `devDependencies`、只给测试用）。
5. **SDK 探针**（P5）：把工作树 `tmp/closures/w3-mcp-host/probes/` 里复用表引用的 `p3`、`p4`、`p5` 与它们输出的关键摘录收进 `packages/mcp/mcp-host-local/verification/sdk/`（脚本可直接重跑，摘录写明 SDK 版本与运行日期）；复用表的证据列改引这里；`verification/index.md` 加一行。
6. **不写的**：成员 SPEC「性质与证据」一节、`verification/README.md`、`verification/models/` 归并行的形式化闭包 `w3-mcp-host-formal`，本闭包不建这一节、不改这两处。

### 写范围
- `packages/mcp/mcp-host-local/SPEC.md` — 现有各节；不新建「性质与证据」
- `packages/mcp/mcp-host-local/README.md` — 用法、装配与链接
- `packages/mcp/mcp-host-local/README_ZH.md` — 同上
- `packages/mcp/mcp-host-local/docs/` — 跟随实现，不复述 SPEC 的机制
- `packages/mcp/mcp-host-local/src/README.md` — 陈旧句
- `packages/mcp/mcp-host-local/src/index.md` — 跟随模块
- `packages/mcp/mcp-host-local/tests/README.md` — 跟随用例文件
- `packages/mcp/mcp-host-local/tests/index.md` — 跟随用例文件
- `packages/mcp/mcp-host-local/verification/sdk/`（新建） — 第 5 条
- `packages/mcp/mcp-host-local/verification/index.md` — 第 5 条的一行
- `packages/mcp/mcp-contract/SPEC.md` — 第 3 条列出的条款
- `packages/mcp/mcp-contract/docs/public-api.md` — 新导出
- `tmp/closures/w3-mcp-host/docs/`（新建） — 过程输出

### 排除的调用方
- 两个成员的 `src/`、`tests/` 的代码与用例：只读。文档与代码不一致时，以代码为准写文档；你认为代码错了，写进交回的「发现」，不改代码。
- 成员 SPEC「性质与证据」一节、`verification/README.md`、`verification/models/`：`w3-mcp-host-formal` 在写。
- `packages/mcp/mcp/`、`packages/mcp/docs/`、`docs/domains/mcp/`：别的闭包或波末。

## 验收清单
1. `pnpm run check:docs` 与 `pnpm run check:design` 退出 0；`pnpm run format:check` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。
2. 成员 SPEC 每条 H 条目与「本包自定」的每一条都指向一处现行源；`grep -n -E 'F[4-8]\b|MC3-|已定事项 [0-9]'` 在成员 SPEC、README 两种语言与 `docs/` 里只剩出处说明（交回附命令与输出，逐条说明剩下的命中）。
3. 契约 SPEC 第 3 条的每一处改动列一张表：条款、原句、新句、依据（评审项或裁定）。
4. 复用表每行标出理由类别；常量、`serializeMessage`、`eventsource` 三行的类别与条款写全。
5. `verification/sdk/` 的探针能在本工作树重跑：附一次重跑的命令与输出尾部，与摘录一致。
6. `grep -n -E '[0-9]+ (个|条)(用例|通过)|passed [0-9]'` 在成员 SPEC 与 README 里为空（不手填计数）。附命令与输出。
7. `pnpm turbo run build typecheck --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract` 退出 0（文档改动不影响构建；`documentation.json` 若有登记一并核对）。

## 实施规格
- 写文档时加载 asd-ste100（中文按语言无关的清晰度规则）。每句只说一件事；不写施工过程、轮次与「reduce 已确认」一类的过程话。
- 条款号与锚点：引用契约条款时给 SPEC 内的锚点链接。
- 命名账本：新节的标题与锚点写进交回。

## 性质及证据义务
- 每处改写都能对应到评审项或裁定；交回附「评审项 → 改动位置」表，没有对应的改动单列并说明。

## 施工计划
1. 读评审记录 B、A 的 P7、C 的根因与裁定；读代码修复轮之后的 `src/`（会话、线路、`body.ts`、`factory.ts`）与契约 `decisions.ts`、`wire.ts` 的导出。
2. 契约 SPEC（第 3 条）。
3. 成员 SPEC（第 1、2、4 条），再 README 两种语言与 `docs/`。
4. 探针（第 5 条）。
5. 门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行文档与设计检查、构建与类型检查、探针；本地提交。不允许：改代码与用例、推送、开 PR、合并、改写范围外文件。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的有：`w3-mcp-host-formal`（另一棵树，从同一个基线出发，写成员 SPEC「性质与证据」与 `verification/`）、`w3-mcp-call-fix1` 与 `w3-mcp-call-model`（另两棵树）。不跑测试套件、不跑 `admission`、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审记录与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md
- 原闭包规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md；代码修复轮：同目录 `w3-mcp-host-fix1.md`
- 文档治理：`docs/engineering/documentation.md`「位置与唯一源」
- 必须加载：asd-ste100

## 当前认知
- 代码修复轮交回（head `9893bebea`）摘要：
  - 契约根新增（`decisions.ts`）：常量 `OFFERED_LEGACY_VERSION`、`METHOD_NOT_FOUND`、`PROBE_REQUESTS`、`RESENT_REQUESTS`、`NOT_SENT_FAILURE`、`ABANDONED`；类型 `ProtocolVersions`、`RequestMethod`、`NotificationMethod`、`WireAnswer`、`AnswerConclusion`、`ProbeConclusion`、`DiscoverPaths`、`MetadataFetch`；函数 `concludeAnswer`、`concludeProbe`、`discoverWith`、`interpretAnswer`、`callAnswerOf`、`listingPageOf`、`taskReportOf`、`taskAnswerOf`、`readerOf`、`retryVersionOf`、`requestClassOf`、`legacyInitializeParamsOf`、`legacyIdentityOf`、`discoverAuthorization`、`peerRequestAnswerOf`、`requestTextOf`、`notificationTextOf`、`responseTextOf`。`wire.ts` 新增导出 `readPeerMessage`、`PeerMessage`、`ErrorClass`、`supportedOf`；`WireClassification` 的 `answer` 加可选 `message`。
  - 成员：`Line.enterSse` 改为 `Line.openGet(headers, signal): Promise<GetOpened>`；新增 `Scheduler`、`SessionOptions.schedule`；`versions: ProtocolVersions`；删 `message.ts`，新增 `body.ts`；会话对外副作用只经线路端口、凭据句柄、`SessionOptions.fetchMetadata` 与计时端口。
  - 写者交回全文在派发者处；需要时读 `tmp/closures/w3-mcp-host/fix1/` 的日志与 `structure-grep.txt`。

## 返回与恢复
每个提交号；每条验收的命令与结果；「评审项 → 改动位置」表；契约 SPEC 改动表；自定裁定与理由；发现（文档与代码不一致处）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host/docs/`。

## 已知会受影响的现有用例
- 无（不改用例）。

## 停止条件
- 某条裁定要求的说法与代码的行为不一致，而改代码不在本闭包：写进「发现」，继续其余部分。
- 某项改写只能靠改排除范围内的文件实现。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。`caller-outside-scope` 警告来自 `answer`、`message`、`schedule` 与同名标识符的匹配，以及决策层导出名在两个 MCP 成员里的调用处；本闭包只改文档。派发前等派发者在本工作树的门禁复跑结束。
- 2026-11-05 派发者在基线 `9893bebea` 上复跑门禁：`typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:design` 与三包测试（契约 630、mcp 254、host-local 327）退出 0，CRLF 0；`check:docs` 退出 1，两处断链指向代码修复轮删掉的 `message.ts`：`packages/mcp/mcp-host-local/docs/public-api.md` 的 `../src/message.ts` 与 `packages/mcp/mcp-host-local/src/index.md` 的 `message.ts`。两处都在本闭包写范围里，按新模块（`body.ts`，以及 `message.ts` 原来的职责去了契约 `decisions.ts` 的 `requestTextOf` 等）改；验收第 1 条的 `check:docs` 退出 0 包含这两处。日志 `tmp/closures/w3-mcp-host/gates-fix1/`。
- 2026-11-05 约 14:40 宿主 429 限流（5 小时额度到顶），写者中断；15:05 额度恢复后续用原写者接着做（保留工作树改动，P18）。派发者读的工作树事实写在续派消息里；对 `w3-mcp-call-model` 与 `w3-mcp-host-formal` 加了「每完成一个能过 typecheck 的阶段就提交」。
