# 闭包规格 w3-skill-fix

## 身份与位置
- 闭包：w3-skill-fix
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-skill-fix
- 分支：PanQiWei/skill-mcp-w3-skill-fix
- 基线：49e984dd89bba03af74d1aec3e4772df35ae46b6
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，claude-opus-5-5，effort high。理由：GS-06 是读取关口上的越权读出（`security-sensitive` → 顶档、上限 high）；Fable 受用量上限，用 Opus 记一次降级，以 L3 复审补足。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：按应然消弭 Skill 领域已登记的差距，并完成生态兼容的解析放宽。依据是差距账本 `/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/gaps-skills.md` 与性质账本 `packages/skills/skill/verification/README.md`。方向是改实现去符合应然、对错的承诺改承诺并写理由，不把实然抄成应然。

reduce 裁定（Skill 领域负责人）：

1. **GS-06 引用身份一致（新性质 S7）**：对应端口 `resolve` 答 `adopted` 时，`ref.capability` 必须与请求的身份 `sameCapability`；带材料依据时，`ref` 的来源层、资产版本（如有）与内容摘要必须等于依据的；`adopted()` 列出的每项，其 `ref.capability` 必须与该项的 `capability` 相同。不合即「没有作答」（判定端口当作 `unknown`），不交出任何内容。契约「端口答复的统一处置」核对表加这一条；性质账本加 S7「交出的内容只来自所请求身份的材料」，探索器去掉 PR1 前提、加入引用错指的端口答复并核对 S7；`ReadGate.tla` 加错指动作与 S7 不变式，用 TLC 实跑（工具在 /opt/tlaplus，`. /etc/profile.d/tlaplus.sh`）。
2. **GS-02 映射表按理由改**：快照阶段的 `bytes-mismatch` 在 `inspect` 也答 `source-unavailable`（与该行「来源不守端口契约」的理由一致）；`inspect` 的映射按调用点（`snapshot` / `open`）分格。契约映射条款与成员 SPEC 同步；`mapping.spec.ts`、`inspection.spec.ts` 相应改写，改写的每条断言在报告列出理由。
3. **GS-04 不把未知字节当正文**：所钉材料的 `SKILL.md` 没有合法头部时（对检查通过的材料不可达，只在资产摘要不来自检查通过的包时可达），`read` 正文答 `source-unavailable`，不再把整个条目当正文。成员 SPEC 写明理由与可达条件；探索器 S4 的对应断言随之改。
4. **GS-05 中止的前提写明**：成员 SPEC 与契约写明「端口调用会结束」是中止活性的前提，中止的响应时间受端口时间限制；不改实现（与 `signal` 竞争会让迟到答复无主，归 M2 之后与端口拥有者的议题）。
5. **生态兼容放宽**（`waves/w3/wave-pack.md`「生态兼容」与 `compat/README.md`）：说明超长 → 接受，全文保留；name 与包根目录名不同 → 接受，以头部 name 为准（`expectedName` 给出时仍按它拒绝）；`metadata` 不是字符串映射 → 接受，只保留字符串值；严格 YAML 解析失败 → 退到逐行读顶层 `name`、`description`，读得出就接受。每种放宽带兼容提示（检查结果里的一个可选字段，名字写者定，进 SPEC）。真正读不了的仍拒绝。契约的拒绝原因封闭集合若因此少用了某些码，保留码并在 SPEC 写明何时不再产生。社区语料复跑：`/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/skill-compat.mjs` 对六类语料（路径见 `compat/README.md`）加载率 100%。
6. **GS-07 成员导航**：`documentation.json` 的 verification 项、成员 `index.md`、`tests/index.md` 按现状更新。组页（GS-01、GS-03、GS-09）不改，波末写回。

不在范围内：组页与领域页；MCP 成员；新依赖。

### 写范围
- `packages/skills/skill-contract/` — 解析放宽（`src/parse/`）、兼容提示的可选字段、统一处置核对表与映射条款（`SPEC.md`）、测试与套件
- `packages/skills/skill/` — `src/`、`tests/`（含 `tests/model/`）、`verification/`、`SPEC.md`、`README*.md`、`docs/`、`documentation.json`、`index.md`

