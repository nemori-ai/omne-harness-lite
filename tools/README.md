# 开发工具

本目录承载仓库开发、验证和维护所需的工具，按职责组织，语言按实现需要选择。
有独立依赖、资源或可测试行为的工具在自己的目录成包；源码和测试随包维护。

| 工具 | 职责 |
|---|---|
| [spec-tools](spec-tools/README.md) | 跨仓库 Markdown 导航与技能镜像、文档目标库存与角色上下文、形式工具环境、开发模型评估证据；Python uv workspace 成员 |
| [artifact-builder](artifact-builder/README.md) | 应用归档的开发期文件闭包校验与独占发布；CLI和中心的静态适配经公开入口消费，不进入生产依赖 |
| [repo-toolchain](repo-toolchain/README.md) | 检查器包 `@omne-harness/repo-toolchain`：规则引擎、提交署名、dependency-cruiser 依赖图、声明兼容、结构度量与审讯页、实际架构抽取与 clean loop；计划发布到 npm，配置在仓库根 `repo-toolchain.config.json` |
| [product-checks](product-checks/README.md) | 本仓库的产品规则（墙钟、`bail`、受限调用点、`./testing` 零 import 等）、仓库路径规则、验收覆盖声明与场景状态，`pnpm run lint:rules`；不发布 |
| [dev-flow](dev-flow/README.md) | 开发流程工具：开工准入与 task context、任务绑定、Issue 与看板读取、包模板；不发布 |
| [test-runner](test-runner/README.md) | 影响面计划、逐成员测试与验收、耗时账本、差分变异；不发布，turbo 接替后删除 |
| [repo-config](repo-config/README.md) | 共享的 tsconfig、oxlint 与 dependency-cruiser 配置预设；根配置只用 `extends` 或 `require` 引用它 |
| [core-verification](core-verification/README.md) | core 包的真实组合与套件有效性验证；开发依赖通过公开入口消费现有提供者，产品 core 不反向依赖 infra |
| [model-probe](model-probe/README.md) | OpenRouter 公开目录和受预算控制的模型适配探针；Node 标准库工具，显式付费入口，不提供产品 adapter |

设计链自身的身份、登记、冻结与形式任务检查归
[.meta_harness/tooling](../.meta_harness/tooling/README.md)，**不在这里重复一份**。
产品包的布局检查曾是这里的第二个成员，随 2026-09-20 的空骨架退役；
2026-09-22 起 `ts-checks` 承接契约与节点 verification 点名的结构检查，布局检查仍未重建。2026-10-16 起 `ts-checks` 按职责拆为 `repo-toolchain`、`product-checks`、`dev-flow` 与 `test-runner`（#332）。

工具包不因安装到根开发环境就成为产品运行时依赖。仓库自动化的编排放在
[scripts/](../scripts/README.md)；自包含 skill 的脚本留在技能目录。
详细分工和依赖规则见[workspace 规范](../docs/workspace.md)。
