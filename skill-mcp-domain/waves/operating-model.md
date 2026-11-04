# Skill 与 MCP：单会话 map-reduce 交付范式

本文是任务过程材料，不是正文。它约束本会话怎样按波段交付 Skill 与 MCP 两个领域。**每个波段开工前，reduce 先完整重读本文，再写本波文件。**

修订：r2（2026-11-04）。r1 是 2026-11-03 负责人 PanQiWei 认可的取舍。修改本文时，在文末「修订记录」加一行，并在[方案版本表](plan-changes.md)登记一项调整。

## 1. 前提

| 项 | 本次事实 |
| --- | --- |
| 负责人 | PanQiWei。唯一的人类联系点，做目标、授权与具名接受 |
| reduce 与线负责人 | 本会话。同时担任 reduce、Skill 线负责人与 MCP 线负责人 |
| 写者、评审者、验收者 | 本会话派出的子代理。本会话可以用 SendMessage 与它们直接通信 |
| 父分支 | `PanQiWei/skill-mcp`，普通开发分支，不是集成轨道。工作树 `/home/user/omne-harness-lite/.worktrees/skill-mcp` |
| 闭包分支 | `PanQiWei/skill-mcp-<闭包名>`，从开波时的父分支头开出，推送后开 PR 合入父分支 |
| 交付边界 | M2「端到端多轮闭合」完结之前，只做两个领域的领域内实现。需求端口只用本组 `./testing` 的符合性替身 |
| 不做的事 | 不进 `integration/mainline` 或任何轨道；不走 gate；不在 GitHub 上通知他人；不把本范式写进正文 |
| 交付卡 | [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)（负责人 2026-11-04 要求建卡）。卡正文自包含总体设计、波段计划与当前执行；每波的交接报告贴成卡评论；每段合入后更新卡的「当前进展」 |

## 2. 照守的规则

这些规则保护质量与不变式，与会话数无关。

1. **波内输入冻结。** 开波时的父分支头是本波的冻结输入 F。闭包从 F 开出。闭包进行中不加新设计输入。
2. **写集不相交，共享文件单写。** 同一波里一个成员目录只给一个闭包。下列共享文件只由 reduce 写：`pnpm-lock.yaml`、`pnpm-workspace.yaml`、各成员 `package.json` 的依赖段、组页 `packages/{skills,mcp}/README.md` 与 `docs/`、领域页 `docs/domains/{skills,mcp}/`、统一语言与领域对象。
3. **简报完整才派发。** 每个闭包有闭包规格，`brief-check` 退出 0 才派发。规格必须写清依据、命名账本、写范围、排除的调用方、验收、停止条件。
4. **写者不合并。** 写者只在自己的分支提交。reduce 读完 diff 再合入父分支。
5. **交回三态。** 完成、受阻、失败。受阻时停写，写明已完成部分。零差异不开空 PR。
6. **三件事分别读回。** 已交回、已合入父分支、本波放行，在进展页上分开显示。
7. **返工先改输入。** 交回后的问题归 reduce。要返工，先在闭包规格「追加记录」写新输入，派发流水记一个新轮次。
8. **只有本波正式开工。** 下一波只是预案。路线图不授权开工。
9. **按风险评审。** 默认 L2。L3 热点逐行读（见 §6）。测试绿、结构通过不等于接受。
10. **契约演进。** 契约成员合入父分支后，后续只做可加改动。破坏性改动由 reduce 裁定，同一波迁移全部消费者并删除旧入口。
11. **如实报告。** 没观测到的写「未验证」。基线既有失败与本波引入的失败分开写。
12. **署名。** 提交作者是 PanQiWei；trailer 写 `Harness: claude-code` 与 `Agent-Role`（写者 `developer`，reduce 的合并与共享写 `main`）；不写 Co-Authored-By。父分支不改写历史。
13. **向人提问先过三问。** 必要性、复杂度、能否自主决定。能依据正文定的自己定。只把真正要负责人拍板的事项放在进展页顶部。

## 3. 变通