### 排除的调用方
- `packages/skills/skill-host-local/` — 只读；停止条件：放宽让 host-local 的现有用例变红时停下交回
- `packages/skills/docs/`、`docs/domains/skills/` — 波末写回
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖时停下交回

## 验收清单
1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local` 退出 0；慢层探索器（`tests/model/`）通过。
2. GS-06：引用错指的探针（`/home/user/omne-harness-lite/.worktrees/w3-skill-model/tmp/closures/w3-skill-model/probe/ref-mismatch.mts`）在修复后答 `unknown`、不交内容；探索器去掉 PR1 前提后 S1–S7 违反数为 0；TLC 正控含 S7 无反例，新增负控（不核对引用）报 S7 反例。报告给出 TLC 版本、配置、状态数。
3. GS-02、GS-03 无关、GS-04：对应用例按新映射改写并说明；变异「恢复旧映射」使用例变红。
4. 生态兼容：社区语料六类加载率 100%，报告给出每类的包数与加载数；每种放宽有用例与兼容提示断言；真正读不了的包（缺 `SKILL.md`、头部完全不可读且逐行也读不出 name、路径越界）仍拒绝。
5. 差分变异由 reduce 跑；写者给出每条修复的手工变异与变红证据（还原源码并重建 dist 后）。
6. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`。

## 实施规格
- GS-06 的核对放进边界解析（`answer-values.ts`/`port-answer.ts` 一带），不放在 `gate` 的分支里：边界解析交出的值就已经满足「引用身份一致」，下游不再判断。
- 生态兼容的放宽放在 `skill-contract/src/parse/`；兼容提示是数据，不是日志。
- 命名账本：S7、`ReadGate.tla` 的新动作名、兼容提示字段名，写者定并写进报告。

## 性质及证据义务
- S7 由三类证据守住：TLC（有限范围）、探索器（有限范围）、契约测试；状态按六种分开写。
- 每条放宽都不能削弱 S1–S7：探索器在放宽之后整体复跑。

## 施工计划
1. 先写红：GS-06 探针变成用例；探索器加错指答复；TLA+ 加动作与负控；映射与 GS-04 的新断言；放宽的语料用例。证明变红前先还原源码并重建 dist。
2. 实现：边界解析加引用核对；映射分格；GS-04；解析放宽。
3. 文档：两份 SPEC、性质账本、模型 README、成员导航。
4. 门禁、语料复跑、TLC 复跑、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试、仓库检查、TLC；本地提交。不允许：推送、开 PR、加依赖、改组页。规格不够时在授权内自定并在交回列理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-skill-fix。并行：MCP 线的闭包写 `packages/mcp/*`。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-skill-fix/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 方法：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/structural.md
- 差距账本：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/gaps-skills.md
- 性质账本与模型：`packages/skills/skill/verification/`；探索器 `packages/skills/skill/tests/model/`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：基线上 skill 454 例、skill-contract 420 例通过；TLC 2.19 可用；社区语料 197 包中 191 包可加载。
- 假设：放宽只影响 `inspect` 的拒绝集合，不影响读取关口。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：提交号；每条裁定的落点与用例名；TLC 结果；探索器范围与结果；语料加载率；手工变异；门禁日志；自定裁定；结构性改动清单；未覆盖。

## 已知会受影响的现有用例
- `packages/skills/skill/tests/mapping.spec.ts`、`packages/skills/skill/tests/inspection.spec.ts`：GS-02 改映射，按新承诺改写并逐条说明。
- `packages/skills/skill-contract/tests/` 中断言说明超长、name 不一致、`metadata` 非字符串映射、YAML 失败被拒绝的用例：按放宽改写并逐条说明。

## 停止条件
- 放宽削弱读取关口的任何性质。
- 同一用例连试三种做法仍红。

## 追加记录
