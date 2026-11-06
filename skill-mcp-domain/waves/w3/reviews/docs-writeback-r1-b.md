# W3 文档写回评审 r1：B 面（文档表达）

判法：`review-docs`（落盘遗漏、工作日志式表达、断链、下层违背上层、图）。中文按 `asd-ste100` 的语言无关规则，英文 README 按 STE-flavored。只读评审，没有改仓库文件。不判条目是否齐（E 面）。

阻断只认三类：与上层（契约 SPEC、成员 SPEC、领域页、`docs/member-documentation.md`）相反或更宽的陈述；写回后同页或同组其他页留下的矛盾旧句；断链（含语义指错）。其余写非阻断。

## 对象 1：PR #1151（Skill），`.worktrees/w3-docs-skill`，`3289bee2f..HEAD`

看过的路径：`docs/domains/skills/{README,architecture,key-flows}.md`；`packages/skills/README.md`；`packages/skills/docs/{architecture,key-flows}.md`；`packages/skills/skill-contract/SPEC.md`；`packages/skills/skill/SPEC.md`、`skill/README_ZH.md`、`skill/verification/README.md`；`packages/skills/skill-host-local/SPEC.md`。

断链：`pnpm run check:docs` 通过（`PASS: 2751 Markdown files; local links and skill mirrors.`）。语义指向另见下表。没有改设计区，没有跑 `check:design`。

持久化形态：不适用。本次没有改任何持久化形态。

### 阻断

| 编号 | 文件:行 | 问题 | 依据 | 建议改法 |
| --- | --- | --- | --- | --- |
| SK-B1 | `docs/domains/skills/architecture.md:31`（`SkillReadCheck` 一行） | 旧句「摘要与检索对每个身份也先问它」留在领域页。写回之后组页说目录先过滤、匹配，只核验留下的身份。旧句与新规则相反：请求之外、不匹配的身份不问读取判定。 | 契约 `skill-contract/SPEC.md:394`「过滤先于核验：不在请求里的身份不核验」，`:395`「匹配先于核验：不匹配的身份不核验」；组页 `packages/skills/docs/architecture.md:309`「再只对留下的身份经 `SkillReadCheck.check` 核验」 | 改为「摘要与检索先按请求过滤或按查询匹配，只对留下的身份问它」 |
| SK-B2 | `docs/domains/skills/architecture.md:58`（剩余义务 KL-9 的「未兑现时的结果」） | 旧句「会话路径上，Skill 的描述不带Skill 材料依据，读取、列出与导出返回不支持」。写回之后，带依据的 `describe` 交出依据所指的材料，`export` 总带依据，不答 `unsupported`。同一页 `:43` 已改成新规则，`:58` 没有改。 | 契约 `skill-contract/SPEC.md:349`「`unsupported` … 不带依据的 `read` 与 `list` … 带依据时（`export` 总带依据）不答 `unsupported`」；同页 `:43`「带依据时，描述交出依据所指的材料」 | 改为「会话路径上，不带依据的描述不带Skill 材料依据，不带依据的读取与列出返回不支持；带依据的操作照常」 |
| SK-B3 | `packages/skills/docs/architecture.md:316`（检查与发现的决定表第 2 行） | 旧句「检查途中字节不符为 `version-changed`」。写回之后，快照阶段的 `bytes-mismatch` 是 `source-unavailable`，只有读控制文件时的不符是 `version-changed`。同页 `:306`、`:421`、`:481` 已改，这一行没有改。 | 契约 `skill-contract/SPEC.md:532`「`snapshot` 答 `entry-not-found` 或 `bytes-mismatch` 时，检查答 `source-unavailable` … `open` 答 `bytes-mismatch` 时检查答 `version-changed`」 | 改为「读控制文件时字节不符为 `version-changed`，快照阶段的 `bytes-mismatch` 为 `source-unavailable`」 |
| SK-B4 | `docs/domains/skills/key-flows.md:9`（F-SK01） | 同 SK-B3 的旧句「检查途中字节不符报版本已变」。这一段在本 PR 里改过（name 一句），这半句没有改。它把快照阶段的字节不符也说成版本已变。 | 同 SK-B3；组页 `packages/skills/docs/architecture.md:481`「读控制文件时字节不符报 `version-changed`」 | 改为「读控制文件时字节不符报版本已变」 |
| SK-B5 | `packages/skills/docs/architecture.md:82`（`SkillManifest`）与 `:327`（`SKILL.md` 文本） | 「`metadata` 不是文本映射时只保留文本值」比契约宽。契约分两种：是映射但有非文本值时只保留文本值；不是映射时不保留。组页一句话把「不是映射」也写成保留文本值（例如 `metadata: "x"` 读作保留 `"x"`）。 | 契约 `skill-contract/SPEC.md:247`「是映射但有不是文本的值时，只保留文本值；不是映射时不保留。这两种都带兼容提示 `metadata-not-text-map`」 | 两处改为「`metadata` 是映射但有非文本值时只保留文本值，不是映射时不保留，两种都带兼容提示」 |

