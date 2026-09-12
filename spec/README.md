# 语言无关规格

规格定义可以跨语言复现的身份、数据、操作、不变量和组合承诺。按被约束的语义
组织，不按编程语言、DDD 战术类别或验证工具切分系统。

## 入口

| 目录或清单 | 职责 |
|---|---|
| [capabilities/](capabilities/README.md) | 可观察的能力行为、授权、所有权和生命周期 |
| [data/](data/README.md) | 跨能力复用的数据含义与结构 |
| [compositions/](compositions/README.md) | 不能归属单一能力的交互关系与整体性质 |
| [catalog.json](catalog.json) | 唯一的契约 ID、版本、状态、路径、接受依据与推荐版本清单 |
| [frozen.json](frozen.json) | 已发布规范文件的冻结哈希；配合 Git 基线检查防止覆盖历史 |
| [archive/](archive/README.md) | 保留原貌的旧组织资料，供来源追溯，不属于有效规格 |
| [formal-tasks.json](formal-tasks.json) | 显式登记实际模型任务、输入文件和执行命令 |
| [开发工具包](../tools/spec-tools/README.md) | 独立 workspace 成员中的检查器；不属于产品规格或运行时 |

目前有效清单为空：本轮接受了组织与治理体系，没有替用户批准业务契约。
已有的[租户](../docs/proposals/tenant-contracts/README.md)、
[模型](../docs/proposals/model-contracts/README.md)与
[agent-core](../docs/proposals/agent-core/v1/README.md)材料从提案入口 review。
已有 Schema 可以检查，但校验结果不会改变它的提案身份。

## 一个契约怎样生长

一个契约有稳定入口和精确版本，例如 `data/<name>/README.md` 导航到
`data/<name>/v1/contract.md`。行为或组合契约采用相同约定。
先明确语义与接受依据，再按需要添加 Schema、TLA+、Alloy、规范场景及验证映射。
不为每个契约预建一套空附件，目录也不预先决定服务、插件或进程边界。

正式规范引用精确版本；同义概念沿权威定义复用。发布后的 `vN/` 文件冻结，
修改发布新版本，推荐版本不自动升级消费者。运行证据位于版本目录之外，记录
所验证的契约、实现与工具版本。完整字段和规则由
[维护规范](../docs/maintenance/README.md)唯一维护。

## 验证职责

TLA+ 表达行为和状态演化的权威规格，Alloy 辅助检查结构约束，JSON Schema
Draft 2020-12 表达跨语言数据契约。有限模型检查、数据验证和实现测试各有边界，
不能互相冒充或宣称无条件证明。Event-B 暂不引入。

从根目录使用 `make check` 组合检查，或按需执行 `make docs-check`、`make spec-check` 和 `make test`。
实际形式任务与工具就绪情况必须分别报告；没有模型时不声称执行过模型验证。
安装边界、执行方式、追踪映射与证据要求见
[验证规范](../docs/maintenance/verification.md)。
