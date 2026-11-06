# 闭包规格 w3-mcp-host-docs3

## 身份与位置
- 闭包：w3-mcp-host-docs3
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：72f977c81cf83cd17db05611cfc09049a46c3600
- 清晰度：定

`w3-mcp-host` 第 3 轮评审之后的表达与证据闭包（PR #1138），接在代码修复 `w3-mcp-host-fix3` 与模型增补 `w3-mcp-host-formal3` 之后。评审与卡拥有者的处置在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md`：B 面 NB-3～NB-6 与小项，「第 3 轮结构诊断」与「卡拥有者裁定（03:21 UTC）」两节，以及 fix3、formal3 交回里列出的「让排除文件里的句子过时的位置」，是本闭包的施工依据。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：规格完整的文档修订与证据整理，结论都已裁定，无并发设计 → 经济档。

## 目标边界
目标：成员与契约的文档与最终 head 的代码、模型一致；性质陈述覆盖断开与 stdio 关闭；证据表只写在本闭包基线上运行过的读数。

### 已定的事（不重新裁定）
1. **性质陈述**（成员 SPEC「性质与证据」）：
   - V2 扩写为：「`close()` 返回之后，不再调用凭据句柄的 `authorize` 与 `reportRejection`；会话断开之后，不再调用 `authorize`，也不再把请求交给线路。」模型里的 `V2_NoWireAfterDead` 留在 V2 名下。
   - V4 加断开子句：断开之后没有授权中的请求；线路断开之后没有已交给线路的请求；会话结束之后，其余已交给线路的请求合法地等自己的应答。授权发现中的请求断开前后一样，由取回答复、`signal` 或 `close()` 放开。V4 的前提「线路的 `close()` 只依赖本地资源」写成线路对会话的义务，并指向 H6。
   - V6 加断开：授权中答「未发出：`connection-unavailable`」；线路断开时已交给线路的按原因答 `no-answer`；会话结束只让触发它的请求答「未发出：`session-ended`」，其余已交给线路的不动；授权发现中的不被断开结算，之后照常以 `authorization-required` 结束；断开之后开始的请求答「未发出：`connection-unavailable`」。
   - TLA 一列与探索器一列按 formal3、fix3 的交回补负控与变异名（formal3 交回第 10 节的清单，按第 7 节把「discovery 当场答」改为「不动」）。
2. **`verification/README.md`**：动作映射加 `LineGone`、`SessionEnded(r)` 两行，实现一列用 fix3 交回的名字；`Broken(r)` 一行按 formal3 交回第 10 节改；状态映射加 `gone`、`ended`、`deadAt`、`deadBy`、`deadOut`、`sendsAtDead`、`authAtDead`；「两种证据能变红」同步；探索器读数与负控表换成 fix3 交回 head 上的数字；`http-line.ts` 的新负控进表。
3. **红灯表**（工作树 `tmp/closures/w3-mcp-host/docs2/red-table.md` 的后继，本闭包写 `tmp/closures/w3-mcp-host/docs3/red-table.md`）：A 节换成 fix3 交回的负控重跑表；D 节标明哪些行仍对现行代码成立（`http-line.ts` 上的 4 行已转成负控，引负控名），其余标为历史。
4. **B NB-3**：`close()` 单列为「只等线路的 `close()`」；「线路的 `close()` 会答复」写成 V4 的前提，归线路端口的义务（见第 1 条）；自定 9 补 `discover` 的两处例外；「到期即收场」改为「关闭时收场」。
5. **B NB-4**：契约裁定表的闭合句改写，第 12、13 条列为行为改动。
6. **B NB-5**：契约根导出只留一份清单（SPEC「三个入口」的 `.` 行指向 `docs/public-api.md` 与 `tests/public-entry.spec.ts`）；`public-api.md` 的套件数按现行导出写。
7. **B NB-6**：契约「未覆盖」按现状登记：授权中 `signal`、`close()` 由套件覆盖（fix3 加的用例名）；授权发现中的结局、`close()` 不等挂起的句柄、元数据取回不带凭据头列进「没有手写用例」，并指向 `@omne-harness/mcp-host-local` 的用例。
8. **B 小项**：成员 SPEC 写 V1–V6 的那一处；「不要求」一处；`verification/README.md` 引成员 SPEC 的那一处；成员一侧的按相结局表只留 V6 的陈述，其余指向 T5；README 的性质链接与目录图。位置见 B 报告「小项」。
9. **B NB-1 的文档部分**：`docs/flows.md` 两行按第 1 条 V6 的断开规则改。
10. **fix3、formal3 交回的过时句子**：逐条改。

### 写范围
- `packages/mcp/mcp-host-local/SPEC.md` — 「性质与证据」与第 4、8 条涉及的句子
- `packages/mcp/mcp-host-local/README.md` — 第 8 条
- `packages/mcp/mcp-host-local/README_ZH.md` — 第 8 条
- `packages/mcp/mcp-host-local/docs/` — 第 9、10 条
- `packages/mcp/mcp-host-local/index.md` — 第 10 条
- `packages/mcp/mcp-host-local/tests/index.md` — 第 10 条
- `packages/mcp/mcp-host-local/tests/README.md` — 第 10 条
- `packages/mcp/mcp-host-local/tests/fixtures/README.md` — 第 10 条
- `packages/mcp/mcp-host-local/verification/README.md` — 第 2 条
- `packages/mcp/mcp-contract/SPEC.md` — 第 5、6、7 条
- `packages/mcp/mcp-contract/docs/public-api.md` — 第 6 条
- `tmp/closures/w3-mcp-host/docs3/`（新建） — 红灯表、门禁输出

