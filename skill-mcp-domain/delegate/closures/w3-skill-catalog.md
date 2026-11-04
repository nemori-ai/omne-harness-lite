# 闭包规格 w3-skill-catalog

## 身份与位置
- 闭包：w3-skill-catalog
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-skill-catalog
- 分支：PanQiWei/skill-mcp-w3-skill-catalog
- 基线：05f281394c9179ecb9427fb1d5b97cc2f808a789
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：无披露与整次 `unknown`（策略 `security-sensitive` → 顶档、上限 high）；单一服务、规则已定，不是 hardest。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：实现 `SkillCatalog`（`summaries`、`search`），把 W2 带回的 Skill 契约可加调整写回 `skill-contract`，统一端口畸形答复的处置，并加一个用真实目录跑通检查、目录与读取的示例。按 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/plan.md 的切片 01→03 顺序做。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/spec.md「已定事项」1–13 为准，逐条照做，不重新裁定。
- `skill-contract` 只做可加改动。
- Skill 领域不依赖任何工具、不管脚本设施；示例只用三个 Skill 成员与 `./testing` 替身。

不在范围内：MCP 成员；内容存储来源；`SkillCatalog` 的 `signal`、排序打分、常驻与可用性；组页；新依赖。

### 写范围
- `packages/skills/skill-contract/` — 可加改动：`src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`
- `packages/skills/skill/` — `src/`、`tests/`、`SPEC.md`、`README.md`、`README_ZH.md`、`documentation.json`、`acceptance/`、`examples/`
- `packages/skills/skill-host-local/examples/`、`packages/skills/skill-host-local/tests/examples.spec.ts`、该成员 `SPEC.md` 验证节、`README.md`/`README_ZH.md` 的示例一句
- 三个成员的 `package.json` 只允许改 `exports`、`files`、`scripts`

### 排除的调用方
- `packages/mcp/*` — 另两位写者在改；不碰
- `packages/skills/skill-host-local/src/` — W2 成果；只读。停止条件：示例需要改来源实现时停下交回
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写（`skill-host-local` 的测试依赖 `@omne-harness/skill` 已在基线）
- `packages/skills/docs/`、`docs/domains/skills/` — 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local` 退出 0；W2 的用例全部通过（报告给出前后用例数）。
2. SK3-1–SK3-4：`skillCatalogConformance()` 覆盖已定事项 2–7，用例名带事项号；`skill/tests/catalog.spec.ts` 用三个内存替身跑全部用例，`not-applicable` 计为失败。
3. SK3-5：套件 ≥ 12 条；一个违约实现（把 `refused` 也列出）使无披露与过滤用例变红；另一个违约实现（把 `unknown` 压成空列表）使整次 `unknown` 用例变红。变异记录存 `tmp/closures/w3-skill-catalog/mutations/`。
4. SK3-2 的替身计数：空 `capabilities` 时读取判定替身调用 0 次；`capabilities` 与 `search` 的未命中身份不被核验。
5. SK3-6：`skill/tests/port-answers.spec.ts`：读取判定、解析、来源三类端口各给一个畸形答复与一个 reject，答复符合已定事项 8，不抛出。变异：恢复来源一侧的 `TypeError` 分支 → 用例变红。
6. SK3-7：契约公开根导出 `MANIFEST_PATH`、`DECLARATION_PATH`、`PAGE_LIMIT`、`sameCapability`；`grep -rn "const MANIFEST_PATH\|const DECLARATION_PATH\|const PAGE_LIMIT\|function sameCapability" packages/skills/skill/src` 为空。
7. SK3-8：契约 SPEC 三处条款（`search` 匹配规则、统一处置、`open` 的 `entry-unreadable` 映射），报告给出条款位置。
8. SK3-9：`pnpm --filter @omne-harness/skill-host-local test -- examples` 通过，示例断言见 spec 已定事项 12。
9. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`、`git ls-files --eol | grep -c w/crlf` 为 0。
10. `src/` 无 `class`、无 `as`（`as const` 除外）、无 `any`。

