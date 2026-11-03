# 闭包规格 bnd-skills

## 身份与位置
- 闭包：bnd-skills
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/bnd-skills
- 分支：PanQiWei/skill-mcp-bnd-skills
- 基线：7947acd00e2baa82b0005df371e612c605dbee21
- 清晰度：定

无卡。负责人 2026-11-03 的明确要求见下方「目标边界」。上一层：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按负责人明确要求改设计正文，需守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：负责人明确：Skill 领域不依赖任何工具、不管脚本设施。依赖在不在场、这个 skill 可不可用、脚本有没有设施，全归调用方。据此修订 Skill 组页与领域页：
- 删去需求端口 RequirementFacts、纯函数 evaluateAvailability、失败种类 undecided、组页的 Q-SK08 分支与一切「必需工具或脚本设施缺席」的读取分支。读取只受读取权、解析答复（含已知但不可用：禁用、卸载、失去选入）与材料一致性约束。
- describe 与 summaries 只交依赖声明（必需工具名等），不交可用性判断；「已知但不可用」只来自 SkillResolution 的答复。
- 组页「技术处置」中提到 Q-SK08 的地方改为：负责人已裁定（2026-11-03）读取与工具、脚本设施无关，产品 Q-SK08 随产品页修订关闭。
- 已接受的 docs/domains/skills/README.md：只有当其中写了 Skill 判断依赖可用性的句子时才改那一句（负责人准许：不带副作用、对未来有正收益的修改），标题不改。
不在范围内：产品正文、统一语言、MCP 文件。

### 写范围
- `packages/skills/docs/architecture.md` — 组工程设计，删端口与分支
- `packages/skills/docs/key-flows.md` — 组内流程图中的依赖分支
- `packages/skills/README.md` — 成员与依赖、符合性设施列表
- `docs/domains/skills/architecture.md` — 端口实现方表中的 RequirementFacts 行
- `docs/domains/skills/key-flows.md` — 领域流程中的依赖分支
- `docs/domains/skills/README.md` — 只在含依赖可用性判断时改那一句

### 排除的调用方
- `packages/` 与 `apps/` 中同名的代码标识符 — 本闭包只改文档；停止条件：需要改代码时停下交回
- `.meta_harness/design/product/` — 由并行闭包 prod-skills 改；停止条件：需要改产品页时停下交回
- `.meta_harness/design/ubiquitous_language/` — 本轮不改；停止条件：需要改词表时停下交回

## 验收清单
- A1 pnpm run check:docs 与 pnpm run check:design 退出 0；uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design 退出 0。失败时先在基线上复跑同一命令。
- A2 grep「RequirementFacts」「evaluateAvailability」「undecided」「脚本设施」「必需工具缺席」在 packages/skills 与 docs/domains/skills 无命中（「Q-SK08」只允许出现在指向产品页已决的说明里），命令与结果写进交回。
- A3 产品页入向锚点仍在：tmp/skill-mcp-domain/docs-landing/anchors.md 中 Skill 的 6 个标题逐个 grep -n -x -F 命中。
- 收尾门禁：pnpm run format:check；pnpm run lint:rules；git ls-files --eol 的 w/crlf 只允许基线已有的两个 legacy LICENSE。
- 接受级别 L1。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。

## 实施规格
负责人原则：Skill 领域只交付领域内部与用 Skill 的词表达的对外契约；组页不点名调用方，领域页保留端口实现方与跨领域交接。词表：Skill 包、Skill 包快照、Skill 包来源、Skill 材料依据（已改名，见统一语言索引）。已定裁定见 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r1.md 至 decisions-r4.md（本规格的要求优先）。

### 命名账本
- 端口：PackageLocator、SkillPackageSource、SkillResolution、SkillReadCheck（RequirementFacts 删除）；服务：PackageInspection、SkillCatalog、SkillAccess。

## 性质及证据义务
- 不写不实信息：每处改动后的说法必须与当前组页、领域页一致；交回中列出改动与依据。

## 施工计划
1. 跑 A1 基线并存输出。
2. 加载规格要求的技能，读写范围内现有正文与依据。
3. 逐条改写，跑全部验收与门禁，提交。

## 自主范围与动作授权
允许：写范围内改文件；本地提交。不允许：推送、合并、改写范围外文件、装依赖。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/bnd-skills。另有一位写者并行，写范围互不相交。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/bnd-skills/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载：asd-ste100。

## 当前认知
- 已确认：基线上 A1 三条命令通过。
- 假设：无。未知：无。

## 返回与恢复
内联交回：提交号、每条验收的命令与结果、逐条改动表（位置、原说法、新说法、依据）、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/bnd-skills/tmp/bnd-skills/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 必须改写范围外文件才能通过检查时停下交回。

## 追加记录
