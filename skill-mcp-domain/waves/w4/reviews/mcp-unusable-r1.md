# w4-mcp-unusable 关口评审（C-SM-08，一次）

候选：PR #1159，head `559be1514`，基线 F `60acfc28b`。简报：`mcp-unusable-r1-briefs.md`。证据评论：#1119 评论 6688727559。

派发：15:39 派 A（implementation-reviewer）、B（design-reviewer expression，xhigh）、C（general-purpose）、E（general-purpose），均 Opus 5.5。D 由派发者在最终 head 上跑：A 面的 `wide` 计时结束、修复轮（如有）之后，避免争用 CPU。

## E 交付边界（general-purpose，Opus 5.5 high；交回 15:50:47，原文 `mcp-unusable-r1-E.md`）

结论：产品事实基本成立；未达到的多数是卡上缺证据。实质缺口两处：还原后「同一命令」那次运行退出 1，现由裁定代替；`lost.spec` 第 3 条的四个用例（`error-answer`、`answer-malformed`、`result`、`error`）没有任何记录在案的变红改动。评论引用的哈希逐个与原件一致。

- 达到：M4-5、七项轻门禁、契约用例（守护）、产品验收 1、守护验收 1、2、5。
- 未达到（卡上缺证据）：M4-1 与产品验收 3（偏离一节删空的两条输出）；M4-2 与产品验收 2（两个 grep 的输出与调用点清单）；产品验收 4（逐条用例对应变红改动的表）、5（用例名单）、6（输出尾部）、7（写范围读数）；守护验收 4（T8 逐行与 T1 两句的核对表）、6（写范围读数）。
- 未达到（按原文）：M4-3 与守护验收 3（还原后同一命令退出 1，`79cdbe00dc2e`）。
- 冲突项 6 条：产品追加 1 第 1、2、3、6 项；派发者 15:36 裁定 1、2。另：W4 规格 Testing Decisions「建连各有用例：带标记转 `lost`」与第 1 节第 4 条末段「建连不在此列」自相矛盾。
- 范围外：PR 正文「两种真实传输 410 条」写错（真实传输上的符合性用例是 198 条）；守护已定第 2 条要求「未覆盖」写明没选的错标写法，卡上没有。

## 派发者裁定（15:52，E 面）

- **卡上缺证据的各条：** 由派发者在 head 上自己重跑 M4-1、M4-2 的命令与写范围读数，连同守护写者交回里的 T8 逐行核对表、用例名单、变红对应表，贴进关口结果评论。不派写者。
- **还原后同一命令（M4-3、守护验收 3、冲突项 5）：** 撤回「以组运行代替」作为最终证据，只作中间读数。head `559be1514` 与 `06773cbcb` 的源码字节相同（之后的提交只改 `.md`），所以在 head 上于空闲时原样重跑 `pnpm turbo run build --filter=@omne-harness/mcp --force` 与 `pnpm turbo run test --filter=@omne-harness/mcp --force`，就是「还原后重建、同一命令」。等 A 面的计时结束、CPU 空出后由派发者跑，退出码与哈希贴卡。
- **`lost.spec` 第 3 条的四个用例：** D 面对 `internal/lost.ts` 的差分变异给出读数。这四个分支的变异体没有被杀时，按 `review-code` 先判能否改用例让它可判定，作为修复项。
- **冲突项 1–4（产品追加 1 第 1、2、3、6 项）：** 是派发时卡拥有者的裁定，成立。冲突项 1 的独立性由守护验收 4 的逐行核对表承担，所以这张表必须上卡（见第一条）。
- **冲突项 6（派发者 `559be1514`）：** 守护写者自己的写范围读数按 `78d850505..11b5d4ff5`（9 个文件，都在范围内）。`559be1514` 是派发者的提交，不属守护写者的写范围。
- **W4 规格自相矛盾：** 派发者已更正 spec 第 1 节第 4 条、失败语义表「正常」一行、Testing Decisions 一句与 plan 切片 01 的用例条（15:51），依据是产品追加 1 第 2 项。
- **PR 正文：** 已改为 198 条。卡上的「未覆盖」在关口结果评论里补写没选的错标写法与理由。

