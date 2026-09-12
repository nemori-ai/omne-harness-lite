# 精确契约的维护

本目录维护可跨语言复现的语义承诺及其验证工件。根约定继续适用；这里说明
编辑规格时如何找到权威版本和所属边界，完整组织见 [README](README.md)。

## 按语义定位

| 内容 | 入口与责任 |
|---|---|
| 共享身份、值与数据含义 | [data/](data/README.md)：同义结构引用一份定义，边界投影说明映射 |
| 可观察行为、授权、所有权与生命周期 | [capabilities/](capabilities/README.md)：承诺归负责该行为的能力 |
| 不能归属单一能力的交互性质 | [compositions/](compositions/README.md)：不因出现多个模块就另建组合契约 |
| 契约身份、版本、状态和接受依据 | [catalog.json](catalog.json)：唯一发现清单，不是运行时注册表 |
| 规范冻结与历史原件 | [frozen.json](frozen.json)、[archive/](archive/README.md)：按[版本规则](../docs/maintenance/versioning.md)维护 |
| 形式任务与检查器 | [formal-tasks.json](formal-tasks.json)登记规范任务，[spec-tools](../tools/spec-tools/README.md)实现检查；职责见[验证规范](../docs/maintenance/verification.md) |

## 编辑边界

- 开始新增或引用契约前，从 catalog 核对精确身份、版本和接受依据。只有候选时，
  回到 [docs/proposals/](../docs/proposals/README.md) 继续设计；不要用目录、Schema 或登记项补造批准。
  正式工件的最小组织由[归属规则](../docs/maintenance/organization.md)维护。
- 已发布版本的修改形成新版本，证据保存在冻结规范之外并绑定受检版本；不要同时
  改原文和冻结哈希来掩盖覆盖。archive 原件按其清单保留，勘误写在外层入口。
  具体义务见[版本规则](../docs/maintenance/versioning.md)与[验证规范](../docs/maintenance/verification.md)。
- 文字、Schema、形式模型或实现出现语义冲突时，定位所属契约并报告反例；某项检查
  通过不能盖过冲突。查[规格与证据](../docs/architecture-guide/assurance/specification.md)，
  涉及架构选择时使用 [architecture-design](../.agents/skills/architecture-design/SKILL.md)。

这些规范义务约束契约工件；检查软件在独立的开发包中，普通工具修复不因此需要发布
业务契约。按实际变更选择检查，信息充分时停止展开，不为每项规格预建空附件或全部形式模型。