### 排除的调用方
- 两个成员的 `src/`、`tests/` 的代码：fix3 已交回。
- `packages/mcp/mcp-host-local/verification/models/`：formal3 已交回。
- `packages/mcp/mcp/`。

## 验收清单
1. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希写进交回。
2. `git diff --name-only <基线>..HEAD` 只含写范围内的文件。
3. B NB-3～NB-6 与小项逐条写「已改」与位置；fix3、formal3 交回的过时句子逐条写位置。
4. 性质名、不变式名、负控名与变异名在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md`、`tests/model/mutants.ts`、`verification/models/run.py` 五处一致：交回一张对照表。
5. 证据表里每个读数写运行时的 head 与日志哈希；没有在本闭包基线上运行的写「未验证」。

## 实施规格
- 中文文档按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 只写现状与依据，不写评审轮次与过程；编号要能在仓库里解析。

## 性质及证据义务
- 每条变异或负控声明都有运行记录；没有的写「未验证」。

## 施工计划
1. 读处置、结构诊断、两份交回与 diff。
2. 第 1 条与第 2 条（性质陈述与映射），第 3 条红灯表。
3. 第 4–10 条。
4. 门禁、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行仓库文档检查、`lint:rules`；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改代码行为。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。不跑 `admission`、仓库全量测试与差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审与处置：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md
- fix3 的规格与交回：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-fix3.md`、`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-host-fix3.md`
- formal3 的规格与交回：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-formal3.md`、`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-host-formal3.md`（以第二次交回为准）
- 必须加载：asd-ste100

## 当前认知
- 已确认：fix3 交回 head `3a79454d0`（9 个提交），formal3 合入为 `72f977c81`（只动 `verification/models/`）。fix3 交回的「让排除文件里的句子过时的位置」：`verification/README.md:36`（`Broken(r)` 行：断开现在经 `lineGoneAnswerOf` 按相结算，授权中的也结算，发现中的不动）、`:129`（`mStdio-writes-boolean` 已退出；现为 3 个 stdio 负控、7 个 `http-line.ts` 负控）；`docs/flows.md:52`、`:59`（断开时「所有在途请求 `stream-broken`/`process-exited`」改为按相）；SPEC「性质与证据」`:206` 与 V6 一行（补 `mB1-session-ended-skips-authorizing`、`mV6-lineend-keeps-authorizing`、`mV6-lineend-settles-discovery`）。
- 已确认：负控 23 个全部变红（fix3 交回第 3 条，`tmp/closures/w3-mcp-host/fix3/mutants/run-3a79454d0.log`），新 13 个的名字与 `mutants.ts` 一致；探索器读数（含 `stdio-discover`、`stdio-call`、`sse-fallback` 到达断开）在 fix3 交回第 4 条；簇表在 `tmp/closures/w3-mcp-host/fix3/clusters.md`。
- 已确认：契约导出新增 `InFlightPhase`、`UnusableCause`、`stopAnswerOf`、`lineGoneAnswerOf`、`fallbackGetConclusionOf`；`ConnectionView` 改为判别联合（契约裁定 15）；按连接的规则移到 `connection.ts`。`docs/public-api.md` 与契约 SPEC 的根入口已由 fix3 登记，本闭包按 B NB-5 收成一份清单。
- 已确认：契约的慢层（262 条全部 skipped）与 `@omne-harness/mcp` 的慢层（没有用例文件）不执行用例，是既有分层，不是缺陷；文档里不要把它们写成慢层覆盖。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；第 4 条的对照表；B 各项的位置；未覆盖项。

## 已知会受影响的现有用例
- 没有用例改动。

## 停止条件
- 某条文档要求与最终 head 的代码或模型不符，而改代码在范围外。

## 追加记录
- 2026-11-06 05:00 派发前：基线填为 formal3 合入后的 `72f977c81`（已推送），树干净；派发者在这个 head 上复跑的门禁全部退出 0（`tmp/closures/w3-mcp-host/owner-fix3/`）。简报检查退出 0（两条写范围行按一行一个路径拆开后）；131 条 `caller-outside-scope` 是全仓同名标识符匹配，本闭包不改代码。并行：调用口树上 `w3-mcp-call-fix3`（Opus high）在跑成员测试与探索器。
- 2026-11-06 05:17 交回（`delegate/handbacks/w3-mcp-host-docs3.md`，05:26 存档），head `f022dfb98`，两个提交。派发者核对：`git diff --name-only 72f977c81..f022dfb98` 11 个文件，全在写范围内；作者与提交者都是 PanQiWei，trailer 只有 `Harness` 与 `Agent-Role: developer`。三条自裁采纳：契约 SPEC 删「第 N 轮评审后」符合「不写评审轮次」；成员 SPEC 依据表对同 PR 的契约 SPEC 写「同一分支同批交付」，避免钉哈希反复过时（第 3 轮 NB6 的来源），留给第 4 轮 B 面判；运行记录的负控状态数随调度变化，文件已写明。它报告的两处排除文件过时句子由派发者在 `54a2377cb` 改正（`src/index.md:13` 改为「关闭时一律中止写端」，模型 README 不再用闭包名做过程引用），复跑四项文档门禁全过（`tmp/closures/w3-mcp-host/owner-docs3/`），已推送。**接受。**未覆盖项转第 4 轮：红灯表 B 节 `settle` 表守卫变异没在现行代码上重跑；契约慢层不执行用例。