## B 表达（design-reviewer expression，Opus 5.5 xhigh；交回 15:55:27，原文 `mcp-unusable-r1-B.md`）

结论：无阻断，非阻断 10，范围外待裁决 1。核心规则（T1 的标记、S5、S7、`lostOf` 三条规则）自身一致。问题集中在：建连期间的 `lost` 原因；`close()`、停止信号与标记的关系；没有跟着改的旧说法。

- B-1 S7 的 `stream-broken` 按标记定义，没写只约束已建成的连接；MC-5 建连表对 HTTP `discover` 的不带标记 `no-answer` 给 `stream-broken`，对 stdio 建连中的 X02 给 `preparation-failed`，两向都与 S7 字面不合。
- B-2 传输已不可用之后，停止答复（`abandoned`）经 `handedOver` 带标记；S7「其余答复不转：…`abandoned`」没写以不带标记为前提；MC-16 第 9 步的理由「T5 的答复不带标记」在传输已死时不成立；T1 的单调句没写管哪些答复种类、`close()` 与断开同时成立时谁优先。
- B-3 S5 末条用了成员内部的词（`ensure`、`pending`），而 S5 首句已把建连失败交给实现。
- B-4「就绪连接」没有定义（`degraded` 照常复用）。
- B-5 三处旧说法：`mcp/src/index.md:26`、`mcp/docs/flows.md:101`、`mcp/README_ZH.md:82`。
- B-6 依据与变更记录：依据表缺第 32 条与 W4；`:88` 只列三条款；第 32 条没记 `streamGoneAnswerOf` 参数收窄（不可加改动）；成员 SPEC 钉的契约修订 `f34077cec` 过时；`public-api.md:37` 的 `UnusableCause` 指向 R1–R6，失败码索引没有它。
- B-7 MC-16 第 9 步把全函数完整写了第二遍。
- B-8 `mcp/verification/README.md`：`:43` 仍写已删的 `loseUnlessStopReply`；`:298` 宣称就绪连接上 `discover` 的覆盖；`:166`、`:161`、`:167`、`:190`、`:307` 的范围与读数没算本闭包；`:136` 与 `:250` 的 `wide` 耗时没对上。
- B-9 契约「组合与验证」没写标记核对的范围与两个违约实现；U6–U11、U13、U14 只在任务 tmp。
- B-10 措辞：S8「本包自己的错误」；T1 把私有 `settle` 列为写入方；T1 与 T6 对 `finished` 的说法。
- 范围外：建连失败的答复归契约还是归实现。

## 派发者裁定（15:56，B 面）

- **范围外一项：已由 W4 MCP 规格第 1 节第 4 条末段与第 5 条定下，不再上报。** 建连中的失败归实现的建连规则（成员 MC-5），契约 S5 首句把它交出去。契约保留 `lost` 原因的封闭集合，哪个原因用于建连由实现定。修复按这条贯彻。
- **B-1：** S7 写明各 `lost` 原因中按标记给出的定义（`stream-broken`、`session-ended`）只约束已建成的连接；建连中的原因按实现的建连规则（S5），与已有的 `discover-failed` 口子同写法。MC-5 不改。
- **B-2：** 传输已不可用之后的停止答复带标记、连接转 `lost` 是对的（传输已死）。改正文不改行为：T1 写明单调规则管失败答复（`not-sent`、`no-answer`，含 `abandoned`），有应答的结局带不了这个字段；本端 `close()` 之后不带，`close()` 与断开都成立时 `close()` 优先（同 host-local 现行）。S7「其余答复」写成「不带 `unusable` 的答复」再举例。MC-16 第 9、12 步的理由按 T1 改写。
- **B-3：** 契约 S5 末条删去：建连的时限与清单标记的情形归实现，成员 MC-7 已写（`connect` 阶段 `pending` 答这次连接失败本身）。W4 规格第 6 条的这一半随之更正。
- **B-4：** S7 定义一次「就绪连接」：状态是 `ready` 或 `degraded` 的连接，与建连中相对。
- **B-5、B-6、B-7、B-8、B-10：** 采纳，修复轮改。B-6(c) 把 `streamGoneAnswerOf` 的收窄记进第 32 条，写明这是 0.x 内不可加的公开签名改动、组内没有别的调用方。B-6(d) 成员 SPEC 依据表改为「与本页同一提交的契约 SPEC」。
- **B-9：** 契约「组合与验证」与「未覆盖」写明标记核对的范围（每格本请求与之后一个请求；不核其他在途请求、`close()` 例外、断开后的停止答复）与两个违约实现。U6–U11、U13、U14 的长期记录放在关口结果评论（卡上），`mcp/verification/README.md` 指向它，不在 tmp。
- 修复轮等 A、C 面交回后一起写规格。

