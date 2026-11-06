# w4-mcp-cordis 关口评审的简报（C-SM-08，一次）

共同材料（每份简报都给）：

- 候选：PR（见卡 #1119 上本闭包的证据评论），分支 `PanQiWei/skill-mcp-w4-mcp-cordis`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis`，head `f5ead35f4`。基线 `8446c4588`（派发时的父分支头）；分支上另合入了父分支的共享写 `9a1089645`（`065d0acc0`，两个 host-local 的 kernel-basis 依赖与锁文件）。范围 `git diff 8446c4588..HEAD`。
- 闭包规格（目标边界、已定的事、写范围、验收清单、性质及证据义务、追加 1）：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w4-mcp-cordis.md`。
- W4 MCP 规格第 2 节（第 9–12 条）、D-W4M-1、D-W4M-3：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md`。W4 波包决定 1–4：`…/waves/w4/wave-pack.md` §4。
- 架构依据：`docs/architecture/cordis-integration-conventions.md` IC-1～IC-9、IC-14、IC-16。同波 Skill 组的同类闭包已合入父分支，可作对照：`packages/skills/skill-cordis-contract/`、`packages/skills/skill-host-local/src/cordis.ts`；它的评审报告 `…/waves/w4/reviews/skill-cordis-r1.md`。
- 证据：卡 #1119 上本闭包的证据评论；原件在工作树 `tmp/w4-mcp-cordis/`（写者：`logs/`、`mut/`）与 `tmp/closures/w4-mcp-cordis/gate/`（派发者在 head 上复跑）。
- 只读，只在这棵工作树里搜索。手工变异在副本上做，不改工作树。报告内联交回。

## A. 正确性（implementation-reviewer，Opus 5.5，high）

判据：实现是否兑现闭包规格第 1–8 条与追加 1、W4 MCP 规格第 9–12 条与 IC 条款；每条发现带反例、缺的行为或本次运行的工具输出。逐行读，并在副本上加探针：

- 四个端口适配器（`mcp-host-local/src/cordis.ts`）：每次调用从装载时的 `ctx` 现取；缺席时的答复是否就是各端口类型规定的 `unknown`（`AdoptionView` 两个方法、`UseEligibility.check`、`CredentialUse.acquire` 的两个重载、`ProcessLanding.start`）；有没有缓存引用。`CredentialUse` 的缺席路径逐行读。
- 撤除函数：只做 `await connections.closeAll()`，不捕获、不吞掉 `AggregateError`；`dispose()` 是否等它结算（Cordis 4.0.4 `_unload`）。在途调用在撤除时的答复与契约 T5、T8、S8、MC-10 的依据链是否一致。
- 三个服务子类：是否转发了接口的每个方法（`ActionInvoker` 含 `TaskControl`），返回值原样交回。
- 配置：Schema 只查形状、取值范围由 `createMcp` 与 `createLocalTransportFactory` 的现有检查抛 `RangeError`；多余字段、缺字段、`clientInfo` 内的多余字段被拒。
- 键：每个 `static provide` 是唯一书写处；键常量取自它；插件与用例只用常量。
- 结构读数：在工作树根运行 `pnpm run lint:deps` 与 `pnpm run metrics --coverage --base 8446c4588f0e2400f2e905179ec252473f7b1066`（没有 task context），只摘改动函数的圈复杂度与 CRAP。

## B. 表达（design-reviewer，expression，Opus 5.5，xhigh）

对象：`packages/mcp/mcp-cordis-contract/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、各目录 README 与 index；`packages/mcp/mcp-host-local/` 本闭包改动的 `README.md`、`README_ZH.md`、`docs/cordis.md`、`docs/context.md`、`docs/public-api.md`。判据按 design-review 的表达页。另核对：

- IC 符合性映射每一条的「做到、不适用及理由」是否与实现一致；`scan` 报 `unknown` 的条目是否写明人工核对。
- 缺席时的答复是否只有一份规范语气的权威（同波 Skill 组裁定：归提供者成员的 SPEC 或 `docs/cordis.md`，定义成员只引用）。
- `mcp-host-local` 的其他现行正文（`docs/architecture.md`、`docs/object-model.md`、`SPEC.md`）有没有与新增的 `./cordis` 相反的说法（Skill 组同类闭包在这里出过阻断）。`SPEC.md` 的 `./cordis` 一行由派发者在切片 01 合入后补，不算发现。
- 「未覆盖」是否如实。

## C. 设计与实践（general-purpose，Opus 5.5，high）

判据：ub-mode、`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」、`pstack:typescript-best-practices`。W4 MCP 规格的「Testing Decisions」是否先写出了判据、反例与变红验证，用例是否照它写。对象是两个成员的 `src/` 与 `tests/`。重点：插件工厂参数与配置的切分；Schema 与现有检查的分工（一份规则一份实现）；适配器与子类的形状；撤除函数；用例是否断言行为而不是结构，每个转发方法是否被能区分它的路径调用。问题指到具体类型、函数或分支，带改法。

## D. 差分变异（派发者自跑）

最终 head 上一次，只打热点：`packages/mcp/mcp-cordis-contract/src/cordis.ts`、`packages/mcp/mcp-host-local/src/cordis.ts`。先 `--plan-only` 核对范围，`VITEST_MAX_WORKERS=6`。

## E. 交付边界（general-purpose，Opus 5.5，high）

按 `review-delivery`，对照对象是本波 spec（范式 §3）：W4 MCP plan 切片 02 的验收（C5 第 1–4 条的 MCP 部分、M4-5、七项轻门禁）与闭包规格验收清单 1–7、「性质及证据义务」，逐条判达到或未达到，只认卡上的证据。另给调度者的裁定（闭包规格追加 1，以及派发后派发者在 13:18 前写进规格的两项自查），列出与派发时规格原文的冲突项。
