# w4-skill-cordis 关口评审的简报（C-SM-08，一次）

共同材料（每份简报都给）：

- 候选：PR #1157，分支 `PanQiWei/skill-mcp-w4-skill-cordis`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-skill-cordis`，head `835d4982e`。基线 `60acfc28b`（W4 冻结输入 F，父分支上 reduce 的共享写；依赖段与锁文件由它写）。范围 `git diff 60acfc28b..HEAD`。
- 闭包规格（目标边界、已定的事、写范围、验收清单、性质及证据义务、追加记录）：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w4-skill-cordis.md`。
- W4 Skill 规格：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/skill/spec.md`（第 1–4 条、D-W4S-1、D-W4S-2、跨域概念五问、Testing Decisions）。W4 波包决定 1–4：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/wave-pack.md` §4。
- 架构依据：`docs/architecture/cordis-integration-conventions.md` IC-1～IC-9、IC-14、IC-16。
- 证据：卡 #1119 上本闭包的证据评论；原件在工作树 `tmp/closures/w4-skill-cordis/`（`logs/` 写者门禁与变红验证，`gate/` 派发者在 head 上复跑的 typecheck、lint:rules、lint:oxlint、lint:deps）。
- 只读，只在这棵工作树里搜索。手工变异在副本上做，不改工作树。报告内联交回。

## A. 正确性（implementation-reviewer，Opus 5.5，high）

判据：实现是否兑现闭包规格第 1–6 条与追加 1、W4 Skill 规格第 1–4 条与 IC 条款；每条发现带反例、缺的行为或本次运行的工具输出。逐行读：

- 两个端口适配器（`skill-host-local/src/cordis.ts`）：每次调用都从插件装载时的 `ctx` 现取；取不到时答的值是否就是接口对每个方法规定的 `unknown`（逐方法核对 `skill-contract` 的 `./provider` 返回类型）；有没有缓存引用、有没有读调用方的上下文。
- 三个服务子类：是否把接口的每个方法都转过去，返回值原样交回；有没有漏掉方法或改了参数。
- 插件：三个服务是否共一条 fiber；配置 Schema 是否只接受缺席与空对象；撤除后键是否撤回。
- 键：每个 `static provide` 是唯一书写处；键常量取自它；插件与用例只用常量。
- 用例：每条装配用例在去掉被测行为后是否会变红（可在副本上做手工变异核对）。
- 结构读数：在工作树根运行 `pnpm run lint:deps` 与 `pnpm run metrics --coverage --base 60acfc28b640a1535585df1ebccd22bdc87e4d7c`（没有 task context），只摘本闭包改动函数的圈复杂度与 CRAP。命令失败时交回命令与输出。

## B. 表达（design-reviewer，expression，Opus 5.5，xhigh）

对象：`packages/skills/skill-cordis-contract/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`；`packages/skills/skill-host-local/` 本闭包改动的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`（`cordis.md`、`public-api.md`、`context.md`、`index.md`、`README.md`）。判据按 design-review 的表达页。另核对：IC 符合性映射每一条的「做到、不适用及理由」是否与实现一致；SPEC 与 README、docs 之间有没有互相矛盾或复述漂移；「未覆盖」是否如实；模板占位是否删净。`check:docs` 的输出在 `logs/check-docs.log`。

## C. 设计与实践（general-purpose，Opus 5.5，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。W4 Skill 规格的「Testing Decisions」一节是否先写出了判据、反例与变红验证，用例是否照它写。对象是两个成员的 `src/` 与 `tests/`。重点：手写的 Standard Schema 与适配器的形状；子类转发的写法有没有更简单的同等做法；一份规则一份实现；用例是否断言行为而不是结构。问题指到具体类型、函数或分支。

## D. 差分变异（派发者自跑）

最终 head 上一次，只打热点：`packages/skills/skill-cordis-contract/src/cordis.ts`、`packages/skills/skill-host-local/src/cordis.ts`。等 MCP 线写者的门禁空出 CPU 后再跑，`VITEST_MAX_WORKERS=6`。

## E. 交付边界（general-purpose，Opus 5.5，high）

按 `review-delivery`，本波范式把对照对象改为本波 spec（范式 §3）：W4 Skill 规格的 S4-1（C5 第 1–3 条的 Skill 部分）与闭包规格验收清单 1–6、「性质及证据义务」，逐条判达到或未达到，只认卡上的证据。另给调度者的裁定（闭包规格追加 1），列出与派发时规格原文的冲突项。