## C 设计与实践（general-purpose，Opus 5.5 high；交回 16:00:00，原文 `mcp-unusable-r1-C.md`）

结论：无阻断，非阻断 4。可选字段的决定成立，理由与代价要重写（F1，含存活的 C3：`legacyPath` 的 `handedOver(entered)` 漏掉时没有用例变红）；`resultOf` 不问 `lostOf`，与 T1 新加的「`finished` 经 `no-answer` 带标记」半句矛盾（F2）；「先问 `lostOf` 再交作用域」写了两遍（F3）；`not-sent`（`session-ended`）的字段类型放进了错误的原因（F4）。

## 派发者裁定（16:05，取代 15:56 的 B-1 裁定；起因：负责人 15:59 要求结构化、第一性原理分析，实然向应然靠）

分析写在 `mcp-unusable-r1-analysis.md`，按六条轴归类 B、C、E 三面的发现。要点：

- **15:56 对 B-1 的裁定撤回。** 那条裁定在 S7 加一句「按标记的定义只约束已建成的连接」，会让 `stream-broken` 一词有两种含义，也保留了 `build.ts` 按原因猜的 `lostOfNoAnswer`。改为：`lost` 原因在两个阶段由同一个 `lostOf` 给出（带标记取标记，`authorization-required` 取它自己），建连失败再按后备规则（`error-answer`、`answer-malformed` 取 `discover-failed`，其余取 `preparation-failed`）。删 `lostOfNoAnswer`。可观察的变化只有两格（HTTP 建连中 `discover` 答不带标记的 `no-answer`；stdio 建连中遇 X02）。W4 规格第 1 节第 4 条末段随之更正。
- **其余 15:56 的 B 面裁定不变**（范围外一项、B-2 到 B-10），并按分析第 2 节的应然细化：T1 把标记定义为一条事实（传输已不可用，且不是本端 `close()` 所致），管每一种失败答复，`close()` 优先。
- **C-F1：** 决定保留，W4 规格 ub-mode 表这一行改写理由与代价（派发者做）；C3 的路径补 host-local 用例（修复轮）。
- **C-F2：** 删 T1 关于 `finished` 的半句（T6 是形状的拥有者），守护写者的 `remarkTaskAnswer` 同步不再给 `finished` 加标记；`resultOf` 不加防御判断。`finished.answer` 收窄为 `result | error` 是对写方不可加的改动，登记为 0.1.0 形状项，不在本闭包提前。
- **C-F3：** 加 `loseIfLost`，`calls.ts` 与 `tasks.ts` 都用它。
- **C-F4：** 收窄为 `unusable?: 'session-ended'`。
- 修复轮等 A 面交回后写规格；写范围含 `mcp/src/internal/build.ts`、相关用例与成员 SPEC 的 MC-5。

## A 正确性（implementation-reviewer，Opus 5.5 high；交回 16:20:40，原文 `mcp-unusable-r1-A.md`）

结论：无阻断，非阻断 4，范围外 2。`lostOf` 三条规则、四个调用点、标记只由决策层写入、`UnusableCause` 去掉 `abandoned`、写者自定两件，都核对成立。

