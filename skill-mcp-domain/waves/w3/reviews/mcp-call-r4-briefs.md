# w3-mcp-call 第 4 轮关口与 w3-mcp-host 修复轮复核的简报

规则 C-SM-08：这是 call 的最后一个关口，之后至多一轮修复，复审只核阻断。host 在第 4 轮关口没有阻断，修复轮 fix4 与派发者的 `50fc8d146` 只复核本轮改动。

阻断判据（各面共用）：阻断只认违反已要求需求或已承诺不变式的问题。已要求的来源有四处：
- 卡 #1119 判据 C1–C6，以及闭包规格的验收清单：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md`、`w3-mcp-host.md`。
- 成员 SPEC 与契约 SPEC 已写的承诺。
- 领域交接 `docs/domains/mcp/architecture.md` 列出的服务与消费者。
- 生态兼容基线 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/README.md`。

每条阻断写明违反的是哪一条。其余建议写进报告末尾「超出已要求的需求」一节，各带一句理由，不算阻断。只读，只在指定工作树里搜索。手工变异在工作树之外的副本上做。报告内联交回。

## call 的共同材料

- 候选：PR #1141，分支 `PanQiWei/skill-mcp-w3-mcp-call`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `2b895ea2a`。基线 `b2ba7dc89`：闭包派发时的父分支头，没有 task context，`status` 的 `bound` 为 false。
- 第 3 轮评审的 head 是 `fcc955a53`。本轮只评 `git diff fcc955a53..HEAD`，必要时读周边代码。之间的闭包与改动：
  - `w3-mcp-call-fix3`：`fcc955a53..deb5a977e`。
  - 派发者改正 `refresh` 的出口次序：`035ac8fee`。
  - `w3-mcp-call-docs3`：`035ac8fee..a9ddf6742`。
  - 派发者补刷新口扫描用例：`d966e05c1`。
  - 派发者让值树先过 `judgeJsonValue`：`44a218fec`。
  - 派发者的文档改动：`2b895ea2a`。
- 第 3 轮的五面报告与卡拥有者的全部裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r3.md`。
- 规格：
  - `packages/mcp/mcp/SPEC.md`：MC-7、MC-16、MC-17、所有权、偏离表、已知限制、性质与证据。
  - `packages/mcp/mcp-contract/SPEC.md`：S2、S8、R2、R7、T5，以及「调用口闭包的裁定」一节。
- 证据：卡 #1119 评论 6680037685（本轮全部证据）。原件在工作树 `tmp/closures/w3-mcp-call/` 下。

## A. call 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款。每条发现带反例、缺的行为或本次运行的工具输出。

1. 逐条核对第 3 轮的阻断与 A 面另列的三处是否消失。写「已消失」并给证据（用例名、代码位置、在新 head 上复跑的探针输出），或给出仍成立的反例。
   - 阻断：`closeAll` 落在等待途中时，答复取决于下一步。
   - 阻断：任务操作发请求之前不判关停。
   - 关口粒度是 MC-16 编号的一步。
   - `refresh` 与调用口同形。
   - 关停之后不派取消。
   第 3 轮的探针在 `reviews/mcp-call-r3-probes-a/`、`mcp-call-r3-probes-c/`。
2. 「甲」在三个出口都成立：
   - 答复只在出口决定一次。调用口在 `perform` 的 `answerAtExit`；任务操作在 `outcomeOf`；`refresh` 在它的 `answerAtExit`，次序是已发布 → 调用方中止 → 关停。
   - 途中各点只保证关停之后不开始下一步、不问端口。
   沿 `perform`、`sendOrder`、任务操作的 `exchange`、`refresh` 逐条路径读，找出答复不由出口决定的路径，或关停之后仍问端口的路径。
3. 契约 R2 的值树前提：
   - 调用方给的每一棵值树，到达传输之前都先经 `judgeJsonValue` 判定：`args`、`ContinueRequest.inputResponses`、`provideTaskInput` 的 `inputResponses`。
   - 不通过时返回的 Promise 以 `TypeError` reject，方法不同步抛出，不占位、不查任务表、不问端口。
   - 传输拿到的是判定得到的副本。
   找出任何仍让调用方的值不经判定就到达传输的路径。
4. L3 热点逐行读：
   - 占位句柄：`Reservation` 的 `stop`、`sent`、`conclude`，以及表里的格子。
   - 任务表的「有歧义」与账户隔离。
   - 第 8 步与 `perform` 对停止信号的判定。
5. 结构读数：
   - 运行 `pnpm run lint:deps`。
   - 运行 `pnpm run metrics --coverage --base b2ba7dc89`，只摘 `fcc955a53..HEAD` 改动函数的圈复杂度与 CRAP。
   - fix3 报过一个红项：覆盖率子运行里 lifecycle 的 `wide` 在插桩下超过 600 s。写出本次是否复现。
   - 命令排队等名额是正常的。失败时交回命令与输出。

## B. call 表达（design-reviewer，expression，opus，xhigh）

