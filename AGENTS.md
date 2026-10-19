# `omne-harness-lite` 的 agent 入口

本文件为阅读、设计、实现、集成、评审、运维和维护提供项目心智、责任地图与触发。它是拥有者正文的简短投影；具体规则、方法和命令按任务加载。

## 项目心智模型

我们建设以 DeepSeek Cordis 为内核的轻量 OMNE harness：长期稳定运行、动态演化，在不违背组织公共利益的前提下最大程度与个人租户保持利益对齐。项目目标、阶段范围和全局保证归[项目要求](docs/requirements.md)，系统怎样协作归[技术架构](docs/architecture/README.md)，业务责任怎样划分归[领域设计](docs/domains/README.md)。产品设计、技术接受、实现和验证是不同事实。

领域独立于内核建模；Cordis 提供装配、组合、依赖注入和生命周期，不决定领域含义。独立能力与系统集成分别守住其公开承诺，运行时对象不直接成为数据契约。第一版单机交付，同时保留未来分布式、异构部署的语义边界；租户身份、所有权及默认拒绝跨租户访问从第一天进入关键边界。精确要求继续由上述正文与实际成员拥有。

当前处于0.0.0至0.1.0研发阶段。演进沿[当前政策](docs/engineering/publication.md#当前演进与消费者)同步真实消费者并删除替代实现，进入0.1.0重新评估。历史字节不构成兼容承诺。

## `.meta_harness/` 拥有什么，外面做什么

项目级要求、工程约定、技术架构与领域关系在[docs](docs/README.md)；实际包、应用和工具拥有公开形状、完整必要行为、使用指南、设计理由与持续验证资源。行为契约不重复类型定义，文档厚度由责任和必要内容决定。源码归属从[workspace](docs/workspace.md)展开，包边界与新增规则从[产品包组织](docs/package-organization.md)展开；目录不自动等于插件、服务、进程或数据表。

[`.meta_harness/`](.meta_harness/AGENTS.md)保持产品规则、独立目标、统一语言、领域对象、持续研究和项目独有 agent 能力。尚未整合的技术专题和PF详细技术从[旧材料入口](.meta_harness/design/architecture/README.md)查找。本项目系统架构只以docs已接受正文为准；旧接受记录不能授予冲突设计继续采用，实际限制记录为偏离。准入、唯一源及退出条件归[文档治理](docs/engineering/documentation.md#位置与唯一源)。共同集成保证和机读采用从架构区[IC约定](docs/architecture/cordis-integration-conventions.md)及constraints读取。

实施须依据明确且已接受的承诺。未定新方案不能凭目录或产品设计直接开包；先定位拥有者及采用范围。探路件放任务 tmp，只带事实回设计。正式终态随拥有者维护，正式RFC与Issue最小决定按[保存例外](docs/engineering/documentation.md#四类长期成果与普通任务)维护；其余候选、逐轮评审、执行证据与过程记录留[任务tmp](docs/development.md#终态与过程材料)。

自有 skills、roles 与 Cloud Agent 镜像源在 `.meta_harness/agents/` 维护；根 `.agents`、`.claude`、`.codex`、`.cursor` 只暴露生成物。按[生成入口](.meta_harness/tooling/README.md)生成，不直接修改宿主产物。

## 研发品味

几种做法都成立时，先保护不变量，复用成熟机制，把复杂度花在真实契约差异。领域、公开能力和装配责任分别可见；状态、所有权、失败、生命周期及外部副作用有明确拥有者。专责角色开工时按[项目框架](.meta_harness/agents/roles/project-frame.md)理解任务，再按需阅读本文件和 docs 拥有者，不把目标与架构正文复制进角色提示。项目独有判断继续归[研发品味](.meta_harness/agents/roles/engineering-taste.md)，工程方法按[技能入口](docs/engineering/skills.md)选择。

错误不能静默变成成功，外部输出不能因 disposer 而声称可逆。实现风险按需读[防御指导](docs/defensive-patterns.md)，验证按[质量与风险](docs/engineering/quality.md#按成果和风险验证)选择，适用独立接受及[现有硬线](docs/clean-loop.md#回路怎么转)保持。传感器反馈事实，负责人判断处置；结构通过不替代语义或行为接受。

## 署名与分支：作者是人，来源可追溯

负责的人承担最终内容、来源和验证责任。人类署名、用户名分支及 `Harness`、`Agent-Role` 来源 trailer 的唯一规则归[贡献交付](CONTRIBUTING.md#形成可审阅的交付)；开工时按[报告约定](CONTRIBUTING.md#在开工时准备可比较数据)确定必要采集点。

## 信息权威与演进边界

用户明确的新要求优先于历史交接。先核对语义拥有者、精确版本、采用范围及消费者；评审、文件存在和测试通过不能授予接受。改变有效承诺必须有新依据并同步消费者，获准终态写回唯一源，被取代正文退出，旧字节留 Git 历史。

源或实现冲突时报告具体反例和影响，只暂停依赖部分，按[冲突入口](docs/context-map.md#冲突与验收)交拥有者裁定。不能从实现反推目标、静默选方便说法或改提示解决未决架构。模型和测试结论保留其前提与覆盖；[验证说明](docs/verification.md)拥有声明边界。

## 按任务展开

| 当前判断 | 加载入口与停止点 |
| --- | --- |
| 整体理解知识体系或判断文档归属 | 一次读取[体系上下文](docs/knowledge-map-agent.md)，取得分层、拥有者、状态与展开边界；找到本次责任后转任务路径，不递归通读全仓。人类图文说明归[知识地图](docs/knowledge-map.md) |
| 普通阅读、操作或独立消费 | 从[读者入口](docs/README.md)选角色或从[角色查询](tools/spec-tools/README.md#按角色读取上下文)取起点，再找实际应用或包。公开责任与支持范围足够时停止；目标架构不授予操作能力 |
| 局部修复、工具或环境工作 | 从[开发指南](docs/development.md)及实际目录 AGENTS 找承诺和受影响检查。已有承诺足够就不通读全部设计 |
| 新要求、系统边界或跨成员保证 | 加载 `harness-design-handbook`，从[项目要求](docs/requirements.md)、[架构](docs/architecture/README.md)、[领域](docs/domains/README.md)定位拥有者。只展开本次必要输入与交接 |
| 产品、概念或对象治理 | 在 meta 的相应区接续；起草产品加载 `product-design`，改词条加载 `ubiquitous-language`，改对象条目加载 `domain-objects`。仅消费已有正文不加载治理技能 |
| 文档、AGENTS、skills 或角色维护 | 新建或修订文档必须加载 `asd-ste100`；AGENTS 加载 `write-agents-md`，skill 加载官方 `skill-creator`，角色加载 `design-subagents`。按[维护指南](docs/maintenance.md)同步真实消费者 |
| 对话建卡、取任务或更新交付 | 从[agent交付操作](docs/engineering/agent-delivery.md)核对实际启用范围、唯一卡、条件和具名决定；Project、关闭与绿测不授予接受。未启用时形成获准任务草稿 |
| 分支同步、轨道提升或稳定点 | [多层分支规则](docs/engineering/integration.md)拥有轨道、准入、运输与双基线；加载 `branch-integration` 找实际工具。没有 task context 不伪造绑定，Git 运输不代替交付接受 |
| 隔离并行、接续或交付 | [工作约定](docs/engineering/workflow.md#责任与协作交接)拥有每写者隔离、共享单写与清理条件；[交付边界](docs/engineering/publication.md)拥有保存与权限；[贡献指南](CONTRIBUTING.md)拥有报告和接受 |
| Cordis 来源、生命周期或 API | 加载手册的来源核对，优先[官方资料](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)，固定采用版本。未覆盖行为保留假设并以源码或验证补足，不自动采用上游保证 |

任务方法由已采用 pstack 主线与 Matt 补充提供，触发、精确版本、宿主加载和项目差异归[技能入口](docs/engineering/skills.md)。派发写者明确检出、分支、写范围、必要输入、完成及停止条件；独立任务隔离并行，共享对象单写，耦合依赖串行。只在找到本次拥有者、适用范围和验证责任后停止扩大阅读。

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