| 原范式 | 本范式 |
| --- | --- |
| 线父卡、attempt、binding、`start`、`status` | 本地文件。每波一个目录 `waves/w<n>/`。冻结输入与写集写在波包里。attempt 改为闭包规格的轮次，记进派发流水 |
| 线包、首次派发消息、delta | 只保留波包（两条线各一节）与每条线本波的 `spec.md`、`plan.md`。波中调整写进 `wave-queue.md` 的修订表 |
| Line 波中不与人或其他线商量 | 写者的工具里没有 SendMessage（W1 实测），波中不能向 reduce 提问；规格不够时写者在授权范围内自定，并在交回中逐条列出理由，reduce 审过后接受或开修复轮。reduce 可以向在跑的写者发消息。原设想的「写者可以直接问 reduce」不成立。纯澄清直接答，并记进闭包规格「追加记录」。改变范围的回答先改规格、记新轮次。写者之间不通信，跨闭包的事只经 reduce |
| 闭包只合入父分支、不开 PR | 推送闭包分支，开 PR，base 为 `PanQiWei/skill-mcp`，在 GitHub 用 merge commit 合入。PR 是给负责人看差异的载体，不是 gate |
| 线进展页与 reduce 总控页 | 合成一个侧边栏进展页：两条线的闭包状态与判据证据，顶部只列待负责人决定的事项 |
| 每线一份五节交接报告 | 每波一份，两条线各一小节。全文放 `waves/w<n>/handoff.md`，对话里给负责人摘要 |
| `review-delivery` 按卡核对 | 没有卡。派只读子代理按本波 `spec.md` 的验收清单核对 |
| 每波准入决定能否进线轨道 | 准入只作质量读数，波末在父分支头跑一次。闭包合入前跑 `preflight` 与涉及成员的 build、typecheck、test |
| FI：上游同步进线轨道 | 开波时把 `origin/integration/mainline` 普通合并进父分支，冲突在父分支上解决 |

## 4. 删除

线轨道、提升 PR、gate、`omne/gate/*` 标签、`dispatch-cli`、`wait-cli`、mirasim 线会话、线父卡评论、收口卡、Project Stage 写回、API 语义复核签名（两组契约成员没有登记在 `docs/engineering/delivery-lines.json`）。保留预检里的契约快照比较。

## 5. 新增：记录分支

tmp 在容器回收后会丢失。每波末，reduce 把本波记录（`waves/` 下的文件、`delegate/flow.jsonl`、进展页数据、技术文档数据）提交到记录分支 `PanQiWei/skill-mcp-records` 并推送。这条分支只存过程记录，永远不合并。恢复时读记录分支与 Git 历史，不靠会话记忆。

存档只用脚本：`bash /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/records-sync.sh "<提交说明>"`。脚本全用绝对路径，先核对记录工作树的分支再写入。不要手写 `git -C … worktree add` 一类的命令：2026-11-03 首次建记录分支时，相对路径让工作树建错了位置，随后的命令落到主检出，在本地 `integration/mainline` 上提交了一次（推送被拒，已用 `git reset --keep` 恢复）。

事故记录（2026-11-03，W2）：探路件在 tmp 里装了 node_modules，`records-sync.sh` 把 758 个文件同步进记录分支并已推送。处置：脚本加 `--exclude node_modules --exclude .stryker-tmp`，记录分支用新提交移除（不改写历史，blob 留在历史里）。规则：tmp 里任何会产生依赖目录或构建产物的探路件，先在脚本的排除表登记。

教训（2026-11-03，W2 w2-skill-host）：成员测试 import 的是 `dist`，证明用例变红时必须先还原源码并重新构建，再跑用例；只还原源码不重建，用例仍是绿的，证据无效。

教训（2026-11-04，W2 收波后整理，W3 起照做）：

- 契约缺口要在实现闭包之前补。W2 的 `w2-mcp-core` 因 `refresh` 没有 `signal`、没有领域时钟而在成员内绕道，W3 再删。一波里实现要用到的契约改动，放进同波更早一段的契约闭包。
- 并发与资源生命周期的同类问题，先在规格里写成谓词与次序（例如「条目什么资源也不持有才可遗忘」），用例跟着谓词走。W2 `w2-mcp-core` 靠评审逐个抓反例，三轮未收敛。
- 写者交回里声称做了的结构性改动（`satisfies`、删除、改名），reduce 用 `grep` 逐条核实再进评审。
- 同一类阻断连续两轮出现时，第三轮之前按 `quality.md` 缩窄承诺，不再派补洞轮。
- 一波里 Opus 评审者集中派发会撞 5 小时用量上限；写者用 Fable，评审分批派。

## 6. 质量门槛

| 时点 | 必须有 |
| --- | --- |
| 派发前 | 闭包规格 `brief-check` 退出 0；共享文件的改动已由 reduce 合入父分支 |
| 写者交回 | 写者在最后一次改动后跑完规格里的全部门禁，报告日志时间与提交号 |
| 合入父分支前 | reduce 复跑涉及成员的 build、typecheck、test 与 `pnpm run preflight`；核对写范围；按风险的评审有结论（L2 派 `implementation-reviewer`；含成员 SPEC 时派 `design-reviewer` 表达评审；代码 PR 按 `review-code`，正式文档按 `review-docs`） |
| 波末 | 父分支头：`pnpm run admission` 一次（质量读数）；本波成员的差分变异；按 `spec.md` 验收清单的只读核对；技术文档与进展页刷新；交接报告；记录分支推送 |

L3 热点（逐行读）：

- Skill：读取关口。对无权主体，答复不随身份是否存在而变；依据身份不符不披露差异。
- MCP：连接键隔离（租户、对端账号）；凭据句柄不泄露秘密值；在途表只允许同租户同主体取消；stderr 中秘密值的遮盖。

