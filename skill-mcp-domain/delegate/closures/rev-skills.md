# 闭包规格 rev-skills

## 身份与位置
- 闭包：rev-skills
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/rev-skills
- 分支：PanQiWei/skill-mcp-rev-skills
- 基线：d0c755b9b0d341b267ef39fa9c613e3265d2c997
- 清晰度：定

按负责人新原则的修订轮，新写者接手。上一轮修复规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/fix2-skills.md。原闭包规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/fix2-skills.md。上一层规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按已裁定清单改设计正文，需要守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把派发者对第 1 轮评审的裁定落进 Skill 的领域页与组页，使正文可以作为第一波实施输入。裁定是唯一依据，不重新判断这些选择；只把它们写全、写准、写一致。

必须落实：裁定清单 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r3.md 中 「原则」与「共同」F-00–F-03、「Skill」F-10–F-16（含 F-13a）。消费者演练摘要：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/drill/skill-r2.md（缺口与多余的文件:行以 d0c755b9b 为准）。原理调研：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/research/。r1、r2 裁定已落盘，除本清单明确改动的以外保持不变。统一语言的新词「材料依据」由并行闭包 ul2 落字，正文可以先用这个词。自查条目要读的已接受源：docs/rfcs/RFC-0001-technical-foundations.md、docs/architecture/technical-foundations.md；旧材料（只作参考，与现行架构冲突的不采用）：packages.0.0.1.legacy/core/skill-package/。

不在范围内：另一个领域的文件；产品正文；源码；建包；顺手清理与裁定无关的内容。

### 写范围
- `docs/domains/skills/README.md` — F-02 修订模块角色与相关句子；小节标题不改
- `docs/domains/skills/architecture.md` — 端口与实现方等裁定落点
- `docs/domains/skills/key-flows.md` — 流程图与交接表的裁定落点
- `packages/skills/README.md` — 成员与依赖、依赖方向图
- `packages/skills/docs/architecture.md` — 模型、端口、服务、失败种类、技术处置的裁定落点
- `packages/skills/docs/key-flows.md` — 组内流程图

### 排除的调用方
- `packages/` 与 `apps/` 中同名的代码标识符 — 本闭包只改文档；停止条件：需要改代码时停下交回
- `.meta_harness/design/ubiquitous_language/` — 由并行闭包 ul2 改；停止条件：需要改词表时停下交回
- `.meta_harness/design/product/skills/design.md` — 链接到组页 Q 小节；小节标题不变所以不改；停止条件：必须改标题时停下交回
- 另一个领域的 docs 与 packages — 由另一位写者并行修改；停止条件：需要改它们时停下交回

## 验收清单
- A1 pnpm run check:docs 与 pnpm run check:design 都退出 0。失败时先在基线上复跑同一命令。
- A2 入向锚点仍在：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/anchors.md 中指向本领域的标题逐个 grep -n -x -F 命中。变异：把一个 Q 小节标题改一个字 → A1 的 check:docs 报断链（验证一次后还原，输出存 /home/user/omne-harness-lite/.worktrees/rev-skills/tmp/rev-skills/）。
- A3 裁定逐条落实：交回里给一张表，每条裁定写落在哪个文件哪一节；不适用的写理由。
- A4 撤除项清零：正文不再出现 ScriptLaunch、ScriptPreparation、prepare 与「采用集合」，命令与结果写进交回。
- A5 已接受 README 只改 F-02 所列内容：git diff d0c755b9b -- docs/domains/skills/README.md 中小节标题行（以 # 开头）没有变化；入向链接经 A1 的 check:docs 仍可达；交回中逐句列出改动及理由（无副作用、对未来的正收益）。
- A6 边界一节存在，并包含四项：知道谁、不知道谁、需求端口（问题、答复、失败）、对外提供；交回中逐项列出。
- A7 点名消费者的说法清零：在本领域写范围内 grep「Skills()」「Context」「Slash」「Tool 准入」「工具目录」「Session」「Agent」「Run」「实现方」，剩余命中逐条说明为什么保留（例如边界一节的「不知道谁」）。
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
独占工作树 /home/user/omne-harness-lite/.worktrees/rev-skills。另一领域由另一位写者并行修复。派发者是唯一合回者。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/rev-skills/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载的技能：asd-ste100。
- 裁定：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r1.md；评审摘要：同目录 review-docs.md、design-review.md；旧说法：同目录 superseded.md；设计来源：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/design/formal-design-v1.1.md

## 当前认知
- 已确认：基线 d0c755b9b 上 check:docs 与 check:design 均 PASS；评审行号以该提交为准。
- 假设：无。
- 未知：无。

## 返回与恢复
交回内联给派发者，按写者共用约定「交回格式」：提交号、每条验收的命令与结果、裁定落点表、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/rev-skills/tmp/rev-skills/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 某条裁定与已接受正文冲突、无法只在本层写成偏离时停下交回。
- 必须改写范围外文件才能通过检查时停下交回。

## 追加记录
- 2026-11-03T10:10Z 负责人视角自审追加：(1) F-13 修正：删去 overview、orderOverview、集合修订号与概览摘要；SkillCatalog 改为 summaries(access, scope, capabilities?) 交出名字、说明、可用性与缺项、替换件原因，加 search；排序、修订号、怎样进入提示词归调用方（修订号可由调用方直接从 SkillResolution 取得）；常驻由装配决定，Skill 不按常驻筛选。(2) F-01 修正：删去「实现方」列与点名消费者只适用于组页 packages/skills/**；领域页 docs/domains/skills/** 保留端口实现方与跨领域交接（docs/member-documentation.md「三处各自拥有的知识」：领域页拥有跨领域协作与组合保证承担者），只删外域内部步骤。
- 2026-11-03T10:14Z 负责人裁定 C-74：工作区来源的材料依据，资产版本可缺省；此时以能力标识、来源层与内容摘要确定材料（内容摘要已钉住字节）。MaterialBasis 的 assetVersion 写成可缺省并说明。