- 探索器规模：`explore(WIDE)` 在 F 与 head 上状态数都是 55392、重放 177108、深度 26，node 直跑 176.8 s 与 160.3 s。本闭包没有让状态数增加。README 第 136 行的 60950／194223／158.1 s 出自 `0418cd72b`，在 F 之前就过时。vitest 里约 360 s，是 node 直跑的约 2 倍，原因未查。
- 度量：改动函数超 alert 2（`unusableAnswerOf` CC 11、CRAP 12.9；`checkOperation` CC 13），超 warn 4。没覆盖到的行只有穷尽 `switch` 的 `never` 分支。`metrics` 的覆盖采集里 `wide` 在 600 s 超时（插桩加负载约 5）。
- A-1 脚本化传输的「`close()` 之后不带标记」没有用例守护：去掉 `closed` 判断的两个变异，契约 676 条全过。
- A-2 超线红项交付说明没有交代。
- A-3 `resultOf` 不问 `lostOf`（同 C-F2）。
- A-4 README 第 136 行读数过期。
- 范围外 1：第二次断开时答复带的原因不唯一。T1「每个答复都带它记下的原因」与 T8 前言「`lineGoneAnswerOf` 结算的请求，值是该行的原因」给出不同答案；实现按 T8（写者自定第 3 件，派发者没裁过）。
- 范围外 2：`wide` 离时限的余量。

## 派发者裁定（16:21，A 面；按 `mcp-unusable-r1-analysis.md` 的轴归类）

- **A-1（轴 A）：** 符合性套件加一条：传输进入不再可用之后调用 `close()`，在途请求与之后请求的答复都不带 `unusable`，两种传输都跑。它守的正是 T1 新定义里的「`close()` 优先」。
- **范围外 1（轴 A）：标记是传输状态的投影，取第一次记下的原因。** 一个传输只死一次。标记说明的是「传输已不可用及其原因」，这个原因是传输状态 `dead` 的值（`dead ??= cause`），不是某次线路事件的值。请求自己失败的原因（`cause`）是另一条轴，照旧取该行的原因（DP-01，独立事实分别报告）。改法：两个传输的 `handedOver` 在传输已死、未关闭时，答复的标记一律取 `dead`，不保留线路给的值；T8 前言那句改为「值是传输记下的原因」。写者自定第 3 件（保留已有标记）撤回。对 `mcp` 没有可观察的影响。
- **A-2：** 修复后由写者重读度量，逐条交代：没覆盖到的只有 `never` 分支时，写明「圈复杂度来自穷尽 `switch` 的分支数」；否则给处置。
- **A-3：** 同 C-F2 的裁定，删 T1 关于 `finished` 的半句。
- **A-4：** 修复轮按当前读数改写第 136 行（55392／177108／26，写明修订与运行方式：vitest 慢层，单线程），另写 node 直跑的读数。
- **范围外 2：** 不是本闭包引入的（状态数不变）。`wide` 在成员 `test` 任务里（脚本不带 `--mode`），离 600 s 时限约 1.7 倍余量，覆盖插桩下会超时。这关系到波末准入，记为波末风险，在准入前单独核：准入是否跑慢层、是否带覆盖插桩。不在本闭包改时限或场景。
- **A 面的观察：** `calls.ts:306-307` 注释的理由按 T1 的新定义改写。
- 四面齐，按分析的轴写修复规格 `delegate/closures/w4-mcp-unusable-fix.md`，派写者（developer，Opus 5.5 high，新开）。

## 修复交回（developer，Opus 5.5 high；交回 17:47，原文 `mcp-unusable-r1-fix-handback.md`）

六个提交 `559be1514..0961b30e9`，按轴拆：轴 C `1e481c56f`、轴 B `49dcba5f0`、轴 A `6510f1a5d`、轴 E `46f1448eb`、契约正文 `eb6dfad90`、成员正文 `0961b30e9`。验收 1–11 都有读数；18 条变红记录在工作树 `tmp/closures/w4-mcp-unusable-fix/mut/`；探索器快层 12 个场景的状态数与改动前逐个相同。

