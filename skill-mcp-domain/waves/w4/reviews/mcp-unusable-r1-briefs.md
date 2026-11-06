# w4-mcp-unusable 关口评审的简报（C-SM-08，一次）

共同材料（每份简报都给）：

- 候选：PR（见卡 #1119 上本闭包的证据评论），分支 `PanQiWei/skill-mcp-w4-mcp-unusable`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable`，head 见证据评论。基线 F `60acfc28b`。范围 `git diff 60acfc28b..HEAD`。
- 两份闭包规格：产品写者 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w4-mcp-unusable.md`（已定的事、全函数、追加 1 的裁定）；守护写者 `…/delegate/closures/w4-mcp-unusable-guard.md`。
- W4 MCP 规格：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md` 第 1 节第 1–8 条、D-W4M-2、Testing Decisions、ub-mode 取舍表。
- 产品写者交回的要点（派发者整理）：`…/waves/w4/reviews/mcp-unusable-handback.md`。
- 契约：`packages/mcp/mcp-contract/SPEC.md` T1、T8、S2、S5、S7、S8、R1、R7；成员 `packages/mcp/mcp/SPEC.md` MC-5、MC-10、MC-16、MC-17 与偏离一节。
- 证据：卡 #1119 上本闭包的证据评论；原件在工作树 `tmp/closures/w4-mcp-unusable/`（`logs/`、`mut/`）。
- 只读，只在这棵工作树里搜索。手工变异在副本上做，不改工作树。报告内联交回。

## A. 正确性（implementation-reviewer，Opus 5.5，high）

判据：实现是否兑现全函数（W4 MCP 规格第 1 节第 4 条）与标记的语义（第 1–3 条）。每条发现带反例、缺的行为或本次运行的工具输出。逐行读：

- `packages/mcp/mcp/src/internal/lost.ts` 的 `lostOf`：三条规则的次序与穷尽；第 1、2 条是否会重叠。
- 每个调用点（`git grep -n -E 'loseOn\(|loseInScope\(' -- packages/mcp/mcp/src ':!packages/mcp/mcp/src/internal/lost.ts'`）之前的判断是否只取自 `lostOf`；`calls.ts` 第 12 步判的是分类之前的 `PeerAnswer`。`internal/build.ts` 没有改，建连中的失败不论带不带标记都让建连失败。
- 标记只由决策层写入：`mcp-contract/src/decisions.ts` 的 `settle`、`unusableAnswerOf`；两种传输（`mcp-host-local/src/session.ts`）与脚本化传输只原样交出；`close()` 之后的答复不带标记；单调：一旦标出，之后每个请求都标出。
- `UnusableCause` 去掉 `abandoned` 之后没有遗留的生产者或消费者。
- 写者自定的两件（交回要点第 4 节）：就绪连接上 `discover` 答 `error-answer` 或 `answer-malformed` 时转 `degraded`；`streamGoneAnswerOf` 参数收窄。核对它们与全函数和契约是否一致。
- 探索器的规模（2026-11-06 15:40 派发者追加）：慢层 `wide` 场景现在单独运行约 360 秒（守护写者 14:50–15:02 的计时，有无 P15 相差约 2%），时限 600 秒；`packages/mcp/mcp/verification/README.md` 的读数是 60950 个状态、194223 次重放、158.1 s，没有记 head。在副本上用一个小脚本调用 `explore(WIDE)`（`tests/model/explore.ts`、`scenarios.ts`），分别在基线 F `60acfc28b` 与 head 的源码上读 `states`、重放数与耗时，单线程，各一次。判断：状态数是否因本闭包的改动增加；增加时指出是哪一处改动、是否属于规格要求的语义。只交读数与判断，不改时限与场景。
- 结构读数：在工作树根运行 `pnpm run lint:deps`（先构建组外三个成员 `@omne-harness/agent`、`@omne-harness/settings-local`、`@omne-harness/identity-sql`，否则有 8 条与本闭包无关的 `no-unresolvable`）与 `pnpm run metrics --coverage --base 60acfc28b640a1535585df1ebccd22bdc87e4d7c`，只摘改动函数的圈复杂度与 CRAP。

## B. 表达（design-reviewer，expression，Opus 5.5，xhigh）

对象：`packages/mcp/mcp-contract/SPEC.md` 本闭包改动的条款（T1、T8 前言、S2、S5、S7、S8、R1、R7、调用口闭包的裁定第 32 条）；`packages/mcp/mcp/SPEC.md` 的偏离一节与 MC-16、MC-17；两份 `verification/README.md` 新加的节；`mcp-host-local/SPEC.md` 写到答复形状的地方；`mcp/docs/architecture.md` 与 `mcp/README.md` 守护写者改的句子；成员 SPEC「性质与证据」里 P15 的定理、证据表一行与负控一句（派发者 `559be1514`）；`docs/public-api.md` 改动处。判据按 design-review 的表达页。另核对：全函数在契约 S5、S7 与成员 SPEC 里是否只有一份规范语气的权威，其余位置是引用；条款编号与锚点的读法一致；偏离一节确实为空且入向链接仍能解析。

## C. 设计与实践（general-purpose，Opus 5.5，high）——只看两件事

判据：ub-mode、`docs/defensive-patterns.md`、`pstack:typescript-best-practices`。范围只限：标记字段 `unusable?` 的形状（W4 MCP 规格 ub-mode 取舍表记了「可选字段而非判别联合」的偏离与理由，判它的理由是否成立、代价是否写清），以及转 `lost` 的条件（`lostOf` 与调用点）。问题指到具体类型、函数或分支，带改法。

## D. 差分变异（派发者自跑）

最终 head 上一次，只打热点：`packages/mcp/mcp/src/internal/lost.ts`、`calls.ts`、`tasks.ts`、`discovery.ts`，`packages/mcp/mcp-contract/src/decisions.ts`、`answer-readings.ts`，`packages/mcp/mcp-host-local/src/session.ts`。先 `--plan-only` 核对范围。`VITEST_MAX_WORKERS=6`。

## E. 交付边界（general-purpose，Opus 5.5，high）

按 `review-delivery`，对照对象是本波 spec（范式 §3）：W4 MCP plan 切片 01 的验收 M4-1、M4-2、M4-3、M4-5、七项轻门禁、契约用例（守护写者）、`mcp` 用例（产品写者），以及两份闭包规格的验收清单。逐条判达到或未达到，只认卡上的证据。另给调度者的裁定（产品闭包规格追加 1；守护闭包规格追加 1；派发者 15:36 对守护验收第 3 条的裁定（守护闭包规格追加记录末条）：负控还原后同一命令第一次运行在负载下超时，以之后同一份字节上 `--force` 的组运行退出 0 作为「还原后退出 0」的证据），列出与派发时规格原文的冲突项。