对象只限 `fcc955a53..HEAD` 改动的部分：
- `packages/mcp/mcp/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`tests/README.md`、`tests/index.md`、`verification/README.md`、`verification/models/README.md`。
- `packages/mcp/mcp-contract/SPEC.md` 改动的句子（S8、R2、裁定第 30 条），以及 `src/` 里改动的文档注释。

判据按 design-review 的表达页。另核对：
- 第 3 轮表达评审的非阻断 N1–N11：逐条写「已改」「仍成立」或「不适用」，带位置。
- 关停与停止的判定点在三处说法一致：SPEC MC-7、MC-16、MC-17；`verification/README.md`「关停与停止的判定点」；F 序列表。
- 每个读数都写了运行时的 head。

`check:docs` 与 `format:check` 在 `2b895ea2a` 上都通过。

## E. 交付边界（general-purpose，sonnet，medium），call 与 host 两部分

按 `review-delivery`。只认卡上的证据。子代理的「达到」不是接受。

**第一部分，call：**
- 对照卡 #1119 现行正文，以及闭包规格 `delegate/closures/w3-mcp-call.md` 的验收清单与「性质及证据义务」，逐条判达到或未达到。
- 卡上的证据：评论 6680037685、6676484241、6676418696、6675951054，以及先前的 call 证据评论。
- 第 3 轮 E 面未达到的项逐条复核。
- 调度者的裁定：`reviews/mcp-call-r3.md` 里的全部处置；`delegate/closures/` 下 `w3-mcp-call-fix3.md`、`w3-mcp-call-docs3.md` 的追加记录与接受记录。列出它们与派发时卡文、规格原文的冲突项。

**第二部分，host：** 只复核第 4 轮 E 面「五、给调度者保留的未达到项」的 1–5 项，见 `reviews/mcp-host-r4.md`。第 6 项（差分变异）还在跑，写「待定」。证据在卡评论 6679800023。每项写达到或未达到。未达到时写缺哪份证据。

## D. 差分变异（general-purpose，sonnet，high），两次运行，依次跑

按 review-code「差分变异」做以下各项：

1. **时机：** 两个 head 都是最终 head，各跑一次。call 在 `2b895ea2a`，host 在 `ebfedc98a`（修复轮复核之后派发者补了一条断言与一句 V4 文字）。
2. **次序：** 先 call，跑完再 host，两次不同时跑。
3. **call：** 在 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call` 运行 `VITEST_MAX_WORKERS=6 pnpm run mutation --base b2ba7dc89 --since 5204d3799`。
4. **host：** 在 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host` 运行 `VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf --since 720a5d08a`。
5. **先列范围：** 每次先加 `--plan-only` 列出范围。核对范围只含 `packages/mcp/` 下各成员 `src/` 在 `--since` 之后的改动行，再正式运行。
6. **名额与工作树：** 启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额。两棵树在你运行期间都没有写者。
7. **进程数：** 看日志开头写进程数的那一行。进程数偏低时，按告警里的命令重启。

每次运行交回：
- 被杀、存活、无覆盖、运行错误、没跑测试、超时的计数。
- 存活与无覆盖逐个列出，写文件:行与变异内容。
- 把存活判为等价之前，先说明能否改夹具或代码让它可判定。
- 账本路径。

命令失败时交回命令与输出，不把未跑写成零存活。按本卡第 3 轮的缩窄规则，运行器的「运行错误」「没跑测试」「超时」不计分，原样列出。

## H. host 修复轮复核（implementation-reviewer，opus，high）

- 候选：PR #1138，分支 `PanQiWei/skill-mcp-w3-mcp-host`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `50fc8d146`。只评 `git diff 54a2377cb..50fc8d146`：fix4 的 6 个提交，加派发者的 `50fc8d146`。
- 第 4 轮四面报告与卡拥有者的处置：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r4.md`，见「卡拥有者对第 4 轮的处置（06:34 UTC）」。
- 修复轮规格：`delegate/closures/w3-mcp-host-fix4.md`。交回：`delegate/handbacks/w3-mcp-host-fix4.md`。
- 证据：卡评论 6679800023。原件在工作树 `tmp/closures/w3-mcp-host/fix4/` 与 `owner-gate-50fc8d146/`。

要判定的事：
1. 处置里「修」的第 1–9 条，每条是否按裁定的内容做到。代码项（1–4）各有一条在基线上变红的用例。
2. 本轮改动是否引入新的违反：违反成员 SPEC、契约 SPEC 的 T1–T9 与 R4、「真实传输兑现时的裁定」，或已承诺的性质 V1–V6。尤其看以下三处：
   - `work` 的 catch：先报出口，再停，停下时的抛出也交出口。
   - `pump` 的事件迭代 reject：按流断开处理，在途请求按相结算。
   - `StdioLine.close()` 单飞：第二次调用在第一次完成时才完成，读循环结束之后才返回。
3. 改动的文档句子是否与代码行为一致。
4. `50fc8d146` 把两个释放函数写成「不抛出」的端口义务，没有在 `stop` 与 `close()` 里处理抛出。判断这是否违反已承诺的不变式。这两个释放函数是流式交换的 `abort()` 与 `schedule` 返回的取消函数。

不跑结构读数，差分变异由 D 面做。阻断只认第 2、3 条里违反已承诺的问题，以及第 1 条里没做到裁定的项。
