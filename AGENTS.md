# `omne-harness-lite` 的 agent 入口

本文件为阅读、设计、实现、集成、评审、运维和维护提供项目心智、责任地图与触发。它是拥有者正文的简短投影；具体规则、方法和命令按任务加载。

## 项目心智模型

我们建设以 DeepSeek Cordis 为内核的轻量 OMNE harness：长期稳定运行、动态演化，在不违背组织公共利益的前提下最大程度与个人租户保持利益对齐。项目目标、阶段范围和全局保证归[项目要求](docs/requirements.md)，系统怎样协作归[技术架构](docs/architecture/README.md)，业务责任怎样划分归[领域设计](docs/domains/README.md)。产品设计、技术接受、实现和验证是不同事实。

领域独立于内核建模；Cordis 提供装配、组合、依赖注入和生命周期，不决定领域含义。独立能力与系统集成分别守住其公开承诺，运行时对象不直接成为数据契约。第一版单机交付，同时保留未来分布式、异构部署的语义边界；租户身份、所有权及默认拒绝跨租户访问从第一天进入关键边界。精确要求继续由上述正文与实际成员拥有。

当前处于0.0.0至0.1.0研发阶段。演进沿[当前政策](docs/engineering/publication.md#当前演进与消费者)同步真实消费者并删除替代实现，进入0.1.0重新评估。历史字节不构成兼容承诺。

## 知识放哪

项目要求、工程约定、技术架构与领域关系在[docs](docs/README.md)；实际包、应用和工具拥有公开形状、完整必要行为、使用指南、设计理由与持续验证资源。[`.meta_harness/`](.meta_harness/AGENTS.md)保持产品规则、独立目标、统一语言、领域对象、持续研究和项目独有的技能；根 `.agents`、`.claude`、`.codex`、`.cursor` 只暴露[生成物](.meta_harness/tooling/README.md)，不直接修改。唯一源与退出条件归[文档治理](docs/engineering/documentation.md#位置与唯一源)，过程材料留[任务tmp](docs/development.md#终态与过程材料)。

实施须依据明确且已接受的承诺。未定新方案不能凭目录或产品设计直接开包；先定位拥有者及采用范围。旧接受记录不能授予冲突设计继续采用，实际限制记录为偏离。

## 研发流程

大改动（新增领域、跨领域纵线、子系统重构、较大改造）走 pqw `single-session-dev-flow`：定义期由人主导，过了交接点由代理自主交付；小修、原型、诊断按它的「不够格」一节转 Matt `tdd`、`prototype`、`diagnosing-bugs`。流程的环节与做法只归 pqw 各技能，本仓库只在下面的接入节给出 omne 的命令与位置。

卡就是交接信息包：设计段落盘进 `integration/mainline` 后发卡，交付会话只读卡与它链接的正式文档就开工。发卡、开工、开 PR、请求 gate 确认与接受的命令归 [`omne-card`](.meta_harness/agents/skills/omne-card/canonical/SKILL.md)。合入的门与准入的时机归[集成规则](docs/engineering/integration.md)。

## pqw-skills 接入

pqw 技能里写「从项目接入点取」的地方都读这一节；没填的格按「未提供」处理，技能跳过该步并在交付声明里写明。

| 槽位 | omne 的值 |
| --- | --- |
| 类型检查与 lint 命令 | `pnpm run typecheck`；`pnpm run lint:rules`；`pnpm run lint:oxlint`；`pnpm run lint:deps` |
| 改动成员的合入检查 | `pnpm run preflight`，再在每个改动成员目录 `pnpm exec vitest run --mode fast` 与 `--mode slow`，有 `acceptance/` 的再 `pnpm run acceptance` |
| 结构读数的覆盖率文件、范围与带位线 | 按改动成员各出一份 lcov，写到工作树外：成员目录里 `pnpm exec vitest run --mode fast --coverage.enabled --coverage.reporter=lcovonly --coverage.reportsDirectory=<目录>`；再 `node <pqw>/skills/slice-closeout/scripts/metrics.mjs --base <起点> --lcov <目录>/lcov.info --scope <成员目录>/ --cc 10,12 --crap 10,12` |
| 差分变异的范围与点名文件 | 先构建成员的上游：`pnpm exec turbo run build --filter '<包名>^...'`；再按改动成员各调一次 `node <pqw>/skills/slice-closeout/scripts/mutation.mjs --base <起点> --project <成员目录> --stryker-modules tools/test-runner/node_modules --build-command "pnpm run build"` |
| 项目合入检查已按整程改动跑结构读数与差分变异时的命令 | 无 |
| 文档检查命令 | `pnpm run check:docs`；`pnpm run check:design`；`pnpm run check:agents` |
| 文档写作规则 | [文档写作规则](docs/engineering/documentation.md#文档写作规则)；写作加载 pqw `clear-writing` |
| 三层正式文档的位置 | 产品 `.meta_harness/design/product`；项目顶层 `docs/`；包组与成员各包 `docs/`、`SPEC.md` |
| 统一语言与领域对象的位置 | `.meta_harness/design/ubiquitous_language`；`.meta_harness/design/domain_objects` |
| 形式化工具链与声明边界 | TLC，见[开发指南](docs/development.md)「形式工具链」；声明边界见[验证说明](docs/verification.md) |
| spec 与 plan 的项目模板 | pqw 自带模板，加 [spec 附加节](.meta_harness/agents/pqw/spec-addendum.md)与 [plan 附加节](.meta_harness/agents/pqw/plan-addendum.md) |
| 项目专有的清理项 | 本卡的工作树 `.worktrees/<卡>`；`tmp/<卡>/`；成员外写出的 lcov 目录；Stryker 容器 `.stryker-tmp*`。工作树里有 pqw 子模块，`git worktree remove` 会拒绝：先核 `git status` 干净、分支已合回，再删目录并 `git worktree prune` |
| 验收处 | 卡评论：判据要求的证据贴摘要与关键行，原件位置与哈希写在评论里 |
| 子代理的模型与档位政策 | [子代理的模型与档位](docs/engineering/skills.md#子代理的模型与档位) |
| 交接信息包放哪 | 卡正文；写范围检查与绑定退役之前，卡正文仍用旧模板，包贴成卡上一条「交接信息包」评论（见 `omne-card`） |

## 研发品味

从本域职责与不变量出发，只建模履约必需的外域概念，保留原拥有者的治理权。架构、领域建模、契约或开发涉及跨域概念和依赖变更时，读取[领域语义依赖与模型边界](docs/architecture/layers-and-dependencies.md#领域语义依赖与模型边界)，按需明确消费契约、投影、引用和外部集成的归属；局部实现沿已有边界执行。

几种做法都成立时，先保护不变量，复用成熟机制，把复杂度花在真实契约差异。领域、公开能力和装配责任分别可见；状态、所有权、失败、生命周期及外部副作用有明确拥有者。项目独有判断继续归[研发品味](.meta_harness/agents/roles/engineering-taste.md)，工程方法按[技能入口](docs/engineering/skills.md)选择。做架构、技术设计、规格或评审时，先按[维度分解与正交](.meta_harness/agents/roles/engineering-taste.md#维度分解与正交)命名问题所在的轴与拥有者，再找现有正文。

错误不能静默变成成功，外部输出不能因 disposer 而声称可逆。实现风险按需读[防御指导](docs/defensive-patterns.md)，验证按[质量与风险](docs/engineering/quality.md#按成果和风险验证)选择，适用独立接受及[现有硬线](docs/clean-loop.md#回路怎么转)保持。传感器反馈事实，负责人判断处置；结构通过不替代语义或行为接受。

## 署名与分支：作者是人，来源可追溯

负责的人承担最终内容、来源和验证责任。人类署名、用户名分支及 `Harness`、`Agent-Role` 来源 trailer 的唯一规则归[贡献交付](CONTRIBUTING.md#形成可审阅的交付)；开工时按[报告约定](CONTRIBUTING.md#在开工时准备可比较数据)确定必要采集点。

## 信息权威与演进边界

用户明确的新要求优先于历史交接。先核对语义拥有者、精确版本、采用范围及消费者；评审、文件存在和测试通过不能授予接受。改变有效承诺必须有新依据并同步消费者，获准终态写回唯一源，被取代正文退出，旧字节留 Git 历史。

源或实现冲突时报告具体反例和影响，只暂停依赖部分，按[冲突入口](docs/context-map.md#冲突与验收)交拥有者裁定。不能从实现反推目标、静默选方便说法或改提示解决未决架构。模型和测试结论保留其前提与覆盖；[验证说明](docs/verification.md)拥有声明边界。

## 按任务展开

| 当前判断 | 加载入口与停止点 |
| --- | --- |
| 开工前建立系统图景、理解知识体系或普通阅读 | 架构、领域、契约、装配与实现切片先读一次[开工定向](docs/orientation.md)；整体理解读[体系上下文](docs/knowledge-map-agent.md)；其余从[读者入口](docs/README.md)找实际应用或包。找到本次责任就停 |
| 新要求、系统边界或跨成员保证 | 加载 `harness-design-handbook`，从[项目要求](docs/requirements.md)、[架构](docs/architecture/README.md)、[领域](docs/domains/README.md)定位拥有者，只展开本次必要输入 |
| 产品、概念或对象治理 | 起草产品加载 `product-design`，改词条加载 `ubiquitous-language`，改对象条目加载 `domain-objects`；只消费已有正文不加载 |
| 文档、AGENTS 或技能维护 | 文档加载 pqw `clear-writing`，AGENTS 加载 pqw `write-agents-md`，技能加载官方 `skill-creator`；按[维护指南](docs/maintenance.md)同步真实消费者 |
| 研发流程、发卡、合入与发行 | 环节做法读 pqw 技能；发卡与合入加载 `omne-card`；每条流程事实的拥有者见[流程事实在哪](docs/engineering/README.md#流程事实在哪)；局部修复与环境从[开发指南](docs/development.md)起 |
| Cordis 来源、生命周期或 API | 加载手册的来源核对，优先[官方资料](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)，固定采用版本；未覆盖行为保留假设并以源码或验证补足 |

## Cursor Cloud specific instructions

Cloud Agent 的镜像源、安装脚本和版本钉扎归[开发指南](docs/development.md#cursor-cloud-agent-镜像)。根 `.cursor` 是生成的软链接。改镜像时改 `.meta_harness/agents/cloud/cursor/`，不要改投影副本。Build 已经安装依赖。锁文件未变时，不要再执行安装。

密钥和令牌只放在 Cursor Cloud Agents 的 Secrets。形式工具和 Postgres 不在此镜像中。缺少环境时报告未执行。不要把跳过的检查写成通过。

## Claude Code on the web specific instructions

环境源、setup 脚本和每次会话启动脚本归[开发指南](docs/development.md#claude-code-on-the-web-环境)。改环境时改 `.meta_harness/agents/cloud/claude-code/`，再把 `setup.sh` 粘贴到云端环境设置。会话启动钩子已经同步 `main`、安装依赖并生成投影。它输出诊断时，按诊断处理，不要把未完成的步骤写成完成。

外部服务的密钥是代理侧的网络密钥。容器里的对应环境变量为空，这是预期结果。请求必须经过代理，用法见[网络密钥与对外请求](.meta_harness/agents/cloud/claude-code/README.md#网络密钥与对外请求)。

## 写给众 AGENTS 的话

我们共同建设让 agents 可靠运行、协作、积累经验和演进的环境。在自己的范围内把问题查清、把有价值的工作推进到底，提出有依据的异议，也吸收他人的发现。诚实保留未知与缺陷，关心交付后的运行和维护，让后来者能够理解并接续成果。

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
