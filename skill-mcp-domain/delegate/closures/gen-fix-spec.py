import sys
dom, base = sys.argv[1], sys.argv[2]
name = f'fix-{dom}'
W = f'/data/qiwei/repos/omne-harness-lite/.worktrees/{name}'
P = '/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain'
title = 'Skill' if dom=='skills' else 'MCP'
dsec = '「共同」D-00–D-02、「Skill」D-10–D-24、G-2 中 Skill 的部分、U-1' if dom=='skills' else '「共同」D-00–D-02、「MCP」D-30–D-41、G-1、G-2 中 MCP 的部分、U-2'
ul = 'terms/grounding-and-isolation.md' if dom=='skills' else 'terms/reach-and-availability.md'
prev = 'skill-docs' if dom=='skills' else 'mcp-docs'
spec = f'''# 闭包规格 {name}

## 身份与位置
- 闭包：{name}
- 卡与修订：#0 r1
- 工作树：{W}
- 分支：PanQiWei/skill-mcp-{name}
- 基线：{base}
- 清晰度：定

修复轮（第 2 轮），新写者接手。原闭包规格：{P}/delegate/closures/{prev}.md。上一层规格：{P}/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按已裁定清单改设计正文，需要守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把派发者对第 1 轮评审的裁定落进 {title} 的领域页与组页，使正文可以作为第一波实施输入。裁定是唯一依据，不重新判断这些选择；只把它们写全、写准、写一致。

必须落实：裁定清单 {P}/docs-landing/reviews/decisions-r1.md 中 {dsec}。逐条对照两份评审摘要找到要改的位置：{P}/docs-landing/reviews/review-docs.md、{P}/docs-landing/reviews/design-review.md；被更正的旧说法见 {P}/docs-landing/reviews/superseded.md（全部 10 行都要在本领域正文里不再出现）。

不在范围内：另一个领域的文件；产品正文；源码；建包；顺手清理与裁定无关的内容。

### 写范围
- `docs/domains/{dom}/README.md` — D-01 还原措辞，只留导航
- `docs/domains/{dom}/architecture.md` — 端口与实现方等裁定落点
- `docs/domains/{dom}/key-flows.md` — 流程图与交接表的裁定落点
- `packages/{dom}/README.md` — 成员与依赖、依赖方向图
- `packages/{dom}/docs/architecture.md` — 模型、端口、服务、失败种类、技术处置的裁定落点
- `packages/{dom}/docs/key-flows.md` — 组内流程图
- `.meta_harness/design/ubiquitous_language/{ul}` — {'U-1 页脚空行' if dom=='skills' else 'U-2 小节位置'}

### 排除的调用方
- `.meta_harness/design/product/{dom}/design.md` — 链接到组页 Q 小节；小节标题不变所以不改；停止条件：必须改标题时停下交回
- 另一个领域的 docs 与 packages — 由另一位写者并行修改；停止条件：需要改它们时停下交回

## 验收清单
- A1 `pnpm run check:docs` 与 `pnpm run check:design` 都退出 0。失败时先在基线上复跑同一命令。
- A2 入向锚点仍在：{P}/docs-landing/anchors.md 中指向本领域的标题逐个 `grep -n -x -F` 命中。变异：把一个 Q 小节标题改一个字 → A1 的 check:docs 报断链（验证一次后还原，输出存 {W}/tmp/{name}/）。
- A3 裁定逐条落实：交回里给一张表，每条裁定写落在哪个文件哪一节；不适用的写理由。
- A4 旧说法清零：对 superseded.md 每行的旧关键词在本领域写范围内 `grep` 无残留（{'`skill-contract`、`ReadEligibility`、「改名在实施波」' if dom=='skills' else '「本会话」、「一步判定」、裸写的「Q04」「Q05」'}），命令与结果写进交回。
- A5 两个已接受 README 相对基线 24e5ba838 的 diff 只含导航改动：`git diff 24e5ba838 -- docs/domains/{dom}/README.md`。
- 收尾门禁：`pnpm run format:check`；`pnpm run lint:rules`；`git ls-files --eol` 的 `w/crlf` 只允许基线已有的两个 legacy LICENSE。
- 接受级别 L1。提交 trailer：`Harness: claude-code`、`Agent-Role: developer`；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。

## 实施规格
位置与唯一源同原闭包规格：领域页只写跨领域交接与端口实现方，组页写成员、模型、端口、服务、失败、流程与技术处置；具名文档目标标「尚非 workspace 成员」。图用 mermaid。英文类型名是候选标识，放代码样式。

### 命名账本
- 以 decisions-r1.md 为准：{'`@omne-harness/skill`（纯契约）、`skill-access`、`skill-cordis-contract`、`skill-host-local`；端口 `PackageSource`（`snapshot(locator)`、`open(locator, digest, path)`）、`SkillResolution`、`SkillReadCheck`、`RequirementFacts`；失败增 `undecided`、`unsupported`' if dom=='skills' else '端口 `UseEligibility`（含 `local-command-not-enabled`）、`ProcessLanding.start(access, launch, env)`、`CredentialUse.acquire(access, endpointHolding, purpose)`；对端账号 `anonymous`；读面失败 `not-available-to-you`'}。

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
独占工作树 {W}。另一领域由另一位写者并行修复。派发者是唯一合回者。

## 方法与知识入口
- 先读：{W}/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载的技能：asd-ste100。
- 裁定：{P}/docs-landing/reviews/decisions-r1.md；评审摘要：同目录 review-docs.md、design-review.md；旧说法：同目录 superseded.md；设计来源：{P}/design/formal-design-v1.1.md

## 当前认知
- 已确认：基线 {base[:9]} 上 check:docs 与 check:design 均 PASS；评审行号以该提交为准。
- 假设：无。
- 未知：无。

## 返回与恢复
交回内联给派发者，按写者共用约定「交回格式」：提交号、每条验收的命令与结果、裁定落点表、未覆盖项。过程输出留 {W}/tmp/{name}/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 某条裁定与已接受正文冲突、无法只在本层写成偏离时停下交回。
- 必须改写范围外文件才能通过检查时停下交回。

## 追加记录
'''
open(f'{P}/delegate/closures/{name}.md','w',encoding='utf-8').write(spec); print(name)