## 派发者核对与裁定（17:53）

- 读 diff：源码各项与已定第 1–6 项、追加 1 一致。`failedOf` 的 `reason` 一列对每种失败与改动前相同；转 `lost` 的组合只剩 `loseIfLost`；`unusableAnswerOf` 是全函数，`session-ended` 一格固定；`remarkTaskAnswer` 已删。
- 写者列的四个清理候选：
  - `lost.ts` 文件头仍写服务直接用 `loseInScope`：本闭包造成的过时，派发者改。
  - `verification/README.md` 生命周期表快层四行仍是旧读数，与「读数的 head」一条矛盾：派发者在 `0961b30e9` 上重测（读数与写者、与 `559be1514` 相同，`gate-r2/states-timed.txt`），改表与两条说明。
  - `decisions.ts` 模块注释点名私有的 `settle`：是拥有它的模块里的代码注释，T1 的规则管的是 SPEC 正文，不改。
  - `transport-conformance.spec.ts` 的 `remarking` 仍改写 `open` 的失败：对 `open` 是空操作，套件不核 `open` 已写进契约「未覆盖」，不是已要求的需要，不改。
- `tasks.ts` `failureOf` 的注释把 `loseIfLost` 写成判断方：改为 `lostOf` 判断、`loseIfLost` 转 `lost`。
- `mcp-host-local/SPEC.md` 第 189 行：在本分支改，不留到合入（切片 02 没碰这一行）。不照抄写者的建议句：它写「每个失败答复」，而 `authorization-required`、`error-answer`、`answer-malformed` 不带标记。改为保留原句结构，只改第 3 项改了的两处（写成记下的原因、不保留已有值；`session-ended` 只带 `session-ended`）。
- `concludeProbe` 的 legacy-http 一格没有用例：不是本闭包改的行，按范围原则不补。
- 以上合为派发者提交 `4209b33a7`。六项门禁在它上面退出 0（`gate-r2/summary.log`）。
- B 面窄复核派出（design-reviewer expression，Opus 5.5 xhigh），含三个成员的系统清查：正文改了约 290 行，同一类问题（成员级说法被改动证伪）在切片 02 已出现两次。

## B 面窄复核（design-reviewer expression，Opus 5.5 xhigh；head `4209b33a7`，原文 `mcp-unusable-r2-B.md`）

结论：无阻断，非阻断 11。上一轮 B-1～B-10 与范围外一项在现行文本上闭合；B-8(c)、B-10(b) 部分闭合。系统清查没有找到「建连按原因给 `stream-broken`」「保留已有标记」「`finished` 带标记」「就绪连接上单个失败转 `lost`」的残留。

- N1 T1 的两句全称句（「字段不出现，表示传输仍可用」「之后交出的每个失败答复都带」）超出同节自己定的范围：S07 之后别的在途请求可由自己的应答结算为 `error-answer`，授权发现中的请求照常以 `authorization-required` 结束，都不带字段。`session-ended` 一格到不了的理由只在 JSDoc。
- N2 S7 两句字面上把 `authorization-required` 也算进「不带标记」。
- N3、N4 `verification/README.md` 第 163 行仍说生命周期读数来自更早的代码、「三个数小于上表」；第 165、168 行的修订范围漏了 W4 的两个闭包。
- N5 公开类型的 JSDoc 与 T1 不一致：`decisions.ts:63–65`（写入方点名私有 `settle`、漏两个函数、无 `close()` 例外）、`transport.ts:26–28`、`outcomes.ts:72–73`、`session.ts:320–322`、`testing-scripted-transport.ts:386–388`。
- N6 成员 SPEC 引用「`lostOf` 的第 3 条」，SPEC 里已没有编号。
- N7 契约 T3 引用 S5 已不写的「`discover` 失败 → `lost`」。
- N8 第 32 条的行为改动漏了建连中的两格。
- N9 `mcp-host-local/SPEC.md:189` 只列三种来源，漏了之后因停止或自己的应答结算的在途请求；T1 没有链接。
- N10 `verification/README.md:45`、`:52` 仍写 `loseInScope`。
- N11 条款号缺链接；`public-api.md:27` 条款列缺 T1；README 第 431 行只链到卡。
- 证据不足：第 32 条列了 S2、R1、R7，正文只讲标记。