### 非阻断

| 编号 | 文件:行 | 问题 | 依据 | 建议改法 |
| --- | --- | --- | --- | --- |
| SK-N1 | `packages/skills/docs/architecture.md:3` | 「三个服务只对内存替身与 … 符合性套件验证过」与同页 `:486`、`packages/skills/README.md:76` 新写的 TLA+ 模型与探索器结果并列时，「只」容易读成没有别的证据。探索器也跑在替身上，所以不算矛盾。 | 同页 `:486` | 加一句「另有有限范围的模型与探索器结果，见性质账本」 |
| SK-N2 | `packages/skills/README.md:3`；`docs/domains/skills/architecture.md:3`；`packages/skills/docs/architecture.md:3`、`:581` | 状态句用波次标签，彼此不一致：README 说「在第二波有了实现 …：包检查、摘要与检索 …」，`SkillCatalog` 却在 W3 交付（提交 `9bcd74c14`「W3 createSkillCatalog」）；组页 `:581` 说「在第一波之后」，同页 `:3` 说「第二波」。波次是过程标签，组页自己定义的波次只有「第一波、第一波之后、Cordis 服务键波」。 | 组页 `:581`「波次只有三种」 | 状态句去掉「第二波」，或统一用组页定义的三种波次 |
| SK-N3 | `packages/skills/skill-contract/SPEC.md:12`、`:61` | 过程叙述进了规格：「评审之后的裁定已写回组页」「组页已写成现行版本」。读者要的是现行关系，不是写回过程。 | `asd-ste100` 不写过程；`review-docs`「工作日志式表达」 | `:12` 末句改为「组页没有写的条款见…」；`:61` 改为「下列条款组页没有写，也不与组页冲突。本页是它们的唯一源」 |
| SK-N4 | `packages/skills/docs/architecture.md:323` | 兼容策略的依据写成「生态兼容的裁定（2026-11-04）」，是过程标签，没有链接。同页其他依据都指向产品、架构或成员规格。 | 记忆规则「条款编号必须带文档链接」；同页依据列的写法 | 依据改指成员规格[兼容提示](../skill-contract/SPEC.md#compatibility-hints)（它已写明理由），去掉裁定日期 |
| SK-N5 | `packages/skills/docs/architecture.md:486` | 「共同前提是 … P0，以及两个判定端口对无权主体守 PC3 与 PR5」。性质账本里 PC3、PR5 只是 S1 的前提，不是共同前提。PC3、PR5 是契约的用例编号，P0 是账本的标签，组页没有给链接。 | `skill/verification/README.md` 第 32 行「共同的前提 P0」、第 37 行（S1）「两个判定端口对 `p` 守 PC3、PR5」 | 改为「共同前提是每次端口调用都会结束；无披露（S1）另要求两个判定端口对无权主体的答复不随身份是否存在而变」，编号带链接或去掉 |
| SK-N6 | `packages/skills/docs/architecture.md:484` | 「`export` 的逐条核对 … 随导出一同验证。`SkillCatalog` 的读取权过滤 … 随摘要与检索一同验证」是计划口吻，两者都已交付。括号里「`unknown` 时整次 `unknown`」少了「留下的身份」限定，与 `:423` 不一致。 | 同页 `:423`；契约 `:383` | 改成现状句，补「留下的身份中任一个」 |
| SK-N7 | `packages/skills/docs/architecture.md:66`、`:451`（SK-D07） | 「`SkillAccess` 的符合性套件随 `@omne-harness/skill` 的实现，以可加改动加入」是计划口吻；`skillCatalogConformance` 也已加入，两处都没写。同页 `:3` 已写「`SkillAccess`、`SkillCatalog` 的符合性套件」。 | 契约 `skill-contract/SPEC.md:32`（`./testing` 入口） | 改为「`./testing` 另有 `SkillAccess` 与 `SkillCatalog` 的符合性套件」 |
| SK-N8 | `packages/skills/skill-contract/SPEC.md:11`；`packages/skills/skill/SPEC.md:12`；`packages/skills/skill-host-local/SPEC.md:11` | 三份成员 SPEC 把组设计钉在 `773d9f04c`，但 `1eab83b81` 之后又改了组页（删剩余义务两行）。钉的不是本 PR 最终的组页。删的两行不在三份 SPEC 采用的范围里，所以不影响条款。 | 提交 `1eab83b81` 只改 `packages/skills/docs/architecture.md` | 钉到最终改组页的提交，或在提交说明里写明钉点之后的改动不在采用范围 |
| SK-N9 | `packages/skills/skill-contract/SPEC.md:41–53` | 「本页封闭的组页未定项」仍用 `21175c9f9` 的组页行号。现在说明了版本，可读，但组页行号随写回失效。 | — | 改用组页的章节锚点 |
| SK-N10 | `packages/skills/docs/key-flows.md:149` | 读取图在「按请求的字节范围截取」之后直接交出内容。组页第 11 步的新规则（所钉材料的 `SKILL.md` 没有合法头部定界时，正文答 `source-unavailable`）在图下文字里也没有。不矛盾，属于同源页没跟上。 | 组页 `architecture.md` 读取第 11 步；契约 `:339` | 图下段落补一句，或标「图中省略」 |
| SK-N11 | `docs/domains/skills/architecture.md:42`（`SkillCatalog` 一行） | 「读取权无法判定时返回 `unknown`」没有「留下的身份」限定，比契约宽一点。领域页粒度可以接受。 | 契约 `:383` | 可改为「留下的身份中任一个读取权无法判定时返回 `unknown`」 |
| SK-N12 | `packages/skills/docs/key-flows.md` 组内导出图（`S-->>A: … 来源失败（来源在引用的定位处没有包时 basis-unavailable）`） | 把映射之后的服务答复写进了来源的答复箭头。来源答的是 `package-not-found`，服务按映射表转成 `basis-unavailable`。 | 组页「端口」映射表 | 箭头写来源的答复，映射写在图下文字 |

### 下层与上层

除 SK-B1～SK-B5 外，没有发现其他矛盾。本 PR 退出了契约的「与组页的差异」表（改名为「组页没有写的条款」），剩下三行在组页确实没有写，也不冲突。全仓搜「与组页的差异」没有残留引用。

### 图

不需要补图。组内检查、目录与读取三张图已随规则更新。可选：`SkillCatalog` 的「空 `capabilities` → 合法集合 → 过滤／匹配 → 核验」次序已经在图里，不需要另画。

## 对象 2：PR #1152（MCP），`.worktrees/w3-docs-mcp`，`3289bee2f..HEAD`

看过的路径：`docs/domains/mcp/{README,architecture,key-flows}.md`；`packages/mcp/README.md`；`packages/mcp/docs/{architecture,key-flows}.md`；`packages/mcp/mcp-contract/SPEC.md`；`packages/mcp/mcp/{SPEC,README,README_ZH}.md`、`mcp/docs/architecture.md`；`packages/mcp/mcp-host-local/{SPEC,package.json}`；`docs/architecture/technical-foundations.md`。

断链：`pnpm run check:docs` 通过（`PASS: 2751 Markdown files; local links and skill mirrors.`）。语义指错见 MC-B3。

持久化形态：不适用。内存清单存储的形态没有改。

### 阻断

| 编号 | 文件:行 | 问题 | 依据 | 建议改法 |
| --- | --- | --- | --- | --- |
| MC-B1 | `packages/mcp/docs/architecture.md:19`、`:83`；`packages/mcp/README.md:20` | 「协议层优先复用官方 SDK，只在复用会违反三条硬承诺时自写」比成员 SPEC 窄。成员 SPEC 不复用 SDK 有三类理由，其中「规则归契约」有七行（`serializeMessage`、`_excludeInvalidXMcpHeaderTools`、`mcpNameSource`、`extractWWWAuthenticateParams`、`_meta` 常量、`parseJSONRPCMessage` 等），不是硬承诺。按组页现文，这些自写就违反组页。 | `mcp-host-local/SPEC.md:123–126`「下表每一处「不复用」标出三类理由之一：硬承诺 … 规则归契约 … 无协议行为」 | 改为「协议层优先复用官方 SDK。复用会违反三条硬承诺，或契约根已有同一规则时不复用，逐块决定见 mcp-host-local 的 SPEC」 |
| MC-B2 | `packages/mcp/README.md:51`；`packages/mcp/docs/architecture.md:692` | 旧句「夹具覆盖现代对端与旧对端、断流、清单变化通知、需要输入与任务」。写回之后同页 `:317`、`:412` 写「本组不订阅清单变化通知」。成员的测试与 SPEC 都没有清单变化通知的夹具（`list_changed` 只在契约 C2 出现）。旧句与现状相反。 | 契约 `mcp-contract/SPEC.md:236`（C2）「本组不订阅（T3），所以 `changedNotified` 保持为假」；T3「不发 `subscriptions/listen`」；组页 `:317` | 两处删「清单变化通知」，或改为「旧对端主动发来的清单变化通知不改变采用」并补对应用例 |
| MC-B3 | `packages/mcp/mcp/README.md:70`；`packages/mcp/mcp/README_ZH.md:70` | 「rules … are in [SPEC.md](SPEC.md#所有权失败与生命周期), clauses MC-10 and MC-14」：链接指向「所有权、失败与生命周期」一节（`SPEC.md:166`），但 MC-10（`:76`）与 MC-14（`:92`）在「结果与不变量」一节。读者按链接找不到这两条。 | `mcp/SPEC.md:23`「## 结果与不变量」、`:76`、`:92`、`:166` | 链接改到 `SPEC.md#结果与不变量` 并写「MC-10、MC-14，以及「所有权、失败与生命周期」一节」，或给 MC-10、MC-14 加锚点后分别链接 |

### 非阻断

| 编号 | 文件:行 | 问题 | 依据 | 建议改法 |
| --- | --- | --- | --- | --- |
| MC-N1 | `packages/mcp/docs/architecture.md:194`（不变式 5）；`packages/mcp/docs/key-flows.md:19` | 新句用 `attempt()` 定时限起点。`attempt()` 是成员聚合的方法（`mcp/SPEC.md` MC-6）。组页自己的 `Connection` 只列操作 `open()`、`markLost()`、`close()`（`architecture.md:180`），组页出现了成员内部的方法名。 | 简报「组页不应出现成员内部函数或模块名」；`docs/member-documentation.md:15`「能力组不得重写成员错误集合或状态机」 | 改为「建连时限从这次建连开始（连接进入 `preparing`）起计时」，精确起点链接 MC-5 |
| MC-N2 | `packages/mcp/README.md:20`、`:29`（mermaid 节点）；`packages/mcp/docs/architecture.md:72`、`:623`、`:693` | 过程叙述：「W3 实际采用 2.4.0」「RFC 的同步归后续小卡」。波次与「后续小卡」是工作日志，没有拥有者与链接。 | `asd-ste100`；`review-docs`「工作日志式表达」 | 改为「仓库采用 2.4.0，与 RFC-0001 该行不同；RFC 的同步归 [RFC-0001 拥有者]」，带卡或文档链接 |
| MC-N3 | `packages/mcp/docs/architecture.md:72`、`:83`、`:623` 对 `docs/architecture/technical-foundations.md:34` | 下层与上层：已接受的技术基础写「官方 client 与 server 各 2.3.1 … 客户端显式 pin 该协议」；组页写实际 2.4.0，且「现行实现的产品源码不导入」SDK（`mcp-host-local/package.json` 中 `@modelcontextprotocol/*` 都在 `devDependencies`）。组页如实写了版本偏离，但「产品源码不导入 SDK」没有登记为对技术基础的偏离；`:623` 仍把 RFC-0001 列为「协议层优先复用 … 对旧 HTTP+SSE 回退一次」的依据层，RFC 没有这两点。mcp-host-local 的 SPEC 有协议偏离与契约偏离两张表，没有技术基础偏离。 | `technical-foundations.md:34`；`mcp-host-local/SPEC.md:151`「本包的产品源码不导入任何 `@modelcontextprotocol/*` 包」 | 在组页登记一条对技术基础的偏离（版本与不导入两点，带拥有者与退出条件），`:623` 的依据层分开写：RFC-0001 只支撑协议线；复用策略依据 mcp-host-local 的 SPEC |
| MC-N4 | `packages/mcp/docs/architecture.md:87` | 旧 HTTP+SSE 回退的依据层仍写「官方规格 Key Changes「Deprecated」第 2 项」。这一项原来是「不支持 HTTP+SSE」的依据；现在支撑的是回退。回退的真正依据是契约的裁定。 | 契约 `mcp-contract/SPEC.md:108`（真实传输裁定第 6 条） | 依据层只留契约 T3 与裁定；Deprecated 一项改写成「该传输已被官方弃用，所以只回退一次、不另建传输」之类的说明 |
| MC-N5 | `packages/mcp/docs/architecture.md:350`（`McpTransport` 一行） | 「官方 SDK 只在传输实现一侧使用」：产品源码不使用 SDK，只在 mcp-host-local 的测试里作对照与对端。「使用」读成产品使用。 | `mcp-host-local/SPEC.md:151` | 改为「通用实现不认识官方 SDK；SDK 只在传输成员的测试里作对照与对端」 |
| MC-N6 | `packages/mcp/mcp-host-local/SPEC.md:10` | 依据表把钉点改到 `26ab418a7`，范围一栏仍写「官方 SDK 只出现在本成员」。这正是组页在 `26ab418a7` 替换掉的说法。 | 组页 `architecture.md:19`、`:83` 新文 | 范围改为「两个 `McpTransport` 实现；与 SDK 的复用策略；协议基线与兼容」 |
| MC-N7 | `packages/mcp/docs/architecture.md:52`（对外接口「符合性设施」） | 仍写「五个需求端口的符合性套件、本地真实服务端夹具」。组入口 `README.md` 已改成六个套件（另有传输套件），夹具在 mcp-host-local。 | `packages/mcp/README.md` mcp-contract 一行；契约 `mcp-contract/SPEC.md` 裁定第 17 条 | 补传输套件 `mcpTransportConformance`，夹具写明在 mcp-host-local |
| MC-N8 | `docs/domains/mcp/architecture.md:48`（`ActionInvoker` 一行） | 「接入点未采用时答 `not-available-to-you`」没有写例外：`closeAll` 之后调用答「未发出」（`connection-unavailable`），先于采用核对；调用方 `signal` 在占位后已中止时答「未发出」（`cancelled`）；任务操作复用连接时不核采用。领域页是总则，读作「一般情形」可以接受。 | 契约 S8、R2、S2；组页 `architecture.md:497–498` | 句末加「关停与中止的情形见组页」 |
| MC-N9 | `docs/domains/mcp/key-flows.md:7` | 「`continueWithInput` 另带 `requestState`、输入答复与发出代际」：两项现在各自可选、至少一项。领域页写成两项都带，比契约窄，不更宽。 | 契约 S2「`requestState` 与 `inputResponses` 各自可选」；组页 `architecture.md` 调用口表「两项至少有一项」 | 改为「另带 `requestState` 或输入答复（至少一项）与发出代际」 |
| MC-N10 | `packages/mcp/mcp-contract/SPEC.md:158–177`（「与组页的差异」）对 `:11` 的钉点 | 依据表把组页钉到 `26ab418a7`，差异表仍按旧组页行号列「组页的写法」，标题说「组页随后写回」。逐行核对组页现文，旧写法都已不在，所以这张表只剩历史。 | — | 照 Skill PR 的做法：已写回的行退出，表改为「组页没有写的条款」或整节删除 |
| MC-N11 | `packages/mcp/README.md:20`（mcp-host-local 的允许依赖） | 不属于 B 面，给拥有者核对：允许依赖列 mcp、mcp-contract、mcp-cordis-contract、官方 client；`package.json` 的 `dependencies` 实际是 json-text、mcp-contract、operation-result、eventsource-parser，`mcp` 与 SDK 在 `devDependencies`。 | `mcp-host-local/package.json:27–44` | 交组拥有者对齐允许依赖与实际依赖 |

### 下层与上层

除 MC-B1 与 MC-N3 外，没有发现其他矛盾。逐项核对过的新句：协议基线第 4、6 项对 T3（能力声明、旧修订空对象）与裁定第 6 条；不变式 5 与 key-flows 的时限对 MC-5 与 `mcp/SPEC.md:177`；`refresh` 的 `signal` 对 S5 与裁定第 1、31 条（`mcp/SPEC.md` 的偏离表已不再列它）；`closeAll` 之后的次序对 S8 与裁定第 30 条；任务操作的建连规则对 S2；取消的传输分写对 T5；`ConnectionTarget` 的反斜杠对 V3；`continueWithInput` 的「如有」对 S2 与 R2。

### 图

不需要补图。组页 `architecture.md:493–508` 的「资格与换代」现在有关停、中止、采用、资格四层先后。可选：画一张出口次序的小判定图（已发布 → 中止 → 关停 → 关口答复），放在「资格与换代」开头，说明 `refresh` 与调用口共用同一出口次序。
