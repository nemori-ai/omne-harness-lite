# 闭包规格 ul2

## 身份与位置
- 闭包：ul2
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/ul2
- 分支：PanQiWei/skill-mcp-ul2
- 基线：d0c755b9b0d341b267ef39fa9c613e3265d2c997
- 清晰度：定

无卡。上一层：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/reviews/decisions-r3.md「统一语言」U-10–U-12。先前统一语言闭包规格：tmp/skill-mcp-domain/delegate/closures/ul.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：词条定义与对账。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：U-10 新增「材料依据 · Material Basis」；U-11 把「MCP 动作清单」词条的键同步为「租户、对端账号与接入点持有」；U-12 判断「定义摘要」是否需要新词，能用「内容摘要」表达就不新增，并写理由。不在范围内：docs/、packages/、产品正文；与本次无关的词条。

### 写范围
- `.meta_harness/design/ubiquitous_language/terms/capabilities-and-composition.md` — 「材料依据」候选所在卷（与 Skill 包、包快照同卷）；技能要求别卷时同目录其他 terms/*.md 也在范围内
- `.meta_harness/design/ubiquitous_language/terms/reach-and-availability.md` — 「MCP 动作清单」词条所在卷
- `.meta_harness/design/ubiquitous_language/index.md` — 新增与修改词条必须同步
- `.meta_harness/design/ubiquitous_language/conflicts.md` — 发现冲突时登记
- `.meta_harness/design/domain_objects/objects.md` — 判为对象时立条目，MCP 动作清单条目同步键
- `.meta_harness/design/views/domain-object-map.md` — 派生文件，对象条目变化后用 domain_objects.py --write 重新生成

### 排除的调用方
- `docs/`、`packages/` — 由并行闭包 rev-skills、rev-mcp 改；停止条件：需要改它们时停下交回
- `.meta_harness/design/product/` — 产品正文不改；停止条件：技能要求改产品时停下交回

## 验收清单
- A1 uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design 退出 0；pnpm run check:docs 与 pnpm run check:design 退出 0。失败时先在基线上复跑同一命令。
- A2 index.md 有「材料依据」一行；「MCP 动作清单」的定义与索引行写「接入点持有」。变异：只写分卷不登记索引时检查器报缺登记（验证一次后补登记，输出存 /home/user/omne-harness-lite/.worktrees/ul2/tmp/ul2/）。
- A3 交回写明 U-12 的判定与理由。
- 收尾门禁：pnpm run format:check；pnpm run lint:rules；git ls-files --eol 的 w/crlf 只允许基线已有的两个 legacy LICENSE。
- 接受级别 L1。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。

## 实施规格
规则归 ubiquitous_language/AGENTS.md、conventions.md 与 ubiquitous-language 技能；对象归 domain_objects/AGENTS.md 与 domain-objects 技能。「材料依据」定义要点：调用方手里一份已读 Skill 材料的版本凭据，含能力标识、资产版本与内容摘要；不含包定位；不是「采用依据」（UL-adoption-basis），也不授予读取资格。出处按技能规则写明；没有产品原文时照「包快照」的先例写明缺口。

### 命名账本
- 材料依据 · Material Basis

## 性质及证据义务
- 一个概念一个词：与采用依据、包快照、能力标识、资产版本不重名不同义。
- 词表只写「是什么」。

## 施工计划
1. 跑 A1 基线并存输出；做 A2 变异确认会红。
2. 加载 asd-ste100 与 ubiquitous-language；需要时加 domain-objects。
3. 写词条、同步索引与对象条目、重新生成地图。
4. 跑全部验收与门禁，提交。

## 自主范围与动作授权
允许：写范围内改文件；本地提交。不允许：推送、合并、改写范围外文件、装依赖。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/ul2。另有两位写者并行改 docs 与 packages。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/ul2/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载：asd-ste100、ubiquitous-language；有对象时 domain-objects。

## 当前认知
- 已确认：基线上对账器与 check:docs、check:design 均通过；「采用依据」已有词条 UL-adoption-basis。
- 假设：无。未知：无。

## 返回与恢复
内联交回：提交号、每条验收的命令与结果、U-10–U-12 的处置与理由、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/ul2/tmp/ul2/。

## 已知会受影响的现有用例
无代码用例。

## 停止条件
- 同一检查器失败连试三种做法仍不过时停下交回。
- 判定必须改产品正文或已有词条的定义才能成立时停下交回（U-11 的同步不算）。

## 追加记录
