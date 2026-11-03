# 闭包规格 prod-skills

## 身份与位置
- 闭包：prod-skills
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/prod-skills
- 分支：PanQiWei/skill-mcp-prod-skills
- 基线：7947acd00e2baa82b0005df371e612c605dbee21
- 清晰度：定

无卡。负责人 2026-11-03 的明确要求见下方「目标边界」。上一层：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：按负责人明确要求改设计正文，需守上下层一致；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：负责人要求把 Skill 产品页的措辞统一到当前边界，不遗留已移除的东西与不实信息。用 product-design 技能改写 .meta_harness/design/product/skills/design.md（必要时 README.md），并清理 .meta_harness/design/product/meta-capabilities/design.md 中引用 Q-SK08 的三处（约第 103、462、515 行）。要点：
- Q-SK08 关闭：负责人 2026-11-03 裁定 Skill 不依赖工具、不管脚本设施；读取正文只受读取权与选入状态约束，与依赖或脚本设施是否在场无关。J-SK02、J-SK03、J-SK06 与 CAP-SK04、CAP-SK05 中相关句子同步。
- 可用性：依赖在不在场、skill 可不可用由集成方求值；Skill 只交依赖声明。
- J-SK04 设置：Skill 只交设置声明，设置值由设置拥有者求值、由调用方交付；删去「求值结果随正文返回」一类说法。
- J-SK05、J-SK08 与 CAP-SK08、CAP-SK09、CAP-SK10：脚本执行、控制与结果由调用方经工具与执行环境承担；Skill 只交脚本声明与 Skill 包字节。删去「Skill 桥接」「脚本桥接」说法，Q-SK04 的标题不改（产品页与组页的入向锚点都依赖它），正文改为当前分工。
- Q-SK06 dummy 记录归工具与会话治理，Skill 只保留不可用原因。
- 不写组页没有的承诺；技术事实以组页 packages/skills/docs/architecture.md 与领域页为准。
- 产品页升 rev 后，按 ubiquitous-language 与 domain-objects 技能，逐条复核对账器点名的、引用 skills 产品页的词条出处与对象依据，成立再改 rev；不复核就改 rev 等于关掉对账。
不在范围内：组页、领域页、MCP 产品页、技术决定的新增。

### 写范围
- `.meta_harness/design/product/skills/design.md` — Skill 产品正文
- `.meta_harness/design/product/skills/README.md` — 产品 topic 入口，rev 与状态
- `.meta_harness/design/product/meta-capabilities/design.md` — 只改引用 Q-SK08 的三处
- `.meta_harness/design/ubiquitous_language/terms/capabilities-and-composition.md` — 升 rev 后复核点名词条的出处
- `.meta_harness/design/ubiquitous_language/terms/grounding-and-isolation.md` — 同上
- `.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md` — 同上
- `.meta_harness/design/ubiquitous_language/index.md` — 如需同步
- `.meta_harness/design/domain_objects/objects.md` — 升 rev 后复核点名对象的依据
- `.meta_harness/design/views/domain-object-map.md` — 派生文件，必要时重新生成

### 排除的调用方
- `packages/` 与 `apps/` 中同名的代码标识符 — 本闭包只改文档；停止条件：需要改代码时停下交回
- `packages/`、`docs/` — 由并行闭包 bnd-skills 改或本轮不改；停止条件：需要改它们时停下交回
- 统一语言其他卷 — 只在对账器点名时复核；停止条件：需要改定义含义时停下交回

## 验收清单
- A1 pnpm run check:docs 与 pnpm run check:design 退出 0；uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design 退出 0。失败时先在基线上复跑同一命令。
- A2 grep「Q-SK08」在 product/skills 与 meta-capabilities 中只剩「已关闭」说明或无命中；grep「脚本桥接」「桥接」「随正文返回」在 product/skills 中无命中；命令与结果写进交回。
- A3 Q-SK02 至 Q-SK07 标题不变（组页与领域页链接依赖它们）；产品页指向组页的链接经 check:docs 可达。
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
独占工作树 /home/user/omne-harness-lite/.worktrees/prod-skills。另有一位写者并行，写范围互不相交。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/prod-skills/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载：asd-ste100、product-design；升 rev 后按需加载 ubiquitous-language、domain-objects。

## 当前认知
- 已确认：基线上 A1 三条命令通过。
- 假设：无。未知：无。

## 返回与恢复
内联交回：提交号、每条验收的命令与结果、逐条改动表（位置、原说法、新说法、依据）、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/prod-skills/tmp/prod-skills/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 必须改写范围外文件才能通过检查时停下交回。

## 追加记录
