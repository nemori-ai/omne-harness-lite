# 闭包规格 ul

## 身份与位置
- 闭包：ul
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/ul
- 分支：PanQiWei/skill-mcp-ul
- 基线：24e5ba8384f8d6d360cd0c48f6be63f4a052b2ef
- 清晰度：界

无卡。负责人 PanQiWei 在会话中授权本会话为 Skill 与 MCP 的领域负责人。上一层规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md（切片 01）。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。理由：设计正文，需要判断词条形态与对象归属；不涉及代码。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：在统一语言里新增 Skill 与 MCP 两个领域落盘所需的词条，让后续正文可以用这些词。判为「对象」的同步立领域对象条目。

候选词（形态、是否新增、最终中英文名由你按 ubiquitous-language 技能判定，可以合并、改名或判为不需新增，但要写理由）：
- Skill 包（Skill Package）：一份 skill 资产版本的完整内容，以 SKILL.md 为根的目录树。
- 包快照（Package Snapshot）：一个 Skill 包的不可变条目清单，带内容摘要；采用依据记它的摘要。
- 包来源（Package Source）：按摘要交出包字节的提供者，例如云端内容存储、本地目录。不是资产层。
- MCP 连接（MCP Connection）：某租户、某凭据账号与某接入点对端之间可用的一次绑定；stdio 下是一个子进程，Streamable HTTP 下是一组协商结果。注意与已有的「连接件 UL-connector」区分，必要时改名避免混淆。
- 动作清单（Action Catalog）：按租户与凭据账号保存的、某接入点最近合法取得的动作集合。
- 已知动作（Known Action）：曾经合法发现过、对端现在可能不再提供但身份仍保留的动作。
- 「Skill 取用」：先查领域页已有说法「方法与资源取用」，能沿用就不新增词条。

内容来源（候选设计，不是权威）：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md 的「已定事项」，以及正式设计页 https://claude.ai/artifact/W8urtpd8YbzgiXFEmiQMxN 第三节（如果你读不到这个链接，只用 spec.md 与仓库正文）。出处字段指向仓库里已有的产品或领域正文；新词没有产品出处时，按技能规则写明出处状态，不编造。

不在范围内：任何 docs/、packages/、产品正文的修改；顺手清理不相关词条。

### 写范围
- `.meta_harness/design/ubiquitous_language/terms/capabilities-and-composition.md` — 新词条的所在卷（UL-skill、UL-mcp 在此卷）；如技能规则要求放在别的卷，同目录下其他 terms/*.md 也在写范围内
- `.meta_harness/design/ubiquitous_language/index.md` — 词条索引，新增词条必须登记
- `.meta_harness/design/ubiquitous_language/conflicts.md` — 发现说法冲突时登记
- `.meta_harness/design/domain_objects/objects.md` — 判为「对象」的词条必须在此立条目
- `.meta_harness/design/domain_objects/pending.md` — 像对象却无人定义的登记

### 排除的调用方
- `docs/`、`packages/` — 后续闭包使用这些词；停止条件：需要改它们才能让检查通过时停下交回
- `.meta_harness/design/product/` — 产品正文本次不改；停止条件：技能要求同步改产品 rev 时停下交回

## 验收清单
- A1 词表索引含上述新词，或对每个不新增的候选写明理由（写在交回里）。命令：`grep -n "Skill 包\|包快照\|包来源\|动作清单\|已知动作" .meta_harness/design/ubiquitous_language/index.md`。预期：每个新增词一行。变异：删掉 index.md 中一行 → A3 的检查器报缺登记（如检查器不查这一项，在交回里写明）。
- A2 判为「对象」的词在 domain_objects/objects.md 有条目，判为非对象的写明形态。
- A3 统一语言与领域对象的检查器（命令由 ubiquitous-language、domain-objects 技能给出）退出 0。失败时先在基线上复跑同一命令，判断是否既有失败。
- A4 `pnpm run check:docs` 退出 0。
- 收尾门禁：`pnpm run format:check`；`git ls-files --eol` 不含 `w/crlf`；`pnpm run lint:oxlint`（无代码改动，预期不受影响）。
- 接受级别 L1。提交 trailer：`Harness: claude-code`、`Agent-Role: developer`。

## 实施规格
统一语言的规则与格式归 `.meta_harness/design/ubiquitous_language/AGENTS.md`、README 与 conventions.md，以及 ubiquitous-language 技能；领域对象归 `.meta_harness/design/domain_objects/AGENTS.md` 与 domain-objects 技能。中英文定义要无歧义；「为什么」不写进词表。

### 命名账本
- 英文名候选：Skill Package、Package Snapshot、Package Source、MCP Connection、Action Catalog、Known Action。最终以技能判定为准。

## 性质及证据义务
- 一个概念一个词：新词不得与已有词条重名或同义（尤其 UL-connector、UL-mcp、UL-skill、能力身份、资产版本）。
- 词表只写「是什么」，不写设计理由。

## 施工计划
1. 先跑一次 A3 的检查器与 `pnpm run check:docs`，把基线输出存进 `/home/user/omne-harness-lite/.worktrees/ul/tmp/ul/`（会红的用例：写入一个未登记的新词条后检查器应报错，验证一次后再补登记，输出也存下）。
2. 加载 ubiquitous-language 技能，逐个候选查重、判形态、写定义。
3. 判为对象的加载 domain-objects 技能立条目。
4. 跑 A1–A4 与收尾门禁，提交。

## 自主范围与动作授权
允许：在写范围内改文件；本地提交到本分支。不允许：推送、合并、改写范围外文件、装依赖。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/ul。派发者是唯一合回者。不与其他写者共享文件。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/ul/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 必须加载的技能：asd-ste100、ubiquitous-language；有对象时加 domain-objects。
- 上层规格：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md

## 当前认知
- 已确认：UL-skill、UL-mcp、UL-connection-target、UL-mcp-credential、UL-connector 已存在，见 capabilities-and-composition.md 与 index.md。
- 假设：「Skill 取用」可沿用领域页说法，不新增。
- 未知：检查器的确切命令（从技能取）。

## 返回与恢复
交回内联给派发者，格式按写者共用约定「交回格式」：提交号、每条验收的命令与结果、每个候选词的处置与理由、未覆盖项。过程输出留在 /home/user/omne-harness-lite/.worktrees/ul/tmp/ul/。

## 已知会受影响的现有用例
无代码用例。检查器可能因新增对象条目而要求对账字段，按技能处理。

## 停止条件
- 同一检查器失败连试三种做法仍不过，停下交回。
- 判定某个候选必须改产品正文或已有词条定义才能成立时，停下交回。

## 追加记录
- 2026-11-03T08:55Z 规格缺口（派生地图漏列写范围）：派发者在本分支重新生成 views/domain-object-map.md 并提交，对账器 PASS。
