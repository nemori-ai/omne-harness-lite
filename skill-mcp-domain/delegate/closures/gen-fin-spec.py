import sys
dom, base = sys.argv[1], sys.argv[2]
name = f'fin-{dom}'
W = f'/data/qiwei/repos/omne-harness-lite/.worktrees/{name}'
P = '/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain'
title = 'Skill' if dom=='skills' else 'MCP'
dsec = '「Skill」G-10–G-19' if dom=='skills' else '「MCP」H-10–H-15'
legacy = 'packages.0.0.1.legacy/core/skill-package/' if dom=='skills' else 'packages.0.0.1.legacy/core/mcp-endpoint/ 与 .meta_harness/design/architecture/mcp-bridge/'
prev = 'rev-skills' if dom=='skills' else 'rev-mcp'
spec = f'''# 闭包规格 {name}

## 身份与位置
- 闭包：{name}
- 卡与修订：#0 r1
- 工作树：{W}
- 分支：PanQiWei/skill-mcp-{name}
- 基线：{base}
- 清晰度：定

最终复审之后的收尾轮，新写者接手。上一轮修复规格：{P}/delegate/closures/{prev}.md。原闭包规格：{P}/delegate/closures/{prev}.md。上一层规格：{P}/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按已裁定清单改设计正文，需要守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把派发者对第 1 轮评审的裁定落进 {title} 的领域页与组页，使正文可以作为第一波实施输入。裁定是唯一依据，不重新判断这些选择；只把它们写全、写准、写一致。

必须落实：裁定清单 {P}/docs-landing/reviews/decisions-r4.md 中 {dsec}。最终复审摘要：{P}/docs-landing/reviews/final-review.md（文件:行以 d5ce9ae1a 为准）。r1–r3 裁定已落盘，除本清单明确改动的以外保持不变；负责人原则不变：组页只写本领域内部与对外契约，领域页保留端口实现方与跨领域交接。自查条目要读的已接受源：docs/rfcs/RFC-0001-technical-foundations.md、docs/architecture/technical-foundations.md；旧材料（只作参考，与现行架构冲突的不采用）：{legacy}。

不在范围内：另一个领域的文件；产品正文；源码；建包；顺手清理与裁定无关的内容。

### 写范围
- `docs/domains/{dom}/README.md` — D-01 还原措辞，只留导航
- `docs/domains/{dom}/architecture.md` — 端口与实现方等裁定落点
- `docs/domains/{dom}/key-flows.md` — 流程图与交接表的裁定落点
- `packages/{dom}/README.md` — 成员与依赖、依赖方向图
- `packages/{dom}/docs/architecture.md` — 模型、端口、服务、失败种类、技术处置的裁定落点
- `packages/{dom}/docs/key-flows.md` — 组内流程图

### 排除的调用方
- `.meta_harness/design/product/{dom}/design.md` — 链接到组页 Q 小节；小节标题不变所以不改；停止条件：必须改标题时停下交回
- 另一个领域的 docs 与 packages — 由另一位写者并行修改；停止条件：需要改它们时停下交回

## 验收清单
- A1 `pnpm run check:docs` 与 `pnpm run check:design` 都退出 0。失败时先在基线上复跑同一命令。
- A2 入向锚点仍在：{P}/docs-landing/anchors.md 中指向本领域的标题逐个 `grep -n -x -F` 命中。变异：把一个 Q 小节标题改一个字 → A1 的 check:docs 报断链（验证一次后还原，输出存 {W}/tmp/{name}/）。
- A3 裁定逐条落实：交回里给一张表，每条裁定写落在哪个文件哪一节；不适用的写理由。
- A4 撤除项清零：{'正文不再出现 ScriptLaunch 与「采用集合」；prepare 不收 SkillRef' if dom=='skills' else '正文不再出现 mcp-tool-bridge、projectAction、ActionProjection'}，命令与结果写进交回。
- A5 已接受 README 相对 24e5ba838 的 diff 不增加：`git diff 24e5ba838 -- docs/domains/{dom}/README.md` 与基线 {base[:9]} 上的同一输出相同。
- A6 边界一节存在，并包含四项：知道谁、不知道谁、需求端口（问题、答复、失败）、对外提供；交回中逐项列出。
- A7 点名消费者的说法清零：在本领域写范围内 grep「Skills()」「Context」「Slash」「Tool 准入」「工具目录」「Session」「Agent」「Run」「实现方」，剩余命中逐条说明为什么保留（例如边界一节的「不知道谁」）。
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
