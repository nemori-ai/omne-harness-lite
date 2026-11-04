# 闭包规格 w3-skill-model

## 身份与位置
- 闭包：w3-skill-model
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-skill-model
- 分支：PanQiWei/skill-mcp-w3-skill-model
- 基线：e0b68a7c3af0e330ac027d6567e729201d0ba24a
- 清晰度：定

## 模型与推理强度
developer，implementation_kind verification（加载 verification-facility），claude-opus-5-5，effort high。理由：信息流性质（无披露）的自组合建模与有界穷举；单一领域、已有实现，不是并发生命周期。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：把 Skill 领域的关键性质写成定理，并用模型与对真实实现的有界穷举守住，替代「逐条用例」式的保证。产出四样东西：

1. **性质账本**：至少包括
   - S1 无披露（非干涉）：对任一主体，两个只在「该主体无权读取的身份」上不同的世界（身份存在且被拒 / 不存在），`describe`、`read`、`list`、`export`、`summaries`、`search` 的答复深度相等。
   - S2 整次 unknown：任一相关端口答复无法判定（`unknown`、畸形、拒绝、同步抛出）时，操作答 `unknown`（或映射表规定的来源失败），从不答一个看起来完整的结果。
   - S3 不拼版本：带材料依据的读取，交出的每一页都来自该依据固定的那份材料；材料变了答 `version-changed` 或 `basis-unavailable`，不交部分内容。
   - S4 范围正确：字节范围的实际起止在 UTF-8 字符边界上，页不超过 `PAGE_LIMIT`，`complete` 当且仅当实际终点不小于总长；正文起点规则。
   - S5 次序无关：目录结果不随读取判定的完成次序变化。
   - S6 中止不交部分：`signal` 触发后不再调用端口、不交部分内容。
2. **TLA+ 模型**：`packages/skills/skill/verification/models/ReadGate.tla`（或分成两份），用自组合表达 S1（同一调度在两个世界上运行，比较可观察输出），S2、S3 写成不变式。本环境没有 TLC，状态如实记为「已声明但未执行」，写明运行命令与预期范围。
3. **对真实实现的有界穷举探索器**：`packages/skills/skill/tests/model/`（新建）。在小世界上（例如 2 个主体、3 个身份、每个身份 2 份材料、端口答复取自封闭集合加畸形/拒绝/同步抛出）枚举全部组合，驱动**真实**的 `createSkillAccess`、`createSkillCatalog`、`createPackageInspection`，核对 S1–S6。S1 用自组合：对每个世界与它的「隐藏身份被删除」的孪生世界，比较答复。探索范围、组合数、耗时写进报告。
4. **差距账本初稿**：`tmp/closures/w3-skill-model/gaps-skills.md`（不进仓库）：应然（组页 `packages/skills/docs/architecture.md`「应用服务」「检查与发现」「读取」、`skill-contract` SPEC、`skill` SPEC）逐条对照实然（e0b68a7c3 源码），每条写差距与建议处置。特别核对：W2 写回是否把实然抄成了应然（例如组页的读取步骤次序、映射表）。

形状与决定：
- 找到的反例写成最小复现，**不修产品代码**；探索器把已知反例标为预期失败并在报告列出，其余必须通过。
- 不改 `src/`，不改契约。

不在范围内：修复；`w3-skill-compat` 的解析放宽；组页。

### 写范围
- `packages/skills/skill/verification/`（新建） — TLA+ 模型、配置与 README（动作映射、运行命令、证据状态）
- `packages/skills/skill/tests/model/`（新建） — 世界生成、自组合比较、性质核对与有界穷举
- `packages/skills/skill/SPEC.md` — 只加一节「性质与证据」
- `packages/skills/skill/README.md` — 验证一段加一句指向 verification/
- `packages/skills/skill/README_ZH.md` — 同上

### 排除的调用方
- `packages/skills/skill/src/`、`packages/skills/skill-contract/`、`packages/skills/skill-host-local/` — 只读；停止条件：探索器需要产品代码暴露新入口时停下交回
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖时停下交回

## 验收清单
1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill` 退出 0（已知反例以预期失败存在）。
2. 性质账本 S1–S6 每条有定理陈述、前提、证据类型与状态；SPEC 新节与之一致。
3. TLA+ 模型、`.cfg`、运行命令与预期范围齐全；未执行如实写。
4. 探索器：报告给出范围、组合数、耗时；每条性质的核对点；找到的反例（如有）的最小复现。
5. 探索器能变红：至少 3 个手工变异（例如 `gate` 对被拒身份答 `basis-unavailable` 而不是 `not-available-to-you`；目录把 `unknown` 压成空；读取不核依据摘要）各被探索器抓住，报告列「变异 → 反例」。证明变红前先还原源码并重建 dist。
6. 差距账本初稿覆盖组页三节与两份 SPEC 的承诺。
7. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`。

## 实施规格
- 先读 `docs/verification.md` 三节（证据、六种状态、证据义务）与一个先例模型的 README。
- 世界用 `skill-contract/testing` 的三个内存替身构造；畸形答复用手写端口包装。
- 命名账本：`ReadGate.tla`、`explore`、`twinWorld`（名可调，写进报告）。

## 性质及证据义务
- 有界范围通过不写成无条件证明；未执行就写未执行；模型、探索器与实现的映射写明。

## 施工计划
1. 读输入；写性质账本与 TLA+ 模型。
2. 写世界生成与探索器；跑出结果。
3. 变异证明。
4. SPEC 新节、verification/README、差距账本初稿；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：改产品源码、推送、开 PR、加依赖、下载或执行外部代码。规格不够时在授权内自定并在交回列理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-skill-model。并行：`w3-mcp-lifecycle-model` 写 MCP 成员。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-skill-model/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 结构性处置的来由：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/structural.md
- 评审历史：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/skill-catalog-r1.md、/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/reviews/skill-r1.md
- 应然：组页 `packages/skills/docs/architecture.md`；`packages/skills/skill-contract/SPEC.md`；`packages/skills/skill/SPEC.md`。
- 必须加载：verification-facility；ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：e0b68a7c3 上 skill 448 例、skill-contract 420 例通过；无披露与整次 unknown 已有探针与套件证据（有限样本）。
- 假设：真实实现在内存替身下是确定性的。
- 未知：有界穷举的可行规模；先小后大，报告实测。

## 返回与恢复
内联交回：提交号；性质账本；模型与探索器映射；范围、组合数、耗时；反例；变异证明；门禁日志；未覆盖。过程输出留工作树 `tmp/closures/w3-skill-model/`。

## 已知会受影响的现有用例
- 无（只新增测试目录）。

## 停止条件
- 探索器必须改产品代码才能驱动。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-04T11:15Z 负责人授权安装形式工具链：/opt/tlaplus/tla2tools.jar（v1.7.4，sha256 936a2620…，TLC 2.19）、/opt/alloy/alloy-6.2.0.jar（sha256 6b8c1cb5…），`pnpm run check:formal-tools` 通过；包装脚本 /usr/local/bin/{tlc,tla2sany,alloy}，环境变量在 /etc/profile.d/tlaplus.sh（非登录 shell 先 `. /etc/profile.d/tlaplus.sh`）。模型必须实际用 TLC 检查，记录工具版本、配置、探索范围（状态数、深度）与结论；不再记「已声明但未执行」。