## 7. 每波的循环

1. **重读本文。** 核对修订号。
2. **开波同步。** `git fetch origin integration/mainline`，普通合并进父分支，跑 `preflight`。记下 F（父分支头完整 SHA）。
3. **reduce 共享写。** 依赖、锁文件、catalog。提交并推送父分支，更新 F。
4. **写本波文件。** `waves/w<n>/wave-pack.md`、`waves/w<n>/<线>/spec.md` 与 `plan.md`、`wave-queue.md` 的当前波；每个闭包的规格 `delegate/closures/<闭包>.md`，`brief-check`。
5. **备工作树并派发。** `worktree-cli.ts prepare-closures --base <F>`。写范围不相交的闭包并行派发。进展页标「进行中」。
6. **接交回。** 读 diff，不读转述。复跑门禁。按风险派评审。阻断修复先改输入再续派。
7. **合入。** 推送闭包分支，开 PR 到父分支，merge commit 合入，读回父分支头。进展页标「已合入」。清理工作树前把闭包 tmp 搬进 `evidence/<闭包>/`。记派发流水。
8. **波末。** 按 §6 的波末门槛跑完；写回组页（「归 SPEC」项改指成员 SPEC，或列具名剩余义务）；刷新两份源码技术文档与健康评述；写 `handoff.md`；推送记录分支；把交接报告贴成卡 #1119 的评论并更新卡正文；对话里向负责人报本波摘要。报告只写两个领域本身。
9. **下一波预案。** 更新 `wave-queue.md` 的下一波，必要时修订[波段计划](rolling-plan.html)。

## 8. 实现架构页

负责人持续关注实现的优雅、健康与合理。一个页面，两个领域各一个标签。**每个闭包合入父分支后立即更新**，每波末再核一次：

1. reduce 读合入的源码，改写该领域的「技术讲解」（`techdoc/narrative/<领域>.html`）：模块分工、关键类型之间的关系、真实的调用路径与读法。讲解只依据源码。
2. 写该领域「健康评述」的本次一节（`techdoc/review/<领域>.html`）。
3. 运行 `node tmp/skill-mcp-domain/techdoc/gen.mjs`，生成 `techdoc/index.html`，重发布到固定链接。

自动部分由源码推出：成员依赖图、成员内模块图、导出类型与类的类图、各入口导出表、健康读数（文件、行数、导出数、测试数、草稿标记、`as` 断言、`any`、最长函数）。页面另有 reduce 手写的「健康评述」，每波一节：哪里优雅、哪里有异味、偏离设计的地方与处置。设计正文与 DDD 草图只作对照，不作为页面的事实来源。

## 9. 本会话的输入索引

| 输入 | 位置 | 用途 |
| --- | --- | --- |
| 组页（正文） | `packages/skills/docs/architecture.md`、`packages/mcp/docs/architecture.md` 及两组 `README.md`、`key-flows.md` | 技术唯一源 |
| 领域页（正文） | `docs/domains/skills/`、`docs/domains/mcp/` | 端口实现方与跨领域交接 |
| DDD 与 SOLID 建模 | `tmp/skill-mcp-domain/model/README.md` 与 `model/skill/*.ts`、`model/mcp/*.ts`、`model/checks/run.ts` | 形状与参考实现的起点；与正文冲突时以正文为准 |
| 波段计划 | `tmp/skill-mcp-domain/waves/rolling-plan.html` | 各波的成果与边界 |
| 派发流水 | `tmp/skill-mcp-domain/delegate/flow.jsonl` | 每个闭包一行 |
| 进展页 | 数据 `tmp/skill-mcp-domain/progress/progress.json`，生成 `python3 tmp/skill-mcp-domain/progress/build.py`，发布到 https://claude.ai/artifact/KNYD4VLPdkvyrh433dHRqc | 每次闭包状态变化就改数据、重生成、重发布；没有变化时最长 30 分钟一次 |
| 实现架构页（两个领域一页，标签切换） | 生成 `node tmp/skill-mcp-domain/techdoc/gen.mjs` → `techdoc/index.html`；讲解 `techdoc/narrative/{skill,mcp}.html`；评述 `techdoc/review/{skill,mcp}.html`；发布到 https://claude.ai/artifact/3Zfm6AtcBczsMTTE6KuhkA | 每个闭包合入后：先读合入的源码改写讲解，再写评述，再生成并重发布；每波末再核一次。旧的两份分领域页面（LvtCU…、9iau1…）已停用 |
| 波段计划页 | https://claude.ai/artifact/NHNDS7CYaGfrdQKbch4ELh | 波段边界变化时修订 |

## 修订记录

| 修订 | 日期 | 改了什么 |
| --- | --- | --- |
| r1 | 2026-11-03 | 首版 |
| r2 | 2026-11-04 | 加交付卡 #1119（负责人新要求取代「不建卡」）；波末把交接报告贴卡；加 W2 的五条教训 |
