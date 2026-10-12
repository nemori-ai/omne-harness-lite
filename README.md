# omne-harness-lite

`omne-harness-lite` 是以 DeepSeek Cordis 为内核的 agent harness，为组织和个人提供智能体运行、能力调用与治理框架。系统组织模型、工具、状态和执行过程，目标是长期稳定运行、动态演化，并在不违背组织公共利益的前提下最大程度与个人租户保持利益对齐。

项目处于 `0.0.0 → 0.1.0` 研发阶段，尚未正式上线或提供生产服务。第一版完整交付为单机系统，同时为个人设备和云端集群的后续装配保留边界。具体阶段范围归[项目要求](docs/requirements.md#交付阶段与功能范围)和各产品的版本承诺。

新 `packages/` 和 `apps/` 目前维护目标文档与骨架，尚未建立产品源码、成员 manifest 或可启动应用。封存实现保存在带 `.0.0.1.legacy` 后缀的目录中。设计接受、实现支持和运行验证分别记录，不能凭文档目录判断功能已可用。

[项目要求](docs/requirements.md) ·
[产品设计](.meta_harness/design/product/README.md) ·
[开发指南](docs/development.md) ·
[参与贡献](CONTRIBUTING.md)

从[文档入口](docs/README.md)选择使用、管理、运维、集成、研发或负责人路径；人和 agent 使用同一套正文。已有明确任务时，从[任务地图](docs/context-map.md)找到必要上下文及停止点。Coding agents 另从 [AGENTS.md](AGENTS.md)加载项目心智、责任地图与触发。

需要先看全项目知识和文档怎样组织，读[知识地图](docs/knowledge-map.md)；agent一次加载的文字版见[体系上下文](docs/knowledge-map-agent.md)。

## 系统目标

长期协作需要保存工作与决定，控制故障影响，并允许运行中的能力变化。以下目标的完整要求及验收边界由[项目要求](docs/requirements.md)维护。

- **完全动态。** 能力的定义、实现、绑定和组合关系能够在运行期演化，结构变化具有明确的
  依赖、作用域、所有权和生命周期约束。见[完全动态系统](docs/requirements.md#完全动态目标sys-dynamic)。
- **超长期待机、稳定运行、持续进化。** 智能体能够长期服务，并根据工作需要发展能力；
  等待用户或未来时刻的工作可以持久保留，释放对应执行资源。
  见[长期运行目标](docs/requirements.md#长期运行与持续进化sys-long-running)。
- **状态持久，工作可接续。** 会话承担业务与逻辑治理，Agent、模型和工具运行时具有独立生命周期。故障影响须可控，恢复与降级由相应拥有者负责。
  见[恢复与异构适配](docs/requirements.md#运行时解耦与接续sys-runtime-continuity)。
- **与服务对象保持利益对齐。** 在不违背组织公共利益的前提下最大程度与个人租户保持利益对齐。原生提供对用户的感知与观测能力，支持这些能力持续自主演进。
  见[利益对齐](docs/requirements.md#服务对象与利益对齐sys-alignment)。
- **全链路可观测、可遥测。** 工作从触发、授权、执行到恢复和交付有可关联的状态与日志依据，失败、部分完成和未知结果如实可见。数据收集与传送须遵循安全和隐私要求。
  见[可观测性要求](docs/requirements.md#全链路可观测可遥测与日志完备sys-observability)。

## 产品设计

[产品设计入口](.meta_harness/design/product/README.md)按独立产品问题组织正文。每份正文说明需求与关键用户旅程，定义能力及其实现状态，记录阶段支持承诺，并集中列出未决问题。读者可以在产品描述所在位置判断能力是否已有实现证据；版本承诺不等于当前支持。

产品模块聚焦自己的业务责任，通过明确契约协作。框架提供可配置、可组合、可扩展的能力；具体治理模型和配置值由相应产品规则与部署设置决定。产品规则服从项目要求、系统架构及适用工程约定，技术细节随其实际拥有者维护。

产品入口连接[领域责任](docs/domains/README.md)及对应工程拥有者，概念定义归[统一语言](.meta_harness/design/ubiquitous_language/README.md)。内部产品依据与公共消费路径的访问范围分别判断，使用者不必通读内部设计。

## 技术基础

系统使用 Cordis 提供装配、组合、依赖注入与生命周期管理能力。领域模块独立建模，Cordis集成契约约束装配边界。

- **动态组合。** 可替换能力以具有生命周期、作用域和所有权的插件或服务组合；
  定义、运行实例、持久状态与物理部署分别建模。
- **就近维护精确承诺。** 公开 TypeScript 类型与必要运行时校验表达形状，成员行为契约表达类型不能完整表达的必要规则。
  重要性质保留相称的模型与测试，归属见[架构维护入口](docs/architecture/README.md)。
- **从第一天起落实租户隔离。** 自然人全局身份与租户成员关系分别表达；受租户所有权
  约束的对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝。

全系统分层、运行时协作、数据、安全与部署设计从[架构入口](docs/architecture/README.md)展开。领域关系归[领域设计](docs/domains/README.md)，精确接口、必要行为和持续验证归实际成员。在线演化、恢复和外部副作用按相应契约判断，架构正文描述目标保证。

## 仓库与开发

仓库按 monorepo 组织，当前主要内容是设计正文与开发工具。

| 位置 | 内容 |
|---|---|
| [.meta_harness/](.meta_harness/README.md) | 产品设计、统一语言、领域对象、持续研究及独有agent能力；保留源按其入口定位 |
| [docs/](docs/README.md) | 项目要求、工程规范、系统架构、领域关系、读者与任务指引、维护指南及RFC入口 |
| [packages/](packages/README.md) | 目标能力组与成员文档；具体包边界沿[产品包组织](docs/package-organization.md)维护 |
| [apps/](apps/README.md) | 目标应用与装配责任；尚无可启动成员 |
| [packages.0.0.1.legacy/](packages.0.0.1.legacy/README.md)、[apps.0.0.1.legacy/](apps.0.0.1.legacy/README.md) | 封存源码与公开说明，用于来源核对及仍有的工具依赖；不作为新树实现支持 |
| [tools/spec-tools/](tools/spec-tools/README.md)、[scripts/](scripts/README.md) | 开发检查器与仓库自动化 |

参与研发从 [CONTRIBUTING.md](CONTRIBUTING.md)和[开发初始化](docs/development.md#准备可用的检出)开始。人或 agent 使用的 coding agent harness 须安装项目指定版本的 pstack 与 Matt 插件，版本及采用范围归[技能入口](docs/engineering/skills.md)。环境准备、命令与按任务选择验证的方法继续由开发指南维护。

日常文档维护可运行 `make docs-check`，结构缺项通过 `make docs-inventory` 查看。`make check` 按影响面选择必要检查，未选择的检查没有执行；结论边界归[验证说明](docs/verification.md)。这些检查不证明产品已支持、业务行为符合或已获负责人接受。

阅读封存命令时，从[封存CLI](apps.0.0.1.legacy/cli/README.md)或[封存宿主](apps.0.0.1.legacy/tenancy-host/README.md)核对构建、环境与权限前提，不能直接当作新树启动方法。新增或修改文档按[维护指南](docs/maintenance.md)选择层级、同步消费者和检查引用。