## 派发者裁定（18:09，B 面窄复核）

- 派发者核对「证据不足」一条：`git log -S` 显示 R1（「四个任务操作例外，按 S2」）与 R7（`no-connection` 含资格不是 `granted`）由产品写者 `78d850505` 改，依据是产品闭包第 7 条（R1 与 S2 的冲突句按现行实现改为同一句）；S2 没有改。第 32 条改为如实写出 R1、R7 的改动，S2 从改动条款中去掉。
- N1～N11 全部采纳，由派发者在差分变异跑完后一次提交（指到了文件与行，单点修复不派写者）。17:53 对 `decisions.ts` 模块注释「不改」的裁定被 N5 取代：那段注释是 `WireAnswer` 的公开说明，写入方与 `close()` 例外要与 T1 一致。
- N1 的改法：T1 的单调句与「字段不出现」一句限定到带这个字段的答复（`not-sent`（`connection-unavailable`、`session-ended`）与 `no-answer`）；`authorization-required`、`error-answer`、`answer-malformed` 写成类型上没有这个字段；`session-ended` 一格到不了的理由写进 T1。
- 评审转给 A 面的一条：结构分析写「有应答的结局不可能由已死的传输交出」，与 T8 的 S07 不符（S07 之后别的在途请求由自己的应答结算）。这是分析里的一句措辞错误，不改结论：有应答的结局是对端的答复，类型上没有标记，连接已由 S07 的那次答复转 `lost`。在分析文件末尾记更正。
- 改完后请同一评审者（同一轮内的追问）核对 N1～N11 的闭合，再贴关口结果评论。

## D 差分变异（派发者，`4209b33a7`；18:08–18:12，补测后按位置复跑于 `b29f5f70e`）

- 范围：基线 `60acfc28b` 以来切片 01 的全部改动行，13 个文件、93 段，快层。第一遍退出 1：7 个「没跑测试」、5 个「超时未复核」。用新运行器按位置逐个复跑，12 个全部被杀。合并：`mcp` 66／3／0（95.7%，下限 91.3%）；契约 199／24／11（85.0%，下限 81.2%）；`mcp-host-local` 25／1／0（96.2%）。
- 真缺口：`build.ts:139` 的 `answer-malformed`（建连中 `discover` 答不可读 → `discover-failed`）。可判定化：`answer-readings.ts:75`（`toEqual` 分不出 `unusable: undefined`）。两处由派发者在 `b29f5f70e` 补测，按位置复跑：前者两个被杀；后者三个被杀，剩两个是 `authorization-required` 一半，运行时等价（类型上没有字段，判断只为收窄）。
- 等价：`discovery.ts:108`；`unusableAnswerOf` 的透传分支；两个传输 `call` 的 `signal.aborted` 早返回（`begin` 同步再查；`session.ts` 的变异体可能多问一次凭据句柄，T5 只要求不等）；套件的推导函数与标签字符串。
- 已登记的未覆盖：脚本化传输 `handedOver` 的标记分支（`:392`、`:393`），对应契约「未覆盖」里「传输死后由停止或自己的应答结算的答复」。一条 HTTP S07 之后停止在途调用的符合性用例能闭合它，记为后续候选（顾问意见：在一轮修复的范式下不重开已定的事）。
- 同一命令（守护验收 3）：`4209b33a7` 上原样重跑，构建、测试都退出 0，510 条通过，`wide` 351 秒。A-1 两个变异在 `4209b33a7` 上各使新用例变红。

## 派发者提交 `b29f5f70e`（18:27）

N1～N11（N11(c) 除外，等评论贴出）与第 32 条按 18:09 的裁定一次改完，另含上面两处补测。六项门禁在它上面退出 0。已请同一评审者（同一轮的追问）核对闭合。