## 实施规格
- `skill-contract/src/testing-catalog.ts`：`skillCatalogConformance<P, S>(): ConformanceCase<CatalogFixture<P, S>>[]`；`CatalogFixture` 给出 `catalog`、已知主体与作用域、被授予/被拒/未知/替换件的身份，以及一个计数读取判定调用的探针。名可调，写进报告。
- `skill-contract`：`sameCapability` 移到公开根的非测试模块，`testing-resolution.ts` 改为导入它；`PAGE_LIMIT` 新增于合适的非测试模块；`index.ts` 导出四项。
- `skill/src/catalog.ts`：`createSkillCatalog(ports)`；`search` 的规范化是一个纯函数（例如 `matches(query, name, description)`），单独穷举测试。
- `skill/src/index.ts` 导出 `createSkillCatalog`。
- `skill-host-local/examples/directory-journey.ts` 导出一个 `async function runDirectoryJourney(root: string)`，返回各步结果；`tests/examples.spec.ts` 在 `mkdtemp` 临时目录里建包并调用它。
- 命名账本：`createSkillCatalog`、`skillCatalogConformance`、`CatalogFixture`、`matches`、`PAGE_LIMIT`、`sameCapability`、`runDirectoryJourney`。

## 性质及证据义务
- L3：对同一主体，「被拒」与「不存在」两种世界下 `summaries`、`search` 与带 `capabilities` 的答复深度相等；任一 `unknown` 整次 `unknown`，不压成空。
- 结果不随核验完成次序变化：用 deferred 以两种次序完成核验，答复深度相等。

## 施工计划
1. 切片 01：契约导出与条款；套件先写，先用内存替身组装一个参考实现让套件可跑（参考实现可以就是切片 02 的 `createSkillCatalog`，先红）。红灯输出存 `tmp/closures/w3-skill-catalog/red/01.txt`。
2. 切片 02：`catalog.ts`；删除重复定义；统一处置；`port-answers.spec.ts`。
3. 切片 03：示例与测试。
4. 门禁、文档、交回。证明变红时先还原源码并重建 dist 再跑。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、破坏性契约改动。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-skill-catalog。另两位写者并行写 `packages/mcp/mcp-contract/` 与 `packages/mcp/mcp/`。派发者唯一合回。不跑 `admission` 与仓库全量测试；差分变异由 reduce 在最终 head 跑。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-skill-catalog/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/skill/spec.md 全文与同目录 plan.md；组页 `packages/skills/docs/architecture.md`「应用服务」「检查与发现」；`packages/skills/skill-contract/SPEC.md`「需求端口」「符合性套件」；`packages/skills/skill/SPEC.md` 映射表与无披露。
- 源码：`skill-contract/src/{services,ports,names,testing,testing-case,testing-resolution,testing-read-check}.ts`；`skill/src/{mapping,inspection,ports}.ts`、`src/access/*.ts`；`skill-host-local/src/directory-source.ts`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：`SkillCatalog`、`CatalogEntry`、`CatalogQuery`、`CatalogResolution` 已在契约；`MANIFEST_PATH`、`DECLARATION_PATH` 已在 `names.ts`（是否从根导出待核）；`sameCapability` 在 `testing-resolution.ts`；`skill` 里有四处重复定义（`inspection.ts`、`access/service.ts` 的路径常量，`access/range.ts` 的 `PAGE_LIMIT`，`access/gate.ts` 的 `sameCapability`）。
- 假设：`SkillResolution.adopted` 的答复里 `known-unavailable` 带最后合法的 name、说明与替换件原因。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果；自定裁定与理由；变红证据路径；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-skill-catalog/`。

## 已知会受影响的现有用例
- `skill-contract/tests/public-entry.spec.ts`、`skill/tests/public-entry.spec.ts`：导出集合按新增改写（不算放宽）。
- `skill` 中断言来源畸形答复抛 `TypeError` 的用例（如有）：按已定事项 8 改为断言 `source-unavailable`，报告列出。

## 停止条件
- 已定事项 9 与源码不符。
- 契约改动只能是破坏性的。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-04T06:10Z 第 1 轮停在开工核对（停止条件「已定事项 9 与源码不符」命中，报告 `tmp/closures/w3-skill-catalog/report.md`）。reduce 核实源码后裁定**候选 A**：条款写成「`open` 答 `entry-unreadable` 时，`inspect` 拒绝为 `malformed`（与 `snapshot` 一格），`read`/`list`/`export` 答 `source-unavailable`」，不改行为；spec 已定事项 9 已改。写者报告里「能自己定」的四项照报告做：根导出 `MANIFEST_PATH`/`DECLARATION_PATH`；`skill/SPEC.md`「端口抛出的错误原样抛出」一句按已定事项 8 改；来源答复不在集合内或 reject 统一按 `unavailable` 一行处置（`mapping.ts` 不在表内的键答 `unavailable` 一行，来源调用的 reject 收束为同一行）；SK3-6 的变异改为「还原为直接查表、reject 原样上抛」。同一写者续做，轮次仍记 1。
