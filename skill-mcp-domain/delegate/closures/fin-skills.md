# 闭包规格 fin-skills

## 身份与位置
- 闭包：fin-skills
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/fin-skills
- 分支：PanQiWei/skill-mcp-fin-skills
- 基线：d5ce9ae1ac4349f1c089453a1b508f0082ff81c7
- 清晰度：定

最终复审之后的收尾轮，新写者接手。上一轮修复规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/rev-skills.md。原闭包规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/rev-skills.md。上一层规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按已裁定清单改设计正文，需要守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把派发者对第 1 轮评审的裁定落进 Skill 的领域页与组页，使正文可以作为第一波实施输入。裁定是唯一依据，不重新判断这些选择；只把它们写全、写准、写一致。

必须落实：裁定清单 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r4.md 中 「Skill」G-10–G-19。最终复审摘要：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/final-review.md（文件:行以 d5ce9ae1a 为准）。r1–r3 裁定已落盘，除本清单明确改动的以外保持不变；负责人原则不变：组页只写本领域内部与对外契约，领域页保留端口实现方与跨领域交接。自查条目要读的已接受源：docs/rfcs/RFC-0001-technical-foundations.md、docs/architecture/technical-foundations.md；旧材料（只作参考，与现行架构冲突的不采用）：packages.0.0.1.legacy/core/skill-package/。

不在范围内：另一个领域的文件；产品正文；源码；建包；顺手清理与裁定无关的内容。

### 写范围
- `docs/domains/skills/README.md` — D-01 还原措辞，只留导航
- `docs/domains/skills/architecture.md` — 端口与实现方等裁定落点
- `docs/domains/skills/key-flows.md` — 流程图与交接表的裁定落点
- `packages/skills/README.md` — 成员与依赖、依赖方向图
- `packages/skills/docs/architecture.md` — 模型、端口、服务、失败种类、技术处置的裁定落点
- `packages/skills/docs/key-flows.md` — 组内流程图

### 排除的调用方
- `packages/` 与 `apps/` 中同名的代码标识符 — 本闭包只改文档；停止条件：需要改代码时停下交回
- `docs/domains/skills/README.md` — 已接受正文本轮不改；停止条件：必须改它时停下交回
- `.meta_harness/design/ubiquitous_language/` — 由并行闭包 ul3 改；停止条件：需要改词表时停下交回
- `.meta_harness/design/product/skills/design.md` — 链接到组页 Q 小节；小节标题不变所以不改；停止条件：必须改标题时停下交回
- 另一个领域的 docs 与 packages — 由另一位写者并行修改；停止条件：需要改它们时停下交回

## 验收清单
- A1 pnpm run check:docs 与 pnpm run check:design 都退出 0。失败时先在基线上复跑同一命令。
- A2 入向锚点仍在：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/anchors.md 中指向本领域的标题逐个 grep -n -x -F 命中。变异：把一个 Q 小节标题改一个字 → A1 的 check:docs 报断链（验证一次后还原，输出存 /home/user/omne-harness-lite/.worktrees/fin-skills/tmp/fin-skills/）。
- A3 裁定逐条落实：交回里给一张表，每条裁定写落在哪个文件哪一节；不适用的写理由。
- A4 裁定逐项可查：grep「读取资格」在 packages/skills 与 docs/domains/skills 无命中；inspect 的结果不含正文；summaries/search 写明先经 SkillReadCheck；projectAssetBody 产出 package.digest；./testing 含 SkillReadCheck 与 SkillResolution 套件；KL-9 作为具名剩余义务出现。命令与结果写进交回。
- A5 已接受 README 不改：git diff d5ce9ae1a -- docs/domains/skills/README.md 无输出。
- 收尾门禁：pnpm run format:check；pnpm run lint:rules；git ls-files --eol 的 w/crlf 只允许基线已有的两个 legacy LICENSE。
- 接受级别 L1。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。

## 实施规格
位置与唯一源同原闭包规格：领域页只写跨领域交接与端口实现方，组页写成员、模型、端口、服务、失败、流程与技术处置；具名文档目标标「尚非 workspace 成员」。图用 mermaid。英文类型名是候选标识，放代码样式。

### 命名账本
- 以 decisions-r1.md 为准：@omne-harness/skill（纯契约）、skill-access、skill-cordis-contract、skill-host-local；端口 PackageSource（snapshot(locator)、open(locator, digest, path)）、SkillResolution、SkillReadCheck、RequirementFacts；失败增 undecided、unsupported。

## 性质及证据义务
- 不与已接受的上层冲突；D-12 把资产 SPEC 样例写成偏离，不引作依据。
- 一个事实一个家；对无权主体「无权」与「不存在」不可区分。

## 施工计划
1. 跑 A1、A2 基线并存输出；做 A2 变异确认会红，存输出，还原。
2. 加载 asd-ste100；读裁定清单与两份评审摘要。
3. 逐条落裁定，先组页 architecture，再 key-flows、README，最后领域页与统一语言。
4. 跑全部验收与门禁，提交。

## 自主范围与动作授权
允许：在写范围内改文件；本地提交到本分支。不允许：推送、合并、改写范围外文件、装依赖。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/fin-skills。另一领域由另一位写者并行修复。派发者是唯一合回者。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/fin-skills/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载的技能：asd-ste100。
- 裁定：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r1.md；评审摘要：同目录 review-docs.md、design-review.md；旧说法：同目录 superseded.md；设计来源：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/design/formal-design-v1.1.md

## 当前认知
- 已确认：基线 d5ce9ae1a 上 check:docs 与 check:design 均 PASS；评审行号以该提交为准。
- 假设：无。
- 未知：无。

## 返回与恢复
交回内联给派发者，按写者共用约定「交回格式」：提交号、每条验收的命令与结果、裁定落点表、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/fin-skills/tmp/fin-skills/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 某条裁定与已接受正文冲突、无法只在本层写成偏离时停下交回。
- 必须改写范围外文件才能通过检查时停下交回。

## 追加记录
