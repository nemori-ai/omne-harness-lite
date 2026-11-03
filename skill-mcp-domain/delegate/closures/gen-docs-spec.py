import sys
dom, base = sys.argv[1], sys.argv[2]   # dom: skills|mcp
name = 'skill-docs' if dom=='skills' else 'mcp-docs'
W = f'/home/user/omne-harness-lite/.worktrees/{name}'
P = '/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain'
title = 'Skill' if dom=='skills' else 'MCP'
sec = '第四节（4.1–4.7）' if dom=='skills' else '第五节（5.1–5.5）'
qs = 'Q-SK02、Q-SK03、Q-SK04、Q-SK05、Q-SK06' if dom=='skills' else 'Q-MC02、Q-MC03、Q-MC04、Q-MC05、Q-MC06'
extra_skill = '''- DRB 消费需求（{P}/drb-skill-requirements.md）SK-D01–SK-D07 在组页有对应的服务含义、失败种类与交接边界（设计第十节）；P1 与「第一波后仍未支持」写成剩余义务与拥有者。
- Q-SK08 保持「待产品负责人裁定」，组页与 key-flows 写明定案前该分支返回 `undecided`，不选默认。'''.format(P=P)
extra_mcp = '''- 写明：MCP 凭据走专用端口、不复用 Tool 的 `ToolCredentials`（tool-contract SPEC 第 1334 行的回退顺序与 MCP 不回退冲突）；动作接入 Tool 需要 Catalog 的「桥接来源」，键不含资产版本，要走新 RFC（tool-contract SPEC 第 508、1316 行，RFC-0012 第 70、201、245 行）；不自动重发，记为对协议该条的偏离；resources、prompts 先不桥接。
- 写明协议基线 2026-07-28 与对更早修订的兼容；HTTP 无会话后「连接代际」与状态的含义按传输分别定义。'''
extra = extra_skill if dom=='skills' else extra_mcp
spec = f'''# 闭包规格 {name}

## 身份与位置
- 闭包：{name}
- 卡与修订：#0 r1
- 工作树：{W}
- 分支：PanQiWei/skill-mcp-{name}
- 基线：{base}
- 清晰度：界

无卡。负责人 PanQiWei 在会话中授权本会话为 Skill 与 MCP 的领域负责人。上一层规格：{P}/docs-landing/spec.md（切片 {'03' if dom=='skills' else '04'}）。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：跨领域页与组页的设计正文，要守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把 {title} 领域已形成的设计落进两层拥有者正文。领域页（docs/domains/{dom}）只写跨领域交接与端口拥有者；组页（packages/{dom}）写成员分解、模型、端口、服务、失败种类、组内流程与技术处置。产品正文不改。

设计来源（候选，不是权威，落盘后以仓库正文为准）：{P}/design/formal-design-v1.1.md 的第二节（守则）、第三节（词）、{sec}、第六至九节{'、第十节（DRB）' if dom=='skills' else ''}。统一语言新词已由闭包 ul 合入基线，正文用词以词表为准。

必须做到：
- 组页 README「成员与依赖」写四个具名文档目标（纯契约、通用实现、Cordis 契约、本地宿主）及职责、允许依赖，并标明「尚非 workspace 成员」；保留现有真实成员的实际状态。
- 组页 docs/architecture.md：{qs} 的小节标题逐字不变，内容改为「技术处置」（已定决定、依据层、剩余义务与拥有者）；「完整行为候选的正式承接缺口」这一小节标题逐字不变，内容改为成员承接表。入向锚点清单见 {P}/docs-landing/anchors.md。
- 领域页 architecture.md、key-flows.md 是技术草案，补入新端口的拥有者与交接；README 已接受，只改必要导航。
- 所有新内容标为候选或技术草案，不写成已接受、已实现或已验证。
{extra}

不在范围内：产品正文、统一语言、源码、建包、constraints.json、应用插件树、RFC、另一个领域的文件；不顺手清理写范围外的内容。

### 写范围
- `docs/domains/{dom}/architecture.md` — 领域交接设计，产品页与组页链接到它
- `docs/domains/{dom}/key-flows.md` — 跨领域关键流程
- `docs/domains/{dom}/README.md` — 只改导航；被领域入口与产品页引用
- `packages/{dom}/README.md` — 组入口，产品页「技术承接」链接到它
- `packages/{dom}/docs/architecture.md` — 组工程设计，产品页 {qs} 链接到它的小节
- `packages/{dom}/docs/key-flows.md` — 组内流程
- `packages/{dom}/documentation.json` — 只在新增文档文件时登记

### 排除的调用方
- `.meta_harness/design/product/{dom}/design.md` — 链接到组页小节；小节标题不变所以不改；停止条件：必须改标题时停下交回
- `.meta_harness/design/architecture/mcp-bridge/` — 旧材料链接到「完整行为候选的正式承接缺口」；标题不变所以不改；停止条件：同上
- `packages/skills/skill/` — 现有成员的 README 与 SPEC 不改；改名属于实施波；停止条件：组页必须依赖成员文档改动才能成立时停下交回

## 验收清单
- A1 `pnpm run check:docs` 退出 0。失败时先在基线上复跑同一命令。
- A2 入向锚点：anchors.md 中指向本领域的每个锚点在改后文件里仍有同名标题。命令：对每个锚点在目标文件 `grep -n` 对应标题。变异：把 {qs.split('、')[0]} 小节标题改一个字 → A1 报断链（验证一次后还原，输出存进 {W}/tmp/{name}/）。
- A3 组页 README 有四个具名文档目标，每个都标「尚非 workspace 成员」。命令：`grep -n "尚非 workspace 成员" packages/{dom}/README.md`。
- A4 正文只使用词表里已有的词；新出现的术语若词表没有，交回里列出。
- A5 每条新写的决定都带依据层（产品、领域、架构、成员规格或官方规格的具体位置）。
- 收尾门禁：`pnpm run format:check`；`git ls-files --eol` 不含 `w/crlf`；`pnpm run lint:oxlint`。
- 接受级别 L1。提交 trailer：`Harness: claude-code`、`Agent-Role: developer`。

## 实施规格
位置与唯一源：`docs/member-documentation.md`「三处各自拥有的知识」「能力组文档要求」；`docs/engineering/documentation.md`「位置与唯一源」。组根不放统一成员 SPEC；具名文档目标须标明尚非 workspace 成员。领域页不写成员细节；组页不重写领域交接。

### 命名账本
- {'成员候选：skill-contract（由现有 @omne-harness/skill 改名，改名在实施波）、skill、skill-cordis-contract、skill-host-local。端口：PackageSource、SkillResolution、ReadEligibility、RequirementFacts。服务：PackageInspection、SkillCatalog、SkillAccess（describe、read、list）、ScriptPreparation。失败：not-available-to-you、unavailable-stand-in、bad-path、outside-package、resource-missing、basis-unavailable、version-changed、source-unavailable、unsupported、unknown，Q-SK08 分支 undecided。' if dom=='skills' else '成员候选：mcp-contract、mcp、mcp-cordis-contract、mcp-host-local。聚合：Connection、ActionCatalog；实体 KnownAction。端口：McpTransport、CredentialUse、ProcessLanding、AdoptionView、UseEligibility。服务：EndpointInspection、Connections、ActionDiscovery、ActionInvoker、EndpointStatus。结果：complete、toolError、inputRequired、task、protocolError、unknown。'}
- 词表里的中文名优先；英文类型名作为候选标识写在代码样式里。\n- 词表已落的新词（以基线词表为准）：Skill 包、包快照、包来源、MCP 连接、MCP 动作清单、MCP 已知动作；「Skill 取用」不新增，沿用领域页「方法与资源取用」。另见 conflicts.md 的 C-73：digest 写「内容摘要」，不写裸「摘要」。

## 性质及证据义务
- 上层约束下层：不与已接受的领域 README、资产 SPEC「类别提供方」、assembly-and-change、tool-contract 冲突；发现冲突写进交回，不在正文里静默改掉。
- 一个事实一个家：同一决定只在一处写全文，其他位置链接。

## 施工计划
1. 先跑 A1 与 A2 的基线，存输出；做一次 A2 的变异，确认会红，存输出，还原。
2. 加载 asd-ste100，读设计来源与写范围内现有正文。
3. 先写组页 docs/architecture.md，再写组 README 与 key-flows，最后写领域页两份。
4. 跑全部验收与门禁，提交。

## 自主范围与动作授权
允许：在写范围内改文件；本地提交到本分支。不允许：推送、合并、改写范围外文件、装依赖。

## 工作树与协调
独占工作树 {W}。另一个领域由另一位写者并行处理，你不读也不改它的文件。派发者是唯一合回者。

## 方法与知识入口
- 先读：{W}/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载的技能：asd-ste100。
- 上层规格：{P}/docs-landing/spec.md；设计来源：{P}/design/formal-design-v1.1.md；锚点清单：{P}/docs-landing/anchors.md
- 研发品味：{W}/.meta_harness/agents/roles/engineering-taste.md；模型边界：{W}/docs/architecture/layers-and-dependencies.md「领域语义依赖与模型边界」

## 当前认知
- 已确认：领域 README 已接受；组页与领域 architecture/key-flows 是草案；产品页 {qs} 链接到组页小节。
- 假设：新词已在词表（闭包 ul 已合入基线）。
- 未知：无。

## 返回与恢复
交回内联给派发者，按写者共用约定「交回格式」：提交号、每条验收的命令与结果、发现的上下层冲突、未覆盖项。过程输出留 {W}/tmp/{name}/。

## 已知会受影响的现有用例
无代码用例。文档检查可能因链接变化失败，按 A1、A2 处理。

## 停止条件
- 必须改写范围外文件（含产品页、另一领域）才能通过检查时停下交回。
- 发现设计来源与已接受正文冲突且无法只在本层消解时停下交回。

## 追加记录
'''
open(f'{P}/delegate/closures/{name}.md','w',encoding='utf-8').write(spec)
print(name)
